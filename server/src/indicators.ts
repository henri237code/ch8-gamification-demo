import type {DB} from './db.js';
import {InputError} from './errors.js';
import {DAY,HOUR,iso,monthStart,monthEnd} from './time.js';

type Context={runId:number;at:number;wallAt:number;shiftId:number;teamId:number;stopped:boolean;planned?:boolean;scheduledOnly?:boolean};
type PeriodKind='monthly_production'|'energy';
export class Indicators {
  constructor(private db:DB) {}
  private target(runId:number,at:number,kind:PeriodKind) {
    const start=monthStart(at),end=monthEnd(at);
    const row=this.db.prepare(`SELECT id,target_value,unit FROM manager_targets WHERE run_scope=? AND kind=? AND enabled=1 AND valid_from=? AND valid_until=? ORDER BY id DESC LIMIT 1`)
      .get(runId,kind,iso(start),iso(end)) as {id:number;target_value:number;unit:string}|undefined;
    const calibrated=!!this.db.prepare('SELECT 1 FROM production_calibrations LIMIT 1').get();
    const fallback=kind==='energy'?75:Math.round((end-start)/DAY)*(calibrated?3*220000:45000);
    return {value:row?.target_value??fallback,unit:kind==='energy'?'kW':'bottles',source:row?'manager':'demo_default',id:row?.id??null};
  }
  setTarget(runId:number,at:number,wallAt:number,kind:unknown,value:unknown) {
    if(kind!=='monthly_production'&&kind!=='energy') throw new InputError('Choisir objectif mensuel de production ou puissance énergétique');
    if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>(kind==='energy'?100000:1_000_000_000)||(kind==='monthly_production'&&!Number.isInteger(value))) throw new InputError('Objectif positif requis ; la production utilise un nombre entier de bouteilles');
    const start=iso(monthStart(at)),end=iso(monthEnd(at)),unit=kind==='energy'?'kW':'bottles';
    return this.db.transaction(()=>{
      // Keep prior revisions, but make only one revision effective per run/month/kind.
      this.db.prepare('UPDATE manager_targets SET enabled=0 WHERE run_scope=? AND kind=? AND valid_from=? AND valid_until=? AND enabled=1').run(runId,kind,start,end);
      const id=Number(this.db.prepare(`INSERT INTO manager_targets(line_id,kind,target_value,unit,valid_from,valid_until,created_by,created_at,run_scope) VALUES (1,?,?,?,?,?,1,?,?)`).run(kind,value,unit,start,end,iso(wallAt),runId).lastInsertRowid);
      this.db.prepare(`INSERT INTO target_applications(run_id,manager_target_id,kind,effective_value,unit,applied_at,source) VALUES (?,?,?,?,?,?,'manager')`).run(runId,id,kind,value,unit,iso(at));
      this.db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,'period_target','manager',?,?,?)`).run(id,JSON.stringify({runId,kind,value,start,end,unit}),iso(wallAt));
      return id;
    })();
  }
  checkIn(c:Context,input:{responseKey?:unknown;mood?:unknown;fatigue?:unknown}) {
    if(!input||typeof input.responseKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.responseKey)||input.responseKey.startsWith('fiction-')) throw new InputError('Identifiant de réponse valide requis');
    if(!Number.isInteger(input.mood)||(input.mood as number)<1||(input.mood as number)>5) throw new InputError('Moral entier entre 1 et 5');
    const fatigue=input.fatigue??null;
    if(fatigue!==null&&(!Number.isInteger(fatigue)||(fatigue as number)<1||(fatigue as number)>5)) throw new InputError('Fatigue entière entre 1 et 5, ou non renseignée');
    this.db.prepare(`INSERT INTO wellbeing_responses(shift_id,response_key,mood,fatigue,submitted_at) VALUES (?,?,?,?,?) ON CONFLICT(shift_id,response_key) DO UPDATE SET mood=excluded.mood,fatigue=excluded.fatigue,submitted_at=excluded.submitted_at`)
      .run(c.shiftId,input.responseKey,input.mood,fatigue,iso(c.at));
  }
  weather(c:Context) {
    const v=this.db.prepare('SELECT mood,fatigue,note,source,updated_at FROM team_weather WHERE team_id=?').get(c.teamId) as {mood:number;fatigue:number;note:string;source:string;updated_at:string};
    const icon=v.mood>=4?'sun':v.mood>=3?'partly-cloudy':v.mood>=2?'cloud':'rain';
    const labels={'sun':'Excellent moral','partly-cloudy':'Moral positif','cloud':'Moral mitigé','rain':'Moral à accompagner'};
    return {...v,teamId:c.teamId,source:'team_setting',settingSource:v.source,icon,label:labels[icon],fatigueLevel:v.fatigue<=2?'low':v.fatigue<=3?'moderate':'high',responses:0,fatigueResponses:0,simulated:true};
  }
  monthly(c:Context) {
    const start=monthStart(c.at),end=monthEnd(c.at),target=this.target(c.runId,c.at,'monthly_production');
    const teams=this.db.prepare(`SELECT t.id,t.name,COALESCE(p.total,0) total,COALESCE(p.rejected,0) rejected,COALESCE(p.hl,0) hl FROM teams t LEFT JOIN (
      SELECT sh.team_id,SUM(p.total_bottles) total,SUM(p.rejected_bottles) rejected,SUM(p.total_bottles*pr.bottle_ml)/100000.0 hl FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id JOIN work_orders w ON w.id=s.work_order_id JOIN products pr ON pr.id=w.product_id JOIN shifts sh ON sh.id=s.shift_id
      WHERE sh.run_id=? AND p.starts_at>=? AND p.ends_at<=? GROUP BY sh.team_id) p ON p.team_id=t.id ORDER BY t.id`).all(c.runId,iso(start),iso(c.at)) as {id:number;name:string;total:number;rejected:number;hl:number}[];
    const total=teams.reduce((n,t)=>n+t.total,0),rejected=teams.reduce((n,t)=>n+t.rejected,0);
    const reference=this.db.prepare('SELECT bottle_ml FROM products WHERE id=1').get() as {bottle_ml:number};
    const formats=this.db.prepare(`SELECT MIN(pr.bottle_ml) minMl,MAX(pr.bottle_ml) maxMl FROM production_intervals p JOIN shift_order_segments g ON g.id=p.segment_id JOIN work_orders w ON w.id=g.work_order_id JOIN products pr ON pr.id=w.product_id JOIN shifts sh ON sh.id=g.shift_id WHERE sh.run_id=? AND p.starts_at>=? AND p.ends_at<=?`).get(c.runId,iso(start),iso(c.at)) as {minMl:number|null;maxMl:number|null};
    const targetHl=formats.minMl===null||(formats.minMl===reference.bottle_ml&&formats.maxMl===reference.bottle_ml)?target.value*reference.bottle_ml/100000:null;

    return {periodStart:iso(start),periodEnd:iso(end),asOf:iso(c.at),target:target.value,targetSource:target.source,targetId:target.id,unit:'bottles',total,rejected,volumeHl:teams.reduce((n,t)=>n+t.hl,0),targetHl,referenceBottleMl:reference.bottle_ml,good:total-rejected,
      remaining:Math.max(0,target.value-total),progress:total/target.value,
      teams:teams.map(t=>({...t,good:t.total-t.rejected,share:total?t.total/total:null,contributionToGoal:t.total/target.value}))};
  }
  kaizen(c:Context) {
    const start=iso(monthStart(c.at)),end=iso(monthEnd(c.at));
    const rows=this.db.prepare(`SELECT p.id,p.team_id,p.status,EXISTS(SELECT 1 FROM contribution_reviews r WHERE r.contribution_id=p.id AND r.status='validated'
      AND COALESCE(r.occurred_at,r.reviewed_at)<=CASE r.clock_domain WHEN 'simulation' THEN ? ELSE ? END) validated
      FROM contributions p WHERE p.kind='kaizen' AND (p.run_id IS NULL OR p.run_id=?) AND p.occurred_at>=? AND p.occurred_at<?
      AND p.occurred_at<=CASE p.origin WHEN 'simulation' THEN ? ELSE ? END`).all(iso(c.at),iso(c.wallAt),c.runId,start,end,iso(c.at),iso(c.wallAt)) as {id:number;team_id:number|null;status:string;validated:number}[];
    // Validation month is independent of submission month; an older idea can be approved now.
    const validations=this.db.prepare(`SELECT DISTINCT p.id,p.team_id FROM contributions p JOIN contribution_reviews r ON r.contribution_id=p.id WHERE p.kind='kaizen' AND (p.run_id IS NULL OR p.run_id=?) AND r.status='validated' AND COALESCE(r.occurred_at,r.reviewed_at)>=? AND COALESCE(r.occurred_at,r.reviewed_at)<? AND COALESCE(r.occurred_at,r.reviewed_at)<=CASE r.clock_domain WHEN 'simulation' THEN ? ELSE ? END`).all(c.runId,start,end,iso(c.at),iso(c.wallAt)) as {id:number;team_id:number|null}[];
    const aggregate=(xs:typeof rows,vs:typeof validations)=>({submitted:xs.length,validated:vs.length,inProgress:xs.filter(r=>r.status==='in_progress').length,rejected:xs.filter(r=>r.status==='rejected').length});
    const teams=this.db.prepare('SELECT id,name FROM teams ORDER BY id').all() as {id:number;name:string}[];
    return {periodStart:start,periodEnd:end,asOf:iso(c.at),managerAsOf:iso(c.wallAt),definition:'Idées enregistrées ce mois ; idées validées ce mois, même si proposées auparavant',...aggregate(rows,validations),teams:teams.map(t=>({...t,...aggregate(rows.filter(r=>r.team_id===t.id),validations.filter(r=>r.team_id===t.id))}))};
  }
  resources(c:Context) {
    // Provisional demonstration ratios, not industrial measurements. Derived only
    // from recorded production so restarts and clients receive identical totals.
    const sum=this.db.prepare(`SELECT COUNT(*) samples,COALESCE(SUM(p.total_bottles),0) bottles
      FROM production_intervals p JOIN shift_order_segments g ON g.id=p.segment_id
      JOIN shifts s ON s.id=g.shift_id WHERE s.run_id=? AND p.starts_at>=? AND p.ends_at<=?`);
    const monthly=sum.get(c.runId,iso(monthStart(c.at)),iso(c.at)) as {samples:number;bottles:number};
    const first=Math.floor(c.at/HOUR)*HOUR-5*HOUR;
    const buckets=Array.from({length:6},(_,i)=>{
      const from=first+i*HOUR,to=Math.min(from+HOUR,c.at);
      const v=sum.get(c.runId,iso(from),iso(to)) as {samples:number;bottles:number};
      return {from:iso(from),to:iso(to),bottles:v.samples?v.bottles:null};
    });
    const models=[{code:'co2',unit:'kg',perBottle:0.004},{code:'water',unit:'m³',perBottle:0.002},{code:'air',unit:'Nm³',perBottle:0.01}];
    return {fictitious:true,source:'recorded_production_demo_ratios',periodStart:iso(monthStart(c.at)),asOf:iso(c.at),
      series:models.map(m=>({...m,total:monthly.bottles*m.perBottle,curve:buckets.map(b=>({from:b.from,to:b.to,value:b.bottles===null?null:b.bottles*m.perBottle}))}))};
  }
  energy(c:Context) {
    const start=monthStart(c.at),end=monthEnd(c.at),target=this.target(c.runId,c.at,'energy');
    const sum=this.db.prepare('SELECT COUNT(*) samples,COALESCE(SUM(consumption_wh),0) wh FROM energy_intervals WHERE run_id=? AND starts_at>=? AND ends_at<=?');
    const month=sum.get(c.runId,iso(start),iso(c.at)) as {samples:number;wh:number};
    const elapsedHours=(c.at-start)/HOUR,currentKw=c.planned===false?null:c.stopped?20:80;
    const first=Math.floor(c.at/HOUR)*HOUR-5*HOUR;
    const curve=Array.from({length:6},(_,i)=>{
      const from=first+i*HOUR,to=Math.min(from+HOUR,c.at),v=sum.get(c.runId,iso(from),iso(to)) as {samples:number;wh:number};
      return {from:iso(from),to:iso(to),wh:v.samples?v.wh:null,averageKw:v.samples&&to>from?v.wh/1000/((to-from)/HOUR):null};
    });
    return {periodStart:iso(start),periodEnd:iso(end),asOf:iso(c.at),monthWh:month.wh,monthKwh:month.wh/1000,currentKw,targetKw:target.value,
      targetSource:target.source,targetId:target.id,powerDifferenceKw:currentKw===null?null:currentKw-target.value,
      monthAverageKw:elapsedHours>0?month.wh/1000/elapsedHours:null,monthBudgetWh:target.value*1000*((end-start)/HOUR),expectedWhToDate:target.value*1000*elapsedHours,
      curve,previousMonthComparison:null,comparisonNote:'Comparaison au mois précédent non disponible sans période précédente complète comparable',fictitious:true};
  }
}
