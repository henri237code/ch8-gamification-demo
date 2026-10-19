import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {Engine as UnplannedEngine} from '../src/engine.js';
import {createApp} from '../src/app.js';
import {performance,fieldRate,roundScore} from '../src/field-calibration.js';
import {shiftReport} from '../src/shift-reports.js';
import {Programming} from '../src/programming.js';
function setup(){let now=Date.parse('2026-10-15T12:30:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);return {db,e,set:(value:number)=>{now=value;}};}
test('Calibrage : volumes terrain, objectif, score, bonus et rapports cohérents après redémarrage',()=>{
 const f=setup();f.e.enableFieldCalibration();f.e.initialize();let state=f.e.snapshot();
 assert.equal(state.production.target,220000);assert.equal(state.production.scoreDivisor,100);
 assert.equal(state.production.productionPoints,roundScore(state.production.total/100));
 assert.equal(state.production.score,roundScore(state.production.productionPoints+state.production.totalBonus));
 assert.equal(state.performance?.nominalBph,45000);assert.equal(f.e.catalogs().expressChallenges[0].target,9000);
 const rows=f.db.prepare("SELECT id FROM shifts WHERE status='completed' AND run_id=?").all(state.runId) as {id:number}[];
 for(const {id} of rows){const r=shiftReport(f.db,id);assert.ok(r.bottles>115000&&r.bottles<260000,r.bottles.toString());assert.equal(r.hourly.reduce((n,h)=>n+h.bottles,0),r.bottles);assert.equal(r.hl,roundScore(r.bottles*650/100000));assert.equal(r.score,roundScore(r.scores.reduce((n,s)=>n+s.points,0)));assert.equal(r.scoreDivisor,100);assert.ok(r.downtimeSeconds<=8*3600);}
 const before=state.production;new Engine(f.db,()=>Date.parse(state.at)).initialize();assert.deepEqual(f.e.snapshot().production,before);
 assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('Normalisation unique : objectifs manuels futurs, quart courant et histoire conservée',()=>{
 const f=setup();f.e.initialize();const before=f.e.snapshot();const completed=f.db.prepare("SELECT * FROM score_events WHERE shift_id IN (SELECT id FROM shifts WHERE status='completed') ORDER BY id").all();
 new Programming(f.db,()=>Date.parse(before.at)).save({kind:'target',target:16000,startsAt:'2026-10-15T14:10:00+01:00',endsAt:'2026-10-15T14:20:00+01:00'});
 f.e.enableFieldCalibration();let after=f.e.snapshot();assert.equal(after.production.total,before.production.total);assert.equal(after.production.target,220000);assert.equal(after.production.scoreDivisor,100);
 assert.deepEqual(f.db.prepare("SELECT * FROM score_events WHERE shift_id IN (SELECT id FROM shifts WHERE status='completed') ORDER BY id").all(),completed);
 assert.equal(JSON.parse((f.db.prepare("SELECT payload_json FROM admin_programs WHERE kind='target'").get() as any).payload_json).target,220000);
 f.e.enableFieldCalibration();assert.equal((f.db.prepare('SELECT COUNT(*) n FROM production_calibrations').get() as any).n,1);
 f.set(Date.parse('2026-10-15T14:15:00+01:00'));after=f.e.snapshot();assert.equal(after.production.target,220000);assert.ok(after.production.total>3000);assert.equal(after.calibration?.legacyTrajectory,false);f.db.close();
});
test('Rendement provisoire : dénominateur horaire nominal, seuil 60 % et absence de division par zéro',()=>{
 const c={nominal_bph:45000,yellow:.6,green:.75,blue:.9};assert.equal(performance(26999,3600,c).color,'red');assert.equal(performance(27000,3600,c).color,'yellow');assert.equal(performance(28000,3600,c).color,'yellow');assert.equal(performance(33750,3600,c).color,'green');assert.equal(performance(40500,3600,c).color,'blue');assert.equal(performance(45000,0,c).percent,null);assert.equal(performance(27000,3600,c).percent,60);assert.equal(roundScore(100000/100+50),1050);
 assert.equal(fieldRate('2026-10-15T05:00:00.000Z',1,101,40),fieldRate('2026-10-15T05:00:00.000Z',1,101,40));
});
test('Rapport : authentification, quarts terminés uniquement et horaires sans double comptage des arrêts',async()=>{
 const f=setup();f.e.enableFieldCalibration();f.e.initialize();const s=f.e.snapshot();const id=(f.db.prepare("SELECT id FROM shifts WHERE status='completed' ORDER BY id DESC LIMIT 1").get() as any).id;
 const r=shiftReport(f.db,id);f.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,ends_at,affects_line) VALUES (?,?,4,1,?,?,1)').run(s.runId,id,r.startsAt,new Date(Date.parse(r.startsAt)+3600000).toISOString());f.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,ends_at,affects_line) VALUES (?,?,4,1,?,?,1)').run(s.runId,id,r.startsAt,new Date(Date.parse(r.startsAt)+1800000).toISOString());assert.ok(shiftReport(f.db,id).downtimeSeconds<=r.downtimeSeconds+3600);
 const app=createApp(f.e,'test');await request(app).get(`/api/manager/shifts/${id}/report`).expect(401);await request(app).get(`/api/manager/shifts/${id}/report`).set('Authorization','Bearer test').expect(200);await request(app).get(`/api/manager/shifts/${s.shift.id}/report`).set('Authorization','Bearer test').expect(400);f.db.close();
});
test('Les mini-défis recalibrés gardent les primes de 50 points et le plafond de 100',()=>{
 const f=setup();f.e.enableFieldCalibration();f.e.initialize();f.e.startGuide(1,1);const s=f.e.snapshot();const sprint=s.challenges.find(c=>c.presetCode==='sprint')!;assert.equal(sprint.target,9000);assert.equal(sprint.proposedBonus,50);assert.equal(sprint.bonusCapPerShift,100);
 f.e.control('skip',undefined,undefined,20);const after=f.e.snapshot();assert.equal(after.production.score,roundScore(after.production.total/100+after.production.totalBonus));assert.ok(after.production.challengeBonus<=100);
 const eventCount=(f.db.prepare("SELECT COUNT(*) n FROM score_events WHERE kind='challenge_bonus'").get() as any).n;f.e.snapshot();assert.equal((f.db.prepare("SELECT COUNT(*) n FROM score_events WHERE kind='challenge_bonus'").get() as any).n,eventCount);f.db.close();
});
test('Les quatre parcours restent jouables avec les volumes et défis recalibrés',()=>{
 const f=setup();f.e.enableFieldCalibration();f.e.initialize();
 for(const guide of [1,2,3,5]){
  f.e.startGuide(guide,2);let s=f.e.snapshot(),guard=0;
  while(!s.guidedScenario!.complete&&guard++<12){
   if(s.guidedScenario!.awaitingManager){const id=s.guidedScenario!.contributionId!;if(guide===2)f.e.reviewContribution(id,'acknowledged');f.e.reviewContribution(id,'validated','Validation du test');if(guide===2)f.e.reviewContribution(id,'resolved','Reprise du test');}
   s=f.e.snapshot();f.e.guideNext(s.runId,s.guidedScenario!.position);s=f.e.snapshot();
  }
  assert.equal(s.guidedScenario!.complete,true);assert.ok(s.production.total>=0);
 }
 f.db.close();
});
test('Objectif mensuel normalisé une fois ; catalogue recalibré aussi sans quart planifié',()=>{
 const f=setup();f.e.initialize();f.e.setPeriodTarget('monthly_production',1400000);f.e.enableFieldCalibration();assert.equal(f.e.snapshot().monthlyMission.target,31*3*220000);
 f.e.setPeriodTarget('monthly_production',20000000);f.e.enableFieldCalibration();assert.equal(f.e.snapshot().monthlyMission.target,20000000);f.db.close();
 const db=openDatabase(':memory:'),e=new UnplannedEngine(db,()=>Date.parse('2026-10-15T12:30:00+01:00'));e.enableFieldCalibration();e.initialize();assert.equal(e.snapshot().shift,null);assert.equal(e.catalogs().expressChallenges[0].target,9000);db.close();
});
