import { useCallback, useEffect, useId, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";

const SUPPORT_PHONE = "+250790684556";
const SUPPORT_EMAIL = "support@maternalhealth.rw";

function readSession() {
  try {
    return JSON.parse(localStorage.getItem("maternal-session") || "null");
  } catch {
    return null;
  }
}

function reminderPreferenceKey(email) {
  return `maternal-reminders:${email}`;
}

function readReminderPreference(email) {
  if (!email) return true;
  try {
    return localStorage.getItem(reminderPreferenceKey(email)) !== "false";
  } catch {
    return true;
  }
}

function App() {
  const [session, setSession] = useState(readSession);
  const [remindersEnabled, setRemindersEnabled] = useState(() => readReminderPreference(session?.user?.email));
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardArea = ["/dashboard", "/settings", "/messages", "/health-records"].includes(location.pathname);
  const visitReminder = useVisitReminder(session?.token, session?.user?.role === "mother", remindersEnabled);
  const onAuthenticated = (value) => {
    localStorage.setItem("maternal-session", JSON.stringify(value));
    setSession(value);
    setRemindersEnabled(readReminderPreference(value.user.email));
    navigate("/dashboard");
  };
  const logout = () => {
    localStorage.removeItem("maternal-session");
    setSession(null);
    setRemindersEnabled(true);
    navigate("/login");
  };
  const updateReminderPreference = (enabled) => {
    localStorage.setItem(reminderPreferenceKey(session.user.email), String(enabled));
    setRemindersEnabled(enabled);
  };

  return (
    <div className="app-shell">
      {session && !dashboardArea && <Header session={session} onLogout={logout} visitReminder={visitReminder} />}
      <Routes>
        <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage onAuthenticated={onAuthenticated} />} />
        <Route path="/forgot-password" element={session ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage />} />
        <Route path="/register" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage register onAuthenticated={onAuthenticated} />} />
        <Route path="/dashboard" element={<Protected session={session}><Dashboard session={session} visitReminder={visitReminder} onLogout={logout} /></Protected>} />
        <Route path="/settings" element={<Protected session={session}><SettingsPage session={session} visitReminder={visitReminder} remindersEnabled={remindersEnabled} onReminderPreferenceChange={updateReminderPreference} onLogout={logout} /></Protected>} />
        <Route path="/messages" element={<Protected session={session}><MessagesPage session={session} visitReminder={visitReminder} onLogout={logout} /></Protected>} />
        <Route path="/health-records" element={<Protected session={session}><HealthRecordsPage session={session} visitReminder={visitReminder} onLogout={logout} /></Protected>} />
        <Route path="/mothers/new" element={<Protected session={session} role="nurse"><MotherForm session={session} /></Protected>} />
        <Route path="/mothers/:id" element={<Protected session={session}><MotherDetail session={session} /></Protected>} />
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/"} replace />} />
      </Routes>
    </div>
  );
}

function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="Maternal Health Visit Reminder home">
          <span className="landing-brand-mark" aria-hidden="true">♡</span>
          <span>Maternal Health<span>Visit Reminder</span></span>
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a className="landing-nav-active" href="#home">Home</a>
          <a href="#about">About</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#contact">Contact us</a>
        </nav>
        <div className="landing-actions">
          <Link className="landing-login" to="/login">Log in</Link>
          <Link className="landing-signup" to="/register">Create account</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="home">
          <div className="landing-hero-copy">
            <span className="landing-kicker"><span aria-hidden="true">♡</span> Support for every step</span>
            <h1>Stay on track with your <span>maternal care.</span></h1>
            <p>Keep prenatal visits organized, follow your progress, and make it easier for mothers and nurses to stay connected throughout pregnancy.</p>
            <div className="landing-hero-actions">
              <Link className="landing-primary-button" to="/register">Get started <span aria-hidden="true">→</span></Link>
              <a className="landing-secondary-button" href="#how-it-works">See how it works</a>
            </div>
            <ul className="landing-trust-list">
              <li><span aria-hidden="true">✓</span> Due-date based visit plan</li>
              <li><span aria-hidden="true">✓</span> Progress at a glance</li>
            </ul>
          </div>
          <div className="landing-hero-art">
            <div className="landing-photo" role="img" aria-label="A pregnant mother meeting with a nurse for prenatal care">
              <div className="photo-caption">
                <span aria-hidden="true">♡</span>
                <div><strong>Care, together</strong><small>Support for every step</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-about" id="about">
          <span className="landing-section-kicker">CARE, MADE CLEAR</span>
          <h2>One place to follow your pregnancy visits</h2>
          <p>Know what’s coming up, see what’s been completed, and help your care team follow up when a visit is missed.</p>
        </section>

        <section className="landing-features" id="features" aria-label="Platform features">
          <article className="landing-feature-card">
            <span className="landing-feature-icon feature-purple" aria-hidden="true">▦</span>
            <h3>Planned around your due date</h3>
            <p>Get a clear schedule of five prenatal check-ins based on your expected due date.</p>
          </article>
          <article className="landing-feature-card">
            <span className="landing-feature-icon feature-pink" aria-hidden="true">♡</span>
            <h3>Track visit progress</h3>
            <p>See completed and upcoming visits together in your personal care plan.</p>
          </article>
          <article className="landing-feature-card">
            <span className="landing-feature-icon feature-purple" aria-hidden="true">🔔</span>
            <h3>Get an in-app reminder</h3>
            <p>Sign in to your dashboard the day before a scheduled visit to see your reminder.</p>
          </article>
          <article className="landing-feature-card">
            <span className="landing-feature-icon feature-green" aria-hidden="true">✓</span>
            <h3>Support timely follow-up</h3>
            <p>Nurses can review missed visits, update care plans, and record completed check-ins.</p>
          </article>
        </section>

        <section className="landing-how" id="how-it-works">
          <div className="landing-how-heading">
            <span className="landing-section-kicker">A SIMPLE WAY TO STAY ORGANIZED</span>
            <h2>How it works</h2>
          </div>
          <div className="landing-steps">
            <article className="landing-step"><span className="step-number">01</span><div><h3>Create your account</h3><p>Sign up as a mother or join as a nurse with your clinic invite code.</p></div></article>
            <article className="landing-step"><span className="step-number">02</span><div><h3>View the visit plan</h3><p>Your care plan shows the visits scheduled around the due date.</p></div></article>
            <article className="landing-step"><span className="step-number">03</span><div><h3>See your reminder</h3><p>Sign in the day before your scheduled visit to see a reminder on your dashboard.</p></div></article>
          </div>
          <Link className="landing-primary-button landing-how-button" to="/register">Create your account <span aria-hidden="true">→</span></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand landing-footer-brand" href="#home">
          <span className="landing-brand-mark" aria-hidden="true">♡</span>
          <span>Maternal Health<span>Visit Reminder</span></span>
        </a>
        <div className="landing-footer-copy">
          <p>Thoughtful support for a healthier pregnancy journey.</p>
        </div>
        <a href="#home" className="landing-back-top">Back to top ↑</a>
      </footer>
      <ContactStrip />
    </div>
  );
}

