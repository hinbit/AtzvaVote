// נתיבי ריביו קולי על אצווה (חוות טעימה) — הקלטה → תמלול → פרסום → צפייה/האזנה
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { transcribeAudioBuffer } = require('../services/transcribe');
const { settleReviewReward } = require('../services/coins');
const { translateText } = require('../services/translate');

const router = express.Router();

// מתרגם טקסטי ריביו לשפת האתר (en/ar) ושומר ב-DB בפעם הראשונה. עברית = המקור.
function normLang(l) {
  const s = String(l || 'he').toLowerCase();
  return ['he', 'en', 'ar'].includes(s) ? s : 'he';
}
async function localizeReviews(rows, lang) {
  if (lang !== 'en' && lang !== 'ar') return rows;
  const col = lang === 'en' ? 'body_en' : 'body_ar';
  for (const r of rows) {
    if (!r.body) continue;
    if (r[col]) { r.body = r[col]; continue; }
    const tr = await translateText(r.body, lang);
    if (tr) {
      await db.run(`UPDATE batch_reviews SET ${col} = ? WHERE id = ?`, [tr, r.id]);
      r.body = tr;
    }
  }
  return rows;
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 } // ~16MB מספיק להקלטה קולית קצרה
});

const AUDIO_EXTS = ['.webm', '.ogg', '.m4a', '.mp3', '.wav'];

async function ensureWritableUploadDir(candidates) {
  let lastError = null;
  for (const dir of candidates) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.access(dir, fs.constants.W_OK);
      return dir;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('no writable upload directory');
}

function absDataPath(url) {
  // url בצורת /data/batch_reviews/xxx.webm → נתיב מוחלט בדיסק
  const rel = String(url || '').replace(/^\/+/, '');
  if (!rel.startsWith('data/')) return null;
  return path.join(__dirname, '..', '..', rel);
}

