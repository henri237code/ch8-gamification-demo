import type {DB} from './db.js';
import {InputError} from './errors.js';
import {portrait} from './portraits.js';
export type ProfileInput={displayName?:unknown;birthdayMonth?:unknown;birthdayDay?:unknown;teamId?:unknown;enabled?:unknown};
export class Profiles {
 constructor(private db:DB,private clock:()=>number) {}
 list() {
  return this.db.prepare(`SELECT p.*,m.team_id,t.name team_name FROM people p LEFT JOIN team_memberships m ON m.person_id=p.id AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) LEFT JOIN teams t ON t.id=m.team_id ORDER BY p.id`).all(new Date(this.clock()).toISOString(),new Date(this.clock()).toISOString()).map(row=>{const p=row as {avatar_path:string|null};return {...p,...portrait(p.avatar_path)};});
 }
 save(id:number|undefined,input:ProfileInput) {
  if(!input||typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.length>100) throw new InputError('Nom entre 1 et 100 caractères requis');
  if(id!==undefined&&(!Number.isInteger(id)||!this.db.prepare('SELECT 1 FROM people WHERE id=?').get(id))) throw new InputError('Profil inconnu');
  const month=input.birthdayMonth??null,day=input.birthdayDay??null;
  if((month===null)!==(day===null)||(month!==null&&(!Number.isInteger(month)||!Number.isInteger(day)||(month as number)<1||(month as number)>12||(day as number)<1||(day as number)>new Date(Date.UTC(2000,month as number,0)).getUTCDate()))) throw new InputError('Date anniversaire invalide ; jour et mois requis ensemble');
  const team=input.teamId??null;
  if(team!==null&&(!Number.isInteger(team)||!this.db.prepare('SELECT 1 FROM teams WHERE id=?').get(team as number))) throw new InputError('Équipe inconnue');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean') throw new InputError('Statut actif booléen requis');
  const at=new Date(this.clock()).toISOString();
  return this.db.transaction(()=>{
   const profileId=id??Number(this.db.prepare('INSERT INTO people(display_name,birthday_month,birthday_day,created_at,updated_at) VALUES (?,?,?,?,?)').run(input.displayName as string,month,day,at,at).lastInsertRowid);
   this.db.prepare('UPDATE people SET display_name=?,birthday_month=?,birthday_day=?,enabled=?,updated_at=? WHERE id=?').run((input.displayName as string).trim(),month,day,input.enabled===false?0:1,at,profileId);
   const old=this.db.prepare('SELECT id,team_id,starts_at FROM team_memberships WHERE person_id=? AND ends_at IS NULL').get(profileId) as {id:number;team_id:number;starts_at:string}|undefined;
   if((old?.team_id??null)!==team) {
    if(old) {
     // Same-instant edits have no membership duration to retain.
     if(old.starts_at>=at) this.db.prepare('DELETE FROM team_memberships WHERE id=?').run(old.id);
     else this.db.prepare('UPDATE team_memberships SET ends_at=? WHERE id=?').run(at,old.id);
    }
    if(team!==null) this.db.prepare("INSERT INTO team_memberships(person_id,team_id,role,starts_at) VALUES (?,?,'opérateur',?)").run(profileId,team,at);
   }
   this.audit('profile_saved',profileId);return profileId;
  })();
 }
 renameTeam(id:number,name:unknown) {
  if(!Number.isInteger(id)||!this.db.prepare('SELECT 1 FROM teams WHERE id=?').get(id)) throw new InputError('Équipe inconnue');
  if(typeof name!=='string'||!name.trim()||name.length>100) throw new InputError('Nom équipe entre 1 et 100 caractères');
  this.db.transaction(()=>{this.db.prepare('UPDATE teams SET name=? WHERE id=?').run(name.trim(),id);this.audit('team_renamed',id);})();
 }
 private audit(action:string,id:number) {this.db.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,?,'profile',?,'{}',?)").run(action,id,new Date(this.clock()).toISOString());}
}
