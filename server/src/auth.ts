import {randomBytes,scrypt as scryptCallback,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import type {DB} from './db.js';
const scrypt=promisify(scryptCallback);
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const SESSION_MS=8*60*60*1000,WINDOW_MS=10*60*1000;
export const SESSION_COOKIE='ch8_admin';
export const PRESENTER_COOKIE='ch8_presenter';
export class Auth {
 constructor(private db:DB,private clock:()=>number=Date.now) {
  // Upgrade only the disabled placeholder; never replace an existing administrator password.
  const old=db.prepare('SELECT password_hash FROM manager_accounts WHERE id=1').get() as {password_hash:string}|undefined;
  if(old?.password_hash==='NO_PASSWORD_LOGIN' && process.env.CH8_ADMIN_PASSWORD) {
   const salt=randomBytes(16).toString('hex');
   const hash=scryptSync(process.env.CH8_ADMIN_PASSWORD!,salt,64).toString('hex');
   db.prepare('UPDATE manager_accounts SET login=?,password_hash=?,enabled=1 WHERE id=1').run('admin-demo',`scrypt:${salt}:${hash}`);
  }
  if(process.env.CH8_PRESENTER_PASSWORD && !db.prepare('SELECT 1 FROM manager_accounts WHERE login=?').get('presenter-demo')) {
   const salt=randomBytes(16).toString('hex'),hash=scryptSync(process.env.CH8_PRESENTER_PASSWORD!,salt,64).toString('hex');
   db.prepare("INSERT INTO manager_accounts(login,password_hash,role,enabled) VALUES (?,?,'presenter',1)").run('presenter-demo',`scrypt:${salt}:${hash}`);
  }
 }
 async login(username:unknown,password:unknown,client:string) {
  const now=this.clock(),cutoff=new Date(now-WINDOW_MS).toISOString();
  this.db.prepare('DELETE FROM login_attempts WHERE window_start<=?').run(cutoff);
  const attempts=this.db.prepare('SELECT failures FROM login_attempts WHERE client=?').get(client) as {failures:number}|undefined;
  if((attempts?.failures??0)>=5) return {status:429 as const};
  this.db.prepare('INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(client) DO UPDATE SET failures=failures+1').run(client,new Date(now).toISOString());
  const valid=typeof username==='string'&&username.length<=100&&typeof password==='string'&&password.length<=256;
  const account=valid?this.db.prepare("SELECT id,login,password_hash,role FROM manager_accounts WHERE login=? AND enabled=1 AND role IN ('admin','presenter')").get(username) as {id:number;login:string;password_hash:string;role:string}|undefined:undefined;
  const parts=account?.password_hash.split(':');
  // Equal-cost verification for an unknown username.
  const salt=parts?.[0]==='scrypt'?parts[1]:'ch8-unknown-account',expected=parts?.[0]==='scrypt'?Buffer.from(parts[2],'hex'):Buffer.alloc(64);
  const actual=await scrypt(valid?password as string:'',salt,64) as Buffer;
  if(!account||expected.length!==actual.length||!timingSafeEqual(actual,expected)) {
   return {status:401 as const};
  }
  this.db.prepare('DELETE FROM login_attempts WHERE client=?').run(client);
  this.db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(new Date(now).toISOString());
  const token=randomBytes(32).toString('hex'),expiresAt=new Date(now+SESSION_MS).toISOString();
  this.db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(digest(token),account.id,new Date(now).toISOString(),expiresAt);
  return {status:200 as const,token,account:{id:account.id,username:account.login,role:account.role},expiresAt};
 }
 account(token:string|undefined) {
  if(!token||!/^[a-f0-9]{64}$/.test(token)) return undefined;
  return this.db.prepare(`SELECT a.id,a.login username,a.role FROM auth_sessions s JOIN manager_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.enabled=1 AND a.role IN ('admin','presenter')`).get(digest(token),new Date(this.clock()).toISOString()) as {id:number;username:string;role:string}|undefined;
 }
 logout(token:string|undefined) {if(token) this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(digest(token));}
}
export function cookieToken(header:string|undefined,name:string=SESSION_COOKIE) {
 return header?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1);
}
