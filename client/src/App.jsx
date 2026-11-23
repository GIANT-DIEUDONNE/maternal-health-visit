import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";

function readSession() {
  try {
    return JSON.parse(localStorage.getItem("maternal-session") || "null");
  } catch {
    return null;
  }
}

function App() {
  const [session, setSession] = useState(readSession);
  const navigate = useNavigate();
  const onAuthenticated = (value) => {
    localStorage.setItem("maternal-session", JSON.stringify(value));
    setSession(value);
    navigate("/");
  };
  const logout = () => {
    localStorage.removeItem("maternal-session");
    setSession(null);
    navigate("/login");
  };

  return (
    <div className="app-shell">
      {session && <Header session={session} onLogout={logout} />}
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <AuthPage onAuthenticated={onAuthenticated} />} />
        <Route path="/register" element={session ? <Navigate to="/" replace /> : <AuthPage register onAuthenticated={onAuthenticated} />} />
        <Route path="/" element={<Protected session={session}><Dashboard session={session} /></Protected>} />
        <Route path="/mothers/new" element={<Protected session={session} role="nurse"><MotherForm session={session} /></Protected>} />
        <Route path="/mothers/:id" element={<Protected session={session}><MotherDetail session={session} /></Protected>} />
        <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} />
      </Routes>
    </div>
  );
}

