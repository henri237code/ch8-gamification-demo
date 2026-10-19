import type { DB } from './db.js';
import { seedReference } from './db.js';
import { DAY, HOUR, MINUTE, historyStart, iso, localDate, localMidnight, monthStart, shiftAt, weekStart } from './time.js';
import {Challenges,type ChallengeContext} from './challenges.js';
import {InputError} from './errors.js';
import {Indicators} from './indicators.js';
import {portrait} from './portraits.js';
import {LineRecords} from './records.js';
import {GUIDES,guideForSession} from './guides.js';
import {shiftPace} from './production-profile.js';
import {calibratedPreset} from './express-presets.js';
import {FieldCalibration,fieldRate,fieldShape,performance,roundScore} from './field-calibration.js';
import type {Program} from './programming.js';
export {InputError} from './errors.js';

type Run = { id: number; scenario_id: number; seed: number; simulated_at: string; clock_mode: 'real'|'scenario'; status: string; speed: number;calibration_id:number|null };
type Shift = { id: number; team_id: number; template_id: number; starts_at: string; ends_at: string; status: string; assignment_source:string; production_model_version:number;calibrated_from:string|null;calibration_id:number|null;score_divisor:number };
type Segment = { id: number; target_good_bottles: number; work_order_id: number;planned_bph:number };
type Volume = { total: number; rejected: number };
export class Engine {
  private challenges:Challenges;
  public calibration:FieldCalibration;
  enableFieldCalibration(){return this.calibration.enable();}
  private indicators:Indicators;
  constructor(public db: DB, public clock: () => number = Date.now) { seedReference(db);this.calibration=new FieldCalibration(db,clock);this.challenges=new Challenges(db);this.indicators=new Indicators(db); }
  private q<T>(sql: string, ...args: (string|number|null)[]): T { return this.db.prepare(sql).get(...args) as T; }
  private rows<T>(sql: string, ...args: (string|number|null)[]): T[] { return this.db.prepare(sql).all(...args) as T[]; }
  private run(id: number): Run { const r = this.q<Run>('SELECT * FROM simulation_runs WHERE id=?',id); if(!r) throw new InputError('Simulation inconnue'); return r; }
  private pointer(table: 'normal_simulation'|'active_simulation') { return this.q<{run_id:number}>(`SELECT run_id FROM ${table} WHERE singleton=1`)?.run_id; }
  initialize() {
    if (!this.pointer('normal_simulation')) {
      this.db.transaction(() => {
        const id = this.createRun(1, this.clock(), 'real');
        this.db.prepare('INSERT INTO normal_simulation VALUES (1,?)').run(id);
        this.db.prepare('INSERT INTO active_simulation VALUES (1,?)').run(id);
      })();
    }
    this.tick();
    // Upgrade existing installations once per missing shift, without replacing
    // production history or manager content. New shifts get challenges below.
    const missing=this.rows<{run_id:number;starts_at:string;status:string}>(`SELECT sh.run_id,sh.starts_at,sh.status FROM shifts sh
      WHERE NOT EXISTS(SELECT 1 FROM challenge_instances c WHERE c.shift_id=sh.id) ORDER BY sh.starts_at`);
    this.db.transaction(()=>{for(const old of missing) {
      const run=this.run(old.run_id),{shift,segment}=this.ensureShift(run,Date.parse(old.starts_at));
      if(old.status==='completed') this.finalize(run,shift,segment);
    }})();
  }
  private createRun(scenario: number, at: number, mode: 'real'|'scenario',teamId?:number) {
    if (!this.q('SELECT 1 FROM scenarios WHERE id=?',scenario)) throw new InputError('Scénario inconnu');
    const start = historyStart(at);
    const id = Number(this.db.prepare("INSERT INTO simulation_runs(scenario_id,line_id,scoring_rule_id,status,clock_mode,simulated_at,speed,seed,created_at) VALUES (?,1,1,'running',?,?,1,?,?)")
      .run(scenario,mode,iso(start),101+scenario,iso(this.clock())).lastInsertRowid);
    if(teamId!==undefined) {
      const sh=shiftAt(at),day=Math.floor(localMidnight(sh.start)/DAY),base=((day+sh.index)%3+3)%3;
      this.db.prepare('INSERT INTO run_team_config VALUES (?,?,?)').run(id,((teamId-1-base)%3+3)%3,teamId);
    }
    const calibration=this.calibration.latest();
    if(calibration)this.db.prepare('UPDATE simulation_runs SET calibration_id=?,scoring_rule_id=2 WHERE id=?').run(calibration.id,id);
    this.db.prepare('INSERT INTO run_runtime VALUES (?,?,?)').run(id,iso(this.clock()),iso(at));
    this.db.prepare("INSERT INTO safety_events(run_id,occurred_at,kind,note) VALUES (?,?,'baseline','Référence fictive : dix jours sans accident au démarrage')")
      .run(id,iso(localMidnight(at)-10*DAY));
    this.advance(id,at);
    return id;
  }
  private hasWork(run:Run,at:number) {
    if(run.clock_mode==='scenario') return true;
    const start=iso(shiftAt(at).start);
    return !!this.q('SELECT 1 FROM team_schedule WHERE line_id=1 AND starts_at=?',start)
      ||!!this.q('SELECT 1 FROM shifts WHERE run_id=? AND starts_at=?',run.id,start);
  }
  /** Defaults are captured at the beginning of a shift, independent of production cadence. */
  private baseTargetAt(at:number) {
    return this.q<{target:number}>('SELECT target FROM production_target_defaults WHERE effective_from<=? ORDER BY effective_from DESC LIMIT 1',iso(at))?.target??15000;
  }
  baseTarget() {
    const now=this.clock(),next=this.q<{target:number;effective_from:string}>('SELECT target,effective_from FROM production_target_defaults ORDER BY effective_from DESC LIMIT 1');
    return {current:this.baseTargetAt(shiftAt(now).start),target:next.target,effectiveFrom:next.effective_from,pending:Date.parse(next.effective_from)>now};
  }
  setBaseTarget(target:unknown) {
    if(typeof target!=='number'||!Number.isInteger(target)||target<1||target>1000000)throw new InputError('Objectif de base entier requis, entre 1 et 1 000 000 bouteilles');
    this.tick();
    const effective=iso(shiftAt(this.clock()).end);
    this.db.transaction(()=>{
      this.db.prepare('INSERT INTO production_target_defaults(target,effective_from,created_at) VALUES (?,?,?) ON CONFLICT(effective_from) DO UPDATE SET target=excluded.target,created_at=excluded.created_at').run(target,effective,iso(this.clock()));
      this.audit('base_target',1,{target,effectiveFrom:effective});
    })();
    return this.baseTarget();
  }
  private ensureShift(run: Run, at: number): { shift: Shift; segment: Segment } {
    const s = shiftAt(at);
    if(!this.hasWork(run,at)) throw new InputError('Aucun quart planifié à cet instant');
    let shift = this.q<Shift>('SELECT * FROM shifts WHERE run_id=? AND starts_at=?',run.id,iso(s.start));
    if (!shift) {
      const calibration=this.calibration.forShift(run,s.start);
      const day = Math.floor(localMidnight(s.start)/DAY);
      const offset=this.q<{rotation_offset:number}>('SELECT rotation_offset FROM run_team_config WHERE run_id=?',run.id)?.rotation_offset??0;
      const choice=run.clock_mode==='real'
        ?this.q<{team_id:number}>('SELECT team_id FROM team_schedule WHERE line_id=1 AND starts_at=?',iso(s.start))
        :this.q<{team_id:number}>('SELECT team_id FROM scenario_shift_teams WHERE run_id=? AND starts_at=?',run.id,iso(s.start));
      const team = choice?.team_id??((day+s.index+offset)%3+3)%3+1;
      const assignmentSource=choice?(run.clock_mode==='real'?'manager_planning':'presenter'):(offset||this.q('SELECT 1 FROM run_team_config WHERE run_id=?',run.id)?'presenter':'rotation');
      const id = Number(this.db.prepare("INSERT INTO shifts(run_id,template_id,team_id,supervisor_id,starts_at,ends_at,status,historical_seed,production_model_version) VALUES (?,?,?,?,?,?,'active',?,2)")
        .run(run.id,s.templateId,team,team,iso(s.start),iso(s.end),s.end <= this.clock()?1:0).lastInsertRowid);
      this.db.prepare('UPDATE shifts SET assignment_source=?,calibration_id=?,score_divisor=? WHERE id=?').run(assignmentSource,calibration?.id??null,calibration?100:1,id);
      // An order spans the three daily shifts, including the night shift.
      const productionDay = localMidnight(s.start);
      const ref = `DEMO-${localDate(productionDay)}`;
      this.db.prepare('INSERT OR IGNORE INTO work_orders(run_id,reference,product_id,target_bottles,starts_at,ends_at) VALUES (?,?,1,?,?,?)')
        .run(run.id,ref,calibration?calibration.base_target*3:45000,iso(productionDay+6*HOUR),iso(productionDay+30*HOUR));
      const order = this.q<{id:number}>('SELECT id FROM work_orders WHERE run_id=? AND reference=?',run.id,ref);
      this.db.prepare('INSERT INTO shift_order_segments(shift_id,work_order_id,starts_at,ends_at,target_good_bottles,planned_bph) VALUES (?,?,?,?,?,?)')
        .run(id,order.id,iso(s.start),iso(s.end),calibration&&run.clock_mode==='scenario'?this.baseTarget().target:this.baseTargetAt(s.start),calibration?calibration.nominal_bph:1875);
      // Seeded interruptions are fixed once per shift. No unrelated random counters.
      const n = ((Math.floor(s.start/HOUR)*17 + run.seed*31) % 97 + 97)%97;
      const stopStart = s.start + (110+n)*MINUTE;
      // The guided interruption creates its own stop. A second seeded stop in
      // this scenario could overlap it and leave the line stopped after repair.
      if(calibration&&run.scenario_id!==2){
        fieldShape(iso(s.start),team,run.seed).forEach((value,hour)=>{if(value===0)this.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,ends_at,affects_line) VALUES (?,?,4,1,?,?,1)').run(run.id,id,iso(s.start+hour*HOUR),iso(s.start+(hour+1)*HOUR));});
      }
      if(!calibration&&run.scenario_id!==2) this.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,ends_at,affects_line) VALUES (?,?,4,1,?,?,1)')
        .run(run.id,id,iso(stopStart),iso(stopStart+(5+n%13)*MINUTE));
      for(let i=0;i<5;i++) this.db.prepare('INSERT INTO wellbeing_responses(shift_id,response_key,mood,fatigue,submitted_at) VALUES (?,?,?,?,?)')
        .run(id,`fiction-${i}`,3+(n+i)%3,1+(n+i)%3,iso(s.start));
      const quotes=this.rows<{id:number}>("SELECT id FROM editorial_contents WHERE kind='quote' AND status='published' ORDER BY id");
      const quoteId = quotes.length?quotes[((day+s.index)%quotes.length+quotes.length)%quotes.length].id:null;
      if(quoteId!==null) this.db.prepare("INSERT INTO shift_quote_selections(shift_id,content_id,selected_by_team_id,source,selected_at) VALUES (?,?,?,'automatic',?)").run(id,quoteId,team,iso(s.start));
      shift=this.q<Shift>('SELECT * FROM shifts WHERE id=?',id);
    }
    const segment=this.q<Segment>('SELECT * FROM shift_order_segments WHERE shift_id=?',shift.id);
    this.challenges.ensureDefaults(this.challengeContext(run,shift,segment));
    return {shift,segment};
  }
  private challengeContext(run:Run,shift:Shift,segment:Segment):ChallengeContext {
    return {runId:run.id,scenarioId:run.scenario_id,shiftId:shift.id,teamId:shift.team_id,templateId:shift.template_id,
      start:Date.parse(shift.starts_at),end:Date.parse(shift.ends_at),target:this.effectiveTarget(run.id,segment),plannedBph:segment.planned_bph,
      calibrated:!!shift.calibration_id,productId:this.q<{product_id:number}>('SELECT product_id FROM work_orders WHERE id=?',segment.work_order_id).product_id};
  }
  /** Apply normal administrative programs on the production timeline, including catch-up.
   * Temporary runs never consume these programs or receipts. */
  private applyPrograms(run:Run,shift:Shift,segment:Segment,at:number) {
    if(run.clock_mode!=='real')return;
    const programs=this.rows<Program>("SELECT * FROM admin_programs WHERE cancelled_at IS NULL AND shift_starts_at=? AND starts_at<=? ORDER BY starts_at,id",shift.starts_at,iso(at));
    for(const p of programs){
      let receipt=this.q<{baseline_target:number;finished_at:string|null}>('SELECT * FROM admin_program_receipts WHERE program_id=? AND run_id=?',p.id,run.id);
      if(!receipt){
        const payload=JSON.parse(p.payload_json),baseline=this.effectiveTarget(run.id,segment);
        this.db.prepare('INSERT INTO admin_program_receipts(program_id,run_id,started_at,baseline_target) VALUES (?,?,?,?)').run(p.id,run.id,p.starts_at,baseline);
        if(p.kind==='target')this.writeProgramTarget(run,shift,segment,p,payload.target,p.starts_at);
        else {
          const id=this.challenges.assign(this.challengeContext(run,shift,segment),Date.parse(p.starts_at),payload,this.clock(),true);
          this.db.prepare('UPDATE admin_program_receipts SET instance_id=? WHERE program_id=? AND run_id=?').run(id,p.id,run.id);
        }
        receipt={baseline_target:baseline,finished_at:null};
      }
      // Repair an unfinished programmed window cancelled by the former whole-shift form.
      // Explicit rejected reviews and already elapsed history are preserved.
      if(p.kind==='challenge'&&at<Date.parse(p.ends_at))this.db.prepare(`UPDATE challenge_instances SET status='ready',resume_automatic=1 WHERE id=(SELECT instance_id FROM admin_program_receipts WHERE program_id=? AND run_id=?) AND status='cancelled' AND NOT EXISTS(SELECT 1 FROM challenge_reviews WHERE instance_id=challenge_instances.id)`).run(p.id,run.id);
      if(!receipt.finished_at&&at>=Date.parse(p.ends_at)){
        // A full-shift target remains the final scoring reference. A shorter override restores its previous goal.
        if(p.kind==='target'&&p.ends_at<shift.ends_at)this.writeProgramTarget(run,shift,segment,p,receipt.baseline_target,p.ends_at);
        this.db.prepare('UPDATE admin_program_receipts SET finished_at=? WHERE program_id=? AND run_id=?').run(p.ends_at,p.id,run.id);
      }
    }
  }
  private writeProgramTarget(run:Run,shift:Shift,segment:Segment,p:Program,value:number,at:string){
    const id=Number(this.db.prepare("INSERT INTO manager_targets(line_id,team_id,shift_template_id,product_id,kind,target_value,unit,valid_from,valid_until,created_by,created_at,run_scope) VALUES (1,?,?,1,'shift_production',?,'bottles',?,?,1,?,?)").run(shift.team_id,shift.template_id,value,p.starts_at,p.ends_at,iso(this.clock()),run.id).lastInsertRowid);
    this.db.prepare("INSERT INTO target_applications(run_id,segment_id,manager_target_id,kind,effective_value,unit,applied_at,source) VALUES (?,?,?,'shift_production',?,'bottles',?,'manager')").run(run.id,segment.id,id,value,at);
  }
  private volume(shiftId: number): Volume {
    return this.q<Volume>(`SELECT COALESCE(SUM(p.total_bottles),0) total, COALESCE(SUM(p.rejected_bottles),0) rejected
      FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id WHERE s.shift_id=?`,shiftId);
  }
  private effectiveTarget(runId: number, segment: Segment) {
    const app = this.q<{effective_value:number}>('SELECT effective_value FROM target_applications WHERE run_id=? AND segment_id=? ORDER BY id DESC LIMIT 1',runId,segment.id);
    return app?.effective_value ?? segment.target_good_bottles;
  }
  private rate(run: Run, shift: Shift, minute: number) {
    if(shift.calibration_id&&(!shift.calibrated_from||Date.parse(shift.starts_at)+minute*MINUTE>=Date.parse(shift.calibrated_from))){const rate=fieldRate(shift.starts_at,shift.team_id,run.seed,minute);return run.scenario_id===2?Math.max(24000,rate):rate;}
    const day = Math.floor(Date.parse(shift.starts_at)/DAY);
    const variation = ((day*13+run.seed+minute*7)%19+19)%19 / 100;
    const favored = this.q<{favored_team_id:number}>('SELECT favored_team_id FROM run_team_config WHERE run_id=?',run.id)?.favored_team_id??(run.scenario_id-1)%3+1;
    const pace=shift.production_model_version===2?shiftPace(shift.starts_at,shift.team_id,run.seed):1;
    return 1875*pace*(0.94+variation+(shift.team_id===favored?0.08:0));
  }
  private stoppedMs(runId: number, start: number, end: number) {
    const stops = this.rows<{starts_at:string;ends_at:string|null}>(
      'SELECT starts_at,ends_at FROM stoppages WHERE run_id=? AND affects_line=1 AND starts_at<? AND (ends_at IS NULL OR ends_at>?) ORDER BY starts_at',runId,iso(end),iso(start));
    let total=0, until=start;
    for(const stop of stops) {
      const a=Math.max(start,Date.parse(stop.starts_at),until), b=Math.min(end,stop.ends_at?Date.parse(stop.ends_at):end);
      if(b>a) {total+=b-a;until=b;}
    }
    return total;
  }
  advance(runId: number, at: number) {
    const run=this.run(runId), previous=Date.parse(run.simulated_at);
    if(at<previous) throw new InputError('Impossible de reculer cette simulation');
    if(at===previous) return;
    this.db.transaction(() => {
      // Revisit the last partial minute: upsert its full prefix, never add it twice.
      let cursor=Math.floor(previous/MINUTE)*MINUTE;
      const eventInsert=this.db.prepare("INSERT INTO simulation_events(run_id,event_key,simulated_at,event_type,payload_json) VALUES (?,?,?,'production','{}') ON CONFLICT(run_id,event_key) DO UPDATE SET simulated_at=excluded.simulated_at RETURNING id");
      const interval=this.db.prepare(`INSERT INTO production_intervals(segment_id,event_id,starts_at,ends_at,total_bottles,rejected_bottles) VALUES (?,?,?,?,?,?)
        ON CONFLICT(event_id) DO UPDATE SET ends_at=excluded.ends_at,total_bottles=excluded.total_bottles,rejected_bottles=excluded.rejected_bottles`);
      const energy=this.db.prepare('INSERT INTO energy_intervals(run_id,starts_at,ends_at,consumption_wh) VALUES (?,?,?,?) ON CONFLICT(run_id,starts_at,ends_at) DO NOTHING');
      while(cursor<at) {
        if(!this.hasWork(run,cursor)) {cursor=Math.min(at,shiftAt(cursor).end);continue;}
        const {shift,segment}=this.ensureShift(run,cursor);
        this.applyPrograms(run,shift,segment,cursor);
        const end=Math.min(cursor+MINUTE,at,Date.parse(shift.ends_at));
        const active=(end-cursor-this.stoppedMs(runId,cursor,end))/HOUR;
        const minute=Math.floor((cursor-Date.parse(shift.starts_at))/MINUTE);
        const bottles=Math.floor(this.rate(run,shift,minute)*active);
        const rejects=(minute+run.seed)%23===0?Math.floor(bottles*0.05):0;
        const event=eventInsert.get(runId,`minute:${cursor}`,iso(end)) as {id:number};
        interval.run(segment.id,event.id,iso(cursor),iso(end),bottles,rejects);
        // Replace a partial energy interval when extending the same minute.
        this.db.prepare('DELETE FROM energy_intervals WHERE run_id=? AND starts_at=?').run(runId,iso(cursor));
        energy.run(runId,iso(cursor),iso(end),Math.round(active*80000+((end-cursor)/HOUR-active)*20000));
        if(end===Date.parse(shift.ends_at)) {this.applyPrograms(run,shift,segment,end);this.finalize(run,shift,segment);}
        cursor=end;
      }
      this.db.prepare('UPDATE simulation_runs SET simulated_at=? WHERE id=?').run(iso(at),runId);
      if(this.hasWork(run,at)) {const current=this.ensureShift(run,at);
      this.applyPrograms(run,current.shift,current.segment,at);
      this.challenges.sync(this.challengeContext(run,current.shift,current.segment),at);}
    })();
  }
  private finalize(run: Run, shift: Shift, segment: Segment) {
    this.challenges.sync(this.challengeContext(run,shift,segment),Date.parse(shift.ends_at));
    const v=this.volume(shift.id), target=this.effectiveTarget(run.id,segment);
    const values: [string,number][]=[['production_final',roundScore(v.total/shift.score_divisor)],['over_target_bonus',roundScore(Math.max(0,Math.floor((v.total-target)/100))*10/shift.score_divisor)],['quality_bonus',v.total>0&&v.rejected===0?50:0]];
    for(const [kind,points] of values) this.db.prepare('INSERT OR IGNORE INTO score_events(run_id,shift_id,rule_version_id,event_key,kind,points,simulated_at,explanation) VALUES (?,?,?,?,?,?,?,?)')
      .run(run.id,shift.id,shift.score_divisor===100?2:1,`${shift.id}:${kind}`,kind,points,shift.ends_at,'Barème provisoire : production simulée et bonus');
    this.db.prepare("UPDATE shifts SET status='completed' WHERE id=?").run(shift.id);
    const score=roundScore(this.q<{value:number}>('SELECT COALESCE(SUM(points),0) value FROM score_events WHERE shift_id=?',shift.id).value);
    this.db.prepare(`INSERT INTO records(run_id,kind,team_id,value,unit,period_start,period_end,comparability_key,historical_seed)
      VALUES (?,'team_score',?,?,'points',?,?,?,1) ON CONFLICT(run_id,kind,comparability_key) DO UPDATE SET value=excluded.value,period_start=excluded.period_start,period_end=excluded.period_end WHERE excluded.value>records.value`)
      .run(run.id,shift.team_id,score,shift.starts_at,shift.ends_at,`team:${shift.team_id}:target:${target}:EXP65C${shift.score_divisor===100?':scale:100':''}`);
  }
  tick() {
    const now=this.clock(), normal=this.pointer('normal_simulation');
    if(normal) this.advance(normal,Math.max(now,Date.parse(this.run(normal).simulated_at)));
    const active=this.pointer('active_simulation');
    if(active && active!==normal) {
      const run=this.run(active);
      if(run.status==='running') {
        const rt=this.q<{wall_anchor:string;simulated_anchor:string}>('SELECT * FROM run_runtime WHERE run_id=?',active);
        const at=Date.parse(rt.simulated_anchor)+Math.max(0,now-Date.parse(rt.wall_anchor))*run.speed;
        this.advance(active,Math.max(at,Date.parse(run.simulated_at)));
      }
    }
  }
  startScenario(scenarioId: number, at=this.clock(),teamId?:number) {
    if(!Number.isInteger(scenarioId)||!GUIDES.some(guide=>guide.id===scenarioId)) throw new InputError('Choisir un scénario disponible');
    if(!Number.isFinite(at)||Math.abs(at-this.clock())>31*DAY) throw new InputError('Date de scénario limitée à 31 jours autour de maintenant');
    if(teamId!==undefined&&(!Number.isInteger(teamId)||!this.q('SELECT 1 FROM teams WHERE id=?',teamId))) throw new InputError('Équipe inconnue');
    this.tick();
    return this.db.transaction(() => {
      const previous=this.pointer('active_simulation');
      if(previous && previous!==this.pointer('normal_simulation')) this.db.prepare("UPDATE simulation_runs SET status='archived' WHERE id=?").run(previous);
      const id=this.createRun(scenarioId,at,'scenario',teamId);
      this.db.prepare('UPDATE active_simulation SET run_id=? WHERE singleton=1').run(id);
      return id;
    })();
  }
  guideCatalog() {return GUIDES;}
  startGuide(scenarioId:number,teamId:number,at?:number) {
    const guide=GUIDES.find(g=>g.id===scenarioId);
    if(!guide) throw new InputError('Parcours inconnu');
    if(!Number.isInteger(teamId)||!this.q('SELECT 1 FROM teams WHERE id=?',teamId)) throw new InputError('Choisir une équipe valide avant le lancement');
    const initial=at??(scenarioId===5?this.clock():shiftAt(this.clock()).start+guide.offsetMinutes*MINUTE);
    return this.db.transaction(()=>{
      const id=this.startScenario(scenarioId,initial,teamId),run=this.run(id),{shift}=this.ensureShift(run,initial);
      this.db.prepare('INSERT INTO guided_sessions(run_id,scenario_id,initial_at,initial_shift_id,selected_team_id,updated_at) VALUES (?,?,?,?,?,?)')
        .run(id,scenarioId,iso(initial),shift.id,teamId,iso(this.clock()));
      return id;
    })();
  }
  restartGuide(runId:number) {
    if(runId!==this.pointer('active_simulation')) throw new InputError('Le parcours affiché a changé');
    const session=this.q<{scenario_id:number;selected_team_id:number;initial_at:string}>('SELECT * FROM guided_sessions WHERE run_id=?',runId);
    if(!session) throw new InputError('Aucun parcours guidé actif');
    return this.startGuide(session.scenario_id,session.selected_team_id,Date.parse(session.initial_at));
  }
  guideNext(runId:number,expectedPosition:number,nextTeamId?:number) {
    if(!Number.isInteger(runId)||runId!==this.pointer('active_simulation')) throw new InputError('Le parcours affiché a changé ; actualiser le pilotage');
    if(!Number.isInteger(expectedPosition)||expectedPosition<0) throw new InputError('Position du parcours requise');
    this.tick();
    return this.db.transaction(()=>{
      const session=this.q<{scenario_id:number;position:number;initial_shift_id:number;contribution_id:number|null}>('SELECT * FROM guided_sessions WHERE run_id=?',runId);
      if(!session) throw new InputError('Aucun parcours guidé actif');
      if(expectedPosition<session.position) return; // A retry never repeats an effect.
      if(expectedPosition!==session.position) throw new InputError('Étape périmée ; actualiser le pilotage');
      const step=guideForSession(session.scenario_id)?.steps[session.position];
      if(!step) throw new InputError('Parcours terminé ; revenir au mode normal ou recommencer');
      const run=this.run(runId),at=Date.parse(run.simulated_at),initial=this.q<Shift>('SELECT * FROM shifts WHERE id=?',session.initial_shift_id);
      const end=Date.parse(initial.ends_at);
      if(['stop','anomaly','kaizen','restart','reference'].includes(step.action)&&at>=end) throw new InputError('Le quart de ce parcours est terminé ; recommencer pour rejouer ces étapes');
      if(step.action==='validation') {
        const contribution=this.q<{status:string;validated:number}>(`SELECT c.status,EXISTS(SELECT 1 FROM contribution_reviews r WHERE r.contribution_id=c.id AND r.status='validated') validated FROM contributions c WHERE c.id=? AND c.run_id=?`,session.contribution_id,runId);
        if(contribution?.status==='rejected') throw new InputError('Contribution refusée par le manager ; recommencer le parcours pour proposer un autre exemple');
        if(!contribution||!contribution.validated) throw new InputError('Attendre la validation explicite du manager avant de poursuivre');
        if(session.scenario_id===2&&contribution.status!=='resolved') throw new InputError('Attendre la résolution du signalement et la relance de la ligne');
      }
      if(step.action==='reference'&&!this.q("SELECT 1 FROM challenge_instances i JOIN challenge_definitions d ON d.id=i.definition_id WHERE i.shift_id=? AND d.type='beat_reference' AND i.status!='cancelled'",initial.id))
        throw new InputError('Aucune référence comparable active ; vérifier les paramètres du défi avec le manager');
      const advanceTo=(target:number)=>{
        this.advance(runId,Math.max(Date.parse(this.run(runId).simulated_at),target));
        this.db.prepare('UPDATE run_runtime SET wall_anchor=?,simulated_anchor=? WHERE run_id=?').run(iso(this.clock()),this.run(runId).simulated_at,runId);
      };
      if(step.action==='stop') this.control('stop');
      if(step.action==='restart') this.control('restart');
      if(step.action==='anomaly'||step.action==='kaizen') {
        if(step.action==='anomaly') advanceTo(Math.min(at+2*MINUTE,end-1));
        const id=this.submitContribution({kind:step.action==='anomaly'?'anomaly':'kaizen',title:step.action==='anomaly'?'Anomalie d’alimentation — démonstration':'Améliorer le repérage des emballages — démonstration',
          description:step.action==='anomaly'?'Signalement fictif à examiner par le manager. Sa résolution relancera la ligne de ce scénario.':'Proposition fictive : clarifier les repères des emballages pour faciliter leur identification.'},'simulation');
        this.db.prepare('UPDATE guided_sessions SET contribution_id=? WHERE run_id=?').run(id,runId);
      }
      if(step.action==='approach-boundary') {
        if(at>=end-MINUTE) throw new InputError('La dernière minute du quart est déjà passée ; recommencer ce parcours');
        advanceTo(end-MINUTE);
      }
      if(nextTeamId!==undefined) {
        if(step.action!=='boundary') throw new InputError('Choisir l’équipe entrante uniquement à l’étape de relève');
        if(at>=end) throw new InputError('Cette relève est déjà passée ; recommencer pour choisir son équipe entrante');
        this.planScenarioNextTeam(nextTeamId);
      }
      if(step.action==='finish-shift'||step.action==='boundary') advanceTo(end);
      if(step.action==='next-ten') advanceTo(end+10*MINUTE);
      if(step.action==='advance-five') advanceTo(at+5*MINUTE);
      if(step.action==='advance-twenty') advanceTo(Math.min(at+20*MINUTE,end));
      this.db.prepare('UPDATE guided_sessions SET position=position+1,updated_at=? WHERE run_id=?').run(iso(this.clock()),runId);
    })();
  }
  private guideState(runId:number) {
    const session=this.q<{scenario_id:number;position:number;initial_shift_id:number;initial_at:string;selected_team_id:number;contribution_id:number|null}>('SELECT * FROM guided_sessions WHERE run_id=?',runId);
    if(!session) return null;
    const guide=guideForSession(session.scenario_id)!;
    const shift=this.q<Shift>('SELECT * FROM shifts WHERE id=?',session.initial_shift_id),v=this.volume(shift.id);
    const run=this.run(runId),segment=this.q<Segment>('SELECT * FROM shift_order_segments WHERE shift_id=?',shift.id);
    const context=this.challengeContext(run,shift,segment),at=Date.parse(run.simulated_at);
    const contribution=session.contribution_id?this.q<{status:string;validated:number}>(`SELECT c.status,EXISTS(SELECT 1 FROM contribution_reviews r WHERE r.contribution_id=c.id AND r.status='validated') validated FROM contributions c WHERE c.id=?`,session.contribution_id):null;
    const awaiting=guide.steps[session.position]?.action==='validation'&&(!contribution||!contribution.validated||(session.scenario_id===2&&contribution.status!=='resolved'));
    return {runId,title:guide.title,position:session.position,steps:guide.steps,complete:session.position>=guide.steps.length,
      nextStep:guide.steps[session.position]??null,awaitingManager:awaiting,blockedReason:awaiting&&contribution?.status==='rejected'?'Contribution refusée ; recommencer le parcours':null,contributionId:session.contribution_id,contributionStatus:contribution?.status??null,
      initialAt:session.initial_at,selectedTeamId:session.selected_team_id,
      initialShift:{...shift,...v,good:v.total-v.rejected,target:context.target,challenges:this.challenges.list(context,Math.min(at,context.end)),score:this.q<{value:number}>('SELECT COALESCE(SUM(points),0) value FROM score_events WHERE shift_id=?',shift.id).value},
      clockNote:'Le temps simulé continue entre les étapes ; pause, reprise et vitesse restent disponibles. Le mode normal continue séparément.'};
  }
  returnNormal() {
    this.tick();
    const active=this.pointer('active_simulation'), normal=this.pointer('normal_simulation')!;
    this.db.transaction(()=>{
      if(active!==normal) this.db.prepare("UPDATE simulation_runs SET status='paused' WHERE id=?").run(active);
      this.db.prepare('UPDATE active_simulation SET run_id=? WHERE singleton=1').run(normal);
    })();
  }
  stopNormal(machineId:number=4,affectsLine:boolean=true,note:string='Arrêt simulé du quart planifié') {
    if(!Number.isInteger(machineId)||!this.q('SELECT 1 FROM machines WHERE id=? AND line_id=1',machineId)||typeof affectsLine!=='boolean'||typeof note!=='string'||note.length>2000) throw new InputError('Machine, effet sur la ligne ou motif invalide');
    if(machineId===4&&!affectsLine) throw new InputError('Un arrêt de la soutireuse interrompt la production de CH8');
    this.tick();const id=this.pointer('normal_simulation')!;
    if(this.pointer('active_simulation')!==id) throw new InputError('Revenir au mode normal avant de déclencher un arrêt du planning');
    const run=this.run(id),at=Date.parse(run.simulated_at),{shift}=this.ensureShift(run,at);
    return this.db.transaction(()=>{
      const existing=this.q<{id:number}>('SELECT id FROM stoppages WHERE run_id=? AND machine_id=? AND reason_id=2 AND ends_at IS NULL',id,machineId);
      if(existing)return existing.id;
      const stop=Number(this.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,affects_line) VALUES (?,?,?,2,?,?)').run(id,shift.id,machineId,iso(at),Number(affectsLine)).lastInsertRowid);
      this.audit('normal_stop',stop,{machineId,affectsLine,note,runId:id});return stop;
    })();
  }
  restartNormalStop(stopId:number) {
    if(!Number.isInteger(stopId)) throw new InputError('Arrêt inconnu');
    this.tick();const id=this.pointer('normal_simulation')!,run=this.run(id),at=run.simulated_at;
    const stop=this.q<{starts_at:string;ends_at:string|null}>('SELECT starts_at,ends_at FROM stoppages WHERE id=? AND run_id=? AND reason_id=2',stopId,id);
    if(!stop)throw new InputError('Arrêt manuel du mode normal inconnu');
    if(stop.ends_at)return;
    this.db.transaction(()=>{
      if(stop.starts_at===at)this.db.prepare('DELETE FROM stoppages WHERE id=?').run(stopId);
      else this.db.prepare('UPDATE stoppages SET ends_at=? WHERE id=?').run(at,stopId);
      this.audit('normal_restart',stopId,{runId:id});
    })();
  }
  normalStoppages() {
    this.tick();const run=this.run(this.pointer('normal_simulation')!),at=Date.parse(run.simulated_at);
    const rows=this.rows<{id:number;machine_id:number;machine:string;starts_at:string;ends_at:string|null;affects_line:number;reason:string;note:string|null}>(`SELECT s.id,s.machine_id,m.name machine,s.starts_at,s.ends_at,s.affects_line,r.label reason,(SELECT json_extract(a.details_json,'$.note') FROM audit_log a WHERE a.action='normal_stop' AND a.entity_id=s.id ORDER BY a.id DESC LIMIT 1) note FROM stoppages s JOIN machines m ON m.id=s.machine_id JOIN stop_reasons r ON r.id=s.reason_id WHERE s.run_id=? AND s.starts_at<=? ORDER BY s.starts_at DESC`,run.id,iso(at));
    return {runId:run.id,mode:'normal',asOf:iso(at),stops:rows.map(r=>({...r,durationSeconds:Math.max(0,(Math.min(at,r.ends_at?Date.parse(r.ends_at):at)-Date.parse(r.starts_at))/1000),open:r.ends_at===null}))};
  }
  recordSafety(input:{kind?:unknown;note?:unknown}) {
    if(!input||!['accident','near_miss'].includes(input.kind as string)||typeof input.note!=='string'||!input.note.trim()||input.note.length>2000) throw new InputError('Accident ou presque-accident et description requise, limitée à 2 000 caractères');
    const note=input.note.trim();
    this.tick();const run=this.run(this.pointer('active_simulation')!);
    return this.db.transaction(()=>{
      const id=Number(this.db.prepare('INSERT INTO safety_events(run_id,occurred_at,kind,note) VALUES (?,?,?,?)').run(run.id,run.simulated_at,input.kind,note).lastInsertRowid);
      this.audit('safety_reported',id,{runId:run.id,kind:input.kind,mode:run.clock_mode});
      return id;
    })();
  }
  safetyHistory() {
    this.tick();const run=this.run(this.pointer('active_simulation')!);
    return {runId:run.id,mode:run.clock_mode,asOf:run.simulated_at,events:this.rows('SELECT id,occurred_at,kind,note FROM safety_events WHERE run_id=? AND occurred_at<=? ORDER BY occurred_at DESC,id DESC',run.id,run.simulated_at)};
  }
  private planScenarioNextTeam(teamId:number) {
    const run=this.run(this.pointer('active_simulation')!);
    if(run.clock_mode!=='scenario') throw new InputError('Choix temporaire limité aux scénarios');
    if(!Number.isInteger(teamId)||!this.q('SELECT 1 FROM teams WHERE id=? AND line_id=1',teamId)) throw new InputError('Équipe CH8 inconnue');
    const start=iso(shiftAt(Date.parse(run.simulated_at)).end);
    if(this.q('SELECT 1 FROM shifts WHERE run_id=? AND starts_at=?',run.id,start)) throw new InputError('Cette relève a déjà été générée');
    this.db.prepare('INSERT INTO scenario_shift_teams VALUES (?,?,?) ON CONFLICT(run_id,starts_at) DO UPDATE SET team_id=excluded.team_id').run(run.id,start,teamId);
  }
  private closeTemporaryLineStops(run:Run,at:number) {
    // A paused presenter may stop and restart at the same instant. Such an
    // interval has no duration and cannot be stored as a closed stoppage.
    this.db.prepare('DELETE FROM stoppages WHERE run_id=? AND reason_id=2 AND ends_at IS NULL AND starts_at=?').run(run.id,iso(at));
    this.db.prepare('UPDATE stoppages SET ends_at=? WHERE run_id=? AND reason_id=2 AND ends_at IS NULL AND starts_at<?').run(iso(at),run.id,iso(at));
    // Earlier builds also generated a 35-minute automatic stop in scenario 2.
    // Close an overlapping legacy interval when this scenario is restarted;
    // keep its elapsed history and never touch a normal-mode stoppage.
    if(run.scenario_id===2) {
      this.db.prepare('DELETE FROM stoppages WHERE run_id=? AND reason_id=1 AND affects_line=1 AND starts_at=? AND ends_at>?').run(run.id,iso(at),iso(at));
      this.db.prepare('UPDATE stoppages SET ends_at=? WHERE run_id=? AND reason_id=1 AND affects_line=1 AND starts_at<? AND ends_at>?').run(iso(at),run.id,iso(at),iso(at));
    }
  }
  control(action: 'pause'|'resume'|'speed'|'next-shift'|'stop'|'restart'|'skip', speed?: number,nextTeamId?:number,minutes?:number) {
    this.tick();
    const id=this.pointer('active_simulation')!, run=this.run(id);
    if(run.clock_mode!=='scenario') throw new InputError('Lancer un scénario temporaire avant de piloter le temps ou les arrêts');
    const at=Date.parse(run.simulated_at);
    if(nextTeamId!==undefined&&action!=='next-shift') throw new InputError('Le choix d’équipe concerne la relève uniquement');
    if(action==='skip'){if(![2,5,10,20].includes(minutes!))throw new InputError('Saut de 2, 5, 10 ou 20 minutes requis');this.advance(id,at+minutes!*MINUTE);}
    if(action==='next-shift') {if(nextTeamId!==undefined) this.planScenarioNextTeam(nextTeamId);this.advance(id,shiftAt(at).end+10*MINUTE);}
    if(action==='speed' && (!Number.isFinite(speed)||speed!<1||speed!>120)) throw new InputError('Vitesse entre 1 et 120');
    if(action==='pause'||action==='resume') this.db.prepare('UPDATE simulation_runs SET status=? WHERE id=?').run(action==='pause'?'paused':'running',id);
    if(action==='speed') this.db.prepare('UPDATE simulation_runs SET speed=? WHERE id=?').run(speed!,id);
    if(action==='stop') {
      const {shift}=this.ensureShift(run,at);
      if(!this.q('SELECT 1 FROM stoppages WHERE run_id=? AND reason_id=2 AND ends_at IS NULL',id)) this.db.prepare('INSERT INTO stoppages(run_id,shift_id,machine_id,reason_id,starts_at,affects_line) VALUES (?,?,4,2,?,1)').run(id,shift.id,iso(at));
    }
    if(action==='restart') this.db.transaction(()=>this.closeTemporaryLineStops(run,at))();
    this.db.prepare('UPDATE run_runtime SET wall_anchor=?,simulated_anchor=? WHERE run_id=?').run(iso(this.clock()),this.run(id).simulated_at,id);
  }
  setTarget(target: number) {
    if(!Number.isInteger(target)||target<1||target>1_000_000) throw new InputError('Objectif entier entre 1 et 1 000 000');
    this.tick();
    const run=this.run(this.pointer('active_simulation')!), at=Date.parse(run.simulated_at);
    const {shift,segment}=this.ensureShift(run,at);
    this.db.transaction(()=>{
      const id=Number(this.db.prepare("INSERT INTO manager_targets(line_id,team_id,shift_template_id,product_id,kind,target_value,unit,valid_from,valid_until,created_by,created_at,run_scope) VALUES (1,?,?,1,'shift_production',?,'bottles',?,?,1,?,?)")
        .run(shift.team_id,shift.template_id,target,shift.starts_at,shift.ends_at,iso(this.clock()),run.id).lastInsertRowid);
      this.db.prepare("INSERT INTO target_applications(run_id,segment_id,manager_target_id,kind,effective_value,unit,applied_at,source) VALUES (?,?,?,'shift_production',?,'bottles',?,'manager')")
        .run(run.id,segment.id,id,target,run.simulated_at);
      this.audit('target',id,{target,runId:run.id});
      this.challenges.sync(this.challengeContext(run,shift,segment),at);
    })();
  }
  assignChallenge(input:Parameters<Challenges['assign']>[2]) {
    this.tick();const run=this.run(this.pointer('active_simulation')!),at=Date.parse(run.simulated_at),{shift,segment}=this.ensureShift(run,at);
    let start=Math.ceil(at/MINUTE)*MINUTE;
    if(run.clock_mode==='real'&&input?.presetCode!==undefined){
      const preset=this.q<{duration_minutes:number}>('SELECT duration_minutes FROM express_challenge_presets WHERE code=?',String(input.presetCode));
      if(preset){const duration=preset.duration_minutes*MINUTE;
        const reservations=this.rows<{starts_at:string;ends_at:string}>("SELECT starts_at,ends_at FROM admin_programs WHERE kind='challenge' AND cancelled_at IS NULL AND shift_starts_at=? ORDER BY starts_at",shift.starts_at);
        for(const reserved of reservations)if(Date.parse(reserved.starts_at)<start+duration&&Date.parse(reserved.ends_at)>start)start=Date.parse(reserved.ends_at);
      }
    }
    return this.challenges.assign(this.challengeContext(run,shift,segment),at,input,this.clock(),input?.presetCode!==undefined||input?.type==='timed_good_production',start);
  }
  reviewChallenge(id:number,approved:boolean,note:string) {
    this.tick();const run=this.run(this.pointer('active_simulation')!);
    const row=this.q<{starts_at:string}>(`SELECT sh.starts_at FROM challenge_instances c JOIN shifts sh ON sh.id=c.shift_id WHERE c.id=? AND c.run_id=?`,id,run.id);
    if(!row) throw new InputError('Défi absent de cette simulation');
    const {shift,segment}=this.ensureShift(run,Date.parse(row.starts_at));
    this.db.transaction(()=>{
      this.challenges.review(this.challengeContext(run,shift,segment),id,approved,note,this.clock(),Date.parse(run.simulated_at));
      if(shift.status==='completed') this.finalize(run,shift,segment);
    })();
  }
  publish(body: string, kind: 'message'|'quote'|'event'|'sports'='message', audience:{teamId?:number;shiftTemplateId?:number}={}) {
    if(typeof body!=='string'||!body.trim()||body.length>2000) throw new InputError('Texte entre 1 et 2 000 caractères');
    if(!['message','quote','event','sports'].includes(kind)) throw new InputError('Type de contenu invalide');
    const teamId=this.catalogId(audience.teamId,'teams'),shiftId=this.catalogId(audience.shiftTemplateId,'shift_templates');
    return this.db.transaction(()=>{
      const at=iso(this.clock());
      const id=Number(this.db.prepare("INSERT INTO editorial_contents(line_id,kind,body,created_by,status,created_at,updated_at) VALUES (1,?,?,1,'published',?,?)").run(kind,body.trim(),at,at).lastInsertRowid);
      this.db.prepare("INSERT INTO content_publications(content_id,screen_number,team_id,shift_template_id,clock_domain,priority) VALUES (?,?,?,?,'real',10)").run(id,kind==='message'?3:4,teamId,shiftId);
      this.audit('publish',id,{kind});
      return id;
    })();
  }
  private catalogId(value:unknown,table:'teams'|'shift_templates') {
    if(value===undefined||value===null) return null;
    if(!Number.isInteger(value)||!this.q(`SELECT 1 FROM ${table} WHERE id=?`,value as number)) throw new InputError('Équipe ou quart inconnu');
    return value as number;
  }
  catalogs() {
    return {expressChallenges:this.rows('SELECT code,title,description,duration_minutes durationMinutes,target_value target,bonus_points bonusPoints,badge_title badgeTitle,badge_asset_path badgeAssetPath,card_asset_path cardAssetPath,color,rules_json rules FROM express_challenge_presets WHERE enabled=1 ORDER BY display_order').map((p:any)=>{const calibrated=!!this.calibration.latest();const x=calibrated?calibratedPreset({...p,target_value:p.target,rules_json:p.rules}):{...p,target_value:p.target,rules_json:p.rules};return {...p,target:x.target_value,description:x.description,rules:JSON.parse(x.rules_json)};}),badges:this.rows("SELECT *, '/badges/' || code || '.svg' assetPath FROM badge_definitions ORDER BY month"),messageTemplates:this.rows('SELECT * FROM message_templates ORDER BY code'),
      quotes:this.rows("SELECT id,body,attribution FROM editorial_contents WHERE kind='quote' AND status='published' ORDER BY id"),
      teams:this.rows('SELECT id,name FROM teams ORDER BY id'),machines:this.rows('SELECT id,name FROM machines WHERE line_id=1 ORDER BY id'),shifts:this.rows('SELECT id,name,start_local,end_local FROM shift_templates ORDER BY id'),
      quotePreference:this.q('SELECT * FROM manager_quote_preference WHERE singleton=1')??{mode:'each_shift'},
      challengeTypes:this.rows('SELECT id,title,type,bonus_points FROM challenge_definitions WHERE id BETWEEN 1 AND 3 ORDER BY id')};
  }
  selectQuote(mode:string,contentId?:number,selectedByTeamId?:number) {
    if(!['manual','each_shift'].includes(mode)) throw new InputError('Mode de citation invalide');
    if(mode==='manual'&&(!Number.isInteger(contentId)||!this.q("SELECT 1 FROM editorial_contents WHERE id=? AND kind='quote' AND status='published'",contentId!))) throw new InputError('Citation inconnue');
    const team=this.catalogId(selectedByTeamId,'teams');
    this.db.transaction(()=>{
      this.db.prepare(`INSERT INTO manager_quote_preference VALUES (1,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET mode=excluded.mode,content_id=excluded.content_id,selected_by_team_id=excluded.selected_by_team_id,updated_at=excluded.updated_at`)
        .run(mode,mode==='manual'?contentId!:null,team,iso(this.clock()));
      this.audit('quote_selected',mode==='manual'?contentId!:0,{mode,selectedByTeamId:team});
    })();
  }
  publishTemplate(code:string,teamId:number,body?:string,shiftTemplateId?:number) {
    const team=this.catalogId(teamId,'teams');
    if(team===null) throw new InputError('Choisir une équipe');
    if(typeof code!=='string') throw new InputError('Modèle inconnu');
    const template=this.q<{body:string}>('SELECT body FROM message_templates WHERE code=?',code);
    if(!template) throw new InputError('Modèle inconnu');
    if(body!==undefined&&typeof body!=='string') throw new InputError('Texte invalide');
    const name=this.q<{name:string}>('SELECT name FROM teams WHERE id=?',team).name;
    return this.publish((body??template.body).replaceAll('{team}',name),'message',{teamId:team,shiftTemplateId});
  }
  awardBadge(code:string,teamId:number,reason?:string,shiftTemplateId?:number) {
    if(typeof code!=='string'||!this.q('SELECT 1 FROM badge_definitions WHERE code=?',code)) throw new InputError('Badge inconnu');
    const team=this.catalogId(teamId,'teams'),shift=this.catalogId(shiftTemplateId,'shift_templates');
    if(team===null) throw new InputError('Choisir une équipe');
    const text=reason??'Engagement sécurité reconnu par le manager — démonstration';
    if(typeof text!=='string'||!text.trim()||text.length>2000) throw new InputError('Motif requis, limité à 2 000 caractères');
    const start=monthStart(this.clock()),local=new Date(start+HOUR),end=Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1)-HOUR;
    return this.db.transaction(()=>{
      const existing=this.q<{id:number}>("SELECT id FROM recognitions WHERE kind='safety_badge' AND origin='manager' AND badge_code=? AND team_id=? AND starts_at=? AND revoked_at IS NULL",code,team,iso(start));
      let id=existing?.id;
      if(id) this.db.prepare('UPDATE recognitions SET reason=?,shift_template_id=? WHERE id=?').run(text.trim(),shift,id);
      else id=Number(this.db.prepare(`INSERT INTO recognitions(line_id,kind,team_id,badge_code,reason,starts_at,ends_at,origin,approved_by,shift_template_id) VALUES (1,'safety_badge',?,?,?,?,?,'manager',1,?)`).run(team,code,text.trim(),iso(start),iso(end),shift).lastInsertRowid);
      this.audit('badge_awarded',id,{code,teamId:team});return id;
    })();
  }
  private audit(action:string,id:number,details:object) {
    this.db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,?,?,?,?,?)').run(action,'manager',id,JSON.stringify(details),iso(this.clock()));
  }
  submitContribution(input: {kind?:unknown;title?:unknown;description?:unknown;personId?:unknown;machineId?:unknown}, origin:'manager'|'simulation'='manager') {
    if(!input || !['anomaly','kaizen'].includes(input.kind as string)) throw new InputError('Choisir anomalie ou idée Kaizen');
    const text=(value:unknown,max:number)=>{
      if(typeof value!=='string'||!value.trim()||value.length>max) throw new InputError(`Texte requis, limité à ${max} caractères`);
      return value.trim();
    };
    const title=text(input.title,160),description=text(input.description,2000);
    const optionalId=(value:unknown,table:'people'|'machines')=>{
      if(value===undefined||value===null) return null;
      if(!Number.isInteger(value)||!this.q(`SELECT 1 FROM ${table} WHERE id=?`,value as number)) throw new InputError('Personne ou machine inconnue');
      return value as number;
    };
    const person=optionalId(input.personId,'people'),machine=optionalId(input.machineId,'machines');
    this.tick();
    const run=this.run(this.pointer(origin==='manager'?'normal_simulation':'active_simulation')!);
    const at=origin==='manager'?this.clock():Date.parse(run.simulated_at);
    const shift=this.hasWork(run,at)?this.ensureShift(run,at).shift:null;
    const membership=person===null?null:this.q<{team_id:number}>('SELECT team_id FROM team_memberships WHERE person_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) ORDER BY starts_at DESC LIMIT 1',person,iso(at),iso(at));
    if(origin==='simulation'&&run.clock_mode!=='scenario') throw new InputError('Lancer un scénario avant un signalement simulé');
    return this.db.transaction(()=>{
      const id=Number(this.db.prepare(`INSERT INTO contributions(line_id,kind,person_id,team_id,machine_id,title,description,status,origin,run_id,occurred_at,created_at,submitted_shift_id)
        VALUES (1,?,?,?,?,?,?,'submitted',?,?,?,?,?)`).run(input.kind,person,origin==='simulation'?(shift?.team_id??null):(membership?.team_id??shift?.team_id??null),machine,title,description,origin,origin==='simulation'?run.id:null,origin==='simulation'?run.simulated_at:iso(this.clock()),iso(this.clock()),shift?.id??null).lastInsertRowid);
      this.audit('contribution_submitted',id,{origin});return id;
    })();
  }
  reviewContribution(id:number,status:string,note:string='') {
    if(!Number.isInteger(id)||typeof note!=='string'||note.length>2000) throw new InputError('Validation invalide');
    this.tick();
    const active=this.pointer('active_simulation')!;
    const c=this.q<{kind:string;status:string;run_id:number|null;origin:string;person_id:number|null;team_id:number|null}>('SELECT * FROM contributions WHERE id=?',id);
    if(!c||(c.run_id!==null&&c.run_id!==active)) throw new InputError('Contribution absente de cette simulation');
    const transitions:Record<string,string[]>={submitted:['acknowledged','rejected'],acknowledged:['in_progress','validated','rejected'],in_progress:['validated','resolved','rejected'],validated:['resolved'],resolved:[],rejected:[]};
    if(c.kind==='kaizen')transitions.submitted=['acknowledged','validated','rejected'];
    if(c.status===status) return;
    if(!transitions[c.status]?.includes(status)) throw new InputError('Transition de validation non autorisée');
    const linkedInterruption=c.run_id!==null&&c.kind==='anomaly'&&!!this.q('SELECT 1 FROM guided_sessions WHERE run_id=? AND scenario_id=2 AND contribution_id=?',c.run_id,id);
    if(linkedInterruption&&status==='resolved'&&!this.q("SELECT 1 FROM contribution_reviews WHERE contribution_id=? AND status='validated'",id))
      throw new InputError('Valider le signalement avant de le résoudre');
    this.db.transaction(()=>{
      this.db.prepare('UPDATE contributions SET status=? WHERE id=?').run(status,id);
      this.db.prepare('INSERT INTO contribution_reviews(contribution_id,manager_id,reviewed_at,status,note,clock_domain,occurred_at) VALUES (?,1,?,?,?,?,?)').run(id,iso(this.clock()),status,note.trim(),c.origin==='simulation'?'simulation':'real',c.origin==='simulation'?this.run(active).simulated_at:iso(this.clock()));
      // Recognition follows explicit validation, once only.
      if(status==='validated'&&(c.person_id!==null||c.team_id!==null)&&!this.q('SELECT 1 FROM recognitions WHERE contribution_id=?',id)) {
        const at=c.run_id===null?this.clock():Date.parse(this.run(active).simulated_at);
        this.db.prepare(`INSERT INTO recognitions(line_id,kind,person_id,team_id,contribution_id,reason,starts_at,ends_at,origin,run_id,approved_by)
          VALUES (1,'contribution',?,?,?,?,?,?,?,?,1)`).run(c.person_id,c.team_id,id,note.trim()||'Contribution validée par le manager',iso(at),iso(at+30*DAY),c.origin,c.run_id);
      }
      if(linkedInterruption&&status==='resolved') this.closeTemporaryLineStops(this.run(active),Date.parse(this.run(active).simulated_at));
      this.audit('contribution_reviewed',id,{status});
    })();
  }
  setPeriodTarget(kind:unknown,value:unknown) {
    this.tick();const run=this.run(this.pointer('active_simulation')!);
    return this.indicators.setTarget(run.id,Date.parse(run.simulated_at),this.clock(),kind,value);
  }
  checkIn(input:{responseKey?:unknown;mood?:unknown;fatigue?:unknown}) {
    this.tick();const run=this.run(this.pointer('active_simulation')!),at=Date.parse(run.simulated_at),{shift}=this.ensureShift(run,at);
    this.indicators.checkIn({runId:run.id,at,wallAt:this.clock(),shiftId:shift.id,teamId:shift.team_id,stopped:false},input);
  }
  snapshot() {
    this.tick();
    const run=this.run(this.pointer('active_simulation')!), at=Date.parse(run.simulated_at);
    const planned=this.hasWork(run,at),window=shiftAt(at);
    const current=planned?this.ensureShift(run,at):null;
    // Internal context only; no fictitious shift is stored or exposed while idle.
    const shift=current?.shift??{id:0,team_id:0,template_id:0,starts_at:iso(window.start),ends_at:iso(window.end),status:'unplanned',assignment_source:'none',production_model_version:2,calibrated_from:null,calibration_id:null,score_divisor:1};
    const segment=current?.segment??{id:0,work_order_id:0,target_good_bottles:15000,planned_bph:1875};
    const volume=planned?this.volume(shift.id):{total:0,rejected:0},target=planned?this.effectiveTarget(run.id,segment):15000;
    const physical=planned?this.q<{hl:number;minMl:number|null;maxMl:number|null}>(`SELECT COALESCE(SUM(p.total_bottles*pr.bottle_ml),0)/100000.0 hl,MIN(pr.bottle_ml) minMl,MAX(pr.bottle_ml) maxMl FROM shift_order_segments g JOIN work_orders w ON w.id=g.work_order_id JOIN products pr ON pr.id=w.product_id LEFT JOIN production_intervals p ON p.segment_id=g.id WHERE g.shift_id=?`,shift.id):null;
    const targetHl=physical&&physical.minMl===physical.maxMl&&physical.minMl!==null?target*physical.minMl/100000:null;
    const challengeContext=planned?this.challengeContext(run,shift,segment):null;if(challengeContext)this.challenges.sync(challengeContext,at);
    const challengeBonus=this.q<{value:number}>("SELECT COALESCE(SUM(points),0) value FROM score_events WHERE shift_id=? AND kind='challenge_bonus'",shift.id).value;
    const totals=(start:number,end:number)=>this.q<Volume>(`SELECT COALESCE(SUM(p.total_bottles),0) total,COALESCE(SUM(p.rejected_bottles),0) rejected FROM production_intervals p
      JOIN simulation_events e ON e.id=p.event_id WHERE e.run_id=? AND p.starts_at>=? AND p.ends_at<=?`,run.id,iso(start),iso(end));
    const expected=target*(at-Date.parse(shift.starts_at))/(8*HOUR);
    const over=roundScore(Math.max(0,Math.floor((volume.total-target)/100))*10/shift.score_divisor);
    const productionPoints=roundScore(volume.total/shift.score_divisor);
    const calibration=this.calibration.get(shift.calibration_id)??this.calibration.latest();
    const yieldEstimate=planned&&calibration?performance(volume.total,Math.max(0,(at-Date.parse(shift.starts_at))/1000),calibration):null;
    const team=planned?this.q<{name:string}>('SELECT name FROM teams WHERE id=?',shift.team_id):null;
    const finished=this.rows<{id:number;team_id:number;starts_at:string;ends_at:string;score:number;target:number;total:number;score_divisor:number}>(`SELECT sh.id,sh.team_id,sh.starts_at,sh.ends_at,sh.score_divisor,
      (SELECT SUM(points) FROM score_events WHERE shift_id=sh.id) score,
      COALESCE((SELECT effective_value FROM target_applications a WHERE a.segment_id=s.id ORDER BY a.id DESC LIMIT 1),s.target_good_bottles) target,
      COALESCE(v.total_bottles,0) total
      FROM shifts sh JOIN shift_order_segments s ON s.shift_id=sh.id LEFT JOIN segment_production v ON v.segment_id=s.id WHERE sh.run_id=? AND sh.status='completed'`,run.id);
    const leaderboard=(from:number)=>this.rows<{id:number;name:string}>('SELECT id,name FROM teams').map(t=>{
      const xs=finished.filter(s=>s.team_id===t.id&&Date.parse(s.starts_at)>=from&&s.target===target&&s.score_divisor===shift.score_divisor);
      return {...t,completedShifts:xs.length,averageScore:xs.length?(shift.score_divisor===100?roundScore:Math.round)(xs.reduce((n,x)=>n+x.score,0)/xs.length):null};
    }).sort((a,b)=>(b.averageScore??-1)-(a.averageScore??-1)).map((entry,index,all)=>({...entry,rank:entry.averageScore===null?null:all.findIndex(x=>x.averageScore===entry.averageScore)+1}));
    const trends=this.rows<{id:number;name:string}>('SELECT id,name FROM teams').map(t=>({...t,days:Array.from({length:7},(_,i)=>{
      const date=localDate(localMidnight(at)-(6-i)*DAY);
      const xs=finished.filter(s=>s.team_id===t.id&&localDate(Date.parse(s.starts_at))===date&&s.score_divisor===shift.score_divisor);
      return {date,completedShifts:xs.length,averageScore:xs.length?(shift.score_divisor===100?roundScore:Math.round)(xs.reduce((n,s)=>n+s.score,0)/xs.length):null};
    })}));
    const baseline=this.q<{occurred_at:string}>('SELECT occurred_at FROM safety_events WHERE run_id=? AND kind IN (\'baseline\',\'accident\') AND occurred_at<=? ORDER BY occurred_at DESC LIMIT 1',run.id,iso(at));
    const stop=!!this.q('SELECT 1 FROM stoppages WHERE run_id=? AND affects_line=1 AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) LIMIT 1',run.id,iso(at),iso(at));
    const indicatorContext={runId:run.id,at,wallAt:this.clock(),shiftId:shift.id,teamId:shift.team_id,stopped:stop,planned,scheduledOnly:run.clock_mode==='real'};
    const preference=this.q<{mode:string;content_id:number;selected_by_team_id:number|null}>('SELECT * FROM manager_quote_preference WHERE singleton=1');
    const availableQuotes=this.rows<{id:number;body:string;attribution:string|null}>(`SELECT c.id,c.body,c.attribution FROM editorial_contents c WHERE c.kind='quote' AND c.status='published'
      AND (NOT EXISTS(SELECT 1 FROM content_publications p WHERE p.content_id=c.id) OR EXISTS(SELECT 1 FROM content_publications p WHERE p.content_id=c.id
      AND (p.team_id IS NULL OR p.team_id=?) AND (p.shift_template_id IS NULL OR p.shift_template_id=?) AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.ends_at IS NULL OR p.ends_at>?))) ORDER BY c.id`,shift.team_id,shift.template_id,iso(this.clock()),iso(this.clock()));
    const selected=this.q<{content_id:number;selected_by_team_id:number}>('SELECT content_id,selected_by_team_id FROM shift_quote_selections WHERE shift_id=?',shift.id);
    const scheduled=this.q<{id:number;body:string;attribution:string|null}>(`SELECT c.id,c.body,c.attribution FROM editorial_contents c JOIN content_publications p ON p.content_id=c.id WHERE c.kind='quote' AND c.status='published' AND p.starts_at IS NOT NULL AND p.starts_at<=? AND (p.ends_at IS NULL OR p.ends_at>?) AND (p.team_id IS NULL OR p.team_id=?) AND (p.shift_template_id IS NULL OR p.shift_template_id=?) ORDER BY p.starts_at DESC,p.priority DESC,c.id DESC LIMIT 1`,iso(this.clock()),iso(this.clock()),shift.team_id,shift.template_id);
    const manual=scheduled??(preference?.mode==='manual'?availableQuotes.find(c=>c.id===preference.content_id):undefined);
    const automatic=availableQuotes.find(c=>c.id===selected?.content_id)??availableQuotes[0];
    const quote=manual?{...manual,selectedByTeamId:scheduled?null:preference?.selected_by_team_id??null,source:'manager'}:automatic?{...automatic,selectedByTeamId:selected?.selected_by_team_id??(planned?shift.team_id:null),source:'automatic'}:null;
    const monthly=totals(monthStart(at),at), daily=totals(localMidnight(at),at);
    const records=this.rows<{id:number;kind:string;team_id:number;value:number;unit:string;period_start:string;period_end:string;comparability_key:string}>('SELECT * FROM records WHERE run_id=? ORDER BY value DESC',run.id).filter(r=>r.kind!=='team_score'||(shift.score_divisor===100?r.comparability_key.endsWith(':scale:100'):!r.comparability_key.endsWith(':scale:100')));
    const messages=this.rows<{id:number;kind:string;title:string|null;body:string;attribution:string|null;icon_code:string|null;screen_number:number|null;starts_at:string|null;ends_at:string|null}>(`SELECT c.id,c.kind,c.title,c.body,c.attribution,c.icon_code,p.screen_number,p.starts_at,p.ends_at FROM editorial_contents c JOIN content_publications p ON p.content_id=c.id
      WHERE c.status='published' AND c.kind!='quote' AND (p.team_id IS NULL OR p.team_id=?) AND (p.shift_template_id IS NULL OR p.shift_template_id=?)
      AND (p.starts_at IS NULL OR p.starts_at<=CASE p.clock_domain WHEN 'real' THEN ? ELSE ? END)
      AND (p.ends_at IS NULL OR p.ends_at>CASE p.clock_domain WHEN 'real' THEN ? ELSE ? END) ORDER BY p.priority DESC,c.id DESC`,shift.team_id,shift.template_id,iso(this.clock()),iso(at),iso(this.clock()),iso(at));
    const birthdays=this.rows<{id:number;display_name:string;birthday_day:number;avatar_path:string|null}>('SELECT id,display_name,birthday_day,avatar_path FROM people WHERE enabled=1 AND birthday_month=? ORDER BY birthday_day,display_name,id',new Date(at+HOUR).getUTCMonth()+1).map(p=>({...p,...portrait(p.avatar_path)}));
    const operator=this.q<{person_id:number;display_name:string;avatar_path:string|null;reason:string;id:number}>(`SELECT r.id,r.person_id,r.reason,p.display_name,p.avatar_path FROM recognitions r JOIN people p ON p.id=r.person_id WHERE r.kind='operator_month' AND r.origin='manager' AND r.revoked_at IS NULL AND p.enabled=1 AND r.starts_at<=? AND r.ends_at>? ORDER BY r.id DESC LIMIT 1`,iso(this.clock()),iso(this.clock()));
    return {
      performance:yieldEstimate,calibration:calibration?{id:calibration.id,nominalBph:calibration.nominal_bph,provisional:true,legacyTrajectory:planned&&(!shift.calibration_id||!!shift.calibrated_from)}:null,
      guidedScenario:this.guideState(run.id),
      operatorOfMonth:operator?{...operator,...portrait(operator.avatar_path)}:null,
      simulated:true,timezone:'Africa/Douala',runId:run.id,normalRunId:this.pointer('normal_simulation'),mode:run.clock_mode,scenarioId:run.scenario_id,status:run.status,speed:run.speed,at:iso(at),
      workStatus:planned?'planned':'unplanned',workStatusLabel:planned?'Quart planifié':'Aucun quart planifié',
      shift:planned?{...shift,team:team!.name,remainingSeconds:Math.max(0,Math.ceil((Date.parse(shift.ends_at)-at)/1000))}:null,
      production:planned?{target,...volume,volumeHl:physical!.hl,targetHl,bottleMl:physical?.minMl===physical?.maxMl?physical?.minMl:null,good:volume.total-volume.rejected,remaining:Math.max(0,target-volume.total),progress:volume.total/target,expected:Math.round(expected),
        score:roundScore(productionPoints+over+challengeBonus),scoreDivisor:shift.score_divisor,productionPoints,overTargetBonus:over,qualityBonus:0,challengeBonus,totalBonus:over+challengeBonus,scoreStatus:'provisional',
        level:at-Date.parse(shift.starts_at)<15*MINUTE?'démarrage':volume.total>=expected?'A':volume.total>=expected*0.9?'B':'C',levelLabel:'Niveau d’avancement — démo'}:null,
      machine:planned?{name:'Soutireuse',state:stop?'stopped':'running',speedBph:stop?0:Math.round(this.rate(run,shift,Math.floor((at-Date.parse(shift.starts_at))/MINUTE)))}:{name:'Soutireuse',state:'unplanned',speedBph:null},
      lineRecords:new LineRecords(this.db).snapshot(run.id,at),
      daily,monthly,weeklyLeaderboard:leaderboard(weekStart(at)),monthlyLeaderboard:leaderboard(monthStart(at)),rankingTarget:target,trends,records,
      safety:{days:baseline?Math.floor((localMidnight(at)-localMidnight(Date.parse(baseline.occurred_at)))/DAY):null,fictitious:true,
        milestones:[7,30,100,365].map(days=>({days,reached:baseline?(localMidnight(at)-localMidnight(Date.parse(baseline.occurred_at)))/DAY>=days:false}))},
      quality:{conformity:planned&&volume.total?(volume.total-volume.rejected)/volume.total:null},
      energy:this.indicators.energy(indicatorContext),resources:this.indicators.resources(indicatorContext),
      monthlyMission:this.indicators.monthly(indicatorContext),kaizen:this.indicators.kaizen(indicatorContext),weather:planned?this.indicators.weather(indicatorContext):null,
      communication:{messages,quote,birthdays,birthdaysVisible:birthdays.length>0},
      history:{from:this.q<{v:string}>('SELECT MIN(starts_at) v FROM shifts WHERE run_id=?',run.id).v,completedShifts:finished.length},
      adminAttention:{pendingContributions:this.q<{n:number}>("SELECT COUNT(*) n FROM contributions WHERE (run_id IS NULL OR run_id=?) AND status IN ('submitted','acknowledged','in_progress')",run.id).n,openStops:this.q<{n:number}>("SELECT COUNT(*) n FROM stoppages s JOIN normal_simulation n ON n.run_id=s.run_id WHERE s.ends_at IS NULL AND EXISTS(SELECT 1 FROM audit_log a WHERE a.action='normal_stop' AND a.entity_id=s.id)").n,revision:this.q<{n:number}>('SELECT COALESCE(MAX(id),0) n FROM audit_log').n},
      contributions:this.rows('SELECT c.*,p.display_name,m.name machine_name,t.name team_name FROM contributions c LEFT JOIN people p ON p.id=c.person_id LEFT JOIN machines m ON m.id=c.machine_id LEFT JOIN teams t ON t.id=c.team_id WHERE c.run_id IS NULL OR c.run_id=? ORDER BY c.id DESC',run.id),
      challenges:challengeContext?this.challenges.list(challengeContext,at):[],
      recognitions:this.rows<{id:number;kind:string;person_id:number|null;team_id:number|null;avatar_path:string|null;display_name:string|null;reason:string;badge_title:string|null;badge_code:string|null;starts_at:string;ends_at:string}>(`SELECT r.*,p.display_name,p.avatar_path,b.title badge_title,b.icon_code,b.color FROM recognitions r LEFT JOIN people p ON p.id=r.person_id LEFT JOIN badge_definitions b ON b.code=r.badge_code WHERE r.revoked_at IS NULL AND (r.person_id IS NULL OR p.enabled=1) AND ((r.run_id IS NULL AND r.starts_at<=? AND r.ends_at>?) OR (r.run_id=? AND r.starts_at<=? AND r.ends_at>?)) AND (r.shift_template_id IS NULL OR r.shift_template_id=?) ORDER BY r.id DESC`,iso(this.clock()),iso(this.clock()),run.id,iso(at),iso(at),shift.template_id).map(r=>({...r,...(r.person_id!==null?portrait(r.avatar_path):{})})),
      pendingFeatures:['Validation de la formule TRS métier avec l’entreprise']
    };
  }
}
