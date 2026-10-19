import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import type {DB} from './db.js';
import {InputError} from './errors.js';
import {portrait} from './portraits.js';
export const PHOTO_BYTES=5*1024*1024;
export class Photos {
 constructor(private db:DB,private clock:()=>number) {}
 private person(id:number) {
  if(!Number.isInteger(id)||!this.db.prepare('SELECT 1 FROM people WHERE id=?').get(id)) throw new InputError('Profil inconnu');
 }
 async save(personId:number,input:unknown) {
  this.person(personId);
  if(!Buffer.isBuffer(input)||input.length===0||input.length>PHOTO_BYTES) throw new InputError('Photo JPEG, PNG ou WebP requise, de 5 Mo maximum');
  const png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=input[0]===255&&input[1]===216&&input[2]===255,webp=input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP';
  if(!png&&!jpeg&&!webp) throw new InputError('Format non pris en charge ; choisir JPEG, PNG ou WebP');
  let data:Buffer,width:number,height:number;
  try {
   const image=sharp(input,{limitInputPixels:20_000_000,failOn:'warning'}),meta=await image.metadata();
   if(!meta.format||!['jpeg','png','webp'].includes(meta.format)||(meta.pages??1)>1) throw new Error('Format non pris en charge');
   const result=await image.rotate().resize({width:512,height:512,fit:'cover',withoutEnlargement:true}).webp({quality:82}).toBuffer({resolveWithObject:true});
   data=result.data;width=result.info.width;height=result.info.height;
  } catch {throw new InputError('Image illisible ; utiliser une photo JPEG, PNG ou WebP valide de 20 millions de pixels maximum');}
  const id=randomUUID(),path=`/media/portraits/${id}.webp`,at=new Date(this.clock()).toISOString();
  this.db.transaction(()=>{
   this.db.prepare('DELETE FROM portrait_assets WHERE person_id=?').run(personId);
   this.db.prepare("INSERT INTO portrait_assets VALUES (?,?,'image/webp',?,?,?,?)").run(id,personId,data,width,height,at);
   this.db.prepare('UPDATE people SET avatar_path=?,updated_at=? WHERE id=?').run(path,at,personId);
   this.audit('portrait_saved',personId,at);
  })();
  return {...portrait(path),width,height};
 }
 remove(personId:number) {
  this.person(personId);const at=new Date(this.clock()).toISOString();
  this.db.transaction(()=>{this.db.prepare('UPDATE people SET avatar_path=NULL,updated_at=? WHERE id=?').run(at,personId);this.db.prepare('DELETE FROM portrait_assets WHERE person_id=?').run(personId);this.audit('portrait_removed',personId,at);})();
  return portrait(null);
 }
 get(id:string) {
  if(!/^[a-f0-9-]{36}$/.test(id)) return undefined;
  return this.db.prepare(`SELECT a.image_data,a.content_type FROM portrait_assets a JOIN people p ON p.id=a.person_id WHERE a.id=? AND p.enabled=1 AND p.avatar_path='/media/portraits/' || a.id || '.webp'`).get(id) as {image_data:Buffer;content_type:string}|undefined;
 }
 private audit(action:string,id:number,at:string) {this.db.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,?,'profile',?,'{}',?)").run(action,id,at);}
}
