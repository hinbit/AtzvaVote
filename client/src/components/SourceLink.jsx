// קישור מקור כאייקון לוגו (favicon) במקום טקסט — לחיץ ונפתח בלשונית חדשה
export default function SourceLink({ url, size = 18, label }) {
  if (!url) return null;
  let host = '';
  try { host = new URL(url).hostname; } catch { return null; }
  const fav = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="source-link" title={label || host}>
      <img src={fav} alt={label || host} width={size} height={size}
        onError={e => { e.currentTarget.replaceWith(document.createTextNode('🔗')); }} />
    </a>
  );
}
