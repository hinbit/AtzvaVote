import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import BatchCard from '../components/BatchCard';
import LeafRating from '../components/LeafRating';
import CoinIcon from '../components/CoinIcon';
import BetHistory from '../components/BetHistory';
import { useTranslation } from '../i18n/TranslationContext';

// עמוד הבית — לוח מחוונים אישי: ברכה, אריחי סטטיסטיקה, האצוות הפעילות עם סטטוס
// הדירוג שלי, אצוות שהסתיימו לאחרונה (ניחוש מול תוצאה) וטבלאות הטופ-5.
export default function Home() {
  const { user, coinsEnabled, coinsLeaderboardEnabled } = useAuth();
  const { t } = useTranslation();
  const [batches, setBatches] = useState([]);
  const [myRatings, setMyRatings] = useState([]);
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [coinStats, setCoinStats] = useState(null);
  const [coinBoard, setCoinBoard] = useState([]);

  useEffect(() => {
    api.get('/batches').then(r => setBatches(r.data || [])).catch(() => {});
    api.get('/ratings/my').then(r => setMyRatings(r.data || [])).catch(() => {});
    api.get('/ratings/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/leaderboard').then(r => setLeaderboard(r.data || [])).catch(() => {});
    if (!user.isGuest && coinsEnabled) {
      api.get('/coin-bets/stats').then(r => setCoinStats(r.data)).catch(() => {});
      api.get('/coin-bets/leaderboard').then(r => setCoinBoard((r.data || []).slice(0, 5))).catch(() => {});
    }
  }, [coinsEnabled]);

  const toggleChallengeOpen = async () => {
    if (!coinStats) return;
    const next = !coinStats.challenge_open;
    setCoinStats(s => ({ ...s, challenge_open: next }));
    try { await api.post('/coin-bets/challenge-visibility', { open: next }); }
    catch { setCoinStats(s => ({ ...s, challenge_open: !next })); }
  };

  // דירוג לפי אצווה — לחיווי "כבר דירגתי" ולהיסטוריית השינויים
  const ratingByBatch = useMemo(
    () => Object.fromEntries(myRatings.map(r => [r.batch_id, r])),
    [myRatings]
  );

  const active = useMemo(
    () => batches.filter(b => b.status === 'active'),
    [batches]
  );
  const recentlyFinished = useMemo(
    () => batches.filter(b => b.status === 'finished').slice(0, 4),
    [batches]
  );

  const hasMyRating = (b) => {
    const r = ratingByBatch[b.id];
    return Number(r?.rating ?? b.my_rating) >= 1;
  };
  const unratedOpen = active.filter(b => Number(b.rating_open) && !hasMyRating(b));
  const ratedActive = active.filter(hasMyRating).length;

  const topScoredUsers = leaderboard
    .filter((r) => Number(r.total_points || 0) > 3)
    .slice(0, 5);

  return (
    <main className="page">
      <div className="trophy-banner">
        <h2>{t('home.greeting', { name: user.name })}<span style={{color:'var(--gold)'}}> 🌿</span></h2>
        <p>{t('home.banner_copy')}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">{t('home.my_rank')}</div>
          <div className="value">{stats?.rank ? `#${stats.rank}` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('home.total_points')}</div>
          <div className="value" style={{color:'var(--crimson)'}}>{stats?.total_points ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('home.filled_ratings')}</div>
          <div className="value">{ratedActive} / {active.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('home.exact_hits')}</div>
          <div className="value" style={{color:'var(--gold-deep)'}}>{stats?.exact_hits ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('home.close_hits')}</div>
          <div className="value">{stats?.close_hits ?? 0}</div>
        </div>
        {coinStats && (
          <Link to="/coin-bets" className="stat-card" style={{ textDecoration: 'none' }}>
            <div className="label">{t('coin.balance')}</div>
            <div className="value" style={{color:'var(--gold)'}}><CoinIcon size={16} /> {coinStats.balance.toLocaleString()}</div>
            <div className="stat-sub" style={{ color: coinStats.last_day_net >= 0 ? 'var(--pitch)' : 'var(--crimson)' }}>
              {coinStats.last_day_net >= 0 ? '+' : ''}{coinStats.last_day_net.toLocaleString()} {t('coin.last_day')}
            </div>
          </Link>
        )}
      </div>

      {coinStats && (
        <div className="challenge-open-bar">
          <div>
            <strong>{t('coin.challenge_open_title')}</strong>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('coin.challenge_open_help')}</div>
          </div>
          <button
            type="button"
            className={`toggle-pill ${coinStats.challenge_open ? 'on' : ''}`}
            onClick={toggleChallengeOpen}
          >
            {coinStats.challenge_open ? t('coin.open_yes') : t('coin.open_no')}
          </button>
        </div>
      )}

      <div className="section-divider">
        <h2>{t('home.active_batches')}</h2>
        <span className="badge">OPEN</span>
      </div>

      {active.length === 0 ? (
        <p className="editorial" style={{color:'var(--muted)'}}>{t('home.no_active')}</p>
      ) : (
        <div style={{display: 'grid', gap: 12}}>
          {active.map(b => {
            const r = ratingByBatch[b.id];
            const rated = hasMyRating(b);
            const myLevel = Number(r?.rating ?? b.my_rating);
            const ratingOpen = Number(b.rating_open) === 1 || b.rating_open === true;
            return (
              <BatchCard key={b.id} batch={{ ...b, my_rating: r?.rating ?? b.my_rating }}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
                  {rated ? (
                    <span style={{color:'var(--pitch)', fontWeight:700, fontSize:14, display:'inline-flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                      <span>{t('home.my_guess_label')}</span>
                      <LeafRating value={myLevel} readOnly size="sm" label={t('home.my_guess_label')} />
                      <span dir="ltr" style={{ color: 'var(--muted)' }}>{myLevel}/5</span>
                      <BetHistory batchId={b.id} editCount={r?.edit_count || 0} />
                    </span>
                  ) : (
                    <span style={{color:'var(--muted)', fontWeight:600, fontSize:14}}>
                      {t('home.no_rating')}
                    </span>
                  )}

                  {ratingOpen ? (
                    <Link to="/rate" className="btn btn-gold btn-sm">
                      {rated ? t('home.edit_rating') : t('home.rate_now')}
                    </Link>
                  ) : (
                    <span style={{color:'var(--muted)', fontSize:13}}>{t('home.rating_closed')}</span>
                  )}
                </div>
              </BatchCard>
            );
          })}
        </div>
      )}

      {unratedOpen.length > 0 && (
        <div className="alert alert-error" style={{marginTop: 24}}>
          {t('home.unrated_alert', { count: unratedOpen.length })}{' '}
          <Link to="/rate" style={{ fontWeight: 700 }}>{t('home.rate_now')}</Link>
        </div>
      )}

      {recentlyFinished.length > 0 && (
        <>
          <div className="section-divider">
            <h2>{t('home.finished_title')}</h2>
            <span className="badge">RESULTS</span>
          </div>
          <div style={{display: 'grid', gap: 12}}>
            {recentlyFinished.map(b => {
              const r = ratingByBatch[b.id];
              const rated = hasMyRating(b);
              const resolved = b.outcome_level != null;
              const points = Number(r?.points || 0);
              return (
                <BatchCard key={b.id} batch={{ ...b, my_rating: r?.rating ?? b.my_rating }}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
                    {rated ? (
                      <span style={{display:'inline-flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:14}}>
                        <span style={{fontWeight:700}}>{t('home.my_guess_label')}</span>
                        <LeafRating value={Number(r?.rating ?? b.my_rating)} readOnly size="sm" label={t('home.my_guess_label')} />
                        <span dir="ltr" style={{color:'var(--muted)'}}>{Number(r?.rating ?? b.my_rating)}/5</span>
                      </span>
                    ) : (
                      <span style={{color:'var(--muted)', fontWeight:600, fontSize:14}}>{t('home.no_rating')}</span>
                    )}
                    {rated && resolved && (
                      <span className={`points-pill ${points >= 5 ? 'exact' : points >= 2 ? 'high' : 'zero'}`}>
                        {points} {t('common.points')}
                      </span>
                    )}
                  </div>
                </BatchCard>
              );
            })}
          </div>
        </>
      )}

      {topScoredUsers.length > 0 && (
        <>
          <div className="section-divider">
            <h2>{t('home.top5')}</h2>
            <span className="badge">LEADERBOARD</span>
          </div>

          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{width: 80}}>{t('home.place')}</th>
                <th>{t('home.player')}</th>
                <th style={{width: 120, textAlign:'end'}}>{t('home.points')}</th>
              </tr>
            </thead>
            <tbody>
              {topScoredUsers.map(r => (
                <tr key={r.id} className={r.rank <= 3 ? `top-${r.rank}` : ''}>
                  <td>
                    <span className={`rank-medal ${r.rank===1?'gold':r.rank===2?'silver':r.rank===3?'bronze':''}`}>
                      {r.rank}
                    </span>
                  </td>
                  <td style={{fontWeight: 600}}>{r.name}</td>
                  <td style={{textAlign:'end'}}><span className="total-pts">{r.total_points}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {coinsLeaderboardEnabled && coinBoard.length > 0 && (
        <>
          <div className="section-divider">
            <h2><CoinIcon size={20} /> {t('coin.top5_coins')}</h2>
            <span className="badge">שיחים</span>
          </div>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{width: 80}}>{t('home.place')}</th>
                <th>{t('home.player')}</th>
                <th style={{width: 120, textAlign:'end'}}>{t('coin.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {coinBoard.map(r => (
                <tr key={r.id} className={r.rank <= 3 ? `top-${r.rank}` : ''}>
                  <td>
                    <span className={`rank-medal ${r.rank===1?'gold':r.rank===2?'silver':r.rank===3?'bronze':''}`}>{r.rank}</span>
                  </td>
                  <td style={{fontWeight: 600}}>{r.name}</td>
                  <td style={{textAlign:'end', color:'var(--gold-deep)', fontWeight:700}}>{r.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
