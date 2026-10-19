import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {Engine as BaseEngine} from '../src/engine.js';
import {Planning} from '../src/planning.js';
import {createApp} from '../src/app.js';
import {DAY,HOUR,iso,localDate} from '../src/time.js';
function fixture(){let now=Date.parse('2026-10-12T12:30:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,p:new Planning(db,()=>now),now:()=>now,set:(t:number)=>{now=t;}};}
test('Planning deux semaines : 42 quarts, nuit traversant la date et rattrapage sans réaffectation',()=>{
 const f=fixture(),start=Date.parse('2026-10-13T00:00:00+01:00');
 const entries=Array.from({length:14},(_,i)=>[1,2,3].map(templateId=>({date:localDate(start+i*DAY),templateId,teamId:(i+templateId)%3+1}))).flat();
 assert.equal(f.p.save(entries).saved,42);const list=f.p.list('2026-10-13',14);assert.equal(list.entries.length,42);assert.equal(list.unplannedFuture,0);
 assert.equal(list.entries[2].startsAt,'2026-10-13T21:00:00.000Z');assert.equal(list.entries[2].endsAt,'2026-10-14T05:00:00.000Z');
 const old=f.e.snapshot();f.set(Date.parse('2026-10-15T23:00:00+01:00'));const restart=new Engine(f.db,f.now);restart.initialize();const s=restart.snapshot();
 assert.equal(s.shift.team_id,entries.find(x=>x.date==='2026-10-15'&&x.templateId===3)!.teamId);assert.equal(s.shift.assignment_source,'manager_planning');
 const oldShift=f.db.prepare('SELECT team_id FROM shifts WHERE id=?').get(old.shift.id) as {team_id:number};assert.equal(oldShift.team_id,old.shift.team_id);
 assert.equal(f.p.list('2026-10-13',14).entries.filter(e=>e.scheduleId!==null).length,42);
 const again=new Engine(f.db,f.now);again.initialize();assert.deepEqual(again.snapshot().production,s.production);f.db.close();
});
test('Planning : révisions futures, retrait, conflits atomiques et dates invalides',()=>{
 const f=fixture(),row={date:'2026-10-13',templateId:1,teamId:3};f.p.save([row]);f.p.save([{...row,teamId:2}]);
 let list=f.p.list('2026-10-13',14);assert.equal(list.entries[0].teamId,2);assert.equal(list.entries[0].source,'manager_planning');
 assert.throws(()=>f.p.save([{...row,teamId:1},{date:'2026-10-12',templateId:1,teamId:1}]),/commencé|généré/);assert.equal(f.p.list('2026-10-13',1).entries[0].teamId,2);
 assert.throws(()=>f.p.save([row,row]),/seul choix/);assert.throws(()=>f.p.save([{...row,date:'2026-02-30'}]),/invalide/);assert.throws(()=>f.p.save([{...row,teamId:99}]),/inconnue/);
 f.p.remove(list.entries[0].scheduleId!);list=f.p.list('2026-10-13',1);assert.equal(list.entries[0].source,'unplanned');assert.equal(list.entries[0].scheduleId,null);
 f.p.save([row]);const id=f.p.list('2026-10-13',1).entries[0].scheduleId!;f.set(Date.parse('2026-10-13T06:00:00+01:00'));assert.throws(()=>f.p.remove(id),/commencé/);f.db.close();
});
test('Relève temporaire : équipe choisie, planning normal conservé et retour à l’heure réelle',()=>{
 const f=fixture();f.p.save([{date:'2026-10-12',templateId:2,teamId:2}]);
 const normal=f.e.snapshot().runId;f.e.startGuide(5,1);let s=f.e.snapshot();
 f.e.guideNext(s.runId,0); // Montrer la dernière minute du quart.
 s=f.e.snapshot();f.e.guideNext(s.runId,1,3);s=f.e.snapshot();assert.equal(s.shift.team_id,3);assert.equal(s.shift.assignment_source,'presenter');assert.equal(s.production.total,0);
 f.e.guideNext(s.runId,2);s=f.e.snapshot();assert.ok(s.production.total>0&&s.production.total<1000);
 assert.equal(f.p.list('2026-10-12',1).entries[1].teamId,2);
 f.set(Date.parse('2026-10-12T14:10:00+01:00'));f.e.returnNormal();const back=f.e.snapshot();assert.equal(back.runId,normal);assert.equal(back.shift.team_id,2);assert.equal(back.shift.assignment_source,'manager_planning');assert.ok(back.production.total<1000);
 f.e.startScenario(1);f.e.control('pause');f.e.control('next-shift',undefined,1);assert.equal(f.e.snapshot().shift.team_id,1);f.db.close();
});
test('Premier lancement : planning préexistant appliqué sans sélection du présentateur',()=>{
 const db=openDatabase(':memory:');let now=Date.parse('2026-10-12T00:00:00+01:00');const e=new BaseEngine(db,()=>now),p=new Planning(db,()=>now);
 p.save([{date:'2026-10-12',templateId:1,teamId:3}]);now+=12*HOUR;e.initialize();const s=e.snapshot();assert.ok(s.shift&&s.production);assert.equal(s.mode,'real');assert.equal(s.shift.team_id,3);assert.equal(s.shift.assignment_source,'manager_planning');assert.ok(s.production.total>0);db.close();
});
test('API planning réservée au manager ; présentateur limité aux choix temporaires',async()=>{
 const f=fixture(),app=createApp(f.e,'test'),agent=request.agent(app);
 await agent.get('/api/manager/planning').expect(401);await agent.post('/api/auth/login').send({username:'presenter-demo',password:'public-test-presenter-password'}).expect(200);
 await agent.put('/api/manager/planning').send({entries:[{date:'2026-10-13',templateId:1,teamId:1}]}).expect(403);
 await agent.post('/api/auth/logout').send({space:'pilot'}).expect(200);await agent.post('/api/auth/login').send({username:'admin-demo',password:'public-test-admin-password'}).expect(200);
 await agent.put('/api/manager/planning').send({entries:[{date:'2026-10-13',templateId:1,teamId:1}]}).expect(200);
 const list=await agent.get('/api/manager/planning?from=2026-10-13&days=14').expect(200);assert.equal(list.body.entries.length,42);
 await agent.get('/api/manager/planning?days=999').expect(400);await agent.delete(`/api/manager/planning/${list.body.entries[0].scheduleId}`).expect(200);f.db.close();
});
