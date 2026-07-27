import LeafRating from './LeafRating';
import { useTranslation } from '../i18n/TranslationContext';
import { getStageMeta, stageDisplay } from '../lib/stages';

// כרטיס אצווה — מחליף את MatchCard ומשתמש באותן מחלקות CSS (.match-card וכו').
// ימין: שם + קוד אצווה · מרכז: הדירוג שלי או רמת התוצאה כשהסתיימה · שמאל: תחנה + סטטוס.
export default function BatchCard({ batch, children }) {
  const { t, language, pickText } = useTranslation();
  const finished = batch.status === 'finished';
  const stageMeta = getStageMeta(batch.stage);
  const name = pickText(batch.name, batch.name_en) || batch.code || '';
  const hasOutcome = finished && batch.outcome_level != null;
  const myRating = batch.my_rating != null ? Number(batch.my_rating) : null;

  return (
    <div className={`match-card batch-card ${finished ? 'finished' : ''}`} dir="rtl">
      <div className="match-team home">
        {batch.image_url
          ? <img className="batch-thumb" src={batch.image_url} alt="" />
          : <span className="home-emoji" aria-hidden="true">🌿</span>}
        <span className="name" title={name}>{name}</span>
        {batch.code && <span className="batch-code" dir="ltr">{batch.code}</span>}
      </div>

      <div className="match-center">
        {hasOutcome ? (
          <>
            <LeafRating value={batch.outcome_level} readOnly size="sm" className="leaf-outcome" label={t('batches.outcome_level')} />
            <div className="match-status">{t('batches.outcome_level')} · {Number(batch.outcome_level)}/5</div>
          </>
        ) : myRating != null ? (
          <>
            <LeafRating value={myRating} readOnly size="sm" label={t('batches.my_rating')} />
            <div className="match-status">{t('batches.my_rating')}</div>
          </>
        ) : (
          <>
            <div className="match-vs">?</div>
            <div className="match-status">{t('batches.not_rated')}</div>
          </>
        )}
      </div>

      <div className="match-team away">
        <span className="stage-chip" title={t('batches.current_stage')}>
          {stageMeta?.emoji && <span aria-hidden="true">{stageMeta.emoji}</span>}
          <span>{stageDisplay(t, batch.stage, language)}</span>
        </span>
        <span className={`batch-status-chip ${finished ? 'finished' : 'active'}`}>
          {finished ? t('batches.status_finished') : t('batches.status_active')}
        </span>
      </div>

      {children && <div style={{ gridColumn: '1 / -1', marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>{children}</div>}
    </div>
  );
}
