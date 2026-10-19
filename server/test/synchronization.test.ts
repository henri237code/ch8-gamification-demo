import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import request from 'supertest';
import {io} from 'socket.io-client';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createRuntime,type SharedState} from '../src/runtime.js';
import {MINUTE} from '../src/time.js';
type PlannedState=SharedState&{shift:NonNullable<SharedState['shift']>;production:NonNullable<SharedState['production']>};
type Runtime=ReturnType<typeof createRuntime>;
async function listen(r:Runtime,port=0){await new Promise<void>((resolve,reject)=>{r.server.once('error',reject);r.server.listen(port,'127.0.0.1',()=>{r.server.removeListener('error',reject);resolve();});});const address=r.server.address() as {port:number};return {url:`http://127.0.0.1:${address.port}`,port:address.port};}
function client(url:string,transport:'websocket'|'polling'='websocket') {
 const socket=io(url,{autoConnect:false,transports:[transport],reconnectionDelay:50,reconnectionDelayMax:100,randomizationFactor:0});
 const states:PlannedState[]=[];socket.on('state',(s:SharedState)=>{assert.ok(s.shift&&s.production);states.push({...s,shift:s.shift,production:s.production});});
 const wait=(predicate:(s:PlannedState)=>boolean)=>new Promise<PlannedState>((resolve,reject)=>{
  const previous=states.slice().reverse().find(predicate);if(previous){resolve(previous);return;}
  const timeout=setTimeout(()=>{socket.off('state',listener);reject(new Error('Instantané attendu non reçu'));},8000);
  const listener=(s:PlannedState)=>{if(predicate(s)){clearTimeout(timeout);socket.off('state',listener);resolve(s);}};socket.on('state',listener);
 });
 return {socket,states,wait};
}
const seq=(c:ReturnType<typeof client>)=>c.states.at(-1)?.synchronization.sequence??0;
async function fixture(){let now=Date.parse('2026-10-12T12:30:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();const r=createRuntime(e,'test',{intervalMs:60_000});const address=await listen(r);return {db,e,r,...address,set:(t:number)=>{now=t;},now:()=>now};}
const admin={username:'admin-demo',password:'public-test-admin-password'},presenter={username:'presenter-demo',password:'public-test-presenter-password'};
test('Six clients : même instantané, réponse HTTP identique et commandes limitées aux rôles',async()=>{
 const f=await fixture(),clients=Array.from({length:6},()=>client(f.url));
 try {
  const initial=clients.map(c=>c.wait(()=>true));clients.forEach(c=>c.socket.connect());await Promise.all(initial);
  const old=Math.max(...clients.map(seq)),pending=clients.map(c=>c.wait(s=>s.synchronization.sequence>old));f.r.refresh();
  const all=await Promise.all(pending);all.forEach(s=>assert.deepEqual(s,all[0]));
  const login=await request(f.r.app).post('/api/auth/login').send(admin).expect(200),cookie=login.headers['set-cookie'];
  const updates=clients.map(c=>c.wait(s=>s.production.target===16000));
  const result=await request(f.r.app).post('/api/manager/target').set('Cookie',cookie).send({target:16000}).expect(200);
  const changed=await Promise.all(updates);changed.forEach(s=>assert.deepEqual(s,result.body));
  assert.match((await request(f.r.app).get('/api/state')).headers['cache-control'],/no-store/);
  const pl=await request(f.r.app).post('/api/auth/login').send(presenter).expect(200);
  await request(f.r.app).post('/api/manager/target').set('Cookie',pl.headers['set-cookie']).send({target:14000}).expect(403);
  // Socket events cannot mutate state, even for a connected public display.
  clients[0].socket.emit('control',{action:'stop'});clients[0].socket.emit('target',{target:14000});
  const before=seq(clients[0]),unchanged=clients[0].wait(s=>s.synchronization.sequence>before);f.r.refresh();assert.equal((await unchanged).production.target,16000);
 } finally {clients.forEach(c=>c.socket.disconnect());await f.r.close();f.db.close();}
});
test('Client absent puis reconnecté : état complet courant, relève réelle et texte conservé',async()=>{
 const f=await fixture(),a=client(f.url),b=client(f.url,'polling');
 try {
  const first=[a.wait(()=>true),b.wait(()=>true)];a.socket.connect();b.socket.connect();await Promise.all(first);
  b.socket.disconnect();const normal=f.e.snapshot().runId;
  const login=await request(f.r.app).post('/api/auth/login').send(admin).expect(200);
  await request(f.r.app).post('/api/manager/content').set('Cookie',login.headers['set-cookie']).send({kind:'message',body:'Message pendant la coupure'}).expect(201);
  f.e.startGuide(5,3);f.set(Date.parse('2026-10-12T14:15:00+01:00'));f.e.returnNormal();
  const before=seq(b),received=b.wait(s=>s.synchronization.sequence>before&&s.runId===normal&&s.shift.template_id===2);b.socket.connect();
  const state=await received;assert.equal(state.guidedScenario,null);assert.ok(state.production.total>0&&state.production.total<1000);
  assert.ok(state.communication.messages.some(m=>(m as {body:string}).body==='Message pendant la coupure'));
  const matching=await a.wait(s=>s.synchronization.sequence===state.synchronization.sequence);assert.deepEqual(matching,state);
 } finally {a.socket.disconnect();b.socket.disconnect();await f.r.close();f.db.close();}
});
test('Coupure de transport : reconnexion automatique sans remise à zéro ni création d’exécution',async()=>{
 const f=await fixture(),c=client(f.url);
 try {
  const first=c.wait(()=>true);c.socket.connect();const initial=await first,old=seq(c);
  const next=c.wait(s=>s.synchronization.sequence>old&&s.production.total>initial.production.total);
  f.set(f.now()+4*MINUTE);c.socket.io.engine!.close();const state=await next;
  assert.equal(state.runId,initial.runId);assert.equal(state.shift.id,initial.shift.id);assert.equal((f.db.prepare('SELECT COUNT(*) n FROM simulation_runs').get() as {n:number}).n,1);
 } finally {c.socket.disconnect();await f.r.close();f.db.close();}
});
test('Redémarrage serveur : reconnexion, nouvelle identité, SQLite et session admin conservées',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ch8-sync-')),file=join(dir,'demo.sqlite');let now=Date.parse('2026-10-12T12:30:00+01:00');
 let db=openDatabase(file),e=new Engine(db,()=>now);e.initialize();let r=createRuntime(e,'test',{intervalMs:60_000});const address=await listen(r),c=client(address.url);
 try {
  const first=c.wait(()=>true);c.socket.connect();const initial=await first;
  const login=await request(r.app).post('/api/auth/login').send(admin).expect(200),cookie=login.headers['set-cookie'];
  await request(r.app).post('/api/manager/target').set('Cookie',cookie).send({target:16000}).expect(200);
  const next=c.wait(s=>s.synchronization.serverInstanceId!==initial.synchronization.serverInstanceId);
  await r.close();db.close();now+=3*MINUTE;db=openDatabase(file);e=new Engine(db,()=>now);e.initialize();r=createRuntime(e,'test',{intervalMs:60_000});await listen(r,address.port);
  const state=await next;assert.equal(state.runId,initial.runId);assert.equal(state.production.target,16000);assert.ok(state.production.total>initial.production.total);
  await request(r.app).get('/api/auth/session?space=manager').set('Cookie',cookie).expect(200);
 } finally {c.socket.disconnect();await r.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
test('Erreur d’actualisation : signal explicite puis récupération au prochain instantané',async()=>{
 const f=await fixture(),c=client(f.url);
 try {
  const first=c.wait(()=>true);c.socket.connect();await first;
  const original=f.e.snapshot.bind(f.e);f.e.snapshot=()=>{throw new Error('Test de panne transitoire');};
  const error=new Promise<{retryable:boolean}>(resolve=>c.socket.once('state-error',resolve));f.r.refresh();assert.equal((await error).retryable,true);
  f.e.snapshot=original;const before=seq(c),recovered=c.wait(s=>s.synchronization.sequence>before);f.r.refresh();await recovered;
 } finally {c.socket.disconnect();await f.r.close();f.db.close();}
});
