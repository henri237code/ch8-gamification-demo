import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from '../src/engine.js';
import {Planning} from '../src/planning.js';
import {createApp} from '../src/app.js';
import {DAY,MINUTE} from '../src/time.js';
function setup(){let now=Date.parse('2026-10-12T05:00:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,p:new Planning(db,()=>now),now:()=>now,set:(t:number)=>{now=t;}};}
test('Sans planning : aucune équipe, aucune nouvelle production ; contenus indépendants conservés',()=>{
 const f=setup();f.e.publish('Information générale');const first=f.e.snapshot();assert.equal(first.workStatus,'unplanned');assert.equal(first.shift,null);assert.equal(first.production,null);assert.equal(first.energy.currentKw,null);assert.equal(first.weather,null);assert.equal(first.challenges.length,0);
 f.set(f.now()+3*DAY);const restart=new Engine(f.db,f.now);restart.initialize();const s=restart.snapshot();assert.equal(s.history.completedShifts,0);assert.equal(s.monthly.total,0);assert.equal(s.shift,null);assert.ok(s.communication.messages.some(m=>(m as {body:string}).body==='Information générale'));
 assert.equal((f.db.prepare('SELECT COUNT(*) n FROM production_intervals').get() as {n:number}).n,0);assert.throws(()=>f.e.setTarget(15000),/Aucun quart/);f.db.close();
});
test('Annuler un quart futur signifie aucun travail ; rattrapage limité aux quarts réellement programmés',()=>{
 const f=setup();f.p.save([{date:'2026-10-12',templateId:1,teamId:3},{date:'2026-10-12',templateId:2,teamId:2},{date:'2026-10-13',templateId:1,teamId:1}]);
 const afternoon=f.p.list('2026-10-12',1).entries[1];f.p.remove(afternoon.scheduleId!);assert.equal(f.p.list('2026-10-12',1).entries[1].teamId,null);
 f.set(Date.parse('2026-10-12T12:00:00+01:00'));assert.equal(f.e.snapshot().shift!.team_id,3);
 f.set(Date.parse('2026-10-12T16:00:00+01:00'));const idle=f.e.snapshot();assert.equal(idle.shift,null);assert.equal(idle.history.completedShifts,1);assert.ok(idle.daily.total>0);
 f.set(Date.parse('2026-10-13T07:00:00+01:00'));const s=f.e.snapshot();assert.equal(s.shift!.team_id,1);assert.ok(s.production!.total>0&&s.production!.total<3000);assert.equal(s.history.completedShifts,1);assert.equal((f.db.prepare('SELECT COUNT(*) n FROM shifts WHERE run_id=?').get(s.runId) as {n:number}).n,2);f.db.close();
});
test('Scénarios seuls : historique temporaire fourni, aucun remplissage du planning normal',()=>{
 const f=setup();const normal=f.e.snapshot().runId;f.e.startGuide(5,2);let s=f.e.snapshot();assert.ok(s.history.completedShifts>=30);assert.ok(s.shift);f.e.control('next-shift',undefined,3);
 f.set(f.now()+2*DAY);f.e.returnNormal();s=f.e.snapshot();assert.equal(s.runId,normal);assert.equal(s.shift,null);assert.equal(s.history.completedShifts,0);assert.equal(s.monthly.total,0);f.db.close();
});
test('Arrêt normal durable : production interrompue, reprise admin et scénario accéléré sans effacement',()=>{
 const f=setup();f.p.save([{date:'2026-10-12',templateId:1,teamId:3}]);f.set(Date.parse('2026-10-12T07:00:00+01:00'));const a=f.e.snapshot(),id=f.e.stopNormal(4,true,'Manque d’emballages');assert.equal(f.e.stopNormal(4,true),id);
 f.set(f.now()+10*MINUTE);const stopped=f.e.snapshot();assert.equal(stopped.production!.total,a.production!.total);assert.equal(stopped.machine.state,'stopped');
 f.e.startGuide(5,1);f.e.control('next-shift');f.set(f.now()+5*MINUTE);f.e.returnNormal();assert.equal(f.e.snapshot().machine.state,'stopped');assert.equal(f.e.snapshot().production!.total,a.production!.total);
 const restart=new Engine(f.db,f.now);restart.initialize();assert.equal(restart.normalStoppages().stops.find(s=>s.id===id)!.durationSeconds,15*60);
 restart.restartNormalStop(id);restart.restartNormalStop(id);assert.equal(restart.normalStoppages().stops.find(s=>s.id===id)!.open,false);assert.equal(restart.normalStoppages().stops.find(s=>s.id===id)!.durationSeconds,15*60);
 f.set(f.now()+5*MINUTE);assert.ok(restart.snapshot().production!.total>a.production!.total);f.db.close();
});
test('API arrêts : déclenchement présentateur, reprise réservée admin et arrêt impossible sans quart',async()=>{
 const f=setup(),app=createApp(f.e,'test'),presenter=request.agent(app),admin=request.agent(app);
 await presenter.post('/api/auth/login').send({username:'presenter-demo',password:'public-test-presenter-password'}).expect(200);
 await presenter.post('/api/pilot/normal-stop').send({machineId:4}).expect(400);
 f.p.save([{date:'2026-10-12',templateId:1,teamId:2}]);f.set(Date.parse('2026-10-12T07:00:00+01:00'));
 const stop=await presenter.post('/api/pilot/normal-stop').send({machineId:4,note:'Exemple'}).expect(201);f.set(f.now()+MINUTE);
 await presenter.post(`/api/manager/stoppages/${stop.body.id}/restart`).expect(403);
 await admin.post('/api/auth/login').send({username:'admin-demo',password:'public-test-admin-password'}).expect(200);
 const history=await admin.get('/api/manager/stoppages').expect(200);assert.equal(history.body.stops.find((s:{id:number})=>s.id===stop.body.id).durationSeconds,60);
 await admin.post(`/api/manager/stoppages/${stop.body.id}/restart`).expect(200);assert.equal(f.e.snapshot().machine.state,'running');f.db.close();
});
