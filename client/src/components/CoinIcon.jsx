// מטבע "שיחים" — עלה קנאביס מוזהב
export default function CoinIcon({ size = 16, title }) {
  const tips = [-75, -50, -25, 0, 25, 50, 75];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ verticalAlign: '-0.18em', flex: 'none' }}
    >
      <circle cx="12" cy="12" r="11" fill="#e6b54a" stroke="#a9781a" strokeWidth="1.4" />
      <g fill="#6b4e0c">
        {tips.map((a, i) => {
          // עלעלים פנימיים קצרים יותר בקצוות — צורת עלה קנאביס
          const len = 1 - Math.abs(a) / 110; // 0..1
          const tipY = 19 - (14 * len + 2);
          return (
            <path
              key={i}
              d={`M12 19 Q10.7 ${12} 12 ${tipY} Q13.3 ${12} 12 19 Z`}
              transform={`rotate(${a} 12 19)`}
            />
          );
        })}
        <rect x="11.4" y="14" width="1.2" height="5.5" rx="0.6" />
      </g>
    </svg>
  );
}
