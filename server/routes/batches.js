// נתיבי אצוות (async/MySQL) — רשימת האצוות, רבעונים ופרטי אצווה בודדת
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { BATCH_STAGES } = require('../data/stages');

const router = express.Router();

// כל האצוות (ללא מבוטלות) + ממוצע דירוגים, כמות דירוגים והדירוג של המשתמש המחובר
router.get('/', auth(), async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT b.*,
        (SELECT AVG(r.rating) FROM batch_ratings r WHERE r.batch_id = b.id) AS avg_rating,
        (SELECT COUNT(*) FROM batch_ratings r WHERE r.batch_id = b.id) AS ratings_count,
        mr.rating AS my_rating,
        mr.stage AS my_stage
      FROM batches b
      LEFT JOIN batch_ratings mr ON mr.batch_id = b.id AND mr.user_id = ?
      WHERE b.status <> 'cancelled'
      ORDER BY (b.status = 'active') DESC, b.started_at DESC, b.id DESC
    `, [req.user.id]);
    for (const b of rows) {
      b.avg_rating = b.avg_rating == null ? null : Math.round(Number(b.avg_rating) * 100) / 100;
      b.ratings_count = Number(b.ratings_count || 0);
    }
    res.json(rows);
  } catch (e) {
    console.error('batches:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// רשימת הרבעונים הקיימים (לסינון המשחק הרבעוני)
router.get('/quarters', auth(), async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT DISTINCT quarter
      FROM batches
      WHERE quarter IS NOT NULL AND status <> 'cancelled'
      ORDER BY quarter DESC
    `);
    res.json(rows.map((r) => r.quarter));
  } catch (e) {
    console.error('batches/quarters:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// אצווה בודדת + ממוצעי דירוג לפי תחנה
router.get('/:id', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'אצווה לא תקינה' });
    }
    const batch = await db.one('SELECT * FROM batches WHERE id = ?', [id]);
    if (!batch || batch.status === 'cancelled') {
      return res.status(404).json({ error: 'האצווה לא נמצאה' });
    }

    // ממוצע וכמות דירוגים לכל תחנה — ממוין לפי סדר השלבים במחזור החיים
    const stageRows = await db.query(`
      SELECT stage, AVG(rating) AS avg, COUNT(*) AS count
      FROM batch_ratings
      WHERE batch_id = ?
      GROUP BY stage
    `, [id]);
    const stageOrder = new Map(BATCH_STAGES.map((s) => [s.key, s.order]));
    const stage_averages = stageRows
      .map((r) => ({
        stage: r.stage,
        avg: r.avg == null ? null : Math.round(Number(r.avg) * 100) / 100,
        count: Number(r.count || 0)
      }))
      .sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99));

    const totalRow = await db.one(
      'SELECT COUNT(*) AS n FROM batch_ratings WHERE batch_id = ?', [id]);
    const mine = await db.one(
      'SELECT rating FROM batch_ratings WHERE batch_id = ? AND user_id = ?',
      [id, req.user.id]);

    res.json({
      ...batch,
      stage_averages,
      ratings_count: Number(totalRow?.n || 0),
      my_rating: mine ? mine.rating : null
    });
  } catch (e) {
    console.error('batch:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
