import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {Auth} from '../src/auth.js';
function setup() {
 let now=Date.parse('2026-10-10T12:30:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 return {db,e,app:createApp(e,'test-control'),advance:(ms:number)=>{now+=ms;}};
}
const credentials={username:'admin-demo',password:'public-test-admin-password'};
test('Login : identifiants exacts, session protégée, expiration et déconnexion',async()=>{
 const f=setup(),agent=request.agent(f.app);
 await agent.get('/api/manager/profiles').expect(401);
 await agent.post('/api/auth/login').send({...credentials,password:'incorrect'}).expect(401);
 const login=await agent.post('/api/auth/login').send(credentials).expect(200);
 assert.equal(login.body.account.username,credentials.username);assert.equal(login.body.token,undefined);
 const cookie=String(login.headers['set-cookie']);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 const stored=f.db.prepare('SELECT password_hash FROM manager_accounts WHERE id=1').get() as {password_hash:string};
 assert.match(stored.password_hash,/^scrypt:/);assert.ok(!stored.password_hash.includes(credentials.password));
 await agent.get('/api/auth/session').expect(200);await agent.get('/api/manager/profiles').expect(200);
 await agent.post('/api/manager/target').set('Origin','http://foreign.example').send({target:16000}).expect(403);
 await agent.post('/api/auth/logout').expect(200);await agent.get('/api/auth/session').expect(401);
 await agent.post('/api/auth/login').send(credentials).expect(200);f.advance(8*60*60*1000+1);
 await agent.get('/api/auth/session').expect(401);await agent.post('/api/manager/target').send({target:16000}).expect(401);f.db.close();
});
test('Login : limitation des tentatives et réouverture après délai',async()=>{
 const f=setup();for(let i=0;i<5;i++) await request(f.app).post('/api/auth/login').send({...credentials,password:'incorrect'}).expect(401);
 await request(f.app).post('/api/auth/login').send(credentials).expect(429);f.advance(10*60*1000+1);
 await request(f.app).post('/api/auth/login').send(credentials).expect(200);f.db.close();
});
test('Profils : anniversaire valide, affectation sans doublon, désactivation et conservation',async()=>{
 const f=setup(),agent=request.agent(f.app);await agent.post('/api/auth/login').send(credentials).expect(200);
 const input={displayName:'Portrait fictif',birthdayMonth:2,birthdayDay:29,teamId:2};
 const created=await agent.post('/api/manager/profiles').send(input).expect(201);const id=created.body.id;
 await agent.put(`/api/manager/profiles/${id}`).send({...input,teamId:3}).expect(200);
 await agent.put(`/api/manager/profiles/${id}`).send({...input,teamId:3}).expect(200);
 assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM team_memberships WHERE person_id=? AND ends_at IS NULL').get(id),{n:1});
 await agent.put('/api/manager/teams/3').send({name:'Equipe C démo'}).expect(200);
 f.e.startScenario(2);f.e.returnNormal();new Engine(f.db,f.e.clock).initialize();const next=createApp(f.e,'test-control');
 const cookie=(await agent.get('/api/manager/profiles').expect(200)).body;assert.equal(cookie.people.find((p:{id:number})=>p.id===id).team_name,'Equipe C démo');
 // Persisted sessions remain usable after rebuilding the server application.
 const auth=new Auth(f.db,f.e.clock);const session=await auth.login(credentials.username,credentials.password,'restart');assert.equal(session.status,200);
 if(session.status===200) await request(next).get('/api/manager/profiles').set('Cookie',`ch8_admin=${session.token}`).expect(200);
 await agent.put(`/api/manager/profiles/${id}`).send({...input,enabled:false}).expect(200);
 assert.ok(!f.e.snapshot().communication.birthdays.some((p:any)=>p.id===id));
 for(const invalid of [{...input,birthdayMonth:2,birthdayDay:30},{...input,birthdayMonth:null},{...input,teamId:999},{...input,displayName:''}]) await agent.post('/api/manager/profiles').send(invalid).expect(400);
 await agent.put('/api/manager/profiles/999').send(input).expect(400);
 assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
