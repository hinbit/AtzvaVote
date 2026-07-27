import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import BatchCard from '../components/BatchCard';
import LeafRating from '../components/LeafRating';
import BatchReviewRecorder from '../components/BatchReviewRecorder';
import BatchReviews from '../components/BatchReviews';
import { useTranslation } from '../i18n/TranslationContext';
import { useAuth } from '../context/AuthContext';
import { BATCH_STAGES, stageDisplay } from '../lib/stages';

// עמוד הדירוג — הלב של המשחק: כל עובד מדרג את האצוות הפעילות בתחנה שלו (1-5),
// ניחוש של רמת האיכות הסופית. אצוות שהסתיימו מוצגות עם הניחוש מול התוצאה והנקודות.
export default function Rate() {
  const { t, locale, language } = useTranslation();
  const { user, guestCheckEmail, guestFinalize } = useAuth();
  const nav = useNavigate();
  const isGuest = !!user?.isGuest;

  // הרשמת אורח בסיום: אימייל → טלפון → קדימה
  const [regOpen, setRegOpen] = useState(false);
  const [regStep, setRegStep] = useState('email');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmailExists, setRegEmailExists] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regErr, setRegErr] = useState('');
  const [autoPrompted, setAutoPrompted] = useState(false);

  const [batches, setBatches] = useState([]);
  const [ratings, setRatings] = useState({}); // batchId -> { rating, stage, points, saved }
  const [stageChoice, setStageChoice] = useState({}); // batchId -> תחנה שנבחרה ידנית
  const [lastStage, setLastStage] = useState(''); // הבחירה הקודמת — ברירת מחדל לאצווה הבאה
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [myReviewByBatch, setMyReviewByBatch] = useState({}); // batchId -> הריביו שלי
  const [reviewBump, setReviewBump] = useState({}); // batchId -> מונה, מרענן ריביוים אחרי פרסום

  const loadRatings = () =>
    api.get('/ratings/my').then((r) => {
      const map = {};
      let last = '';
      for (const row of (r.data || [])) {
        map[row.batch_id] = { rating: row.rating, stage: row.stage, points: row.points, saved: true };
        if (row.stage) last = row.stage;
      }
      setRatings(map);
      if (last) setLastStage((prev) => prev || last);
      return map;
    });

  useEffect(() => {
    api.get('/batches').then((r) => setBatches(r.data || [])).catch(() => {});
    loadRatings().catch(() => {});
    refreshMyReviews();
  }, []);

  const refreshMyReviews = () => {
    if (isGuest) return;
    api.get(`/reviews/mine?lang=${locale}`).then((r) => {
      const map = {};
      (r.data || []).forEach((rev) => { map[rev.batch_id] = rev; });
      setMyReviewByBatch(map);
    }).catch(() => {});
  };

  // התחנה הממופה שלי — לפי הדירוגים הקודמים (השרת ממפה מחלקה → תחנה בעת השמירה)
  const myStage = useMemo(() => {
    const counts = {};
    for (const r of Object.values(ratings)) {
      if (r.stage) counts[r.stage] = (counts[r.stage] || 0) + 1;
    }
    let best = '';
    for (const [stage, n] of Object.entries(counts)) {
      if (!best || n > counts[best]) best = stage;
    }
    return best || '';
  }, [ratings]);

  // יש תחנה קבועה? מחלקה בפרופיל (השרת ממפה) או תחנה מדירוגים קודמים
  const hasStation = !!user?.department || !!myStage;

  const active = useMemo(
    () => batches.filter((b) => b.status === 'active' && Number(b.rating_open)),
    [batches]
  );
  const finished = useMemo(
    () => batches.filter((b) => b.status === 'finished'),
    [batches]
  );

  const stageFor = (batchId) =>
    stageChoice[batchId] || ratings[batchId]?.stage || lastStage || 'growing';

  const rate = async (batch, value) => {
    const sendStage = !hasStation ? stageFor(batch.id) : undefined;
    // עדכון אופטימי + חיווי שמירה כמו בקלט הניקוד המקורי
    setRatings((prev) => ({
      ...prev,
      [batch.id]: {
        ...prev[batch.id],
        rating: value,
        stage: sendStage || prev[batch.id]?.stage,
        saved: false
      }
    }));
    setSavingId(batch.id);
    setMsg('');
    try {
      await api.post(`/ratings/batch/${batch.id}`, sendStage ? { rating: value, stage: sendStage } : { rating: value });
      setRatings((prev) => ({ ...prev, [batch.id]: { ...prev[batch.id], saved: true } }));
      if (sendStage) setLastStage(sendStage);
      setMsg(`✓ ${t('rate.saved')}`);
      setTimeout(() => setMsg(''), 2000);
      // כשהשרת קבע את התחנה (מיפוי מחלקה) — רענון כדי ללמוד אותה
      if (!sendStage && !myStage) loadRatings().catch(() => {});
    } catch (e) {
      setMsg(errMsg(e));
      loadRatings().catch(() => {});
    } finally {
      setSavingId(null);
    }
  };

  // ─── הרשמת אורח בסיום ───
  const filledCount = Object.values(ratings).filter((r) => Number(r.rating) >= 1).length;
  const openReg = () => { setRegErr(''); setRegStep('email'); setRegOpen(true); };

  const regContinueEmail = async () => {
    const email = regEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setRegErr('יש להזין כתובת אימייל תקינה'); return; }
    setRegBusy(true); setRegErr('');
    try {
      const exists = await guestCheckEmail(email);
      setRegEmailExists(exists);
      setRegStep('phone');
    } catch (e) { setRegErr(errMsg(e)); }
    finally { setRegBusy(false); }
  };

  const regSubmit = async () => {
    if (regPhone.replace(/\D/g, '').length < 6) { setRegErr('יש להזין מספר טלפון תקין'); return; }
    setRegBusy(true); setRegErr('');
    try {
      await guestFinalize(regEmail.trim().toLowerCase(), regPhone.trim());
      setRegOpen(false);
      nav('/');
    } catch (e) {
      setRegErr(errMsg(e));
    } finally { setRegBusy(false); }
  };

  // אורח: פתיחה אוטומטית של ההרשמה לאחר 3 דירוגים
  useEffect(() => {
    if (isGuest && !autoPrompted && !regOpen && filledCount >= 3) {
      setAutoPrompted(true);
      openReg();
    }
  }, [isGuest, autoPrompted, regOpen, filledCount]);

  const ratedActive = active.filter((b) => ratings[b.id]?.rating >= 1).length;

  return (
    <main className="page">
      <h1 className="page-title">{t('rate.title')}</h1>
      <p className="page-subtitle">{t('rate.subtitle', { completed: ratedActive, total: active.length })}</p>

      {msg && <div className={`alert ${msg.startsWith('✓') ? 'alert-success' : 'alert-error'}`} style={{ position: 'sticky', top: 80, zIndex: 10 }}>{msg}</div>}

      {isGuest && (
        <div className="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--paper-pure)', border: '1px solid var(--gold)' }}>
          <span>אתה משחק כאורח — דרג אצוות ולחץ "סיום והרשמה" כדי לשמור אותן ולהצטרף.</span>
          <button type="button" className="btn btn-gold" onClick={openReg}>סיום והרשמה</button>
        </div>
      )}

      {(user?.department || myStage) && (
        <div className="station-banner">
          <span className="station-banner-emoji" aria-hidden="true">📍</span>
          <span>
            <strong>{t('rate.my_station')}</strong>
            {user?.department ? <span> · {user.department}</span> : null}
            {myStage ? <span> · {stageDisplay(t, myStage, language)}</span> : null}
          </span>
        </div>
      )}

      {active.length === 0 && (
        <p style={{ color: 'var(--muted)' }}>{t('rate.no_active')}</p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {active.map((b) => {
          const r = ratings[b.id] || {};
          return (
            <div key={b.id} className="prediction-block">
              <BatchCard batch={{ ...b, my_rating: r.rating ?? b.my_rating }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {!isGuest && user?.publishPrediction === true && (
                    <BatchReviewRecorder
                      batchId={b.id}
                      disabled={false}
                      myReview={myReviewByBatch[b.id]}
                      myLevel={r.rating ?? null}
                      onPublished={() => { setReviewBump((m) => ({ ...m, [b.id]: (m[b.id] || 0) + 1 })); refreshMyReviews(); }}
                    />
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{t('rate.your_rating')}</span>
                    <LeafRating
                      size="lg"
                      value={r.rating || 0}
                      onChange={(n) => rate(b, n)}
                      disabled={savingId === b.id}
                      label={t('rate.rating_label')}
                    />
                    {savingId === b.id && <span className="spinner" />}
                    {savingId !== b.id && r.saved && r.rating >= 1 && (
                      <span style={{ color: 'var(--pitch)', fontSize: 13 }}>{t('rate.saved_mark')}</span>
                    )}
                  </div>

                  {!hasStation && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
                      {t('rate.choose_stage')}
                      <select
                        className="field"
                        style={{ padding: '6px 10px' }}
                        value={stageFor(b.id)}
                        onChange={(e) => setStageChoice((prev) => ({ ...prev, [b.id]: e.target.value }))}
                      >
                        {BATCH_STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.emoji} {stageDisplay(t, s.key, language)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </BatchCard>
              {!isGuest && <BatchReviews batchId={b.id} bump={reviewBump[b.id] || 0} />}
            </div>
          );
        })}
      </div>

      {finished.length > 0 && (
        <>
          <div className="section-divider" style={{ marginTop: 32 }}>
            <h2>{t('rate.finished_title')}</h2>
            <span className="badge">RESULTS</span>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {finished.map((b) => {
              const r = ratings[b.id] || {};
              const rated = Number(r.rating) >= 1;
              const resolved = b.outcome_level != null;
              const points = Number(r.points || 0);
              return (
                <BatchCard key={b.id} batch={{ ...b, my_rating: r.rating ?? b.my_rating }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    {rated ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                        <span style={{ fontWeight: 700 }}>{t('rate.my_guess')}</span>
                        <LeafRating value={r.rating} readOnly size="sm" label={t('rate.my_guess')} />
                        <span dir="ltr" style={{ color: 'var(--muted)' }}>{Number(r.rating)}/5</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 14 }}>{t('rate.no_rating')}</span>
                    )}
                    {rated && resolved && (
                      <span className={`points-pill ${points >= 5 ? 'exact' : points >= 2 ? 'high' : 'zero'}`}>
                        {points} {t('common.points')}
                      </span>
                    )}
                  </div>
                  {!isGuest && <BatchReviews batchId={b.id} bump={reviewBump[b.id] || 0} />}
                </BatchCard>
              );
            })}
          </div>
        </>
      )}

      {regOpen && (
        <div className="doc-modal-backdrop" onClick={() => !regBusy && setRegOpen(false)}>
          <div className="doc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="doc-modal-head">
              <h3>{regStep === 'email' ? 'כמעט סיימת! מה האימייל שלך?' : 'מה מספר הטלפון שלך?'}</h3>
              {!regBusy && <button type="button" className="btn btn-sm btn-outline" onClick={() => setRegOpen(false)}>{t('common.close')}</button>}
            </div>
            {regErr && <div className="alert alert-error">{regErr}</div>}
            {regStep === 'email' ? (
              <>
                <div className="field">
                  <label>אימייל</label>
                  <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} autoComplete="email" placeholder="example@email.com" />
                </div>
                <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }} onClick={regContinueEmail} disabled={regBusy}>
                  {regBusy ? <span className="spinner" /> : 'המשך'}
                </button>
              </>
            ) : (
              <>
                {regEmailExists && (
                  <div className="alert" style={{ background: 'var(--paper-pure)', border: '1px solid var(--gold)' }}>
                    האימייל כבר רשום — הזן את הטלפון שלך לאימות, ונמשיך לחשבון הקיים.
                  </div>
                )}
                <div className="field">
                  <label>טלפון</label>
                  <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} autoComplete="tel" placeholder="050-0000000" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-outline" onClick={() => setRegStep('email')} disabled={regBusy}>חזרה</button>
                  <button className="btn btn-gold" style={{ flex: 1, justifyContent: 'center' }} onClick={regSubmit} disabled={regBusy}>
                    {regBusy ? <span className="spinner" /> : 'קדימה'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