function Protected({ session, role, children }) {
  if (!session?.token) return <Navigate to="/login" replace />;
  if (role && session.user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function useVisitReminder(token, isMother, remindersEnabled) {
  const [state, setState] = useState({ loading: false, error: "", visit: null, visits: [] });
  useEffect(() => {
    let active = true;
    if (!isMother || !token) {
      setState({ loading: false, error: "", visit: null, visits: [] });
      return () => { active = false; };
    }

    setState({ loading: true, error: "", visit: null, visits: [] });
    api("/visits?page=1&limit=100", { token })
      .then(({ data }) => {
        const tomorrow = startOfUtcDay(new Date()).getTime() + 86400000;
        const visit = remindersEnabled
          ? data.find((item) => !item.completedAt && startOfUtcDay(item.visitDate).getTime() === tomorrow)
          : null;
        if (active) setState({ loading: false, error: "", visit: visit || null, visits: data });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, visit: null, visits: [] });
      });
    return () => { active = false; };
  }, [isMother, remindersEnabled, token]);
  return state;
}

function Header({ session, onLogout, visitReminder, dashboard = false }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  return (
    <header className={`topbar${dashboard ? " dashboard-topbar" : ""}`}>
      <Link to="/" className="brand"><span className="brand-mark">{dashboard ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0z" /></svg> : "b"}</span><span>Bloom<span className="brand-muted"> / maternal care</span></span></Link>
      <div className="topbar-right">
        {session.user.role === "mother" && <div className="notification-menu">
          <button
            type="button"
            className="notification-button"
            aria-label={visitReminder.visit ? "1 visit reminder" : "Notifications"}
            aria-expanded={notificationsOpen}
            aria-controls="account-notifications"
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            {visitReminder.visit && <span className="notification-count">1</span>}
          </button>
          {notificationsOpen && <div className="notification-popover" id="account-notifications" role="region" aria-label="Account notifications">
            <div className="notification-popover-heading"><strong>Notifications</strong><span>{visitReminder.visit ? "1 reminder" : ""}</span></div>
            {visitReminder.loading ? <p className="notification-empty">Checking for upcoming visits…</p>
              : visitReminder.error ? <p className="notification-error" role="alert">Reminders could not be loaded: {visitReminder.error}</p>
                : visitReminder.visit ? <Link className="notification-item" to={`/mothers/${visitReminder.visit.motherId}`} onClick={() => setNotificationsOpen(false)}>
                  <span className="notification-item-icon" aria-hidden="true">♡</span>
                  <span><strong>Your visit is tomorrow</strong><small>Visit {visitReminder.visit.visitNo} · {formatDate(visitReminder.visit.visitDate)}</small></span>
                  <span className="notification-arrow" aria-hidden="true">→</span>
                </Link>
                  : <p className="notification-empty">No visit reminders right now. We’ll remind you here the day before a scheduled visit.</p>}
          </div>}
        </div>}
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
        ? { role: values.role, name: values.name, email: values.email, password: values.password, phone: values.phone, nurseRegistrationCode: values.nurseRegistrationCode }
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
  const formCard = (
    <section className={register ? "login-card signup-card" : "login-card"}>
      {!register && <span className="login-lock" aria-hidden="true">🔒</span>}
      {register && <div className="signup-kicker">PERSONALIZED MATERNAL CARE</div>}
      <h2>{register ? "Create your account" : "Welcome Back"}</h2>
      <p className="form-subtitle">{register ? values.role === "nurse" ? "Nurse registration requires a clinic invite code and a phone number for account recovery." : "Create your mother account to view your care plan." : "Sign in to continue to your care dashboard."}</p>
      <form onSubmit={submit} className="form-stack">
        {register && <Field label="Full name" value={values.name} onChange={(name) => setValues({ ...values, name })} required />}
        {register && <label className="field"><span>Account role</span><select value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })}><option value="mother">Mother</option><option value="nurse">Nurse</option></select></label>}
        <Field label="Email address" type="email" autoComplete="email" value={values.email} onChange={(email) => setValues({ ...values, email })} required />
        <Field label="Password" type="password" autoComplete={register ? "new-password" : "current-password"} value={values.password} onChange={(password) => setValues({ ...values, password })} minLength="8" required />
        {register && <Field label="Phone number (include country code)" type="tel" placeholder="+1234567890" value={values.phone} onChange={(phone) => setValues({ ...values, phone })} required />}
        {register && values.role === "mother" && <Field label="Expected due date" type="date" value={values.dueDate} onChange={(dueDate) => setValues({ ...values, dueDate })} required />}
        {register && values.role === "nurse" && <Field label="Nurse invite code" type="password" value={values.nurseRegistrationCode} onChange={(nurseRegistrationCode) => setValues({ ...values, nurseRegistrationCode })} required />}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <button className="button button-primary full-width" disabled={busy}>{busy ? "Please wait..." : register ? "Create account" : "Sign in"} <span>→</span></button>
      </form>
      {!register && <p className="forgot-password-link"><Link to="/forgot-password">Forgot your password?</Link></p>}
      <p className="auth-switch">{register ? "Already have an account?" : "New to Bloom?"} <Link to={register ? "/login" : "/register"}>{register ? "Sign in" : "Create an account"}</Link></p>
    </section>
  );

  return (
    <div className="login-page">
      <header className="login-header">
        <Link className="login-brand" to="/" aria-label="Maternal Health Visit Reminder home">
          <span className="login-brand-mark" aria-hidden="true">♡</span>
          <span>Maternal Health<small>Visit Reminder</small></span>
        </Link>
        <nav className="login-nav" aria-label="Main navigation">
          <Link className="login-nav-active" to="/">Home</Link>
          <Link to="/#about">About</Link>
          <Link to="/#features">Features</Link>
          <Link to="/#how-it-works">How It Works</Link>
          <Link to="/#contact">Contact</Link>
        </nav>
        <div className="login-header-actions">
          <Link className={register ? "" : "login-header-signin"} to="/login" aria-current={register ? undefined : "page"}>Sign In</Link>
          <Link className={register ? "login-header-signup" : ""} to="/register" aria-current={register ? "page" : undefined}>Sign Up</Link>
        </div>
      </header>
      <main className={`login-hero${register ? " signup-hero" : ""}`}>
        <div className="login-photo" role="img" aria-label="A pregnant mother meeting with a nurse for prenatal care" />
        <section className="login-intro">
          <span className="login-kicker"><span aria-hidden="true">♥</span> {register ? "Your care journey starts here" : "Personalized Maternal Care"}</span>
          <h1>{register ? <>Start your journey toward a <span>healthier beginning.</span></> : <>Every visit is a step toward a <span>healthier beginning.</span></>}</h1>
          <p>{register ? "Create an account to organize prenatal visits and stay connected with your care team." : "Keep care plans clear, visits on track, and your support team close."}</p>
          <ul className="login-benefits" aria-label="Care features">
            <li><span aria-hidden="true">▦</span>Track<br />Appointments</li>
            <li><span aria-hidden="true">♧</span>Get<br />Reminders</li>
            <li><span aria-hidden="true">✓</span>Monitor<br />Health Progress</li>
            <li><span aria-hidden="true">♥</span>Better Care<br />for You &amp; Baby</li>
          </ul>
          <p className="login-tagline">Healthy Mother. Healthy Baby. A Healthier World.</p>
        </section>
        {formCard}
      </main>
      <footer className="login-footer">
        <Link className="login-footer-brand" to="/">
          <span className="login-footer-mark" aria-hidden="true">♡</span>
          <strong>Maternal Health Visit Reminder</strong>
        </Link>
        <span className="login-footer-message">Together for a healthier tomorrow <span aria-hidden="true">♥</span></span>
        {!register && <a className="login-footer-contact" href={`tel:${SUPPORT_PHONE}`}>Contact us: {SUPPORT_PHONE}</a>}
      </footer>
      {register && <ContactStrip />}
    </div>
  );
}

