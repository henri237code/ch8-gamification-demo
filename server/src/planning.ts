import type {DB} from './db.js';
import {InputError} from './errors.js';
import {DAY,HOUR,iso,localDate} from './time.js';
export class Planning {
  constructor(private db:DB,private clock:()=>number) {}
  private day(value:unknown) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError('Date locale au format AAAA-MM-JJ requise');
    const at=Date.parse(`${value}T00:00:00+01:00`);
    if(!Number.isFinite(at)||localDate(at)!==value) throw new InputError('Date locale invalide');
    return at;
  }
  save(input:unknown) {
    if(!Array.isArray(input)||input.length<1||input.length>270) throw new InputError('Fournir de 1 à 270 quarts (jusqu’à 90 journées par envoi)');
    const now=this.clock(),seen=new Set<number>();
    const entries=input.map(entry=>{
      if(!entry||typeof entry!=='object') throw new InputError('Quart invalide');
      const {date,templateId,teamId}=entry as {date?:unknown;templateId?:unknown;teamId?:unknown};
      if(!Number.isInteger(templateId)||![1,2,3].includes(templateId as number)) throw new InputError('Choisir matin, après-midi ou nuit');
      if(!Number.isInteger(teamId)||!this.db.prepare('SELECT 1 FROM teams WHERE id=? AND line_id=1').get(teamId)) throw new InputError('Équipe CH8 inconnue');
      const start=this.day(date)+([6,14,22][(templateId as number)-1])*HOUR;
      if(this.db.prepare('SELECT 1 FROM shifts sh JOIN normal_simulation n ON n.run_id=sh.run_id WHERE sh.starts_at=?').get(iso(start))) throw new InputError('Ce quart a déjà été généré ; son historique est conservé');
      if(start<=now) throw new InputError('Un quart commencé ne peut pas être réaffecté par le planning');
      if(seen.has(start)) throw new InputError('Un seul choix d’équipe par quart dans un même envoi');seen.add(start);
      return {start,end:start+8*HOUR,templateId:templateId as number,teamId:teamId as number};
    });
    return this.db.transaction(()=>{
      const save=this.db.prepare(`INSERT INTO team_schedule(line_id,template_id,team_id,starts_at,ends_at,created_by,created_at,updated_at) VALUES (1,?,?,?,?,1,?,?)
        ON CONFLICT(line_id,starts_at) DO UPDATE SET team_id=excluded.team_id,updated_at=excluded.updated_at`);
      for(const e of entries) save.run(e.templateId,e.teamId,iso(e.start),iso(e.end),iso(now),iso(now));
      this.db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,'planning_saved','team_schedule',NULL,?,?)`)
        .run(JSON.stringify(entries.map(e=>({...e,start:iso(e.start),end:iso(e.end)}))),iso(now));
      return {saved:entries.length};
    })();
  }
  remove(id:number) {
    if(!Number.isInteger(id)) throw new InputError('Quart planifié inconnu');
    const row=this.db.prepare('SELECT starts_at FROM team_schedule WHERE id=? AND line_id=1').get(id) as {starts_at:string}|undefined;
    if(!row) throw new InputError('Quart planifié inconnu');
    if(this.db.prepare('SELECT 1 FROM shifts sh JOIN normal_simulation n ON n.run_id=sh.run_id WHERE sh.starts_at=?').get(row.starts_at)) throw new InputError('Ce quart a déjà commencé ; son historique est conservé');
    if(Date.parse(row.starts_at)<=this.clock()) throw new InputError('Un quart commencé ne peut pas être retiré du planning');
    this.db.transaction(()=>{
      this.db.prepare('DELETE FROM team_schedule WHERE id=?').run(id);
      this.db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,'planning_removed','team_schedule',?,'{}',?)`).run(id,iso(this.clock()));
    })();
  }
  list(from:unknown=localDate(this.clock()),days:unknown=14) {
    const start=this.day(from),count=typeof days==='string'?Number(days):days;
    if(!Number.isInteger(count)||(count as number)<1||(count as number)>90) throw new InputError('Afficher de 1 à 90 journées');
    const normal=this.db.prepare('SELECT run_id FROM normal_simulation WHERE singleton=1').get() as {run_id:number}|undefined;
    const rows=Array.from({length:count as number},(_,i)=>[1,2,3].map(templateId=>{
      const at=start+i*DAY+[6,14,22][templateId-1]*HOUR;
      const plan=this.db.prepare('SELECT id,team_id FROM team_schedule WHERE line_id=1 AND starts_at=?').get(iso(at)) as {id:number;team_id:number}|undefined;
      const actual=normal?this.db.prepare('SELECT id,status,team_id,assignment_source FROM shifts WHERE run_id=? AND starts_at=?').get(normal.run_id,iso(at)) as {id:number;status:string;team_id:number;assignment_source:string}|undefined:undefined;
      const teamId=actual?.team_id??plan?.team_id??null;
      const team=teamId===null?null:this.db.prepare('SELECT name FROM teams WHERE id=?').get(teamId) as {name:string};
      return {date:localDate(at),templateId,startsAt:iso(at),endsAt:iso(at+8*HOUR),teamId,team:team?.name??null,
        shiftId:actual?.id??null,completed:actual?.status==='completed',scheduleId:plan?.id??null,source:actual?.assignment_source??(plan?'manager_planning':'unplanned'),editable:!actual&&at>this.clock()};
    })).flat();
    return {timezone:'Africa/Douala',from:localDate(start),days:count,entries:rows,unplannedFuture:rows.filter(r=>r.editable&&r.scheduleId===null).length,
      fallbackNote:'Sans programmation, aucun travail ni équipe ne sont générés.'};
  }
}
