import type {DB} from './db.js';
import {InputError} from './errors.js';
import {DAY,MINUTE,iso,requireInstant,shiftAt} from './time.js';
/** Horizon de départ seulement : la durée d’un contenu reste distincte. */
export function scheduledStart(value:unknown,now:number){
 let at:number;try{at=requireInstant(value)}catch{throw new InputError('Date de début avec fuseau requise')}
 if(at<now||at>now+DAY)throw new InputError('Programmer dans les 24 prochaines heures');
 return at;
}
export type Program={id:number;kind:'target'|'challenge';starts_at:string;ends_at:string;shift_starts_at:string;payload_json:string;cancelled_at:string|null};
export class Programming {
 constructor(private db:DB,private clock:()=>number){}
 list(){return this.db.prepare('SELECT p.*,i.status instance_status FROM admin_programs p LEFT JOIN admin_program_receipts r ON r.program_id=p.id AND r.run_id=(SELECT run_id FROM normal_simulation) LEFT JOIN challenge_instances i ON i.id=r.instance_id ORDER BY p.starts_at,p.id').all() as Program[]}
 save(input:Record<string,unknown>,id?:number){
 if(!input||!['target','challenge'].includes(input.kind as string))throw new InputError('Programmer un objectif ou un mini-défi');
 const now=this.clock(),start=scheduledStart(input.startsAt,now),sh=shiftAt(start);
 if(start%MINUTE!==0)throw new InputError('Choisir une heure à la minute près');
 const planned=this.db.prepare(`SELECT 1 FROM team_schedule WHERE starts_at=? UNION SELECT 1 FROM shifts sh JOIN normal_simulation n ON n.run_id=sh.run_id WHERE sh.starts_at=?`).get(iso(sh.start),iso(sh.start));
 if(!planned)throw new InputError('Planifier ce quart avant de programmer ses objectifs ou défis');
 let end=sh.end,payload:Record<string,unknown>;
 if(input.kind==='target'){
  if(!Number.isInteger(input.target)||(input.target as number)<1||(input.target as number)>1_000_000)throw new InputError('Objectif entier entre 1 et 1 000 000');
  if(input.endsAt!==undefined){try{end=requireInstant(input.endsAt)}catch{throw new InputError('Date de fin invalide')}}
  payload={target:input.target};
 }else{
  const p=this.db.prepare('SELECT duration_minutes FROM express_challenge_presets WHERE code=? AND enabled=1').get(typeof input.presetCode==='string'?input.presetCode:'') as {duration_minutes:number}|undefined;
  if(!p)throw new InputError('Choisir un mini-défi prédéfini');
  end=start+p.duration_minutes*MINUTE;payload={presetCode:input.presetCode};
  if(input.endsAt!==undefined)throw new InputError('La durée du mini-défi est définie par son modèle');
 }
 if(end<=start||end>sh.end||end%MINUTE!==0)throw new InputError('La période doit tenir dans un seul quart, à la minute près');
 if(id!==undefined)this.editable(id,now);
 if(this.db.prepare('SELECT 1 FROM admin_programs WHERE cancelled_at IS NULL AND kind=? AND starts_at<? AND ends_at>? AND id!=?').get(input.kind,iso(end),iso(start),id??-1))throw new InputError('Une programmation du même type occupe déjà cette période');
 return this.db.transaction(()=>{
  let result=id;
  if(result===undefined)result=Number(this.db.prepare('INSERT INTO admin_programs(kind,starts_at,ends_at,shift_starts_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(input.kind,iso(start),iso(end),iso(sh.start),JSON.stringify(payload),iso(now),iso(now)).lastInsertRowid);
  else this.db.prepare('UPDATE admin_programs SET kind=?,starts_at=?,ends_at=?,shift_starts_at=?,payload_json=?,updated_at=? WHERE id=?').run(input.kind,iso(start),iso(end),iso(sh.start),JSON.stringify(payload),iso(now),result);
  this.audit('program_saved',result!);return result!;
 })();
 }
 private editable(id:number,now:number){const p=this.db.prepare('SELECT * FROM admin_programs WHERE id=? AND cancelled_at IS NULL').get(id) as Program|undefined;if(!Number.isInteger(id)||!p)throw new InputError('Programmation inconnue');if(Date.parse(p.starts_at)<=now||this.db.prepare('SELECT 1 FROM admin_program_receipts WHERE program_id=?').get(id))throw new InputError('Une programmation commencée conserve son historique');return p}
 cancel(id:number){this.editable(id,this.clock());this.db.transaction(()=>{this.db.prepare('UPDATE admin_programs SET cancelled_at=?,updated_at=? WHERE id=?').run(iso(this.clock()),iso(this.clock()),id);this.audit('program_cancelled',id)})()}
 private audit(action:string,id:number){this.db.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,?,'admin_program',?,'{}',?)").run(action,id,iso(this.clock()))}
}