function ForgotPasswordPage() {
  const [step, setStep] = useState("request");
  const [values, setValues] = useState({ email: "", phone: "", code: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const complete = step === "complete";
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (step === "reset" && values.newPassword !== values.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (step === "request") {
        const response = await api("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: values.email, phone: values.phone })
        });
        setMessage(response.message);
        setStep("reset");
      } else {
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ email: values.email, phone: values.phone, code: values.code, newPassword: values.newPassword })
        });
        setStep("complete");
      }
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">ACCOUNT SUPPORT</span>
        <h1>Reset your password securely.</h1>
        <p>We’ll send a verification code to the phone number registered to your account.</p>
        <div className="intro-note"><span className="note-icon">✳</span><span>Your phone number helps protect your account.</span></div>
      </section>
      <section className="auth-card">
        <div className="card-kicker">{complete ? "PASSWORD UPDATED" : "ACCOUNT RECOVERY"}</div>
        <h2>{complete ? "Your password is reset" : step === "request" ? "Forgot your password?" : "Enter your new password"}</h2>
        <p className="form-subtitle">
          {complete
            ? "You can now sign in with your new password."
            : step === "request"
              ? "Enter your account email and registered phone number in international format, starting with +."
              : message}
        </p>
        {complete ? (
          <Link className="button button-primary full-width" to="/login">Back to sign in</Link>
        ) : (
          <form onSubmit={submit} className="form-stack">
            {step === "request" ? <>
              <Field label="Email address" type="email" value={values.email} onChange={(email) => setValues({ ...values, email })} required />
              <Field label="Phone number (include country code)" type="tel" placeholder="+1234567890" autoComplete="tel" value={values.phone} onChange={(phone) => setValues({ ...values, phone })} required />
            </> : <>
              <Field label="SMS verification code" inputMode="numeric" autoComplete="one-time-code" value={values.code} onChange={(code) => setValues({ ...values, code })} required />
              <Field label="New password" type="password" minLength="8" value={values.newPassword} onChange={(newPassword) => setValues({ ...values, newPassword })} required />
              <Field label="Confirm new password" type="password" minLength="8" value={values.confirmPassword} onChange={(confirmPassword) => setValues({ ...values, confirmPassword })} required />
            </>}
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <button className="button button-primary full-width" disabled={busy}>{busy ? "Please wait..." : step === "request" ? "Send verification code" : "Update password"} <span>→</span></button>
          </form>
        )}
        {!complete && <p className="recovery-contact">Can’t access your registered phone? <a href={`tel:${SUPPORT_PHONE}`}>Call {SUPPORT_PHONE}</a></p>}
        {!complete && <p className="auth-switch">
          {step === "reset" && <button type="button" className="plain-link" onClick={() => { setError(""); setMessage(""); setStep("request"); }}>Use different details</button>}
          <Link to="/login">Back to sign in</Link>
        </p>}
      </section>
    </main>
  );
}

