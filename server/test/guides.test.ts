import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {MINUTE,iso} from '../src/time.js';
function setup(at='2026-10-10T12:30:00+01:00') {
 let now=Date.parse(at);const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 return {db,e,set:(n:number)=>{now=n;},now:()=>now};
}
function next(e:Engine) {const s=e.snapshot();e.guideNext(s.runId,s.guidedScenario!.position);return e.snapshot();}
test('Quatre parcours disponibles : étapes persistantes, équipes choisies et bilans calculés',()=>{
 const f=setup();assert.deepEqual(f.e.guideCatalog().map(g=>g.id),[1,2,3,5]);
 assert.throws(()=>f.e.startGuide(4,3),/inconnu/);
 assert.throws(()=>f.e.startScenario(4),/disponible/);
 for(const id of [1,5]) {
  f.e.startGuide(id,3);let s=f.e.snapshot();assert.equal(s.shift.team_id,3);assert.equal(s.status,'running');
  const initial=s.guidedScenario!.initialShift.id;
  while(!s.guidedScenario!.complete) s=next(f.e);
  assert.equal(s.guidedScenario!.initialShift.status,'completed');assert.ok(s.guidedScenario!.initialShift.total>0);
  assert.equal(s.guidedScenario!.initialShift.id,initial);
  if(id===5) {assert.equal(s.shift.remainingSeconds,7*3600+50*60);assert.ok(s.production.total>0&&s.production.total<1000);}
 }
 f.db.close();
});
test('Anomalie et Kaizen : décision manager, effet unique et reprise du scénario',()=>{
 const f=setup();
 for(const id of [2,3]) {
  f.e.startGuide(id,2);if(id===2) next(f.e);const s=next(f.e),contribution=s.guidedScenario!.contributionId!;
  assert.equal(s.guidedScenario!.awaitingManager,true);assert.throws(()=>next(f.e),/validation explicite/);
  const count=f.db.prepare('SELECT COUNT(*) n FROM contributions WHERE run_id=?').get(s.runId) as {n:number};
  f.e.guideNext(s.runId,s.guidedScenario!.position-1);
  assert.equal((f.db.prepare('SELECT COUNT(*) n FROM contributions WHERE run_id=?').get(s.runId) as {n:number}).n,count.n);
  f.e.reviewContribution(contribution,'acknowledged');f.e.reviewContribution(contribution,'validated','Contribution utile');
  if(id===2) {
   assert.equal(f.e.snapshot().guidedScenario!.awaitingManager,true);
   assert.equal(f.e.snapshot().machine.state,'stopped');
   assert.throws(()=>next(f.e),/résolution/);
   f.e.reviewContribution(contribution,'resolved','Réparation confirmée');
   assert.equal(f.e.snapshot().machine.state,'running');
  }
  assert.equal(f.e.snapshot().guidedScenario!.awaitingManager,false);
  let done=next(f.e);while(!done.guidedScenario!.complete) done=next(f.e);
  assert.equal(done.machine.state,'running');assert.equal((f.db.prepare('SELECT COUNT(*) n FROM recognitions WHERE contribution_id=?').get(contribution) as {n:number}).n,1);
 }
 f.db.close();
});
test('Le temps du scénario continue entre les étapes : arrêt en plateau, reprise en production',()=>{
 const f=setup();f.e.startGuide(2,2);let state=f.e.snapshot();
 const initialAt=Date.parse(state.at),initialTotal=state.production.total;
 f.set(f.now()+MINUTE);state=f.e.snapshot();
 assert.equal(Date.parse(state.at),initialAt+MINUTE);
 assert.ok(state.production.total>initialTotal);
 state=next(f.e);assert.equal(state.machine.state,'stopped');
 const stoppedAt=Date.parse(state.at),stoppedTotal=state.production.total;
 f.set(f.now()+2*MINUTE);state=f.e.snapshot();
 assert.equal(Date.parse(state.at),stoppedAt+2*MINUTE);
 assert.equal(state.production.total,stoppedTotal);
 state=next(f.e);const contribution=state.guidedScenario!.contributionId!;
 f.e.reviewContribution(contribution,'acknowledged');f.e.reviewContribution(contribution,'validated','Vérifié');
 f.e.reviewContribution(contribution,'resolved','Ligne relancée');
 state=next(f.e);state=next(f.e);assert.equal(state.machine.state,'running');
 const resumedAt=Date.parse(state.at),resumedTotal=state.production.total;
 f.set(f.now()+MINUTE);state=f.e.snapshot();
 assert.equal(Date.parse(state.at),resumedAt+MINUTE);
 assert.ok(state.production.total>resumedTotal);
 f.db.close();
});
test('Interruption guidée à l’heure du chevauchement historique : résolution ferme les deux arrêts',()=>{
 const f=setup('2026-10-13T15:18:00+01:00');
 const normal=f.e.snapshot().runId;
 f.e.startGuide(2,3,f.now());let state=f.e.snapshot();
 assert.equal(state.machine.state,'running');
 assert.equal((f.db.prepare('SELECT COUNT(*) n FROM stoppages WHERE run_id=? AND reason_id=1').get(state.runId) as {n:number}).n,0);
 state=next(f.e);const stopAt=Date.parse(state.at);
 // Reproduce a 35-minute seeded stop persisted by an earlier build.
 f.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,ends_at,affects_line) VALUES (?,?,4,1,?,?,1)')
  .run(state.runId,state.shift.id,iso(stopAt-MINUTE),iso(stopAt+35*MINUTE));
 state=next(f.e);const contribution=state.guidedScenario!.contributionId!;
 f.e.reviewContribution(contribution,'acknowledged');
 f.e.reviewContribution(contribution,'in_progress');
 assert.throws(()=>f.e.reviewContribution(contribution,'resolved'),/Valider/);
 f.e.reviewContribution(contribution,'validated','Cause identifiée');
 assert.equal(f.e.snapshot().machine.state,'stopped');
 f.e.reviewContribution(contribution,'resolved','Pompe réparée');
 state=f.e.snapshot();assert.equal(state.machine.state,'running');
 assert.equal(state.guidedScenario!.awaitingManager,false);
 const legacy=f.db.prepare('SELECT ends_at FROM stoppages WHERE run_id=? AND reason_id=1 AND starts_at=?').get(state.runId,iso(stopAt-MINUTE)) as {ends_at:string};
 assert.equal(legacy.ends_at,state.at);
 const before=state.production.total;
 f.set(f.now()+MINUTE);state=f.e.snapshot();assert.ok(state.production.total>before);
 state=next(f.e);assert.equal(state.machine.state,'running'); // Idempotent guide step.
 f.e.returnNormal();assert.equal(f.e.snapshot().runId,normal);
 f.db.close();
});
test('Le mini-défi 1E conserve son volume pendant l’arrêt ; le planning normal garde ses propres défis',()=>{
 const f=setup();const normal=f.e.snapshot().runId;
 const normalIds=(f.db.prepare('SELECT id FROM challenge_instances WHERE run_id=? ORDER BY id').all(normal) as {id:number}[]).map(x=>x.id);
 f.e.startGuide(2,2);let state=f.e.snapshot();const scenario=state.runId;
 const express=f.e.assignChallenge({presetCode:'sprint'});
 f.set(f.now()+4*MINUTE);state=f.e.snapshot();
 const before=state.challenges.find(c=>c.id===express)!;assert.ok(before.value>0);
 state=next(f.e);assert.equal(state.machine.state,'stopped');
 const plateau=state.challenges.find(c=>c.id===express)!.value;
 f.set(f.now()+2*MINUTE);state=f.e.snapshot();assert.equal(state.challenges.find(c=>c.id===express)!.value,plateau);
 state=next(f.e);const contribution=state.guidedScenario!.contributionId!;
 f.e.reviewContribution(contribution,'acknowledged');f.e.reviewContribution(contribution,'validated','Étudiée');f.e.reviewContribution(contribution,'resolved','Réparée');
 state=f.e.snapshot();assert.equal(state.machine.state,'running');
 const atRestart=state.challenges.find(c=>c.id===express)!.value;assert.ok(atRestart>=plateau);
 f.set(f.now()+MINUTE);state=f.e.snapshot();assert.ok(state.challenges.find(c=>c.id===express)!.value>atRestart);
 f.e.returnNormal();state=f.e.snapshot();assert.equal(state.runId,normal);
 assert.equal(state.guidedScenario,null);
 assert.deepEqual((f.db.prepare('SELECT id FROM challenge_instances WHERE run_id=? ORDER BY id').all(normal) as {id:number}[]).map(x=>x.id),normalIds);
 assert.ok(f.db.prepare('SELECT id FROM challenge_instances WHERE id=? AND run_id=?').get(express,scenario));
 f.db.close();
});
test('Relève de jour : le premier clic affiche 21 h 59, le suivant ouvre 22 h',()=>{
 const f=setup();f.e.startGuide(5,3,Date.parse('2026-10-10T15:00:00+01:00'));
 const before=f.e.snapshot();assert.equal(before.status,'running');
 const approach=next(f.e);
 assert.equal(approach.at,'2026-10-10T20:59:00.000Z');
 assert.equal(approach.shift.remainingSeconds,60);
 assert.equal(approach.guidedScenario!.initialShift.status,'active');
 const boundary=next(f.e);
 assert.equal(boundary.at,'2026-10-10T21:00:00.000Z');
 assert.equal(boundary.shift.template_id,3);
 assert.equal(boundary.production.total,0);
 assert.equal(boundary.guidedScenario!.initialShift.status,'completed');
 f.db.close();
});
test('Relève de nuit, redémarrage, reset et retour normal après changement de quart réel',()=>{
 const f=setup('2026-10-10T13:59:00+01:00');f.e.publish('Message à conserver');const normal=f.e.snapshot().runId;
 const run=f.e.startGuide(5,1,Date.parse('2026-10-10T23:59:00+01:00'));
 const approach=next(f.e);assert.equal(approach.shift.template_id,3);assert.equal(approach.shift.id,approach.guidedScenario!.initialShift.id);
 assert.equal(Date.parse(approach.at),Date.parse(approach.guidedScenario!.initialShift.ends_at)-MINUTE);
 const restart=new Engine(f.db,f.now);restart.initialize();assert.equal(restart.snapshot().guidedScenario!.position,1);
 const boundary=next(restart);assert.equal(boundary.shift.template_id,1);assert.equal(boundary.production.total,0);
 const newRun=restart.restartGuide(run);assert.notEqual(newRun,run);assert.equal(restart.snapshot().guidedScenario!.position,0);
 assert.throws(()=>restart.guideNext(run,1),/changé/);
 f.set(f.now()+4*MINUTE);restart.returnNormal();const s=restart.snapshot();
 assert.equal(s.runId,normal);assert.equal(s.shift.template_id,2);assert.ok(s.production.total<1000);assert.equal(s.guidedScenario,null);
 assert.ok(s.communication.messages.some(m=>(m as {body:string}).body==='Message à conserver'));f.db.close();
});
test('API parcours : présentateur autorisé, validation manager interdite, commandes mal formées refusées',async()=>{
 const f=setup(),app=createApp(f.e,'test');const auth=await request(app).post('/api/auth/login').send({username:'presenter-demo',password:'public-test-presenter-password'}).expect(200);
 const cookies=auth.headers['set-cookie'];
 await request(app).get('/api/pilot/guides').set('Cookie',cookies).expect(200);
 const catalog=await request(app).get('/api/scenarios').expect(200);
 assert.ok(!catalog.body.some((scenario:{id:number})=>scenario.id===4));
 await request(app).post('/api/pilot/guide').set('Cookie',cookies).send({scenarioId:4,teamId:1}).expect(400);
 await request(app).post('/api/pilot/scenario').set('Cookie',cookies).send({scenarioId:4,teamId:1}).expect(400);
 await request(app).post('/api/pilot/guide').set('Cookie',cookies).send({scenarioId:2,teamId:999}).expect(400);
 const launch=await request(app).post('/api/pilot/guide').set('Cookie',cookies).send({scenarioId:2,teamId:1}).expect(200);
 await request(app).post('/api/pilot/guide/next').set('Cookie',cookies).send({runId:launch.body.runId,expectedPosition:0}).expect(200);
 await request(app).post('/api/manager/contributions/1/review').set('Cookie',cookies).send({status:'validated'}).expect(403);
 await request(app).post('/api/pilot/guide/next').set('Cookie',cookies).send({runId:launch.body.runId,expectedPosition:99}).expect(400);f.db.close();
});
test('API croisée des quatre parcours : pilotage, admin et état de l’écran 1 restent cohérents',async()=>{
 const f=setup(),app=createApp(f.e,'test'),manager={Authorization:'Bearer test'};
 const normal=f.e.snapshot().runId;
 const login=await request(app).post('/api/auth/login').send({username:'presenter-demo',password:'public-test-presenter-password'}).expect(200);
 const cookie=login.headers['set-cookie'];
 const launch=async(id:number)=> (await request(app).post('/api/pilot/guide').set('Cookie',cookie).send({scenarioId:id,teamId:2}).expect(200)).body;
 const advance=async(s:any)=> (await request(app).post('/api/pilot/guide/next').set('Cookie',cookie).send({runId:s.runId,expectedPosition:s.guidedScenario.position}).expect(200)).body;

 let s=await launch(1);
 s=(await request(app).post('/api/manager/target').set(manager).send({target:16000}).expect(200)).body;
 assert.equal(s.production.target,16000);
 while(!s.guidedScenario.complete) s=await advance(s);
 assert.ok(s.guidedScenario.initialShift.total>0);

 s=await launch(2);s=await advance(s);assert.equal(s.machine.state,'stopped');
 const frozen=s.production.total;s=await advance(s);assert.equal(s.production.total,frozen);
 const id=s.guidedScenario.contributionId;
 for(const status of ['acknowledged','validated','resolved'])
   s=(await request(app).post(`/api/manager/contributions/${id}/review`).set(manager).send({status,note:'Contrôle du parcours'}).expect(200)).body;
 assert.equal(s.machine.state,'running');assert.equal(s.guidedScenario.awaitingManager,false);
 s=await advance(s);s=await advance(s);assert.equal(s.machine.state,'running');
 const resumed=s.production.total;s=await advance(s);assert.ok(s.production.total>resumed);

 s=await launch(3);s=await advance(s);
 for(const status of ['acknowledged','validated'])
   s=(await request(app).post(`/api/manager/contributions/${s.guidedScenario.contributionId}/review`).set(manager).send({status,note:'Idée étudiée'}).expect(200)).body;
 assert.equal(s.guidedScenario.awaitingManager,false);
 while(!s.guidedScenario.complete) s=await advance(s);

 s=await launch(5);s=await advance(s);assert.equal(s.shift.remainingSeconds,60);
 s=await advance(s);assert.equal(s.production.total,0);
 while(!s.guidedScenario.complete) s=await advance(s);
 s=(await request(app).post('/api/pilot/normal').set('Cookie',cookie).send({expectedRunId:s.runId}).expect(200)).body;
 assert.equal(s.runId,normal);assert.equal(s.guidedScenario,null);
 f.db.close();
});

