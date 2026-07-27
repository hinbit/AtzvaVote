import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import { ilDate } from '../utils/time';

function PrizeImage({ src, name }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return <div className="prize-placeholder" aria-hidden="true">🎁</div>;
  }
  return (
    <img src={src} alt={name || ''} loading="lazy" onError={() => setFailed(true)} />
  );
}

const STATUS_KEYS = {
  pending: 'prizes.status_pending',
  approved: 'prizes.status_approved',
  delivered: 'prizes.status_delivered',
  cancelled: 'prizes.status_cancelled'
};

export default function Prizes() {
  const { t, locale } = useTranslation();
  const [prizes, setPrizes] = useState([]);
  const [myPoints, setMyPoints] = useState(0);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmPrize, setConfirmPrize] = useState(null);
  const [redeeming, setRedeeming] = useState(false);

  const fetchAll = (withSpinner = true) => {
    if (withSpinner) setLoading(true);
    return api.get('/prizes')
      .then((r) => {
        setPrizes(r.data?.prizes || []);
        setMyPoints(r.data?.my_points ?? 0);
        setRedemptions(r.data?.my_redemptions || []);
        setError('');
      })
      .catch((err) => setError(errMsg(err, t('prizes.load_error'))))
      .finally(() => { if (withSpinner) setLoading(false); });
  };

  useEffect(() => { fetchAll(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stockLeft = (prize) => {
    if (prize.stock == null) return Infinity;
    return Math.max(0, prize.stock - (prize.redeemed_count || 0));
  };

  const redeem = async () => {
    if (!confirmPrize) return;
    setRedeeming(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/prizes/${confirmPrize.id}/redeem`);
      setSuccess(t('prizes.redeem_success', { name: confirmPrize.name }));
      setConfirmPrize(null);
      await fetchAll(false);
    } catch (err) {
      setError(errMsg(err, t('prizes.redeem_error')));
      setConfirmPrize(null);
    } finally {
      setRedeeming(false);
    }
  };

  const sortedPrizes = [...prizes].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <main className="page">
      <h1 className="page-title">{t('prizes.title')}</h1>
      <p className="page-subtitle">{t('prizes.subtitle')}</p>

      <div className="coin-wallet-banner">
        <div>
          <div className="coin-wallet-label">{t('prizes.wallet_label')}</div>
          <div className="coin-wallet-value">{myPoints} 🏅</div>
        </div>
        <div className="coin-wallet-label">{t('prizes.wallet_hint')}</div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {loading ? (
        <div className="prize-shop-empty">{t('common.loading')}</div>
      ) : sortedPrizes.length === 0 ? (
        <div className="prize-shop-empty">{t('prizes.empty')}</div>
      ) : (
        <div className="prize-grid">
          {sortedPrizes.map((prize) => {
            const left = stockLeft(prize);
            const outOfStock = left <= 0;
            const notEnough = myPoints < prize.cost_points;
            const disabled = outOfStock || notEnough;
            return (
              <div key={prize.id} className="card prize-card prize-shop-card">
                <PrizeImage src={prize.image_url} name={prize.name} />
                <div className="prize-card-label">{prize.name}</div>
                {prize.description && (
                  <p className="prize-shop-desc">{prize.description}</p>
                )}
                <div className="prize-cost-row">
                  <span className={`points-pill ${notEnough ? 'zero' : 'high'}`}>
                    {t('prizes.cost', { points: prize.cost_points })}
                  </span>
                  {prize.stock != null && (
                    <span className="prize-stock-note">
                      {outOfStock
                        ? t('prizes.out_of_stock')
                        : t('prizes.stock_left', { count: left })}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-gold prize-redeem-btn"
                  disabled={disabled}
                  onClick={() => setConfirmPrize(prize)}
                >
                  {outOfStock
                    ? t('prizes.out_of_stock')
                    : notEnough
                      ? t('prizes.not_enough')
                      : t('prizes.redeem')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <section style={{ marginTop: 28 }}>
        <div className="section-divider">
          <h2>{t('prizes.history_title')}</h2>
          <span className="badge">{t('prizes.history_badge')}</span>
        </div>

        {redemptions.length === 0 ? (
          <div className="prize-shop-empty">{t('prizes.history_empty')}</div>
        ) : (
          <div className="table-wrap">
            <table className="redemption-table">
              <thead>
                <tr>
                  <th>{t('prizes.col_prize')}</th>
                  <th>{t('prizes.col_cost')}</th>
                  <th>{t('prizes.col_status')}</th>
                  <th>{t('prizes.col_date')}</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="redemption-prize-cell">
                        {r.prize_image && (
                          <img className="redemption-thumb" src={r.prize_image} alt="" />
                        )}
                        <span>{r.prize_name}</span>
                      </div>
                    </td>
                    <td>{r.cost_points}</td>
                    <td>
                      <span className={`redemption-status status-${r.status}`}>
                        {t(STATUS_KEYS[r.status] || 'prizes.status_pending')}
                      </span>
                    </td>
                    <td>
                      {ilDate(r.created_at, locale, {
                        day: '2-digit', month: '2-digit', year: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmPrize && (
        <div className="doc-modal-backdrop" onClick={() => !redeeming && setConfirmPrize(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3>{t('prizes.confirm_title')}</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  {t('prizes.confirm_text', {
                    name: confirmPrize.name,
                    points: confirmPrize.cost_points
                  })}
                </p>
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setConfirmPrize(null)}
                disabled={redeeming}
              >
                {t('common.close')}
              </button>
            </div>

            {confirmPrize.image_url && (
              <img
                src={confirmPrize.image_url}
                alt={confirmPrize.name}
                className="prize-modal-image"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}

            <div className="prize-confirm-balance">
              {t('prizes.confirm_balance', {
                after: myPoints - confirmPrize.cost_points
              })}
            </div>

            <div className="prize-confirm-actions">
              <button
                type="button"
                className="btn btn-gold"
                onClick={redeem}
                disabled={redeeming}
              >
                {redeeming ? t('common.loading') : t('prizes.confirm_button')}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmPrize(null)}
                disabled={redeeming}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
