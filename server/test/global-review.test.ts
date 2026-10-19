import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from '../src/engine.js';
import {Engine as PlannedEngine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {MINUTE} from '../src/time.js';

test('Sécurité : presque-accident sans reset, accident avec reset, persistance et scénarios isolés',()=>{
 let now=Date.parse('2026-10-12T07:05:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 assert.equal(e.snapshot().safety.days,10);assert.equal(e.snapshot().communication.quote?.selectedByTeamId,null);
 e.recordSafety({kind:'near_miss',note:'Signal fictif'});assert.equal(e.snapshot().safety.days,10);
 e.recordSafety({kind:'accident',note:'Événement de démonstration'});assert.equal(e.snapshot().safety.days,0);
 assert.ok(e.snapshot().safety.milestones.every(m=>!m.reached));
 e.startScenario(1,now,1);assert.equal(e.snapshot().safety.days,10);e.recordSafety({kind:'accident',note:'Scénario seulement'});
 now+=MINUTE;e.returnNormal();const restarted=new Engine(db,()=>now);restarted.initialize();
 assert.equal(restarted.safetyHistory().events.length,3);assert.equal(restarted.snapshot().safety.days,0);assert.equal(restarted.snapshot().shift,null);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.deepEqual(db.pragma('integrity_check'),[{integrity_check:'ok'}]);db.close();
});

test('Signal sécurité par API : admin uniquement, validation des saisies, aucune production inventée',async()=>{
 const now=Date.parse('2026-10-12T07:05:00+01:00'),db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 const app=createApp(e,'test'),pilot=request.agent(app),admin=request.agent(app);
 await request(app).post('/api/manager/safety').send({kind:'accident',note:'Fictif'}).expect(401);
 await pilot.post('/api/auth/login').send({username:'presenter-demo',password:'public-test-presenter-password'}).expect(200);
 await pilot.post('/api/manager/safety').send({kind:'accident',note:'Fictif'}).expect(403);
 await admin.post('/api/auth/login').send({username:'admin-demo',password:'public-test-admin-password'}).expect(200);
 await admin.post('/api/manager/safety').send({kind:'baseline',note:'Reset arbitraire'}).expect(400);
 await admin.post('/api/manager/safety').send({kind:'accident',note:''}).expect(400);
 await admin.post('/api/manager/safety').send({kind:'near_miss',note:'Signal simulé'}).expect(201);
 const history=await admin.get('/api/manager/safety').expect(200);assert.equal(history.body.events.length,2);assert.equal(e.snapshot().shift,null);db.close();
});

test('Sécurité : un signal suspend le bonus du défi jusqu’à validation manager',()=>{
 let now=Date.parse('2026-10-12T06:05:00+01:00');const db=openDatabase(':memory:'),e=new PlannedEngine(db,()=>now);e.initialize();
 // Early shift: isolate safety approval from the independent 100-point cap.
 assert.equal(e.snapshot().production.challengeBonus,0);
 const id=e.assignChallenge({type:'timed_good_production',durationMinutes:2,target:1});
 now+=MINUTE;e.recordSafety({kind:'near_miss',note:'Contrôle fictif sur la fenêtre'});
 now+=MINUTE;const c=e.snapshot().challenges.find(c=>c.id===id)!;
 assert.equal(c.status,'awaiting_validation');assert.equal(c.awardedBonus,0);
 e.reviewChallenge(id,true,'Contrôle terminé');assert.equal(e.snapshot().challenges.find(c=>c.id===id)!.awardedBonus,50);db.close();
});

test('Arrêt soutireuse : impossible de continuer à produire en la déclarant sans effet sur la ligne',()=>{
 const db=openDatabase(':memory:'),e=new PlannedEngine(db,()=>Date.parse('2026-10-12T07:05:00+01:00'));e.initialize();
 const before=e.normalStoppages().stops.length;
 assert.throws(()=>e.stopNormal(4,false),/soutireuse/);assert.equal(e.normalStoppages().stops.length,before);db.close();
});
