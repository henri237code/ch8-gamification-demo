import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
function setup(at='2026-10-10T14:15:00+01:00') {
 let now=Date.parse(at);const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 return {db,e,set:(value:string)=>{now=Date.parse(value);},clock:()=>now};
}
test('Mission mensuelle : total partagé, objectif révisable et persistant sans réécrire la production',()=>{
 const f=setup(),a=f.e.snapshot();assert.equal(a.monthlyMission.total,a.monthly.total);
 assert.equal(a.monthlyMission.teams.reduce((n,t)=>n+t.total,0),a.monthly.total);
 assert.equal(a.monthlyMission.target,31*45000);
 f.e.setPeriodTarget('monthly_production',1_000_000);const b=f.e.snapshot();
 assert.equal(b.monthlyMission.target,1_000_000);assert.equal(b.monthly.total,a.monthly.total);
 const restart=new Engine(f.db,f.clock);restart.initialize();assert.equal(restart.snapshot().monthlyMission.target,1_000_000);
 f.e.startScenario(2);assert.equal(f.e.snapshot().monthlyMission.targetSource,'demo_default');
 f.e.returnNormal();assert.equal(f.e.snapshot().monthlyMission.target,1_000_000);f.db.close();
});
test('Énergie : arrêt immédiat, unités et cible sans modifier les consommations',()=>{
 const f=setup();f.e.startScenario(1);const a=f.e.snapshot();
 f.e.control('stop');const stopped=f.e.snapshot();assert.equal(stopped.machine.state,'stopped');assert.equal(stopped.energy.currentKw,20);
 assert.equal(stopped.production.total,a.production.total);assert.equal(stopped.energy.monthWh,a.energy.monthWh);
 f.e.setPeriodTarget('energy',75.5);assert.equal(f.e.snapshot().energy.targetKw,75.5);
 assert.equal(f.e.snapshot().energy.monthWh,a.energy.monthWh);
 f.e.control('restart');const b=f.e.snapshot();assert.equal(b.energy.currentKw,80);assert.equal(b.machine.state,'running');
 assert.equal(b.energy.monthWh/1000,b.energy.monthKwh);assert.equal(b.energy.curve.length,6);assert.equal(b.energy.previousMonthComparison,null);f.db.close();
});
test('Météo : les réponses historiques ne remplacent pas la définition de l’équipe',()=>{
 const f=setup(),before=f.e.snapshot();f.e.checkIn({responseKey:'demo-person',mood:2});
 const a=f.e.snapshot();assert.equal(a.weather.source,'team_setting');assert.equal(a.weather.mood,before.weather.mood);
 f.db.prepare('DELETE FROM wellbeing_responses WHERE shift_id=?').run(a.shift.id);
 assert.equal(f.e.snapshot().weather.mood,3);assert.equal(f.e.snapshot().weather.fatigue,3);f.db.close();
});
test('Kaizen : validation et résolution comptées une fois, anomalies exclues, scénario isolé',()=>{
 const f=setup();const id=f.e.submitContribution({kind:'kaizen',title:'Améliorer',description:'Idée test'});
 f.e.submitContribution({kind:'anomaly',title:'Incident',description:'Test'});
 assert.equal(f.e.snapshot().kaizen.submitted,1);f.e.reviewContribution(id,'acknowledged');f.e.reviewContribution(id,'validated');f.e.reviewContribution(id,'resolved');
 assert.equal(f.e.snapshot().kaizen.validated,1);f.e.startScenario(2);
 const temp=f.e.submitContribution({kind:'kaizen',title:'Simulation',description:'Idée temporaire'},'simulation');
 f.e.reviewContribution(temp,'acknowledged');f.e.reviewContribution(temp,'validated');assert.equal(f.e.snapshot().kaizen.validated,2);
 f.e.returnNormal();assert.equal(f.e.snapshot().kaizen.submitted,1);assert.equal(f.e.snapshot().kaizen.validated,1);f.db.close();
});
test('Début de mois : aucune quantité future, moyenne énergétique absente au premier instant',()=>{
 const f=setup('2026-11-01T00:00:00+01:00');const s=f.e.snapshot();
 assert.equal(s.monthlyMission.total,0);assert.equal(s.monthly.total,0);assert.equal(s.energy.monthWh,0);assert.equal(s.energy.monthAverageKw,null);
 assert.equal(s.monthlyMission.target,30*45000);assert.ok(s.production.total>0);f.db.close();
});
test('API indicateurs : accès contrôlé et saisies invalides refusées',async()=>{
 const f=setup(),app=createApp(f.e,'test');await request(app).post('/api/manager/period-target').send({kind:'energy',value:70}).expect(401);
 for(const body of [{kind:'other',value:1},{kind:'monthly_production',value:1.5},{kind:'energy',value:0}]) await request(app).post('/api/manager/period-target').set('Authorization','Bearer test').send(body).expect(400);
 await request(app).post('/api/manager/check-in').set('Authorization','Bearer test').send({responseKey:'fiction-1',mood:5}).expect(410);
 await request(app).post('/api/manager/check-in').set('Authorization','Bearer test').send({responseKey:'person',mood:3,fatigue:2}).expect(410);
 await request(app).post('/api/manager/period-target').set('Authorization','Bearer test').send({kind:'monthly_production',value:900000}).expect(200);f.db.close();
});
test('Consommations 4D : ratios explicites, trois unités, historique conservé après reprise',()=>{
 const f=setup();f.e.startScenario(1);const a=f.e.snapshot();
 assert.deepEqual(a.resources.series.map(r=>r.code),['co2','water','air']);
 assert.deepEqual(a.resources.series.map(r=>r.unit),['kg','m³','Nm³']);
 for(const r of a.resources.series){assert.equal(r.total,a.monthly.total*r.perBottle);assert.equal(r.curve.length,6);}
 f.e.control('stop');assert.deepEqual(f.e.snapshot().resources,a.resources);
 const restart=new Engine(f.db,f.clock);restart.initialize();assert.deepEqual(restart.snapshot().resources,a.resources);f.db.close();
});
