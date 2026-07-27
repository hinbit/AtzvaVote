// שלבי מחזור החיים של אצווה — כל עובד מדרג את האצווה בתחנה שלו
const BATCH_STAGES = [
  { key: 'growing',    label_he: 'גידול',   label_en: 'Growing',    label_ar: 'زراعة',   order: 0 },
  { key: 'processing', label_he: 'עיבוד',   label_en: 'Processing', label_ar: 'معالجة',  order: 1 },
  { key: 'curing',     label_he: 'יישון',   label_en: 'Curing',     label_ar: 'تعتيق',   order: 2 },
  { key: 'factory',    label_he: 'מפעל',    label_en: 'Factory',    label_ar: 'مصنع',    order: 3 },
  { key: 'marketing',  label_he: 'שיווק',   label_en: 'Marketing',  label_ar: 'تسويق',   order: 4 },
  { key: 'sales',      label_he: 'מכירות',  label_en: 'Sales',      label_ar: 'مبيعات',  order: 5 }
];

// קריטריוני דירוג מוצר (רמה 2) וקרבות השוואה
const PRODUCT_CRITERIA = [
  { key: 'effect',         label_he: 'השפעה',        label_en: 'Effect',         label_ar: 'تأثير' },
  { key: 'uniformity',     label_he: 'אחידות',       label_en: 'Uniformity',     label_ar: 'تجانس' },
  { key: 'cost_effective', label_he: 'משתלמות',      label_en: 'Cost-effective', label_ar: 'قيمة مقابل السعر' },
  { key: 'flower_shape',   label_he: 'צורת הפרחים',  label_en: 'Flower shape',   label_ar: 'شكل الزهور' },
  { key: 'smell',          label_he: 'ריח',          label_en: 'Smell',          label_ar: 'رائحة' },
  { key: 'taste',          label_he: 'טעם',          label_en: 'Taste',          label_ar: 'طعم' },
  { key: 'overall',        label_he: 'כללי',         label_en: 'Overall',        label_ar: 'عام' }
];

function getStageMeta(stage) {
  return BATCH_STAGES.find((item) => item.key === stage) || null;
}

function stageLabel(stage, lang = 'he') {
  const meta = getStageMeta(stage);
  if (!meta) return stage || '';
  return meta[`label_${lang}`] || meta.label_he || meta.label_en || meta.label_ar || stage;
}

function isValidStage(stage) {
  return BATCH_STAGES.some((item) => item.key === stage);
}

function isValidCriterion(criterion) {
  return PRODUCT_CRITERIA.some((item) => item.key === criterion);
}

module.exports = { BATCH_STAGES, PRODUCT_CRITERIA, getStageMeta, stageLabel, isValidStage, isValidCriterion };
