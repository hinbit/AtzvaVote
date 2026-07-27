#!/usr/bin/env node
// אכלוס מסד הנתונים של AtzvaVote וביצירת משתמש מנהל ראשוני (MySQL 8)
// בטוח להרצה חוזרת - משתמש ב-ON DUPLICATE KEY UPDATE / INSERT IGNORE

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const batches = require('./data/batches');
const prizes = require('./data/prizes');
const { DEFAULT_DEPARTMENTS } = require('./lib/departments');
const { seedScheduleItems, scheduleDefaults } = require('./lib/schedule-items');
const { seedFooterDocuments, footerDocumentDefaults } = require('./lib/footer-content');
const { seedTranslations, translations } = require('./lib/translations');

async function seed() {
  console.log('🌿 אכלוס מסד הנתונים של AtzvaVote...');

  try {
    await db.ping();
  } catch (e) {
    console.error('✗ אין גישה למסד הנתונים. הרץ קודם: npm run db:create && npm run db:init');
    console.error('   הודעה:', e.message);
    process.exit(1);
  }

  // ─────────── אצוות דמו ───────────
  await db.tx(async (t) => {
    for (const b of batches) {
      await t.run(`
        INSERT INTO batches (code, name, name_en, stage, description, sales_target, quarter)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name         = VALUES(name),
          name_en      = VALUES(name_en),
          description  = VALUES(description),
          sales_target = VALUES(sales_target),
          quarter      = VALUES(quarter)
      `, [b.code, b.name, b.name_en || null, b.stage || 'growing', b.description || null, b.sales_target || null, b.quarter || null]);
    }
  });
  console.log(`   ✓ ${batches.length} אצוות דמו נטענו`);

  // ─────────── חנות פרסים ───────────
  for (const p of prizes) {
    const exists = await db.one('SELECT id FROM prizes WHERE name = ?', [p.name]);
    if (!exists) {
      await db.run(
        `INSERT INTO prizes (name, description, cost_points, stock, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)`,
        [p.name, p.description || null, p.cost_points, p.stock || null, p.sort_order || 0]);
    }
  }
  console.log(`   ✓ ${prizes.length} פרסים נטענו (כובע 318 · חולצה 500 · תקליט 900)`);

  // ─────────── לוז ופרסי תקופה ───────────
  await db.tx(async (t) => {
    await seedScheduleItems(t);
  });
  console.log(`   ✓ ${scheduleDefaults.length} שורות לוז נטענו`);

  // ─────────── מסמכי פוטר ───────────
  await db.tx(async (t) => {
    await seedFooterDocuments(t);
  });
  console.log(`   ✓ ${footerDocumentDefaults.length} מסמכי פוטר נטענו`);

  // ─────────── תרגומים ───────────
  await db.tx(async (t) => {
    await seedTranslations(t);
  });
  console.log(`   ✓ ${Object.keys(translations).length} מפתחות תרגום נטענו`);

  // ─────────── מנהל ראשוני ───────────
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@company.local').toLowerCase();
  const adminPass  = process.env.ADMIN_PASSWORD || 'changeme123';
  const exists = await db.one('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!exists) {
    const hash = bcrypt.hashSync(adminPass, 10);
    await db.run(
      `INSERT INTO users (email, name, password_hash, preferred_language, is_admin, role) VALUES (?, ?, ?, 'he', 1, 'admin')`,
      [adminEmail, 'מנהל המערכת', hash]
    );
    console.log(`   ✓ נוצר משתמש מנהל: ${adminEmail} / ${adminPass}`);
    console.log('   ⚠️  אנא שנה את הסיסמה בהקדם!');
  } else {
    console.log(`   ✓ משתמש המנהל ${adminEmail} כבר קיים`);
  }

  // ─────────── הגדרות ברירת מחדל ───────────
  const settings = [
    // ניקוד דיוק: ניחוש מדויק / סטייה של רמה אחת
    ['scoring_exact', '5'],
    ['scoring_close', '2'],
    // מיפוי מחלקה → תחנת דירוג (JSON). מחלקות ללא מיפוי — העובד בוחר תחנה בעצמו.
    ['department_stages', JSON.stringify({
      'חוות שיח': 'growing',
      'שיח פארמה': 'factory',
      'שיח שריד': 'processing',
      'משרדי מטה': 'marketing'
    })],
    // תגמול מטבעות לכותבי ריביו: מטבעות לכל הצבעה, ומכפיל לניחוש מדויק
    ['review_coins_per_vote',     '10'],
    ['review_correct_multiplier', '2'],
    // פאנלים קבוצתיים — גבולות הניתנים לשינוי בלוח הניהול
    ['group_max_per_user',   '8'],
    ['group_max_members',    '5'],
    ['group_entry_cost_max', '5'],
    ['group_multiplier_cap', '5'],
    ['site_guess_groups_enabled', process.env.SITE_GUESS_GROUPS_ENABLED || 'false'],
    // רמה 2 — דירוג מוצרים חיצוני וקרבות השוואה
    ['site_products_enabled', process.env.SITE_PRODUCTS_ENABLED || 'true'],
    ['site_battles_enabled',  process.env.SITE_BATTLES_ENABLED || 'true'],
    ['departments',       JSON.stringify(DEFAULT_DEPARTMENTS)],
    ['site_url',          process.env.SITE_URL || 'https://atzvavote.canabolabs.com'],
    ['shabbat_mode',      process.env.SHABBAT_MODE || '1'],
    ['smtp_server',       process.env.SMTP_SERVER || ''],
    ['smtp_port',         process.env.SMTP_PORT || '587'],
    ['smtp_security',     process.env.SMTP_SECURITY || 'STARTTLS'],
    ['smtp_user',         process.env.SMTP_USER || ''],
    ['smtp_password',     process.env.SMTP_PASSWORD || ''],
    ['smtp_manager_email', process.env.SMTP_MANAGER_EMAIL || ''],
    ['email_user_delivery_mode', process.env.EMAIL_USER_DELIVERY_MODE || 'smtp'],
    ['gmail_app_user',     process.env.GMAIL_APP_USER || ''],
    ['gmail_app_password', process.env.GMAIL_APP_PASSWORD || ''],
    ['send_activity_report_to_manager', process.env.SEND_ACTIVITY_REPORT_TO_MANAGER || '1'],
    ['send_results_to_users', process.env.SEND_RESULTS_TO_USERS || '0'],
    ['send_results_hour', process.env.SEND_RESULTS_HOUR || '19'],
    ['send_results_audience', process.env.SEND_RESULTS_AUDIENCE || 'all']
  ];
  // INSERT IGNORE - אם המנהל כבר ערך הגדרה ידנית, נשמר ערכו הקיים.
  for (const [k, v] of settings) {
    await db.run('INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)', [k, v]);
  }
  console.log('   ✓ הגדרות מערכת נטענו');

  console.log('\n✅ אכלוס הושלם בהצלחה!\n');
}

seed()
  .then(() => process.exit(0))
  .catch(e => { console.error('✗ שגיאה:', e.message); process.exit(1); });
