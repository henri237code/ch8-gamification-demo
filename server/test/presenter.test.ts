import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
function setup(){let now=Date.parse('2026-10-10T14:10:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,app:createApp(e,'test'),advance:(n:number)=>{now+=n;}};}
const credentials={username:'presenter-demo',password:'public-test-presenter-password'};
test('Présentateur : login exact, commandes pilotage autorisées, administration refusée',async()=>{
 const f=setup(),agent=request.agent(f.app);
 await agent.post('/api/pilot/scenario').send({scenarioId:1}).expect(401);
 const login=await agent.post('/api/auth/login').send(credentials).expect(200);assert.equal(login.body.account.role,'presenter');assert.match(String(login.headers['set-cookie']),/ch8_presenter=/);
 const saved=f.db.prepare('SELECT password_hash FROM manager_accounts WHERE login=?').get(credentials.username) as {password_hash:string};assert.match(saved.password_hash,/^scrypt:/);assert.ok(!saved.password_hash.includes(credentials.password));
 await agent.get('/api/auth/session?space=pilot').expect(200);await agent.get('/api/auth/session?space=manager').expect(401);
 await agent.post('/api/pilot/scenario').send({scenarioId:2}).expect(200);await agent.post('/api/pilot/control').send({action:'pause'}).expect(200);
 await agent.post('/api/pilot/control').set('Origin','http://foreign.example').send({action:'resume'}).expect(403);
 await agent.get('/api/manager/profiles').expect(403);await agent.post('/api/manager/target').send({target:16000}).expect(403);
 await agent.post('/api/manager/content').send({body:'Interdit'}).expect(403);await agent.post('/api/manager/recognitions').send({kind:'operator_month',personId:1,reason:'Interdit'}).expect(403);
 await agent.post('/api/pilot/normal').expect(200);await agent.post('/api/auth/logout').send({space:'pilot'}).expect(200);await agent.post('/api/pilot/control').send({action:'pause'}).expect(401);f.db.close();
});
test('Sessions distinctes : connexion admin conservée après déconnexion du présentateur, expiration et redémarrage',async()=>{
 const f=setup(),agent=request.agent(f.app);await agent.post('/api/auth/login').send({username:'admin-demo',password:'public-test-admin-password'}).expect(200);
 const login=await agent.post('/api/auth/login').send(credentials).expect(200);await agent.get('/api/manager/profiles').expect(200);
 assert.equal((await agent.get('/api/auth/session?space=pilot').expect(200)).body.account.role,'presenter');
 const raw=String(login.headers['set-cookie']).split(';')[0];const hash=f.db.prepare('SELECT password_hash FROM manager_accounts WHERE login=?').get(credentials.username);
 const next=createApp(f.e,'test');assert.deepEqual(f.db.prepare('SELECT password_hash FROM manager_accounts WHERE login=?').get(credentials.username),hash);
 await request(next).get('/api/auth/session?space=pilot').set('Cookie',raw).expect(200);
 await agent.post('/api/auth/logout').send({space:'pilot'}).expect(200);await agent.get('/api/manager/profiles').expect(200);await request(next).get('/api/auth/session?space=pilot').set('Cookie',raw).expect(401);
 await agent.post('/api/auth/login').send(credentials).expect(200);f.advance(8*60*60*1000+1);await agent.get('/api/auth/session?space=pilot').expect(401);await agent.post('/api/pilot/normal').expect(401);
 assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('Pilotage : un ancien appareil ne peut pas modifier une nouvelle simulation',async()=>{
 const f=setup(),agent=request.agent(f.app);await agent.post('/api/auth/login').send(credentials).expect(200);
 const old=f.e.snapshot().runId;
 const launched=await agent.post('/api/pilot/guide').send({scenarioId:1,teamId:1,expectedRunId:old}).expect(200);
 const current=launched.body.runId;assert.notEqual(current,old);
 for(const [path,body] of [['control',{action:'resume'}],['normal',{}],['guide',{scenarioId:2,teamId:2}],['normal-stop',{machineId:4,affectsLine:true,note:'ancien contexte'}]] as const){
  await agent.post('/api/pilot/'+path).send({...body,expectedRunId:old}).expect(400);assert.equal(f.e.snapshot().runId,current);
 }
 await agent.post('/api/pilot/control').send({action:'resume',expectedRunId:current}).expect(200);
 await request(f.app).get('/api/pilot/normal-stoppages').expect(401);
 const stops=await agent.get('/api/pilot/normal-stoppages').expect(200);assert.ok(Array.isArray(stops.body.openStops));
 await agent.get('/api/manager/stoppages').expect(403);f.db.close();
});
