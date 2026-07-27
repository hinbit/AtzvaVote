// מסד נתונים MySQL 8 למערכת AtzvaVote
// משתמש ב-mysql2/promise + pool של חיבורים
// חושף API דק: query / one / run / tx - שמרגיש כמו better-sqlite3 אבל async
//
// סכמת הטבלאות נמצאת ב-./schema.js ונטענת על-ידי `npm run db:init`
// (לא נוצרת אוטומטית בהרצת השרת - כך שאי-אפשר ליצור DB ריק בטעות בפרודקשן)

try { require('dotenv').config(); } catch (e) { /* optional in this environment */ }
const mysql = require('mysql2/promise');

const config = {
  // אם DB_SOCKET מוגדר - שימוש ב-Unix socket (מהיר יותר על שרת יחיד)
  // אחרת - TCP/IP רגיל
  ...(process.env.DB_SOCKET ? { socketPath: process.env.DB_SOCKET } : {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306
  }),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'atzvavote',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',                // השרת מחזיר תאריכים ב-UTC
  dateStrings: true             // מחזיר DATETIME כמחרוזת, כמו SQLite
};

// pool גלובלי - יחיד לכל תהליך הנודג'.
const pool = mysql.createPool(config);

// ─────────── עזרים ───────────

// מחזיר מערך של שורות (גם אם ריק)
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// מחזיר את השורה הראשונה או null
async function one(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows.length ? rows[0] : null;
}

// מבצע INSERT/UPDATE/DELETE - מחזיר { affectedRows, insertId }
async function run(sql, params = []) {
  const [r] = await pool.execute(sql, params);
  return {
    affectedRows: r.affectedRows ?? 0,
    insertId:     r.insertId ?? 0,
    changedRows:  r.changedRows ?? 0
  };
}

// טרנזקציה - מקבל פונקציה אסינכרונית שמקבלת connection עם שלוש פעולות (query/one/run)
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const helper = {
      query: async (sql, p = []) => { const [rows] = await conn.execute(sql, p); return rows; },
      one:   async (sql, p = []) => { const [rows] = await conn.execute(sql, p); return rows[0] ?? null; },
      run:   async (sql, p = []) => {
        const [r] = await conn.execute(sql, p);
        return { affectedRows: r.affectedRows ?? 0, insertId: r.insertId ?? 0, changedRows: r.changedRows ?? 0 };
      }
    };
    const result = await fn(helper);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// בדיקת חיבור בהפעלה (זורקת אם נכשל)
async function ping() {
  const conn = await pool.getConnection();
  try { await conn.ping(); } finally { conn.release(); }
}

module.exports = { pool, query, one, run, tx, ping, config };
