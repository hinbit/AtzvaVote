// שלבי מחזור החיים של אצווה — תואם server/data/stages.js
export const BATCH_STAGES = [
  { key: 'growing',    label_he: 'גידול',   label_en: 'Growing',    label_ar: 'زراعة',   order: 0, emoji: '🌱' },
  { key: 'processing', label_he: 'עיבוד',   label_en: 'Processing', label_ar: 'معالجة',  order: 1, emoji: '✂️' },
  { key: 'curing',     label_he: 'יישון',   label_en: 'Curing',     label_ar: 'تعتيق',   order: 2, emoji: '🫙' },
  { key: 'factory',    label_he: 'מפעל',    label_en: 'Factory',    label_ar: 'مصنع',    order: 3, emoji: '🏭' },
  { key: 'marketing',  label_he: 'שיווק',   label_en: 'Marketing',  label_ar: 'تسويق',   order: 4, emoji: '📣' },
  { key: 'sales',      label_he: 'מכירות',  label_en: 'Sales',      label_ar: 'مبيعات',  order: 5, emoji: '🛒' }
];

// קריטריוני דירוג מוצר (רמה 2) וקרבות השוואה — תואם server/data/stages.js
export const PRODUCT_CRITERIA = [
  { key: 'effect',         label_he: 'השפעה',       label_en: 'Effect',         label_ar: 'تأثير' },
  { key: 'uniformity',     label_he: 'אחידות',      label_en: 'Uniformity',     label_ar: 'تجانس' },
  { key: 'cost_effective', label_he: 'משתלמות',     label_en: 'Cost-effective', label_ar: 'قيمة مقابل السعر' },
  { key: 'flower_shape',   label_he: 'צורת הפרחים', label_en: 'Flower shape',   label_ar: 'شكل الزهور' },
  { key: 'smell',          label_he: 'ריח',         label_en: 'Smell',          label_ar: 'رائحة' },
  { key: 'taste',          label_he: 'טעם',         label_en: 'Taste',          label_ar: 'طعم' },
  { key: 'overall',        label_he: 'כללי',        label_en: 'Overall',        label_ar: 'عام' }
];

export function getStageMeta(stage) {
  return BATCH_STAGES.find((item) => item.key === stage) || null;
}

export function stageLabel(stage, lang = 'he') {
  const meta = getStageMeta(stage);
  if (!meta) return stage || '';
  return meta[`label_${lang}`] || meta.label_he || meta.label_en || meta.label_ar || stage;
}

// תווית תחנה לפי מפתח התרגום הקנוני stages.<key>, עם נסיגה לתווית המקומית
// (t מחזיר את המפתח עצמו כשאין תרגום — במקרה כזה משתמשים בתווית מה-lib)
export function stageDisplay(t, stage, lang = 'he') {
  const key = `stages.${stage}`;
  const translated = t(key);
  return translated === key ? stageLabel(stage, lang) : translated;
}

export function criterionLabel(criterion, lang = 'he') {
  const meta = PRODUCT_CRITERIA.find((item) => item.key === criterion);
  if (!meta) return criterion || '';
  return meta[`label_${lang}`] || meta.label_he || meta.label_en || meta.label_ar || criterion;
}
