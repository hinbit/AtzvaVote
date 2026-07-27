// נתיבי מוצרים (רמה 2) — קטלוג מקומי מסונכרן מ-Seach + דירוג לפי קריטריונים
const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { isValidCriterion } = require('../data/stages');
const { syncProducts } = require('../services/seachApi');

const router = express.Router();

// ממוצעים לפי קריטריון עבור קבוצת מוצרים → Map(product_id → { criterion: { avg, count } })
async function avgRatingsFor(productIds) {
  const map = new Map();
  if (!productIds.length) return map;
  const ph = productIds.map(() => '?').join(',');
  const rows = await db.query(`
    SELECT product_id, criterion, AVG(rating) AS avg, COUNT(*) AS count
    FROM product_ratings
    WHERE product_id IN (${ph})
    GROUP BY product_id, criterion
  `, productIds);
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, {});
    map.get(r.product_id)[r.criterion] = {
      avg: Math.round(Number(r.avg) * 100) / 100,
      count: Number(r.count)
    };
  }
  return map;
}

// הדירוגים שלי עבור קבוצת מוצרים → Map(product_id → { criterion: rating })
async function myRatingsFor(userId, productIds) {
  const map = new Map();
  if (!productIds.length) return map;
  const ph = productIds.map(() => '?').join(',');
  const rows = await db.query(`
    SELECT product_id, criterion, rating
    FROM product_ratings
    WHERE user_id = ? AND product_id IN (${ph})
  `, [userId, ...productIds]);
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, {});
    map.get(r.product_id)[r.criterion] = Number(r.rating);
  }
  return map;
}

// ───────── סנכרון קטלוג מהמקור החיצוני (מנהל בלבד) ─────────
router.post('/sync', auth(), adminOnly, async (req, res) => {
  try {
    const synced = await syncProducts(db);
    res.json({ synced });
  } catch (e) {
    console.error('products/sync:', e);
    res.status(500).json({ error: e.message || 'שגיאת שרת' });
  }
});

// ───────── רשימת מוצרים פעילים + חיפוש/סינון ─────────
router.get('/', auth(), async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const category = String(req.query.category || '').trim();

    const where = ['p.active = 1'];
    const params = [];
    if (query) {
      const like = `%${query}%`;
      where.push('(p.name_he LIKE ? OR p.name_en LIKE ? OR p.brand LIKE ?)');
      params.push(like, like, like);
    }
    if (category) {
      where.push('p.category = ?');
      params.push(category);
    }

    const products = await db.query(`
      SELECT p.*
      FROM products p
      WHERE ${where.join(' AND ')}
      ORDER BY p.name_he ASC
      LIMIT 200
    `, params);

    const ids = products.map(p => p.id);
    const [avgMap, myMap, catRows] = await Promise.all([
      avgRatingsFor(ids),
      myRatingsFor(req.user.id, ids),
      db.query(`SELECT DISTINCT category FROM products WHERE active = 1 AND category IS NOT NULL AND category <> '' ORDER BY category`)
    ]);

    for (const p of products) {
      p.avg_ratings = avgMap.get(p.id) || {};
      p.my_ratings = myMap.get(p.id) || {};
    }

    res.json({ products, categories: catRows.map(r => r.category) });
  } catch (e) {
    console.error('products/list:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── מוצר בודד + ממוצעים + הדירוג שלי ─────────
router.get('/:id', auth(), async (req, res) => {
  try {
    const id = String(req.params.id);
    const product = await db.one('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ error: 'מוצר לא נמצא' });

    const [avgMap, myMap, raters] = await Promise.all([
      avgRatingsFor([id]),
      myRatingsFor(req.user.id, [id]),
      db.one('SELECT COUNT(DISTINCT user_id) AS n FROM product_ratings WHERE product_id = ?', [id])
    ]);

    product.avg_ratings = avgMap.get(id) || {};
    product.my_ratings = myMap.get(id) || {};
    product.raters_count = Number(raters?.n || 0);

    res.json(product);
  } catch (e) {
    console.error('products/one:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── דירוג מוצר: ציון 1-5 לכל קריטריון + תגובה אופציונלית ─────────
router.post('/:id/rate', auth(), async (req, res) => {
  try {
    const id = String(req.params.id);
    const ratings = req.body?.ratings;
    const comment = req.body?.comment ? String(req.body.comment).trim().slice(0, 500) : null;

    if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
      return res.status(400).json({ error: 'לא התקבלו דירוגים' });
    }

    // סינון לקריטריונים חוקיים עם ציון שלם 1-5 בלבד
    const entries = [];
    for (const [criterion, value] of Object.entries(ratings)) {
      if (!isValidCriterion(criterion)) continue;
      const rating = Number(value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
      entries.push({ criterion, rating });
    }
    if (!entries.length) return res.status(400).json({ error: 'אין דירוגים תקינים' });

    const product = await db.one('SELECT id FROM products WHERE id = ? AND active = 1', [id]);
    if (!product) return res.status(404).json({ error: 'מוצר לא נמצא' });

    // התגובה נשמרת פעם אחת — על שורת 'overall' אם דורגה, אחרת על הקריטריון הראשון
    const commentCriterion = entries.some(e => e.criterion === 'overall')
      ? 'overall'
      : entries[0].criterion;

    await db.tx(async (t) => {
      for (const { criterion, rating } of entries) {
        const rowComment = criterion === commentCriterion ? comment : null;
        await t.run(`
          INSERT INTO product_ratings (user_id, product_id, criterion, rating, comment)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            rating     = VALUES(rating),
            comment    = VALUES(comment),
            updated_at = CURRENT_TIMESTAMP
        `, [req.user.id, id, criterion, rating, rowComment]);
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('products/rate:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
