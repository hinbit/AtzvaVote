import { useTranslation } from '../i18n/TranslationContext';
import { useTheme } from '../context/ThemeContext';

// קטלוג 10 תגי ההישג של טבלת המצטיינים.
// השרת מחזיר עבור כל משתמש מערך מזהי-תגים (r.badges); כאן ממפים מזהה → אימוג'י + תרגום.
// התגים דינמיים: מתעדכנים בכל סיום משחק, כך שאפשר לזכות/לאבד תג בכל מחזור.
export const BADGE_CATALOG = {
  crown:         { emoji: '👑', cls: 'gold'   },
  leader:        { emoji: '🏆', cls: 'gold'   },
  oracle:        { emoji: '🧠', cls: 'blue'   },
  goal_machine:  { emoji: '⚽', cls: 'green'  },
  sharpshooter:  { emoji: '🎯', cls: 'red'    },
  streak:        { emoji: '🔥', cls: 'orange' },
  perfectionist: { emoji: '💎', cls: 'blue'   },
  dedicated:     { emoji: '🦅', cls: 'green'  },
  centurion:     { emoji: '💯', cls: 'red'    },
  prophet:       { emoji: '⭐', cls: 'gold'   }
};

export const BADGE_ORDER = [
  'crown', 'leader', 'oracle', 'goal_machine', 'sharpshooter',
  'streak', 'perfectionist', 'dedicated', 'centurion', 'prophet'
];

export default function LeaderboardBadges({ badges, size = 'sm' }) {
  const { t } = useTranslation();
  const { badgeImages } = useTheme();
  if (!badges || !badges.length) return null;
  // השרת מחזיר אובייקטים {id, emoji} (אימוג'י מותאם בלוח הניהול); תומך גם במחרוזות.
  const byId = new Map();
  for (const b of badges) {
    if (typeof b === 'string') byId.set(b, BADGE_CATALOG[b]?.emoji);
    else if (b && b.id) byId.set(b.id, b.emoji || BADGE_CATALOG[b.id]?.emoji);
  }
  const ordered = BADGE_ORDER.filter(id => byId.has(id));
  if (!ordered.length) return null;
  return (
    <span className={`lb-badges lb-badges-${size}`}>
      {ordered.map(id => {
        const meta = BADGE_CATALOG[id];
        const title = `${t(`badge.${id}.name`)} — ${t(`badge.${id}.desc`)}`;
        const img = badgeImages?.[id];
        return (
          <span key={id} className={`lb-badge lb-badge-${meta?.cls || 'gold'}`} title={title}>
            {img
              ? <img className="lb-badge-img" src={img} alt={t(`badge.${id}.name`)} />
              : (byId.get(id) || meta?.emoji)}
          </span>
        );
      })}
    </span>
  );
}
