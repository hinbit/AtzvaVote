import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import CoinIcon from './CoinIcon';
import { useTranslation } from '../i18n/TranslationContext';
import { stageDisplay } from '../lib/stages';

// פאנל אישי: יתרת שיחים + סטטיסטיקות + כל ההימורים של המשתמש (לפי סוג וסטטוס)
export default function MyCoinsPanel() {
  const { t, pickText } = useTranslation();
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [stats, setStats] = useState(null);
  const [bets, setBets] = useState([]);

  useEffect(() => {
    api.get('/coin-bets/wallet').then(r => setWallet(r.data)).catch(() => {});
    api.get('/coin-bets/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/coin-bets/mine').then(r => setBets(r.data || [])).catch(() => {});
  }, []);

  // תווית סוג ההימור (כרגע רק "הצלחת אצווה"; מוכן להרחבה לסוגים נוספים)
  const marketLabel = () => t('coin.market_batch_success');
  // תווית צד ההימור: success = תוצאה 4-5, fail = תוצאה 1-3
  const propLabel = (b) => t(b.proposition === 'success' ? 'coin.prop_success' : 'coin.prop_fail');
  const statusLabel = {
    open: t('coin.status_open'), matched: t('coin.status_matched'),
    settled: t('coin.status_settled'), cancelled: t('coin.status_cancelled'), void: t('coin.status_void')
  };

  return (
    <div className="card my-coins" style={{ marginTop: 24 }}>
      <div className="my-coins-head">
        <div className="label" style={{ margin: 0 }}>{t('coin.my_coins_title')}</div>
        <Link to="/coin-bets" className="btn btn-sm btn-gold">{t('coin.go_bet')}</Link>
      </div>

      <div className="my-coins-stats">
        <div className="stat-card">
          <div className="label">{t('coin.balance')}</div>
          <div className="value" style={{ color: 'var(--gold)' }}><CoinIcon size={15} /> {wallet ? wallet.balance.toLocaleString() : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('coin.rank')}</div>
          <div className="value">{stats?.rank ? `#${stats.rank}` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('coin.wins')}</div>
          <div className="value">{stats ? `${stats.bets_won}/${stats.bets_settled}` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('coin.win_rate')}</div>
          <div className="value">{stats ? `${stats.win_rate}%` : '—'}</div>
        </div>
      </div>

      <div className="my-coins-bets-title">{t('coin.all_bets')}</div>
      {bets.length === 0 ? (
        <div className="coin-empty">{t('coin.mine_empty')}</div>
      ) : (
        <div className="coin-list">
          {bets.map(b => {
            // ניצחון: כיוצר — winner_id שלי; כמקבל — my_won מהשתתפותי
            const iAmCreator = b.creator_id === user?.id;
            const won = b.status === 'settled' && (iAmCreator ? Number(b.winner_id) === user?.id : Number(b.my_won) === 1);
            return (
              <div key={b.id} className="coin-card" dir="rtl">
                <div className="my-coins-bet-row">
                  <span className="coin-type-chip">{marketLabel(b)}</span>
                  <span className="my-coins-teams">
                    🌿 {pickText(b.batch_name, b.batch_name_en)} ({b.batch_code})
                  </span>
                  <span className="coin-match-when">{stageDisplay(t, b.batch_stage)}</span>
                </div>
                <div className="coin-card-body">
                  <span>{t('coin.you_back')} <strong>{propLabel(b)}</strong></span>
                  <span className="coin-stake"><CoinIcon size={15} /> {b.stake.toLocaleString()}</span>
                </div>
                <div className="coin-card-foot">
                  <span className={`coin-status coin-status-${b.status}`}>{statusLabel[b.status]}</span>
                  {b.batch_status === 'finished' && b.outcome_level != null && (
                    <span className="coin-match-when">{t('coin.outcome_level')}: {b.outcome_level}</span>
                  )}
                  {b.status === 'settled' && (
                    won
                      ? <span className="coin-result-win">+{(b.stake * 2).toLocaleString()} <CoinIcon size={15} /></span>
                      : <span className="coin-result-lose">−{b.stake.toLocaleString()} <CoinIcon size={15} /></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
