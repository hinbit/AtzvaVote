import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import { useTheme } from '../context/ThemeContext';
import LanguageSelector from '../components/LanguageSelector';

export default function Login() {
  const { user, login, register, guestStart } = useAuth();
  const { t, language } = useTranslation();
  const { theme, assets } = useTheme();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedDocs, setAcceptedDocs] = useState(false);
  const [acceptedRanking, setAcceptedRanking] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const loginTheme = theme?.login || {};
  const loginVariant = loginTheme.variant || theme?.name || 'default';
  const themeText = (field, fallback) => {
    const value = loginTheme[field];
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    return value[language] || value.he || value.en || fallback;
  };

  if (user) return <Navigate to="/" replace />;

  const playAsGuest = async () => {
    setErr(''); setGuestBusy(true);
    try {
      await guestStart(language);
      nav('/rate');
    } catch (er) {
      setErr(errMsg(er, t('login.error_default')));
    } finally {
      setGuestBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!acceptedDocs || !acceptedRanking) {
          setErr(t('login.error_accept_terms'));
          return;
        }
        await register(name, email, password, language);
      }
      nav('/');
    } catch (er) {
      setErr(errMsg(er, t('login.error_default')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`login-page login-variant-${loginVariant}`} data-login-theme={theme?.name || 'loading'}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 3 }}>
        <LanguageSelector />
      </div>
      <div className="login-top-logo-wrap">
        <img className="login-top-logo" src={assets.logo || '/shiah-logo-white.png'} alt="logo" />
      </div>
      <div className="login-hero">
        <div className="login-theme-seal" aria-hidden="true">
          <span>{loginTheme.icon || '✓'}</span>
          <small>{themeText('seal', theme?.display_name?.[language] || theme?.name || 'AtzvaVote')}</small>
        </div>
        <div style={{position:'relative'}}>
          <div style={{fontFamily:'var(--font-display)', fontSize: 18, letterSpacing: '0.3em', color:'var(--gold)'}}>
            {themeText('kicker', t('login.hero_kicker'))}
          </div>
          <h1>
            {themeText('headline', t('common.app_name'))}
          </h1>
          <p className="tag">
            {themeText('tagline', t('login.hero_tagline'))}
          </p>
        </div>
        <div className="meta">
          <div><span>{t('login.stat_stages')}</span>6</div>
          <div><span>{t('login.stat_levels')}</span>5</div>
          <div><span>{t('login.stat_exact_points')}</span>5</div>
          <div><span>{t('login.stat_prizes')}</span>3</div>
        </div>
      </div>

      <div className="login-form-area">
        <div className="login-form">
          <button
            type="button"
            className="btn btn-gold guest-cta"
            onClick={playAsGuest}
            disabled={guestBusy}
            style={{ width: '100%', justifyContent: 'center', padding: '20px', fontSize: 22, fontWeight: 800 }}
          >
            {guestBusy ? <span className="spinner" /> : themeText('cta', 'בוא נשחק')}
          </button>
          <p className="sub" style={{ textAlign: 'center', marginTop: 10 }}>
            התחל לנחש מיד — הפרטים יתבקשו בסיום.
          </p>

          {!showAuthForm ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowAuthForm(true)}
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            >
              כבר רשום? התחברות / הרשמה
            </button>
          ) : (
          <>
          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--line)' }} />
          <h2>{mode === 'login' ? t('login.mode_login') : t('login.mode_register')}</h2>
          <p className="sub">{mode === 'login' ? t('login.sub_login') : t('login.sub_register')}</p>

          <div className="login-toggle">
            <button type="button" className={mode==='login' ? 'active':''} onClick={() => setMode('login')}>{t('login.toggle_login')}</button>
            <button type="button" className={mode==='register' ? 'active':''} onClick={() => setMode('register')}>{t('login.toggle_register')}</button>
          </div>

          {err && <div className="alert alert-error">{err}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="field">
                <label>{t('login.full_name')}</label>
                <input value={name} onChange={e => setName(e.target.value)} required minLength={2} autoComplete="name" />
              </div>
            )}
            <div className="field">
              <label>{t('login.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="field">
              <label>{t('login.password')}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode==='login' ? 'current-password' : 'new-password'} />
            </div>
            {mode === 'register' && (
              <div className="consent-box">
                <label>
                  <input type="checkbox" checked={acceptedDocs} onChange={e => setAcceptedDocs(e.target.checked)} />
                  {t('login.consent_rules')}
                </label>
                <label>
                  <input type="checkbox" checked={acceptedRanking} onChange={e => setAcceptedRanking(e.target.checked)} />
                  {t('login.consent_ranking')}
                </label>
              </div>
            )}
            <button className="btn btn-gold" style={{width:'100%', justifyContent:'center', padding:'14px'}} disabled={busy}>
              {busy ? <span className="spinner" /> : (mode === 'login' ? t('login.submit_login') : t('login.submit_register'))}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
