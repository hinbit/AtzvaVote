import { useEffect, useState } from 'react';
import api from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';

export default function ScoringSummary({ compact = false, specialLockLabel = '' }) {
  const { t } = useTranslation();
  const [scoring, setScoring] = useState(null);

  useEffect(() => {
    api.get('/site/scoring')
      .then((r) => setScoring(r.data || null))
      .catch(() => setScoring(null));
  }, []);

  if (!scoring) return null;

  return (
    <section className={`scoring-summary ${compact ? 'compact' : ''}`}>
      <div className="scoring-summary-head">
        <strong>{t('scoring.title')}</strong>
        <span>{t('scoring.subtitle')}</span>
      </div>
      <div className="scoring-summary-grid">
        <div className="scoring-item">
          <b>{scoring.exact}</b>
          <span>{t('scoring.exact')}</span>
        </div>
        <div className="scoring-item">
          <b>{scoring.result}</b>
          <span>{t('scoring.result')}</span>
        </div>
        <div className="scoring-item">
          <b>+{scoring.goalDiff}</b>
          <span>{t('scoring.goal_diff')}</span>
        </div>
        <div className="scoring-item">
          <b>{scoring.champion}</b>
          <span>{t('scoring.champion')}</span>
        </div>
        <div className="scoring-item">
          <b>{scoring.runnerUp}</b>
          <span>{t('scoring.runner_up')}</span>
        </div>
        <div className="scoring-item">
          <b>{scoring.topScorer}</b>
          <span>{t('scoring.top_scorer')}</span>
        </div>
      </div>
      {specialLockLabel ? (
        <div className="scoring-summary-note">
          {t('scoring.special_lock', { date: specialLockLabel })}
        </div>
      ) : null}
    </section>
  );
}
