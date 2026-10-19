import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  ShieldAlert,
  Clock3,
  Activity,
} from "lucide-react";
import { COMMON_TEXT as C, PILOT_TEXT as P } from "./texts.fr";
import { ScreenShortcuts } from "./ScreenShortcuts";
import { useLiveState } from "./useLiveState";
import type { GUIDES } from "../../server/src/guides";
type Guide = (typeof GUIDES)[number];
type Named = { id: number; name: string };
type Stop = {
  id: number;
  machine: string;
  starts_at: string;
  durationSeconds: number;
  note: string | null;
};
const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v);
const date = (v: string | number) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(v));
const localInput = (at: number) =>
  new Date(at + 3600000).toISOString().slice(0, 16);
export function PilotDashboard({
  account,
  logout,
  loggingOut,
  bannerError,
  onExpired,
}: {
  account: string;
  logout: () => void;
  loggingOut: boolean;
  bannerError: string;
  onExpired: () => void;
}) {
  const { state: s, connection, acceptSnapshot } = useLiveState();
  const [guides, setGuides] = useState<Guide[]>([]),
    [teams, setTeams] = useState<Named[]>([]),
    [machines, setMachines] = useState<Named[]>([]),
    [openStops, setOpenStops] = useState<Stop[]>([]);
  const [guideId, setGuideId] = useState(1),
    [team, setTeam] = useState(""),
    [startMode, setStartMode] = useState("adapted"),
    [startAt, setStartAt] = useState(() => localInput(Date.now())),
    [nextTeam, setNextTeam] = useState("");
  const [speed, setSpeed] = useState("1"),
    [machine, setMachine] = useState("4"),
    [affectsLine, setAffectsLine] = useState(true),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [stopsError, setStopsError] = useState(""),
    [wall, setWall] = useState(Date.now());
  const sending = useRef(false),
    [confirmation, setConfirmation] = useState<{
      text: string;
      perform: () => Promise<boolean>;
    } | null>(null);
  async function api(path: string, init?: RequestInit) {
    const r = await fetch(path, { cache: "no-store", ...init });
    if (r.status === 401) {
      onExpired();
      throw Error(P.expired);
    }
    const b = await r.json();
    if (!r.ok) throw Error(b.error ?? P.error);
    return b;
  }
  async function loadStops() {
    try {
      const b = await api("/api/pilot/normal-stoppages");
      setOpenStops(b.openStops);
      setStopsError("");
    } catch (e) {
      setStopsError(e instanceof Error ? e.message : P.stopsError);
    }
  }
  useEffect(() => {
    let alive = true;
    Promise.all([api("/api/pilot/guides"), api("/api/catalogs")])
      .then(([g, c]) => {
        if (alive) {
          setGuides(g);
          setTeams(c.teams);
          setMachines(c.machines);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    void loadStops();
    const refresh = window.setInterval(() => {
        if (alive) void loadStops();
      }, 5000),
      clock = window.setInterval(() => setWall(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    if (s) setSpeed(String(s.speed));
  }, [s?.speed]);
  useEffect(() => {
    setNextTeam("");
  }, [s?.runId, s?.guidedScenario?.position]);
  const allowed = connection === "live" && !busy && !loggingOut,
    temporary = s?.mode === "scenario",
    active = s?.guidedScenario,
    chosen = guides.find((g) => g.id === guideId);
  async function command(path: string, body: Record<string, unknown> = {}) {
    if (sending.current || connection !== "live") return false;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const b = await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (b.synchronization) acceptSnapshot(b);
      setNotice(P.done);
      await loadStops();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : P.error);
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const control = (action: string, extra: Record<string, unknown> = {}) =>
    command("/api/pilot/control", {
      action,
      expectedRunId: s?.runId,
      ...extra,
    });
  function launch(e: FormEvent) {
    e.preventDefault();
    if (!chosen || !team || !allowed) return;
    const body: Record<string, unknown> = {
      scenarioId: guideId,
      teamId: Number(team),
      expectedRunId: s?.runId,
    };
    if (startMode === "now") body.at = new Date().toISOString();
    if (startMode === "custom")
      body.at = new Date(`${startAt}:00+01:00`).toISOString();
    const perform = () => command("/api/pilot/guide", body);
    if (temporary) setConfirmation({ text: P.launchConfirm, perform });
    else void perform();
  }
  const boundary = active?.nextStep?.action === "boundary";
  return (
    <div className="admin-root pilot-root pilot-workspace">
      <aside className="pilot-sidebar">
        <strong>
          {C.brand}
          <span>{P.title}</span>
        </strong>
        <nav className="pilot-anchors" aria-label={P.title}>
          <a href="#pilot-guides">{P.guides}</a>
          <a href="#pilot-controls">{P.free}</a>
          <a href="#pilot-normal-stop">{P.normalStop}</a>
        </nav>
        <ScreenShortcuts />
        <a className="admin-view-link" href="/admin" target="ch8-admin">
          {P.admin} ↗
        </a>
      </aside>
      <section className="admin-work pilot-work">
        <header className="pilot-header">
          <span>
            {P.account} <b>{account}</b>
          </span>
          <div className="admin-header-actions">
            <time
              className="admin-clock"
              dateTime={new Date(wall).toISOString()}
            >
              <small>{P.realClock}</small>
              <strong>
                {new Intl.DateTimeFormat("fr-FR", {
                  timeZone: "Africa/Douala",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(wall)}
              </strong>
            </time>
            <button disabled={busy || loggingOut} onClick={logout}>
              {P.logout}
            </button>
          </div>
        </header>
        <main>
          <div className="pilot-heading">
            <div>
              <p className="pilot-eyebrow">
                {C.brand} · {P.title}
              </p>
              <h1>{P.heading}</h1>
              <p>{P.subtitle}</p>
            </div>
            <span className={`pilot-mode ${temporary ? "temporary" : ""}`}>
              {temporary ? P.temporary : P.normal}
            </span>
          </div>
          <p className="pilot-connection" role="status">
            {C.connection[connection]}
            {busy ? ` · ${P.pending}` : ""}
          </p>
          {connection !== "live" && (
            <p className="admin-alert" role="status">
              {P.offline}
            </p>
          )}
          {(error || bannerError) && (
            <p className="admin-alert error" role="alert">
              {error || bannerError}
            </p>
          )}
          {notice && (
            <p className="admin-alert" role="status">
              {notice}
            </p>
          )}
          {!s ? (
            <p>{C.connection.initial}</p>
          ) : (
            <>
              <div className="pilot-metrics">
                <article>
                  <Clock3 />
                  <span>{temporary ? P.simulatedClock : P.realClock}</span>
                  <strong>{date(s.at)}</strong>
                  <small>
                    {s.status === "paused" ? P.paused : P.running}
                    {temporary ? ` · ×${s.speed}` : ""}
                  </small>
                </article>
                <article>
                  <Activity />
                  <span>{C.teamOnShift}</span>
                  <strong>{s.shift?.team ?? C.noPlannedShift}</strong>
                  <small>
                    {s.shift ? C.shiftNames[s.shift.template_id - 1] : "—"}
                  </small>
                </article>
                <article>
                  <span>1A · {P.bottles}</span>
                  <strong>{s.production ? n(s.production.total) : "—"}</strong>
                  <small>
                    {P.target} : {s.production ? n(s.production.target) : "—"}
                  </small>
                </article>
                <article>
                  <span>{P.machine}</span>
                  <strong>
                    {
                      P.machineStates[
                        s.machine.state as keyof typeof P.machineStates
                      ]
                    }
                  </strong>
                  <small>
                    {s.machine.speedBph === null
                      ? "—"
                      : `${n(s.machine.speedBph)} ${C.units.bottlesPerHour}`}
                  </small>
                </article>
              </div>
              {temporary && (
                <section className="pilot-return">
                  <p>{P.normalHint}</p>
                  <button
                    disabled={!allowed}
                    onClick={() =>
                      void command("/api/pilot/normal", {
                        expectedRunId: s.runId,
                      })
                    }
                  >
                    <RotateCcw size={16} />
                    {P.normalReturn}
                  </button>
                </section>
              )}
              {active && (
                <section className="admin-block pilot-active">
                  <span className="pilot-eyebrow">{P.activeGuide}</span>
                  <h2>{active.title}</h2>
                  <ol className="pilot-step-list">
                    {active.steps.map((step, index) => (
                      <li
                        key={step.action}
                        className={
                          index < active.position
                            ? "done"
                            : index === active.position
                              ? "current"
                              : ""
                        }
                      >
                        <span>{index + 1}</span>
                        <div>
                          <strong>{step.title}</strong>
                          {index === active.position && (
                            <p>{step.instruction}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {active.complete ? (
                    <p className="admin-alert">
                      {P.complete} · {P.completeHint}
                    </p>
                  ) : (
                    <>
                      {active.awaitingManager && (
                        <p className="admin-alert">
                          {active.blockedReason ?? P.awaiting}
                          <br />
                          {P.waitingHint}{" "}
                          <a href="/admin" target="ch8-admin">
                            {P.admin} ↗
                          </a>
                        </p>
                      )}
                      {boundary && (
                        <TeamPicker
                          value={nextTeam}
                          setValue={setNextTeam}
                          teams={teams}
                          label={P.nextTeam}
                          empty={P.automaticTeam}
                        />
                      )}
                      <button
                        className="pilot-primary"
                        disabled={!allowed || active.awaitingManager}
                        onClick={() =>
                          void command("/api/pilot/guide/next", {
                            runId: active.runId,
                            expectedPosition: active.position,
                            ...(boundary && nextTeam
                              ? { nextTeamId: Number(nextTeam) }
                              : {}),
                          })
                        }
                      >
                        {P.next} · {active.nextStep?.title}
                        <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className="pilot-secondary"
                    disabled={!allowed}
                    onClick={() =>
                      setConfirmation({
                        text: P.restartHint,
                        perform: () =>
                          command("/api/pilot/guide/restart", {
                            runId: active.runId,
                          }),
                      })
                    }
                  >
                    {P.restart}
                  </button>
                  <details className="admin-history">
                    <summary>{P.result}</summary>
                    <p>{P.resultHint}</p>
                    <div className="pilot-metrics">
                      <article>
                        <span>{P.bottles}</span>
                        <strong>{n(active.initialShift.total)}</strong>
                      </article>
                      <article>
                        <span>{P.good}</span>
                        <strong>{n(active.initialShift.good)}</strong>
                      </article>
                      <article>
                        <span>{P.target}</span>
                        <strong>{n(active.initialShift.target)}</strong>
                      </article>
                      <article>
                        <span>{P.score}</span>
                        <strong>{n(active.initialShift.score)}</strong>
                      </article>
                    </div>
                    <h3>{P.challenge}</h3>
                    <ul>
                      {active.initialShift.challenges.map((c) => (
                        <li key={c.id}>
                          {c.title} · {n(c.value)} / {n(c.target)} · +
                          {n(c.awardedBonus)} {C.units.points}
                        </li>
                      ))}
                    </ul>
                  </details>
                </section>
              )}
            </>
          )}
          <section id="pilot-guides" className="pilot-section">
            <h2>{P.guides}</h2>
            <div className="pilot-guide-grid">
              {guides.map((g, index) => (
                <button
                  key={g.id}
                  className={`pilot-guide ${guideId === g.id ? "selected" : ""}`}
                  aria-pressed={guideId === g.id}
                  disabled={busy}
                  onClick={() => {
                    setGuideId(g.id);
                    setStartMode("adapted");
                  }}
                >
                  <span className="pilot-guide-number">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <strong>{g.title}</strong>
                  <p>{g.summary}</p>
                  <small>
                    {guideId === g.id ? P.selected : P.selectGuide} →
                  </small>
                </button>
              ))}
            </div>
            {chosen && (
              <form className="admin-block pilot-launch" onSubmit={launch}>
                <h3>{chosen.title}</h3>
                <p>{P.startHint}</p>
                <fieldset disabled={!allowed} className="admin-form-fields">
                  <TeamPicker
                    value={team}
                    setValue={setTeam}
                    teams={teams}
                    label={P.team}
                    empty={P.chooseTeam}
                    required
                  />
                  <label>
                    {P.startMode}
                    <select
                      value={startMode}
                      onChange={(e) => setStartMode(e.target.value)}
                    >
                      <option value="adapted">{guideId === 5 ? P.adaptedPassage : P.adapted}</option>
                      <option value="now">{P.now}</option>
                      <option value="custom">{P.custom}</option>
                    </select>
                  </label>
                  {startMode === "custom" && (
                    <label>
                      {P.customDate}
                      <input
                        type="datetime-local"
                        required
                        value={startAt}
                        min={localInput(wall - 31 * 86400000)}
                        max={localInput(wall + 31 * 86400000)}
                        onChange={(e) => setStartAt(e.target.value)}
                      />
                    </label>
                  )}
                </fieldset>
                {guideId === 5 && (
                  <button
                    type="button"
                    className="pilot-secondary"
                    disabled={!allowed}
                    onClick={() => {
                      setStartMode("custom");
                      setStartAt(`${localInput(wall).slice(0, 10)}T23:59`);
                    }}
                  >
                    {P.nightVariant}
                  </button>
                )}
                <details className="pilot-preview">
                  <summary>
                    {P.step} · {chosen.steps.length}
                  </summary>
                  <ol>
                    {chosen.steps.map((step) => (
                      <li key={step.action}>
                        {step.title}
                        <p>{step.instruction}</p>
                      </li>
                    ))}
                  </ol>
                </details>
                <button className="pilot-primary" disabled={!allowed || !team}>
                  <Play size={16} />
                  {P.start}
                </button>
              </form>
            )}
          </section>
          <section id="pilot-controls" className="admin-block">
            <h2>{P.free}</h2>
            <p>{temporary ? P.freeHint : P.onlyScenario}</p>
            <fieldset
              disabled={!allowed || !temporary}
              className="pilot-controls"
            >
              <h3>{P.skipTitle}</h3>
              <p>{P.skipHint}</p>
              <div className="admin-actions">
                {[2, 5, 10, 20].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => void control("skip", { minutes })}
                  >
                    {P.skip} +{minutes} {P.minutes}
                  </button>
                ))}
              </div>

              <div className="admin-actions">
                <button
                  onClick={() =>
                    void control(s?.status === "paused" ? "resume" : "pause")
                  }
                >
                  {s?.status === "paused" ? (
                    <Play size={16} />
                  ) : (
                    <Pause size={16} />
                  )}{" "}
                  {s?.status === "paused" ? P.resume : P.pause}
                </button>
                <label>
                  {P.speed}
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                  >
                    {[1, 2, 5, 10, 30, 60, 120].map((v) => (
                      <option key={v} value={v}>
                        ×{v}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    void control("speed", { speed: Number(speed) })
                  }
                >
                  {P.applySpeed}
                </button>
              </div>
              <div className="admin-actions">
                <button onClick={() => void control("stop")}>
                  {P.simStop}
                </button>
                <button onClick={() => void control("restart")}>
                  {P.simRestart}
                </button>
              </div>
              <p>{P.simStopHint}</p>
              <TeamPicker
                value={nextTeam}
                setValue={setNextTeam}
                teams={teams}
                label={P.nextTeam}
                empty={P.automaticTeam}
              />
              <button
                onClick={() =>
                  setConfirmation({
                    text: P.freeHint,
                    perform: () =>
                      control(
                        "next-shift",
                        nextTeam ? { nextTeamId: Number(nextTeam) } : {},
                      ),
                  })
                }
              >
                {P.nextShift}
              </button>
            </fieldset>
          </section>
          <section
            id="pilot-normal-stop"
            className="admin-block pilot-normal-stop"
          >
            <h2>
              <ShieldAlert size={20} />
              {P.normalStop}
            </h2>
            <p>{P.normalStopHint}</p>
            {(!s?.shift || temporary) && (
              <p className="admin-alert">{P.normalStopUnavailable}</p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmation({
                  text: P.stopConfirmation,
                  perform: () =>
                    command("/api/pilot/normal-stop", {
                      machineId: Number(machine),
                      affectsLine: machine === "4" ? true : affectsLine,
                      note: reason,
                      expectedRunId: s?.runId,
                    }),
                });
              }}
            >
              <fieldset
                disabled={!allowed || temporary || !s?.shift}
                className="admin-form-fields"
              >
                <label>
                  {P.machineChoice}
                  <select
                    value={machine}
                    onChange={(e) => setMachine(e.target.value)}
                  >
                    {machines.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {P.reason}
                  <textarea
                    required
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label>
                  {P.affectsLine}
                  <input
                    type="checkbox"
                    checked={machine === "4" || affectsLine}
                    disabled={machine === "4"}
                    onChange={(e) => setAffectsLine(e.target.checked)}
                  />
                </label>
              </fieldset>
              <button disabled={!allowed || temporary || !s?.shift}>
                {P.stopButton}
              </button>
            </form>
            <h3>{P.openStops}</h3>
            {stopsError && <p role="alert">{stopsError}</p>}
            <button disabled={busy} onClick={() => void loadStops()}>
              {P.refresh}
            </button>
            {!openStops.length ? (
              <p>{P.noStops}</p>
            ) : (
              <>
                <p className="admin-alert">
                  {P.normalStopOngoing}{" "}
                  <a href="/admin" target="ch8-admin">
                    {P.admin} ↗
                  </a>
                </p>
                <ul>
                  {openStops.map((stop) => (
                    <li key={stop.id}>
                      <b>{stop.machine}</b> · {date(stop.starts_at)} ·{" "}
                      {Math.floor(stop.durationSeconds / 60)} {P.minutes}
                      <p>{stop.note}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <footer className="pilot-footer">{C.demo}</footer>
        </main>
      </section>
      {confirmation && (
        <Confirm
          title={confirmation.text}
          error={error}
          busy={busy}
          cancel={() => setConfirmation(null)}
          confirm={async () => {
            if (await confirmation.perform()) setConfirmation(null);
          }}
        />
      )}
    </div>
  );
}
function TeamPicker({
  value,
  setValue,
  teams,
  label,
  empty,
  required = false,
}: {
  value: string;
  setValue: (v: string) => void;
  teams: Named[];
  label: string;
  empty: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
      >
        <option value="">{empty}</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Confirm({
  title,
  error,
  busy,
  cancel,
  confirm,
}: {
  title: string;
  error: string;
  busy: boolean;
  cancel: () => void;
  confirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="admin-detail-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) cancel();
      }}
    >
      <p>{title}</p>
      {error && (
        <p className="admin-alert error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-actions">
        <button disabled={busy} onClick={() => void confirm()}>
          {busy ? P.pending : P.confirm}
        </button>
        <button disabled={busy} onClick={cancel}>
          {P.cancel}
        </button>
      </div>
    </dialog>
  );
}
