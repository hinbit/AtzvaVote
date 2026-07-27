import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/TranslationContext';
import { GroupBadge } from '../components/GroupBadges';

export default function GuessGroups() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState('my');
  const [mine, setMine] = useState([]);
  const [board, setBoard] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryCost, setEntryCost] = useState(0);
  const [points, setPoints] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    api.get('/guess-groups').then(r => setMine(r.data)).catch(() => setMine([]));
    api.get('/guess-groups/leaderboard').then(r => setBoard(r.data)).catch(() => setBoard([]));
    api.get('/guess-groups/me/points').then(r => setPoints(r.data)).catch(() => setPoints(null));
  };

  useEffect(() => { load(); }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    setErr('');
    if (name.trim().length < 2) { setErr(t('gg.name')); return; }
    setBusy(true);
    try {
      await api.post('/guess-groups', { name: name.trim(), description: description.trim(), entry_cost: entryCost });
      setName('');
      setDescription('');
      setEntryCost(0);
      load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1 className="page-title">{t('gg.title')}</h1>
      <p className="page-subtitle">{t('gg.subtitle')}</p>

      <div className="gg-tabs">
        <button className={`gg-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>{t('gg.tab_my')}</button>
        <button className={`gg-tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>{t('gg.tab_board')}</button>
      </div>

      {tab === 'my' && (
        <>
          <form className="stat-card gg-create" style={{ borderTop: '4px solid var(--pitch)' }} onSubmit={createGroup}>
            <div className="label">{t('gg.create_title')}</div>
            {points && (
              <div className="gg-points-chip" title={t('gg.available_points')}>
                💰 {t('gg.available_points')}: <strong>{points.available_points}</strong>
              </div>
            )}
            {err && <div className="alert alert-error">{err}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 8 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('gg.name')}</label>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={120} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('gg.description')}</label>
                <input value={description} onChange={e => setDescription(e.target.value)} maxLength={255} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('gg.entry_cost')}</label>
                <select value={entryCost} onChange={e => setEntryCost(Number(e.target.value))}>
                  {Array.from({ length: (points?.max_entry_cost ?? 5) + 1 }, (_, c) => (
                    <option key={c} value={c}>{c === 0 ? t('gg.free') : `${c} ${t('gg.points')}`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>{t('gg.entry_cost_help')}</div>
            <button className="btn btn-gold" type="submit" disabled={busy} style={{ marginTop: 12 }}>
              {busy ? <span className="spinner" /> : t('gg.create')}
            </button>
          </form>

          {mine.length === 0 ? (
            <div className="stat-card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
              {t('gg.my_empty')}
            </div>
          ) : (
            <div className="gg-cards">
              {mine.map(g => <GroupCard key={g.id} g={g} t={t} isAdmin={user.isAdmin} />)}
            </div>
          )}
        </>
      )}

      {tab === 'board' && <GroupLeaderboard board={board} t={t} userId={user.id} />}
    </main>
  );
}

function GroupCard({ g, t, isAdmin }) {
  const mine = (g.members || []).some(m => m.role === 'leader');
  return (
    <Link to={`/guess-groups/${g.id}`} className="gg-card">
      <div className="gg-card-head">
        <span className="gg-card-name">{g.name}</span>
        <GroupBadge rank={g.rank} />
      </div>
      {g.description && <div className="gg-card-desc">{g.description}</div>}
      <div className="gg-cost-line">
        {g.entry_cost > 0
          ? <span className="gg-cost-chip">💰 {g.entry_cost} {t('gg.points')}</span>
          : <span className="gg-cost-chip free">{t('gg.free')}</span>}
      </div>
      <div className="gg-card-stats">
        <div><span className="gg-stat-val">{g.total_points}</span><span className="gg-stat-lbl">{t('gg.points')}</span></div>
        <div><span className="gg-stat-val">#{g.rank}</span><span className="gg-stat-lbl">{t('gg.rank')}</span></div>
        <div><span className="gg-stat-val">×{g.multiplier}</span><span className="gg-stat-lbl">{t('gg.multiplier')}</span></div>
        <div><span className="gg-stat-val">{g.member_count}</span><span className="gg-stat-lbl">{t('gg.members')}</span></div>
      </div>
      <div className="gg-card-members">
        {(g.members || []).slice(0, 5).map(m => (
          m.profile_image_url
            ? <img key={m.id} className="gg-mini-avatar" src={m.profile_image_url} alt={m.name} title={m.name} />
            : <span key={m.id} className="gg-mini-avatar gg-mini-fallback" title={m.name}>{(m.name || '?').slice(0, 1)}</span>
        ))}
      </div>
    </Link>
  );
}

function GroupLeaderboard({ board, t, userId }) {
  if (!board.length) {
    return <div className="stat-card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>{t('gg.board_empty')}</div>;
  }
  return (
    <div className="table-wrap">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th style={{ width: 70 }}>#</th>
            <th>{t('gg.name')}</th>
            <th style={{ width: 120, textAlign: 'center' }}>{t('gg.members')}</th>
            <th style={{ width: 90, textAlign: 'center' }}>{t('gg.multiplier')}</th>
            <th style={{ width: 110, textAlign: 'center' }}>{t('gg.winning_bets')}</th>
            <th style={{ width: 120, textAlign: 'end' }}>{t('gg.points')}</th>
          </tr>
        </thead>
        <tbody>
          {board.map(g => {
            const isMine = (g.members || []).some(m => m.id === userId);
            return (
              <tr key={g.id} className={g.rank <= 3 ? `top-${g.rank}` : ''}
                  style={isMine ? { outline: '2px solid var(--gold)', outlineOffset: -2 } : {}}>
                <td>
                  <span className={`rank-medal ${g.rank === 1 ? 'gold' : g.rank === 2 ? 'silver' : g.rank === 3 ? 'bronze' : ''}`}>{g.rank}</span>
                </td>
                <td>
                  <Link to={`/guess-groups/${g.id}`} className="gg-board-name">
                    <strong>{g.name}</strong>
                    <GroupBadge rank={g.rank} />
                  </Link>
                  <div className="gg-board-leader">{t('gg.leader')}: {g.leader_name}</div>
                </td>
                <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{g.member_count}</td>
                <td style={{ textAlign: 'center' }}><span className="points-pill high">×{g.multiplier}</span></td>
                <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{g.winning_bets}/{g.total_bets}</td>
                <td style={{ textAlign: 'end' }}><span className="total-pts">{g.total_points}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
