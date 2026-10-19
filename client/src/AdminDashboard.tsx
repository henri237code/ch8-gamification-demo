import { useEffect, useRef, useState, type FormEvent } from "react";
import { ADMIN_DASHBOARD_TEXT as T, COMMON_TEXT as C, REPORT_TEXT as R } from "./texts.fr";
import {ShiftReport} from "./ShiftReport";
import { ScreenShortcuts } from "./ScreenShortcuts";
import { useLiveState } from "./useLiveState";
import { AdminModules, AdminForm } from "./AdminForms";
type Entry = {
  date: string;
  templateId: number;
  startsAt: string;
  endsAt: string;
  teamId: number | null;
  team: string | null;
  scheduleId: number | null;
  editable: boolean;
  completed:boolean;
  shiftId:number|null;
};
type Team = { id: number; name: string };
const dateAt = (value: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const humanDate = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00+01:00`));
const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v);
export function AdminDashboard({
  account,
  logout,
  busy,
  onExpired,
  bannerError,
}: {
  account: string;
  logout: () => void;
  busy: boolean;
  onExpired: () => void;
  bannerError?: string;
}) {
  const { state, connection } = useLiveState();
  const [menuOpen, setMenuOpen] = useState(false);
  const editor = useRef<HTMLFormElement>(null);
  const [page, setPage] = useState<string>("home"),
    [from, setFrom] = useState(() => dateAt(new Date().toISOString())),
    [weeks, setWeeks] = useState(2);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [page]);
  const [entries, setEntries] = useState<Entry[]>([]),
    [teams, setTeams] = useState<Team[]>([]),
    [selected, setSelected] = useState<Entry | null>(null),
    [team, setTeam] = useState("");
  const [pending, setPending] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmRemove, setConfirmRemove] = useState(false),
    [target, setTarget] = useState("");
  const [reportId,setReportId]=useState<number|null>(null);
  const openStops = state?.adminAttention.openStops ?? 0;
  const pendingContributions = state?.adminAttention.pendingContributions ?? 0;
  const [baseTarget, setBaseTarget] = useState<{
    current: number;
    target: number;
    effectiveFrom: string;
    pending: boolean;
  } | null>(null);
  const [wallClock, setWallClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setWallClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selected) {
      editor.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      editor.current?.querySelector("select")?.focus({ preventScroll: true });
    }
  }, [selected]);
  async function api(path: string, init?: RequestInit) {
    const r = await fetch(path, { cache: "no-store", ...init });
    if (r.status === 401) {
      onExpired();
      throw Error(T.expired);
    }
    const b = await r.json();
    if (!r.ok) throw Error(b.error ?? T.error);
    return b;
  }
  const loadOrder=useRef(0);
  async function load(background = false) {
    const order=++loadOrder.current;
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      const [p, c, s, b] = await Promise.all([
        api(`/api/manager/planning?from=${from}&days=${weeks * 7}`),
        api("/api/catalogs"),
        api("/api/manager/stoppages"),
        api("/api/manager/base-target"),
      ]);
      if(order!==loadOrder.current)return;
      setBaseTarget(b);
      setEntries(p.entries);
      setTeams(c.teams);
    } catch (e) {
      if (!background) setError(e instanceof Error ? e.message : T.error);
    } finally {
      if (!background) setLoading(false);
    }
  }
  useEffect(() => {
    if (page === "home" || page === "planning" || page === "programs")
      void load();
  }, [page]);
  useEffect(() => {
    if (
      state &&
      (page === "home" || page === "planning" || page === "programs")
    )
      void load(true);
  }, [state?.adminAttention.revision, state?.runId]);
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    message: string,
  ) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setNotice(message);
      setSelected(null);
      setConfirmRemove(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : T.error);
    } finally {
      setPending(false);
    }
  }
  function select(e: Entry) {
    setSelected(e);
    setTeam(e.teamId === null ? "" : String(e.teamId));
    setConfirmRemove(false);
    setNotice("");
    setError("");
  }
  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (selected)
      await mutate(
        "/api/manager/planning",
        "PUT",
        {
          entries: [
            {
              date: selected.date,
              templateId: selected.templateId,
              teamId: Number(team),
            },
          ],
        },
        T.saved,
      );
  }
  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    await mutate(
      "/api/manager/target",
      "POST",
      { target: Number(target) },
      T.targetSaved,
    );
    setTarget("");
  }
  const baseForm = baseTarget && (
    <AdminForm
      title={T.baseTitle}
      hint={T.baseHint}
      initial={{ target: baseTarget.target }}
      fields={[
        {
          name: "target",
          label: T.baseValue,
          type: "number",
          required: true,
          min: 1,
          max: 1000000,
        },
      ]}
      onSave={async (v) => {
        setBaseTarget(
          await api("/api/manager/base-target", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: v.target }),
          }),
        );
      }}
    >
      <p className="admin-muted">
        {T.baseCurrent} : {n(baseTarget.current)}
        {baseTarget.pending && (
          <>
            {" "}
            · {T.baseFuture} : {n(baseTarget.target)} · {T.baseEffective}{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              timeZone: "Africa/Douala",
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(baseTarget.effectiveFrom))}
          </>
        )}
      </p>
    </AdminForm>
  );
  const planned = state?.mode === "real" && !!state.shift;
  return (
    <div className="admin-root admin-workspace">
      {reportId!==null&&<ShiftReport id={reportId} api={api} onClose={()=>setReportId(null)}/>}
        <aside className={`admin-sidebar ${menuOpen ? "is-open" : ""}`}>
        <strong>
          {C.brand} <span>{T.title}</span>
        </strong>
        <button
          className="admin-mobile-menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? T.closeMenu : T.menu}
        </button>
        <nav aria-label={T.title}>
          <button
            className={page === "home" ? "selected" : ""}
            onClick={() => setPage("home")}
          >
            {T.today}
          </button>
          <button
            className={page === "planning" ? "selected" : ""}
            onClick={() => setPage("planning")}
          >
            {T.planning}
          </button>
          <button
            className={page === "programs" ? "selected" : ""}
            onClick={() => setPage("programs")}
          >
            {T.programming}
          </button>
          {T.modules.map((m) => (
            <button
              className={page === m.id ? "selected" : ""}
              key={m.id}
              onClick={() => setPage(m.id)}
            >
              {m.title}
            </button>
          ))}
        </nav>
        <ScreenShortcuts />
      </aside>
      <section className="admin-work">
        <header className="admin-work-header">
          <span>
            {T.account} <b>{account}</b>
          </span>
          {openStops + pendingContributions > 0 && (
            <button
              className="admin-action-required"
              onClick={() => setPage("operations")}
            >
              <i aria-hidden="true" />
              {T.actionRequired} · {pendingContributions} {T.attentionReports} ·{" "}
              {openStops} {T.attentionStops}
            </button>
          )}
          <div className="admin-header-actions">
            <time
              className="admin-clock"
              dateTime={new Date(wallClock).toISOString()}
              title={new Intl.DateTimeFormat("fr-FR", {
                timeZone: "Africa/Douala",
                dateStyle: "full",
              }).format(wallClock)}
            >
              <small>{T.doualaClock}</small>
              <strong>
                {new Intl.DateTimeFormat("fr-FR", {
                  timeZone: "Africa/Douala",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                }).format(wallClock)}
              </strong>
            </time>
            <button disabled={busy || pending} onClick={logout}>
              {T.logout}
            </button>
          </div>
        </header>
        <main>
          <div className="admin-work-title">
            <div>
              <p>
                {page === "home" ? T.today : T.normal} · {C.city}
              </p>
              <h1>
                {page === "home"
                  ? T.welcome
                  : page === "planning"
                    ? T.planning
                    : (T.modules.find((m) => m.id === page)?.title ??
                      T.programming)}
              </h1>
            </div>
            <span role="status">
              {T.connection} · {C.connection[connection]}
            </span>
          </div>
          {state?.mode === "scenario" && (
            <p className="admin-alert">{T.contextWarning}</p>
          )}
          {bannerError && (
            <p className="admin-alert error" role="alert">
              {bannerError}
            </p>
          )}
          {error && (
            <p className="admin-alert error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="admin-alert" role="status">
              {notice}
            </p>
          )}
          {page === "home" ? (
            <>
              <p className="admin-muted">{T.intro}</p>
              <div className="admin-metrics">
                <article>
                  <span>{C.shift}</span>
                  <b>
                    {state?.shift
                      ? C.shiftNames[state.shift.template_id - 1]
                      : C.noPlannedShift}
                  </b>
                  <small>{state?.shift?.team ?? "—"}</small>
                </article>
                <article>
                  <span>{T.target} · 1A</span>
                  <b>{state?.production ? n(state.production.target) : "—"}</b>
                  {state?.production&&<small>{state.production.volumeHl.toLocaleString("fr-FR",{maximumFractionDigits:2})} hL / {state.production.targetHl===null?"—":state.production.targetHl.toLocaleString("fr-FR",{maximumFractionDigits:2})} hL</small>}
                  <small>
                    {T.produced} :{" "}
                    {state?.production ? n(state.production.total) : "—"}
                  </small>
                </article>
                <article>
                  <span>{T.waiting}</span>
                  <b>
                    {state
                      ? state.challenges.filter(
                          (c) => c.status === "awaiting_validation",
                        ).length
                      : "—"}
                  </b>
                  <small>1E</small>
                </article>
                <article>
                  <span>{T.contributionsWaiting}</span>
                  <b>
                    {state
                      ? (state.contributions as { status: string }[]).filter(
                          (c) =>
                            [
                              "submitted",
                              "acknowledged",
                              "in_progress",
                            ].includes(c.status),
                        ).length
                      : "—"}
                  </b>
                  <small>2D</small>
                </article>
                <article>
                  <span>{T.openStops}</span>
                  <b>{openStops}</b>
                  <button onClick={() => setPage("operations")}>
                    {T.open} →
                  </button>
                </article>
              </div>
              <section className="admin-block">
                <h2>{T.shortcuts}</h2>
                <div className="admin-actions">
                  <button onClick={() => setPage("planning")}>
                    {T.planAction} →
                  </button>
                  <button
                    onClick={() => {
                      setTarget(
                        state?.production
                          ? String(state.production.target)
                          : "",
                      );
                      setPage("planning");
                    }}
                  >
                    {T.targetAction} →
                  </button>
                  <button onClick={() => setPage("contents")}>
                    {T.messageAction} →
                  </button>
                </div>
              </section>
              <h2>{T.modulesTitle}</h2>
              <div className="admin-module-grid">
                {T.modules.map((m) => (
                  <article className="admin-block" key={m.title}>
                    <span className="admin-zone">{m.zones}</span>
                    <h3>{m.title}</h3>
                    <p>{m.detail}</p>
                    <button onClick={() => setPage(m.id)}>{T.open} →</button>
                  </article>
                ))}
              </div>
            </>
          ) : page !== "planning" ? (
            <>
              {page === "programs" && baseForm}
              <AdminModules key={page} page={page} api={api} state={state} />
            </>
          ) : (
            <>
              {baseForm}
              <section className="admin-block">
                <span className="admin-zone">{T.planningZones}</span>
                <h2>{T.normal}</h2>
                <p>{T.planningIntro}</p>
                <form
                  className="admin-calendar-filter"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSelected(null);
                    void load();
                  }}
                >
                  <label>
                    {T.from}
                    <input
                      type="date"
                      value={from}
                      required
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    {T.weeks}
                    <select
                      value={weeks}
                      onChange={(e) => setWeeks(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={loading || pending}>
                    {loading ? T.loading : T.refresh}
                  </button>
                </form>
                {loading ? (
                  <p role="status">{T.loading}</p>
                ) : (
                  <div className="admin-calendar">
                    {Array.from(new Set(entries.map((e) => e.date))).map(
                      (day) => (
                        <div className="admin-day" key={day}>
                          <h3>{humanDate(day)}</h3>
                          {entries
                            .filter((e) => e.date === day)
                            .map((e) => (
                              <button
                                className={`${e.teamId ? "assigned" : ""} ${selected?.startsAt === e.startsAt ? "selected" : ""}`}
                                key={e.startsAt}
                                disabled={(!e.editable&&!e.completed) || pending}
                                onClick={() => e.completed&&e.shiftId?setReportId(e.shiftId):select(e)}
                                title={e.completed?R.open:!e.editable ? T.locked : undefined}
                              >
                                <small>{T.shifts[e.templateId - 1]}</small>
                                <b>{e.team ?? T.noTeam}</b>
                                {!e.editable && <small>{e.completed?R.open:T.locked}</small>}
                              </button>
                            ))}
                        </div>
                      ),
                    )}
                  </div>
                )}
                {selected && (
                  <form
                    ref={editor}
                    className="admin-plan-editor"
                    onSubmit={savePlan}
                  >
                    <h3>{T.editTitle}</h3>
                    <p>
                      {humanDate(selected.date)} ·{" "}
                      {T.shifts[selected.templateId - 1]}
                    </p>
                    <label>
                      {T.team}
                      <select
                        required
                        value={team}
                        onChange={(e) => setTeam(e.target.value)}
                      >
                        <option value="">{T.team}</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="admin-actions">
                      <button disabled={pending}>
                        {pending ? T.saving : T.save}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setSelected(null)}
                      >
                        {T.cancel}
                      </button>
                      {selected.scheduleId !== null && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirmRemove(true)}
                        >
                          {T.remove}
                        </button>
                      )}
                    </div>
                    {confirmRemove && (
                      <div className="admin-alert">
                        <p>{T.removeConfirm}</p>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            void mutate(
                              `/api/manager/planning/${selected.scheduleId}`,
                              "DELETE",
                              undefined,
                              T.removed,
                            )
                          }
                        >
                          {T.confirmRemove}
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </section>
              <section className="admin-block">
                <span className="admin-zone">{T.targetZones}</span>
                <h2>{T.targetTitle}</h2>
                <p>{planned ? T.targetHint : T.targetUnavailable}</p>
                {planned && (
                  <form className="admin-calendar-filter" onSubmit={saveTarget}>
                    <label>
                      {T.targetLabel}
                      <input
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        required
                        value={target}
                        placeholder={String(state?.production?.target ?? 15000)}
                        onChange={(e) => setTarget(e.target.value)}
                      />
                    </label>
                    <button disabled={pending}>
                      {pending ? T.saving : T.save}
                    </button>
                  </form>
                )}
                <a
                  className="admin-view-link"
                  href="/ecrans/1"
                  target="ch8-public-screen-1"
                >
                  {T.view} ↗
                </a>
                <button onClick={() => setPage("programs")}>
                  {T.programming} →
                </button>
              </section>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
