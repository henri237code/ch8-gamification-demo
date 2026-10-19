import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/db.js';
import {Engine} from './planned-engine.js';
import {createApp} from '../src/app.js';
import {MINUTE,iso} from '../src/time.js';
function setup() {
 let now=Date.parse('2026-10-02T14:15:07+01:00');const db=openDatabase(':memory:'),e=new Engine(db,()=>now);e.initialize();e.startScenario(1);
 return {db,e,set:(at:number)=>{now=at;},now:()=>now};
}
test('Défi minute : fenêtre datée, résultat réel, récompense après clôture une seule fois',()=>{
 const f=setup(),id=f.e.assignChallenge({type:'timed_good_production',durationMinutes:2,target:1});
 let c=f.e.snapshot().challenges.find(c=>c.id===id)!;
 assert.equal(c.status,'ready');assert.equal(c.value,0);assert.equal(c.awardedBonus,0);
 f.set(Date.parse(c.startsAt)+MINUTE);c=f.e.snapshot().challenges.find(c=>c.id===id)!;
 assert.equal(c.status,'active');assert.ok(c.value>=1);assert.equal(c.awardedBonus,0);
 f.set(Date.parse(c.endsAt));c=f.e.snapshot().challenges.find(c=>c.id===id)!;
 assert.equal(c.status,'won');assert.equal(c.awardedBonus,50);
 const score=f.e.snapshot().production;assert.equal(score.score,score.productionPoints+score.overTargetBonus+score.challengeBonus);
 const events=f.db.prepare("SELECT COUNT(*) n FROM score_events WHERE challenge_id=?").get(id);
 new Engine(f.db,f.now).initialize();f.e.snapshot();assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM score_events WHERE challenge_id=?').get(id),events);
 f.db.close();
});
test('Arrêt sur toute la fenêtre : défi manqué, sans récompense inventée',()=>{
 const f=setup(),id=f.e.assignChallenge({type:'timed_good_production',durationMinutes:2,target:1});
 const initial=f.e.snapshot().challenges.find(c=>c.id===id)!;f.e.control('stop');f.set(Date.parse(initial.endsAt));
 const c=f.e.snapshot().challenges.find(c=>c.id===id)!;assert.equal(c.status,'missed');assert.equal(c.value,0);assert.equal(c.awardedBonus,0);
 f.db.close();
});
test('Référence comparable : résultat séparé et refus si les objectifs ne correspondent pas',()=>{
 const f=setup();const id=f.e.assignChallenge({type:'beat_reference'}),state=f.e.snapshot(),c=state.challenges.find(c=>c.id===id)!;
 assert.ok(c.reference);assert.equal(c.target,c.reference!.total!+1);assert.ok(c.value<1000);
 const existing=f.db.prepare('SELECT COUNT(*) n FROM manager_challenge_assignments').get();
 f.e.setTarget(16000);assert.throws(()=>f.e.assignChallenge({type:'beat_reference'}),/comparable/);
 assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM manager_challenge_assignments').get(),existing);
 assert.throws(()=>f.e.startScenario(4),/disponible/);
 f.e.returnNormal();assert.ok(!f.e.snapshot().challenges.some(c=>c.id===id));
 assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM manager_challenge_assignments').get(),existing);f.db.close();
});
test('Objectif du quart : défi actualisé, volumes et points déjà gagnés conservés',()=>{
 const f=setup(),before=f.e.snapshot();f.e.setTarget(14000);const after=f.e.snapshot();
 const goal=after.challenges.find(c=>c.type==='shift_target'&&c.status==='active')!;
 assert.equal(goal.target,14000);assert.equal(before.production.total,after.production.total);assert.equal(before.production.challengeBonus,after.production.challengeBonus);
 f.db.close();
});
test('Signal sécurité : validation explicite, y compris après passage de quart',()=>{
 const f=setup();f.e.setTarget(1000);
 const id=f.e.assignChallenge({type:'timed_good_production',durationMinutes:2,target:1});
 const start=f.e.snapshot(),c=start.challenges.find(c=>c.id===id)!;
 f.db.prepare("INSERT INTO safety_events(run_id,occurred_at,kind,note) VALUES (?,?,'near_miss','Signal fictif pour vérification')").run(start.runId,iso(Date.parse(c.startsAt)+MINUTE));
 f.set(Date.parse(c.endsAt));let item=f.e.snapshot().challenges.find(c=>c.id===id)!;
 assert.equal(item.status,'awaiting_validation');assert.equal(item.awardedBonus,0);
 f.e.control('next-shift');
 const oldScore=()=> (f.db.prepare('SELECT SUM(points) points FROM score_events WHERE shift_id=?').get(start.shift.id) as {points:number}).points;
 const before=oldScore();
 // Automatic challenges now resume after a manual window. Their bonuses share
 // the same cap: a late safety validation cannot exceed 100 points for the shift.
 const awarded=(f.db.prepare("SELECT COALESCE(SUM(points),0) n FROM score_events WHERE shift_id=? AND kind='challenge_bonus'").get(start.shift.id) as {n:number}).n;
 const expected=Math.max(0,Math.min(50,100-awarded));
 f.e.reviewChallenge(id,true,'Signal examiné pour cette démonstration');
 assert.equal(oldScore(),before+expected);f.e.reviewChallenge(id,true,'Même décision');assert.equal(oldScore(),before+expected);
 assert.equal((f.db.prepare('SELECT status FROM challenge_instances WHERE id=?').get(id) as {status:string}).status,'won');
 assert.equal((f.db.prepare('SELECT points FROM score_events WHERE challenge_id=?').get(id) as {points:number}).points,expected);
 assert.throws(()=>f.e.reviewChallenge(id,false,'Décision contraire'));
 const record=f.db.prepare("SELECT value FROM records WHERE run_id=? AND comparability_key=?").get(start.runId,`team:${start.shift.team_id}:target:1000:EXP65C`) as {value:number};
 assert.equal(record.value,oldScore());assert.deepEqual(f.db.pragma('foreign_key_check'),[]);f.db.close();
});
test('Plafond du quart : bonus de défi au plus 100, score final commun aux classements',()=>{
 const f=setup();f.e.control('next-shift');const s=f.e.snapshot();
 const rows=f.db.prepare("SELECT sh.id,SUM(CASE WHEN e.kind='challenge_bonus' THEN e.points ELSE 0 END) bonus FROM shifts sh JOIN score_events e ON e.shift_id=sh.id WHERE sh.run_id=? GROUP BY sh.id").all(s.runId) as {id:number;bonus:number}[];
 assert.ok(rows.length>=30);assert.ok(rows.every(r=>r.bonus<=100));assert.ok(rows.some(r=>r.bonus===100));
 assert.equal(s.production.challengeBonus,0);f.db.close();
});
test('API défis : commandes protégées et données invalides refusées sans annuler le défi actif',async()=>{
 const f=setup(),app=createApp(f.e,'challenge-test');
 await request(app).post('/api/manager/challenge').send({type:'shift_target'}).expect(401);
 const before=f.db.prepare('SELECT COUNT(*) n FROM challenge_instances').get();
 for(const body of [{type:'bad'},{type:'timed_good_production',durationMinutes:500},{type:'timed_good_production',target:0},{type:'shift_target',bonusPoints:101}]) {
   await request(app).post('/api/manager/challenge').auth('challenge-test',{type:'bearer'}).send(body).expect(400);
 }
 assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM challenge_instances').get(),before);
 await request(app).post('/api/manager/challenge').auth('challenge-test',{type:'bearer'}).send({type:'timed_good_production',durationMinutes:2}).expect(201);
 f.db.close();
});
