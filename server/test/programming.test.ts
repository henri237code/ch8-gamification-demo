import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {Programming} from '../src/programming.js';
import {Editorial} from '../src/editorial.js';
import {Planning} from '../src/planning.js';
import {createApp} from '../src/app.js';
function setup(){let now=Date.parse('2026-10-12T12:00:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,p:new Programming(db,()=>now),ed:new Editorial(db,()=>now),set:(at:string)=>{now=Date.parse(at)}}}
test('Horizon 24 h inclusif, indépendance du planning, chevauchements et durée du sprint',()=>{
 const f=setup();
 assert.ok(f.p.save({kind:'target',target:16000,startsAt:'2026-10-13T12:00:00+01:00'}));
 assert.throws(()=>f.p.save({kind:'target',target:16000,startsAt:'2026-10-13T12:01:00+01:00'}),/24/);
 assert.throws(()=>f.ed.save(undefined,{kind:'message',body:'Nuit',startsAt:'2026-10-13T12:01:00+01:00'}),/24/);
 assert.ok(f.ed.save(undefined,{kind:'message',body:'Nuit',startsAt:'2026-10-13T12:00:00+01:00'}));
 const id=f.p.save({kind:'challenge',presetCode:'sprint',startsAt:'2026-10-13T02:00:00+01:00'});
 assert.equal(f.p.list().find(p=>p.id===id)!.ends_at,'2026-10-13T01:20:00.000Z');
 assert.throws(()=>f.p.save({kind:'challenge',presetCode:'quality',startsAt:'2026-10-13T02:10:00+01:00'}),/occupe/);
 assert.throws(()=>f.p.save({kind:'challenge',presetCode:'sprint',startsAt:'2026-10-13T05:50:00+01:00'}),/quart/);
 const future=new Planning(f.db,f.e.clock).list('2026-11-01',21);assert.equal(future.entries.length,63);
 new Planning(f.db,f.e.clock).save([{date:'2026-11-01',templateId:1,teamId:1}]);
 f.db.close();
});
test('Objectif futur : application, restauration, quantités conservées et rattrapage sans doublon',()=>{
 const f=setup(),id=f.p.save({kind:'target',target:17000,startsAt:'2026-10-12T14:00:00+01:00',endsAt:'2026-10-12T15:00:00+01:00'});
 f.set('2026-10-12T14:30:00+01:00');let s=f.e.snapshot();assert.equal(s.production.target,17000);const volume=s.production.total;
 new Engine(f.db,f.e.clock).initialize();assert.equal(f.e.snapshot().production.total,volume);
 f.set('2026-10-12T15:01:00+01:00');s=f.e.snapshot();assert.equal(s.production.target,15000);assert.ok(s.production.total>volume);
 assert.equal((f.db.prepare('SELECT COUNT(*) n FROM admin_program_receipts WHERE program_id=?').get(id) as any).n,1);
 const count=(f.db.prepare('SELECT COUNT(*) n FROM target_applications').get() as any).n;f.e.snapshot();new Engine(f.db,f.e.clock).initialize();assert.equal((f.db.prepare('SELECT COUNT(*) n FROM target_applications').get() as any).n,count);
 f.db.close();
});
test('Quart complet après absence : objectif final et bonus évalués selon la programmation',()=>{
 const f=setup();f.p.save({kind:'target',target:14000,startsAt:'2026-10-12T14:00:00+01:00'});
 f.set('2026-10-13T07:00:00+01:00');new Engine(f.db,f.e.clock).initialize();
 const row=f.db.prepare("SELECT a.effective_value FROM target_applications a JOIN shift_order_segments s ON s.id=a.segment_id JOIN shifts sh ON sh.id=s.shift_id WHERE sh.starts_at='2026-10-12T13:00:00.000Z' ORDER BY a.id DESC LIMIT 1").get() as any;assert.equal(row.effective_value,14000);assert.equal(f.e.snapshot().production.target,15000);f.db.close();
});
test('Défi programmé : rattrapage, automatique après expiration et bonus uniques',()=>{
 const f=setup(),id=f.p.save({kind:'challenge',presetCode:'sprint',startsAt:'2026-10-12T14:40:00+01:00'});
 f.set('2026-10-12T15:10:00+01:00');const s=f.e.snapshot();
 const manual=s.challenges.find(c=>c.source==='manager');assert.ok(manual);assert.equal(manual.durationMinutes,20);assert.equal(manual.startsAt,'2026-10-12T13:40:00.000Z');
 assert.ok(s.challenges.some(c=>c.source==='automatic'&&c.status==='active'&&c.startsAt===manual.endsAt));
 const count=(f.db.prepare('SELECT COUNT(*) n FROM challenge_instances').get() as any).n;new Engine(f.db,f.e.clock).initialize();f.e.snapshot();assert.equal((f.db.prepare('SELECT COUNT(*) n FROM challenge_instances').get() as any).n,count);
 assert.equal((f.db.prepare('SELECT COUNT(*) n FROM admin_program_receipts WHERE program_id=?').get(id) as any).n,1);assert.equal((f.db.prepare("SELECT COUNT(*) n FROM score_events WHERE challenge_id=? AND kind='challenge_bonus'").get(manual.id) as any).n,manual.status==='won'?1:0);f.db.close();
});
test('Scénario temporaire ne consomme pas une programmation normale ; modifications et annulations futures',()=>{
 const f=setup(),id=f.p.save({kind:'target',target:16000,startsAt:'2026-10-12T14:00:00+01:00'});
 f.p.save({kind:'target',target:18000,startsAt:'2026-10-12T14:00:00+01:00'},id);
 f.e.startScenario(1,Date.parse('2026-10-12T15:00:00+01:00'),1);assert.equal(f.e.snapshot().production.target,15000);assert.equal((f.db.prepare('SELECT COUNT(*) n FROM admin_program_receipts').get() as any).n,0);
 f.e.returnNormal();f.p.cancel(id);f.set('2026-10-12T15:00:00+01:00');assert.equal(f.e.snapshot().production.target,15000);f.db.close();
});
test('Citations programmées prioritaires puis retour à la sélection antérieure',()=>{
 const f=setup();f.e.selectQuote('manual',1,1);
 const id=f.ed.save(undefined,{kind:'quote',body:'Message de nuit',startsAt:'2026-10-12T12:10:00+01:00',endsAt:'2026-10-12T12:20:00+01:00'});
 assert.equal(f.e.snapshot().communication.quote?.id,1);f.set('2026-10-12T12:15:00+01:00');assert.equal(f.e.snapshot().communication.quote?.id,id);f.set('2026-10-12T12:20:00+01:00');assert.equal(f.e.snapshot().communication.quote?.id,1);f.db.close();
});
test('API programmations protégées, écriture persistante, modification et suppression',async()=>{
 const f=setup(),app=createApp(f.e,'test');await request(app).get('/api/manager/programs').expect(401);
 const r=await request(app).post('/api/manager/programs').set('Authorization','Bearer test').send({kind:'target',target:16000,startsAt:'2026-10-12T14:00:00+01:00'}).expect(201);
 await request(app).put(`/api/manager/programs/${r.body.id}`).set('Authorization','Bearer test').send({kind:'target',target:17000,startsAt:'2026-10-12T14:00:00+01:00'}).expect(200);
 await request(app).delete(`/api/manager/programs/${r.body.id}`).set('Authorization','Bearer test').expect(200);assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('Anciens défis : la migration ne déclenche aucune reprise rétroactive',()=>{
 const f=setup(),id=f.e.assignChallenge({type:'timed_good_production',durationMinutes:2,target:1});
 const c=f.e.snapshot().challenges.find(c=>c.id===id)!;
 f.db.prepare('UPDATE challenge_instances SET resume_automatic=0 WHERE id=?').run(id);
 f.set(c.endsAt);f.e.snapshot();
 assert.equal((f.db.prepare("SELECT COUNT(*) n FROM challenge_instances WHERE source='automatic' AND starts_at=? AND shift_id=?").get(c.endsAt,f.e.snapshot().shift.id) as any).n,0);f.db.close();
});
test('Déplanifier un quart futur empêche ses programmes de créer une production',async()=>{
 const {Engine:BaseEngine}=await import('../src/engine.js');let now=Date.parse('2026-10-12T12:00:00+01:00');
 const db=openDatabase(':memory:'),e=new BaseEngine(db,()=>now);e.initialize();const p=new Programming(db,()=>now),planning=new Planning(db,()=>now);
 assert.throws(()=>p.save({kind:'target',target:16000,startsAt:'2026-10-12T14:00:00+01:00'}),/Planifier/);
 planning.save([{date:'2026-10-12',templateId:2,teamId:1}]);p.save({kind:'target',target:16000,startsAt:'2026-10-12T14:00:00+01:00'});
 const plan=planning.list('2026-10-12',1).entries.find(x=>x.templateId===2)!;planning.remove(plan.scheduleId!);
 now=Date.parse('2026-10-12T15:00:00+01:00');const state=e.snapshot();assert.equal(state.shift,null);assert.equal(state.production,null);assert.equal((db.prepare('SELECT COUNT(*) n FROM admin_program_receipts').get() as any).n,0);assert.equal((db.prepare('SELECT COUNT(*) n FROM production_intervals').get() as any).n,0);db.close();
});
