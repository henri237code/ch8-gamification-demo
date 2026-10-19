import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ADMIN_FORMS_TEXT as T, COMMON_TEXT as C } from "./texts.fr";
import type { SharedState } from "../../server/src/runtime";
export type AdminApi = (path: string, init?: RequestInit) => Promise<any>;
type Row = Record<string, any>;
type Option = { value: string; label: string };
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  horizon?: boolean;
  placeholder?: string;
};
const option = (value: string | number, label: string): Option => ({
  value: String(value),
  label,
});
const options = (rows: Row[], key = "id", label = "name") =>
  rows.map((r) => option(r[key], r[label]));
export const doualaInput = (iso: string | null | undefined) =>
  iso ? new Date(Date.parse(iso) + 3600000).toISOString().slice(0, 16) : "";
const instant = (v: unknown) =>
  typeof v === "string" && v ? new Date(`${v}:00+01:00`).toISOString() : null;
const date = (v: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(v));
function formData(form: HTMLFormElement, fields: Field[]) {
  const f = new FormData(form);
  return Object.fromEntries(
    fields.map((x) => {
      const v = f.get(x.name);
      return [
        x.name,
        x.type === "checkbox"
          ? v === "on"
          : x.type === "number"
            ? v === ""
              ? null
              : Number(v)
            : v,
      ];
    }),
  );
}
/** Les valeurs restent dans le formulaire pendant les diffusions Socket.IO. */
export function AdminForm({
  title,
  fields,
  initial = {},
  onSave,
  hint,
  children,
  button = T.save,
}: {
  title: string;
  fields: Field[];
  initial?: Row;
  onSave: (v: Row) => Promise<void>;
  hint?: string;
  children?: ReactNode;
  button?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formData(e.currentTarget, fields);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onSave(values);
      setMessage(T.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : T.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-block">
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="admin-form-fields">
          {fields.map((f) => (
            <label key={f.name}>
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  name={f.name}
                  required={f.required}
                  maxLength={f.maxLength ?? 2000}
                  defaultValue={initial[f.name] ?? ""}
                />
              ) : f.options ? (
                <select
                  name={f.name}
                  required={f.required}
                  defaultValue={initial[f.name] ?? ""}
                >
                  {!f.required && <option value="">{T.all}</option>}
                  {f.required && <option value="">{T.choose}</option>}
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  name={f.name}
                  type="checkbox"
                  defaultChecked={initial[f.name] ?? true}
                />
              ) : (
                <input
                  name={f.name}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  required={f.required}
                  min={
                    f.horizon
                      ? initial[f.name] &&
                        initial[f.name] < doualaInput(new Date().toISOString())
                        ? undefined
                        : doualaInput(new Date().toISOString())
                      : f.min
                  }
                  max={
                    f.horizon
                      ? doualaInput(
                          new Date(Date.now() + 86400000).toISOString(),
                        )
                      : f.max
                  }
                  maxLength={f.maxLength ?? 160}
                  step={f.type === "number" ? "any" : undefined}
                  defaultValue={initial[f.name] ?? ""}
                />
              )}
            </label>
          ))}
        </fieldset>
        {children}
        <button disabled={busy}>{busy ? T.saving : button}</button>
      </form>
      {error && (
        <p className="admin-alert error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="admin-alert" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
function Action({
  label,
  onClick,
}: {
  label: string;
  onClick: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="admin-inline-action">
      <button disabled={busy} onClick={() => setConfirm(true)}>
        {label}
      </button>
      {confirm && (
        <span>
          <span>{T.confirmHint}</span>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onClick();
                setConfirm(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : T.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            {T.confirm}
          </button>
          <button disabled={busy} onClick={() => setConfirm(false)}>
            {T.cancel}
          </button>
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
function View({ screen, zones }: { screen: number; zones: string }) {
  return (
    <a
      className="admin-view-link"
      href={`/ecrans/${screen}`}
      target={`ch8-public-screen-${screen}`}
    >
      {T.view} {screen} · {zones} ↗
    </a>
  );
}
const text = (name: string, label: string, required = true): Field => ({
  name,
  label,
  required,
});
const area = (name: string, label: string, required = true): Field => ({
  name,
  label,
  type: "textarea",
  required,
});
const num = (
  name: string,
  label: string,
  min: number,
  max: number,
  required = true,
): Field => ({ name, label, type: "number", min, max, required });
const select = (
  name: string,
  label: string,
  opts: Option[],
  required = false,
): Field => ({ name, label, options: opts, required });
const dates: Field[] = [
  { name: "startsAt", label: T.from, type: "datetime-local" },
  { name: "endsAt", label: T.until, type: "datetime-local" },
];
const numberOrNull = (v: unknown) => (v ? Number(v) : null);
export function AdminModules({
  page,
  api,
  state,
}: {
  page: string;
  api: AdminApi;
  state: SharedState | null;
}) {
  const [catalog, setCatalog] = useState<Row>({
      teams: [],
      shifts: [],
      quotes: [],
      machines: [],
      badges: [],
      expressChallenges: [],
      messageTemplates: [],
    }),
    [people, setPeople] = useState<Row[]>([]),
    [contents, setContents] = useState<Row[]>([]),
    [programs, setPrograms] = useState<Row[]>([]),
    [recognitions, setRecognitions] = useState<Row[]>([]),
    [stops, setStops] = useState<Row[]>([]),
    [safety, setSafety] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [liveError, setLiveError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<Row | null>(null),
    [kind, setKind] = useState("message"),
    [programKind, setProgramKind] = useState("target");
  const [peopleSearch, setPeopleSearch] = useState(""),
    [peoplePage, setPeoplePage] = useState(1);
  const normalizedName = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const filteredPeople = people.filter((p) =>
    normalizedName(p.display_name).includes(
      normalizedName(peopleSearch.trim()),
    ),
  );
  const peoplePages = Math.max(1, Math.ceil(filteredPeople.length / 8)),
    visiblePage = Math.min(peoplePage, peoplePages);
  const visiblePeople = filteredPeople.slice(
    (visiblePage - 1) * 8,
    visiblePage * 8,
  );
  const [detail, setDetail] = useState<Row | null>(null),
    [teamWeathers, setTeamWeathers] = useState<Row[]>([]),
    [weatherTeamId, setWeatherTeamId] = useState("1");
  const reloadOrder=useRef(0);
  async function reload() {
    const order=++reloadOrder.current;
    const paths = [
      "/api/catalogs",
      "/api/manager/profiles",
      "/api/manager/contents",
      "/api/manager/programs",
      "/api/manager/recognitions",
      "/api/manager/stoppages",
      "/api/manager/safety",
      "/api/manager/team-weather",
    ];
    const [c, p, e, g, r, s, h, w] = await Promise.all(
      paths.map((p) => api(p)),
    );
    if(order!==reloadOrder.current)return;
    setCatalog(c);
    setPeople(p.people);
    setContents(e.contents);
    setPrograms(g.programs);
    setRecognitions(r.recognitions);
    setStops(s.stops);
    setSafety(h.events);
    setTeamWeathers(w.teams);
  }
  useEffect(() => {
    let alive = true;
    reload()
      .catch((e) => {
        if (alive) setError(e.message ?? T.error);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  // Refresh server-backed lists without remounting or clearing an unfinished form.
  const resourceKey = JSON.stringify([
    state?.runId,
    state?.adminAttention,
    state?.challenges.map((c) => [c.id, c.status]),
    state?.contributions,
  ]);
  useEffect(() => {
    if (!state) return;
    void reload()
      .then(() => setLiveError(""))
      .catch((e) => setLiveError(e.message ?? T.error));
  }, [resourceKey]);
  async function send(path: string, body?: Row, method = "POST") {
    await api(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    await reload();
  }
  const teams = options(catalog.teams),
    persons = options(
      people.filter((p) => p.enabled),
      "id",
      "display_name",
    ),
    shifts = options(catalog.shifts),
    presets = options(catalog.expressChallenges, "code", "title"),
    badges = options(catalog.badges, "code", "title");
  const scope = (
    <>
      <p className="admin-alert">
        {T.scope} : {state?.mode === "scenario" ? T.scenario : T.normal} ·{" "}
        {state?.shift?.team ?? T.unplanned}
      </p>
      {liveError && (
        <p role="alert" className="admin-alert error">
          {liveError}
        </p>
      )}
    </>
  );
  if (loading) return <p role="status">{C.connection.initial}</p>;
  if (error)
    return (
      <p className="admin-alert error" role="alert">
        {error}
      </p>
    );
  const programPanel = (
    <>
      <h2>{T.programs}</h2>
      <p className="admin-muted">{T.programHint}</p>
      <label className="admin-kind">
        {T.kind}
        <select
          value={programKind}
          onChange={(e) => {
            setProgramKind(e.target.value);
            setSelected(null);
          }}
        >
          <option value="target">{T.programTarget}</option>
          <option value="challenge">{T.programChallenge}</option>
        </select>
      </label>
      <AdminForm
        key={`program-${programKind}-${selected?.id ?? "new"}`}
        title={programKind === "target" ? T.programTarget : T.programChallenge}
        hint={T.programHint}
        initial={
          selected
            ? {
                startsAt: doualaInput(selected.starts_at),
                endsAt: doualaInput(selected.ends_at),
                ...JSON.parse(selected.payload_json ?? "{}"),
              }
            : {}
        }
        fields={[
          { ...dates[0], required: true, horizon: true },
          ...(programKind === "target"
            ? [num("target", T.target, 1, 1000000), dates[1]]
            : [select("presetCode", T.preset, presets, true)]),
        ]}
        onSave={async (v) => {
          const b: Row = { kind: programKind, startsAt: instant(v.startsAt) };
          if (programKind === "target") {
            b.target = v.target;
            if (v.endsAt) b.endsAt = instant(v.endsAt);
          } else b.presetCode = v.presetCode;
          await send(
            `/api/manager/programs${selected ? `/${selected.id}` : ""}`,
            b,
            selected ? "PUT" : "POST",
          );
          setSelected(null);
        }}
      />
      <div className="admin-records">
        {programs.length === 0 && <p>{T.empty}</p>}
        {programs.map((p) => (
          <article key={p.id}>
            <strong>
              {p.kind === "target" ? T.programTarget : T.programChallenge}
            </strong>
            <p>
              {date(p.starts_at)} – {date(p.ends_at)}
            </p>
            <p>
              {p.kind === "target"
                ? JSON.parse(p.payload_json).target
                : catalog.expressChallenges.find(
                    (c: Row) =>
                      c.code === JSON.parse(p.payload_json).presetCode,
                  )?.title}
            </p>
            <small>
              {p.cancelled_at || p.instance_status === "cancelled"
                ? T.cancelled
                : Date.parse(p.ends_at) <= Date.now()
                  ? T.finished
                  : Date.parse(p.starts_at) <= Date.now()
                    ? T.active
                    : T.future}
            </small>
            {!p.cancelled_at && Date.parse(p.starts_at) > Date.now() && (
              <div className="admin-actions">
                <button
                  onClick={() => {
                    setProgramKind(p.kind);
                    setSelected(p);
                  }}
                >
                  {T.edit}
                </button>
                <Action
                  label={T.cancelProgram}
                  onClick={() =>
                    send(`/api/manager/programs/${p.id}`, undefined, "DELETE")
                  }
                />
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
  if (page === "programs") return programPanel;
  if (page === "contents")
    return (
      <>
        <h2>{T.contentTitle}</h2>
        <p className="admin-muted">{T.contentIntro}</p>
        <div className="admin-actions">
          {Object.entries(T.kinds).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setSelected(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <AdminForm
          key={`${kind}-${selected?.id ?? "new"}`}
          title={T.kinds[kind as keyof typeof T.kinds]}
          fields={[
            text("title", T.title, false),
            area("body", T.body),
            ...(kind === "quote" ? [text("attribution", T.author, false)] : []),
            select(
              "iconCode",
              T.icon,
              Object.entries(T.icons).map(([v, l]) => option(v, l)),
            ),
            select(
              "status",
              T.status,
              [
                option("draft", T.draft),
                option("published", T.published),
                option("archived", T.archived),
              ],
              true,
            ),
            select("teamId", T.team, teams),
            select("shiftTemplateId", T.shift, shifts),
            { ...dates[0], horizon: kind === "message" },
            dates[1],
          ]}
          initial={
            selected
              ? {
                  ...selected,
                  iconCode: selected.icon_code,
                  teamId: selected.team_id,
                  shiftTemplateId: selected.shift_template_id,
                  startsAt: doualaInput(selected.starts_at),
                  endsAt: doualaInput(selected.ends_at),
                }
              : { status: "published" }
          }
          onSave={(v) =>
            send(
              `/api/manager/${selected ? `contents/${selected.id}` : "content"}`,
              {
                ...v,
                kind,
                teamId: numberOrNull(v.teamId),
                shiftTemplateId: numberOrNull(v.shiftTemplateId),
                startsAt: instant(v.startsAt),
                endsAt: instant(v.endsAt),
                iconCode: v.iconCode || null,
              },
              selected ? "PATCH" : "POST",
            )
          }
        />
        <View
          screen={kind === "message" ? 3 : 4}
          zones={kind === "message" ? "3E" : kind === "quote" ? "4C" : "4B"}
        />
        <AdminForm
          title={T.quoteTitle}
          hint={T.quoteHint}
          fields={[
            select(
              "mode",
              T.quoteMode,
              [option("manual", T.manual), option("each_shift", T.automatic)],
              true,
            ),
            select("contentId", T.quote, options(catalog.quotes, "id", "body")),
            select("selectedByTeamId", T.selectedBy, teams),
          ]}
          initial={{
            mode: catalog.quotePreference?.mode ?? "each_shift",
            contentId: catalog.quotePreference?.content_id,
            selectedByTeamId: catalog.quotePreference?.selected_by_team_id,
          }}
          onSave={(v) =>
            send("/api/manager/quote", {
              ...v,
              contentId: numberOrNull(v.contentId),
              selectedByTeamId: numberOrNull(v.selectedByTeamId),
            })
          }
        />
        <AdminForm
          title={T.templates}
          hint={T.templateHint}
          fields={[
            select(
              "code",
              T.template,
              options(catalog.messageTemplates, "code", "body"),
              true,
            ),
            select("teamId", T.team, teams, true),
            select("shiftTemplateId", T.shift, shifts),
            area("body", T.body, false),
          ]}
          onSave={(v) =>
            send("/api/manager/template", {
              ...v,
              teamId: Number(v.teamId),
              shiftTemplateId: numberOrNull(v.shiftTemplateId),
              body: v.body || undefined,
            })
          }
        />
        {(kind === "event" || kind === "sports") &&
          !contents.some(
            (c) => c.kind === kind && c.status === "published",
          ) && (
            <p className="admin-muted">
              {kind === "event" ? T.emptyEvents : T.emptySports}
            </p>
          )}
        <div className="admin-records">
          {contents.map((c) => (
            <article key={c.id}>
              <span className="admin-zone">
                {T.kinds[c.kind as keyof typeof T.kinds]}
              </span>
              <strong>{c.title ?? c.body}</strong>
              <p>{c.body}</p>
              <small>
                {c.status === "published"
                  ? T.published
                  : c.status === "draft"
                    ? T.draft
                    : T.archived}
                {c.starts_at ? ` · ${date(c.starts_at)}` : ""}
              </small>
              <div className="admin-actions">
                <button
                  onClick={() => {
                    setKind(c.kind);
                    setSelected(c);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {T.edit}
                </button>
                {c.status !== "archived" && (
                  <Action
                    label={T.archive}
                    onClick={() =>
                      send(
                        `/api/manager/contents/${c.id}`,
                        { status: "archived" },
                        "PATCH",
                      )
                    }
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      </>
    );
  if (page === "people")
    return (
      <>
        <h2>{T.profileTitle}</h2>
        <p className="admin-muted">{T.profileIntro}</p>
        <button onClick={() => setSelected(null)}>{T.new}</button>
        <AdminForm
          key={selected?.id ?? "new"}
          title={selected ? T.edit : T.new}
          fields={[
            text("displayName", T.name),
            select("teamId", T.team, teams),
            num("birthdayMonth", T.birthdayMonth, 1, 12, false),
            num("birthdayDay", T.birthdayDay, 1, 31, false),
            { name: "enabled", label: T.enabled, type: "checkbox" },
          ]}
          initial={
            selected
              ? {
                  displayName: selected.display_name,
                  teamId: selected.team_id,
                  birthdayMonth: selected.birthday_month,
                  birthdayDay: selected.birthday_day,
                  enabled: !!selected.enabled,
                }
              : {}
          }
          onSave={async (v) => {
            const r = await api(
              `/api/manager/profiles${selected ? `/${selected.id}` : ""}`,
              {
                method: selected ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...v, teamId: numberOrNull(v.teamId) }),
              },
            );
            await reload();
            if (!selected) {
              const p = await api("/api/manager/profiles");
              setSelected(p.people.find((p: Row) => p.id === r.id));
            }
          }}
        />
        {selected ? (
          <PhotoForm
            key={`photo-${selected.id}`}
            person={selected}
            api={api}
            reload={reload}
          />
        ) : (
          <p className="admin-muted">{T.photoHint}</p>
        )}
        <View screen={4} zones="4B" />
        {catalog.teams.map((t: Row) => (
          <AdminForm
            key={t.id}
            title={T.rename}
            fields={[text("name", T.name)]}
            initial={{ name: t.name }}
            onSave={(v) => send(`/api/manager/teams/${t.id}`, v, "PUT")}
          />
        ))}
        <h2>
          {T.profiles} · {filteredPeople.length}{" "}
          {filteredPeople.length === 1 ? T.totalPerson : T.totalPeople}
        </h2>
        <label className="admin-people-search">
          {T.searchPeople}
          <input
            type="search"
            value={peopleSearch}
            onChange={(e) => {
              setPeopleSearch(e.target.value);
              setPeoplePage(1);
            }}
          />
        </label>
        {filteredPeople.length === 0 && <p>{T.noPeople}</p>}
        <div className="admin-people-list">
          {visiblePeople.map((p) => (
            <article key={p.id}>
              <img
                className="admin-portrait"
                src={p.portraitUrl}
                alt={p.display_name}
              />
              <strong>{p.display_name}</strong>
              <p>
                {p.team_name ?? "—"} · {p.birthday_day ?? "—"} /{" "}
                {p.birthday_month ?? "—"}
              </p>
              <p>{p.enabled ? T.enabled : T.archived}</p>
              <button
                onClick={() => {
                  setSelected(p);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {T.edit}
              </button>
            </article>
          ))}
        </div>
        {peoplePages > 1 && (
          <nav className="admin-actions" aria-label={T.profiles}>
            <button
              disabled={visiblePage === 1}
              onClick={() => setPeoplePage(visiblePage - 1)}
            >
              {T.previous}
            </button>
            <span>
              {T.peoplePage} {visiblePage} / {peoplePages}
            </span>
            <button
              disabled={visiblePage === peoplePages}
              onClick={() => setPeoplePage(visiblePage + 1)}
            >
              {T.next}
            </button>
          </nav>
        )}
      </>
    );
  if (page === "distinctions")
    return (
      <>
        {scope}
        <h2>{T.challengeTitle}</h2>
        <p className="admin-muted">{T.challengeHint}</p>
        <div className="admin-records">
          {catalog.expressChallenges.map((p: Row) => (
            <article key={p.code}>
              <img
                className="admin-badge"
                src={p.badgeAssetPath}
                alt={p.title}
              />
              <strong>{p.title}</strong>
              <p>{p.description}</p>
              <small>
                {T.duration} : {p.durationMinutes} {T.minutes} · {T.bonus} :{" "}
                {p.bonusPoints}
              </small>
            </article>
          ))}
        </div>
        <AdminForm
          title={T.launch}
          fields={[select("presetCode", T.preset, presets, true)]}
          onSave={(v) => send("/api/manager/challenge", v)}
        />
        <View screen={1} zones="1E" />
        {state?.challenges
          .filter((c) => c.status === "awaiting_validation")
          .map((c) => (
            <AdminForm
              key={c.id}
              title={`${T.review} · ${c.title}`}
              fields={[
                select(
                  "approved",
                  T.approved,
                  [option("yes", T.approve), option("no", T.refuse)],
                  true,
                ),
                area("note", T.reason),
              ]}
              onSave={(v) =>
                send(`/api/manager/challenges/${c.id}/review`, {
                  approved: v.approved === "yes",
                  note: v.note,
                })
              }
            />
          ))}
        <AdminForm
          title={T.individual}
          fields={[
            select(
              "kind",
              T.kind,
              [
                option("operator_month", T.operator),
                option("safety_badge", T.badge),
              ],
              true,
            ),
            select("personId", T.person, persons, true),
            select("badgeCode", T.badgeCode, badges),
            { name: "month", label: T.month, type: "month" },
            area("reason", T.reason),
          ]}
          initial={{ kind: "operator_month" }}
          onSave={(v) =>
            send("/api/manager/recognitions", {
              ...v,
              personId: Number(v.personId),
              month: v.month || undefined,
              badgeCode: v.badgeCode || undefined,
            })
          }
        />
        <AdminForm
          title={T.teamBadge}
          fields={[
            select("code", T.badgeCode, badges, true),
            select("teamId", T.team, teams, true),
            select("shiftTemplateId", T.shift, shifts),
            area("reason", T.reason),
          ]}
          onSave={(v) =>
            send("/api/manager/badge", {
              ...v,
              teamId: Number(v.teamId),
              shiftTemplateId: numberOrNull(v.shiftTemplateId),
            })
          }
        />
        <div className="admin-records">
          {catalog.badges.map((b: Row) => (
            <article key={b.code}>
              <img className="admin-badge" src={b.assetPath} alt={b.title} />
              <strong>{b.title}</strong>
              <p>{b.description}</p>
            </article>
          ))}
        </div>
        <h2>{T.recognitions}</h2>
        <div className="admin-records">
          {recognitions.map((r) => (
            <article key={r.id}>
              <strong>
                {r.display_name ??
                  catalog.teams.find((t: Row) => t.id === r.team_id)?.name ??
                  "—"}
              </strong>
              <p>
                {r.kind === "operator_month"
                  ? T.operator
                  : r.kind === "safety_badge"
                    ? T.badge
                    : T.contributions}
              </p>
              <p>{r.reason}</p>
              <small>
                {date(r.starts_at)} · {r.revoked_at ? T.revoked : ""}
              </small>
              {!r.revoked_at &&
                ["operator_month", "safety_badge"].includes(r.kind) && (
                  <Action
                    label={T.revoke}
                    onClick={() =>
                      send(
                        `/api/manager/recognitions/${r.id}`,
                        undefined,
                        "DELETE",
                      )
                    }
                  />
                )}
            </article>
          ))}
        </div>
      </>
    );
  if (page === "operations") {
    const contributions = (state?.contributions ?? []) as Row[];
    const lists = [
      ["kaizen", T.kaizenList],
      ["anomaly", T.anomalyList],
    ];
    const current = detail
      ? (contributions.find((c) => c.id === detail.id) ?? detail)
      : null;
    const guidedInterruption =
      current?.kind === "anomaly" &&
      state?.guidedScenario?.contributionId === current?.id;
    const next: Record<string, string[]> = {
      submitted:
        current?.kind === "kaizen"
          ? ["validated", "acknowledged", "rejected"]
          : ["acknowledged", "rejected"],
      acknowledged: ["in_progress", "validated", "rejected"],
      in_progress: guidedInterruption
        ? ["validated", "rejected"]
        : ["validated", "resolved", "rejected"],
      validated: ["resolved"],
    };
    return (
      <>
        {scope}
        <h2>{T.operations}</h2>
        <p className="admin-alert">
          {T.submittedCount} : {state?.kaizen.submitted ?? 0} ·{" "}
          {T.validatedCount} : {state?.kaizen.validated ?? 0}
        </p>
        <AdminForm
          title={T.contributions}
          hint={T.contributionIndependent}
          fields={[
            select(
              "kind",
              T.kind,
              Object.entries(T.contributionKinds).map(([k, v]) => option(k, v)),
              true,
            ),
            text("title", T.title),
            area("description", T.description),
            select("personId", T.person, persons),
            select("machineId", T.machine, options(catalog.machines)),
          ]}
          onSave={(v) =>
            send("/api/manager/contributions", {
              ...v,
              personId: numberOrNull(v.personId),
              machineId: numberOrNull(v.machineId),
            })
          }
        />
        <View screen={2} zones="2D" />
        <AdminForm
          title={T.safety}
          hint={T.safetyHint}
          fields={[
            select(
              "kind",
              T.kind,
              [option("accident", T.accident), option("near_miss", T.nearMiss)],
              true,
            ),
            area("note", T.description),
          ]}
          onSave={(v) => send("/api/manager/safety", v)}
        />

        {lists.map(([kind, label]) => (
          <details className="admin-history" key={kind}>
            <summary>
              {label} · {contributions.filter((c) => c.kind === kind).length}
            </summary>
            <div className="admin-history-scroll">
              {contributions.filter((c) => c.kind === kind).length === 0 && (
                <p>{T.empty}</p>
              )}
              {contributions
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <article className="admin-contribution-row" key={c.id}>
                    <div>
                      <strong>{c.title}</strong>
                      <small>
                        {c.display_name ?? "—"} ·{" "}
                        {T.transitions[c.status as keyof typeof T.transitions]}
                      </small>
                    </div>
                    <button onClick={() => setDetail(c)}>{T.details}</button>
                  </article>
                ))}
            </div>
          </details>
        ))}
        <details className="admin-history">
          <summary>
            {T.stops} · {stops.length}
          </summary>

          <button
            onClick={() => void reload().catch((e) => setError(e.message))}
          >
            {T.refresh}
          </button>
          <div className="admin-history-scroll admin-records">
            {stops.length === 0 && <p>{T.empty}</p>}
            {stops.map((s) => (
              <article key={s.id}>
                <strong>{s.machine}</strong>
                <p>
                  {date(s.starts_at)} –{" "}
                  {s.ends_at ? date(s.ends_at) : T.openStop}
                </p>
                <p>
                  {Math.round(s.durationSeconds / 60)} {T.minutes} · {s.reason}
                </p>
                {s.note && <p>{s.note}</p>}
                {s.open && s.note !== null && (
                  <Action
                    label={T.restart}
                    onClick={() =>
                      send(`/api/manager/stoppages/${s.id}/restart`, {})
                    }
                  />
                )}
              </article>
            ))}
          </div>
        </details>
        <details className="admin-history">
          <summary>
            {T.safetyHistory} · {safety.length}
          </summary>
          <div className="admin-history-scroll admin-records">
            {safety.map((s) => (
              <article key={s.id}>
                <strong>
                  {s.kind === "accident" ? T.accident : T.nearMiss}
                </strong>
                <p>{date(s.occurred_at)}</p>
                <p>{s.note}</p>
              </article>
            ))}
          </div>
        </details>
        {current && (
          <ContributionDialog
            title={current.title}
            onClose={() => setDetail(null)}
          >
            <p>
              <b>{T.person} :</b> {current.display_name ?? "—"}
            </p>
            <p>
              <b>{T.team} :</b> {current.team_name ?? "—"}
            </p>
            <p>
              <b>{T.machine} :</b> {current.machine_name ?? "—"}
            </p>
            <p>
              <b>{T.occurredAt} :</b> {date(current.occurred_at)}
            </p>
            <p className="admin-contribution-description">
              {current.description}
            </p>
            <p>
              {T.status} :{" "}
              {T.transitions[current.status as keyof typeof T.transitions]}
            </p>
            {guidedInterruption && <p className="admin-alert">{T.guidedAnomalyReview}</p>}
            {next[current.status] && (
              <AdminForm
                key={`${current.id}-${current.status}`}
                title={T.contributionReview}
                fields={[
                  select(
                    "status",
                    T.status,
                    next[current.status].map((v) =>
                      option(v, T.transitions[v as keyof typeof T.transitions]),
                    ),
                    true,
                  ),
                  area("note", T.note, false),
                ]}
                onSave={(v) =>
                  send(`/api/manager/contributions/${current.id}/review`, v)
                }
              />
            )}
          </ContributionDialog>
        )}
      </>
    );
  }

  return (
    <>
      {scope}
      <h2>{T.indicators}</h2>
      <AdminForm
        title={T.monthly}
        initial={{ value: state?.monthlyMission.target }}
        fields={[num("value", T.target, 1, 1000000000)]}
        onSave={(v) =>
          send("/api/manager/period-target", {
            kind: "monthly_production",
            value: v.value,
          })
        }
      />
      <View screen={4} zones="4A" />
      <AdminForm
        title={T.energy}
        initial={{ value: state?.energy.targetKw }}
        fields={[num("value", T.value, 0.01, 100000)]}
        onSave={(v) =>
          send("/api/manager/period-target", { kind: "energy", value: v.value })
        }
      />
      <View screen={4} zones="4D" />
      <section id="team-weather-editor">
        <h2>{T.teamWeatherTitle}</h2>
        <p className="admin-muted">{T.teamWeatherHint}</p>
        <label className="admin-kind">
          {T.team}
          <select
            value={weatherTeamId}
            onChange={(e) => setWeatherTeamId(e.target.value)}
          >
            {teamWeathers.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.team_name}
              </option>
            ))}
          </select>
        </label>
        <AdminForm
          key={`team-weather-${weatherTeamId}`}
          title={
            teamWeathers.find((t) => String(t.team_id) === weatherTeamId)
              ?.team_name ?? T.team
          }
          initial={
            teamWeathers.find((t) => String(t.team_id) === weatherTeamId) ?? {}
          }
          fields={[
            num("mood", T.mood, 1, 5),
            num("fatigue", T.fatigue, 1, 5),
            area("note", T.note, false),
          ]}
          onSave={(v) =>
            send(`/api/manager/team-weather/${weatherTeamId}`, v, "PUT")
          }
        />
      </section>
      <h2>{T.teamWeatherList}</h2>
      <div className="admin-records">
        {teamWeathers.map((t) => (
          <article key={t.team_id}>
            <strong>{t.team_name}</strong>
            <p>
              {T.mood} : {t.mood} · {T.fatigue} : {t.fatigue}
            </p>
            <p>{t.note}</p>
            <small>
              {t.source === "demo_default"
                ? T.weatherInitial
                : `${T.weatherUpdated} ${date(t.updated_at)}`}
            </small>
            <button
              onClick={() => {
                setWeatherTeamId(String(t.team_id));
                document
                  .getElementById("team-weather-editor")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {T.edit}
            </button>
          </article>
        ))}
      </div>
      <View screen={3} zones="3D" />
    </>
  );
}
function PhotoForm({
  person,
  api,
  reload,
}: {
  person: Row;
  api: AdminApi;
  reload: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(person.portraitUrl);
  async function upload(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !file ||
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setError(T.photoError);
      return;
    }
    setBusy(true);
    try {
      const r = await api(`/api/manager/profiles/${person.id}/photo`, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      setUrl(r.portraitUrl);
      setMessage(T.saved);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : T.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-block">
      <h2>{T.photo}</h2>
      <img className="admin-portrait" src={url} alt={person.display_name} />
      <form onSubmit={upload}>
        <label>
          {T.photo}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button disabled={busy}>{T.photoSave}</button>
      </form>
      <Action
        label={T.photoRemove}
        onClick={async () => {
          const r = await api(`/api/manager/profiles/${person.id}/photo`, {
            method: "DELETE",
          });
          setUrl(r.portraitUrl);
          setMessage(T.saved);
          await reload();
        }}
      />
      {error && (
        <p className="admin-alert error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function ContributionDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const d = dialog.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className="admin-detail-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button onClick={onClose}>{T.close}</button>
      </header>
      {children}
    </dialog>
  );
}
