import SourceLink from './SourceLink';

// מפצל טקסט לפי קישורים. כל URL מוצג כאייקון מקור לחיץ (SourceLink) במקום טקסט.
const URL_SPLIT = /(https?:\/\/[^\s)]+)/g;
const isUrl = (s) => /^https?:\/\//.test(s);

export default function RichText({ children, size = 15 }) {
  const text = children == null ? '' : String(children);
  if (!text) return null;
  if (text.indexOf('http') === -1) return text;
  const parts = text.split(URL_SPLIT);
  return parts.map((p, i) => {
    if (!p) return null;
    if (isUrl(p)) {
      const clean = p.replace(/[).,;]+$/, ''); // ניקוי סימני פיסוק נגררים
      return <SourceLink key={i} url={clean} size={size} label={clean} />;
    }
    return <span key={i}>{p}</span>;
  });
}