function Dashboard({ session, visitReminder, onLogout }) {
  const [result, setResult] = useState({ loading: true, error: "", data: [], pagination: null });
  const [page, setPage] = useState(1);
  const [missed, setMissed] = useState([]);
  const [analyticsError, setAnalyticsError] = useState("");
  const [greeting, setGreeting] = useState(getKigaliGreeting);
  useEffect(() => {
    const updateGreeting = () => setGreeting(getKigaliGreeting());
    const interval = window.setInterval(updateGreeting, 60_000);
    document.addEventListener("visibilitychange", updateGreeting);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateGreeting);
    };
  }, []);
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
  const motherVisits = visitReminder.visits || [];
  const completedVisits = motherVisits.filter((visit) => visit.completedAt).length;
  const today = startOfUtcDay(new Date()).getTime();
  const nextVisit = motherVisits.find((visit) => !visit.completedAt && startOfUtcDay(visit.visitDate).getTime() >= today);

  return (
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="dashboard" missedCount={missedCount} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard />
        <div className="dashboard-workspace">
          <main className="page-wrap dashboard-page">
            <div className="page-heading dashboard-heading">
              <div><span className="eyebrow">YOUR CARE OVERVIEW</span><h1>{session.user.role === "nurse" ? `${greeting}, ${session.user.name.split(" ")[0]}.` : `Welcome, ${session.user.name.split(" ")[0]}.`}</h1><p>{session.user.role === "nurse" ? "Here’s the latest across your maternal care list." : "Here’s your personalized visit plan."}</p></div>
              {session.user.role === "nurse" && <Link className="button button-primary" to="/mothers/new"><span className="plus">+</span> Add a mother</Link>}
            </div>
            {session.user.role === "mother" && <VisitReminder state={visitReminder} />}
            <div className="summary-grid dashboard-summary-grid">
              {session.user.role === "nurse" ? <>
                <SummaryCard label="MOTHERS IN CARE" value={result.pagination?.total ?? "—"} caption="Across your care list" icon="▦" />
                <SummaryCard id="follow-ups" label="VISITS TO FOLLOW UP" value={analyticsError ? "—" : missedCount} caption="Past scheduled dates" icon="✓" tone="peach" />
                <SummaryCard label="CARE PLANS" value={result.pagination?.total ?? "—"} caption="Active pregnancy journeys" icon="♡" tone="pink" />
              </> : <>
                <SummaryCard label="VISITS COMPLETED" value={visitReminder.loading ? "—" : `${completedVisits}/${motherVisits.length || 5}`} caption="Your care journey progress" icon="✓" />
                <SummaryCard id="appointments" label="NEXT APPOINTMENT" value={nextVisit ? formatDate(nextVisit.visitDate) : "—"} caption={nextVisit ? `Visit ${nextVisit.visitNo} on your care plan` : "No visits remaining"} icon="▦" tone="peach" />
                <SummaryCard label="EXPECTED DUE DATE" value={result.data[0] ? formatDate(result.data[0].dueDate) : "—"} caption="Your pregnancy milestone" icon="♡" tone="pink" />
              </>}
            </div>
            {session.user.role === "nurse" && missed.length > 0 && <div className="notice dashboard-follow-up"><span aria-hidden="true">♟</span><p><strong>{missed.length} {missed.length === 1 ? "mother has" : "mothers have"} visits to follow up.</strong> Review their care plans below.</p><a href="#care-plans" aria-label="Review care plans">›</a></div>}
            <div className="section-heading dashboard-section-heading" id="care-plans">
              <div className="dashboard-section-title"><span className="dashboard-section-icon" aria-hidden="true">♟</span><div><h2>{session.user.role === "nurse" ? "Mother care plans" : "My care plan"}</h2><p>{session.user.role === "nurse" ? "A clear view of each journey and next step." : "Your visits, thoughtfully planned around your due date."}</p></div></div>
              <span className="results-count">{result.pagination?.total ?? 0} {result.pagination?.total === 1 ? "profile" : "profiles"}</span>
            </div>
            {result.loading ? <LoadingState text="Loading care plans..." /> : result.error ? <ErrorState message={result.error} retry={load} /> : result.data.length === 0 ? <EmptyState title="No care plans yet" body={session.user.role === "nurse" ? "Add a mother to start tracking her visits." : "Your care plan will appear here."} /> : (
              <div className="mother-grid">
                {result.data.map((mother) => <MotherCard key={mother._id} mother={mother} token={session.token} />)}
              </div>
            )}
            {!result.loading && result.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page} of {result.pagination.pages}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ session, visitReminder, remindersEnabled, onReminderPreferenceChange, onLogout }) {
  const [preferenceError, setPreferenceError] = useState("");
  const updateReminderPreference = (enabled) => {
    setPreferenceError("");
    try {
      onReminderPreferenceChange(enabled);
    } catch {
      setPreferenceError("Your reminder preference could not be saved. Check your browser storage and try again.");
    }
  };
  const initials = session.user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="settings" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard />
        <div className="dashboard-workspace">
          <main className="page-wrap dashboard-page settings-page">
            <div className="settings-page-heading">
              <span className="eyebrow">ACCOUNT PREFERENCES</span>
              <h1>Settings</h1>
              <p>Manage your account details and visit reminder preferences.</p>
            </div>
            <section className="settings-card" aria-labelledby="account-details-title">
              <div className="settings-card-heading">
                <span className="settings-card-icon" aria-hidden="true">♙</span>
                <div><h2 id="account-details-title">Account details</h2><p>Your registered account information.</p></div>
              </div>
              <div className="settings-profile">
                <span className="settings-avatar" aria-hidden="true">{initials}</span>
                <div><strong>{session.user.name}</strong><span>{session.user.role === "nurse" ? "Nurse account" : "Mother account"}</span></div>
              </div>
              <dl className="settings-details">
                <div><dt>Email address</dt><dd>{session.user.email}</dd></div>
                <div><dt>Account role</dt><dd>{session.user.role === "nurse" ? "Nurse" : "Mother"}</dd></div>
                {session.user.phone && <div><dt>Phone number</dt><dd>{session.user.phone}</dd></div>}
              </dl>
            </section>
            <section className="settings-card" aria-labelledby="reminder-settings-title">
              <div className="settings-card-heading">
                <span className="settings-card-icon settings-reminder-icon" aria-hidden="true">♧</span>
                <div><h2 id="reminder-settings-title">{session.user.role === "mother" ? "Visit reminders" : "Care follow-ups"}</h2><p>{session.user.role === "mother" ? "Choose whether to show scheduled visit reminders in your account." : "Follow-up alerts for missed visits are shown on your nurse dashboard."}</p></div>
              </div>
              {session.user.role === "mother" ? <>
                <div className="settings-toggle-row">
                  <div><strong>In-app visit reminders</strong><span>Show a notification the day before an appointment.</span></div>
                  <button
                    className="settings-switch"
                    type="button"
                    role="switch"
                    aria-checked={remindersEnabled}
                    aria-label="In-app visit reminders"
                    onClick={() => updateReminderPreference(!remindersEnabled)}
                  ><span /></button>
                </div>
                {preferenceError && <p className="settings-error" role="alert">{preferenceError}</p>}
              </> : <p className="settings-info">Missed appointments remain visible on your dashboard so you can follow up with mothers in your care.</p>}
            </section>
            <section className="settings-support">
              <div><strong>Need help with your account?</strong><span>Contact our support team for assistance.</span></div>
              <a href={`mailto:${SUPPORT_EMAIL}`}>Contact support <span aria-hidden="true">→</span></a>
            </section>
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
  );
}

