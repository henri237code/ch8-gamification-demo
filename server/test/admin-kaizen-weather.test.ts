import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from '../src/engine.js';
import {Planning} from '../src/planning.js';
import {createApp} from '../src/app.js';
function fixture(start='2026-10-12T12:00:00+01:00'){let now=Date.parse(start);const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,set:(v:string)=>{now=Date.parse(v)},p:new Planning(db,()=>now)}}
test('Kaizen sans quart : saisie, détails, validation directe, refus et reconnaissance unique',async()=>{
 const f=fixture(),app=createApp(f.e,'test');assert.equal(f.e.snapshot().shift,null);
 const r=await request(app).post('/api/manager/contributions').set('Authorization','Bearer test').send({kind:'kaizen',title:'Rangement du bureau CH8',description:'Améliorer le repérage des documents de production',personId:1}).expect(201);
 let s=f.e.snapshot();assert.equal(s.kaizen.submitted,1);assert.equal(s.kaizen.validated,0);
 const row=s.contributions[0] as any;assert.equal(row.status,'submitted');assert.equal(row.submitted_shift_id,null);assert.equal(row.team_name,'Equipe A');
 await request(app).post(`/api/manager/contributions/${r.body.id}/review`).set('Authorization','Bearer test').send({status:'validated',note:'Après étude'}).expect(200);
 f.e.reviewContribution(r.body.id,'validated');s=f.e.snapshot();assert.equal(s.kaizen.validated,1);assert.equal(s.recognitions.length,1);assert.equal(s.production,null);
 const rejected=f.e.submitContribution({kind:'kaizen',title:'Autre proposition',description:'À étudier'});f.e.reviewContribution(rejected,'rejected');assert.equal(f.e.snapshot().kaizen.validated,1);
 const restarted=new Engine(f.db,f.e.clock);restarted.initialize();assert.equal(restarted.snapshot().kaizen.submitted,2);assert.equal(restarted.snapshot().kaizen.validated,1);assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('Compteurs Kaizen : le mois de validation est indépendant du mois de proposition',()=>{
 const f=fixture('2026-09-30T12:00:00+01:00'),id=f.e.submitContribution({kind:'kaizen',title:'Proposition de septembre',description:'Étudiée en octobre'});
 f.set('2026-10-01T09:00:00+01:00');f.e.reviewContribution(id,'validated');const s=f.e.snapshot();assert.equal(s.kaizen.submitted,0);assert.equal(s.kaizen.validated,1);assert.equal(s.kaizen.teams.find(t=>t.id===1)!.validated,0);f.db.close();
});
