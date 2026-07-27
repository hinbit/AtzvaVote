import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import { criterionLabel } from '../lib/stages';
import { ilDateTime, ilMs } from '../utils/time';

function SubjectImage({ src, label }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return <div className="battle-side-img battle-side-fallback" aria-hidden="true">🌿</div>;
  }
  return (
    <img
      className="battle-side-img"
      src={src}
      alt={label || ''}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function timeLeftParts(closesAt, now) {
  const ms = ilMs(closesAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60
  };
}

export default function Battles() {
  const { t, locale, language } = useTranslation();
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votingKey, setVotingKey] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchBattles = (withSpinner = true) => {
    if (withSpinner) setLoading(true);
    return api.get('/battles')
      .then((r) => {
        setBattles(Array.isArray(r.data) ? r.data : []);
        setError('');
      })
      .catch((err) => setError(errMsg(err, t('battles.load_error'))))
      .finally(() => { if (withSpinner) setLoading(false); });
  };

  useEffect(() => { fetchBattles(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const vote = async (battleId, criterion, pick) => {
    const key = `${battleId}:${criterion}`;
    setVotingKey(key);
    try {
      await api.post(`/battles/${battleId}/vote`, { criterion, pick });
      await fetchBattles(false);
      setError('');
    } catch (err) {
      setError(errMsg(err, t('battles.vote_error')));
    } finally {
      setVotingKey(null);
    }
  };

  const renderCountdown = (battle) => {
    const left = timeLeftParts(battle.closes_at, now);
    if (!left) return null;
    let label;
    if (left.days > 0) label = t('battles.time_left_days', { days: left.days, hours: left.hours });
    else if (left.hours > 0) label = t('battles.time_left_hours', { hours: left.hours, minutes: left.minutes });
    else label = t('battles.time_left_minutes', { minutes: Math.max(left.minutes, 1) });
    return <span className="battle-countdown">⏳ {label}</span>;
  };

  const renderBattle = (battle) => {
    const closed = battle.status === 'closed';
    const criteria = battle.criteria || [];
    const overall = battle.overall_score || { a: 0, b: 0 };
    const winnerLabel = battle.winner === 'a'
      ? battle.subject_a_label
      : battle.winner === 'b' ? battle.subject_b_label : null;

    return (
      <article key={battle.id} className={`card battle-card ${closed ? 'battle-closed' : ''}`}>
        {closed && (
          <div className="battle-winner-ribbon">
            {battle.winner === 'tie'
              ? `🤝 ${t('battles.tie')}`
              : `🏆 ${t('battles.winner', { name: winnerLabel || '' })}`}
          </div>
        )}

        {battle.title && <h3 className="battle-title">{battle.title}</h3>}

        <div className="battle-heads">
          <div className={`battle-side ${closed && battle.winner === 'a' ? 'battle-side-won' : ''}`}>
            <SubjectImage src={battle.subject_a_image} label={battle.subject_a_label} />
            <div className="battle-side-label">{battle.subject_a_label}</div>
            <div className="battle-side-score">{overall.a}</div>
          </div>
          <div className="battle-vs">{t('battles.vs')}</div>
          <div className={`battle-side ${closed && battle.winner === 'b' ? 'battle-side-won' : ''}`}>
            <SubjectImage src={battle.subject_b_image} label={battle.subject_b_label} />
            <div className="battle-side-label">{battle.subject_b_label}</div>
            <div className="battle-side-score">{overall.b}</div>
          </div>
        </div>

        <div className="battle-overall">
          {t('battles.overall', { a: overall.a, b: overall.b })}
          {battle.total_voters != null && (
            <span className="battle-voters"> · {t('battles.voters', { count: battle.total_voters })}</span>
          )}
        </div>

        <div className="battle-crit-rows">
          {criteria.map((critKey) => {
            const tally = battle.tallies?.[critKey] || { a: 0, b: 0 };
            const total = (tally.a || 0) + (tally.b || 0);
            const pctA = total > 0 ? Math.round((tally.a / total) * 100) : 50;
            const pctB = total > 0 ? 100 - pctA : 50;
            const myPick = battle.my_votes?.[critKey];
            const rowKey = `${battle.id}:${critKey}`;
            const busy = votingKey === rowKey;
            return (
              <div key={critKey} className="battle-crit-row">
                <div className="battle-crit-head">
                  <span className="battle-crit-label">{criterionLabel(critKey, language)}</span>
                  <div className="battle-pick-btns">
                    <button
                      type="button"
                      className={`btn btn-sm battle-pick-btn pick-a ${myPick === 'a' ? 'picked' : 'btn-outline'}`}
                      disabled={closed || busy}
                      onClick={() => vote(battle.id, critKey, 'a')}
                    >
                      {battle.subject_a_label}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm battle-pick-btn pick-b ${myPick === 'b' ? 'picked' : 'btn-outline'}`}
                      disabled={closed || busy}
                      onClick={() => vote(battle.id, critKey, 'b')}
                    >
                      {battle.subject_b_label}
                    </button>
                  </div>
                </div>
                <div className="battle-tally-bar" title={`${pctA}% / ${pctB}%`}>
                  <span className="battle-tally-a" style={{ width: `${pctA}%` }} />
                  <span className="battle-tally-b" style={{ width: `${pctB}%` }} />
                </div>
                <div className="battle-tally-pcts">
                  <span>{pctA}%</span>
                  <span>{pctB}%</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="battle-foot">
          {!closed && renderCountdown(battle)}
          {battle.closes_at && (
            <span className="battle-closes-at">
              {closed ? t('battles.closed_at') : t('battles.closes_at')}{' '}
              {ilDateTime(battle.closes_at, locale, {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </span>
          )}
        </div>
      </article>
    );
  };

  const openBattles = battles.filter((b) => b.status === 'open');
  const closedBattles = battles.filter((b) => b.status === 'closed');

  return (
    <main className="page">
      <h1 className="page-title">{t('battles.title')}</h1>
      <p className="page-subtitle">{t('battles.subtitle')}</p>

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <div className="battle-empty">{t('common.loading')}</div>
      ) : battles.length === 0 ? (
        <div className="battle-empty">{t('battles.empty')}</div>
      ) : (
        <>
          {openBattles.length > 0 && (
            <section className="battle-list">
              {openBattles.map(renderBattle)}
            </section>
          )}

          {closedBattles.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <div className="section-divider">
                <h2>{t('battles.closed_title')}</h2>
                <span className="badge">{t('battles.closed_badge')}</span>
              </div>
              <div className="battle-list">
                {closedBattles.map(renderBattle)}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
