import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {MINUTE} from '../src/time.js';
const at=(s:string)=>Date.parse(`${s}+01:00`);

test('Reprise au même instant : un arrêt de durée nulle ne reste pas ouvert',()=>{
  let now=at('2026-10-02T14:15:07');
  const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
  e.startScenario(2);e.control('pause');
  e.control('stop');e.control('restart');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM stoppages WHERE reason_id=2 AND ends_at IS NULL').get() as {n:number}).n,0);
  e.control('resume');const before=e.snapshot().production.total;now+=MINUTE;
  assert.ok(e.snapshot().production.total>before);db.close();
});

test('Ouverture à heures quelconques : même production qu’une simulation déjà en cours',()=>{
  let now=at('2026-10-02T00:00:00');
  const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
  for(const time of ['02:43:19','06:00:00','07:23:41','14:15:07','21:37:52','22:00:00','23:12:58']) {
    now=at(`2026-10-02T${time}`);const continuous=e.snapshot();
    const freshDb=openDatabase(':memory:'),fresh=new Engine(freshDb,()=>now);fresh.initialize();const opened=fresh.snapshot();
    assert.equal(opened.production.total,continuous.production.total,time);
    assert.equal(opened.production.rejected,continuous.production.rejected,time);
    assert.equal(opened.shift.team_id,continuous.shift.team_id,time);
    assert.equal(opened.daily.total,continuous.daily.total,time);
    assert.equal(opened.monthly.total,continuous.monthly.total,time);
    assert.deepEqual(opened.trends,continuous.trends,time);
    assert.deepEqual(opened.weeklyLeaderboard,continuous.weeklyLeaderboard,time);
    freshDb.close();
  }
  db.close();
});
