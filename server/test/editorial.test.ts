import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {Editorial} from '../src/editorial.js';
import {DEFAULT_PORTRAIT} from '../src/portraits.js';
function setup(){let now=Date.parse('2026-10-10T12:00:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();return {db,e,ed:new Editorial(db,()=>now),set:(v:string)=>{now=Date.parse(v);}};}
test('Contenus : dates réelles, icônes, ciblage, révisions, brouillons et archivage conservés',()=>{
 const f=setup(),id=f.ed.save(undefined,{kind:'sports',body:'CH8 : victoire 3–1',title:'Football',iconCode:'football',startsAt:'2026-10-10T12:05:00+01:00',endsAt:'2026-10-10T12:10:00+01:00'});
 assert.ok(!f.e.snapshot().communication.messages.some((m:any)=>m.id===id));f.set('2026-10-10T12:05:00+01:00');
 let item=f.e.snapshot().communication.messages.find((m:any)=>m.id===id) as any;assert.equal(item.icon_code,'football');assert.equal(item.title,'Football');
 f.ed.save(id,{body:'CH8 : victoire 4–1'});item=f.e.snapshot().communication.messages.find((m:any)=>m.id===id) as any;assert.equal(item.body,'CH8 : victoire 4–1');assert.equal(item.icon_code,'football');
 f.e.startScenario(2,Date.parse('2026-11-01T12:00:00+01:00'));
 f.e.returnNormal();assert.ok(f.e.snapshot().communication.messages.some((m:any)=>m.id===id));
 f.set('2026-10-10T12:10:00+01:00');assert.ok(!f.e.snapshot().communication.messages.some((m:any)=>m.id===id));
 f.ed.save(id,{startsAt:null,endsAt:null,status:'draft'});assert.ok(!f.e.snapshot().communication.messages.some((m:any)=>m.id===id));
 f.ed.save(id,{status:'published',teamId:f.e.snapshot().shift.team_id});assert.ok(f.e.snapshot().communication.messages.some((m:any)=>m.id===id));
 f.ed.save(id,{status:'archived'});new Engine(f.db,f.e.clock).initialize();assert.ok(!f.e.snapshot().communication.messages.some((m:any)=>m.id===id));
 assert.equal((f.ed.list().contents.find((m:any)=>m.id===id) as any).status,'archived');f.db.close();
});
test('Citations : archivage manuel, remplacement automatique et bibliothèque entièrement archivée',()=>{
 const f=setup(),id=f.ed.save(undefined,{kind:'quote',body:'Citation test'});f.e.selectQuote('manual',id,1);assert.equal(f.e.snapshot().communication.quote!.body,'Citation test');
 f.ed.save(id,{body:'Citation modifiée'});assert.equal(f.e.snapshot().communication.quote!.body,'Citation modifiée');
 f.ed.save(id,{status:'archived'});assert.notEqual(f.e.snapshot().communication.quote?.id,id);
 for(const row of f.ed.list().contents as {id:number;kind:string}[]) if(row.kind==='quote') f.ed.save(row.id,{status:'archived'});
 assert.equal(f.e.snapshot().communication.quote,null);f.e.startScenario(1);assert.equal(f.e.snapshot().communication.quote,null);
 new Engine(f.db,f.e.clock).initialize();assert.equal(f.e.snapshot().communication.quote,null);f.db.close();
});
test('Distinctions : un opérateur par mois, badge individuel unique, révocation et portraits',()=>{
 const f=setup(),id=f.ed.award({kind:'operator_month',personId:1,reason:'Entraide reconnue'});assert.equal(f.e.snapshot().operatorOfMonth!.portraitUrl,DEFAULT_PORTRAIT);
 assert.equal(f.ed.award({kind:'operator_month',personId:2,reason:'Nouvelle sélection'}),id);assert.equal(f.e.snapshot().operatorOfMonth!.person_id,2);
 const badge=f.ed.award({kind:'safety_badge',personId:2,badgeCode:'safety-01',reason:'Vigilance'});assert.equal(f.ed.award({kind:'safety_badge',personId:2,badgeCode:'safety-01',reason:'Motif actualisé'}),badge);
 f.e.startScenario(2,Date.parse('2026-11-01T12:00:00+01:00'));assert.equal(f.e.snapshot().operatorOfMonth!.person_id,2);f.e.returnNormal();new Engine(f.db,f.e.clock).initialize();assert.equal(f.e.snapshot().operatorOfMonth!.id,id);
 const teamBadge=f.e.awardBadge('safety-02',1,'Équipe attentive');f.ed.revoke(teamBadge);const replacement=f.e.awardBadge('safety-02',1,'Nouvelle attribution');assert.notEqual(replacement,teamBadge);
 f.ed.revoke(id);assert.equal(f.e.snapshot().operatorOfMonth,null);f.ed.revoke(badge);assert.ok(!f.e.snapshot().recognitions.some((r:any)=>r.id===badge));
 const future=f.ed.award({kind:'operator_month',personId:3,reason:'Prochain mois',month:'2026-11'});assert.equal(f.e.snapshot().operatorOfMonth,null);
 f.set('2026-11-01T00:00:00+01:00');assert.equal(f.e.snapshot().operatorOfMonth!.id,future);
 f.db.prepare('UPDATE people SET enabled=0 WHERE id=3').run();assert.equal(f.e.snapshot().operatorOfMonth,null);assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('API éditoriale : lecture et mutation protégées, paramètres invalides sans écriture',async()=>{
 const f=setup(),app=createApp(f.e,'test');await request(app).get('/api/manager/contents').expect(401);await request(app).post('/api/manager/recognitions').send({}).expect(401);
 const bad=[{body:'x',iconCode:'missing'},{body:'x',startsAt:'bad'},{body:'x',startsAt:'2026-10-11T00:00:00Z',endsAt:'2026-10-10T00:00:00Z'},{body:'x',screenNumber:9}];
 for(const body of bad)await request(app).post('/api/manager/content').set('Authorization','Bearer test').send(body).expect(400);
 await request(app).post('/api/manager/recognitions').set('Authorization','Bearer test').send({kind:'operator_month',personId:999,reason:'Test'}).expect(400);
 const c=await request(app).post('/api/manager/content').set('Authorization','Bearer test').send({kind:'event',body:'Rencontre',iconCode:'calendar'}).expect(201);
 await request(app).patch(`/api/manager/contents/${c.body.id}`).set('Authorization','Bearer test').send({status:'archived'}).expect(200);
 const r=await request(app).post('/api/manager/recognitions').set('Authorization','Bearer test').send({kind:'operator_month',personId:1,reason:'Test'}).expect(201);
 await request(app).delete(`/api/manager/recognitions/${r.body.id}`).set('Authorization','Bearer test').expect(200);f.db.close();
});
