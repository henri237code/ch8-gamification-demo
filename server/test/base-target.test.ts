import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {Engine as UnplannedEngine} from '../src/engine.js';
import {createApp} from '../src/app.js';
import {Programming} from '../src/programming.js';

test('Base : prochain quart, rattrapage et historique conservé après redémarrage',()=>{
 let now=Date.parse('2026-10-12T12:00:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 const before=e.snapshot();assert.equal(before.production!.target,15000);
 const result=e.setBaseTarget(15500);assert.equal(result.effectiveFrom,'2026-10-12T13:00:00.000Z');assert.equal(result.pending,true);
 assert.deepEqual(e.snapshot().production,before.production);
 // A replacement of a pending default doesn't duplicate the boundary revision.
 e.setBaseTarget(15600);e.setBaseTarget(15500);
 now=Date.parse('2026-10-15T15:00:00+01:00');const restarted=new Engine(db,()=>now);restarted.initialize();
 assert.equal(restarted.snapshot().production!.target,15500);
 const rows=db.prepare('SELECT sh.starts_at,s.target_good_bottles FROM shifts sh JOIN shift_order_segments s ON s.shift_id=sh.id ORDER BY sh.starts_at').all() as {starts_at:string;target_good_bottles:number}[];
 assert.ok(rows.some(r=>r.starts_at<result.effectiveFrom));assert.ok(rows.some(r=>r.starts_at>=result.effectiveFrom));
 for(const r of rows)assert.equal(r.target_good_bottles,r.starts_at<result.effectiveFrom?15000:15500);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);db.close();
});
test('Base : un objectif programmé reste prioritaire puis retrouve la nouvelle base',()=>{
 let now=Date.parse('2026-10-12T12:00:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();e.setBaseTarget(15500);
 new Programming(db,()=>now).save({kind:'target',target:16000,startsAt:'2026-10-12T14:10:00+01:00',endsAt:'2026-10-12T14:20:00+01:00'});
 now=Date.parse('2026-10-12T14:05:00+01:00');assert.equal(e.snapshot().production!.target,15500);
 now=Date.parse('2026-10-12T14:15:00+01:00');assert.equal(e.snapshot().production!.target,16000);
 now=Date.parse('2026-10-12T14:25:00+01:00');assert.equal(e.snapshot().production!.target,15500);db.close();
});
test('Base : accès administrateur, validation et aucune production sans planning',async()=>{
 const db=openDatabase(':memory:'),e=new UnplannedEngine(db,()=>Date.parse('2026-10-12T12:00:00+01:00'));e.initialize();const app=createApp(e,'test');
 await request(app).get('/api/manager/base-target').expect(401);
 await request(app).put('/api/manager/base-target').set('Authorization','Bearer test').send({target:0}).expect(400);
 await request(app).put('/api/manager/base-target').set('Authorization','Bearer test').send({target:15500.5}).expect(400);
 const r=await request(app).put('/api/manager/base-target').set('Authorization','Bearer test').send({target:15500}).expect(200);assert.equal(r.body.target,15500);
 assert.equal(e.snapshot().production,null);assert.equal(e.snapshot().shift,null);db.close();
});
