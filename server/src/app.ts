import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { Engine } from './engine.js';
import { InputError } from './engine.js';
import { requireInstant } from './time.js';
import { fileURLToPath } from 'node:url';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {Auth,cookieToken,SESSION_COOKIE,PRESENTER_COOKIE} from './auth.js';
import {Profiles} from './profiles.js';
import {Editorial} from './editorial.js';
import {shiftReport} from './shift-reports.js';
import {Planning} from './planning.js';
import {TeamWeather} from './team-weather.js';
import {Programming} from './programming.js';
import {Photos,PHOTO_BYTES} from './photos.js';
export function createApp(engine: Engine, token: string, changed: (state?:ReturnType<Engine['snapshot']>) => void = () => {},readState:()=>ReturnType<Engine['snapshot']>=()=>engine.snapshot()) {
  const app=express(),auth=new Auth(engine.db,engine.clock),profiles=new Profiles(engine.db,engine.clock),editorial=new Editorial(engine.db,engine.clock),photos=new Photos(engine.db,engine.clock);
  const teamWeather=new TeamWeather(engine.db,engine.clock);
  const planning=new Planning(engine.db,engine.clock),programming=new Programming(engine.db,engine.clock);
  const cookieOptions={httpOnly:true,sameSite:'strict' as const,path:'/api'};
  app.disable('x-powered-by');
  app.use(express.json({limit:'32kb'}));
  app.use('/challenges',express.static(fileURLToPath(new URL('../../public/challenges/',import.meta.url))));
  app.use('/icons',express.static(fileURLToPath(new URL('../../public/icons/',import.meta.url))));
  app.use('/badges',express.static(fileURLToPath(new URL('../../public/badges/',import.meta.url))));
  const frontend=fileURLToPath(new URL('../../dist/client/',import.meta.url));
  app.use(express.static(frontend));
  app.get(['/ecrans/1','/ecrans/2','/ecrans/3','/ecrans/4','/ecrans','/admin','/admin/connexion','/pilotage','/pilotage/connexion'],(_req,res,next)=>{const index=join(frontend,'index.html');if(existsSync(index))res.sendFile(index);else next();});
  app.get('/',(_req,res)=>res.json({name:'CH8 — serveur local',stage:'Backend initial',simulated:true,endpoints:['/health','/api/state','/api/scenarios']}));
  app.get('/media/portraits/:file',(req,res)=>{
    if(!req.params.file.endsWith('.webp')) {res.sendStatus(404);return;}
    const asset=photos.get(req.params.file.slice(0,-5));if(!asset){res.sendStatus(404);return;}
    res.set({'Content-Type':asset.content_type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}).send(asset.image_data);
  });
  app.get('/health',(_req,res)=>res.json({ok:true,simulated:true,timezone:'Africa/Douala'}));
  app.get('/api/state',(_req,res)=>res.set('Cache-Control','no-store').json(readState()));
  app.get('/api/scenarios',(_req,res)=>res.json(engine.db.prepare('SELECT id,title,description FROM scenarios WHERE id<>4 ORDER BY id').all()));
  app.get('/api/catalogs',(_req,res)=>res.json(engine.catalogs()));
  app.post('/api/auth/login',async(req,res)=>{
    const result=await auth.login(req.body?.username,req.body?.password,req.ip??'local');
    res.set('Cache-Control','no-store');
    if(result.status!==200) {res.status(result.status).json({error:result.status===429?'Trop de tentatives ; réessayer dans dix minutes':'Identifiants incorrects'});return;}
    res.cookie(result.account.role==='presenter'?PRESENTER_COOKIE:SESSION_COOKIE,result.token,{...cookieOptions,maxAge:8*60*60*1000,secure:req.secure}).json({account:result.account,expiresAt:result.expiresAt});
  });
  const sessionFor=(req:express.Request,space:unknown)=>{
    if(space!==undefined&&space!=='manager'&&space!=='pilot') throw new InputError('Espace manager ou pilot requis');
    const admin=auth.account(cookieToken(req.get('cookie'))),presenter=auth.account(cookieToken(req.get('cookie'),PRESENTER_COOKIE));
    if(space==='manager') return admin?.role==='admin'?admin:undefined;
    if(space==='pilot') return presenter?.role==='presenter'?presenter:admin?.role==='admin'?admin:undefined;
    return admin??presenter;
  };
  app.get('/api/auth/session',(req,res)=>{
    res.set('Cache-Control','no-store');const account=sessionFor(req,req.query.space);
    if(!account) {res.status(401).json({error:'Connexion requise pour cet espace'});return;}res.json({account});
  });
  app.post('/api/auth/logout',(req,res)=>{
    const space=req.body?.space;
    if(space!==undefined&&space!=='manager'&&space!=='pilot') throw new InputError('Espace manager ou pilot requis');
    const cookies=space==='manager'?[SESSION_COOKIE]:space==='pilot'?[PRESENTER_COOKIE]:[SESSION_COOKIE,PRESENTER_COOKIE];
    for(const name of cookies) {auth.logout(cookieToken(req.get('cookie'),name));res.clearCookie(name,cookieOptions);}res.json({ok:true});
  });
  app.use('/api', (req,res,next)=>{
    if(req.method==='GET'&&['/state','/scenarios','/catalogs'].includes(req.path)) return next();
    const pilot=req.path.startsWith('/pilot/');
    const account=sessionFor(req,pilot?'pilot':undefined);
    if(account) {
      if(account.role==='presenter'&&!pilot) {res.status(403).json({error:'Cet espace est réservé à l’administrateur'});return;}
      const origin=req.get('origin');
      if(req.method!=='GET'&&origin&&origin!==`${req.protocol}://${req.get('host')}`) {res.status(403).json({error:'Origine de commande non autorisée'});return;}
      return next();
    }
    const supplied=Buffer.from(req.get('authorization')??''), expected=Buffer.from(`Bearer ${token}`);
    if(!token||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)) {res.status(401).json({error:'Accès de contrôle requis'});return;}
    next();
  });
  const send=(res:express.Response)=>{ const state=readState();changed(state);res.set('Cache-Control','no-store').json(state); };
  // Reject stale controls when another presenter has replaced the active run.
  const assertRun=(body:unknown)=>{const expected=(body as {expectedRunId?:unknown}|undefined)?.expectedRunId;if(expected!==undefined&&(!Number.isInteger(expected)||expected!==engine.snapshot().runId))throw new InputError('Le contexte a changé sur un autre appareil. Relire le pilotage avant de réessayer.');};
  app.post('/api/pilot/scenario',(req,res)=>{
    assertRun(req.body);
    let at:number|undefined;
    if(req.body?.at!==undefined) {try {at=requireInstant(req.body.at);}catch {throw new InputError('Date ISO avec fuseau requise');}}
    engine.startScenario(req.body?.scenarioId,at,req.body?.teamId);send(res);
  });
  app.get('/api/pilot/guides',(_req,res)=>res.json(engine.guideCatalog()));
  app.post('/api/pilot/guide',(req,res)=>{
    assertRun(req.body);
    let at:number|undefined;
    if(req.body?.at!==undefined) {try {at=requireInstant(req.body.at);}catch {throw new InputError('Date ISO avec fuseau requise');}}
    engine.startGuide(req.body?.scenarioId,req.body?.teamId,at);send(res);
  });
  app.post('/api/pilot/guide/next',(req,res)=>{engine.guideNext(req.body?.runId,req.body?.expectedPosition,req.body?.nextTeamId);send(res);});
  app.post('/api/pilot/guide/restart',(req,res)=>{engine.restartGuide(req.body?.runId);send(res);});
  app.post('/api/pilot/normal',(req,res)=>{assertRun(req.body);engine.returnNormal();send(res);});
  app.post('/api/pilot/control',(req,res)=>{
    assertRun(req.body);
    const action=req.body?.action;
    if(!['pause','resume','speed','next-shift','stop','restart','skip'].includes(action)) throw new InputError('Commande invalide');
    engine.control(action,req.body?.speed,req.body?.nextTeamId,req.body?.minutes);send(res);
  });
  app.get('/api/pilot/normal-stoppages',(_req,res)=>{const history=engine.normalStoppages();res.set('Cache-Control','no-store').json({asOf:history.asOf,openStops:history.stops.filter(s=>s.open&&s.note!==null)});});
  app.post('/api/pilot/normal-stop',(req,res)=>{assertRun(req.body);const id=engine.stopNormal(req.body?.machineId,req.body?.affectsLine,req.body?.note);changed();res.status(201).json({id});});
  app.get('/api/manager/stoppages',(_req,res)=>res.set('Cache-Control','no-store').json(engine.normalStoppages()));
  app.get('/api/manager/safety',(_req,res)=>res.set('Cache-Control','no-store').json(engine.safetyHistory()));
  app.post('/api/manager/safety',(req,res)=>{const id=engine.recordSafety(req.body);changed();res.status(201).json({id});});
  app.post('/api/manager/stoppages/:id/restart',(req,res)=>{engine.restartNormalStop(Number(req.params.id));send(res);});
  app.get('/api/manager/base-target',(_req,res)=>res.set('Cache-Control','no-store').json(engine.baseTarget()));
  app.put('/api/manager/base-target',(req,res)=>{const result=engine.setBaseTarget(req.body?.target);changed();res.json(result);});
  app.get('/api/manager/team-weather',(_req,res)=>res.set('Cache-Control','no-store').json({teams:teamWeather.list()}));
  app.put('/api/manager/team-weather/:teamId',(req,res)=>{teamWeather.save(Number(req.params.teamId),req.body);changed();res.json({ok:true});});
  // Previous schedules stay readable as history; they no longer control display.
  app.get('/api/manager/weather-programs',(_req,res)=>res.json({archived:true,programs:engine.db.prepare('SELECT * FROM weather_programs ORDER BY id DESC').all()}));
  app.all(['/api/manager/weather-programs','/api/manager/weather-programs/:id'],(_req,res)=>res.status(410).json({error:'La météo est désormais définie durablement par équipe.'}));
  app.get('/api/manager/programs',(_req,res)=>res.set('Cache-Control','no-store').json({programs:programming.list()}));
  app.post('/api/manager/programs',(req,res)=>{engine.tick();const id=programming.save(req.body);changed();res.status(201).json({id});});
  app.put('/api/manager/programs/:id',(req,res)=>{engine.tick();const id=programming.save(req.body,Number(req.params.id));changed();res.json({id});});
  app.delete('/api/manager/programs/:id',(req,res)=>{engine.tick();programming.cancel(Number(req.params.id));changed();res.json({ok:true});});
  app.get('/api/manager/shifts/:id/report',(req,res)=>{engine.tick();res.set('Cache-Control','no-store').json(shiftReport(engine.db,Number(req.params.id)));});
  app.get('/api/manager/planning',(req,res)=>{engine.tick();res.set('Cache-Control','no-store').json(planning.list(req.query.from,req.query.days));});
  app.put('/api/manager/planning',(req,res)=>{engine.tick();const result=planning.save(req.body?.entries);changed();res.json(result);});
  app.delete('/api/manager/planning/:id',(req,res)=>{engine.tick();planning.remove(Number(req.params.id));changed();res.json({ok:true});});
  app.get('/api/manager/profiles',(_req,res)=>{res.set('Cache-Control','no-store').json({people:profiles.list(),teams:engine.catalogs().teams});});
  app.post('/api/manager/profiles',(req,res)=>{const id=profiles.save(undefined,req.body);changed();res.status(201).json({id});});
  app.put('/api/manager/profiles/:id',(req,res)=>{profiles.save(Number(req.params.id),req.body);changed();res.json({ok:true});});
  app.put('/api/manager/profiles/:id/photo',express.raw({type:['image/jpeg','image/png','image/webp'],limit:PHOTO_BYTES}),async(req,res)=>{const result=await photos.save(Number(req.params.id),req.body);changed();res.json(result);});
  app.delete('/api/manager/profiles/:id/photo',(req,res)=>{const result=photos.remove(Number(req.params.id));changed();res.json(result);});
  app.put('/api/manager/teams/:id',(req,res)=>{profiles.renameTeam(Number(req.params.id),req.body?.name);changed();res.json({ok:true});});
  app.post('/api/manager/period-target',(req,res)=>{engine.setPeriodTarget(req.body?.kind,req.body?.value);send(res);});
  app.post('/api/manager/check-in',(_req,res)=>res.status(410).json({error:'Définir la météo de l’équipe, sans identifiant de réponse.'}));
  app.post('/api/manager/target',(req,res)=>{engine.setTarget(req.body?.target);send(res);});
  app.post('/api/manager/challenge',(req,res)=>{const id=engine.assignChallenge(req.body);changed();res.status(201).json({id});});
  app.post('/api/manager/challenges/:id/review',(req,res)=>{engine.reviewChallenge(Number(req.params.id),req.body?.approved,req.body?.note);send(res);});
  app.post('/api/manager/content',(req,res)=>{const id=editorial.save(undefined,req.body);changed();res.status(201).json({id});});
  app.get('/api/manager/contents',(_req,res)=>res.set('Cache-Control','no-store').json(editorial.list()));
  app.patch('/api/manager/contents/:id',(req,res)=>{editorial.save(Number(req.params.id),req.body);send(res);});
  app.get('/api/manager/recognitions',(_req,res)=>res.set('Cache-Control','no-store').json({recognitions:editorial.recognitions()}));
  app.post('/api/manager/recognitions',(req,res)=>{const id=editorial.award(req.body);changed();res.status(201).json({id});});
  app.delete('/api/manager/recognitions/:id',(req,res)=>{editorial.revoke(Number(req.params.id));send(res);});
  app.post('/api/manager/quote',(req,res)=>{engine.selectQuote(req.body?.mode,req.body?.contentId,req.body?.selectedByTeamId);send(res);});
  app.post('/api/manager/template',(req,res)=>{const id=engine.publishTemplate(req.body?.code,req.body?.teamId,req.body?.body,req.body?.shiftTemplateId);changed();res.status(201).json({id});});
  app.post('/api/manager/badge',(req,res)=>{const id=engine.awardBadge(req.body?.code,req.body?.teamId,req.body?.reason,req.body?.shiftTemplateId);changed();res.status(201).json({id});});
  app.post('/api/manager/contributions',(req,res)=>{const id=engine.submitContribution(req.body);changed();res.status(201).json({id});});
  app.post('/api/pilot/contributions',(req,res)=>{const id=engine.submitContribution(req.body,'simulation');changed();res.status(201).json({id});});
  app.post('/api/manager/contributions/:id/review',(req,res)=>{engine.reviewContribution(Number(req.params.id),req.body?.status,req.body?.note);send(res);});
  app.use((_req,res)=>res.status(404).json({error:'Route inconnue'}));
  const onError:ErrorRequestHandler=(err,req,res,_next)=>{
    if(err?.type==='entity.too.large') {res.status(413).json({error:req.path.endsWith('/photo')?'Fichier trop volumineux ; photo limitée à 5 Mo':'Requête trop volumineuse'});return;}
    const client=err instanceof InputError || err instanceof SyntaxError;
    if(!client) console.error('Erreur serveur',err);
    res.status(client?400:500).json({error:client?err.message:'Erreur interne du serveur'});
  };
  app.use(onError);
  return app;
}
