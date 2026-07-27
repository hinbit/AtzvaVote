import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import ReviewPublishModal from './ReviewPublishModal';

// בוחר פורמט הקלטה נתמך (דסקטופ/אנדרואיד → webm, iOS → mp4) כדי שההקלטה תקליט אודיו בפועל
const MIME_CANDS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg'];
function pickSupportedMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_CANDS.find(c => { try { return MediaRecorder.isTypeSupported(c); } catch { return false; } }) || '';
}
function extForType(type) {
  if (/mp4|m4a|aac/.test(type)) return 'm4a';
  if (/ogg/.test(type)) return 'ogg';
  if (/wav/.test(type)) return 'wav';
  if (/mpeg|mp3/.test(type)) return 'mp3';
  return 'webm';
}

// כפתור הקלטת "פתק טעימה" קולי לאצווה.
// הקש → התחלת הקלטה. הקש שוב / Enter → סיום, תמלול, ופתיחת פופ-אפ פרסום.
// אם כבר קיים ריביו של המשתמש לאצווה — האייקון הופך ל-▶ ופתיחתו עורכת את הריביו.
export default function BatchReviewRecorder({ batchId, disabled, onPublished, myReview, myLevel = null }) {
  const { t } = useTranslation();
  const [state, setState] = useState('idle'); // idle | recording | uploading
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null); // { audioUrl, transcript, warning }
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // ניקוי הזרם בעת הסרת הרכיב
  useEffect(() => () => {
    try { recRef.current && recRef.current.state !== 'inactive' && recRef.current.stop(); } catch (e) { /* */ }
    streamRef.current && streamRef.current.getTracks().forEach(tr => tr.stop());
  }, []);

  const start = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErr(t('reviews.mic_denied'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickSupportedMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        // עוצרים את ה-tracks רק אחרי מסירת הצ'אנק האחרון (אחרת iOS עלול לחתוך את האודיו)
        try { streamRef.current && streamRef.current.getTracks().forEach(tr => tr.stop()); } catch (e) { /* */ }
        upload();
      };
      recRef.current = rec;
      rec.start(500); // timeslice → ondataavailable כל חצי שנייה (אמין במובייל/iOS)
      setState('recording');
    } catch (e) {
      setErr(t('reviews.mic_denied'));
    }
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.requestData(); } catch (e) { /* */ } // שטיפת הצ'אנק האחרון לפני העצירה
      rec.stop(); // עצירת ה-tracks מתבצעת ב-onstop
    } else {
      streamRef.current && streamRef.current.getTracks().forEach(tr => tr.stop());
    }
  };

  const upload = async () => {
    setState('uploading');
    try {
      // סוג ההקלטה תלוי-דפדפן: דסקטופ → webm/opus, מובייל (iOS) → mp4/aac.
      const type = chunksRef.current[0]?.type || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      if (!blob.size) { setErr(t('reviews.no_audio')); setState('idle'); return; }
      const form = new FormData();
      form.append('audio', blob, `review.${extForType(type)}`); // סיומת תואמת לשמירה/תמלול נכונים
      // התמלול סינכרוני ועלול לארוך — timeout ארוך (ברירת המחדל של 30 שניות קצרה למובייל)
      const r = await api.post('/reviews/transcribe', form, { timeout: 180000 });
      setModal({ audioUrl: r.data?.audio_url || null, transcript: r.data?.transcript || '', warning: r.data?.warning || '' });
    } catch (e) {
      const detail = e.code === 'ECONNABORTED' ? 'timeout'
        : e.response ? `HTTP ${e.response.status}` : (e.message || 'network');
      setErr(`${t('reviews.failed')} · ${detail}`);
    } finally {
      setState('idle');
    }
  };

  const hasReview = !!myReview;

  const openEdit = () => setModal({
    audioUrl: myReview.audio_url || null,
    transcript: myReview.transcript || '',
    body: myReview.body || '',
    predLevel: myReview.pred_level != null ? Number(myReview.pred_level) : null,
    warning: ''
  });

  const onClick = () => {
    if (state === 'recording') stop();
    else if (state === 'idle') { hasReview ? openEdit() : start(); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && state === 'recording') { e.preventDefault(); stop(); }
  };

  // הטקסט מתממגדר אוטומטית דרך טוקן {g:..|..} לפי מגדר המשתמש
  const idleLabel = hasReview ? t('reviews.listen_cta') : t('reviews.publish_cta');
  const label = state === 'recording' ? t('reviews.recording')
    : state === 'uploading' ? t('reviews.transcribing')
    : (hasReview ? idleLabel : t('reviews.record_tip'));

  return (
    <>
      <button
        type="button"
        className={`review-rec-btn ${state === 'recording' ? 'recording' : ''}`}
        onClick={onClick}
        onKeyDown={onKeyDown}
        disabled={disabled || state === 'uploading'}
        title={label}
        aria-label={label}
      >
        {state === 'uploading'
          ? <span className="spinner" />
          : <span className="review-rec-ico" aria-hidden="true">{state === 'recording' ? '■' : (hasReview ? '▶' : '🎙️')}</span>}
      </button>
      {state === 'idle' && !disabled && <span className="review-rec-cta" aria-hidden="true">{idleLabel}</span>}
      {err && <span className="review-rec-err">{err}</span>}

      {modal && (
        <ReviewPublishModal
          batchId={batchId}
          audioUrl={modal.audioUrl}
          transcript={modal.transcript}
          initialBody={modal.body}
          initialPredLevel={modal.predLevel != null ? modal.predLevel : myLevel}
          warning={modal.warning}
          onClose={() => setModal(null)}
          onPublished={onPublished}
          onRerecord={() => { setModal(null); start(); }}
        />
      )}
    </>
  );
}
