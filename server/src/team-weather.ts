import type {DB} from './db.js';
import {InputError} from './errors.js';
import {iso} from './time.js';
export class TeamWeather {
 constructor(private db:DB,private clock:()=>number){}
 list(){return this.db.prepare('SELECT w.*,t.name team_name FROM team_weather w JOIN teams t ON t.id=w.team_id ORDER BY t.id').all()}
 save(teamId:number,input:Record<string,unknown>){
  if(!Number.isInteger(teamId)||!this.db.prepare('SELECT 1 FROM teams WHERE id=?').get(teamId))throw new InputError('Équipe inconnue');
  if(!input||![input.mood,input.fatigue].every(v=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=5))throw new InputError('Moral et fatigue : nombres entiers entre 1 et 5');
  const note=input.note??'';if(typeof note!=='string'||note.length>2000)throw new InputError('Commentaire limité à 2 000 caractères');
  this.db.transaction(()=>{
   this.db.prepare("INSERT INTO team_weather(team_id,mood,fatigue,note,source,updated_at) VALUES (?,?,?,?,'manager',?) ON CONFLICT(team_id) DO UPDATE SET mood=excluded.mood,fatigue=excluded.fatigue,note=excluded.note,source='manager',updated_at=excluded.updated_at").run(teamId,input.mood,input.fatigue,note.trim(),iso(this.clock()));
   this.db.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,'team_weather_saved','team',?,?,?)").run(teamId,JSON.stringify({mood:input.mood,fatigue:input.fatigue,note:note.trim()}),iso(this.clock()));
  })();
 }
}
