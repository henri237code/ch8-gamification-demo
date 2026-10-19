import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {LineRecords} from '../src/records.js';
import {HOUR,MINUTE,iso} from '../src/time.js';
function setup(at='2026-10-10T14:15:30+01:00') {
 let now=Date.parse(at);const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 return {db,e,set:(n:number)=>{now=n;},now:()=>now};
}
test('Records physiques : cadence minute entière, unités, stabilité et objectifs indépendants',()=>{
 const f=setup(),s=f.e.snapshot(),r=s.lineRecords;
 const expected=f.db.prepare(`SELECT MAX(p.total_bottles)*60 value FROM production_intervals p JOIN simulation_events ev ON ev.id=p.event_id
 WHERE ev.run_id=? AND unixepoch(p.ends_at)-unixepoch(p.starts_at)=60`).get(s.runId) as {value:number};
 assert.equal(r.cadence?.value,expected.value);assert.equal(r.cadence?.unit,'bottles/hour');
 assert.deepEqual(f.e.snapshot().lineRecords,r);f.e.setTarget(16000);assert.deepEqual(f.e.snapshot().lineRecords,r);
 assert.ok(r.continuousProduction!.value>0);assert.equal(r.monthlyEfficiency.bestCompletedMonth,null);
 const m=r.monthlyEfficiency.current!;assert.equal(m.value,100*m.good/m.capacity);assert.equal(m.complete,false);f.db.close();
});
test('Continuité traverse les quarts, fusionne les arrêts et exclut le futur',()=>{
 const f=setup(),s=f.e.snapshot(),start=Date.parse(s.history.from);
 f.db.prepare('DELETE FROM stoppages WHERE run_id=?').run(s.runId);
 const insert=f.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,ends_at,affects_line) VALUES (?,?,4,1,?,?,1)');
 insert.run(s.runId,s.shift.id,iso(start+2*HOUR),iso(start+3*HOUR));
 insert.run(s.runId,s.shift.id,iso(start+2.5*HOUR),iso(start+4*HOUR));
 insert.run(s.runId,s.shift.id,iso(f.now()+MINUTE),iso(f.now()+HOUR));
 const r=new LineRecords(f.db).snapshot(s.runId,f.now()).continuousProduction!;
 assert.equal(r.startsAt,iso(start+4*HOUR));assert.equal(r.value,(f.now()-start-4*HOUR)/1000);assert.equal(r.ongoing,true);
 insert.run(s.runId,s.shift.id,iso(f.now()),null);
 assert.equal(new LineRecords(f.db).snapshot(s.runId,f.now()).continuousProduction!.ongoing,false);f.db.close();
});
test('Mois complet après rattrapage : record éligible, nuit correctement découpée et redémarrage identique',()=>{
 const f=setup('2026-10-01T00:00:00+01:00');assert.equal(f.e.snapshot().lineRecords.monthlyEfficiency.current,null);
 f.set(Date.parse('2026-11-01T00:00:00+01:00'));const s=f.e.snapshot();
 const best=s.lineRecords.monthlyEfficiency.bestCompletedMonth!;assert.equal(best.month,'2026-10');assert.equal(best.observedSeconds,31*24*3600);
 assert.equal(best.complete,true);assert.equal(s.lineRecords.monthlyEfficiency.current,null);
 const restarted=new Engine(f.db,f.now);restarted.initialize();assert.deepEqual(restarted.snapshot().lineRecords,s.lineRecords);f.db.close();
});
test('Un scénario ne modifie pas les records du mode normal',()=>{
 const f=setup(),normal=f.e.snapshot().lineRecords;f.e.startScenario(2);const scenario=f.e.snapshot().lineRecords;
 assert.notEqual(scenario.runId,normal.runId);f.e.returnNormal();assert.deepEqual(f.e.snapshot().lineRecords,normal);f.db.close();
});
