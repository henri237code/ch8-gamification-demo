import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {MINUTE} from '../src/time.js';
function setup(){let now=Date.parse('2026-10-10T14:10:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();e.startScenario(1);return {db,e,set:(v:number)=>{now=v;}};}
function launch(f:ReturnType<typeof setup>,code:string){const id=f.e.assignChallenge({presetCode:code});return f.e.snapshot().challenges.find(c=>c.id===id)!;}
test('Catalogue : cinq modèles persistants, textes/règles et visuels locaux disponibles',async()=>{
 const f=setup(),app=createApp(f.e,'test'),catalog=f.e.catalogs().expressChallenges;assert.equal(catalog.length,5);
 assert.equal(catalog[0].target,500);assert.equal(catalog[0].durationMinutes,20);assert.equal(catalog[0].rules.noStops,true);
 for(const p of catalog){assert.ok(p.description&&p.badgeTitle);await request(app).get(p.badgeAssetPath).expect('Content-Type',/svg/).expect(200);await request(app).get(p.cardAssetPath).expect(200);}
 new Engine(f.db,f.e.clock).initialize();assert.deepEqual(f.e.catalogs().expressChallenges,catalog);
 await request(app).post('/api/manager/challenge').send({presetCode:'quality'}).expect(401);
 await request(app).post('/api/manager/challenge').set('Authorization','Bearer test').send({presetCode:'quality'}).expect(201);
 assert.throws(()=>f.e.assignChallenge({presetCode:'unknown'}));assert.throws(()=>f.e.assignChallenge({presetCode:'sprint',target:1}));f.db.close();
});
test('Sprint : 500 bouteilles avec arrêt court reste manqué, sans arrêt badge gagné une seule fois',()=>{
 const f=setup(),c=launch(f,'sprint');f.e.control('stop');f.set(Date.parse(c.startsAt)+MINUTE);f.e.control('restart');f.set(Date.parse(c.endsAt));
 const failed=f.e.snapshot().challenges.find(x=>x.id===c.id)!;assert.ok(failed.value>=500);assert.equal(failed.status,'missed');assert.equal(failed.badgeEarned,false);assert.equal(failed.awardedBonus,0);
 f.e.startScenario(1);const next=launch(f,'sprint');f.set(Date.parse(next.endsAt));const won=f.e.snapshot().challenges.find(x=>x.id===next.id)!;
 assert.equal(won.status,'won');assert.equal(won.badgeEarned,true);assert.equal(won.badgeAssetPath,'/challenges/sprint.svg');
 const count=()=>f.db.prepare('SELECT COUNT(*) n FROM score_events WHERE challenge_id=?').get(next.id);const before=count();f.e.snapshot();new Engine(f.db,f.e.clock).initialize();assert.deepEqual(count(),before);f.db.close();
});
test('Qualité et régularité : critères spécifiques issus des mesures, pas seulement le volume global',()=>{
 const f=setup(),q=launch(f,'quality');f.set(Date.parse(q.endsAt));assert.equal(f.e.snapshot().challenges.find(x=>x.id===q.id)!.status,'won');
 f.e.startScenario(1);const bad=launch(f,'quality');f.set(Date.parse(bad.endsAt));f.e.snapshot();
 f.db.prepare(`UPDATE production_intervals SET rejected_bottles=CAST(total_bottles*0.02+1 AS INTEGER) WHERE starts_at>=? AND ends_at<=? AND segment_id IN (SELECT id FROM shift_order_segments WHERE shift_id=?)`).run(bad.startsAt,bad.endsAt,f.e.snapshot().shift.id);
 f.db.prepare("DELETE FROM score_events WHERE challenge_id=?").run(bad.id);f.db.prepare("UPDATE challenge_instances SET status='active' WHERE id=?").run(bad.id);
 assert.equal(f.e.snapshot().challenges.find(x=>x.id===bad.id)!.status,'missed');
 f.e.startScenario(1);const steady=launch(f,'steady');f.e.control('stop');f.set(Date.parse(steady.startsAt)+5*MINUTE);f.e.control('restart');f.set(Date.parse(steady.endsAt));
 const s=f.e.snapshot().challenges.find(x=>x.id===steady.id)!;assert.equal(s.evaluation.buckets.length,3);assert.equal(s.evaluation.buckets[0].passed,false);assert.equal(s.status,'missed');f.db.close();
});
test('Vigilance et Kaizen : validation dans la fenêtre exigée, déclaration seule sans récompense',()=>{
 const f=setup();
 for(const code of ['vigilance','kaizen']){
  f.e.startScenario(1);const c=launch(f,code);f.set(Date.parse(c.startsAt)+MINUTE);f.e.snapshot();
  const kind=code==='vigilance'?'anomaly':'kaizen',id=f.e.submitContribution({kind,title:'Contribution fictive',description:'Validation du défi'},'simulation');
  assert.equal(f.e.snapshot().challenges.find(x=>x.id===c.id)!.value,0);f.e.reviewContribution(id,'acknowledged');f.e.reviewContribution(id,'validated');
  const active=f.e.snapshot().challenges.find(x=>x.id===c.id)!;assert.equal(active.value,1);assert.equal(active.badgeEarned,false);
  f.set(Date.parse(c.endsAt));const won=f.e.snapshot().challenges.find(x=>x.id===c.id)!;assert.equal(won.status,'won');assert.equal(won.badgeEarned,true);
 }
 f.e.startScenario(1);const missed=launch(f,'vigilance');f.set(Date.parse(missed.startsAt)+MINUTE);f.e.snapshot();const id=f.e.submitContribution({kind:'anomaly',title:'Sans validation',description:'Test'},'simulation');
 f.set(Date.parse(missed.endsAt)+MINUTE);f.e.reviewContribution(id,'acknowledged');f.e.reviewContribution(id,'validated');assert.equal(f.e.snapshot().challenges.find(x=>x.id===missed.id)!.status,'missed');f.db.close();
});
