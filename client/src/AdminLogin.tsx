import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, ArrowRight } from "lucide-react";
import { ADMIN_TEXT as A, COMMON_TEXT as C } from "./texts.fr";
import "./admin.css";
import { ScreenShortcuts } from "./ScreenShortcuts";
import { AdminDashboard } from "./AdminDashboard";
export function AdminLogin() {
  const [account, setAccount] = useState<string | null>(null),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session?space=manager", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          const b = await r.json();
          if (alive) setAccount(b.account.username);
        }
      })
      .catch(() => {
        if (alive) setError(A.network);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      if (!r.ok) {
        setError(r.status === 429 ? A.rateLimit : A.invalid);
        return;
      }
      const b = await r.json();
      if (b.account.role !== "admin") {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ space: "pilot" }),
        });
        setError(A.forbidden);
        return;
      }
      setAccount(b.account.username);
    } catch {
      setError(A.network);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ space: "manager" }),
      });
      if (!r.ok) throw Error();
      setAccount(null);
    } catch {
      setError(A.logoutError);
    } finally {
      setBusy(false);
    }
  }
  if (account && !checking)
    return (
      <AdminDashboard
        account={account}
        logout={() => void logout()}
        busy={busy}
        bannerError={error}
        onExpired={() => {
          setAccount(null);
          setError(A.sessionExpired);
        }}
      />
    );
  return (
    <div className="admin-root">
      <div className="admin-page">
        <section className="story">
          <div className="brand">
            <span className="mark">{C.brand}</span>
            <div>
              {C.tagline.toUpperCase()}
              <small>
                {C.brandSection} · {C.city}
              </small>
            </div>
          </div>
          <div className="intro">
            <div className="eyebrow">{A.eyebrow}</div>
            <h1>
              {A.lead}
              <br />
              <span>{A.accent}</span>
            </h1>
            <p>{A.intro}</p>
            <div className="steps">
              {A.steps.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
          <div className="story-footer">{A.motto}</div>
        </section>
        <section className="form-side">
          <div className="form-wrap">
            <div className="lock">
              <LockKeyhole />
            </div>
            {checking ? (
              <p role="status">{A.checking}</p>
            ) : account ? (
              <>
                <h2>{A.connected}</h2>
                <p className="description">{account}</p>
                <p className="description">{A.next}</p>
                <button className="submit" disabled={busy} onClick={logout}>
                  {A.logout}
                </button>
              </>
            ) : (
              <>
                <h2>{A.title}</h2>
                <p className="description">{A.description}</p>
                <form onSubmit={submit}>
                  <div className="field">
                    <label htmlFor="username">{A.username}</label>
                    <input
                      id="username"
                      name="username"
                      autoComplete="username"
                      placeholder={A.usernamePlaceholder}
                      required
                      maxLength={100}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="password">{A.password}</label>
                    <div className="password">
                      <input
                        id="password"
                        name="password"
                        type={show ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder={A.passwordPlaceholder}
                        required
                        maxLength={256}
                      />
                      <button
                        type="button"
                        className="eye"
                        onClick={() => setShow(!show)}
                        aria-label={show ? A.hide : A.show}
                      >
                        {show ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="submit" disabled={busy}>
                    <span>{busy ? A.loading : A.submit}</span>
                    <ArrowRight size={17} />
                  </button>
                </form>
                <div className="note">
                  <span>
                    {A.reserved}
                    <br />
                    <b>{A.retained}</b>
                  </span>
                </div>
              </>
            )}
            {error && (
              <p className="result" role="alert">
                {error}
              </p>
            )}
            <ScreenShortcuts />
          </div>
          <div className="bottom">
            {C.brand} · {C.demo}
          </div>
        </section>
      </div>
    </div>
  );
}
