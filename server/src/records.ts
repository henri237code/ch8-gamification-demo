import type {DB} from './db.js';
import {iso,monthStart,monthEnd} from './time.js';

// Records are projections of the persisted physical history, scoped to one run.
// They intentionally ignore editable targets and game bonuses.
export class LineRecords {
  constructor(private db:DB) {}
  snapshot(runId:number,at:number) {
    const peak=this.db.prepare(`SELECT p.total_bottles*60 value,p.starts_at startsAt,p.ends_at endsAt,sh.team_id teamId,t.name team
      FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id JOIN shifts sh ON sh.id=s.shift_id JOIN teams t ON t.id=sh.team_id
      WHERE sh.run_id=? AND p.ends_at<=? AND ABS((julianday(p.ends_at)-julianday(p.starts_at))*86400-60)<0.0001
      ORDER BY value DESC,p.starts_at LIMIT 1`).get(runId,iso(at)) as {value:number;startsAt:string;endsAt:string;teamId:number;team:string}|undefined;
    const ranges=this.db.prepare(`WITH observed AS (
      SELECT p.starts_at a,p.ends_at b,LAG(p.ends_at) OVER (ORDER BY p.starts_at) previousEnd FROM production_intervals p
      JOIN shift_order_segments s ON s.id=p.segment_id JOIN shifts sh ON sh.id=s.shift_id WHERE sh.run_id=? AND p.ends_at<=?
    ), islands AS (SELECT a,b,SUM(CASE WHEN previousEnd=a THEN 0 ELSE 1 END) OVER (ORDER BY a) island FROM observed)
    SELECT MIN(a) a,MAX(b) b FROM islands GROUP BY island ORDER BY a`).all(runId,iso(at)) as {a:string;b:string}[];
    const stops=this.db.prepare(`SELECT starts_at a,ends_at b FROM stoppages WHERE run_id=? AND affects_line=1 AND starts_at<=? ORDER BY starts_at`)
      .all(runId,iso(at)) as {a:string;b:string|null}[];
    // Merge adjacent observed shifts: changing teams alone does not stop CH8.
    const coverage:{a:number;b:number}[]=[];
    for(const r of ranges) {
      const a=Date.parse(r.a),b=Date.parse(r.b),last=coverage.at(-1);
      if(last&&a<=last.b) last.b=Math.max(last.b,b);else coverage.push({a,b});
    }
    let longest:{value:number;startsAt:string;endsAt:string;ongoing:boolean}|null=null;
    const consider=(a:number,b:number)=>{
      if(b>a&&(!longest||b-a>longest.value*1000)) longest={value:(b-a)/1000,startsAt:iso(a),endsAt:iso(b),ongoing:b===at};
    };
    for(const range of coverage) {
      let cursor=range.a;
      for(const stop of stops) {
        const a=Math.max(range.a,Date.parse(stop.a)),b=Math.min(range.b,stop.b?Date.parse(stop.b):at);
        if(b<=a) continue;
        consider(cursor,Math.max(cursor,a));cursor=Math.max(cursor,b);
      }
      consider(cursor,range.b);
    }
    const months=this.db.prepare(`SELECT strftime('%Y-%m',p.starts_at,'+1 hours') month,
      MIN(p.starts_at) startsAt,MAX(p.ends_at) endsAt,SUM(p.total_bottles-p.rejected_bottles) good,
      SUM(unixepoch(p.ends_at)-unixepoch(p.starts_at)) observedSeconds,
      SUM((unixepoch(p.ends_at)-unixepoch(p.starts_at))*s.planned_bph/3600.0) capacity
      FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id JOIN shifts sh ON sh.id=s.shift_id
      WHERE sh.run_id=? AND p.ends_at<=? GROUP BY month ORDER BY month`).all(runId,iso(at)) as {month:string;startsAt:string;endsAt:string;good:number;observedSeconds:number;capacity:number}[];
    const continuous=longest as {value:number;startsAt:string;endsAt:string;ongoing:boolean}|null;
    if(continuous&&stops.some(s=>Date.parse(s.a)<=at&&(!s.b||Date.parse(s.b)>at))) continuous.ongoing=false;
    const monthly=months.map(m=>{
      const start=Date.parse(`${m.month}-01T00:00:00+01:00`),end=monthEnd(start);
      return {...m,periodStart:iso(start),periodEnd:iso(end),value:m.capacity>0?100*m.good/m.capacity:null,
        complete:end<=at&&Date.parse(m.startsAt)===start&&Date.parse(m.endsAt)===end&&m.observedSeconds===(end-start)/1000};
    });
    const current=monthly.find(m=>m.periodStart===iso(monthStart(at)))??null;
    const best=monthly.filter(m=>m.complete&&m.value!==null).sort((a,b)=>b.value!-a.value!||a.month.localeCompare(b.month))[0]??null;
    return {asOf:iso(at),runId,simulated:true,historyStart:coverage.length?iso(coverage[0].a):null,
      cadence:peak?{...peak,unit:'bottles/hour',label:'Meilleure cadence moyenne sur une minute complète',definition:'Bouteilles embouteillées sur une minute observée × 60 ; rejets inclus'}:null,
      continuousProduction:continuous?{...continuous,unit:'seconds',label:'Plus longue production sans arrêt de ligne observée',definition:'Durée observée sans arrêt affectant CH8 ; les changements de quart ne coupent pas la durée',historyLimited:true}:null,
      monthlyEfficiency:{label:'Rendement mensuel simulé — démo',unit:'percent',formula:'100 × bouteilles conformes / capacité théorique des périodes observées (cadence prévue × durée)',
        note:'Indicateur provisoire, distinct du TRS métier ; peut dépasser 100 % si la cadence dépasse la référence. Seuls les mois entièrement observés concourent au record.',
        current,bestCompletedMonth:best,months}};
  }
}
