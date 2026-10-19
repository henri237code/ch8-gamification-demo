import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {Programming} from '../src/programming.js';
import {createApp} from '../src/app.js';
const MIN=60_000;
function fixture(){let now=Date.parse('2026-10-13T06:01:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,p:new Programming(db,()=>now),set:(at:string)=>{now=Date.parse(at)}};}
test('Rubriques coordonnées : un objectif de quart ne remplace aucun mini-défi programmé',()=>{
 const f=fixture();const program=f.p.save({kind:'challenge',presetCode:'sprint',startsAt:'2026-10-13T06:31:00+01:00'});
 f.set('2026-10-13T06:35:00+01:00');let s=f.e.snapshot();const c=s.challenges.find(c=>c.source==='manager')!;
 f.e.assignChallenge({type:'shift_target'});f.e.setTarget(16000);s=f.e.snapshot();assert.equal(s.challenges.find(x=>x.id===c.id)!.status,'active');
 const instant=f.e.assignChallenge({presetCode:'quality'});let queued=f.e.snapshot().challenges.find(x=>x.id===instant)!;assert.equal(queued.startsAt,c.endsAt);assert.equal(queued.status,'ready');
 f.set('2026-10-13T06:51:00+01:00');s=f.e.snapshot();assert.equal(s.challenges.find(x=>x.id===instant)!.status,'active');
 f.set('2026-10-13T07:01:00+01:00');s=f.e.snapshot();assert.ok(s.challenges.some(x=>x.type==='timed_good_production'&&x.status==='active'&&x.startsAt===queued.endsAt));
 const count=f.db.prepare('SELECT COUNT(*) n FROM challenge_instances').get();new Engine(f.db,f.e.clock).initialize();assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM challenge_instances').get(),count);
 assert.equal((f.db.prepare('SELECT instance_id FROM admin_program_receipts WHERE program_id=?').get(program) as any).instance_id,c.id);assert.ok(s.production.challengeBonus<=100);f.db.close();
});
test('Automatique : enchaînement après un sprint, rattrapage et absence de doublons',()=>{
 const f=fixture();f.set('2026-10-13T06:21:00+01:00');let s=f.e.snapshot();assert.ok(s.challenges.some(c=>c.status==='active'&&c.startsAt==='2026-10-13T05:20:00.000Z'));
 f.set('2026-10-13T07:47:00+01:00');s=f.e.snapshot();assert.ok(s.challenges.some(c=>c.status==='active'&&c.type==='timed_good_production'));assert.ok(s.production.challengeBonus<=100);f.db.close();
});
test('Sauts instantanés : domaine temporaire uniquement, minutes exactes, arrêt conservé',async()=>{
 const f=fixture(),app=createApp(f.e,'test');await request(app).post('/api/pilot/control').set('Authorization','Bearer test').send({action:'skip',minutes:5}).expect(400);
 f.e.startGuide(2,1);const run=f.e.snapshot().runId;f.e.control('stop');let at=Date.parse(f.e.snapshot().at),volume=f.e.snapshot().production.total;
 for(const minutes of [2,5,10,20]){await request(app).post('/api/pilot/control').set('Authorization','Bearer test').send({action:'skip',minutes,expectedRunId:run}).expect(200);const s=f.e.snapshot();assert.equal(Date.parse(s.at),at+minutes*MIN);assert.equal(s.production.total,volume);at=Date.parse(s.at);}
 await request(app).post('/api/pilot/control').set('Authorization','Bearer test').send({action:'skip',minutes:999}).expect(400);f.e.returnNormal();assert.equal(f.e.snapshot().at,'2026-10-13T05:01:00.000Z');f.db.close();
});
test('Attention admin : les compteurs suivent arrêt, idée, validation et reprise',()=>{
 const f=fixture();const id=f.e.stopNormal(4,true,'Essai de notification');assert.equal(f.e.snapshot().adminAttention.openStops,1);
 const idea=f.e.submitContribution({kind:'kaizen',title:'Repères',description:'Clarifier le rangement'},'manager');assert.equal(f.e.snapshot().adminAttention.pendingContributions,1);
 f.e.reviewContribution(idea,'validated','Étudiée et retenue');assert.equal(f.e.snapshot().adminAttention.pendingContributions,0);f.e.restartNormalStop(id);assert.equal(f.e.snapshot().adminAttention.openStops,0);f.db.close();
});
test('Affichage 1E : ne choisit jamais un défi annulé ni un objectif de quart',async()=>{
 const {currentChallenge}=await import('../../client/src/currentChallenge.js');const f=fixture();f.e.assignChallenge({presetCode:'sprint'});f.e.assignChallenge({type:'shift_target'});
 const s=f.e.snapshot();const selected=currentChallenge(s.challenges);assert.ok(selected);assert.equal(selected.type,'timed_good_production');assert.notEqual(selected.status,'cancelled');
 assert.equal(currentChallenge(s.challenges.map(c=>({...c,status:'cancelled'}))),undefined);f.db.close();
});
test('Ancien défaut : réparer uniquement une programmation encore active, sans modifier les volumes',()=>{
 const f=fixture();const program=f.p.save({kind:'challenge',presetCode:'sprint',startsAt:'2026-10-13T06:31:00+01:00'});f.set('2026-10-13T06:35:00+01:00');let s=f.e.snapshot();const id=s.challenges.find(c=>c.source==='manager')!.id;
 const historicalVolume=(f.db.prepare("SELECT SUM(total_bottles) n FROM production_intervals WHERE ends_at<=?").get('2026-10-13T05:35:00.000Z') as {n:number}).n;
 f.db.prepare("UPDATE challenge_instances SET status='cancelled' WHERE id=?").run(id);f.set('2026-10-13T06:36:00+01:00');s=f.e.snapshot();assert.equal(s.challenges.find(c=>c.id===id)!.status,'active');assert.equal((f.db.prepare("SELECT SUM(total_bottles) n FROM production_intervals WHERE ends_at<=?").get('2026-10-13T05:35:00.000Z') as {n:number}).n,historicalVolume);
 f.set('2026-10-13T06:52:00+01:00');f.e.snapshot();f.db.prepare("UPDATE challenge_instances SET status='cancelled' WHERE id=?").run(id);assert.equal(f.e.snapshot().challenges.find(c=>c.id===id)!.status,'cancelled');assert.equal((f.p.list().find(p=>p.id===program) as any).instance_status,'cancelled');f.db.close();
});
test('Annuler un programme futur libère sa plage ; le nouveau choix prime puis l’automatique reprend',()=>{
 const f=fixture();const old=f.p.save({kind:'challenge',presetCode:'sprint',startsAt:'2026-10-13T06:31:00+01:00'});f.p.cancel(old);const replacement=f.p.save({kind:'challenge',presetCode:'quality',startsAt:'2026-10-13T06:31:00+01:00'});
 f.set('2026-10-13T06:36:00+01:00');let s=f.e.snapshot();const active=s.challenges.filter(c=>c.type==='timed_good_production'&&c.status==='active');assert.equal(active.length,1);assert.equal(active[0].presetCode,'quality');assert.ok(active[0].value>0);
 f.set('2026-10-13T06:42:00+01:00');s=f.e.snapshot();assert.ok(s.challenges.some(c=>c.status==='active'&&c.source==='automatic'&&c.startsAt==='2026-10-13T05:41:00.000Z'));assert.ok(f.p.list().some(p=>p.id===replacement));f.db.close();
});
