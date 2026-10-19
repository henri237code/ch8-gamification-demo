import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
function setup(){const db=openDatabase(':memory:'),e=new Engine(db,()=>Date.parse('2026-10-10T14:15:00+01:00'));e.initialize();return {db,e};}
test('Volumes en hectolitres : contenance réelle, objectifs équivalents et points inchangés',()=>{
 const f=setup();f.e.startScenario(1);const a=f.e.snapshot();
 assert.equal(a.production!.volumeHl,a.production!.total*650/100000);
 assert.equal(a.production!.targetHl,a.production!.target*650/100000);
 assert.ok(Math.abs(a.monthlyMission.volumeHl-a.monthlyMission.total*650/100000)<1e-8);
 assert.equal(a.monthlyMission.targetHl,a.monthlyMission.target*650/100000);
 const points=a.production!.score;
 // Different container size on a separate fixture order: weighted physical totals,
 // never a silent 65 cl conversion for the whole month.
 f.db.prepare("INSERT INTO products VALUES (99,'TEST50','Test 50 cl',500,NULL)").run();
 const order=f.db.prepare('SELECT w.id FROM work_orders w WHERE w.run_id=? AND w.id NOT IN (SELECT g.work_order_id FROM shift_order_segments g WHERE g.shift_id=?) LIMIT 1').get(a.runId,a.shift!.id) as {id:number};
 f.db.prepare('UPDATE work_orders SET product_id=99 WHERE id=?').run(order.id);
 const b=f.e.snapshot();assert.equal(b.production!.score,points);assert.equal(b.production!.volumeHl,a.production!.volumeHl);
 assert.equal(b.monthlyMission.targetHl,null);assert.ok(b.monthlyMission.volumeHl<a.monthlyMission.volumeHl);
 const expected=f.db.prepare(`SELECT SUM(p.total_bottles*pr.bottle_ml)/100000.0 hl FROM production_intervals p JOIN shift_order_segments g ON g.id=p.segment_id JOIN work_orders w ON w.id=g.work_order_id JOIN products pr ON pr.id=w.product_id JOIN shifts s ON s.id=g.shift_id WHERE s.run_id=? AND p.starts_at>=? AND p.ends_at<=?`).get(b.runId,b.monthlyMission.periodStart,b.at) as {hl:number};
 assert.ok(Math.abs(b.monthlyMission.volumeHl-expected.hl)<1e-8);f.db.close();
});
