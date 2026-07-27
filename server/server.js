// קובץ ראשי של שרת AtzvaVote — הצבעת אצווה (MySQL 8)
try { require('dotenv').config(); } catch (e) { /* optional in this environment */ }
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const { sendLeaderboardReport, sendUserResultsReport } = require('./services/leaderboard-report');
const { sendActivityReport } = require('./services/activity-report');
const { getDatePartsInTz, getShabbatState } = require('./lib/shabbat');
const { activeThemeAssetsDir, themeDir, DEFAULT_THEME, activeThemeName } = require('./lib/themes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/data', express.static(path.join(__dirname, '..', 'data')));
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// נכסי ערכת הנושא: קודם הערכה הפעילה, ואז ברירת המחדל (seach) כנפילה לכל נכס חסר
app.use('/theme-assets', express.static(activeThemeAssetsDir()));
app.use('/theme-assets', express.static(themeDir(DEFAULT_THEME)));
console.log(`🎨 ערכת נושא פעילה: ${activeThemeName()}`);

// נתיבי API
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/site',         require('./routes/site'));
app.use('/api/batches',      require('./routes/batches'));
app.use('/api/ratings',      require('./routes/ratings'));
app.use('/api/schedule',     require('./routes/schedule'));
app.use('/api/reviews',      require('./routes/reviews'));
app.use('/api/guess-groups', require('./routes/guess-groups'));
app.use('/api/coin-bets',    require('./routes/coin-bets'));
app.use('/api/products',     require('./routes/products'));
app.use('/api/battles',      require('./routes/battles'));
app.use('/api/prizes',       require('./routes/prizes'));
app.use('/api/leaderboard',  require('./routes/leaderboard'));
app.use('/api/admin',        require('./routes/admin'));

async function readSettingsMap(keys) {
  if (!keys.length) return {};
  const rows = await db.query(
    `SELECT \`key\`, \`value\` FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

async function writeSetting(key, value) {
  await db.run(
    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [key, String(value)]
  );
}

function isTruthySetting(value) {
  return ['1', 'true', 'on', 'yes'].includes(String(value || '').toLowerCase());
}

function isEnabledByDefault(value) {
  if (value == null || String(value).trim() === '') return true;
  return isTruthySetting(value);
}

async function runScheduledEmailJobs() {
  const now = getDatePartsInTz('Asia/Jerusalem');
  if (now.minute !== 0) return;

  const settings = await readSettingsMap([
    'shabbat_mode',
    'leaderboard_report_last_sent_ymd',
    'send_activity_report_to_manager',
    'activity_report_last_sent_ymd',
    'send_results_to_users',
    'send_results_hour',
    'results_users_last_sent_ymd'
  ]);

  if (isTruthySetting(settings.shabbat_mode)) {
    const shabbat = await getShabbatState('Asia/Jerusalem');
    if (shabbat.active || shabbat.error) {
      console.log('⏸️  דוא״ל מתוזמן הושהה בגלל שבת בישראל');
      return;
    }
  }

  if (now.hour === 6 && settings.leaderboard_report_last_sent_ymd !== now.ymd) {
    console.log('⏰ שליחת דוח יומי של טבלת המצטיינים...');
    try {
      const result = await sendLeaderboardReport();
      if (result?.skipped) {
        console.log(`   ↷ דוח מנהל לא נשלח (${result.skipped})`);
      } else {
        await writeSetting('leaderboard_report_last_sent_ymd', now.ymd);
        console.log(`   ✓ נשלח ל-${result.to} (${result.count} משתתפים)`);
      }
    } catch (e) {
      console.error('   ✗ דוח מנהל נכשל:', e.message);
    }
  }

  if (isEnabledByDefault(settings.send_activity_report_to_manager)) {
    if (now.hour === 6 && now.minute === 10 && settings.activity_report_last_sent_ymd !== now.ymd) {
      console.log('⏰ שליחת דוח פעילות יומי למנהלת...');
      try {
        const result = await sendActivityReport();
        if (result?.skipped) {
          console.log(`   ↷ דוח פעילות לא נשלח (${result.skipped})`);
        } else {
          await writeSetting('activity_report_last_sent_ymd', now.ymd);
          console.log(`   ✓ דוח פעילות נשלח ל-${result.to}`);
        }
      } catch (e) {
        console.error('   ✗ דוח פעילות נכשל:', e.message);
      }
    }
  }

  if (isTruthySetting(settings.send_results_to_users)) {
    const rawSendHour = Number(settings.send_results_hour);
    const sendHour = Number.isInteger(rawSendHour) && rawSendHour >= 0 && rawSendHour <= 23 ? rawSendHour : 19;
    if (now.hour === sendHour && settings.results_users_last_sent_ymd !== now.ymd) {
      console.log('⏰ שליחת תוצאות למשתמשים...');
      try {
        const result = await sendUserResultsReport();
        if (result?.skipped) {
          console.log(`   ↷ תוצאות למשתמשים לא נשלחו (${result.skipped})`);
        } else {
          await writeSetting('results_users_last_sent_ymd', now.ymd);
          console.log(`   ✓ נשלחו ${result.sent} אימיילים למשתמשים (נכשלו: ${result.failed})`);
        }
      } catch (e) {
        console.error('   ✗ שליחת תוצאות למשתמשים נכשלה:', e.message);
      }
    }
  }
}

// בריאות
app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ ok: true, db: 'mysql', t: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'db not reachable' });
  }
});

// הגשת ה-build של הלקוח אם קיים
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        // index.html לעולם לא נשמר במטמון — כך שאחרי deploy הדפדפן מקבל את ה-bundle העדכני
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        // נכסים עם hash בשם — מותר לאחסון ארוך-טווח
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─────────── דוחות אימייל מתוזמנים ───────────
// מנהל ב-06:00, דוח פעילות ב-06:10 ומשתמשים בשעה שהוגדרה בהגדרות
cron.schedule('* * * * *', () => {
  runScheduledEmailJobs().catch((e) => console.error('   ✗ דוחות מתוזמנים נכשלו:', e.message));
}, { timezone: 'Asia/Jerusalem' });

const PORT = process.env.PORT || 5232;

// המתנה לחיבור DB לפני האזנה
(async () => {
  try {
    await db.ping();
  } catch (e) {
    console.error('✗ לא ניתן להתחבר ל-MySQL:', e.message);
    console.error('   הרץ קודם: npm run db:setup (יוצר DB + טבלאות + סיד)');
    process.exit(1);
  }

  // ודא עמודות תיעוד-כניסה (last_login_at) — נתיב הניהול מסתמך עליהן
  try {
    const col = await db.one("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'last_login_at'");
    if (!col?.n) { await db.run('ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL'); await db.run('ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(64) NULL'); }
  } catch (e) { console.error('last_login ensure:', e.message); }

  app.listen(PORT, () => {
    const dbLoc = db.config.socketPath
      ? `socket ${db.config.socketPath}`
      : `${db.config.host}:${db.config.port}`;
    console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   🌿  AtzvaVote — הצבעת אצווה  🌿            ║
  ║                                               ║
  ║   השרת פעיל על: http://localhost:${PORT}        ║
  ║   מסד נתונים: MySQL @ ${dbLoc.padEnd(20)}║
  ╚═══════════════════════════════════════════════╝
  `);
  });
})();