test('Paramètres manager : le parcours ne remplace ni objectif, ni défi, ni citation ; reset conserve les saisies',()=>{
 const f=setup();f.e.startGuide(1,2);f.e.setTarget(16000);const challenge=f.e.assignChallenge({type:'shift_target',bonusPoints:60});
 const quote=f.e.publish('Citation personnelle','quote');f.e.selectQuote('manual',quote,2);
 const before=f.e.snapshot();next(f.e);const after=f.e.snapshot();
 assert.equal(after.production.target,16000);assert.equal(after.challenges.find(c=>c.id===challenge)!.source,'manager');assert.equal(after.communication.quote!.id,quote);
 f.e.restartGuide(after.runId);const fresh=f.e.snapshot();assert.equal(fresh.communication.quote!.id,quote);
 assert.ok(f.db.prepare('SELECT 1 FROM manager_targets WHERE run_scope=? AND target_value=16000').get(before.runId));
 assert.ok(f.db.prepare('SELECT 1 FROM challenge_instances WHERE id=?').get(challenge));
 assert.equal(fresh.production.target,15000); // The old setting remains scoped to its archived run.
 assert.equal(fresh.shift.team_id,2);f.db.close();
});

test('Une résolution sans validation et un refus ne franchissent pas l’étape manager',()=>{
 const f=setup();f.e.startGuide(3,1);const s=next(f.e),id=s.guidedScenario!.contributionId!;
 f.e.reviewContribution(id,'acknowledged');f.e.reviewContribution(id,'in_progress');f.e.reviewContribution(id,'resolved');
 assert.throws(()=>next(f.e),/validation explicite/);
 f.e.restartGuide(s.runId);const fresh=next(f.e);f.e.reviewContribution(fresh.guidedScenario!.contributionId!,'rejected','À revoir');
 assert.throws(()=>next(f.e),/refusée/);assert.ok(f.e.snapshot().guidedScenario!.blockedReason);f.db.close();
});
