import { useEffect, useState } from 'react';
import api from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import ScoringSummary from '../components/ScoringSummary';
import { ilDate, ilMs } from '../utils/time';

function formatDate(dateStr, locale) {
  return ilDate(dateStr, locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export default function SchedulePrizes() {
  const [items, setItems] = useState([]);
  const [selectedPrize, setSelectedPrize] = useState(null);
  const { t, locale } = useTranslation();

  useEffect(() => {
    api.get('/schedule').then((r) => setItems(r.data || [])).catch(() => setItems([]));
  }, []);

  const now = Date.now();
  const nextItem = items.find((item) => ilMs(item.end_at) >= now) || null;
  const specialLockItem = items.find((item) => item.title === 'סגירת ניחושים מיוחדים') || null;
  const prizeItems = items
    .filter((item) => Number.isInteger(Number(item.prize_slot)) && Number(item.prize_slot) > 0)
    .sort((a, b) => Number(a.prize_slot) - Number(b.prize_slot));

  return (
    <main className="page">
      <h1 className="page-title">
        {t('schedule.title')}
      </h1>
      <p className="page-subtitle">{t('schedule.subtitle')}</p>

      <ScoringSummary specialLockLabel={specialLockItem?.date_label || ''} />

      <section className="schedule-layout">
        <div className="schedule-table-card">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>{t('schedule.stage')}</th>
                <th>{t('schedule.dates')}</th>
                <th>{t('schedule.what_happens')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const passed = ilMs(item.end_at) < now;
                return (
                  <tr key={item.id} className={passed ? 'passed' : ''}>
                    <td>{item.title}</td>
                    <td>{item.date_label}</td>
                    <td>{item.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="schedule-next-card">
          <div className="schedule-next-arrow">←</div>
          <div className="schedule-next-copy">
            <strong>{t('schedule.next_target')}</strong>
            {nextItem ? (
              <>
                <div>{nextItem.title}</div>
                <small>{nextItem.date_label} · {formatDate(nextItem.start_at, locale)}</small>
              </>
            ) : (
              <small>{t('schedule.all_passed')}</small>
            )}
          </div>
        </aside>
      </section>

      <section style={{ marginTop: 28 }}>
        <div className="section-divider">
          <h2>{t('schedule.prizes')}</h2>
          <span className="badge">PRIZES</span>
        </div>

        <div className="prize-grid">
          {[1, 2, 3].map((slot) => {
            const item = prizeItems.find((entry) => Number(entry.prize_slot) === slot);
            return (
              <button
                key={slot}
                type="button"
                className="prize-card"
                onClick={() => item && setSelectedPrize(item)}
                disabled={!item}
              >
                {item?.prize_image_url ? (
                  <img src={item.prize_image_url} alt={t('schedule.prize_label', { slot })} />
                ) : (
                  <div className="prize-placeholder">{t('schedule.prize_label', { slot })}</div>
                )}
                <div className="prize-card-label">{t('schedule.prize_label', { slot })}</div>
              </button>
            );
          })}
        </div>
      </section>

      {selectedPrize && (
        <div className="doc-modal-backdrop" onClick={() => setSelectedPrize(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3>{selectedPrize.title}</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>{selectedPrize.description}</p>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedPrize(null)}>{t('common.close')}</button>
            </div>

            {selectedPrize.prize_image_url && (
              <img
                src={selectedPrize.prize_image_url}
                alt={selectedPrize.title}
                className="prize-modal-image"
              />
            )}

            <div className="winner-panel">
              <strong>{t('schedule.winner')}</strong>
              {selectedPrize.winner_name ? (
                <span>{selectedPrize.winner_name}</span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>{t('schedule.no_winner')}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
