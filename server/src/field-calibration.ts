import type {DB} from './db.js';
import {calibratedPreset} from './express-presets.js';
import {HOUR,MINUTE,iso,shiftAt} from './time.js';
export type Calibration={id:number;effective_from:string;created_at:string;nominal_bph:number;base_target:number;yellow:number;green:number;blue:number;formula:string;provisional:number};
// Anonymous hourly shapes from CH08 reports only. CH16 and ambiguous reports are excluded.
export const FIELD_HOURS=[
 [8202,0,3877,29603,28111,29493,17889,29096],
 [4377,4166,15548,19242,23107,20826,17186,21578],
 [19235,19894,17906,20112,18786,17067,22634,16307],
 [18853,28404,27165,4622,0,29107,31642,16517],
 [27569,16315,11445,0,27706,28568,27806,26423],
 [24212,13325,29385,13373,27355,32191,22323,20492],
 [28303,29357,16379,29999,17524,20927,25935,28162],
 [26670,28106,34188,33090,29528,30381,26624,25767],
 [27314,280,23,13652,31662,20942,22515,20286]
];
function hash(key:string){let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;}
export function fieldShape(start:string,team:number,seed:number){return FIELD_HOURS[hash(`${start}:${team}:${seed}:field-v1`)%FIELD_HOURS.length];}
export function fieldRate(start:string,team:number,seed:number,minute:number){
 const h=hash(`${start}:${team}:${seed}:field-v1`),hour=Math.min(7,Math.max(0,Math.floor(minute/60)));
 const shiftFactor=.97+(h%10)/100;
 // Every complete hour has a centered minute variation; deterministic on restart.
 const ripple=1+((minute%60)-29.5)/295;
 return fieldShape(start,team,seed)[hour]*shiftFactor*ripple;
}
export const roundScore=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function performance(total:number,seconds:number,c:Pick<Calibration,'nominal_bph'|'yellow'|'green'|'blue'>){
 const theoretical=c.nominal_bph*Math.max(0,seconds)/3600;
 const ratio=theoretical>0?total/theoretical:null;
 return {ratio,percent:ratio===null?null:roundScore(ratio*100),theoretical:Math.round(theoretical),nominalBph:c.nominal_bph,
   color:ratio===null?'unknown':ratio<c.yellow?'red':ratio<c.green?'yellow':ratio<c.blue?'green':'blue',
   provisional:true,formula:'production / (cadence nominale × durée écoulée)',thresholds:{yellow:c.yellow,green:c.green,blue:c.blue},thresholdsProvisional:true};
}
export class FieldCalibration {
 constructor(private db:DB,private clock:()=>number){}
 latest(){return this.db.prepare('SELECT * FROM production_calibrations ORDER BY id DESC LIMIT 1').get() as Calibration|undefined;}
 get(id:number|null|undefined){return id?this.db.prepare('SELECT * FROM production_calibrations WHERE id=?').get(id) as Calibration:undefined;}
 enable(){
  const current=this.latest();if(current)return current;
  const normal=this.db.prepare('SELECT run_id FROM normal_simulation WHERE singleton=1').get();
  const effective=normal?iso(shiftAt(this.clock()).end):'1970-01-01T00:00:00.000Z';
  this.db.transaction(()=>{
   this.db.prepare(`INSERT INTO production_calibrations(effective_from,created_at,nominal_bph,base_target,yellow,green,blue,formula) VALUES (?,?,45000,220000,.6,.75,.9,'production / (cadence nominale × durée écoulée)')`).run(effective,iso(this.clock()));
   this.db.prepare(`INSERT OR IGNORE INTO scoring_rule_versions(id,name,version,rules_json,provisional,created_at) VALUES (2,'Production par cent bouteilles',2,?,1,?)`).run(JSON.stringify({bottlePoints:.01,overTargetPer100:.1,qualityBonus:50,challengeCap:100,provisional:true}),effective);
   // One-time explicit normalization requested by the user; completed periods stay immutable.
   this.db.prepare(`INSERT INTO production_target_defaults(target,effective_from,created_at) VALUES (220000,?,?) ON CONFLICT(effective_from) DO UPDATE SET target=220000`).run(effective,iso(this.clock()));
   this.db.prepare('UPDATE production_target_defaults SET target=220000 WHERE effective_from>=?').run(effective);
   const programs=this.db.prepare("SELECT id,payload_json FROM admin_programs WHERE kind='target' AND cancelled_at IS NULL AND ends_at>?").all(iso(this.clock())) as {id:number;payload_json:string}[];
   for(const p of programs)this.db.prepare('UPDATE admin_programs SET payload_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(p.payload_json),target:220000}),p.id);
   this.db.prepare(`UPDATE admin_program_receipts SET baseline_target=220000 WHERE finished_at IS NULL AND program_id IN (SELECT id FROM admin_programs WHERE kind='target' AND ends_at>?)`).run(iso(this.clock()));
   const monthly=this.db.prepare("SELECT * FROM manager_targets WHERE kind='monthly_production' AND enabled=1 AND valid_until>?").all(iso(this.clock())) as any[];
   for(const m of monthly){
    const value=Math.round((Date.parse(m.valid_until)-Date.parse(m.valid_from))/(24*HOUR))*3*220000;
    this.db.prepare('UPDATE manager_targets SET enabled=0 WHERE id=?').run(m.id);
    this.db.prepare(`INSERT INTO manager_targets(line_id,kind,target_value,unit,valid_from,valid_until,created_by,created_at,run_scope) VALUES (1,'monthly_production',?,'bottles',?,?,1,?,?)`).run(value,m.valid_from,m.valid_until,iso(this.clock()),m.run_scope);
   }
   const active=this.db.prepare(`SELECT sh.id,sh.run_id,r.simulated_at,s.id segment_id FROM shifts sh JOIN simulation_runs r ON r.id=sh.run_id JOIN shift_order_segments s ON s.shift_id=sh.id WHERE sh.status='active' AND r.id IN (SELECT run_id FROM normal_simulation UNION SELECT run_id FROM active_simulation)`).all() as {id:number;run_id:number;simulated_at:string;segment_id:number}[];
   for(const sh of active){
    this.db.prepare('UPDATE shifts SET score_divisor=100,calibration_id=1,calibrated_from=? WHERE id=?').run(iso(Math.ceil(Date.parse(sh.simulated_at)/MINUTE)*MINUTE),sh.id);
    const challenges=this.db.prepare("SELECT id,target_good_bottles,rules_snapshot_json FROM challenge_instances WHERE shift_id=? AND status IN ('ready','active')").all(sh.id) as any[];
    for(const x of challenges){const rules=JSON.parse(x.rules_snapshot_json);if(!rules.presetCode)continue;const p=calibratedPreset({code:rules.presetCode,target_value:x.target_good_bottles,description:rules.description??'',rules_json:JSON.stringify(rules)});this.db.prepare('UPDATE challenge_instances SET target_good_bottles=?,rules_snapshot_json=? WHERE id=?').run(p.target_value,JSON.stringify({...JSON.parse(p.rules_json),description:p.description}),x.id);}

    this.db.prepare(`INSERT INTO target_applications(run_id,segment_id,kind,effective_value,unit,applied_at,source) VALUES (?,?,'shift_production',220000,'bottles',?,'manager')`).run(sh.run_id,sh.segment_id,sh.simulated_at);
   }
   this.db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,'field_calibration','production_calibrations',1,?,?)`).run(JSON.stringify({effectiveFrom:effective,target:220000,programs:programs.length,productionPointsPerBottle:.01,preservedCompletedHistory:true}),iso(this.clock()));
  })();return this.latest()!;
 }
 forShift(run:{clock_mode:string;calibration_id?:number|null},at:number){
  if(run.clock_mode==='scenario')return this.get(run.calibration_id);
  return this.db.prepare('SELECT * FROM production_calibrations WHERE effective_from<=? ORDER BY id DESC LIMIT 1').get(iso(at)) as Calibration|undefined;
 }
}
