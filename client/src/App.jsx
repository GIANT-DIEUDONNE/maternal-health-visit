import { useCallback, useEffect, useId, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";
import { readStoredLanguage } from "./language.js";
import { LanguageProvider, LocalizedMarkup, useLanguage } from "./i18n.jsx";

const SUPPORT_PHONE = "+250790684556";
const SUPPORT_EMAIL = "support@maternalhealth.rw";
const SUPPORT_WHATSAPP_MESSAGE = "Hello, I need help with my maternal health account or care plan.";

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
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

function AppContent() {
  const [session, setSession] = useState(readSession);
  const [remindersEnabled, setRemindersEnabled] = useState(() => readReminderPreference(session?.user?.email));
  const { language, setLanguage } = useLanguage();
  useEffect(() => {
    if (session?.user?.preferredLanguage && session.user.preferredLanguage !== language) {
      setLanguage(session.user.preferredLanguage);
    }
  }, [session?.user?.preferredLanguage, language, setLanguage]);
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardArea = ["/admin", "/dashboard", "/settings", "/messages", "/health-records"].includes(location.pathname)
    || (location.pathname.startsWith("/mothers/") && location.pathname !== "/mothers/new");
  const visitReminder = useVisitReminder(session?.token, session?.user?.role === "mother", remindersEnabled);
  const updateSession = (value) => {
    localStorage.setItem("maternal-session", JSON.stringify(value));
    setSession(value);
    if (value.user.preferredLanguage) setLanguage(value.user.preferredLanguage);
    setRemindersEnabled(readReminderPreference(value.user.email));
  };
  const updateLanguage = async (preferredLanguage) => {
    const previousLanguage = session?.user?.preferredLanguage || language;
    setLanguage(preferredLanguage);
    if (!session?.token) return;
    try {
      const updated = await api("/auth/profile", {
        token: session.token,
        method: "PATCH",
        body: JSON.stringify({ preferredLanguage })
      });
      updateSession({ token: updated.token, user: updated.user });
    } catch (error) {
      setLanguage(previousLanguage);
      throw error;
    }
  };
  const onAuthenticated = (value) => {
    updateSession(value);
    navigate(value.user.role === "admin" ? "/admin" : "/dashboard");
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
      {session && !dashboardArea && <Header session={session} onLogout={logout} visitReminder={visitReminder} onLanguageChange={updateLanguage} />}
      <Routes>
        <Route path="/" element={session ? <Navigate to={session.user.role === "admin" ? "/admin" : "/dashboard"} replace /> : <LandingPage onLanguageChange={updateLanguage} />} />
        <Route path="/login" element={session ? <Navigate to={session.user.role === "admin" ? "/admin" : "/dashboard"} replace /> : <AuthPage onAuthenticated={onAuthenticated} onLanguageChange={updateLanguage} />} />
        <Route path="/forgot-password" element={session ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage onLanguageChange={updateLanguage} />} />
        <Route path="/register" element={session ? <Navigate to={session.user.role === "admin" ? "/admin" : "/dashboard"} replace /> : <AuthPage register onAuthenticated={onAuthenticated} onLanguageChange={updateLanguage} />} />
        <Route path="/admin" element={<Protected session={session} role="admin"><AdminPage session={session} onLogout={logout} onLanguageChange={updateLanguage} /></Protected>} />
        <Route path="/dashboard" element={<Protected session={session}>{session?.user?.role === "admin" ? <Navigate to="/admin" replace /> : <Dashboard session={session} visitReminder={visitReminder} onLogout={logout} onLanguageChange={updateLanguage} />}</Protected>} />
        <Route path="/settings" element={<Protected session={session}><SettingsPage session={session} visitReminder={visitReminder} remindersEnabled={remindersEnabled} onReminderPreferenceChange={updateReminderPreference} onSessionUpdate={updateSession} onLogout={logout} onLanguageChange={updateLanguage} /></Protected>} />
        <Route path="/messages" element={<Protected session={session}><MessagesPage session={session} visitReminder={visitReminder} onLogout={logout} onLanguageChange={updateLanguage} /></Protected>} />
        <Route path="/health-records" element={<Protected session={session}><HealthRecordsPage session={session} visitReminder={visitReminder} onLogout={logout} onLanguageChange={updateLanguage} /></Protected>} />
        <Route path="/mothers/new" element={<Protected session={session} role="nurse"><MotherForm session={session} /></Protected>} />
        <Route path="/mothers/:id" element={<Protected session={session}><MotherDetail session={session} visitReminder={visitReminder} onLogout={logout} onLanguageChange={updateLanguage} /></Protected>} />
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/"} replace />} />
      </Routes>
    </div>
  );
}

function LanguageSelect({ onLanguageChange }) {
  const { language, t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const handleChange = async (event) => {
    setError("");
    setSaving(true);
    try {
      await onLanguageChange(event.target.value);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <LocalizedMarkup>
      <label className="language-control">
        <span className="visually-hidden">{t("Language")}</span>
        <select aria-label={t("Language")} value={language} onChange={handleChange} disabled={saving}>
          <option value="en">English</option>
          <option value="rw">Ikinyarwanda</option>
          <option value="fr">Français</option>
        </select>
        {error && <span className="language-error" role="alert">{error}</span>}
      </label>
    </LocalizedMarkup>
  );
}

function LandingPage({ onLanguageChange }) {
  return (
    <LocalizedMarkup>
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
          <LanguageSelect onLanguageChange={onLanguageChange} />
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
    </LocalizedMarkup>
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

function Header({ session, onLogout, visitReminder, dashboard = false, onLanguageChange }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { t } = useLanguage();
  return (
    <LocalizedMarkup>
    <header className={`topbar${dashboard ? " dashboard-topbar" : ""}`}>
      <Link to="/" className="brand"><span className="brand-mark">{dashboard ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0z" /></svg> : "b"}</span><span>Bloom<span className="brand-muted"> / maternal care</span></span></Link>
      <div className="topbar-right">
        <LanguageSelect onLanguageChange={onLanguageChange} />
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
              : visitReminder.error ? <p className="notification-error" role="alert">{t("Reminders could not be loaded: {error}", { error: t(visitReminder.error) })}</p>
                : visitReminder.visit ? <Link className="notification-item" to={`/mothers/${visitReminder.visit.motherId}`} onClick={() => setNotificationsOpen(false)}>
                  <span className="notification-item-icon" aria-hidden="true">♡</span>
                  <span><strong>Your visit is tomorrow</strong><small>{`Visit ${visitReminder.visit.visitNo} · ${formatDate(visitReminder.visit.visitDate)}`}</small></span>
                  <span className="notification-arrow" aria-hidden="true">→</span>
                </Link>
                  : <p className="notification-empty">No visit reminders right now. We’ll remind you here the day before a scheduled visit.</p>}
          </div>}
        </div>}
        <span className="role-pill">{session.user.role}</span>
        <span className="user-name" translate="no">{session.user.name}</span>
        <button className="text-button" onClick={onLogout}>Log out</button>
      </div>
    </header>
    </LocalizedMarkup>
  );
}

function AuthPage({ register = false, onAuthenticated, onLanguageChange }) {
  const { language, t } = useLanguage();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({ role: "mother", name: "", email: "", password: "", phone: "", dueDate: "", nurseRegistrationCode: "" });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const registration = values.role === "nurse"
        ? { role: values.role, name: values.name, email: values.email, password: values.password, phone: values.phone, nurseRegistrationCode: values.nurseRegistrationCode, preferredLanguage: language }
        : { role: values.role, name: values.name, email: values.email, password: values.password, phone: values.phone, dueDate: values.dueDate, preferredLanguage: language };
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
    <LocalizedMarkup>
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
          <LanguageSelect onLanguageChange={onLanguageChange} />
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
        {!register && <>
          <a className="login-footer-contact" href={`tel:${SUPPORT_PHONE}`}>Call support: {SUPPORT_PHONE}</a>
          <a className="login-footer-contact" href={whatsAppUrl(SUPPORT_PHONE, t(SUPPORT_WHATSAPP_MESSAGE))} target="_blank" rel="noopener noreferrer">WhatsApp support</a>
        </>}
      </footer>
      {register && <ContactStrip />}
    </div>
    </LocalizedMarkup>
  );
}

function ForgotPasswordPage({ onLanguageChange }) {
  const { t } = useLanguage();
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
    <LocalizedMarkup>
    <div className="login-page recovery-page">
      <header className="login-header">
        <Link className="login-brand" to="/" aria-label="Maternal Health Visit Reminder home">
          <span className="login-brand-mark" aria-hidden="true">♡</span>
          <span>Maternal Health<small>Visit Reminder</small></span>
        </Link>
        <nav className="login-nav" aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/#about">About</Link>
          <Link to="/#features">Features</Link>
          <Link to="/#how-it-works">How It Works</Link>
          <Link to="/#contact">Contact</Link>
        </nav>
        <div className="login-header-actions">
          <LanguageSelect onLanguageChange={onLanguageChange} />
          <Link className="login-header-signin" to="/login">Sign In</Link>
          <Link className="login-header-signup" to="/register">Sign Up</Link>
        </div>
      </header>
      <main className="login-hero recovery-hero">
        <div className="login-photo" role="img" aria-label="A pregnant mother meeting with a nurse for prenatal care" />
        <section className="login-intro recovery-intro">
          <span className="login-kicker"><span aria-hidden="true">♥</span> ACCOUNT SUPPORT</span>
          <h1>{complete ? <>Welcome back to your <span>care journey.</span></> : <>Let’s get you back to your <span>care journey.</span></>}</h1>
          <p>{complete ? "Your password has been updated. Sign in to continue keeping your care plan on track." : "Reset your password securely and get back to the support and visit plan you need."}</p>
          <ul className="login-benefits recovery-benefits" aria-label="Secure recovery steps">
            <li><span aria-hidden="true">1</span>Confirm your<br />account</li>
            <li><span aria-hidden="true">2</span>Verify your<br />phone</li>
            <li><span aria-hidden="true">3</span>Choose a new<br />password</li>
          </ul>
          <p className="login-tagline">Healthy Mother. Healthy Baby. A Healthier World.</p>
        </section>
        <section className="login-card recovery-card" aria-labelledby="recovery-title">
          <span className="login-lock" aria-hidden="true">{complete ? "✓" : "🔒"}</span>
          <div className="signup-kicker">{complete ? "PASSWORD UPDATED" : "ACCOUNT RECOVERY"}</div>
          <h2 id="recovery-title">{complete ? "Your password is reset" : step === "request" ? "Forgot your password?" : "Enter your new password"}</h2>
          <p className="form-subtitle">
            {complete
              ? "You can now sign in with your new password."
              : step === "request"
                ? "Enter your account email and registered phone number in international format, starting with +."
                : message}
          </p>
          {complete ? (
            <Link className="button button-primary full-width" to="/login">Back to sign in <span>→</span></Link>
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
          {!complete && <p className="recovery-contact">Can’t access your registered phone? <a href={`tel:${SUPPORT_PHONE}`}>Call {SUPPORT_PHONE}</a> or <a href={whatsAppUrl(SUPPORT_PHONE, t(SUPPORT_WHATSAPP_MESSAGE))} target="_blank" rel="noopener noreferrer">WhatsApp support</a>.</p>}
          {!complete && <p className="auth-switch">
            {step === "reset" && <button type="button" className="plain-link" onClick={() => { setError(""); setMessage(""); setStep("request"); }}>Use different details</button>}
            <Link to="/login">Back to sign in</Link>
          </p>}
        </section>
      </main>
      <footer className="login-footer">
        <Link className="login-footer-brand" to="/">
          <span className="login-footer-mark" aria-hidden="true">♡</span>
          <strong>Maternal Health Visit Reminder</strong>
        </Link>
        <span className="login-footer-message">Together for a healthier tomorrow <span aria-hidden="true">♥</span></span>
        <a className="login-footer-contact" href={`tel:${SUPPORT_PHONE}`}>Call support: {SUPPORT_PHONE}</a>
        <a className="login-footer-contact" href={whatsAppUrl(SUPPORT_PHONE, t(SUPPORT_WHATSAPP_MESSAGE))} target="_blank" rel="noopener noreferrer">WhatsApp support</a>
      </footer>
    </div>
    </LocalizedMarkup>
  );
}

function Dashboard({ session, visitReminder, onLogout, onLanguageChange }) {
  const [result, setResult] = useState({ loading: true, error: "", data: [], pagination: null });
  const [page, setPage] = useState(1);
  const [missed, setMissed] = useState([]);
  const [analyticsError, setAnalyticsError] = useState("");
  const [deletingMotherId, setDeletingMotherId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [greeting, setGreeting] = useState(getKigaliGreeting);
  const { t } = useLanguage();
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
  const removeMother = async (mother) => {
    if (!window.confirm(t("Remove {name} and all of her scheduled visits? This cannot be undone.", { name: mother.name }))) return;
    setDeletingMotherId(mother._id);
    setDeleteError("");
    try {
      await api(`/mothers/${mother._id}`, { token: session.token, method: "DELETE" });
      if (result.data.length === 1 && page > 1) {
        setResult((current) => ({ ...current, loading: true, error: "" }));
        setPage(page - 1);
      }
      else await load();
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeletingMotherId(null);
    }
  };
  const missedCount = missed.reduce((sum, item) => sum + item.missedVisits.length, 0);
  const motherVisits = visitReminder.visits || [];
  const completedVisits = motherVisits.filter((visit) => visit.completedAt).length;
  const today = startOfUtcDay(new Date()).getTime();
  const nextVisit = motherVisits.find((visit) => !visit.completedAt && startOfUtcDay(visit.visitDate).getTime() >= today);

  return (
    <LocalizedMarkup>
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="dashboard" missedCount={missedCount} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard onLanguageChange={onLanguageChange} />
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
                <SummaryCard to={result.data[0] ? `/mothers/${result.data[0]._id}` : undefined} label="EXPECTED DUE DATE" value={result.data[0] ? formatDate(result.data[0].dueDate) : "—"} caption="Open your care plan" icon="♡" tone="pink" />
              </>}
            </div>
            {session.user.role === "nurse" && missed.length > 0 && <div className="notice dashboard-follow-up"><span aria-hidden="true">♟</span><p><strong>{missed.length} {missed.length === 1 ? "mother has" : "mothers have"} visits to follow up.</strong> Review their care plans below.</p><a href="#care-plans" aria-label="Review care plans">›</a></div>}
            <div className="section-heading dashboard-section-heading" id="care-plans">
              <div className="dashboard-section-title"><span className="dashboard-section-icon" aria-hidden="true">♟</span><div><h2>{session.user.role === "nurse" ? "Mother care plans" : "My care plan"}</h2><p>{session.user.role === "nurse" ? "A clear view of each journey and next step." : "Your visits, thoughtfully planned around your due date."}</p></div></div>
              <span className="results-count">{result.pagination?.total ?? 0} {result.pagination?.total === 1 ? "profile" : "profiles"}</span>
            </div>
            {deleteError && <ErrorBanner>{deleteError}</ErrorBanner>}
            {result.loading ? <LoadingState text="Loading care plans..." /> : result.error ? <ErrorState message={result.error} retry={load} /> : result.data.length === 0 ? <EmptyState title="No care plans yet" body={session.user.role === "nurse" ? "Add a mother to start tracking her visits." : "Your care plan will appear here."} /> : (
              <div className="mother-grid">
                {result.data.map((mother) => <MotherCard key={mother._id} mother={mother} token={session.token} onRemove={session.user.role === "nurse" ? removeMother : undefined} removing={deletingMotherId === mother._id} removalDisabled={Boolean(deletingMotherId)} />)}
              </div>
            )}
            {!result.loading && result.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>{`Page ${page} of ${result.pagination.pages}`}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
    </LocalizedMarkup>
  );
}

function SettingsPage({ session, visitReminder, remindersEnabled, onReminderPreferenceChange, onSessionUpdate, onLogout, onLanguageChange }) {
  const [preferenceError, setPreferenceError] = useState("");
  const [profile, setProfile] = useState({ name: session.user.name, email: session.user.email, phone: session.user.phone || "", role: session.user.role });
  const [profileForm, setProfileForm] = useState({ ...profile, currentPassword: "", newPassword: "", confirmPassword: "" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  useEffect(() => {
    let active = true;
    api("/auth/profile", { token: session.token })
      .then(({ user }) => {
        if (!active) return;
        setProfile(user);
        setProfileForm({ ...user, currentPassword: "", newPassword: "", confirmPassword: "" });
      })
      .catch((error) => {
        if (active) setProfileError(error.message);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => { active = false; };
  }, [session.token]);
  const updateReminderPreference = (enabled) => {
    setPreferenceError("");
    try {
      onReminderPreferenceChange(enabled);
    } catch {
      setPreferenceError("Your reminder preference could not be saved. Check your browser storage and try again.");
    }
  };
  const updateProfileField = (field, value) => setProfileForm((current) => ({ ...current, [field]: value }));
  const editProfile = () => {
    setProfileError("");
    setProfileMessage("");
    setProfileForm({ ...profile, currentPassword: "", newPassword: "", confirmPassword: "" });
    setProfileEditing(true);
  };
  const cancelProfileEdit = () => {
    setProfileError("");
    setProfileForm({ ...profile, currentPassword: "", newPassword: "", confirmPassword: "" });
    setProfileEditing(false);
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    if ((profileForm.newPassword || profileForm.confirmPassword) && profileForm.newPassword !== profileForm.confirmPassword) {
      setProfileError("The new passwords do not match.");
      return;
    }
    if (Boolean(profileForm.currentPassword) !== Boolean(profileForm.newPassword)) {
      setProfileError("Enter both your current password and a new password to change your password.");
      return;
    }
    setProfileSaving(true);
    try {
      const body = { name: profileForm.name, email: profileForm.email, phone: profileForm.phone };
      if (profileForm.newPassword) {
        body.currentPassword = profileForm.currentPassword;
        body.newPassword = profileForm.newPassword;
      }
      const updated = await api("/auth/profile", {
        token: session.token,
        method: "PATCH",
        body: JSON.stringify(body)
      });
      const nextSession = { token: updated.token, user: updated.user };
      onSessionUpdate(nextSession);
      setProfile(updated.user);
      setProfileForm({ ...updated.user, currentPassword: "", newPassword: "", confirmPassword: "" });
      setProfileEditing(false);
      setProfileMessage("Your account details have been updated.");
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setProfileSaving(false);
    }
  };
  const initials = profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <LocalizedMarkup>
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="settings" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard onLanguageChange={onLanguageChange} />
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
                <div><h2 id="account-details-title">Account details</h2><p>Edit your profile and sign-in information.</p></div>
                {!profileEditing && <button className="button button-outline button-small settings-edit-button" type="button" disabled={profileLoading} onClick={editProfile}>Edit account</button>}
              </div>
              {profileError && !profileEditing && <ErrorBanner>{profileError}</ErrorBanner>}
              {profileMessage && <p className="settings-success" role="status">{profileMessage}</p>}
              {profileEditing ? (
                <form className="settings-account-form" onSubmit={saveProfile}>
                  <div className="settings-account-fields">
                    <Field label="Full name" autoComplete="name" value={profileForm.name} onChange={(name) => updateProfileField("name", name)} minLength="2" maxLength="100" required />
                    <Field label="Email address" type="email" autoComplete="email" value={profileForm.email} onChange={(email) => updateProfileField("email", email)} maxLength="254" required />
                    <Field label="Phone number (include country code)" type="tel" autoComplete="tel" placeholder="+250790000000" value={profileForm.phone} onChange={(phone) => updateProfileField("phone", phone)} required />
                  </div>
                  <details className="settings-password-section">
                    <summary>Change password (optional)</summary>
                    <div className="settings-password-fields">
                      <Field label="Current password" type="password" autoComplete="current-password" value={profileForm.currentPassword} onChange={(currentPassword) => updateProfileField("currentPassword", currentPassword)} />
                      <Field label="New password" type="password" autoComplete="new-password" value={profileForm.newPassword} onChange={(newPassword) => updateProfileField("newPassword", newPassword)} minLength="8" maxLength="100" />
                      <Field label="Confirm new password" type="password" autoComplete="new-password" value={profileForm.confirmPassword} onChange={(confirmPassword) => updateProfileField("confirmPassword", confirmPassword)} minLength="8" maxLength="100" />
                    </div>
                  </details>
                  {profileError && <ErrorBanner>{profileError}</ErrorBanner>}
                  <div className="settings-account-actions">
                    <button className="button button-outline button-small" type="button" disabled={profileSaving} onClick={cancelProfileEdit}>Cancel</button>
                    <button className="button button-primary button-small" type="submit" disabled={profileSaving}>{profileSaving ? "Updating..." : "Update account"}</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="settings-profile">
                    <span className="settings-avatar" aria-hidden="true">{initials}</span>
                    <div><strong translate="no">{profile.name}</strong><span>{profile.role === "nurse" ? "Nurse account" : "Mother account"}</span></div>
                  </div>
                  <dl className="settings-details">
                    <div><dt>Email address</dt><dd>{profile.email}</dd></div>
                    <div><dt>Account role</dt><dd>{profile.role === "nurse" ? "Nurse" : "Mother"}</dd></div>
                    {profile.phone && <div><dt>Phone number</dt><dd>{profile.phone}</dd></div>}
                  </dl>
                </>
              )}
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
    </LocalizedMarkup>
  );
}

function AdminPage({ session, onLogout, onLanguageChange }) {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState({ data: [], pagination: null });
  const [mothers, setMothers] = useState({ data: [], pagination: null });
  const [missedVisits, setMissedVisits] = useState({ data: [], pagination: null });
  const [codeConfigured, setCodeConfigured] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [motherPage, setMotherPage] = useState(1);
  const [missedPage, setMissedPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [savingUserId, setSavingUserId] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [nurseRegistrationCode, setNurseRegistrationCode] = useState("");
  const [userForm, setUserForm] = useState({ role: "nurse", name: "", email: "", phone: "", password: "", dueDate: "" });
  const [codeMessage, setCodeMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const userQuery = new URLSearchParams({ page: String(userPage), limit: "10" });
    if (roleFilter !== "all") userQuery.set("role", roleFilter);
    const motherQuery = new URLSearchParams({ page: String(motherPage), limit: "10" });
    const missedQuery = new URLSearchParams({ page: String(missedPage), limit: "10" });
    try {
      const [overviewResult, usersResult, mothersResult, missedResult, settingsResult] = await Promise.all([
        api("/admin/overview", { token: session.token }),
        api(`/admin/users?${userQuery}`, { token: session.token }),
        api(`/admin/mothers?${motherQuery}`, { token: session.token }),
        api(`/admin/missed-visits?${missedQuery}`, { token: session.token }),
        api("/admin/settings", { token: session.token })
      ]);
      setOverview(overviewResult);
      setUsers(usersResult);
      setMothers(mothersResult);
      setMissedVisits(missedResult);
      setCodeConfigured(settingsResult.nurseRegistrationCodeConfigured);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [missedPage, motherPage, roleFilter, session.token, userPage]);
  useEffect(() => { load(); }, [load]);

  const createUser = async (event) => {
    event.preventDefault();
    setActionError("");
    setActionMessage("");
    setSavingUser(true);
    const body = { ...userForm };
    if (userForm.role !== "mother") delete body.dueDate;
    try {
      await api("/admin/users", { token: session.token, method: "POST", body: JSON.stringify(body) });
      setUserForm({ role: "nurse", name: "", email: "", phone: "", password: "", dueDate: "" });
      setActionMessage(`${userForm.role === "nurse" ? "Nurse" : "Mother"} account registered.`);
      if (userPage !== 1) setUserPage(1);
      else await load();
    } catch (reason) {
      setActionError(reason.message);
    } finally {
      setSavingUser(false);
    }
  };

  const updateUser = async (user, updates) => {
    setActionError("");
    setActionMessage("");
    setSavingUserId(user._id);
    try {
      const response = await api(`/admin/users/${user._id}`, {
        token: session.token,
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      setUsers((current) => ({
        ...current,
        data: current.data.map((item) => item._id === user._id ? { ...item, ...response.user, _id: user._id } : item)
      }));
      setActionMessage(`${response.user.name}'s account was updated.`);
      await load();
    } catch (reason) {
      setActionError(reason.message);
    } finally {
      setSavingUserId("");
    }
  };

  const saveRegistrationCode = async (event) => {
    event.preventDefault();
    setActionError("");
    setCodeMessage("");
    setSavingCode(true);
    try {
      await api("/admin/settings/nurse-registration-code", {
        token: session.token,
        method: "PUT",
        body: JSON.stringify({ nurseRegistrationCode })
      });
      setCodeConfigured(true);
      setCodeMessage("Invite code saved. Share it directly with authorized nurses; it cannot be viewed again after leaving this page.");
    } catch (reason) {
      setActionError(reason.message);
    } finally {
      setSavingCode(false);
    }
  };

  const stats = overview?.summary;
  const visitReminder = { loading: false, error: "", visit: null, visits: [] };
  const accountIsActive = (user) => user.isActive !== false;

  return (
    <LocalizedMarkup>
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="admin" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard onLanguageChange={onLanguageChange} />
        <div className="dashboard-workspace">
          <main className="page-wrap dashboard-page admin-page">
            <div className="page-heading dashboard-heading">
              <div><span className="eyebrow">SYSTEM ADMINISTRATION</span><h1>Administrator dashboard</h1><p>Manage accounts, monitor maternal care, and update system access settings.</p></div>
              <button className="button button-outline button-small" type="button" disabled={loading} onClick={load}>Refresh data</button>
            </div>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
            {actionMessage && <p className="settings-success" role="status">{actionMessage}</p>}
            {loading && !stats ? <LoadingState text="Loading system overview..." /> : stats && <>
              <section className="summary-grid dashboard-summary-grid admin-summary-grid" id="admin-reports" aria-label="System-wide reports">
                <SummaryCard label="REGISTERED USERS" value={stats.totalUsers} caption={`${stats.activeUsers} active · ${stats.inactiveUsers} inactive`} icon="♙" />
                <SummaryCard label="NURSE ACCOUNTS" value={stats.nurseAccounts} caption="All registered nurses" icon="✚" />
                <SummaryCard label="MOTHER ACCOUNTS" value={stats.motherAccounts} caption={`${stats.motherRecords} care records`} icon="♡" tone="pink" />
                <SummaryCard label="MISSED VISITS" value={stats.missedVisits} caption="Past visits not completed" icon="!" tone="peach" />
                <SummaryCard label="COMPLETED VISITS" value={stats.completedVisits} caption="Visits logged by care teams" icon="✓" />
                <SummaryCard label="UPCOMING VISITS" value={stats.upcomingVisits} caption="Scheduled from today onward" icon="▦" tone="lavender" />
              </section>

              <section className="admin-panel" aria-labelledby="admin-missed-title">
                <div className="admin-panel-heading"><div><h2 id="admin-missed-title">Missed visits to monitor</h2><p>Showing the earliest outstanding visits.</p></div><strong>{stats.missedVisits} total</strong></div>
                {missedVisits.data.length === 0 ? <p className="admin-empty">There are no missed visits to follow up.</p> : (
                  <div className="admin-table-wrap"><table className="admin-table">
                    <thead><tr><th>Mother</th><th>Visit</th><th>Scheduled date</th><th>Phone</th></tr></thead>
                    <tbody>{missedVisits.data.map((visit) => <tr key={visit._id}>
                      <td><Link to={`/mothers/${visit.motherId._id}`}>{visit.motherId.name}</Link></td>
                      <td>Visit {visit.visitNo}</td><td>{formatDate(visit.visitDate)}</td><td>{visit.motherId.phone}</td>
                    </tr>)}</tbody>
                  </table></div>
                )}
                {!loading && missedVisits.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={missedPage === 1} onClick={() => setMissedPage(missedPage - 1)}>← Previous</button><span>{`Page ${missedPage} of ${missedVisits.pagination.pages}`}</span><button className="button button-outline" disabled={missedPage === missedVisits.pagination.pages} onClick={() => setMissedPage(missedPage + 1)}>Next →</button></div>}
              </section>

              <section className="admin-panel" id="admin-users" aria-labelledby="admin-users-title">
                <div className="admin-panel-heading"><div><h2 id="admin-users-title">Manage user accounts</h2><p>Register nurse or mother accounts, assign roles, and activate or deactivate access.</p></div>
                  <label className="admin-filter"><span>Filter role</span><select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setUserPage(1); }}><option value="all">All roles</option><option value="admin">Admin</option><option value="nurse">Nurse</option><option value="mother">Mother</option></select></label>
                </div>
                <form className="admin-create-form" onSubmit={createUser}>
                  <h3>Register an account</h3>
                  <div className="admin-form-grid">
                    <label className="field"><span>Role</span><select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="nurse">Nurse</option><option value="mother">Mother</option></select></label>
                    <Field label="Full name" value={userForm.name} onChange={(name) => setUserForm({ ...userForm, name })} minLength="2" maxLength="100" required />
                    <Field label="Email address" type="email" value={userForm.email} onChange={(email) => setUserForm({ ...userForm, email })} maxLength="254" required />
                    <Field label="Phone number (include country code)" type="tel" placeholder="+250790000000" value={userForm.phone} onChange={(phone) => setUserForm({ ...userForm, phone })} required />
                    <Field label="Initial password" type="password" value={userForm.password} onChange={(password) => setUserForm({ ...userForm, password })} minLength="8" maxLength="100" required />
                    {userForm.role === "mother" && <Field label="Expected due date" type="date" value={userForm.dueDate} onChange={(dueDate) => setUserForm({ ...userForm, dueDate })} required />}
                  </div>
                  <button className="button button-primary button-small" type="submit" disabled={savingUser}>{savingUser ? "Registering..." : "Register account"}</button>
                </form>
                {users.data.length === 0 ? <p className="admin-empty">No accounts match this filter.</p> : (
                  <div className="admin-table-wrap"><table className="admin-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Access</th></tr></thead>
                    <tbody>{users.data.map((user) => {
                      const isSelf = user._id === session.user.id;
                      const isSaving = savingUserId === user._id;
                      return <tr key={user._id}>
                        <td>{user.name}{isSelf && <small className="admin-self-label">You</small>}</td>
                        <td>{user.email}</td>
                        <td><select aria-label={`Role for ${user.name}`} title={user.role !== "mother" && !user.hasCarePlan ? "Create a mother account with a due date before assigning the mother role." : undefined} value={user.role} disabled={isSelf || isSaving} onChange={(event) => updateUser(user, { role: event.target.value })}>
                          <option value="admin">Admin</option><option value="nurse">Nurse</option><option value="mother" disabled={user.role !== "mother" && !user.hasCarePlan}>Mother</option>
                        </select></td>
                        <td><span className={`admin-status ${accountIsActive(user) ? "active" : "inactive"}`}>{accountIsActive(user) ? "Active" : "Inactive"}</span></td>
                        <td><button className="button button-outline button-small" type="button" disabled={isSelf || isSaving} onClick={() => updateUser(user, { isActive: !accountIsActive(user) })}>{isSaving ? "Saving..." : accountIsActive(user) ? "Deactivate" : "Activate"}</button></td>
                      </tr>;
                    })}</tbody>
                  </table></div>
                )}
                {!loading && users.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={userPage === 1} onClick={() => setUserPage(userPage - 1)}>← Previous</button><span>{`Page ${userPage} of ${users.pagination.pages}`}</span><button className="button button-outline" disabled={userPage === users.pagination.pages} onClick={() => setUserPage(userPage + 1)}>Next →</button></div>}
              </section>

              <section className="admin-panel" id="admin-mothers" aria-labelledby="admin-mothers-title">
                <div className="admin-panel-heading"><div><h2 id="admin-mothers-title">Monitor mothers</h2><p>Registered care records and their account access status.</p></div><strong>{mothers.pagination?.total ?? 0} records</strong></div>
                {mothers.data.length === 0 ? <p className="admin-empty">No mother records are registered yet.</p> : (
                  <div className="admin-table-wrap"><table className="admin-table">
                    <thead><tr><th>Mother</th><th>Due date</th><th>Phone</th><th>Account</th><th>Care plan</th></tr></thead>
                    <tbody>{mothers.data.map((mother) => <tr key={mother._id}>
                      <td>{mother.name}</td><td>{formatDate(mother.dueDate)}</td><td>{mother.phone}</td>
                      <td>{mother.userId ? <>{mother.userId.email}<span className={`admin-status ${mother.userId.isActive === false ? "inactive" : "active"}`}>{mother.userId.isActive === false ? "Inactive" : "Active"}</span></> : "No login account"}</td>
                      <td><Link className="admin-view-link" to={`/mothers/${mother._id}`}>View record →</Link></td>
                    </tr>)}</tbody>
                  </table></div>
                )}
                {!loading && mothers.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={motherPage === 1} onClick={() => setMotherPage(motherPage - 1)}>← Previous</button><span>{`Page ${motherPage} of ${mothers.pagination.pages}`}</span><button className="button button-outline" disabled={motherPage === mothers.pagination.pages} onClick={() => setMotherPage(motherPage + 1)}>Next →</button></div>}
              </section>

              <section className="admin-panel" id="admin-settings" aria-labelledby="admin-settings-title">
                <div className="admin-panel-heading"><div><h2 id="admin-settings-title">System settings</h2><p>Only administrators can change the nurse invite code.</p></div><span className={`admin-status ${codeConfigured ? "active" : "inactive"}`}>{codeConfigured ? "Invite code configured" : "Invite code not set"}</span></div>
                <form className="admin-code-form" onSubmit={saveRegistrationCode}>
                  <p>{codeConfigured ? "Forgot the current code? Set a new one here. The old code will stop working immediately." : "Create a code and share it directly with authorized nurses so they can register."}</p>
                  <Field label="New nurse invite code" type="password" autoComplete="new-password" value={nurseRegistrationCode} onChange={setNurseRegistrationCode} minLength="8" maxLength="128" required />
                  <button className="button button-primary button-small" type="submit" disabled={savingCode}>{savingCode ? "Saving..." : codeConfigured ? "Replace invite code" : "Create invite code"}</button>
                  {codeMessage && <p className="settings-success" role="status">{codeMessage}</p>}
                </form>
              </section>
            </>}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
    </LocalizedMarkup>
  );
}

function HealthRecordsPage({ session, visitReminder, onLogout, onLanguageChange }) {
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
    <LocalizedMarkup>
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="health-records" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard onLanguageChange={onLanguageChange} />
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
            {!result.loading && result.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>{`Page ${page} of ${result.pagination.pages}`}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
    </LocalizedMarkup>
  );
}

function MessagesPage({ session, visitReminder, onLogout, onLanguageChange }) {
  const { t } = useLanguage();
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
    <LocalizedMarkup>
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="messages" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard onLanguageChange={onLanguageChange} />
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
              {!result.loading && result.pagination?.pages > 1 && <div className="pagination dashboard-pagination"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>{`Page ${page} of ${result.pagination.pages}`}</span><button className="button button-outline" disabled={page === result.pagination.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
            </> : (
              <section className="message-support-card">
                <span className="message-support-icon" aria-hidden="true">♡</span>
                <div><h2>Maternal Health Support</h2><p>Contact us about your care plan or account. For urgent medical concerns, contact your local healthcare provider.</p>
                  <div className="message-actions">
                    <a className="button button-primary" href={`tel:${SUPPORT_PHONE}`}>Call support</a>
                    <a className="button button-outline" href={`sms:${phoneForSms(SUPPORT_PHONE)}`}>Send SMS</a>
                    <a className="button button-outline" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent(t("Maternal Health support request"))}&body=${encodeURIComponent(t(SUPPORT_WHATSAPP_MESSAGE))}`} target="_blank" rel="noopener noreferrer">Email support (Gmail)</a>
                    <a className="button button-outline" href={whatsAppUrl(SUPPORT_PHONE, t(SUPPORT_WHATSAPP_MESSAGE))} target="_blank" rel="noopener noreferrer">WhatsApp support</a>
                  </div>
                </div>
              </section>
            )}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
    </LocalizedMarkup>
  );
}

function MotherContactCard({ mother }) {
  const whatsApp = whatsAppUrl(mother.phone);
  return (
    <LocalizedMarkup>
    <article className="message-contact-card">
      <span className="settings-avatar" aria-hidden="true">{mother.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
      <div className="message-contact-info"><strong translate="no">{mother.name}</strong><span translate="no">{mother.phone}</span><small>{`Due date: ${formatDate(mother.dueDate)}`}</small></div>
      <div className="message-actions">
        <a className="message-action" href={`tel:${phoneForSms(mother.phone)}`} aria-label={`Call ${mother.name}`}><span aria-hidden="true">☎</span>Call</a>
        <a className="message-action" href={`sms:${phoneForSms(mother.phone)}`} aria-label={`Text ${mother.name}`}><span aria-hidden="true">✉</span>SMS</a>
        {whatsApp && <a className="message-action" href={whatsApp} target="_blank" rel="noopener noreferrer" aria-label={`Message ${mother.name} on WhatsApp`}><span aria-hidden="true">◉</span>WhatsApp</a>}
      </div>
    </article>
    </LocalizedMarkup>
  );
}

function phoneForSms(phone) {
  const value = String(phone || "").trim();
  const digits = value.replace(/\D/g, "");
  return value.startsWith("+") ? `+${digits}` : digits;
}

function whatsAppUrl(phone, message = "") {
  const value = String(phone || "").trim();
  const digits = value.replace(/\D/g, "");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  if (value.startsWith("+")) return digits ? `https://wa.me/${digits}${text}` : "";
  if (digits.startsWith("0")) return `https://wa.me/250${digits.slice(1)}${text}`;
  return "";
}

function DashboardSidebar({ session, activePage, missedCount, onLogout }) {
  const isNurse = session.user.role === "nurse";
  const isAdmin = session.user.role === "admin";
  const isAdminPage = window.location.pathname === "/admin";
  const isDashboard = activePage === "dashboard";
  const carePlansPath = isDashboard ? "#care-plans" : "/dashboard#care-plans";
  const appointmentsPath = isDashboard ? `#${isNurse ? "follow-ups" : "appointments"}` : `/dashboard#${isNurse ? "follow-ups" : "appointments"}`;
  return (
    <LocalizedMarkup>
    <aside className="dashboard-sidebar">
      <Link to={isAdmin ? "/admin" : "/dashboard"} className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">♡</span>
        <span>Maternal Health<small>Visit Reminder</small></span>
      </Link>
      <nav className="sidebar-nav" aria-label="Dashboard navigation">
        {isAdmin ? <>
          <Link className={`sidebar-link${activePage === "admin" ? " active" : ""}`} to="/admin"><span aria-hidden="true">⌂</span>Admin overview</Link>
          <a className="sidebar-link" href={isAdminPage ? "#admin-users" : "/admin"}><span aria-hidden="true">♙</span>User accounts</a>
          <a className="sidebar-link" href={isAdminPage ? "#admin-mothers" : "/admin"}><span aria-hidden="true">♡</span>Mothers</a>
          <a className="sidebar-link" href={isAdminPage ? "#admin-reports" : "/admin"}><span aria-hidden="true">▦</span>Reports</a>
          <a className="sidebar-link" href={isAdminPage ? "#admin-settings" : "/admin"}><span aria-hidden="true">⚙</span>System settings</a>
        </> : <>
          <Link className={`sidebar-link${activePage === "dashboard" ? " active" : ""}`} to="/dashboard"><span aria-hidden="true">⌂</span>Dashboard</Link>
          {isDashboard
            ? <a className="sidebar-link sidebar-link-care-plans" href={carePlansPath}><span aria-hidden="true">▤</span>{isNurse ? "Mother care plans" : "My care plan"}</a>
            : <Link className="sidebar-link sidebar-link-care-plans" to={carePlansPath}><span aria-hidden="true">▤</span>{isNurse ? "Mother care plans" : "My care plan"}</Link>}
          {isDashboard
            ? <a className="sidebar-link sidebar-link-appointments" href={appointmentsPath}><span aria-hidden="true">▦</span>Appointments{isNurse && missedCount > 0 && <span className="sidebar-badge">{missedCount}</span>}</a>
            : <Link className="sidebar-link sidebar-link-appointments" to={appointmentsPath}><span aria-hidden="true">▦</span>Appointments{isNurse && missedCount > 0 && <span className="sidebar-badge">{missedCount}</span>}</Link>}
          <Link className={`sidebar-link${activePage === "health-records" ? " active" : ""}`} to="/health-records"><span aria-hidden="true">▣</span>Health Records</Link>
          <Link className={`sidebar-link${activePage === "messages" ? " active" : ""}`} to="/messages"><span aria-hidden="true">✉</span>Messages</Link>
          <Link className={`sidebar-link${activePage === "settings" ? " active" : ""}`} to="/settings"><span aria-hidden="true">⚙</span>Settings</Link>
        </>}
        <button className="sidebar-link sidebar-menu-logout" type="button" onClick={onLogout}><span aria-hidden="true">⇥</span>Log out</button>
      </nav>
      <div className="sidebar-bottom">
        <span className="sidebar-mother-art" aria-hidden="true">♡</span>
        <p>Healthy Mother.<br />Healthy Baby.<br />A Healthier World.</p>
      </div>
    </aside>
    </LocalizedMarkup>
  );
}

function ContactStrip() {
  const { t } = useLanguage();
  return (
    <LocalizedMarkup>
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
            <a href={whatsAppUrl(SUPPORT_PHONE, t(SUPPORT_WHATSAPP_MESSAGE))} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L4 20l1.2-3.9a8.2 8.2 0 1 1 15-4.4z" /><path d="M8.8 8.2c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.2.1.4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1 1.3 1.7 1.7.2.1.4.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .3-.2 1.2-.8 1.6-.5.4-1.1.5-1.8.3-1.1-.3-2.5-1.1-3.7-2.2-1.2-1.2-2-2.6-2.3-3.7-.2-.6-.1-1.2.3-1.7.2-.3.6-.6.9-.7z" /></svg>
              <span>WhatsApp support</span>
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
    </LocalizedMarkup>
  );
}

function VisitReminder({ state }) {
  const { t } = useLanguage();
  if (state.loading || (!state.error && !state.visit)) return null;
  if (state.error) return <LocalizedMarkup><div className="error-banner visit-reminder-error" role="alert">{t("Your visit reminder could not be loaded: {error}", { error: t(state.error) })}</div></LocalizedMarkup>;
  return (
    <LocalizedMarkup>
    <div className="visit-reminder" role="status" aria-live="polite">
      <span className="visit-reminder-icon" aria-hidden="true">!</span>
      <div><strong>Your visit is tomorrow</strong><p>Visit {state.visit.visitNo} is scheduled for {formatDate(state.visit.visitDate)}. Please plan to see your care provider.</p></div>
      <Link to={`/mothers/${state.visit.motherId}`} className="visit-reminder-link">View care plan <span aria-hidden="true">→</span></Link>
    </div>
    </LocalizedMarkup>
  );
}

function SummaryCard({ label, value, caption, icon, tone = "", id, to }) {
  const contents = <><div className="summary-top"><span>{label}</span><span className={`summary-icon ${tone}`} aria-hidden="true">{icon}</span></div><strong>{value}</strong><small>{caption}</small></>;
  return to
    ? <Link className="summary-card summary-card-link" id={id} to={to} aria-label={`${label}: ${value}. ${caption}`}>{contents}</Link>
    : <div className="summary-card" id={id}>{contents}</div>;
}

function MotherCard({ mother, token, onRemove, removing = false, removalDisabled = false }) {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/mothers/${mother._id}`, { token: token || readSession()?.token })
      .then((detail) => { if (active) setVisits(detail.visits); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [mother._id, token]);
  const completed = visits?.filter((visit) => visit.completedAt).length || 0;
  return (
    <LocalizedMarkup>
    <article className="mother-card">
      <Link to={`/mothers/${mother._id}`} className="mother-card-link" aria-label={`Open ${mother.name}'s care plan`}>
        <div className="mother-card-main">
          <div className="avatar">{mother.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
          <div className="mother-card-info"><h3 translate="no">{mother.name}</h3><span className="due-label">EXPECTED DUE DATE</span><p className="due-date">{formatDate(mother.dueDate)}</p></div>
          <span className="card-arrow" aria-hidden="true">↗</span>
        </div>
        <div className="mother-card-bottom">
          {error ? <span className="muted small">Progress unavailable</span> : visits ? <><div className="progress-track"><span style={{ width: `${completed / 5 * 100}%` }} /></div><span>{`${completed}/5 visits`}</span></> : <span className="muted small">Loading progress…</span>}
        </div>
      </Link>
      {onRemove && <button className="button button-outline button-small mother-remove-button" type="button" disabled={removalDisabled} onClick={() => onRemove(mother)} aria-label={`Remove ${mother.name} and her care plan`}>
        {removing ? "Removing..." : "Remove mother"}
      </button>}
    </article>
    </LocalizedMarkup>
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
  return (
    <LocalizedMarkup>
      <main className="form-page">
        <div className="form-page-actions"><Link to="/" className="back-link">← Back to care plans</Link></div>
        <section className="form-panel"><span className="eyebrow">NEW CARE PLAN</span><h1>Add a mother</h1><p>We’ll create a personalized schedule of five visits based on her due date.</p><form onSubmit={submit} className="form-stack"><Field label="Full name" value={values.name} onChange={(name) => setValues({ ...values, name })} required /><Field label="Phone number" type="tel" value={values.phone} onChange={(phone) => setValues({ ...values, phone })} required /><Field label="Expected due date" type="date" value={values.dueDate} onChange={(dueDate) => setValues({ ...values, dueDate })} required />{error && <ErrorBanner>{error}</ErrorBanner>}<button className="button button-primary" disabled={busy}>{busy ? "Creating..." : "Create care plan"} <span>→</span></button></form></section>
      </main>
    </LocalizedMarkup>
  );
}

function MotherDetail({ session, visitReminder, onLogout, onLanguageChange }) {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, error: "", mother: null });
  const [actionError, setActionError] = useState("");
  const [busyVisit, setBusyVisit] = useState(null);
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
  const saveVisitNote = async (visitId, notes) => {
    const updatedVisit = await api(`/visits/${visitId}`, {
      token: session.token,
      method: "PATCH",
      body: JSON.stringify({ notes })
    });
    setState((current) => current.mother ? {
      ...current,
      mother: {
        ...current.mother,
        visits: current.mother.visits.map((visit) => visit._id === visitId ? updatedVisit : visit)
      }
    } : current);
  };

  const mother = state.mother;
  const visits = mother?.visits || [];
  const completed = visits.filter((visit) => visit.completedAt).length;
  const next = visits.find((visit) => !visit.completedAt);
  const greetingName = session.user.role === "nurse" ? mother?.name : session.user.name;
  return (
    <LocalizedMarkup>
    <div className={`dashboard-layout dashboard-role-${session.user.role}`}>
      <DashboardSidebar session={session} activePage="dashboard" missedCount={0} onLogout={onLogout} />
      <div className="dashboard-main">
        <Header session={session} onLogout={onLogout} visitReminder={visitReminder} dashboard onLanguageChange={onLanguageChange} />
        <div className="dashboard-workspace">
          <main className="page-wrap dashboard-page detail-page dashboard-care-plan">
            {state.loading ? <LoadingState text="Loading care plan..." /> : state.error || !mother ? (
              <ErrorState message={state.error || "Mother not found."} retry={load} />
            ) : <>
              <Link to="/dashboard#care-plans" className="back-link">← All care plans</Link>
              <div className="page-heading dashboard-heading care-plan-heading">
                <div><h1>{greeting}, <span translate="no">{greetingName.split(" ")[0]}</span>.</h1><p>Here’s your maternal care plan and visit schedule.</p></div>
              </div>
              <section className="profile-hero">
                <div className="profile-identity">
                  <div className="avatar avatar-large">{mother.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                  <div><span className="eyebrow">MATERNAL CARE PLAN</span><h2 translate="no">{mother.name}</h2><a href={`tel:${phoneForSms(mother.phone)}`} className="care-plan-phone"><span aria-hidden="true">☎</span>{mother.phone}</a></div>
                </div>
                <div className="due-panel"><span>EXPECTED DUE DATE</span><strong>{formatDate(mother.dueDate)}</strong><small>Care plan personalized for you</small></div>
              </section>
              <section className="progress-panel">
                <div className="progress-ring-wrap"><ProgressRing completed={completed} /><div className="ring-caption"><strong>{`${completed} of 5`}</strong><span>visits complete</span></div></div>
                <div className="progress-copy"><span className="eyebrow">YOUR JOURNEY</span><h2>{completed === 5 ? "All visits complete — wonderful work." : next ? `Visit ${next.visitNo} is your next step.` : "Your care plan is ready."}</h2><p>{completed === 5 ? "Your planned prenatal visits are all logged." : next ? `Your next appointment is planned for ${formatDate(next.visitDate)}.` : "Your planned check-ins will appear below."}</p><div className="journey-track"><span style={{ width: `${completed / 5 * 100}%` }} /></div><span className="journey-caption">{`${5 - completed} visits remaining`}</span></div>
                <span className="journey-heart" aria-hidden="true">♡</span>
              </section>
              <div className="section-heading visit-heading dashboard-section-heading">
                <div className="dashboard-section-title"><span className="dashboard-section-icon" aria-hidden="true">☑</span><div><h2>Visit Checklist</h2><p>Your schedule is calculated from your expected due date.</p></div></div>
                <span className="results-count">{visits.length} PLANNED VISITS</span>
              </div>
              {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
              <section className="visit-list">
                {visits.map((visit) => <VisitRow key={visit._id} visit={visit} canLog={session.user.role === "nurse"} loading={busyVisit === visit.visitNo} onLog={() => logVisit(visit.visitNo)} onSaveNote={(notes) => saveVisitNote(visit._id, notes)} />)}
              </section>
            </>}
          </main>
          <ContactStrip />
        </div>
      </div>
    </div>
    </LocalizedMarkup>
  );
}

function ProgressRing({ completed }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - completed / 5);
  const { t } = useLanguage();
  return <LocalizedMarkup><svg className="progress-ring" viewBox="0 0 110 110" aria-label={t("{completed} of 5 visits complete", { completed })}><circle className="ring-track" cx="55" cy="55" r={radius} /><circle className="ring-value" cx="55" cy="55" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 55 55)" /></svg></LocalizedMarkup>;
}

function VisitRow({ visit, canLog, loading, onLog, onSaveNote }) {
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(visit.notes || "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const status = visit.completedAt ? "complete" : visit.missed ? "missed" : "upcoming";
  const saveNote = async () => {
    setSavingNote(true);
    setNoteError("");
    try {
      await onSaveNote(draftNote);
      setEditingNote(false);
    } catch (error) {
      setNoteError(error.message);
    } finally {
      setSavingNote(false);
    }
  };
  return (
    <LocalizedMarkup>
    <article className={`visit-history-item ${status}`}>
      <div className="visit-row">
        <div className={`visit-check ${visit.completedAt ? "checked" : ""}`}>{visit.completedAt ? "✓" : String(visit.visitNo).padStart(2, "0")}</div>
        <div className="visit-info"><strong>{`Visit ${visit.visitNo}`}</strong><span>{visit.completedAt ? `Logged ${formatDate(visit.completedAt)}` : `Scheduled ${formatDate(visit.visitDate)}`}</span></div>
        <span className={`status-pill status-${status}`}>{status === "complete" ? "Completed" : status === "missed" ? "Missed" : "Upcoming"}</span>
        {canLog && !visit.completedAt && <button className="button button-outline button-small" disabled={loading} onClick={onLog}>{loading ? "Saving..." : "Log visit"}</button>}
        {canLog && visit.completedAt && <button className="button button-outline button-small note-toggle" type="button" onClick={() => { setDraftNote(visit.notes || ""); setEditingNote((editing) => !editing); setNoteError(""); }}>{editingNote ? "Cancel note" : visit.notes ? "Edit note" : "Add note"}</button>}
      </div>
      {visit.notes && !editingNote && <div className="visit-clinical-note"><strong>Clinical note</strong><p translate="no">{visit.notes}</p></div>}
      {canLog && visit.completedAt && editingNote && <div className="visit-note-editor">
        <label><span>Clinical note</span><textarea rows="3" maxLength="2000" value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder="Add notes from this visit..." /></label>
        {noteError && <ErrorBanner>{noteError}</ErrorBanner>}
        <button className="button button-primary button-small" type="button" disabled={savingNote} onClick={saveNote}>{savingNote ? "Saving..." : "Save note"}</button>
      </div>}
    </article>
    </LocalizedMarkup>
  );
}

function Field({ label, value, onChange, ...inputProps }) {
  const inputId = useId();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = inputProps.type === "password";
  const type = isPassword && passwordVisible ? "text" : inputProps.type;
  return (
    <LocalizedMarkup>
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
    </LocalizedMarkup>
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
function LoadingState({ text }) { return <LocalizedMarkup><div className="state-card"><span className="spinner" /><p>{text}</p></div></LocalizedMarkup>; }
function ErrorState({ message, retry }) { return <LocalizedMarkup><div className="state-card state-error"><span className="state-symbol">!</span><h3>Something went wrong</h3><p>{message}</p><button className="button button-outline" onClick={retry}>Try again</button></div></LocalizedMarkup>; }
function EmptyState({ title, body }) { return <LocalizedMarkup><div className="state-card"><span className="empty-symbol">✳</span><h3>{title}</h3><p>{body}</p></div></LocalizedMarkup>; }
function startOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function formatDate(value) {
  const locale = { en: "en", rw: "rw-RW", fr: "fr-FR" }[readStoredLanguage()];
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
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