function Protected({ session, role, children }) {
  if (!session?.token) return <Navigate to="/login" replace />;
  if (role && session.user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function Header({ session, onLogout }) {
  return (
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">b</span><span>Bloom<span className="brand-muted"> / maternal care</span></span></Link>
      <div className="topbar-right">
        <span className="role-pill">{session.user.role}</span>
        <span className="user-name">{session.user.name}</span>
        <button className="text-button" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}

function AuthPage({ register = false, onAuthenticated }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({ role: "mother", name: "", email: "", password: "", phone: "", dueDate: "", nurseRegistrationCode: "" });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const registration = values.role === "nurse"
        ? { role: values.role, name: values.name, email: values.email, password: values.password, nurseRegistrationCode: values.nurseRegistrationCode }
        : { role: values.role, name: values.name, email: values.email, password: values.password, phone: values.phone, dueDate: values.dueDate };
      const { token, user } = await api(`/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(register ? registration : { email: values.email, password: values.password })
      });
      onAuthenticated({ token, user });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">PERSONALIZED MATERNAL CARE</span>
        <h1>Every visit is a step toward a healthier beginning.</h1>
        <p>Keep care plans clear, visits on track, and your support team close.</p>
        <div className="intro-note"><span className="note-icon">✳</span><span>One thoughtful reminder at a time.</span></div>
      </section>
      <section className="auth-card">
        <div className="card-kicker">{register ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</div>
        <h2>{register ? "Join Bloom" : "Sign in"}</h2>
        <p className="form-subtitle">{register ? values.role === "nurse" ? "Nurse registration requires a clinic invite code." : "Create your mother account to view your care plan." : "Sign in to continue to your care dashboard."}</p>
        <form onSubmit={submit} className="form-stack">
          {register && <Field label="Full name" value={values.name} onChange={(name) => setValues({ ...values, name })} required />}
          {register && <label className="field"><span>Account role</span><select value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })}><option value="mother">Mother</option><option value="nurse">Nurse</option></select></label>}
          <Field label="Email address" type="email" value={values.email} onChange={(email) => setValues({ ...values, email })} required />
          <Field label="Password" type="password" value={values.password} onChange={(password) => setValues({ ...values, password })} minLength="8" required />
          {register && values.role === "mother" && <>
            <Field label="Phone number" type="tel" value={values.phone} onChange={(phone) => setValues({ ...values, phone })} required />
            <Field label="Expected due date" type="date" value={values.dueDate} onChange={(dueDate) => setValues({ ...values, dueDate })} required />
          </>}
          {register && values.role === "nurse" && <Field label="Nurse invite code" type="password" value={values.nurseRegistrationCode} onChange={(nurseRegistrationCode) => setValues({ ...values, nurseRegistrationCode })} required />}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <button className="button button-primary full-width" disabled={busy}>{busy ? "Please wait..." : register ? "Create account" : "Sign in"} <span>→</span></button>
        </form>
        <p className="auth-switch">{register ? "Already have an account?" : "New to Bloom?"} <Link to={register ? "/login" : "/register"}>{register ? "Sign in" : "Create an account"}</Link></p>
      </section>
    </main>
  );
}

function Dashboard({ session }) {
  const [result, setResult] = useState({ loading: true, error: "", data: [], pagination: null });
  const [page, setPage] = useState(1);
  const [missed, setMissed] = useState([]);
  const [analyticsError, setAnalyticsError] = useState("");
  const load = useCallback(async () => {
    setResult((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [mothers, analytics] = await Promise.all([
        api(`/mothers?page=${page}&limit=6`, { token: session.token }),
        session.user.role === "nurse" ? api("/analytics/missed-visits", { token: session.token }) : Promise.resolve({ data: [] })
      ]);
      setResult({ loading: false, error: "", data: mothers.data, pagination: mothers.pagination });
      setMissed(analytics.data);
      setAnalyticsError("");
    } catch (error) {
      setResult((current) => ({ ...current, loading: false, error: error.message }));
      setAnalyticsError(error.message);
    }
  }, [page, session.token, session.user.role]);
  useEffect(() => { load(); }, [load]);
  const missedCount = missed.reduce((sum, item) => sum + item.missedVisits.length, 0);

  return (
    <main className="page-wrap">
      <div className="page-heading">
        <div><span className="eyebrow">YOUR CARE OVERVIEW</span><h1>{session.user.role === "nurse" ? "Good morning, care team." : `Welcome, ${session.user.name.split(" ")[0]}.`}</h1><p>{session.user.role === "nurse" ? "Here’s the latest across your maternal care list." : "Here’s your personalized visit plan."}</p></div>
        {session.user.role === "nurse" && <Link className="button button-primary" to="/mothers/new"><span className="plus">+</span> Add a mother</Link>}
      </div>
      {session.user.role === "nurse" && (
        <div className="summary-grid">
          <SummaryCard label="MOTHERS IN CARE" value={result.pagination?.total ?? "—"} caption="Across your care list" icon="♡" />
          <SummaryCard label="VISITS TO FOLLOW UP" value={analyticsError ? "—" : missedCount} caption="Past scheduled dates" icon="↗" tone="peach" />
          <SummaryCard label="CARE PLANS" value={result.pagination?.total ?? "—"} caption="Active pregnancy journeys" icon="✳" tone="lavender" />
        </div>
      )}
      {session.user.role === "nurse" && missed.length > 0 && <div className="notice"><span>!</span><p><strong>{missed.length} {missed.length === 1 ? "mother has" : "mothers have"} visits to follow up.</strong> Review their care plans below.</p></div>}
      <div className="section-heading"><div><h2>{session.user.role === "nurse" ? "Mother care plans" : "Your care plan"}</h2><p>{session.user.role === "nurse" ? "A clear view of each journey and next step." : "Your visits, thoughtfully planned around your due date."}</p></div><span className="results-count">{result.pagination?.total ?? 0} {result.pagination?.total === 1 ? "profile" : "profiles"}</span></div>
      {result.loading ? <LoadingState text="Loading care plans..." /> : result.error ? <ErrorState message={result.error} retry={load} /> : result.data.length === 0 ? <EmptyState title="No care plans yet" body={session.user.role === "nurse" ? "Add a mother to start tracking her visits." : "Your care plan will appear here."} /> : (
        <div className="mother-grid">
          {result.data.map((mother) => <MotherCard key={mother._id} mother={mother} token={session.token} />)}
        </div>
      )}
      {!result.loading && result.pagination?.pages > 1 && <div className="pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page} of {result.pagination.pages}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
    </main>
  );
}

function SummaryCard({ label, value, caption, icon, tone = "" }) {
  return <div className="summary-card"><div className="summary-top"><span>{label}</span><span className={`summary-icon ${tone}`}>{icon}</span></div><strong>{value}</strong><small>{caption}</small></div>;
}

function MotherCard({ mother }) {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/mothers/${mother._id}`, { token: readSession()?.token })
      .then((detail) => { if (active) setVisits(detail.visits); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [mother._id]);
  const completed = visits?.filter((visit) => visit.completedAt).length || 0;
  return (
    <Link to={`/mothers/${mother._id}`} className="mother-card">
      <div className="mother-card-top"><div className="avatar">{mother.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><span className="card-arrow">↗</span></div>
      <h3>{mother.name}</h3><span className="due-label">EXPECTED DUE DATE</span><p className="due-date">{formatDate(mother.dueDate)}</p>
      <div className="card-divider" />
      {error ? <span className="muted small">Progress unavailable</span> : visits ? <div className="mini-progress"><div className="progress-track"><span style={{ width: `${completed / 5 * 100}%` }} /></div><span>{completed}/5 visits</span></div> : <span className="muted small">Loading progress…</span>}
    </Link>
  );
}

function MotherForm({ session }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", phone: "", dueDate: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const mother = await api("/mothers", { token: session.token, method: "POST", body: JSON.stringify(values) });
      navigate(`/mothers/${mother._id}`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return <main className="form-page"><Link to="/" className="back-link">← Back to care plans</Link><section className="form-panel"><span className="eyebrow">NEW CARE PLAN</span><h1>Add a mother</h1><p>We’ll create a personalized schedule of five visits based on her due date.</p><form onSubmit={submit} className="form-stack"><Field label="Full name" value={values.name} onChange={(name) => setValues({ ...values, name })} required /><Field label="Phone number" type="tel" value={values.phone} onChange={(phone) => setValues({ ...values, phone })} required /><Field label="Expected due date" type="date" value={values.dueDate} onChange={(dueDate) => setValues({ ...values, dueDate })} required />{error && <ErrorBanner>{error}</ErrorBanner>}<button className="button button-primary" disabled={busy}>{busy ? "Creating..." : "Create care plan"} <span>→</span></button></form></section></main>;
}

function MotherDetail({ session }) {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, error: "", mother: null });
  const [actionError, setActionError] = useState("");
  const [busyVisit, setBusyVisit] = useState(null);
  const load = useCallback(async () => {
    setState({ loading: true, error: "", mother: null });
    try {
      const mother = await api(`/mothers/${id}`, { token: session.token });
      setState({ loading: false, error: "", mother });
    } catch (error) {
      setState({ loading: false, error: error.message, mother: null });
    }
  }, [id, session.token]);
  useEffect(() => { load(); }, [load]);
  const logVisit = async (visitNo) => {
    setBusyVisit(visitNo);
    setActionError("");
    try {
      await api("/visits", { token: session.token, method: "POST", body: JSON.stringify({ motherId: id, visitNo }) });
      await load();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyVisit(null);
    }
  };

  if (state.loading) return <main className="page-wrap"><LoadingState text="Loading care plan..." /></main>;
  if (state.error || !state.mother) return <main className="page-wrap"><ErrorState message={state.error || "Mother not found."} retry={load} /></main>;
  const { mother } = state;
  const visits = mother.visits || [];
  const completed = visits.filter((visit) => visit.completedAt).length;
  const next = visits.find((visit) => !visit.completedAt);
  return (
    <main className="page-wrap detail-page">
      <Link to="/" className="back-link">← All care plans</Link>
      <section className="profile-hero">
        <div className="profile-identity"><div className="avatar avatar-large">{mother.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><span className="eyebrow">MATERNAL CARE PLAN</span><h1>{mother.name}</h1><p>{mother.phone}</p></div></div>
        <div className="due-panel"><span>EXPECTED DUE DATE</span><strong>{formatDate(mother.dueDate)}</strong><small>Care plan personalized for you</small></div>
      </section>
      <section className="progress-panel">
        <div className="progress-ring-wrap"><ProgressRing completed={completed} /><div className="ring-caption"><strong>{completed} of 5</strong><span>visits complete</span></div></div>
        <div className="progress-copy"><span className="eyebrow">YOUR JOURNEY</span><h2>{completed === 5 ? "All visits complete — wonderful work." : next ? `Visit ${next.visitNo} is your next step.` : "Your care plan is ready."}</h2><p>{completed === 5 ? "Your planned prenatal visits are all logged." : next ? `Your next appointment is planned for ${formatDate(next.visitDate)}.` : "Your planned check-ins will appear below."}</p><div className="journey-track"><span style={{ width: `${completed / 5 * 100}%` }} /></div><span className="journey-caption">{5 - completed} visits remaining</span></div>
      </section>
      <div className="section-heading visit-heading"><div><h2>Visit checklist</h2><p>Your schedule is calculated from your expected due date.</p></div><span className="results-count">5 PLANNED VISITS</span></div>
      {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
      <section className="visit-list">
        {visits.map((visit) => <VisitRow key={visit._id} visit={visit} canLog={session.user.role === "nurse"} loading={busyVisit === visit.visitNo} onLog={() => logVisit(visit.visitNo)} />)}
      </section>
    </main>
  );
}

function ProgressRing({ completed }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - completed / 5);
  return <svg className="progress-ring" viewBox="0 0 110 110" aria-label={`${completed} of 5 visits complete`}><circle className="ring-track" cx="55" cy="55" r={radius} /><circle className="ring-value" cx="55" cy="55" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 55 55)" /></svg>;
}

function VisitRow({ visit, canLog, loading, onLog }) {
  const status = visit.completedAt ? "complete" : visit.missed ? "missed" : "upcoming";
  return (
    <div className={`visit-row ${status}`}>
      <div className={`visit-check ${visit.completedAt ? "checked" : ""}`}>{visit.completedAt ? "✓" : String(visit.visitNo).padStart(2, "0")}</div>
      <div className="visit-info"><strong>Visit {visit.visitNo}</strong><span>{visit.completedAt ? `Logged ${formatDate(visit.completedAt)}` : `Scheduled ${formatDate(visit.visitDate)}`}</span></div>
      <span className={`status-pill status-${status}`}>{status === "complete" ? "Completed" : status === "missed" ? "Missed" : "Upcoming"}</span>
      {canLog && !visit.completedAt && <button className="button button-outline button-small" disabled={loading} onClick={onLog}>{loading ? "Saving..." : "Log visit"}</button>}
    </div>
  );
}

function Field({ label, value, onChange, ...inputProps }) {
  return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} {...inputProps} /></label>;
}
function ErrorBanner({ children }) { return <div className="error-banner" role="alert">{children}</div>; }
function LoadingState({ text }) { return <div className="state-card"><span className="spinner" /><p>{text}</p></div>; }
function ErrorState({ message, retry }) { return <div className="state-card state-error"><span className="state-symbol">!</span><h3>Something went wrong</h3><p>{message}</p><button className="button button-outline" onClick={retry}>Try again</button></div>; }
function EmptyState({ title, body }) { return <div className="state-card"><span className="empty-symbol">✳</span><h3>{title}</h3><p>{body}</p></div>; }
function formatDate(value) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export default App;
