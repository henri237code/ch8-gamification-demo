import type {DB} from './db.js';
import {InputError} from './errors.js';
import {HOUR,iso} from './time.js';
import {FieldCalibration,performance,roundScore} from './field-calibration.js';
export function shiftReport(db:DB,id:number){
 const shift=db.prepare(`SELECT sh.*,t.name team,st.name template FROM shifts sh JOIN teams t ON t.id=sh.team_id JOIN shift_templates st ON st.id=sh.template_id WHERE sh.id=?`).get(id) as any;
 if(!shift||shift.status!=='completed')throw new InputError('Rapport disponible uniquement pour un quart terminé et enregistré.');
 const start=Date.parse(shift.starts_at),end=Date.parse(shift.ends_at);
 const calibration=new FieldCalibration(db,Date.now).get(shift.calibration_id);
 const segments=db.prepare(`SELECT s.id,s.target_good_bottles,p.name product,p.bottle_ml FROM shift_order_segments s JOIN work_orders w ON w.id=s.work_order_id JOIN products p ON p.id=w.product_id WHERE s.shift_id=?`).all(id) as any[];
 const totals=db.prepare(`SELECT COALESCE(SUM(p.total_bottles),0) bottles,COALESCE(SUM(p.rejected_bottles),0) rejected,COALESCE(SUM(p.total_bottles*pr.bottle_ml),0)/100000.0 hl FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id JOIN work_orders w ON w.id=s.work_order_id JOIN products pr ON pr.id=w.product_id WHERE s.shift_id=?`).get(id) as {bottles:number;rejected:number;hl:number};
 const scores=db.prepare('SELECT kind,SUM(points) points FROM score_events WHERE shift_id=? GROUP BY kind').all(id) as {kind:string;points:number}[];
 const stops=db.prepare(`SELECT x.id,x.starts_at,x.ends_at,x.affects_line,m.name machine,r.label reason FROM stoppages x LEFT JOIN machines m ON m.id=x.machine_id JOIN stop_reasons r ON r.id=x.reason_id WHERE x.run_id=? AND x.starts_at<? AND (x.ends_at IS NULL OR x.ends_at>?) ORDER BY x.starts_at`).all(shift.run_id,shift.ends_at,shift.starts_at) as any[];
 let covered=start,downtime=0;
 for(const stop of stops.filter(s=>s.affects_line)){const a=Math.max(start,Date.parse(stop.starts_at)),b=Math.min(end,stop.ends_at?Date.parse(stop.ends_at):end);downtime+=Math.max(0,b-Math.max(a,covered));covered=Math.max(covered,b);}
 const hourly=Array.from({length:Math.ceil((end-start)/HOUR)},(_,h)=>{
  const a=start+h*HOUR,b=Math.min(a+HOUR,end);
  const v=db.prepare(`SELECT COALESCE(SUM(p.total_bottles),0) bottles FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id WHERE s.shift_id=? AND p.starts_at>=? AND p.ends_at<=?`).get(id,iso(a),iso(b)) as {bottles:number};
  return {startsAt:iso(a),endsAt:iso(b),bottles:v.bottles,performance:calibration?performance(v.bottles,(b-a)/1000,calibration):null};
 });
 const anomalies=db.prepare(`SELECT id,title,description,status,origin FROM contributions WHERE kind='anomaly' AND submitted_shift_id=? AND (run_id=? OR (origin='manager' AND run_id IS NULL)) ORDER BY occurred_at`).all(id,shift.run_id);
 const target=segments.reduce((sum,s)=>sum+((db.prepare('SELECT effective_value FROM target_applications WHERE segment_id=? AND kind=\'shift_production\' ORDER BY applied_at DESC,id DESC LIMIT 1').get(s.id) as any)?.effective_value??s.target_good_bottles),0);
 return {id,team:shift.team,template:shift.template,startsAt:shift.starts_at,endsAt:shift.ends_at,products:segments.map(s=>s.product),target,...totals,hl:roundScore(totals.hl),score:roundScore(scores.reduce((s,x)=>s+x.points,0)),scoreDivisor:shift.score_divisor,scores,hourly,downtimeSeconds:downtime/1000,stops:stops.map(s=>({...s,seconds:Math.max(0,Math.min(end,s.ends_at?Date.parse(s.ends_at):end)-Math.max(start,Date.parse(s.starts_at)))/1000})),anomalies,performance:calibration?performance(totals.bottles,(end-start)/1000,calibration):null,simulated:true,mechanics:null};
}
