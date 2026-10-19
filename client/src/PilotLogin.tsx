import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, ArrowRight } from "lucide-react";
import { ADMIN_TEXT as A, COMMON_TEXT as C, PILOT_TEXT as P } from "./texts.fr";
import { ScreenShortcuts } from "./ScreenShortcuts";
import { PilotDashboard } from "./PilotDashboard";
import "./admin.css";
import "./pilot.css";
/** Une session présentateur distincte conserve la session admin du même navigateur. */
export function PilotLogin() {
  const [account, setAccount] = useState<string | null>(null),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session?space=pilot", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          const b = await r.json();
          if (alive && b.account.role === "presenter")
            setAccount(b.account.username);
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      if (!r.ok) {
        setError(r.status === 429 ? A.rateLimit : A.invalid);
        return;
      }
      const b = await r.json();
      if (b.account.role !== "presenter") {
        setError(P.presenterOnly);
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
        body: JSON.stringify({ space: "pilot" }),
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
      <PilotDashboard
        account={account}
        logout={() => void logout()}
        loggingOut={busy}
        bannerError={error}
        onExpired={() => {
          setAccount(null);
          setError(P.expired);
        }}
      />
    );
  return (
    <div className="admin-root pilot-root">
      <div className="admin-page">
        <section className="story">
          <div className="brand">
            <span className="mark">{C.brand}</span>
            <div>
              {P.title}
              <small>{C.city}</small>
            </div>
          </div>
          <div className="intro">
            <div className="eyebrow">{P.eyebrow}</div>
            <h1>
              {P.lead}
              <br />
              <span>{P.accent}</span>
            </h1>
            <p>{P.intro}</p>
          </div>
          <div className="story-footer">{P.motto}</div>
        </section>
        <section className="form-side">
          <div className="form-wrap">
            <div className="lock">
              <LockKeyhole />
            </div>
            {checking ? (
              <p role="status">{P.checking}</p>
            ) : (
              <>
                <h2>{P.loginTitle}</h2>
                <p className="description">{P.loginDescription}</p>
                <form onSubmit={submit}>
                  <div className="field">
                    <label htmlFor="pilot-username">{A.username}</label>
                    <input
                      id="pilot-username"
                      name="username"
                      autoComplete="username"
                      placeholder={A.usernamePlaceholder}
                      required
                      maxLength={100}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pilot-password">{A.password}</label>
                    <div className="password">
                      <input
                        id="pilot-password"
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
                  <button className="submit" disabled={busy}>
                    <span>{busy ? A.loading : A.submit}</span>
                    <ArrowRight size={17} />
                  </button>
                </form>
                <p className="note">{P.reserved}</p>
              </>
            )}
            {error && (
              <p className="result" role="alert">
                {error}
              </p>
            )}
            <ScreenShortcuts />
            <a className="admin-view-link" href="/admin" target="ch8-admin">
              {P.admin} ↗
            </a>
            <p className="form-footer">{C.demo}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
