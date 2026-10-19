// Existing production tests explicitly exercise a scheduled factory.
// Unscheduled-policy tests import the actual Engine directly.
import {Engine as BaseEngine} from '../src/engine.js';
import type {DB} from '../src/db.js';
import {DAY,HOUR,historyStart,iso,localMidnight,shiftAt} from '../src/time.js';
export class Engine extends BaseEngine {
 constructor(db:DB,clock:()=>number=Date.now) {
  super(db,clock);
  if(!db.prepare('SELECT 1 FROM normal_simulation').get()) {
   const start=historyStart(clock()),end=localMidnight(clock())+45*DAY;
   const insert=db.prepare('INSERT OR IGNORE INTO team_schedule(line_id,template_id,team_id,starts_at,ends_at,created_by,created_at,updated_at) VALUES (1,?,?,?,?,1,?,?)');
   db.transaction(()=>{for(let at=start;at<end;at+=8*HOUR){const s=shiftAt(at),day=Math.floor(localMidnight(s.start)/DAY),team=((day+s.index)%3+3)%3+1;insert.run(s.templateId,team,iso(s.start),iso(s.end),iso(clock()),iso(clock()));}})();
  }
 }
 override snapshot() {
  const s=super.snapshot();
  if(!s.shift||!s.production||!s.weather)throw new Error('Ce test attend un quart explicitement planifié');
  return {...s,shift:s.shift,production:s.production,weather:s.weather};
 }
}
