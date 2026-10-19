import {StrictMode,useEffect,useState,type ReactNode,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity,ArrowUpRight,Check,Clock3,Factory,Flag,Gauge,Maximize2,Minimize2,Pause,Target,Trophy,WifiOff,Zap} from 'lucide-react';
import {useLiveState} from './useLiveState';
import {PublicScreen,Mosaic,type PublicNumber} from './PublicScreens';
import {FittedEditorial} from './FittedEditorial';
import {goalProgressColor} from './publicData';
import {currentChallenge} from './currentChallenge';
import type {SharedState} from '../../server/src/runtime.js';
import './style.css';
import './visibility.css';
import './maquettes.css';
import {PilotLogin} from './PilotLogin';
import {AdminLogin} from './AdminLogin';
import {COMMON_TEXT as C,SCREEN1_TEXT as T,PERFORMANCE_TEXT as P,VOLUME_TEXT as V} from './texts.fr';
const number=new Intl.NumberFormat('fr-FR');
const n=(value:number)=>number.format(value);
const time=(at:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',hour:'2-digit',minute:'2-digit'}).format(new Date(at));
const timer=(seconds:number)=>[Math.floor(seconds/3600),Math.floor(seconds%3600/60),Math.floor(seconds%60)].map(v=>String(v).padStart(2,'0')).join(':');
function Zone({code,label,icon}:{code:string;label:string;icon:ReactNode}) {return <div className="zone-title"><span className="zone-code">{code}</span><h2>{label}</h2><span className="zone-icon">{icon}</span></div>;}
function Empty({label=C.noPlannedShift}:{label?:string}) {return <div className="empty"><span className="empty-dash">—</span><p>{label}</p></div>;}
function Bottle() {return <svg className="bottle" viewBox="0 0 44 110" aria-hidden="true"><path d="M17 4h10v9l-2 3v19c0 6 10 12 10 23v43q0 5-5 5H14q-5 0-5-5V58c0-11 10-17 10-23V16l-2-3Z"/><path d="M16 65h12v25H16zM17 12h10"/></svg>;}
function ChallengePanel({state}:{state:SharedState}) {
 const c=currentChallenge(state.challenges);
 const statuses:Record<string,string>=T.challenge.statuses;
 const unit=c?.unit==='bottles'?C.units.bottles:c?.unit==='periods'?T.challenge.units.periods:c?.unit==='validated_anomalies'?T.challenge.units.anomaly:T.challenge.units.idea;
 return <section className="panel challenge-panel"><Zone code={T.challenge.code} label={T.challenge.title} icon={<Zap size={19}/>}/>{!state.shift?<Empty/>:!c?<Empty label={T.challenge.none}/>:<>
  <div className="challenge-heading"><span className={`challenge-status status-${c.status}`}>{statuses[c.status]??T.challenge.unknownStatus}</span><span>{c.status==='ready'?T.challenge.start:T.challenge.end} {T.challenge.at} {time(c.status==='ready'?c.startsAt:c.endsAt)}</span></div>
  <div className="challenge-content"><div className="challenge-copy"><h3>{c.title}</h3><FittedEditorial body={c.description??`${T.challenge.reach} ${n(c.target)} ${c.metric==='good'?T.challenge.goodBottles:unit} ${T.challenge.within} ${c.durationMinutes} ${C.units.minutes}${c.conditions.noStops?` · ${T.challenge.noStops}`:''}${c.conditions.minQuality?` · ${T.challenge.quality} ≥ ${Math.round(c.conditions.minQuality*100)} %`:''}`} /></div>{c.badgeAssetPath?<img className="challenge-badge" src={c.badgeAssetPath} alt={c.badgeTitle??T.challenge.badgeAlt}/>:<div className="challenge-badge fallback-badge"><Flag size={42}/></div>}</div>
  <div className="challenge-reward"><span>{c.status==='won'?T.challenge.badgeEarned:c.status==='missed'?T.challenge.badgeMissed:c.status==='awaiting_validation'?T.challenge.badgePending:T.challenge.reward} · {c.badgeTitle??c.title}</span><b>{!['won','missed'].includes(c.status)&&<small>{T.challenge.proposedBonus}</small>}{c.status==='won'&&<Check size={14}/>}+{c.status==='won'?c.awardedBonus:c.status==='missed'?0:c.proposedBonus} {C.units.points}</b></div>
  <div className="challenge-bottom"><span>{T.challenge.advance} : {n(c.value)} / {n(c.target)} {unit}</span></div>
  <div className="mini-track" role="progressbar" aria-label={T.challenge.progressLabel} aria-valuemin={0} aria-valuemax={c.target} aria-valuenow={c.value}><i style={{width:`${Math.min(100,c.progress*100)}%`}}/></div>
  {c.heldReason&&<p className="held-reason">{c.heldReason}</p>}
 </>}</section>;
}
/** Cadre public : réorganiser sur mobile, puis réduire si la fenêtre est trop petite.
 * Aucun contenu n’est supprimé pour masquer un débordement. */
function DisplayFrame({children}:{children:ReactNode}) {
 const [size,setSize]=useState(()=>({w:window.innerWidth,h:window.innerHeight}));
 useEffect(()=>{const resize=()=>setSize({w:window.innerWidth,h:window.innerHeight});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const compact=size.w<800;
 const width=compact?Math.max(360,size.w):1700,height=compact?Math.max(1240,size.h):950;
 const scale=Math.min(size.w/width,size.h/height);
 const style:CSSProperties={width,height,transform:`translate(-50%, -50%) scale(${scale})`};
 return <div className="display-viewport"><div className={`display-canvas ${compact?'compact':''}`} style={style}>{children}</div></div>;
}
function App() {
 const {state:s,connection}=useLiveState();const [full,setFull]=useState(false),[fullError,setFullError]=useState('');
 useEffect(()=>{const changed=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
 const toggleFull=async()=>{try{setFullError('');if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setFullError(C.fullscreen.unavailable);}};
 if(!s)return <main className="initial"><Factory size={36}/><h1>{C.brand} · {C.tagline}</h1><p>{connection==='offline'?C.connection.unavailable:C.connection.initial}</p></main>;
 const p=s.production,shift=s.shift,progress=p?Math.min(100,p.progress*100):0;
 const shiftNames=C.shiftNames;
 const remaining=shift?.remainingSeconds??0;
 const level=p?.level??'—',levelLabel=level==='A'?T.level.labels.A:level==='B'?T.level.labels.B:level==='C'?T.level.labels.C:T.level.labels.start;
 const connectionText=C.connection[connection];
 return <div className={`dashboard ${s.mode==='scenario'?'scenario-dashboard':''}`}><header className="topbar"><div className="brand"><div className="brand-mark"><Factory size={22}/></div><div><strong>{C.brand}<span> / </span>{C.brandSection}</strong><p>{C.tagline}</p></div></div><div className="shift-context">{shift?<><span className="context-label">{C.teamOnShift}</span><strong>{shift.team}</strong><span className="context-dot"/><span>{C.shift} {shiftNames[shift.template_id-1]?.toLowerCase()} · {time(shift.starts_at)}–{time(shift.ends_at)}</span></>:<span>{C.noPlannedShift}</span>}</div><div className="top-actions"><span className={`live-status ${connection!=='live'?'not-live':''}`} role="status">{connection==='offline'?<WifiOff size={13}/>:<i/>}{connectionText}</span><button onClick={toggleFull} aria-label={full?C.fullscreen.exit:C.fullscreen.enter} title={C.fullscreen.title}>{full?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button></div></header>
 <main><div className="page-heading"><div><span className="eyebrow">{T.heading.eyebrow}</span><h1>{T.heading.first} <span>{T.heading.second}</span></h1></div><div className="date-block"><strong>{time(s.at)} <span>{C.city}</span></strong><span>{new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(s.at))}</span></div></div>
 {(connection==='offline'||connection==='stale')&&<div className="notice" role="alert"><WifiOff size={16}/> {C.connection.retained}</div>}
 {s.mode==='scenario'&&<div className="scenario-notice"><span>{s.status==='paused'?<Pause size={14}/>:<Activity size={14}/>} {C.scenario.temporary}{s.status==='paused'?` · ${C.scenario.paused}`:''}</span><span>{C.scenario.clock} · {C.scenario.speed} ×{s.speed}</span></div>}
 {fullError&&<div className="notice" role="status">{fullError}</div>}
 <div className="dashboard-grid"><section className={`panel production-panel ${p?`goal-${goalProgressColor(p.progress)}`:''}`}><Zone code={T.production.code} label={T.production.title} icon={<Target size={20}/>}/>{!p?<Empty/>:<><div className="production-label"><span>{T.production.objective}<small className="production-progress-key">{P.progressKey} · {(p.progress*100).toFixed(1).replace('.',',')} %</small></span><span className="machine-status"><i className={s.machine.state==='stopped'?'stopped':''}/>{s.machine.state==='stopped'?T.production.stopped:T.production.running}</span></div><div className="production-figure"><div><strong>{n(p.total)}</strong><span className="production-goal"> / {n(p.target)} <small>{C.units.bottlesShort}</small></span></div><Bottle/></div><div className="production-volume"><b>{p.volumeHl.toLocaleString('fr-FR',{maximumFractionDigits:2})} {V.unit}</b><span>{p.targetHl===null?V.mixed:`/ ${p.targetHl.toLocaleString('fr-FR',{maximumFractionDigits:2})} ${V.unit} · ${V.target}`}</span></div><div className="progress-label"><span><b>{(p.progress*100).toFixed(1).replace('.',',')} %</b> {T.production.achieved}</span><span>{n(p.remaining)} {T.production.remaining}</span></div><div className="production-track" role="progressbar" data-progress-color={goalProgressColor(p.progress)} aria-label={T.production.progressLabel} aria-valuetext={`${(p.progress*100).toFixed(1)} % ${T.production.achieved}`} aria-valuemin={0} aria-valuemax={p.target} aria-valuenow={p.total}><div className="track-markers"><i/><i/><i/></div><div className="production-fill" style={{width:`${progress}%`}}/></div><div className="track-scale">{[0,1/3,2/3,1].map(r=><span key={r}>{n(Math.round(p.target*r))}</span>)}</div><div className="production-bottom"><span><Activity size={15}/><b>{n(s.machine.speedBph??0)}</b> {C.units.bottlesPerHour} <span className="muted">· {T.production.cadence}</span></span><span><Check size={15}/>{n(p.good)} {T.production.good}</span></div></>}</section>
 <section className="panel score-panel"><Zone code={T.score.code} label={T.score.title} icon={<Trophy size={20}/>}/>{!p?<Empty/>:<><span className="metric-label">{T.score.provisional}</span><div className="score-number">{n(p.score)}<small>{C.units.points}</small></div><div className="score-base"><span>{p.scoreDivisor===100?P.scoreRate:T.score.production}</span><b>{n(p.productionPoints)} {C.units.points}</b></div><div className="bonus-grid"><div><span><ArrowUpRight size={14}/> {T.score.overTarget}</span><strong>+{n(p.overTargetBonus)}</strong></div><div><span><Check size={14}/> {T.score.perfectQuality}</span><strong>+{n(p.qualityBonus)}</strong><small>{T.score.qualityPending}</small></div></div><div className="score-total"><span>{T.score.totalBonus} <small>{T.score.challenges} : +{n(p.challengeBonus)} {C.units.points}</small></span><strong>+{n(p.totalBonus)} <small>{C.units.points}</small></strong></div></>}</section>
 <section className={`panel timer-panel ${shift&&remaining<=600?'timer-urgent':shift&&remaining<=1800?'timer-warning':''}`}><Zone code={T.timer.code} label={T.timer.title} icon={<Clock3 size={19}/>}/>{!shift?<Empty/>:<><span className="metric-label">{T.timer.remaining}</span><div className="timer-number">{timer(remaining)}</div><div className="timer-progress"><i style={{width:`${100-remaining/(8*3600)*100}%`}}/></div><div className="timer-labels"><span>{time(shift.starts_at)}</span><span>{T.timer.handover} {time(shift.ends_at)}</span></div><div className="timer-note"><Clock3 size={15}/>{remaining<=600?T.timer.urgent:remaining<=1800?T.timer.soon:T.timer.normal}</div></>}</section>
 <section className="panel level-panel"><Zone code={T.level.code} label={s.performance?P.title:T.level.title} icon={<Gauge size={19}/>}/>{!p?<Empty/>:s.performance?<><div className={`level-content yield-${s.performance.color}`}><div className="level-ring"><strong>{s.performance.percent===null?'…':n(s.performance.percent)}</strong><span>%</span></div><div className="level-text"><span>{P.label}</span><strong>{P.colors[s.performance.color as keyof typeof P.colors]}</strong><span>{P.nominal} · {n(s.performance.nominalBph)} {C.units.bottlesPerHour}</span></div></div><p className="level-note">{P.provisional}</p></>:<><div className={`level-content level-${level}`}><div className="level-ring"><strong>{level==='démarrage'?'…':level}</strong><span>{T.level.label}</span></div><div className="level-text"><span>{T.level.progress}</span><strong>{levelLabel}</strong><div className="level-legend">{['A','B','C'].map(x=><span key={x} className={level===x?'selected':''}>{x}</span>)}</div></div></div><p className="level-note">{p.level==='démarrage'?T.level.starting:<>{T.level.reference} <b>{n(p.expected)} {C.units.bottles}</b></>}</p></>}</section>
 <ChallengePanel state={s}/></div>
 <footer><div><Target size={17}/><span>{T.footer.lead} <b>{T.footer.more}</b>, <b>{T.footer.better}</b>, <b>{T.footer.together}.</b></span></div><span>{T.footer.closing} <span className="footer-arrow">↗</span></span><span className="demo-tag">{C.demo}</span></footer></main></div>;
}
const publicNumber=Number(location.pathname.split('/')[2]);
createRoot(document.getElementById('root')!).render(<StrictMode>{location.pathname.startsWith('/pilotage')?<PilotLogin/>:location.pathname.startsWith('/admin')?<AdminLogin/>:location.pathname==='/ecrans'?<Mosaic/>:<DisplayFrame>{[2,3,4].includes(publicNumber)?<PublicScreen screen={publicNumber as PublicNumber}/>:<App/>}</DisplayFrame>}</StrictMode>);
