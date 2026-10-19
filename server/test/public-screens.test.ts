import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from '../src/engine.js';
import {createApp} from '../src/app.js';
import {textPages,rotatingEntry,chartSegments,podiumOrder} from '../../client/src/publicData.js';

test('Écrans publics : tous les accès directs et mosaïque sont publics, chemins inconnus refusés',async()=>{
 const db=openDatabase(':memory:'),e=new Engine(db,()=>Date.parse('2026-10-13T12:00:00+01:00'));e.initialize();const app=createApp(e,'test');
 for(const path of ['/ecrans/1','/ecrans/2','/ecrans/3','/ecrans/4','/ecrans'])await request(app).get(path).expect(200).expect('Content-Type',/html/);
 await request(app).get('/ecrans/5').expect(404);await request(app).get('/api/manager/profiles').expect(401);db.close();
});
test('Contenus longs : pages bornées, texte complet conservé et mots longs pris en charge',()=>{
 const text=Array.from({length:200},(_,i)=>`mot${i}`).join(' '),pages=textPages(text);
 assert.ok(pages.every(p=>p.length<=140));assert.equal(pages.join(' '),text);
 const unbroken='a'.repeat(500);assert.equal(textPages(unbroken).join(''),unbroken);assert.ok(textPages(unbroken).every(p=>p.length<=140));
 assert.deepEqual(textPages(''),['']);
});
test('Rotation : chaque page de chaque publication est présentée avant de reboucler',()=>{
 const entries=[{id:1,body:'alpha beta gamma delta'},{id:2,body:'un deux trois quatre cinq'}];
 const count=entries.reduce((sum,e)=>sum+textPages(e.body,10).length,0);
 const shown=Array.from({length:count},(_,i)=>rotatingEntry(entries,i,e=>e.body,10)!);
 for(const entry of entries)assert.equal(shown.filter(p=>p.entry.id===entry.id).map(p=>p.body).join(' '),entry.body);
 assert.deepEqual(rotatingEntry(entries,count,e=>e.body,10),shown[0]);assert.equal(rotatingEntry([],0,()=>''),undefined);
});
test('Graphiques : absence de données préservée, variations exactes et échelles inférieures à une unité',()=>{
 assert.deepEqual(chartSegments([null,null],100),[]);
 const groups=chartSegments([10,20,null,15],20);assert.equal(groups.length,2);assert.ok(!groups.join(' ').includes('NaN'));
 assert.equal(chartSegments([.1,.2],.2,500,140,0)[0],'45,70 480,20');
});
test('Sans quart : Kaizen et publications restent disponibles aux écrans, météo et qualité restent sans équipe fictive',async()=>{
 const db=openDatabase(':memory:'),e=new Engine(db,()=>Date.parse('2026-10-13T12:00:00+01:00'));e.initialize();const app=createApp(e,'test'),auth={Authorization:'Bearer test'};
 const idea=await request(app).post('/api/manager/contributions').set(auth).send({kind:'kaizen',title:'Améliorer les repères',description:'Mieux identifier les emballages.'}).expect(201);
 await request(app).post(`/api/manager/contributions/${idea.body.id}/review`).set(auth).send({status:'validated'}).expect(200);
 await request(app).post('/api/manager/content').set(auth).send({kind:'event',title:'Réunion',body:'Un échange pour partager les idées.',screenNumber:4}).expect(201);
 const s=(await request(app).get('/api/state').expect(200)).body;
 assert.equal(s.shift,null);assert.equal(s.weather,null);assert.equal(s.quality.conformity,null);assert.equal(s.kaizen.submitted,1);assert.equal(s.kaizen.validated,1);assert.ok(s.communication.messages.some((m:any)=>m.title==='Réunion'));
 assert.ok(s.communication.birthdays.every((p:any)=>typeof p.portraitUrl==='string'));assert.deepEqual(db.pragma('foreign_key_check'),[]);db.close();
});

test('Podium : les équipes ex æquo restent toutes visibles',()=>{
 const teams=[{id:1,rank:1},{id:2,rank:1},{id:3,rank:3}];
 assert.equal(podiumOrder(teams).length,3);assert.deepEqual(podiumOrder(teams).map(t=>t.id).sort(),[1,2,3]);
 assert.equal(podiumOrder([{id:1,rank:1}])[0].id,1);
});

test('Podium : trois emplacements conservés avec deux, un ou aucun résultat',()=>{
 for(const ranks of [[1,2,null],[1,null,null],[null,null,null]]){
  const teams=ranks.map((rank,i)=>({id:i+1,rank}));
  const ordered=podiumOrder(teams);
  assert.equal(ordered.length,3);
  assert.deepEqual(ordered.map(t=>t.id).sort(),[1,2,3]);
  assert.equal(ordered.filter(t=>t.rank===null).length,ranks.filter(r=>r===null).length);
  if(ranks[0]===1)assert.equal(ordered[1].id,1);
 }
});
