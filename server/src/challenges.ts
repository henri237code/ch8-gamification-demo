import type {DB} from './db.js';
import {InputError} from './errors.js';
import {calibratedPreset} from './express-presets.js';
import {HOUR,MINUTE,iso} from './time.js';

export type ChallengeContext={runId:number;scenarioId:number;shiftId:number;teamId:number;templateId:number;start:number;end:number;target:number;plannedBph:number;productId:number;calibrated?:boolean};
type Kind='shift_target'|'beat_reference'|'timed_good_production';
type Instance={resume_automatic:number;id:number;run_id:number;shift_id:number;definition_id:number;starts_at:string;ends_at:string;target_good_bottles:number;rules_snapshot_json:string;status:string;source:string;type:Kind;title:string;bonus_points:number;reference_shift_id:number|null;held_reason:string|null};
type Rules={title:string;metric:'total'|'good'|'buckets'|'validated_anomaly'|'validated_kaizen';presetCode?:string;description?:string;badgeTitle?:string;badgeAssetPath?:string;cardAssetPath?:string;color?:string;noStops?:boolean;minQuality?:number;bucketMinutes?:number;bucketTarget?:number;bonus:number;cap:number;referenceTotal?:number;referenceTeam?:string;referenceDate?:string};
export class Challenges {
  constructor(private db:DB) {}
  private instances(c:ChallengeContext) {
    return this.db.prepare(`SELECT i.*,d.type,d.title,d.bonus_points FROM challenge_instances i JOIN challenge_definitions d ON d.id=i.definition_id
      WHERE i.run_id=? AND i.shift_id=? ORDER BY i.ends_at,i.id`).all(c.runId,c.shiftId) as Instance[];
  }
  private reference(c:ChallengeContext) {
    // Compare the same format, planned duration and target. Unplanned downtime
    // stays in the result; it is never removed to make a reference look better.
    return this.db.prepare(`SELECT sh.id,sh.starts_at,t.name team,COALESCE(v.total_bottles,0) total FROM shifts sh
      JOIN teams t ON t.id=sh.team_id JOIN shift_order_segments s ON s.shift_id=sh.id JOIN work_orders w ON w.id=s.work_order_id
      LEFT JOIN segment_production v ON v.segment_id=s.id
      WHERE sh.run_id=? AND sh.status='completed' AND sh.ends_at<=? AND w.product_id=? AND s.planned_bph=?
      AND (julianday(sh.ends_at)-julianday(sh.starts_at))*24 BETWEEN 7.9999 AND 8.0001
      AND COALESCE((SELECT effective_value FROM target_applications a WHERE a.segment_id=s.id ORDER BY a.id DESC LIMIT 1),s.target_good_bottles)=?
      AND (SELECT COUNT(*) FROM shift_order_segments WHERE shift_id=sh.id)=1
      AND NOT EXISTS(SELECT 1 FROM planned_breaks b WHERE b.shift_id=sh.id)
      ORDER BY sh.ends_at DESC LIMIT 1`).get(c.runId,iso(c.start),c.productId,c.plannedBph,c.target) as {id:number;starts_at:string;team:string;total:number}|undefined;
  }
  private insert(c:ChallengeContext,type:Kind,start:number,end:number,target:number,rules:Rules,source:'automatic'|'manager',assignmentId:number|null=null,referenceId:number|null=null) {
    const definition={shift_target:1,beat_reference:2,timed_good_production:3}[type];
    return Number(this.db.prepare(`INSERT INTO challenge_instances(run_id,shift_id,definition_id,assignment_id,reference_shift_id,starts_at,ends_at,target_good_bottles,rules_snapshot_json,status,source,resume_automatic)
      VALUES (?,?,?,?,?,?,?,?,?,'ready',?,1)`).run(c.runId,c.shiftId,definition,assignmentId,referenceId,iso(start),iso(end),target,JSON.stringify(rules),source).lastInsertRowid);
  }
  ensureDefaults(c:ChallengeContext) {
    if(!this.db.prepare('SELECT 1 FROM challenge_instances WHERE shift_id=? LIMIT 1').get(c.shiftId)) this.db.transaction(()=>{
      const ref=c.scenarioId===4?this.reference(c):undefined;
      this.insert(c,ref?'beat_reference':'shift_target',c.start,c.end,ref?ref.total+1:c.target,
        {title:ref?'Dépasser le quart précédent comparable':'Atteindre l’objectif du quart',metric:'total',bonus:50,cap:100,
          ...(ref?{referenceTotal:ref.total,referenceTeam:ref.team,referenceDate:ref.starts_at}:{})},'automatic',null,ref?.id??null);
      // Four twenty-minute windows, every two hours. Only elapsed production
      // belongs to a window; future challenges are ready, not already won.
      for(let hour=0;hour<8;hour+=2) {
        const start=c.start+hour*HOUR;
        this.insert(c,'timed_good_production',start,start+20*MINUTE,c.calibrated?9000:500,
          {title:'Sprint',metric:'total',bonus:50,cap:100,presetCode:'sprint',description:c.calibrated?'Atteignez 9 000 bouteilles en 20 minutes sans arrêt de ligne.':'Atteignez 500 bouteilles en 20 minutes sans arrêt de ligne.',badgeTitle:'SPRINT',badgeAssetPath:'/challenges/sprint.svg',cardAssetPath:'/challenges/sprint-card.svg',color:'#fb923c',noStops:true},'automatic');
      }
    })();
  }
  private continueAutomatic(c:ChallengeContext,at:number){
    const queue=this.instances(c).filter(i=>i.type==='timed_good_production'&&i.resume_automatic===1&&Date.parse(i.ends_at)<=at&&i.status!=='cancelled');
    for(const i of queue){
      const start=Date.parse(i.ends_at),end=start+20*MINUTE;
      if(end>c.end)continue;
      const conflict=this.db.prepare(`SELECT 1 FROM challenge_instances x JOIN challenge_definitions d ON d.id=x.definition_id WHERE x.shift_id=? AND d.type='timed_good_production' AND x.starts_at<? AND x.ends_at>? AND x.status!='cancelled'`).get(c.shiftId,iso(end),iso(start));
      const already=this.db.prepare("SELECT 1 FROM challenge_instances WHERE shift_id=? AND source='automatic' AND starts_at=?").get(c.shiftId,iso(start));
      const reserved=this.db.prepare("SELECT 1 FROM admin_programs p JOIN normal_simulation n ON n.run_id=? WHERE p.kind='challenge' AND p.cancelled_at IS NULL AND p.starts_at<? AND p.ends_at>?").get(c.runId,iso(end),iso(start));
      if(!conflict&&!already&&!reserved){const id=this.insert(c,'timed_good_production',start,end,c.calibrated?9000:500,{title:'Sprint',metric:'total',bonus:50,cap:100,presetCode:'sprint',description:c.calibrated?'Atteignez 9 000 bouteilles en 20 minutes sans arrêt de ligne.':'Atteignez 500 bouteilles en 20 minutes sans arrêt de ligne.',badgeTitle:'SPRINT',badgeAssetPath:'/challenges/sprint.svg',cardAssetPath:'/challenges/sprint-card.svg',color:'#fb923c',noStops:true},'automatic');
        if(end<=at){const inserted=this.instances(c).find(x=>x.id===id)!;queue.push(inserted);}
      }
    }
  }
  private progress(i:Instance,at:number) {
    const end=Math.min(at,Date.parse(i.ends_at));
    return this.db.prepare(`SELECT COALESCE(SUM(p.total_bottles),0) total,COALESCE(SUM(p.rejected_bottles),0) rejected
      FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id
      WHERE s.shift_id=? AND p.starts_at>=? AND p.ends_at<=?`).get(i.shift_id,i.starts_at,iso(end)) as {total:number;rejected:number};
  }
  private evaluation(i:Instance,at:number) {
    const rules=JSON.parse(i.rules_snapshot_json) as Rules,v=this.progress(i,at),end=Math.min(at,Date.parse(i.ends_at));
    let value=rules.metric==='good'?v.total-v.rejected:v.total;
    const conformity=v.total?(v.total-v.rejected)/v.total:null;
    const stopped=!!this.db.prepare(`SELECT 1 FROM stoppages WHERE run_id=? AND affects_line=1 AND starts_at<? AND (ends_at IS NULL OR ends_at>?) LIMIT 1`).get(i.run_id,iso(end),i.starts_at);
    let buckets:{startsAt:string;endsAt:string;value:number;target:number;completed:boolean;passed:boolean}[]=[];
    if(rules.metric==='buckets') {
      const minutes=rules.bucketMinutes!,target=rules.bucketTarget!;
      buckets=Array.from({length:Math.round((Date.parse(i.ends_at)-Date.parse(i.starts_at))/(minutes*MINUTE))},(_,n)=>{
        const start=Date.parse(i.starts_at)+n*minutes*MINUTE,finish=start+minutes*MINUTE;
        const row=this.db.prepare(`SELECT COALESCE(SUM(p.total_bottles-p.rejected_bottles),0) value FROM production_intervals p JOIN shift_order_segments s ON s.id=p.segment_id WHERE s.shift_id=? AND p.starts_at>=? AND p.ends_at<=?`).get(i.shift_id,iso(start),iso(Math.min(end,finish))) as {value:number};
        return {startsAt:iso(start),endsAt:iso(finish),value:row.value,target,completed:at>=finish,passed:at>=finish&&row.value>=target};
      });
      value=buckets.filter(b=>b.passed).length;
    }
    if(rules.metric==='validated_anomaly'||rules.metric==='validated_kaizen') {
      const kind=rules.metric==='validated_anomaly'?'anomaly':'kaizen';
      value=(this.db.prepare(`SELECT COUNT(*) value FROM contributions p WHERE p.kind=? AND p.submitted_shift_id=?
        AND ((p.origin='simulation' AND p.run_id=?) OR (p.origin='manager' AND p.run_id IS NULL)) AND p.occurred_at>=? AND p.occurred_at<? AND p.occurred_at<=?
        AND EXISTS(SELECT 1 FROM contribution_reviews r WHERE r.contribution_id=p.id AND r.status='validated' AND r.clock_domain=CASE p.origin WHEN 'simulation' THEN 'simulation' ELSE 'real' END AND r.occurred_at>=? AND r.occurred_at<=?)`).get(kind,i.shift_id,i.run_id,i.starts_at,i.ends_at,iso(end),i.starts_at,iso(end)) as {value:number}).value;
    }
    const conditionsMet=(!rules.noStops||!stopped)&&(!rules.minQuality||(conformity!==null&&conformity>=rules.minQuality));
    return {value,conformity,stopped,buckets,conditionsMet};
  }
  sync(c:ChallengeContext,at:number) {
    this.ensureDefaults(c);
    this.continueAutomatic(c,at);
    this.db.transaction(()=>{
      // A changed production goal updates its active goal challenge, not bottles
      // already produced or a finished challenge from another period.
      this.db.prepare(`UPDATE challenge_instances SET target_good_bottles=? WHERE shift_id=? AND definition_id IN (SELECT id FROM challenge_definitions WHERE type='shift_target') AND status IN ('ready','active')`).run(c.target,c.shiftId);
      for(const i of this.instances(c)) {
        if(['won','missed','cancelled'].includes(i.status)) continue;
        if(at<Date.parse(i.starts_at)) continue;
        if(at<Date.parse(i.ends_at)) {this.db.prepare("UPDATE challenge_instances SET status='active' WHERE id=?").run(i.id);continue;}
        const rules=JSON.parse(i.rules_snapshot_json) as Rules,v=this.progress(i,at),evaluation=this.evaluation(i,at);
        if(evaluation.value<i.target_good_bottles||!evaluation.conditionsMet) {this.db.prepare("UPDATE challenge_instances SET status='missed' WHERE id=?").run(i.id);continue;}
        const safety=this.db.prepare("SELECT 1 FROM safety_events WHERE run_id=? AND kind IN ('accident','near_miss') AND occurred_at>=? AND occurred_at<? LIMIT 1").get(c.runId,i.starts_at,i.ends_at);
        const quality=v.total>0&&(v.total-v.rejected)/v.total<0.98;
        const review=this.db.prepare('SELECT approved FROM challenge_reviews WHERE instance_id=?').get(i.id) as {approved:number}|undefined;
        if((safety||quality)&&!review) {
          this.db.prepare("UPDATE challenge_instances SET status='awaiting_validation',held_reason=? WHERE id=?").run(safety?'Signal sécurité sur la période':'Qualité sous le seuil de démonstration de 98 %',i.id);continue;
        }
        if(review?.approved===0) {this.db.prepare("UPDATE challenge_instances SET status='cancelled' WHERE id=?").run(i.id);continue;}
        const awarded=(this.db.prepare("SELECT COALESCE(SUM(points),0) points FROM score_events WHERE shift_id=? AND kind='challenge_bonus'").get(c.shiftId) as {points:number}).points;
        const points=Math.max(0,Math.min(rules.bonus,100-awarded));
        this.db.prepare(`INSERT OR IGNORE INTO score_events(run_id,shift_id,challenge_id,rule_version_id,event_key,kind,points,simulated_at,explanation)
          VALUES (?,?,?,?,?,'challenge_bonus',?,?,?)`).run(c.runId,c.shiftId,i.id,c.calibrated?2:1,`challenge:${i.id}`,points,i.ends_at,`Défi terminé : ${rules.title} ; plafond de 100 points par quart`);
        this.db.prepare("UPDATE challenge_instances SET status='won',achieved_at=? WHERE id=?").run(i.ends_at,i.id);
        this.db.prepare('INSERT OR IGNORE INTO celebration_receipts(run_id,celebration_key,simulated_at) VALUES (?,?,?)').run(c.runId,`challenge:${i.id}`,i.ends_at);
      }
    })();
  }
  assign(c:ChallengeContext,at:number,input:{type?:unknown;durationMinutes?:unknown;target?:unknown;bonusPoints?:unknown;title?:unknown;presetCode?:unknown},wallAt:number,preserveOtherWindows=false,requestedStart?:number) {
    let presetRules:Partial<Rules>={};
    if(input?.presetCode!==undefined) {
      if(typeof input.presetCode!=='string') throw new InputError('Mini-défi inconnu');
      let preset=this.db.prepare('SELECT * FROM express_challenge_presets WHERE code=? AND enabled=1').get(input.presetCode) as {code:string;title:string;description:string;duration_minutes:number;target_value:number;bonus_points:number;rules_json:string;badge_title:string;badge_asset_path:string;card_asset_path:string;color:string}|undefined;
      if(!preset) throw new InputError('Mini-défi inconnu');
      if(c.calibrated)preset=calibratedPreset(preset);
      if(['type','durationMinutes','target','bonusPoints','title'].some(k=>(input as Record<string,unknown>)[k]!==undefined)) throw new InputError('Sélectionner le modèle seul ; ses règles sont prédéfinies');
      presetRules={...JSON.parse(preset.rules_json),presetCode:preset.code,description:preset.description,badgeTitle:preset.badge_title,badgeAssetPath:preset.badge_asset_path,cardAssetPath:preset.card_asset_path,color:preset.color};
      input={type:'timed_good_production',title:preset.title,durationMinutes:preset.duration_minutes,target:preset.target_value,bonusPoints:preset.bonus_points};
    }
    if(!input||!['shift_target','beat_reference','timed_good_production'].includes(input.type as string)) throw new InputError('Type de défi invalide');
    const type=input.type as Kind,bonus=input.bonusPoints??50;
    if(!Number.isInteger(bonus)||(bonus as number)<0||(bonus as number)>100) throw new InputError('Bonus entier entre 0 et 100');
    const duration=input.durationMinutes??20;
    if(type==='timed_good_production'&&(!Number.isInteger(duration)||(duration as number)<1||(duration as number)>120)) throw new InputError('Durée entière entre 1 et 120 minutes');
    if(type!=='timed_good_production'&&input.target!==undefined) throw new InputError('La cible de ce défi vient de l’objectif ou du quart de référence');
    const start=type==='timed_good_production'?Math.ceil((requestedStart??at)/MINUTE)*MINUTE:c.start,end=type==='timed_good_production'?start+(duration as number)*MINUTE:c.end;
    if(end>c.end||end<=at) throw new InputError('Ce défi doit tenir dans le quart courant');
    const ref=type==='beat_reference'?this.reference(c):undefined;
    if(type==='beat_reference'&&!ref) throw new InputError('Aucun quart précédent comparable disponible');
    const target=type==='shift_target'?c.target:ref?ref.total+1:input.target??Math.ceil(c.plannedBph*(duration as number)/60);
    if(!Number.isInteger(target)||(target as number)<1||(target as number)>1_000_000) throw new InputError('Cible entière entre 1 et 1 000 000');
    const title=input.title??(type==='shift_target'?'Atteindre l’objectif du quart':type==='beat_reference'?'Dépasser un quart comparable':`Sprint de ${duration} minutes`);
    if(typeof title!=='string'||!title.trim()||title.length>160) throw new InputError('Titre requis, limité à 160 caractères');
    const rules:Rules={title:title.trim(),metric:type==='timed_good_production'?'good':'total',bonus:bonus as number,cap:100,...presetRules,
      ...(ref?{referenceTotal:ref.total,referenceTeam:ref.team,referenceDate:ref.starts_at}:{})};
    return this.db.transaction(()=>{
      // Keep completed rewards, but replace unfinished automatic/manager plans.
      if(preserveOtherWindows) this.db.prepare("UPDATE challenge_instances SET status='cancelled' WHERE shift_id=? AND definition_id IN (SELECT id FROM challenge_definitions WHERE type='timed_good_production') AND status IN ('ready','active') AND starts_at<? AND ends_at>?").run(c.shiftId,iso(end),iso(start));
      else this.db.prepare("UPDATE challenge_instances SET status='cancelled' WHERE shift_id=? AND definition_id IN (SELECT id FROM challenge_definitions WHERE type!='timed_good_production') AND status IN ('ready','active')").run(c.shiftId);
      const def=Number(this.db.prepare('INSERT INTO challenge_definitions(line_id,title,type,conditions_json,bonus_points,created_by) VALUES (1,?,?,?,?,1)').run(title.trim(),type,JSON.stringify(rules),bonus).lastInsertRowid);
      const assignment=Number(this.db.prepare('INSERT INTO manager_challenge_assignments(challenge_id,team_id,shift_template_id,valid_from,valid_until,created_by,run_scope) VALUES (?,?,?,?,?,1,?)').run(def,c.teamId,c.templateId,iso(start),iso(end),c.runId).lastInsertRowid);
      const id=Number(this.db.prepare(`INSERT INTO challenge_instances(run_id,shift_id,definition_id,assignment_id,reference_shift_id,starts_at,ends_at,target_good_bottles,rules_snapshot_json,status,source,resume_automatic)
        VALUES (?,?,?,?,?,?,?,?,?,'ready','manager',?)`).run(c.runId,c.shiftId,def,assignment,ref?.id??null,iso(start),iso(end),target,JSON.stringify(rules),preserveOtherWindows?1:0).lastInsertRowid);
      this.db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES (1,'challenge_assigned','challenge',?,?,?)`).run(id,JSON.stringify({runId:c.runId,shiftId:c.shiftId,type}),iso(wallAt));
      this.sync(c,at);return id;
    })();
  }
  review(c:ChallengeContext,id:number,approved:boolean,note:string,wallAt:number,at:number) {
    if(!Number.isInteger(id)||typeof approved!=='boolean'||typeof note!=='string'||!note.trim()||note.length>2000) throw new InputError('Décision et motif de validation requis');
    const instance=this.db.prepare('SELECT status FROM challenge_instances WHERE id=? AND run_id=? AND shift_id=?').get(id,c.runId,c.shiftId) as {status:string}|undefined;
    if(!instance) throw new InputError('Défi absent de cette simulation');
    const previous=this.db.prepare('SELECT approved FROM challenge_reviews WHERE instance_id=?').get(id) as {approved:number}|undefined;
    if(previous) {if(previous.approved===Number(approved)) return;throw new InputError('Ce défi a déjà reçu une décision');}
    if(instance.status!=='awaiting_validation') throw new InputError('Ce défi ne nécessite pas de validation');
    this.db.transaction(()=>{
      this.db.prepare('INSERT INTO challenge_reviews VALUES (?,?,?,1,?)').run(id,Number(approved),note.trim(),iso(wallAt));
      this.sync(c,at);
    })();
  }
  list(c:ChallengeContext,at:number) {
    return this.instances(c).map(i=>{
      const rules=JSON.parse(i.rules_snapshot_json) as Rules,evaluation=this.evaluation(i,at),value=evaluation.value;
      const points=this.db.prepare("SELECT points FROM score_events WHERE challenge_id=? AND kind='challenge_bonus'").get(i.id) as {points:number}|undefined;
      return {id:i.id,type:i.type,title:rules.title,presetCode:rules.presetCode??null,description:rules.description??null,badgeTitle:rules.badgeTitle??null,badgeAssetPath:rules.badgeAssetPath??null,cardAssetPath:rules.cardAssetPath??null,color:rules.color??null,conditions:{noStops:rules.noStops??false,minQuality:rules.minQuality??null,bucketMinutes:rules.bucketMinutes??null,bucketTarget:rules.bucketTarget??null},evaluation,badgeEarned:i.status==='won',status:i.status,source:i.source,startsAt:i.starts_at,endsAt:i.ends_at,
        target:i.target_good_bottles,value,metric:rules.metric,remaining:Math.max(0,i.target_good_bottles-value),progress:value/i.target_good_bottles,
        durationMinutes:(Date.parse(i.ends_at)-Date.parse(i.starts_at))/MINUTE,remainingSeconds:Math.max(0,Math.ceil((Date.parse(i.ends_at)-Math.max(at,Date.parse(i.starts_at)))/1000)),unit:rules.metric==='buckets'?'periods':rules.metric==='validated_anomaly'?'validated_anomalies':rules.metric==='validated_kaizen'?'validated_ideas':'bottles',
        proposedBonus:rules.bonus,awardedBonus:points?.points??0,bonusCapPerShift:100,heldReason:i.held_reason,
        reference:i.reference_shift_id?{shiftId:i.reference_shift_id,total:rules.referenceTotal,team:rules.referenceTeam,at:rules.referenceDate}:null};
    });
  }
}
