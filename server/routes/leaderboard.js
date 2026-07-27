// טבלת מצטיינים (async/MySQL) — עם סינון אופציונלי לפי רבעון (?quarter=2026-Q3 או 'current')
const express = require('express');
const { leaderboard, currentQuarter } = require('../services/scoring');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
  try {
    let quarter = String(req.query.quarter || '').trim() || null;
    if (quarter === 'current') quarter = currentQuarter();
    const rows = await leaderboard({ quarter });
    res.json(rows);
  } catch (e) {
    console.error('leaderboard:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
