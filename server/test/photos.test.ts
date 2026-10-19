import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {Photos,PHOTO_BYTES} from '../src/photos.js';
import {DEFAULT_PORTRAIT} from '../src/portraits.js';
const clock=()=>Date.parse('2026-10-10T12:30:00+01:00');
async function image(){return sharp({create:{width:900,height:600,channels:3,background:'#39a6aa'}}).png().toBuffer();}
test('Photo : ajout protégé, normalisation et visibilité commune aux anniversaires et distinctions',async()=>{
 const db=openDatabase(':memory:'),e=new Engine(db,clock);e.initialize();const app=createApp(e,'test'),buffer=await image();
 await request(app).put('/api/manager/profiles/1/photo').set('Content-Type','image/png').send(buffer).expect(401);
 const added=await request(app).put('/api/manager/profiles/1/photo').set('Authorization','Bearer test').set('Content-Type','image/png').send(buffer).expect(200);
 assert.equal(added.body.hasPhoto,true);assert.ok(added.body.width<=512&&added.body.height<=512);
 const served=await request(app).get(added.body.portraitUrl).expect(200).expect('Content-Type','image/webp');
 const meta=await sharp(served.body).metadata();assert.equal(meta.format,'webp');assert.equal(meta.orientation,undefined);
 assert.equal(e.snapshot().communication.birthdays.find(p=>p.id===1)!.portraitUrl,added.body.portraitUrl);
 const person=(await request(app).get('/api/manager/profiles').set('Authorization','Bearer test').expect(200)).body.people.find((p:any)=>p.id===1);assert.equal(person.portraitUrl,added.body.portraitUrl);
 db.close();
});
test('Photo : remplacement et retrait atomiques, ancien lien retiré et silhouette rétablie',async()=>{
 const db=openDatabase(':memory:'),e=new Engine(db,clock);e.initialize();const photos=new Photos(db,clock),app=createApp(e,'test'),buffer=await image();
 const first=await photos.save(1,buffer),second=await photos.save(1,buffer);assert.notEqual(first.portraitUrl,second.portraitUrl);
 assert.deepEqual(db.prepare('SELECT COUNT(*) n FROM portrait_assets WHERE person_id=1').get(),{n:1});await request(app).get(first.portraitUrl!).expect(404);
 await request(app).delete('/api/manager/profiles/1/photo').set('Authorization','Bearer test').expect(200);
 assert.equal(e.snapshot().communication.birthdays.find(p=>p.id===1)!.portraitUrl,DEFAULT_PORTRAIT);await request(app).get(second.portraitUrl!).expect(404);
 assert.deepEqual(db.prepare('SELECT COUNT(*) n FROM portrait_assets').get(),{n:0});db.close();
});
test('Photo : fichier invalide ou trop volumineux ne remplace pas le portrait existant',async()=>{
 const db=openDatabase(':memory:'),e=new Engine(db,clock);e.initialize();const photos=new Photos(db,clock),app=createApp(e,'test'),old=await photos.save(1,await image());
 for(const data of [Buffer.from('pas une photo'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')]) await request(app).put('/api/manager/profiles/1/photo').set('Authorization','Bearer test').set('Content-Type','image/png').send(data).expect(400);
 await request(app).put('/api/manager/profiles/1/photo').set('Authorization','Bearer test').set('Content-Type','image/png').send(Buffer.alloc(PHOTO_BYTES+1)).expect(413);
 await request(app).put('/api/manager/profiles/999/photo').set('Authorization','Bearer test').set('Content-Type','image/png').send(await image()).expect(400);
 assert.equal(e.snapshot().communication.birthdays.find(p=>p.id===1)!.portraitUrl,old.portraitUrl);db.close();
});
test('Photo : conservée dans SQLite après fermeture et changement de scénario',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ch8-portraits-'));let db=openDatabase(join(dir,'ch8.sqlite'));
 try{let e=new Engine(db,clock);e.initialize();const result=await new Photos(db,clock).save(1,await image());e.startScenario(2);e.returnNormal();db.close();
  db=openDatabase(join(dir,'ch8.sqlite'));e=new Engine(db,clock);e.initialize();await request(createApp(e,'test')).get(result.portraitUrl!).expect(200);
  assert.equal(e.snapshot().communication.birthdays.find(p=>p.id===1)!.portraitUrl,result.portraitUrl);assert.deepEqual(db.pragma('foreign_key_check'),[]);
  db.prepare('UPDATE people SET enabled=0 WHERE id=1').run();await request(createApp(e,'test')).get(result.portraitUrl!).expect(404);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
