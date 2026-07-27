// נתיבי חנות הפרסים — פרסים בעד נקודות, פדיון ואישורי מנהל
const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const scoring = require('../services/scoring');

const router = express.Router();

const REDEMPTION_STATUSES = ['approved', 'delivered', 'cancelled'];

// ═════════ נתיבי מנהל — קידומת /admin נפרדת כדי שלא תתנגש עם '/:id/redeem' ═════════

// ───────── כל הפרסים כולל לא-פעילים + ספירת פדיונות ─────────
router.get('/admin/list', auth(), adminOnly, async (req, res) => {
  try {
    const prizes = await db.query(`
      SELECT p.*,
             (SELECT COUNT(*) FROM redemptions r WHERE r.prize_id = p.id AND r.status <> 'cancelled') AS redeemed_count
      FROM prizes p
      ORDER BY p.sort_order ASC, p.id ASC
    `);
    prizes.forEach(p => { p.redeemed_count = Number(p.redeemed_count); });
    res.json(prizes);
  } catch (e) {
    console.error('prizes/admin/list:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── כל הפדיונות עם שם משתמש ופרס, חדש→ישן ─────────
router.get('/admin/redemptions', auth(), adminOnly, async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT r.*,
             u.name AS user_name, u.email AS user_email, u.department AS user_department,
             p.name AS prize_name, p.image_url AS prize_image_url,
             h.name AS handled_by_name
      FROM redemptions r
      JOIN users u ON u.id = r.user_id
      JOIN prizes p ON p.id = r.prize_id
      LEFT JOIN users h ON h.id = r.handled_by
      ORDER BY r.created_at DESC, r.id DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('prizes/admin/redemptions:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── טיפול בפדיון: אישור / מסירה / ביטול (ביטול מחזיר את הנקודות) ─────────
router.patch('/admin/redemptions/:id', auth(), adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });
    if (!REDEMPTION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'סטטוס לא תקין' });
    }

    const row = await db.one('SELECT id FROM redemptions WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'פדיון לא נמצא' });

    await db.run(
      'UPDATE redemptions SET status = ?, handled_by = ?, handled_at = NOW() WHERE id = ?',
      [status, req.user.id, id]
    );
    const updated = await db.one('SELECT * FROM redemptions WHERE id = ?', [id]);
    res.json({ ok: true, redemption: updated });
  } catch (e) {
    console.error('prizes/admin/redemption-update:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── יצירת פרס ─────────
router.post('/admin', auth(), adminOnly, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const costPoints = Number(req.body?.cost_points);
    if (!name) return res.status(400).json({ error: 'חסר שם פרס' });
    if (!Number.isInteger(costPoints) || costPoints < 0) {
      return res.status(400).json({ error: 'עלות בנקודות לא תקינה' });
    }
    const stock = req.body?.stock === null || req.body?.stock === undefined || req.body?.stock === ''
      ? null
      : Number(req.body.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      return res.status(400).json({ error: 'מלאי לא תקין' });
    }

    const r = await db.run(`
      INSERT INTO prizes (name, description, image_url, cost_points, stock, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [
      name,
      req.body?.description ? String(req.body.description).slice(0, 500) : null,
      req.body?.image_url ? String(req.body.image_url).slice(0, 500) : null,
      costPoints,
      stock,
      Number.isInteger(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0
    ]);
    const prize = await db.one('SELECT * FROM prizes WHERE id = ?', [r.insertId]);
    res.json({ ok: true, prize });
  } catch (e) {
    console.error('prizes/admin/create:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── עדכון פרס כולל הפעלה/כיבוי ─────────
router.patch('/admin/:id', auth(), adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });

    const prize = await db.one('SELECT id FROM prizes WHERE id = ?', [id]);
    if (!prize) return res.status(404).json({ error: 'פרס לא נמצא' });

    const sets = [];
    const params = [];
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'חסר שם פרס' });
      sets.push('name = ?'); params.push(name);
    }
    if (req.body.description !== undefined) {
      sets.push('description = ?');
      params.push(req.body.description ? String(req.body.description).slice(0, 500) : null);
    }
    if (req.body.image_url !== undefined) {
      sets.push('image_url = ?');
      params.push(req.body.image_url ? String(req.body.image_url).slice(0, 500) : null);
    }
    if (req.body.cost_points !== undefined) {
      const cp = Number(req.body.cost_points);
      if (!Number.isInteger(cp) || cp < 0) return res.status(400).json({ error: 'עלות בנקודות לא תקינה' });
      sets.push('cost_points = ?'); params.push(cp);
    }
    if (req.body.stock !== undefined) {
      const stock = req.body.stock === null || req.body.stock === '' ? null : Number(req.body.stock);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
        return res.status(400).json({ error: 'מלאי לא תקין' });
      }
      sets.push('stock = ?'); params.push(stock);
    }
    if (req.body.sort_order !== undefined) {
      sets.push('sort_order = ?'); params.push(Number(req.body.sort_order) || 0);
    }
    if (req.body.active !== undefined) {
      sets.push('active = ?'); params.push(req.body.active ? 1 : 0);
    }

    if (!sets.length) return res.status(400).json({ error: 'אין שדות לעדכון' });

    params.push(id);
    await db.run(`UPDATE prizes SET ${sets.join(', ')} WHERE id = ?`, params);
    const updated = await db.one('SELECT * FROM prizes WHERE id = ?', [id]);
    res.json({ ok: true, prize: updated });
  } catch (e) {
    console.error('prizes/admin/update:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ═════════ נתיבי משתמש ═════════

// ───────── חנות: פרסים פעילים, הנקודות שלי, הפדיונות שלי ─────────
router.get('/', auth(), async (req, res) => {
  try {
    const [prizes, myPoints, myRedemptions] = await Promise.all([
      db.query(`
        SELECT p.*,
               (SELECT COUNT(*) FROM redemptions r WHERE r.prize_id = p.id AND r.status <> 'cancelled') AS redeemed_count
        FROM prizes p
        WHERE p.active = 1
        ORDER BY p.sort_order ASC, p.id ASC
      `),
      scoring.userAvailablePoints(req.user.id),
      db.query(`
        SELECT r.*, p.name AS prize_name, p.image_url AS prize_image_url
        FROM redemptions r
        JOIN prizes p ON p.id = r.prize_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC, r.id DESC
      `, [req.user.id])
    ]);
    prizes.forEach(p => { p.redeemed_count = Number(p.redeemed_count); });

    res.json({ prizes, my_points: myPoints, my_redemptions: myRedemptions });
  } catch (e) {
    console.error('prizes/list:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── פדיון פרס: בדיקת מלאי + יתרת נקודות בתוך טרנזקציה ─────────
router.post('/:id/redeem', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });

    const result = await db.tx(async (t) => {
      // נעילת שורת הפרס כדי לסדרת פדיונות מקבילים על אותו מלאי
      const prize = await t.one('SELECT * FROM prizes WHERE id = ? AND active = 1 FOR UPDATE', [id]);
      if (!prize) return { status: 404, error: 'פרס לא נמצא' };

      if (prize.stock !== null) {
        const used = await t.one(
          `SELECT COUNT(*) AS n FROM redemptions WHERE prize_id = ? AND status <> 'cancelled'`, [id]);
        if (Number(prize.stock) - Number(used?.n || 0) <= 0) {
          return { status: 400, error: 'הפרס אזל מהמלאי' };
        }
      }

      const available = await scoring.userAvailablePoints(req.user.id);
      if (available < Number(prize.cost_points)) {
        return { status: 400, error: 'אין מספיק נקודות לפדיון פרס זה' };
      }

      const r = await t.run(`
        INSERT INTO redemptions (prize_id, user_id, cost_points, status)
        VALUES (?, ?, ?, 'pending')
      `, [id, req.user.id, prize.cost_points]);
      const redemption = await t.one('SELECT * FROM redemptions WHERE id = ?', [r.insertId]);
      redemption.prize_name = prize.name;
      redemption.prize_image_url = prize.image_url;
      return { redemption };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, redemption: result.redemption });
  } catch (e) {
    console.error('prizes/redeem:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
