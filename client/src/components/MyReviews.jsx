import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import { ilDate } from '../utils/time';
import CoinIcon from './CoinIcon';
import { stageDisplay } from '../lib/stages';

// כרטיס "הריביוים שלי" בעמוד הפרופיל — האזנה, עריכת טקסט ומחיקה
export default function MyReviews() {
  const { t, locale, language, pickText } = useTranslation();
  const [rows, setRows] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    api.get(`/reviews/mine?lang=${locale}`)
      .then(r => setRows(r.data || []))
      .catch(e => { setErr(errMsg(e)); setRows([]); });
  };
  useEffect(load, []);

  const startEdit = (rev) => { setEditId(rev.id); setEditText(rev.body || ''); setErr(''); };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/reviews/${editId}`, { body: editText.trim() });
      setRows(rs => rs.map(r => r.id === editId ? { ...r, body: editText.trim() } : r));
      setEditId(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await api.delete(`/reviews/${id}`);
      setRows(rs => rs.filter(r => r.id !== id));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (rows && rows.length === 0) {
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <div className="label">{t('reviews.my_title')}</div>
        <p style={{ color: 'var(--muted)' }}>{t('reviews.my_empty')}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="label">{t('reviews.my_title')}</div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="my-reviews-list">
        {rows && rows.map(rev => (
          <div key={rev.id} className="review-card" dir="rtl">
            <div className="review-card-head">
              <span aria-hidden="true">🌿</span>
              <span>{pickText(rev.batch_name, rev.batch_name_en) || rev.batch_code}</span>
              {rev.batch_code && <span style={{ color: 'var(--muted)', fontSize: 12 }} dir="ltr">{rev.batch_code}</span>}
              <span className="stage-chip">{stageDisplay(t, rev.batch_stage, language)}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12, marginInlineStart: 'auto' }}>
                {ilDate(rev.created_at, locale, { day: '2-digit', month: '2-digit' })}
              </span>
            </div>

            {editId === rev.id ? (
              <>
                <textarea
                  className="review-textarea"
                  value={editText}
                  rows={3}
                  dir="rtl"
                  onChange={e => setEditText(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-sm btn-gold" onClick={saveEdit} disabled={busy}>{t('reviews.save')}</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setEditId(null)} disabled={busy}>{t('common.close')}</button>
                </div>
              </>
            ) : (
              <>
                {rev.body && <div className="review-body">{rev.body}</div>}
                {rev.audio_url && <audio className="review-audio" controls src={rev.audio_url} />}
                <div className="review-vote-row">
                  <span className="review-vote-count">👂 {rev.vote_count || 0} {t('reviews.votes')}</span>
                  {rev.coins_awarded > 0 && (
                    <span className="review-coins-earned"><CoinIcon size={15} /> {Number(rev.coins_awarded).toLocaleString()} {t('reviews.coins_earned')}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-sm btn-outline" onClick={() => startEdit(rev)} disabled={busy}>{t('common.edit')}</button>
                  <button className="btn btn-sm btn-outline" onClick={() => remove(rev.id)} disabled={busy}>{t('reviews.delete')}</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
