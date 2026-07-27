// נתיבי דירוגי אצווה (async/MySQL) — הניחוש האישי של כל עובד על איכות האצווה
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { isValidStage } = require('../data/stages');
const { leaderboard, userTotalPoints, userAvailablePoints } = require('../services/scoring');

const router = express.Router();

async function getSetting(key, def) {
  const r = await db.one('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return r ? r.value : def;
}

// מיפוי מחלקה → תחנת דירוג (הגדרה department_stages, JSON)
async function departmentStageFor(department) {
  if (!department) return null;
  const raw = await getSetting('department_stages', null);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw);
    const stage = map?.[department];
    return isValidStage(stage) ? stage : null;
  } catch {
    return null;
  }
}

// כל הדירוגים של המשתמש המחובר (עם פרטי האצווה)
router.get('/my', auth(), async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT r.*,
        b.code, b.name, b.stage AS batch_stage, b.status, b.outcome_level, b.quarter,
        (SELECT COUNT(*) FROM rating_history h
           WHERE h.user_id = r.user_id AND h.batch_id = r.batch_id) AS edit_count
      FROM batch_ratings r
      JOIN batches b ON b.id = r.batch_id
      WHERE r.user_id = ?
      ORDER BY (b.status = 'active') DESC, b.started_at DESC, b.id DESC
    `, [req.user.id]);
    for (const r of rows) r.edit_count = Number(r.edit_count || 0);
    res.json(rows);
  } catch (e) {
    console.error('ratings/my:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// סטטיסטיקות המשתמש המחובר — לעמוד הפרופיל
router.get('/stats', auth(), async (req, res) => {
  try {
    const exactWeight = Number(await getSetting('scoring_exact', 5));
    const closeWeight = Number(await getSetting('scoring_close', 2));

    const agg = await db.one(`
      SELECT
        COUNT(r.id) AS num_ratings,
        SUM(CASE WHEN r.points = ? THEN 1 ELSE 0 END) AS exact_hits,
        SUM(CASE WHEN r.points > 0 AND r.points < ? THEN 1 ELSE 0 END) AS close_hits,
        SUM(CASE WHEN b.status = 'finished' AND b.outcome_level IS NOT NULL AND r.points = 0 THEN 1 ELSE 0 END) AS misses,
        SUM(CASE WHEN b.status = 'finished' AND b.outcome_level IS NOT NULL THEN 1 ELSE 0 END) AS resolved_count
      FROM batch_ratings r
      JOIN batches b ON b.id = r.batch_id
      WHERE r.user_id = ?
    `, [exactWeight, exactWeight, req.user.id]);

    const totalPoints = await userTotalPoints(req.user.id);
    const availablePoints = await userAvailablePoints(req.user.id);

    // דירוג אישי מתוך לוח המצטיינים הראשי
    const board = await leaderboard();
    const myRow = board.find((r) => r.id === req.user.id) || null;

    // אם משקל "קרוב" שווה למדויק (משקלים חריגים) — אל תספור פעמיים
    let closeHits = Number(agg?.close_hits || 0);
    if (closeWeight === exactWeight) closeHits = 0;

    res.json({
      num_ratings:      Number(agg?.num_ratings || 0),
      exact_hits:       Number(agg?.exact_hits || 0),
      close_hits:       closeHits,
      misses:           Number(agg?.misses || 0),
      resolved_count:   Number(agg?.resolved_count || 0),
      total_points:     totalPoints,
      available_points: availablePoints,
      rank:             myRow ? myRow.rank : null
    });
  } catch (e) {
    console.error('ratings/stats:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// הזנת/עדכון דירוג לאצווה
router.post('/batch/:id', auth(), async (req, res) => {
  try {
    const batchId = Number(req.params.id);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return res.status(400).json({ error: 'אצווה לא תקינה' });
    }
    const { rating, stage } = req.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'דירוג לא תקין — יש לבחור בין 1 ל-5' });
    }

    const batch = await db.one('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) return res.status(404).json({ error: 'האצווה לא נמצאה' });
    if (batch.status !== 'active' || !Number(batch.rating_open)) {
      return res.status(403).json({ error: 'הדירוג לאצווה זו סגור' });
    }

    // קביעת התחנה: מהבקשה אם תקינה → לפי מיפוי המחלקה של המשתמש → ברירת מחדל
    let ratingStage = isValidStage(stage) ? stage : null;
    if (!ratingStage) {
      const me = await db.one('SELECT department FROM users WHERE id = ?', [req.user.id]);
      ratingStage = await departmentStageFor(me?.department);
    }
    if (!ratingStage) ratingStage = 'growing';

    const prev = await db.one(
      'SELECT rating, stage FROM batch_ratings WHERE user_id = ? AND batch_id = ?',
      [req.user.id, batchId]);

    await db.run(`
      INSERT INTO batch_ratings (user_id, batch_id, stage, rating)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        stage        = VALUES(stage),
        rating       = VALUES(rating),
        submitted_at = CURRENT_TIMESTAMP,
        points       = 0
    `, [req.user.id, batchId, ratingStage, rating]);

    // לוג שינוי: הגשה ראשונה, או כל פעם שהדירוג/התחנה באמת השתנו
    if (!prev || Number(prev.rating) !== rating || prev.stage !== ratingStage) {
      await db.run(
        'INSERT INTO rating_history (user_id, batch_id, stage, rating) VALUES (?, ?, ?, ?)',
        [req.user.id, batchId, ratingStage, rating]
      );
    }

    res.json({ ok: true, rating });
  } catch (e) {
    console.error('rate-batch:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// יומן השינויים של דירוג מסוים (לפי זמן) עבור המשתמש המחובר
router.get('/history/:batchId', auth(), async (req, res) => {
  try {
    const batchId = Number(req.params.batchId);
    if (!Number.isInteger(batchId)) return res.status(400).json({ error: 'אצווה לא תקינה' });
    const rows = await db.query(
      'SELECT stage, rating, changed_at FROM rating_history WHERE user_id = ? AND batch_id = ? ORDER BY changed_at ASC, id ASC',
      [req.user.id, batchId]
    );
    res.json({ batch_id: batchId, changes: rows, edit_count: rows.length });
  } catch (e) {
    console.error('ratings/history:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
