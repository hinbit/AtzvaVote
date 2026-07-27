import { useTranslation } from '../i18n/TranslationContext';

// תגי הישג קטנים — לשימוש חוזר בלוח הקבוצות ובפרופיל.
// משתמשים בקומפוננטה הזו עבור קבוצות (rank/winning) ועבור משתמשים (groups_count).

export function GroupBadge({ rank }) {
  const { t } = useTranslation();
  if (rank === 1) {
    return <span className="gg-badge gg-badge-gold" title={t('gg.badge_top_group')}>👑 {t('gg.badge_top_group')}</span>;
  }
  if (rank === 2) return <span className="gg-badge gg-badge-silver" title="#2">🥈</span>;
  if (rank === 3) return <span className="gg-badge gg-badge-bronze" title="#3">🥉</span>;
  return null;
}

// תגים למשתמש לפי הסטטיסטיקות הקבוצתיות שלו
export function UserGroupBadges({ groupsCount = 0, isTopScorer = false }) {
  const { t } = useTranslation();
  const badges = [];
  if (isTopScorer) {
    badges.push(<span key="top" className="gg-badge gg-badge-gold" title={t('gg.badge_top_user')}>🏆 {t('gg.badge_top_user')}</span>);
  }
  if (groupsCount >= 3) {
    badges.push(<span key="many" className="gg-badge gg-badge-blue" title={t('gg.badge_many_groups')}>🎯 {t('gg.badge_many_groups')}</span>);
  }
  if (!badges.length) return null;
  return <span className="gg-badge-row">{badges}</span>;
}

export default GroupBadge;
