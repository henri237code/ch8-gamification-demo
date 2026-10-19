import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';

test('Tendance sept jours : chaque équipe a des hausses et des baisses, stables après redémarrage',()=>{
 const now=Date.parse('2026-10-20T23:45:00+01:00');
 const db=openDatabase(':memory:'),engine=new Engine(db,()=>now);engine.initialize();
 const state=engine.snapshot();
 for(const team of state.trends) {
  const values=team.days.map(d=>d.averageScore).filter((v):v is number=>v!==null);
  assert.ok(values.length>=6);
  assert.ok(new Set(values).size>=5,team.name);
  assert.ok(Math.max(...values)-Math.min(...values)>1000,team.name);
  const deltas=values.slice(1).map((v,i)=>v-values[i]);
  assert.ok(deltas.some(d=>d>0)&&deltas.some(d=>d<0),team.name);
 }
 const restarted=new Engine(db,()=>now);restarted.initialize();
 assert.deepEqual(restarted.snapshot().trends,state.trends);
 assert.deepEqual(restarted.snapshot().production,state.production);
 db.close();
});

test('Variation : les résultats dépendent des événements, aucune production négative ni rejet supérieur au volume',()=>{
 const now=Date.parse('2026-10-20T23:45:00+01:00');
 const db=openDatabase(':memory:'),engine=new Engine(db,()=>now);engine.initialize();
 const run=engine.snapshot().runId;
 const invalid=db.prepare(`SELECT COUNT(*) n FROM production_intervals p JOIN simulation_events e ON e.id=p.event_id WHERE e.run_id=? AND (p.total_bottles<0 OR p.rejected_bottles<0 OR p.rejected_bottles>p.total_bottles)`).get(run) as {n:number};
 assert.equal(invalid.n,0);
 const count=db.prepare('SELECT COUNT(*) n FROM production_intervals').get() as {n:number};
 engine.snapshot();assert.equal((db.prepare('SELECT COUNT(*) n FROM production_intervals').get() as {n:number}).n,count.n);
 db.close();
});
