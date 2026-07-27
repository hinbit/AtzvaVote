import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import BatchCard from '../components/BatchCard';
import BatchReviews from '../components/BatchReviews';
import { useTranslation } from '../i18n/TranslationContext';

// ארכיון האצוות — כל האצוות (פעילות + שהסתיימו) עם סינון לפי סטטוס ורבעון.
// לכל אצווה: ממוצע דירוגים, כמות מדרגים, הדירוג שלי, וריביוים מתקפלים.
export default function Batches() {
  const { t, pickText } = useTranslation();
  const [batches, setBatches] = useState([]);
  const [quarters, setQuarters] = useState([]);
  const [filter, setFilter] = useState('all');
  const [quarter, setQuarter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/batches').then(r => setBatches(r.data || [])).catch(() => setBatches([])).finally(() => setLoading(false));
    api.get('/batches/quarters').then(r => setQuarters(r.data || [])).catch(() => setQuarters([]));
  }, []);

  const rows = useMemo(() => batches.filter(b => {
    if (filter === 'active' && b.status !== 'active') return false;
    if (filter === 'finished' && b.status !== 'finished') return false;
    if (quarter && b.quarter !== quarter) return false;
    return true;
  }), [batches, filter, quarter]);

  const FILTERS = ['all', 'active', 'finished'];

  return (
    <main className="page">
      <h1 className="page-title">{t('batches.title')}</h1>
      <p className="page-subtitle">{t('batches.subtitle')}</p>

      <div className="matches-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter(f)}
          >
            {t(`batches.filter_${f}`)}
          </button>
        ))}
        {quarters.length > 1 && (
          <select value={quarter} onChange={e => setQuarter(e.target.value)} style={{ marginInlineStart: 'auto' }}>
            <option value="">{t('batches.all_quarters')}</option>
            {quarters.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        )}
      </div>

      {loading && <div className="page-subtitle">{t('common.loading')}</div>}
      {!loading && rows.length === 0 && (
        <div className="alert" style={{ background: 'var(--paper-pure)', border: '1px solid var(--line)' }}>
          {t('batches.no_rows')}
        </div>
      )}

      <div className="matches-list">
        {rows.map(b => (
          <BatchCard key={b.id} batch={b}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
              {b.avg_rating != null && (
                <span>
                  {t('batches.avg')}: <b>{Number(b.avg_rating).toFixed(2)}</b>/5
                  <span style={{ color: 'var(--muted)' }}> · {t('batches.ratings_count', { count: b.ratings_count })}</span>
                </span>
              )}
              {b.quarter && <span className="stage-chip" dir="ltr">{b.quarter}</span>}
              {b.status === 'active' && b.rating_open ? (
                <Link className="btn btn-sm btn-gold" to="/rate" style={{ marginInlineStart: 'auto' }}>
                  {b.my_rating != null ? t('home.edit_rating') : t('home.rate_now')}
                </Link>
              ) : null}
            </div>
            {b.description && (
              <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 14 }}>{pickText(b.description, b.description)}</p>
            )}
            <BatchReviews batchId={b.id} />
          </BatchCard>
        ))}
      </div>
    </main>
  );
}