// ───────── תמלול: שמירת האודיו + החזרת טקסט מתומלל ─────────
router.post('/transcribe', auth(), upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'לא התקבלה הקלטה' });

    let ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!AUDIO_EXTS.includes(ext)) ext = '.webm';

    const dir = await ensureWritableUploadDir([
      path.join(__dirname, '..', '..', 'data', 'batch_reviews'),
      path.join(__dirname, '..', '..', 'data', 'profile_images', 'batch_reviews')
    ]);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    await fs.promises.writeFile(path.join(dir, fileName), req.file.buffer);
    const audioUrl = dir.includes(`${path.sep}profile_images${path.sep}`)
      ? `/data/profile_images/batch_reviews/${fileName}`
      : `/data/batch_reviews/${fileName}`;

    let transcript = '';
    let warning = null;
    try {
      transcript = await transcribeAudioBuffer(req.file.buffer, fileName);
    } catch (e) {
      // האודיו נשמר; מחזירים טקסט ריק + אזהרה כדי שהמשתמש יוכל לכתוב ידנית
      console.error('reviews/transcribe:', e.message);
      warning = e.code === 'NO_API_KEY' || e.code === 'NO_LIB'
        ? 'התמלול אינו זמין כרגע — ניתן לכתוב את הריביו ידנית'
        : 'התמלול נכשל — ניתן לכתוב את הריביו ידנית';
    }

    res.json({ audio_url: audioUrl, transcript, warning });
  } catch (e) {
    console.error('reviews/transcribe fatal:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── פרסום ריביו ─────────
// ריביו מותר על כל אצווה שאינה מבוטלת — ריביוים לא נעולים לעולם.
router.post('/', auth(), async (req, res) => {
  try {
    const batchId = Number(req.body?.batch_id);
    const body = String(req.body?.body || '').trim();
    const audioUrl = req.body?.audio_url ? String(req.body.audio_url) : null;
    const transcript = req.body?.transcript ? String(req.body.transcript) : null;
    const includePrediction = req.body?.include_prediction ? 1 : 0;

    if (!Number.isInteger(batchId)) return res.status(400).json({ error: 'אצווה לא תקינה' });
    if (!body) return res.status(400).json({ error: 'הריביו ריק' });

    const batch = await db.one('SELECT id, status FROM batches WHERE id = ?', [batchId]);
    if (!batch) return res.status(404).json({ error: 'אצווה לא נמצאה' });
    if (batch.status === 'cancelled') return res.status(403).json({ error: 'האצווה בוטלה' });

    // הניחוש שמצורף לריביו: pred_level מהבקשה, ואם לא נשלח — דירוג האצווה של המשתמש
    let predLevel = null;
    if (includePrediction) {
      const bodyLevel = Number(req.body?.pred_level);
      if (Number.isInteger(bodyLevel) && bodyLevel >= 1 && bodyLevel <= 5) {
        predLevel = bodyLevel;
      } else {
        const pr = await db.one(
          'SELECT rating FROM batch_ratings WHERE user_id = ? AND batch_id = ?',
          [req.user.id, batchId]
        );
        if (pr) predLevel = pr.rating;
      }
    }

    await db.run(`
      INSERT INTO batch_reviews
        (user_id, batch_id, audio_url, transcript, body, include_prediction, pred_level, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
      ON DUPLICATE KEY UPDATE
        audio_url          = VALUES(audio_url),
        transcript         = VALUES(transcript),
        body               = VALUES(body),
        include_prediction = VALUES(include_prediction),
        pred_level         = VALUES(pred_level),
        status             = 'published',
        updated_at         = CURRENT_TIMESTAMP
    `, [req.user.id, batchId, audioUrl, transcript, body, includePrediction, predLevel]);

    res.json({ ok: true });
  } catch (e) {
    console.error('reviews/create:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── ריביוים של אצווה (מפורסמים) ─────────
router.get('/batch/:id', auth(), async (req, res) => {
  try {
    const batchId = Number(req.params.id);
    if (!Number.isInteger(batchId)) return res.status(400).json({ error: 'אצווה לא תקינה' });
    const rows = await db.query(`
      SELECT r.id, r.user_id, r.body, r.body_en, r.body_ar, r.audio_url, r.include_prediction,
             r.pred_level, r.created_at,
             u.name AS user_name, u.profile_image_url,
             (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS vote_count,
             EXISTS(SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.voter_user_id = ?) AS my_vote
      FROM batch_reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.batch_id = ? AND r.status = 'published'
        AND NOT EXISTS (SELECT 1 FROM sim_users sx WHERE sx.user_id = r.user_id AND sx.enabled = 0)
      ORDER BY vote_count DESC, r.created_at DESC
    `, [req.user.id, batchId]);
    rows.forEach(r => { r.vote_count = Number(r.vote_count); r.my_vote = !!Number(r.my_vote); });
    await localizeReviews(rows, normLang(req.query.lang));
    rows.forEach(r => { delete r.body_en; delete r.body_ar; });
    res.json(rows);
  } catch (e) {
    console.error('reviews/batch:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── סיכום ריביוים לכל האצוות הפעילות (לכפתורי אווטאר בלוח הדירוגים) ─────────
router.get('/summary', auth(), async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT r.id, r.batch_id, r.user_id, r.body, r.body_en, r.body_ar, r.audio_url, r.transcript, r.created_at,
             u.name AS user_name, u.profile_image_url,
             (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS vote_count
      FROM batch_reviews r
      JOIN users u ON u.id = r.user_id
      JOIN batches b ON b.id = r.batch_id
      WHERE r.status = 'published' AND b.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM sim_users sx WHERE sx.user_id = r.user_id AND sx.enabled = 0)
      ORDER BY r.batch_id, vote_count DESC, r.created_at DESC
    `);
    await localizeReviews(rows, normLang(req.query.lang));
    const byBatch = {};
    for (const r of rows) {
      r.vote_count = Number(r.vote_count);
      delete r.body_en; delete r.body_ar;
      (byBatch[r.batch_id] = byBatch[r.batch_id] || []).push(r);
    }
    res.json(byBatch);
  } catch (e) {
    console.error('reviews/summary:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── הריביוים שלי ─────────
router.get('/mine', auth(), async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT r.id, r.batch_id, r.body, r.body_en, r.body_ar, r.audio_url, r.include_prediction,
             r.pred_level, r.created_at, r.coins_awarded,
             b.code AS batch_code, b.name AS batch_name, b.name_en AS batch_name_en,
             b.stage AS batch_stage, b.status AS batch_status, b.outcome_level,
             (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS vote_count
      FROM batch_reviews r
      JOIN batches b ON b.id = r.batch_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `, [req.user.id]);
    rows.forEach(r => { r.vote_count = Number(r.vote_count); r.coins_awarded = Number(r.coins_awarded || 0); });
    await localizeReviews(rows, normLang(req.query.lang));
    rows.forEach(r => { delete r.body_en; delete r.body_ar; });
    res.json(rows);
  } catch (e) {
    console.error('reviews/mine:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── עריכת טקסט ריביו (בעלים או מנהל) ─────────
router.patch('/:id', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });
    if (!body) return res.status(400).json({ error: 'הריביו ריק' });

    const row = await db.one('SELECT user_id FROM batch_reviews WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'ריביו לא נמצא' });
    if (row.user_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'אין הרשאה' });
    }

    await db.run('UPDATE batch_reviews SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [body, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reviews/patch:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── מחיקת ריביו (בעלים או מנהל) + מחיקת קובץ האודיו ─────────
router.delete('/:id', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });

    const row = await db.one('SELECT user_id, audio_url FROM batch_reviews WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'ריביו לא נמצא' });
    if (row.user_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'אין הרשאה' });
    }

    await db.run('DELETE FROM batch_reviews WHERE id = ?', [id]);
    const abs = absDataPath(row.audio_url);
    if (abs) { try { await fs.promises.unlink(abs); } catch (e) { /* כבר נמחק */ } }
    res.json({ ok: true });
  } catch (e) {
    console.error('reviews/delete:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ───────── הצבעה על ריביו (שמעתי/אהבתי) — מזכה את הכותב במטבעות ─────────
router.post('/:id/vote', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'מזהה לא תקין' });

    const review = await db.one('SELECT id, user_id, batch_id, include_prediction, pred_level, coins_awarded FROM batch_reviews WHERE id = ?', [id]);
    if (!review) return res.status(404).json({ error: 'ריביו לא נמצא' });
    if (review.user_id === req.user.id) return res.status(400).json({ error: 'אי אפשר להצביע לריביו של עצמך' });

    const existing = await db.one(
      'SELECT id FROM review_votes WHERE review_id = ? AND voter_user_id = ?',
      [id, req.user.id]
    );
    let voted;
    if (existing) {
      await db.run('DELETE FROM review_votes WHERE id = ?', [existing.id]);
      voted = false;
    } else {
      await db.run('INSERT IGNORE INTO review_votes (review_id, voter_user_id) VALUES (?, ?)', [id, req.user.id]);
      voted = true;
    }

    // אם האצווה כבר נפתרה — עדכן מיד את התגמול (אחרת יתעדכן ביישוב האצווה)
    try { await settleReviewReward(review); } catch (e) { console.error('review reward:', e.message); }

    const cnt = await db.one('SELECT COUNT(*) AS n FROM review_votes WHERE review_id = ?', [id]);
    res.json({ ok: true, voted, vote_count: Number(cnt?.n || 0) });
  } catch (e) {
    console.error('reviews/vote:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