function HealthRecordsPage({ session, visitReminder, onLogout }) {
  const [result, setResult] = useState({ loading: true, error: "", data: [], pagination: null });
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    setResult((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await api(`/mothers?page=${page}&limit=6`, { token: session.token });
      setResult({ loading: false, error: "", data: response.data, pagination: response.pagination });
    } catch (error) {
      setResult((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, [page, session.token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="health-records" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard />
        <div className="dashboard-workspace">
          <main className="page-wrap dashboard-page directory-page">
            <div className="page-heading dashboard-heading">
              <div><span className="eyebrow">MATERNAL CARE</span><h1>Health records</h1><p>{session.user.role === "nurse" ? "Open a care record to review visit progress and details." : "Your pregnancy care record and scheduled visits."}</p></div>
              {session.user.role === "nurse" && <Link className="button button-primary" to="/mothers/new"><span className="plus">+</span> Add a mother</Link>}
            </div>
            <div className="section-heading dashboard-section-heading"><div className="dashboard-section-title"><span className="dashboard-section-icon" aria-hidden="true">▣</span><div><h2>{session.user.role === "nurse" ? "Mother records" : "Your record"}</h2><p>Select a record to see the full care plan and visit history.</p></div></div><span className="results-count">{result.pagination?.total ?? 0} {result.pagination?.total === 1 ? "record" : "records"}</span></div>
            {result.loading ? <LoadingState text="Loading health records..." /> : result.error ? <ErrorState message={result.error} retry={load} /> : result.data.length === 0 ? <EmptyState title="No health records yet" body={session.user.role === "nurse" ? "Add a mother to create her care record." : "Your care record will appear here."} /> : (
              <div className="mother-grid">{result.data.map((mother) => <MotherCard key={mother._id} mother={mother} token={session.token} />)}</div>
            )}
            {!result.loading && result.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page} of {result.pagination.pages}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
  );
}

function MessagesPage({ session, visitReminder, onLogout }) {
  const [result, setResult] = useState({ loading: true, error: "", data: [], pagination: null });
  const [page, setPage] = useState(1);
  const isNurse = session.user.role === "nurse";
  const load = useCallback(async () => {
    if (!isNurse) {
      setResult({ loading: false, error: "", data: [], pagination: null });
      return;
    }
    setResult((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await api(`/mothers?page=${page}&limit=6`, { token: session.token });
      setResult({ loading: false, error: "", data: response.data, pagination: response.pagination });
    } catch (error) {
      setResult((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, [isNurse, page, session.token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="messages" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard />
        <div className="dashboard-workspace">
          <main className="page-wrap dashboard-page directory-page">
            <div className="page-heading dashboard-heading">
              <div><span className="eyebrow">STAY CONNECTED</span><h1>Messages</h1><p>{isNurse ? "Contact mothers directly using the messaging apps on your device." : "Get in touch with the Maternal Health support team."}</p></div>
            </div>
            {isNurse ? <>
              <div className="section-heading dashboard-section-heading"><div className="dashboard-section-title"><span className="dashboard-section-icon" aria-hidden="true">✉</span><div><h2>Contact a mother</h2><p>Choose a contact method for a mother in your care.</p></div></div><span className="results-count">{result.pagination?.total ?? 0} {result.pagination?.total === 1 ? "mother" : "mothers"}</span></div>
              {result.loading ? <LoadingState text="Loading mother contacts..." /> : result.error ? <ErrorState message={result.error} retry={load} /> : result.data.length === 0 ? <EmptyState title="No mother contacts yet" body="Mother contacts will appear here when care plans are added." /> : (
                <div className="message-list">{result.data.map((mother) => <MotherContactCard key={mother._id} mother={mother} />)}</div>
              )}
              {!result.loading && result.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page} of {result.pagination.pages}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
            </> : (
              <section className="message-support-card">
                <span className="message-support-icon" aria-hidden="true">♡</span>
                <div><h2>Maternal Health Support</h2><p>Contact us about your care plan or account. For urgent medical concerns, contact your local healthcare provider.</p>
                  <div className="message-actions">
                    <a className="button button-primary" href={`tel:${SUPPORT_PHONE}`}>Call support</a>
                    <a className="button button-outline" href={`sms:${phoneForSms(SUPPORT_PHONE)}`}>Send SMS</a>
                    <a className="button button-outline" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent("Maternal Health support request")}&body=${encodeURIComponent("Hello, I need help with my maternal health account or care plan.")}`} target="_blank" rel="noopener noreferrer">Email support</a>
                    <a className="button button-outline" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Maternal Health support request")}&body=${encodeURIComponent("Hello, I need help with my maternal health account or care plan.")}`}>Use your email app</a>
                    <a className="button button-outline" href={whatsAppUrl(SUPPORT_PHONE)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  </div>
                </div>
              </section>
            )}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
  );
}

function MotherContactCard({ mother }) {
  const whatsApp = whatsAppUrl(mother.phone);
  return (
    <article className="message-contact-card">
      <span className="settings-avatar" aria-hidden="true">{mother.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
      <div className="message-contact-info"><strong>{mother.name}</strong><span>{mother.phone}</span><small>Due date: {formatDate(mother.dueDate)}</small></div>
      <div className="message-actions">
        <a className="message-action" href={`tel:${phoneForSms(mother.phone)}`} aria-label={`Call ${mother.name}`}><span aria-hidden="true">☎</span>Call</a>
        <a className="message-action" href={`sms:${phoneForSms(mother.phone)}`} aria-label={`Text ${mother.name}`}><span aria-hidden="true">✉</span>SMS</a>
        {whatsApp && <a className="message-action" href={whatsApp} target="_blank" rel="noopener noreferrer" aria-label={`Message ${mother.name} on WhatsApp`}><span aria-hidden="true">◉</span>WhatsApp</a>}
      </div>
    </article>
  );
}

function phoneForSms(phone) {
  const value = String(phone || "").trim();
  const digits = value.replace(/\D/g, "");
  return value.startsWith("+") ? `+${digits}` : digits;
}

function whatsAppUrl(phone) {
  const value = String(phone || "").trim();
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) return digits ? `https://wa.me/${digits}` : "";
  if (digits.startsWith("0")) return `https://wa.me/250${digits.slice(1)}`;
  return "";
}

function DashboardSidebar({ session, activePage, missedCount, onLogout }) {
  const isNurse = session.user.role === "nurse";
  const isDashboard = activePage === "dashboard";
  const carePlansPath = isDashboard ? "#care-plans" : "/dashboard#care-plans";
  const appointmentsPath = isDashboard ? `#${isNurse ? "follow-ups" : "appointments"}` : `/dashboard#${isNurse ? "follow-ups" : "appointments"}`;
  return (
    <aside className="dashboard-sidebar">
      <Link to="/dashboard" className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">♡</span>
        <span>Maternal Health<small>Visit Reminder</small></span>
      </Link>
      <nav className="sidebar-nav" aria-label="Dashboard navigation">
        <Link className={`sidebar-link${activePage === "dashboard" ? " active" : ""}`} to="/dashboard"><span aria-hidden="true">⌂</span>Dashboard</Link>
        {isDashboard
          ? <a className="sidebar-link" href={carePlansPath}><span aria-hidden="true">▤</span>{isNurse ? "Mother care plans" : "My care plan"}</a>
          : <Link className="sidebar-link" to={carePlansPath}><span aria-hidden="true">▤</span>{isNurse ? "Mother care plans" : "My care plan"}</Link>}
        {isDashboard
          ? <a className="sidebar-link" href={appointmentsPath}><span aria-hidden="true">▦</span>Appointments{isNurse && missedCount > 0 && <span className="sidebar-badge">{missedCount}</span>}</a>
          : <Link className="sidebar-link" to={appointmentsPath}><span aria-hidden="true">▦</span>Appointments{isNurse && missedCount > 0 && <span className="sidebar-badge">{missedCount}</span>}</Link>}
        <Link className={`sidebar-link${activePage === "health-records" ? " active" : ""}`} to="/health-records"><span aria-hidden="true">▣</span>Health Records</Link>
        <Link className={`sidebar-link${activePage === "messages" ? " active" : ""}`} to="/messages"><span aria-hidden="true">✉</span>Messages</Link>
        <Link className={`sidebar-link${activePage === "settings" ? " active" : ""}`} to="/settings"><span aria-hidden="true">⚙</span>Settings</Link>
        <button className="sidebar-link sidebar-menu-logout" type="button" onClick={onLogout}><span aria-hidden="true">⇥</span>Log out</button>
      </nav>
      <div className="sidebar-bottom">
        <span className="sidebar-mother-art" aria-hidden="true">♡</span>
        <p>Healthy Mother.<br />Healthy Baby.<br />A Healthier World.</p>
      </div>
    </aside>
  );
}

function ContactStrip() {
  return (
    <footer className="dashboard-contact" id="contact">
      <div className="dashboard-contact-inner">
        <div className="dashboard-contact-details">
          <strong>Contact Us:</strong>
          <div className="dashboard-contact-links">
            <a href={`mailto:${SUPPORT_EMAIL}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg>
              <span>{SUPPORT_EMAIL}</span>
            </a>
            <a href={`tel:${SUPPORT_PHONE}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3a14 14 0 0 1-7-7l3-2-2-5z" /></svg>
              <span>{SUPPORT_PHONE}</span>
            </a>
          </div>
        </div>
        <div className="dashboard-socials" role="group" aria-label="Social media">
          <a className="dashboard-social-icon" href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">
            f
          </a>
          <a className="dashboard-social-icon" href="https://x.com/" target="_blank" rel="noopener noreferrer" aria-label="Twitter / X" title="Twitter / X">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 5.9a8 8 0 0 1-2.4.7 4.2 4.2 0 0 0 1.8-2.3 8.3 8.3 0 0 1-2.7 1 4.2 4.2 0 0 0-7.2 3.8 12 12 0 0 1-8.7-4.4 4.2 4.2 0 0 0 1.3 5.6 4.1 4.1 0 0 1-1.9-.5v.1a4.2 4.2 0 0 0 3.4 4.1 4 4 0 0 1-1.9.1 4.2 4.2 0 0 0 3.9 2.9A8.4 8.4 0 0 1 1 18.7a11.8 11.8 0 0 0 6.4 1.9c7.7 0 11.9-6.4 11.9-11.9v-.5A8.5 8.5 0 0 0 22 5.9z" /></svg>
          </a>
          <a className="dashboard-social-icon" href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer" aria-label="YouTube" title="YouTube">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 8a3 3 0 0 0-2-2.1C18.2 5.4 12 5.4 12 5.4s-6.2 0-8 .5A3 3 0 0 0 2 8a31 31 0 0 0-.5 4 31 31 0 0 0 .5 4 3 3 0 0 0 2 2.1c1.8.5 8 .5 8 .5s6.2 0 8-.5a3 3 0 0 0 2-2.1 31 31 0 0 0 .5-4 31 31 0 0 0-.5-4z" /><path className="dashboard-social-play" d="m10 15 5-3-5-3z" /></svg>
          </a>
          <a className="dashboard-social-icon dashboard-social-linkedin" href="https://www.linkedin.com/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">in</a>
        </div>
      </div>
    </footer>
  );
}

function VisitReminder({ state }) {
  if (state.loading || (!state.error && !state.visit)) return null;
  if (state.error) return <div className="error-banner visit-reminder-error" role="alert">Your visit reminder could not be loaded: {state.error}</div>;
  return (
    <div className="visit-reminder" role="status" aria-live="polite">
      <span className="visit-reminder-icon" aria-hidden="true">!</span>
      <div><strong>Your visit is tomorrow</strong><p>Visit {state.visit.visitNo} is scheduled for {formatDate(state.visit.visitDate)}. Please plan to see your care provider.</p></div>
      <Link to={`/mothers/${state.visit.motherId}`} className="visit-reminder-link">View care plan <span aria-hidden="true">→</span></Link>
    </div>
  );
}

function SummaryCard({ label, value, caption, icon, tone = "", id }) {
  return <div className="summary-card" id={id}><div className="summary-top"><span>{label}</span><span className={`summary-icon ${tone}`}>{icon}</span></div><strong>{value}</strong><small>{caption}</small></div>;
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
      <div className="mother-card-main">
        <div className="avatar">{mother.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
        <div className="mother-card-info"><h3>{mother.name}</h3><span className="due-label">EXPECTED DUE DATE</span><p className="due-date">{formatDate(mother.dueDate)}</p></div>
        <span className="card-arrow" aria-hidden="true">↗</span>
      </div>
      <div className="mother-card-bottom">
        {error ? <span className="muted small">Progress unavailable</span> : visits ? <><div className="progress-track"><span style={{ width: `${completed / 5 * 100}%` }} /></div><span>{completed}/5 visits</span></> : <span className="muted small">Loading progress…</span>}
      </div>
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
  const inputId = useId();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = inputProps.type === "password";
  const type = isPassword && passwordVisible ? "text" : inputProps.type;
  return (
    <div className={`field${isPassword ? " field-password" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <span className="field-input-wrap">
        <input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} {...inputProps} type={type} />
        {isPassword && (
          <button
            className="password-toggle"
            type="button"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.7 10.7 0 0112 5c5.5 0 9 5 10 7a14 14 0 01-3 3.8M6.2 6.2C3.9 7.6 2.5 9.8 2 12c.5 1 4 7 10 7a10 10 0 004.1-.9" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        )}
      </span>
    </div>
  );
}
function ErrorBanner({ children }) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-icon" aria-hidden="true">!</span>
      <span>{children}</span>
    </div>
  );
}
function LoadingState({ text }) { return <div className="state-card"><span className="spinner" /><p>{text}</p></div>; }
function ErrorState({ message, retry }) { return <div className="state-card state-error"><span className="state-symbol">!</span><h3>Something went wrong</h3><p>{message}</p><button className="button button-outline" onClick={retry}>Try again</button></div>; }
function EmptyState({ title, body }) { return <div className="state-card"><span className="empty-symbol">✳</span><h3>{title}</h3><p>{body}</p></div>; }
function startOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function formatDate(value) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function getKigaliGreeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "Africa/Kigali"
  }).format(date));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export default App;
