import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { openDatabase } from '../src/db.js';
import { Engine } from './planned-engine.js';
import { createApp } from '../src/app.js';
import { DAY, HOUR, MINUTE, iso, monthStart, shiftAt } from '../src/time.js';

const instant=(local:string)=>Date.parse(`${local}+01:00`);
test('Catalogues, citations manuelles et badges persistent entre scénarios sans doublon',()=>{
  const f=fixture();
  const catalog=f.engine.catalogs();
  assert.equal(catalog.badges.length,12);assert.equal(catalog.quotes.length,10);assert.equal(catalog.messageTemplates.length,5);
  const before=f.engine.snapshot();
  f.engine.selectQuote('manual',2,before.shift.team_id);
  const quote=f.engine.snapshot().communication.quote;
  assert.equal(quote!.source,'manager');
  const badge=f.engine.awardBadge('safety-10',before.shift.team_id,'Bravo pour votre vigilance');
  assert.equal(f.engine.awardBadge('safety-10',before.shift.team_id,'Texte corrigé'),badge);
  f.engine.startScenario(3);
  assert.deepEqual(f.engine.snapshot().communication.quote,quote);
  assert.equal(f.engine.snapshot().recognitions.length,1);
  f.engine.returnNormal();
  new Engine(f.db,f.get).initialize();
  assert.deepEqual(f.engine.snapshot().communication.quote,quote);
  assert.equal(f.engine.snapshot().recognitions.length,1);
  f.engine.selectQuote('each_shift');
  assert.equal(f.engine.snapshot().communication.quote!.source,'automatic');
  assert.throws(()=>f.engine.awardBadge('unknown',1));assert.throws(()=>f.engine.selectQuote('manual',999));
  assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('Modèles personnalisables : nom équipe et ciblage du quart',()=>{
  const f=fixture(),s=f.engine.snapshot();
  const id=f.engine.publishTemplate('congratulations',s.shift.team_id);
  assert.ok(f.engine.snapshot().communication.messages.some((m:any)=>m.id===id&&m.body.includes(s.shift.team)));
  const other=s.shift.team_id===1?2:1;
  const hidden=f.engine.publishTemplate('congratulations',other);
  assert.ok(!f.engine.snapshot().communication.messages.some((m:any)=>m.id===hidden));
  const custom=f.engine.publishTemplate('safety',s.shift.team_id,'Merci {team} pour votre attention',s.shift.template_id);
  assert.ok(f.engine.snapshot().communication.messages.some((m:any)=>m.id===custom));
  const otherShift=s.shift.template_id===1?2:1;
  const hiddenShift=f.engine.publishTemplate('safety',s.shift.team_id,undefined,otherShift);
  assert.ok(!f.engine.snapshot().communication.messages.some((m:any)=>m.id===hiddenShift));
  assert.throws(()=>f.engine.publishTemplate('bad',1));f.db.close();
});
test('API catalogues et choix manager',async()=>{
  const f=fixture(),app=createApp(f.engine,'test-token');
  const response=await request(app).get('/api/catalogs').expect(200);assert.equal(response.body.badges.length,12);assert.equal(response.body.machines.length,8);assert.ok(response.body.machines.every((m:{id:number;name:string})=>Number.isInteger(m.id)&&m.name));
  for(const badge of response.body.badges) await request(app).get(badge.assetPath).expect(200).expect('Content-Type',/svg/);
  await request(app).post('/api/manager/quote').send({mode:'manual',contentId:1}).expect(401);
  await request(app).post('/api/manager/quote').set('Authorization','Bearer test-token').send({mode:'manual',contentId:1,selectedByTeamId:1}).expect(200);
  await request(app).post('/api/manager/badge').set('Authorization','Bearer test-token').send({code:'safety-10',teamId:1}).expect(201);
  await request(app).post('/api/manager/template').set('Authorization','Bearer test-token').send({code:'congratulations',teamId:1}).expect(201);
  f.db.close();
});
test('Contributions : transitions, reconnaissance unique et isolation des scénarios',()=>{
  const f=fixture();
  const manager=f.engine.submitContribution({kind:'kaizen',title:'Repérage visuel',description:'Idée fictive pour mieux repérer les consommables',personId:1});
  f.engine.reviewContribution(manager,'validated');
  f.engine.reviewContribution(manager,'validated','Merci pour cette idée');
  f.engine.reviewContribution(manager,'validated');
  assert.equal(f.engine.snapshot().recognitions.length,1);
  f.engine.startScenario(2);
  const temporary=f.engine.submitContribution({kind:'anomaly',title:'Emballages manquants',description:'Signalement fictif du présentateur',machineId:4},'simulation');
  assert.equal(f.engine.snapshot().contributions.length,2);
  f.engine.reviewContribution(temporary,'acknowledged');
  f.engine.reviewContribution(temporary,'in_progress');
  f.engine.reviewContribution(temporary,'validated');
  assert.equal(f.engine.snapshot().recognitions.length,2);
  f.engine.returnNormal();
  assert.equal(f.engine.snapshot().contributions.length,1);
  assert.equal(f.engine.snapshot().recognitions.length,1);
  assert.throws(()=>f.engine.reviewContribution(temporary,'resolved'));
  assert.throws(()=>f.engine.submitContribution({kind:'kaizen',title:'X',description:'Y',personId:999}));
  assert.deepEqual(f.db.pragma('foreign_key_check'),[]);
  f.db.close();
});
test('API contributions : accès protégé et validation des données',async()=>{
  const f=fixture(),app=createApp(f.engine,'test-token');
  await request(app).post('/api/manager/contributions').send({}).expect(401);
  await request(app).post('/api/manager/contributions').set('Authorization','Bearer test-token').send({kind:'bad'}).expect(400);
  const response=await request(app).post('/api/manager/contributions').set('Authorization','Bearer test-token').send({kind:'anomaly',title:'Test',description:'Exemple fictif'}).expect(201);
  await request(app).post(`/api/manager/contributions/${response.body.id}/review`).set('Authorization','Bearer test-token').send({status:'acknowledged'}).expect(200);
  await request(app).post('/api/pilot/contributions').set('Authorization','Bearer test-token').send({kind:'anomaly',title:'Test',description:'Exemple fictif'}).expect(400);
  f.db.close();
});
function fixture(at=instant('2026-10-01T12:30:00')) {
  let now=at;
  const db=openDatabase(':memory:');
  const engine=new Engine(db,()=>now);engine.initialize();
  return {db,engine,set:(n:number)=>{now=n;},get:()=>now};
}
test('Horaires de Douala : frontières, nuit et changement de mois',()=>{
  for(const [time,template] of [['2026-10-01T05:59:59',3],['2026-10-01T06:00:00',1],['2026-10-01T14:00:00',2],['2026-10-01T22:00:00',3],['2026-11-01T00:00:00',3]] as const) {
    const at=instant(time),s=shiftAt(at);assert.equal(s.templateId,template);assert.ok(s.start<=at&&s.end>at);
  }
  assert.equal(iso(shiftAt(instant('2026-11-01T02:00:00')).start),'2026-10-31T21:00:00.000Z');
});
test('Historique initial et quart proportionnel ; zéro doublon au rafraîchissement',()=>{
  const f=fixture(),s=f.engine.snapshot();
  assert.ok(s.history.completedShifts>=30);
  assert.equal(s.shift.remainingSeconds,5400);
  assert.ok(s.production.total>10000&&s.production.total<15000);
  const n=f.db.prepare('SELECT COUNT(*) n FROM production_intervals').get();
  assert.deepEqual(f.engine.snapshot(),s);
  assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM production_intervals').get(),n);
  assert.equal(s.safety.days,10);
  assert.equal(s.trends.length,3);assert.equal(s.trends[0].days.length,7);
  f.db.close();
});
test('14 h 10 : nouveau compteur ; cumuls jour et mois conservés',()=>{
  const f=fixture(instant('2026-10-01T14:10:00')),s=f.engine.snapshot();
  assert.equal(s.shift.template_id,2);assert.equal(s.shift.remainingSeconds,7*3600+50*60);
  assert.ok(s.production.total>200&&s.production.total<400);
  assert.ok(s.daily.total>s.production.total);assert.ok(s.monthly.total>=s.daily.total);
  f.db.close();
});
test('Rattrapage après trois jours éteint identique à une génération continue',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ch8-')),file=join(dir,'test.sqlite');
  let now=instant('2026-10-01T12:30:14');
  let db=openDatabase(file),e=new Engine(db,()=>now);e.initialize();
  const first=e.snapshot();e.publish('Message conservé');db.close();
  now+=3*DAY;
  db=openDatabase(file);e=new Engine(db,()=>now);e.initialize();const resumed=e.snapshot();
  assert.ok(resumed.history.completedShifts>=first.history.completedShifts+9);
  assert.ok(resumed.communication.messages.some((m:any)=>m.body==='Message conservé'));
  const fresh=fixture(now),expected=fresh.engine.snapshot();
  assert.equal(resumed.production.total,expected.production.total);
  assert.equal(resumed.daily.total,expected.daily.total);
  assert.equal(resumed.monthly.total,expected.monthly.total);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
  fresh.db.close();db.close();rmSync(dir,{recursive:true,force:true});
});
test('Scénario temporaire : pause, saut de quart et retour normal après quatre minutes',()=>{
  const f=fixture(),initial=f.engine.snapshot();f.engine.publish('Ne pas écraser');
  f.engine.startScenario(5);f.engine.control('pause');
  f.engine.control('next-shift');const jump=f.engine.snapshot();
  assert.equal(jump.shift.template_id,2);assert.ok(jump.production.total<400);
  f.set(f.get()+4*MINUTE);assert.equal(f.engine.snapshot().at,jump.at);
  f.engine.returnNormal();const result=f.engine.snapshot();
  assert.equal(result.runId,initial.runId);assert.equal(result.shift.id,initial.shift.id);
  assert.ok(result.production.total>initial.production.total);
  assert.ok(result.production.total-initial.production.total<200);
  assert.ok(result.communication.messages.some((m:any)=>m.body==='Ne pas écraser'));
  f.db.close();
});
test('Retour normal traverse 14 h ; objectif de scénario ne fuit pas vers le normal',()=>{
  const f=fixture(instant('2026-10-01T13:59:00')),normal=f.engine.snapshot();
  f.engine.startScenario(2);f.engine.setTarget(16000);
  assert.equal(f.engine.snapshot().production.target,16000);
  f.set(f.get()+2*MINUTE);f.engine.returnNormal();const s=f.engine.snapshot();
  assert.equal(s.runId,normal.runId);assert.equal(s.shift.template_id,2);
  assert.equal(s.production.target,15000);assert.ok(s.production.total<50);
  f.db.close();
});
test('Objectif manager : ne change pas les quantités et persiste au redémarrage',()=>{
  const f=fixture(),before=f.engine.snapshot();f.engine.setTarget(14000);
  const after=f.engine.snapshot();assert.equal(after.production.total,before.production.total);
  assert.equal(after.production.target,14000);assert.equal(after.production.progress,before.production.total/14000);
  const e2=new Engine(f.db,()=>f.get());e2.initialize();assert.equal(e2.snapshot().production.target,14000);
  f.db.close();
});
test('Arrêt du pilote : pas de production pendant l’arrêt, reprise sans bonus doublé',()=>{
  const f=fixture();f.engine.startScenario(2);f.engine.control('stop');
  const start=f.engine.snapshot();f.set(f.get()+5*MINUTE);
  const stopped=f.engine.snapshot();assert.equal(stopped.production.total,start.production.total);
  assert.equal(stopped.machine.state,'stopped');
  f.engine.control('restart');f.set(f.get()+MINUTE);assert.ok(f.engine.snapshot().production.total>stopped.production.total);
  f.engine.control('next-shift');
  const count=f.db.prepare('SELECT COUNT(*) n FROM score_events').get();f.engine.snapshot();f.engine.snapshot();
  assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM score_events').get(),count);f.db.close();
});
test('Changement de mois : historique prolongé ; compteurs mensuels sans nuit entière reportée',()=>{
  const f=fixture(instant('2026-10-31T23:59:00'));f.set(instant('2026-11-01T00:10:00'));
  const s=f.engine.snapshot();assert.equal(monthStart(Date.parse(s.at)),instant('2026-11-01T00:00:00'));
  // A seeded stop can span midnight: zero is valid, the entire night is not.
  assert.ok(s.monthly.total>=0&&s.monthly.total<400);
  assert.ok(s.production.total>s.monthly.total);
  assert.equal(s.daily.total,s.monthly.total);assert.equal(s.shift.template_id,3);f.db.close();
});
test('API : lecture, contrôle protégé, validation, publication persistante',async()=>{
  const f=fixture(),app=createApp(f.engine,'test-secret');
  await request(app).get('/health').expect(200);
  await request(app).post('/api/manager/target').send({target:14000}).expect(401);
  await request(app).post('/api/manager/target').auth('test-secret',{type:'bearer'}).send({target:0}).expect(400);
  await request(app).post('/api/pilot/scenario').auth('test-secret',{type:'bearer'}).send({scenarioId:99}).expect(400);
  await request(app).post('/api/manager/content').auth('test-secret',{type:'bearer'}).send({body:'Bravo à tous !'}).expect(201);
  const r=await request(app).get('/api/state').expect(200);
  assert.ok(r.body.communication.messages.some((m:any)=>m.body==='Bravo à tous !'));
  f.db.close();
});
