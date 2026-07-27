// תגי הישג להימורי מטבעות — מבוססי קונפיגורציה מהשרת (coin_badges)
export function CoinBadge({ badges }) {
  const list = Array.isArray(badges) ? badges : [];
  if (!list.length) return null;
  return (
    <span className="gg-badge-row">
      {list.map((b, i) => (
        <span key={i} className="gg-badge gg-badge-gold" title={b.label}>{b.emoji} {b.label}</span>
      ))}
    </span>
  );
}

export default CoinBadge;
