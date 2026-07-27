import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/TranslationContext';
import LeaderboardBadges from '../components/LeaderboardBadges';

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [quarter, setQuarter] = useState(''); // '' = כל הזמן, 'current' = הרבעון הנוכחי
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    // סינון רבעוני אופציונלי — השרת מקבל quarter='current' או מזהה רבעון מפורש
    api.get(quarter ? `/leaderboard?quarter=${quarter}` : '/leaderboard').then(r => setRows(r.data));
  }, [quarter]);

  const visibleRows = rows.filter((r) => Number(r.total_points || 0) > 3);
  const totalUsers = visibleRows.length;
  const activeUsers = visibleRows.filter((r) => Number(r.num_predictions || 0) > 0).length;
  const participantsPercent = totalUsers ? ((activeUsers / totalUsers) * 100) : 0;
  const avgScore = totalUsers
    ? (visibleRows.reduce((sum, r) => sum + Number(r.total_points || 0), 0) / totalUsers)
    : 0;

  return (
    <main className="page">
      <h1 className="page-title">
        {t('leaderboard.title')}
      </h1>
      <p className="page-subtitle">{t('leaderboard.subtitle')}</p>

      <div className="field" style={{ maxWidth: 260, marginBottom: 16 }}>
        <label>{t('leaderboard.quarter_filter')}</label>
        <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
          <option value="">{t('leaderboard.all_time')}</option>
          <option value="current">{t('leaderboard.current_quarter')}</option>
        </select>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">{t('leaderboard.active_percent')}</div>
          <div className="value">{participantsPercent.toFixed(1)}%</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t('leaderboard.out_of', { active: activeUsers, total: totalUsers })}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('leaderboard.avg_score')}</div>
          <div className="value">{avgScore.toFixed(1)}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t('leaderboard.points_per_user')}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th style={{width: 80}}>{t('home.place')}</th>
              <th>{t('leaderboard.name')}</th>
              <th style={{width: 110, textAlign:'center'}}>{t('leaderboard.department')}</th>
              <th style={{width: 90, textAlign:'center'}}>{t('leaderboard.ratings')}</th>
              <th style={{width: 100, textAlign:'center'}}>{t('leaderboard.exact')}</th>
              <th style={{width: 100, textAlign:'center'}}>{t('leaderboard.close')}</th>
              <th style={{width: 130, textAlign:'end'}}>{t('leaderboard.total')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => (
              <tr key={r.id} className={
                `${r.rank <= 3 ? `top-${r.rank}` : ''} ${r.id === user.id ? 'me' : ''}`
              } style={r.id === user.id ? { outline: '2px solid var(--gold)', outlineOffset: -2 } : {}}>
                <td>
                  <span className={`rank-medal ${r.rank===1?'gold':r.rank===2?'silver':r.rank===3?'bronze':''}`}>
                    {r.rank}
                  </span>
                </td>
                <td>
                  <div className="leaderboard-user">
                    {r.profile_image_url ? (
                      <img className="leaderboard-avatar" src={r.profile_image_url} alt={r.name} />
                    ) : (
                      <div className="leaderboard-avatar leaderboard-avatar-fallback">{(r.name || '?').slice(0, 1)}</div>
                    )}
                    <div className="leaderboard-user-meta">
                      <strong>{r.name}</strong>
                      <LeaderboardBadges badges={r.badges} />
                    </div>
                  </div>
                  {r.id === user.id && <span style={{marginInlineStart: 8, color:'var(--gold-deep)', fontSize: 11, letterSpacing:'.15em'}}>{t('leaderboard.this_is_me')}</span>}
                </td>
                <td style={{textAlign:'center', color:'var(--muted)'}}>{r.department || '—'}</td>
                <td style={{textAlign:'center', color:'var(--muted)'}}>{r.num_predictions}</td>
                <td style={{textAlign:'center'}}>
                  {r.exact_hits > 0 ? <span className="points-pill exact">{r.exact_hits}</span> : <span style={{color:'var(--muted)'}}>—</span>}
                </td>
                <td style={{textAlign:'center'}}>
                  {r.close_hits > 0 ? <span className="points-pill high">{r.close_hits}</span> : <span style={{color:'var(--muted)'}}>—</span>}
                </td>
                <td style={{textAlign:'end'}}><span className="total-pts">{r.total_points}</span></td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={7} style={{textAlign:'center', color:'var(--muted)', padding:32}}>{t('leaderboard.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
