import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import Database from 'better-sqlite3';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.js';
import {Engine} from '../src/engine.js';
import {Planning} from '../src/planning.js';
import {TeamWeather} from '../src/team-weather.js';
import {createApp} from '../src/app.js';
test('Définition météo : trois équipes, édition sans quart, droits et valeurs contrôlées',async()=>{
 const db=openDatabase(':memory:'),e=new Engine(db,()=>Date.parse('2026-10-13T05:00:00+01:00'));e.initialize();const app=createApp(e,'test');
 await request(app).get('/api/manager/team-weather').expect(401);
 const list=await request(app).get('/api/manager/team-weather').set('Authorization','Bearer test').expect(200);assert.equal(list.body.teams.length,3);
 await request(app).put('/api/manager/team-weather/3').set('Authorization','Bearer test').send({mood:5,fatigue:2,note:'En forme'}).expect(200);
 assert.equal((new TeamWeather(db,e.clock).list()[2] as any).mood,5);assert.equal(e.snapshot().shift,null);
 for(const payload of [{mood:0,fatigue:2},{mood:3.5,fatigue:2},{mood:4,fatigue:null}])await request(app).put('/api/manager/team-weather/3').set('Authorization','Bearer test').send(payload).expect(400);
 await request(app).put('/api/manager/team-weather/999').set('Authorization','Bearer test').send({mood:5,fatigue:2}).expect(400);
 await request(app).post('/api/manager/weather-programs').set('Authorization','Bearer test').send({}).expect(410);
 await request(app).post('/api/manager/check-in').set('Authorization','Bearer test').send({}).expect(410);db.close();
});
test('La météo suit l’équipe dans les relèves et les jours, puis change seulement sur modification',()=>{
 let now=Date.parse('2026-10-13T05:00:00+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();const weather=new TeamWeather(db,()=>now);
 new Planning(db,()=>now).save([{date:'2026-10-13',templateId:1,teamId:1},{date:'2026-10-13',templateId:2,teamId:2},{date:'2026-10-13',templateId:3,teamId:3},{date:'2026-10-14',templateId:1,teamId:3}]);
 weather.save(1,{mood:2,fatigue:5});weather.save(2,{mood:3,fatigue:3});weather.save(3,{mood:5,fatigue:1});
 for(const [at,team,mood,fatigue] of [['2026-10-13T06:10:00+01:00',1,2,5],['2026-10-13T14:10:00+01:00',2,3,3],['2026-10-14T01:10:00+01:00',3,5,1],['2026-10-14T06:10:00+01:00',3,5,1]] as const){now=Date.parse(at);const s=e.snapshot();assert.equal(s.shift!.team_id,team);assert.equal(s.weather!.teamId,team);assert.equal(s.weather!.mood,mood);assert.equal(s.weather!.fatigue,fatigue);assert.equal(s.weather!.source,'team_setting');}
 weather.save(3,{mood:4,fatigue:2});assert.equal(e.snapshot().weather!.mood,4);assert.equal((weather.list()[0] as any).mood,2);db.close();
});
test('Météo persistante sur disque et commune aux scénarios, sans ancienne programmation prioritaire',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ch8-team-weather-')),path=join(dir,'db.sqlite');let now=Date.parse('2026-10-13T05:00:00+01:00'),db=openDatabase(path),e=new Engine(db,()=>now);e.initialize();new Planning(db,()=>now).save([{date:'2026-10-13',templateId:1,teamId:1}]);new TeamWeather(db,()=>now).save(3,{mood:5,fatigue:2,note:'Equipe C'});db.close();
 try{db=openDatabase(path);e=new Engine(db,()=>now);e.initialize();assert.equal((new TeamWeather(db,()=>now).list()[2] as any).note,'Equipe C');e.startScenario(1,undefined,3);assert.equal(e.snapshot().weather!.mood,5);assert.equal(e.snapshot().weather!.teamId,3);e.returnNormal();now=Date.parse('2026-10-13T06:10:00+01:00');assert.equal(e.snapshot().weather!.teamId,1);
 db.prepare("INSERT INTO weather_programs(starts_at,ends_at,shift_starts_at,mood,fatigue,note,created_at,updated_at) VALUES ('2026-10-13T05:00:00.000Z','2026-10-13T13:00:00.000Z','2026-10-13T05:00:00.000Z',1,5,'Archive','2026-10-13T04:00:00.000Z','2026-10-13T04:00:00.000Z')").run();assert.equal(e.snapshot().weather!.mood,3);assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});
test('Migration : dernière appréciation existante conservée, autres équipes initialisées sans suppression',()=>{
 const db=new Database(':memory:');db.exec(`CREATE TABLE teams(id INTEGER PRIMARY KEY);INSERT INTO teams VALUES(1),(2),(3);CREATE TABLE team_schedule(starts_at TEXT,team_id INTEGER);INSERT INTO team_schedule VALUES('2026-10-13T05:00:00Z',3);CREATE TABLE weather_programs(id INTEGER PRIMARY KEY,shift_starts_at TEXT,mood INTEGER,fatigue INTEGER,note TEXT,updated_at TEXT,cancelled_at TEXT);INSERT INTO weather_programs VALUES(1,'2026-10-13T05:00:00Z',5,2,'Préparée','2026-10-13T04:00:00Z',NULL);`);
 db.exec(readFileSync(new URL('../migrations/017-team-weather.sql',import.meta.url),'utf8'));
 assert.deepEqual(db.prepare('SELECT team_id,mood,fatigue FROM team_weather ORDER BY team_id').all(),[{team_id:1,mood:3,fatigue:3},{team_id:2,mood:3,fatigue:3},{team_id:3,mood:5,fatigue:2}]);assert.equal((db.prepare('SELECT COUNT(*) n FROM weather_programs').get() as any).n,1);db.close();
});
