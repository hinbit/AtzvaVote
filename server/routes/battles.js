// נתיבי קרבות השוואה (ראש-בראש) — נושא א' מול נושא ב' על סט קריטריונים, הרוב קובע
const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { isValidCriterion } = require('../data/stages');

const router = express.Router();

// עמודת criteria נשמרת כ-JSON (TEXT) → מערך מפתחות
function parseCriteria(text) {
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.filter(c => typeof c === 'string') : [];
  } catch (e) {
    return [];
  }
}

// המרת קלט תאריך (ISO / מחרוזת) לפורמט DATETIME של MySQL (UTC), או null
function toMysqlDatetime(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// האם מועד הסגירה עבר (התאריכים נשמרים ומוחזרים כ-UTC, ראו db.js)
function closesAtPassed(closesAt) {
  if (!closesAt) return false;
  const s = String(closesAt);
  const t = new Date(s.endsWith('Z') ? s : `${s.replace(' ', 'T')}Z`).getTime();
  return !Number.isNaN(t) && Date.now() >= t;
}

// ספירת קולות לקרב → { tallies, myVotes, totalVoters }
function summarizeVotes(voteRows, userId) {
  const tallies = {};
  const myVotes = {};
  const voters = new Set();
  for (const v of voteRows) {
    if (!tallies[v.criterion]) tallies[v.criterion] = { a: 0, b: 0 };
    tallies[v.criterion][v.pick] += 1;
    voters.add(v.user_id);
    if (v.user_id === userId) myVotes[v.criterion] = v.pick;
  }
  return { tallies, myVotes, totalVoters: voters.size };
}

// מוביל בכל קריטריון + ניקוד כולל (בכמה קריטריונים כל צד מוביל) — שלטון הרוב
function computeLeaders(criteria, tallies) {
  const leaders = {};
  const overall = { a: 0, b: 0 };
  for (const c of criteria) {
    const t = tallies[c] || { a: 0, b: 0 };
    if (t.a > t.b) { leaders[c] = 'a'; overall.a += 1; }
    else if (t.b > t.a) { leaders[c] = 'b'; overall.b += 1; }
    else leaders[c] = null; // תיקו או ללא קולות
  }
  return { leaders, overall };
}

// ───────── רשימת קרבות: פתוחים תחילה, עם ספירות והקולות שלי ─────────
router.get('/', auth(), async (req, res) => {
  try {
    const battles = await db.query(`
      SELECT * FROM battles
      ORDER BY (status = 'open') DESC, created_at DESC, id DESC
    `);

    const ids = battles.map(b => b.id);
    let votes = [];
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      votes = await db.query(
        `SELECT battle_id, user_id, criterion, pick FROM battle_votes WHERE battle_id IN (${ph})`,
        ids
      );
    }
    const byBattle = new Map();
    for (const v of votes) {
      if (!byBattle.has(v.battle_id)) byBattle.set(v.battle_id, []);
      byBattle.get(v.battle_id).push(v);
    }

    const result = battles.map(b => {
      const criteria = parseCriteria(b.criteria);
      const { tallies, myVotes, totalVoters } = summarizeVotes(byBattle.get(b.id) || [], req.user.id);
      const { leaders, overall } = computeLeaders(criteria, tallies);
      return {
        ...b,
        criteria,
        tallies,
        my_votes: myVotes,
        total_voters: totalVoters,
        leaders,
        overall_score: overall
      };
    });

    res.json(result);
  } catch (e) {
    console.error('battles/list:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── הצבעה בקרב: בחירת צד לקריטריון ─────────
// מוגדר לפני נתיבי '/:id' הגנריים כדי שלא יוסתר
router.post('/:id/vote', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const criterion = String(req.body?.criterion || '');
    const pick = String(req.body?.pick || '');

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });
    if (pick !== 'a' && pick !== 'b') return res.status(400).json({ error: 'בחירה לא תקינה' });

    const battle = await db.one('SELECT id, status, closes_at, criteria FROM battles WHERE id = ?', [id]);
    if (!battle) return res.status(404).json({ error: 'קרב לא נמצא' });
    if (battle.status !== 'open' || closesAtPassed(battle.closes_at)) {
      return res.status(403).json({ error: 'הקרב סגור להצבעה' });
    }
    if (!parseCriteria(battle.criteria).includes(criterion)) {
      return res.status(400).json({ error: 'קריטריון לא שייך לקרב זה' });
    }

    await db.run(`
      INSERT INTO battle_votes (battle_id, user_id, criterion, pick)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE pick = VALUES(pick)
    `, [id, req.user.id, criterion, pick]);

    res.json({ ok: true });
  } catch (e) {
    console.error('battles/vote:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── יצירת קרב (מנהל בלבד) ─────────
router.post('/', auth(), adminOnly, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const subjectA = String(req.body?.subject_a_label || '').trim();
    const subjectB = String(req.body?.subject_b_label || '').trim();
    const criteria = req.body?.criteria;

    if (!title) return res.status(400).json({ error: 'חסרה כותרת' });
    if (!subjectA || !subjectB) return res.status(400).json({ error: 'חסרים שני נושאי הקרב' });
    if (!Array.isArray(criteria) || !criteria.length) {
      return res.status(400).json({ error: 'יש לבחור לפחות קריטריון אחד' });
    }
    const invalid = criteria.filter(c => !isValidCriterion(c));
    if (invalid.length) {
      return res.status(400).json({ error: `קריטריונים לא חוקיים: ${invalid.join(', ')}` });
    }

    const r = await db.run(`
      INSERT INTO battles
        (title, subject_a_label, subject_b_label, subject_a_product_id, subject_b_product_id,
         subject_a_image, subject_b_image, criteria, status, created_by, closes_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `, [
      title,
      subjectA,
      subjectB,
      req.body?.subject_a_product_id || null,
      req.body?.subject_b_product_id || null,
      req.body?.subject_a_image || null,
      req.body?.subject_b_image || null,
      JSON.stringify(criteria),
      req.user.id,
      toMysqlDatetime(req.body?.closes_at)
    ]);

    const battle = await db.one('SELECT * FROM battles WHERE id = ?', [r.insertId]);
    if (battle) battle.criteria = parseCriteria(battle.criteria);
    res.json({ ok: true, battle });
  } catch (e) {
    console.error('battles/create:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── עדכון/סגירת קרב (מנהל בלבד) ─────────
// בסגירה (status='closed') מחושב המנצח לפי רוב הקריטריונים שבהם כל צד מוביל
router.patch('/:id', auth(), adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });

    const battle = await db.one('SELECT * FROM battles WHERE id = ?', [id]);
    if (!battle) return res.status(404).json({ error: 'קרב לא נמצא' });

    const sets = [];
    const params = [];
    const strFields = ['title', 'subject_a_label', 'subject_b_label',
      'subject_a_product_id', 'subject_b_product_id', 'subject_a_image', 'subject_b_image'];
    for (const f of strFields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(req.body[f] === null || req.body[f] === '' ? null : String(req.body[f]));
      }
    }
    if (req.body.criteria !== undefined) {
      const criteria = req.body.criteria;
      if (!Array.isArray(criteria) || !criteria.length || criteria.some(c => !isValidCriterion(c))) {
        return res.status(400).json({ error: 'רשימת קריטריונים לא תקינה' });
      }
      sets.push('criteria = ?');
      params.push(JSON.stringify(criteria));
    }
    if (req.body.closes_at !== undefined) {
      sets.push('closes_at = ?');
      params.push(toMysqlDatetime(req.body.closes_at));
    }

    if (req.body.status === 'closed') {
      // חישוב המנצח: רוב הקריטריונים שבהם צד מוביל
      const criteria = Array.isArray(req.body.criteria) && req.body.criteria.length
        ? req.body.criteria
        : parseCriteria(battle.criteria);
      const votes = await db.query(
        'SELECT battle_id, user_id, criterion, pick FROM battle_votes WHERE battle_id = ?', [id]);
      const { tallies } = summarizeVotes(votes, 0);
      const { overall } = computeLeaders(criteria, tallies);
      const winner = overall.a > overall.b ? 'a' : overall.b > overall.a ? 'b' : 'tie';
      sets.push(`status = 'closed'`, 'winner = ?');
      params.push(winner);
    } else if (req.body.status === 'open') {
      sets.push(`status = 'open'`, 'winner = NULL');
    }

    if (!sets.length) return res.status(400).json({ error: 'אין שדות לעדכון' });

    params.push(id);
    await db.run(`UPDATE battles SET ${sets.join(', ')} WHERE id = ?`, params);

    const updated = await db.one('SELECT * FROM battles WHERE id = ?', [id]);
    if (updated) updated.criteria = parseCriteria(updated.criteria);
    res.json({ ok: true, battle: updated });
  } catch (e) {
    console.error('battles/update:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── מחיקת קרב (מנהל בלבד) — הקולות נמחקים בקסקדה ─────────
router.delete('/:id', auth(), adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });
    const r = await db.run('DELETE FROM battles WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'קרב לא נמצא' });
    res.json({ ok: true });
  } catch (e) {
    console.error('battles/delete:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
