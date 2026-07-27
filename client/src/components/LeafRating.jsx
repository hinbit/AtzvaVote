import { useTranslation } from '../i18n/TranslationContext';

// עלה קנאביס בודד — מבוסס על רעיון העלה של CoinIcon (7 עלעלים, הפנימיים ארוכים יותר)
function LeafIcon({ size = 20, filled = false }) {
  const tips = [-75, -50, -25, 0, 25, 50, 75];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      <g
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.1}
      >
        {tips.map((a, i) => {
          const len = 1 - Math.abs(a) / 110; // עלעלים קצרים יותר בקצוות
          const tipY = 20 - (15 * len + 2);
          return (
            <path
              key={i}
              d={`M12 20 Q10.6 12 12 ${tipY} Q13.4 12 12 20 Z`}
              transform={`rotate(${a} 12 20)`}
            />
          );
        })}
        <rect x="11.45" y="15" width="1.1" height="6" rx="0.55" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

const LEVELS = [1, 2, 3, 4, 5];

// דירוג 1-5 בעלי קנאביס.
// value: הערך הנוכחי (בקריאה-בלבד — מעוגל לתצוגה), onChange(n) בעת בחירה.
// sizes: sm / lg. readOnly: תצוגת ממוצע/תוצאה ללא אינטראקציה.
export default function LeafRating({
  value = 0,
  onChange,
  size = 'sm',
  readOnly = false,
  disabled = false,
  label = '',
  className = ''
}) {
  const { t } = useTranslation();
  const current = Math.round(Number(value) || 0);
  const px = size === 'lg' ? 30 : 20;
  const groupLabel = label || t('rate.rating_label');

  if (readOnly) {
    return (
      <span
        className={`leaf-rating leaf-rating-${size} readonly ${className}`}
        role="img"
        aria-label={`${groupLabel}: ${current}/5`}
        title={`${current}/5`}
      >
        {LEVELS.map((n) => (
          <span key={n} className={`leaf-item ${n <= current ? 'filled' : 'empty'}`}>
            <LeafIcon size={px} filled={n <= current} />
          </span>
        ))}
      </span>
    );
  }

  return (
    <div
      className={`leaf-rating leaf-rating-${size} ${disabled ? 'disabled' : ''} ${className}`}
      role="radiogroup"
      aria-label={groupLabel}
    >
      {LEVELS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={String(n)}
          title={String(n)}
          className={`leaf-btn ${n <= current ? 'filled' : 'empty'}`}
          disabled={disabled}
          onClick={() => onChange && onChange(n)}
        >
          <LeafIcon size={px} filled={n <= current} />
        </button>
      ))}
    </div>
  );
}
