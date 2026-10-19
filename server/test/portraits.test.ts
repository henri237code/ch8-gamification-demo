import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {Profiles} from '../src/profiles.js';
import {DEFAULT_PORTRAIT} from '../src/portraits.js';
test('Anniversaires : masquer sans personnes actives dans le mois ; photo facultative et silhouette commune',async()=>{
 let now=Date.parse('2026-10-31T23:59:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();
 db.prepare('UPDATE people SET birthday_month=NULL,birthday_day=NULL').run();
 assert.equal(e.snapshot().communication.birthdaysVisible,false);assert.deepEqual(e.snapshot().communication.birthdays,[]);
 const profiles=new Profiles(db,()=>now),id=profiles.save(undefined,{displayName:'Employé fictif',birthdayMonth:11,birthdayDay:2,teamId:1});
 assert.equal(e.snapshot().communication.birthdaysVisible,false);
 now=Date.parse('2026-11-01T00:01:00+01:00');const november=e.snapshot().communication;
 assert.equal(november.birthdaysVisible,true);assert.equal(november.birthdays.length,1);assert.equal(november.birthdays[0].id,id);
 assert.equal(november.birthdays[0].portraitUrl,DEFAULT_PORTRAIT);assert.equal(november.birthdays[0].hasPhoto,false);
 db.prepare('UPDATE people SET avatar_path=? WHERE id=?').run('/media/portraits/example.jpg',id);
 assert.equal(e.snapshot().communication.birthdays[0].portraitUrl,'/media/portraits/example.jpg');assert.equal(e.snapshot().communication.birthdays[0].hasPhoto,true);
 profiles.save(id,{displayName:'Employé fictif',birthdayMonth:11,birthdayDay:2,enabled:false});assert.equal(e.snapshot().communication.birthdaysVisible,false);
 // The selected portrait is retained when updating the other profile information.
 assert.equal((profiles.list().find((p:any)=>p.id===id) as any).portraitUrl,'/media/portraits/example.jpg');
 const app=createApp(e,'test');const icon=await request(app).get(DEFAULT_PORTRAIT).expect(200);assert.match(icon.headers['content-type'],/image\/svg\+xml/);db.close();
});
test('Reconnaissance individuelle : silhouette par défaut, photo prioritaire, sans modifier les badges équipe',()=>{
 const db=openDatabase(':memory:'),now=Date.parse('2026-10-10T12:00:00+01:00'),e=new Engine(db,()=>now);e.initialize();
 const id=e.submitContribution({kind:'kaizen',title:'Idée fictive',description:'Idée reconnue',personId:1});e.reviewContribution(id,'acknowledged');e.reviewContribution(id,'validated');
 const initial=e.snapshot().recognitions.find((r:any)=>r.contribution_id===id)!;assert.equal(initial.portraitUrl,DEFAULT_PORTRAIT);assert.equal(initial.hasPhoto,false);
 db.prepare('UPDATE people SET avatar_path=? WHERE id=1').run('/media/portraits/henri.jpg');
 const next=e.snapshot().recognitions.find((r:any)=>r.contribution_id===id)!;assert.equal(next.portraitUrl,'/media/portraits/henri.jpg');assert.equal(next.hasPhoto,true);
 e.startScenario(2);e.returnNormal();assert.equal(e.snapshot().recognitions.find((r:any)=>r.contribution_id===id)!.portraitUrl,'/media/portraits/henri.jpg');db.close();
});
