import { useState } from 'react';
import api, { errMsg } from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import LeafRating from './LeafRating';

// פופ-אפ פרסום ריביו (פתק טעימה) לאצווה: טקסט מתומלל הניתן לעריכה + תצוגת אודיו
// + צירוף אופציונלי של ניחוש רמת האיכות (1-5, עלי קנאביס במקום שני שערים).
export default function ReviewPublishModal({ batchId, audioUrl, transcript, initialBody, initialPredLevel = null, warning, onClose, onPublished, onRerecord }) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody || transcript || '');
  const [includePrediction, setIncludePrediction] = useState(true);
  const [predLevel, setPredLevel] = useState(initialPredLevel != null ? Number(initialPredLevel) : 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const publish = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await api.post('/reviews', {
        batch_id: batchId,
        audio_url: audioUrl || null,
        transcript: transcript || null,
        body: body.trim(),
        include_prediction: includePrediction,
        pred_level: includePrediction && predLevel >= 1 ? predLevel : null
      });
      onPublished && onPublished();
      onClose && onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="doc-modal-backdrop" onClick={() => !busy && onClose && onClose()}>
      <div className="doc-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="doc-modal-head">
          <h3>{t('reviews.modal_title')}</h3>
          {!busy && <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>{t('common.close')}</button>}
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        {warning && <div className="alert" style={{ background:'var(--paper-pure)', border:'1px solid var(--gold)' }}>{warning}</div>}

        {audioUrl && (
          <audio className="review-audio" controls src={audioUrl} style={{ width:'100%', marginBottom:12 }} />
        )}

        <div className="field">
          <label>{t('reviews.text_label')}</label>
          <textarea
            className="review-textarea"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={5}
            dir="rtl"
            placeholder={t('reviews.transcribing')}
          />
        </div>

        <label className="review-attach">
          <input type="checkbox" checked={includePrediction} onChange={e => setIncludePrediction(e.target.checked)} />
          <span>{t('reviews.attach_prediction')}</span>
        </label>

        {includePrediction && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <LeafRating value={predLevel} onChange={setPredLevel} size="sm" disabled={busy} label={t('rate.rating_label')} />
            {predLevel >= 1 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{predLevel}/5</span>}
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          {onRerecord && (
            <button type="button" className="btn btn-outline" style={{ justifyContent:'center' }} onClick={() => !busy && onRerecord()} disabled={busy}>
              🎙️ {t('reviews.rerecord')}
            </button>
          )}
          <button
            className="btn btn-gold"
            style={{ flex:1, justifyContent:'center' }}
            onClick={publish}
            disabled={busy || !body.trim()}
          >
            {busy ? <span className="spinner" /> : t('reviews.publish')}
          </button>
        </div>
      </div>
    </div>
  );
}
