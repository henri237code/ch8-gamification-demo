import type {DB} from './db.js';
import {InputError} from './errors.js';
import {scheduledStart} from './programming.js';
import {iso,requireInstant,monthStart,monthEnd,HOUR} from './time.js';
export const CONTENT_ICONS=['message','calendar','cake','trophy','football','star','megaphone','quote'] as const;
type Input=Record<string,unknown>;
export class Editorial {
 constructor(private db:DB,private clock:()=>number) {}
 private text(value:unknown,max:number,required=false) {
  if((value===null||value===undefined)&&!required) return null;
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())) throw new InputError(`Texte ${required?'requis ':''}limité à ${max} caractères`);
  return value.trim()||null;
 }
 private ref(value:unknown,table:'teams'|'shift_templates'|'people') {
  if(value===null||value===undefined) return null;
  if(!Number.isInteger(value)||!this.db.prepare(`SELECT 1 FROM ${table} WHERE id=? ${table==='people'?'AND enabled=1':''}`).get(value as number)) throw new InputError('Personne, équipe ou quart inconnu/inactif');
  return value as number;
 }
 private date(value:unknown) {if(value===null||value===undefined) return null;try{return iso(requireInstant(value));}catch{throw new InputError('Date ISO avec fuseau requise');}}
 list() {return {icons:CONTENT_ICONS,contents:this.db.prepare(`SELECT c.*,p.screen_number,p.team_id,p.shift_template_id,p.starts_at,p.ends_at FROM editorial_contents c LEFT JOIN content_publications p ON p.content_id=c.id ORDER BY c.id DESC`).all()};}
 save(id:number|undefined,input:Input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new InputError('Contenu requis');
  const old=id===undefined?undefined:this.db.prepare(`SELECT c.*,p.screen_number,p.team_id,p.shift_template_id,p.starts_at,p.ends_at FROM editorial_contents c LEFT JOIN content_publications p ON p.content_id=c.id WHERE c.id=? ORDER BY p.id LIMIT 1`).get(id) as Input|undefined;
  if(id!==undefined&&(!Number.isInteger(id)||!old)) throw new InputError('Contenu inconnu');
  const pick=(key:string,sql=key,fallback:unknown=null)=>input[key]!==undefined?input[key]:old?.[sql]??fallback;
  const kind=pick('kind','kind','message'),status=pick('status','status','published');
  if(!['message','quote','event','sports'].includes(kind as string)||!['draft','published','archived'].includes(status as string)) throw new InputError('Type ou statut de contenu invalide');
  if(old&&kind!==old.kind) throw new InputError('Le type d’un contenu existant ne change pas');
  const body=this.text(pick('body'),2000,true),title=this.text(pick('title'),160),attribution=this.text(pick('attribution'),160),icon=pick('iconCode','icon_code');
  if(icon!==null&&!CONTENT_ICONS.includes(icon as any)) throw new InputError('Icône inconnue');
  const screen=pick('screenNumber','screen_number',kind==='message'?3:4);
  if(!Number.isInteger(screen)||(screen as number)<1||(screen as number)>4) throw new InputError('Écran de 1 à 4 requis');
  const team=this.ref(pick('teamId','team_id'),'teams'),shift=this.ref(pick('shiftTemplateId','shift_template_id'),'shift_templates');
  const start=this.date(pick('startsAt','starts_at')),end=this.date(pick('endsAt','ends_at'));
  if(kind==='message'&&input.startsAt!==undefined&&start&&Date.parse(start)>this.clock()) scheduledStart(start,this.clock());
  if(start&&end&&end<=start) throw new InputError('La fin doit suivre le début');
  return this.db.transaction(()=>{
   const at=iso(this.clock());let contentId=id;
   if(contentId===undefined) contentId=Number(this.db.prepare(`INSERT INTO editorial_contents(line_id,kind,body,created_by,status,created_at,updated_at) VALUES (1,?,?,1,?,?,?)`).run(kind,body,status,at,at).lastInsertRowid);
   this.db.prepare('UPDATE editorial_contents SET title=?,body=?,attribution=?,icon_code=?,status=?,updated_at=? WHERE id=?').run(title,body,attribution,icon,status,at,contentId);
   this.db.prepare('DELETE FROM content_publications WHERE content_id=?').run(contentId);
   this.db.prepare(`INSERT INTO content_publications(content_id,screen_number,team_id,shift_template_id,clock_domain,starts_at,ends_at,priority) VALUES (?,?,?,?,'real',?,?,10)`).run(contentId,screen,team,shift,start,end);
   if(status!=='published') this.db.prepare("UPDATE manager_quote_preference SET mode='each_shift',content_id=NULL,updated_at=? WHERE content_id=?").run(at,contentId);
   this.audit('content_saved',contentId,{kind,status});return contentId;
  })();
 }
 private period(value:unknown) {
  if(value===undefined) return {start:monthStart(this.clock()),end:monthEnd(this.clock())};
  if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new InputError('Mois au format AAAA-MM requis');
  const [year,month]=value.split('-').map(Number),start=Date.UTC(year,month-1,1)-HOUR;return {start,end:monthEnd(start)};
 }
 award(input:Input) {
  if(!input||!['operator_month','safety_badge'].includes(input.kind as string)) throw new InputError('Distinction individuelle invalide');
  const person=this.ref(input.personId,'people');if(person===null) throw new InputError('Choisir une personne active');
  const reason=this.text(input.reason,2000,true),{start,end}=this.period(input.month),code=input.kind==='safety_badge'?input.badgeCode:null;
  if(code!==null&&(typeof code!=='string'||!this.db.prepare('SELECT 1 FROM badge_definitions WHERE code=?').get(code))) throw new InputError('Badge inconnu');
  return this.db.transaction(()=>{
   const existing=this.db.prepare(`SELECT id FROM recognitions WHERE origin='manager' AND kind=? AND starts_at=? AND revoked_at IS NULL AND (?='operator_month' OR (person_id=? AND badge_code=?))`).get(input.kind,iso(start),input.kind,person,code) as {id:number}|undefined;
   let id=existing?.id;
   if(id) this.db.prepare('UPDATE recognitions SET person_id=?,reason=? WHERE id=?').run(person,reason,id);
   else id=Number(this.db.prepare(`INSERT INTO recognitions(line_id,kind,person_id,badge_code,reason,starts_at,ends_at,origin,approved_by) VALUES (1,?,?,?,?,?,?,'manager',1)`).run(input.kind,person,code,reason,iso(start),iso(end)).lastInsertRowid);
   this.audit('individual_awarded',id,{kind:input.kind,personId:person});return id;
  })();
 }
 revoke(id:number) {
  if(!Number.isInteger(id)||!this.db.prepare("SELECT 1 FROM recognitions WHERE id=? AND origin='manager' AND kind IN ('operator_month','safety_badge')").get(id)) throw new InputError('Distinction administrable inconnue');
  this.db.transaction(()=>{this.db.prepare('UPDATE recognitions SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').run(iso(this.clock()),id);this.audit('recognition_revoked',id,{});})();
 }
 recognitions() {return this.db.prepare(`SELECT r.*,p.display_name,p.avatar_path FROM recognitions r LEFT JOIN people p ON p.id=r.person_id WHERE r.origin='manager' ORDER BY r.starts_at DESC,r.id DESC`).all();}
 private audit(action:string,id:number,details:object) {this.db.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,?,'editorial',?,?,?)").run(action,id,JSON.stringify(details),iso(this.clock()));}
}
