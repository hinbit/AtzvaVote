// דוח פעילות יומי למנהלת: התחברויות, ניחושים, ריביוים, לייקים והימורי שיחים.

const nodemailer = require('nodemailer');
const db = require('../db');
const { getDatePartsInTz, getShabbatState } = require('../lib/shabbat');
const {
  readSettingsMap,
  isTruthySetting,
  buildTransportConfig,
  buildGmailTransportConfig,
  resolveUserDeliveryMode,
  assertSmtpSettings,
  assertGmailSettings,
  friendlyMailError
} = require('./leaderboard-report');
const { userTotalPoints } = require('./scoring');

const IL_TZ = 'Asia/Jerusalem';
const DEFAULT_MANAGER_EMAIL = 'mon4all@hinbit.com';

const SETTING_KEYS = [
  'smtp_server', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_password',
  'smtp_manager_email', 'email_user_delivery_mode', 'gmail_app_user', 'gmail_app_password',
  'send_activity_report_to_manager', 'shabbat_mode'
];

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isEnabledByDefault(value) {
  if (value == null || String(value).trim() === '') return true;
  return isTruthySetting(value);
}

function ilOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IL_TZ, timeZoneName: 'shortOffset'
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * ((Number(m[2] || 0) * 60) + Number(m[3] || 0)) * 60 * 1000;
}

function ilWallTimeToUtc(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  let utc = guess;
  for (let i = 0; i < 2; i += 1) utc = guess - ilOffsetMs(new Date(utc));
  return new Date(utc);
}

function toMysqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function isShabbatNow(s) {
  if (!isTruthySetting(s.shabbat_mode)) return false;
  const shabbat = await getShabbatState(IL_TZ);
  return shabbat.active || shabbat.error;
}

function buildTransport(s) {
  const mode = resolveUserDeliveryMode(s);
  assertSmtpSettings(s);
  if (mode === 'gmail') {
    assertGmailSettings(s);
    return {
      transporter: nodemailer.createTransport(buildGmailTransportConfig(s)),
      from: `"מונדיאל 2026" <${String(s.gmail_app_user || '').trim()}>`,
      mode
    };
  }
  return {
    transporter: nodemailer.createTransport(buildTransportConfig(s)),
    from: `"מונדיאל 2026" <${String(s.smtp_user || '').trim()}>`,
    mode
  };
}

function previousIlDayBoundsUtc(now = new Date()) {
  const p = getDatePartsInTz(IL_TZ, now);
  const today = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const prev = new Date(today);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return {
    startUtc: ilWallTimeToUtc(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 0, 0),
    endUtc: ilWallTimeToUtc(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate(), 0, 0)
  };
}

async function countOne(sql, params = []) {
  const row = await db.one(sql, params);
  return Number(row?.cnt || 0);
}

async function collectSummary(startMysql, endMysql) {
  const userWhere = `
    u.is_guest = 0
    AND NOT EXISTS (SELECT 1 FROM sim_users sx WHERE sx.user_id = u.id)
  `;
  const windowParams = Array.from({ length: 16 }, () => [startMysql, endMysql]).flat();
  const loginUsers = await countOne(`
    SELECT COUNT(DISTINCT u.id) AS cnt
    FROM users u
    WHERE ${userWhere}
      AND u.last_login_at >= ? AND u.last_login_at < ?
  `, [startMysql, endMysql]);
  const predictions = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM batch_ratings p
    JOIN users u ON u.id = p.user_id
    WHERE ${userWhere}
      AND p.submitted_at >= ? AND p.submitted_at < ?
  `, [startMysql, endMysql]);
  const predictionChanges = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM rating_history ph
    JOIN users u ON u.id = ph.user_id
    WHERE ${userWhere}
      AND ph.changed_at >= ? AND ph.changed_at < ?
  `, [startMysql, endMysql]);
  const reviews = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM batch_reviews r
    JOIN users u ON u.id = r.user_id
    WHERE ${userWhere}
      AND r.created_at >= ? AND r.created_at < ?
  `, [startMysql, endMysql]);
  const likes = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM review_votes v
    JOIN users u ON u.id = v.voter_user_id
    WHERE ${userWhere}
      AND v.created_at >= ? AND v.created_at < ?
  `, [startMysql, endMysql]);
  const coinBets = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM coin_bets b
    JOIN users u ON u.id = b.creator_id
    WHERE ${userWhere}
      AND b.created_at >= ? AND b.created_at < ?
  `, [startMysql, endMysql]);
  const coinAccepted = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM coin_bet_participants p
    JOIN users u ON u.id = p.opponent_id
    WHERE ${userWhere}
      AND p.created_at >= ? AND p.created_at < ?
  `, [startMysql, endMysql]);
  const coinSpecialBets = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM coin_special_bets b
    JOIN users u ON u.id = b.creator_id
    WHERE ${userWhere}
      AND b.created_at >= ? AND b.created_at < ?
  `, [startMysql, endMysql]);
  const groupBets = await countOne(`
    SELECT COUNT(*) AS cnt
    FROM guess_group_bets g
    WHERE g.created_at >= ? AND g.created_at < ?
  `, [startMysql, endMysql]);

  const activeUsers = await db.query(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.last_login_at,
      (SELECT COUNT(*) FROM batch_ratings p WHERE p.user_id = u.id AND p.submitted_at >= ? AND p.submitted_at < ?) AS guesses_put,
      (SELECT COUNT(*) FROM rating_history ph WHERE ph.user_id = u.id AND ph.changed_at >= ? AND ph.changed_at < ?) AS guesses_changed,
      (SELECT COUNT(*) FROM coin_bets b WHERE b.creator_id = u.id AND b.created_at >= ? AND b.created_at < ?) AS coin_bets_created,
      (SELECT COUNT(*) FROM coin_bet_participants p WHERE p.opponent_id = u.id AND p.created_at >= ? AND p.created_at < ?) AS coin_bets_accepted,
      (SELECT COUNT(*) FROM coin_special_bets b WHERE b.creator_id = u.id AND b.created_at >= ? AND b.created_at < ?) AS coin_special_bets,
      (SELECT COUNT(*) FROM guess_group_bets g
        JOIN guess_group_members m ON m.group_id = g.group_id
        WHERE m.user_id = u.id AND g.created_at >= ? AND g.created_at < ?) AS group_bets,
      (SELECT COUNT(*) FROM batch_reviews r WHERE r.user_id = u.id AND r.created_at >= ? AND r.created_at < ?) AS reviews,
      (SELECT COUNT(*) FROM review_votes v WHERE v.voter_user_id = u.id AND v.created_at >= ? AND v.created_at < ?) AS likes,
      (
        (SELECT COUNT(*) FROM batch_ratings p WHERE p.user_id = u.id AND p.submitted_at >= ? AND p.submitted_at < ?)
        + (SELECT COUNT(*) FROM rating_history ph WHERE ph.user_id = u.id AND ph.changed_at >= ? AND ph.changed_at < ?)
        + (SELECT COUNT(*) FROM coin_bets b WHERE b.creator_id = u.id AND b.created_at >= ? AND b.created_at < ?)
        + (SELECT COUNT(*) FROM coin_bet_participants p WHERE p.opponent_id = u.id AND p.created_at >= ? AND p.created_at < ?)
        + (SELECT COUNT(*) FROM coin_special_bets b WHERE b.creator_id = u.id AND b.created_at >= ? AND b.created_at < ?)
        + (SELECT COUNT(*) FROM guess_group_bets g
            JOIN guess_group_members m ON m.group_id = g.group_id
            WHERE m.user_id = u.id AND g.created_at >= ? AND g.created_at < ?)
        + (SELECT COUNT(*) FROM batch_reviews r WHERE r.user_id = u.id AND r.created_at >= ? AND r.created_at < ?)
        + (SELECT COUNT(*) FROM review_votes v WHERE v.voter_user_id = u.id AND v.created_at >= ? AND v.created_at < ?)
      ) AS total_actions
    FROM users u
    WHERE ${userWhere}
    ORDER BY total_actions DESC, u.name ASC, u.id ASC
    LIMIT 10
  `, windowParams);

  const enrichedUsers = await Promise.all(activeUsers.map(async (u) => {
    const coinsRow = await db.one('SELECT balance FROM coin_wallets WHERE user_id = ?', [u.id]);
    return {
      ...u,
      coins: Number(coinsRow?.balance ?? 10000),
      points: await userTotalPoints(u.id)
    };
  }));

  return {
    loginUsers,
    predictions,
    predictionChanges,
    reviews,
    likes,
    coinBets,
    coinAccepted,
    coinSpecialBets,
    groupBets,
    activeUsers: enrichedUsers
  };
}

function buildActivityEmailHtml({ dateLabel, summary, topUsers }) {
  const rows = [
    ['משתמשים נכנסו', summary.loginUsers],
    ['דירוגי אצווה נשלחו', summary.predictions],
    ['שינויי דירוג', summary.predictionChanges],
    ['ריביוים פורסמו', summary.reviews],
    ['לייקים לריביוים', summary.likes],
    ['הצעות הימור שיחים', summary.coinSpecialBets],
    ['הימורי שיחים 1:1', summary.coinBets],
    ['משתתפים שהצטרפו להימור', summary.coinAccepted],
    ['הימורי קבוצה', summary.groupBets],
    ['משתמשים פעילים ייחודיים', summary.activeUsers.length]
  ];
  const summaryRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;color:#0b3d2e">${xmlEscape(label)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;font-weight:700;color:#0b3d2e">${Number(value) || 0}</td>
    </tr>
  `).join('');
  const topRows = topUsers.map((u, i) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;font-weight:700;color:#0b3d2e">${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;color:#0b3d2e">${xmlEscape(u.name || '')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;color:#0b3d2e">${u.last_login_at ? xmlEscape(String(u.last_login_at).replace('T', ' ').slice(0, 16)) : '—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;color:#0b3d2e">${Number(u.guesses_put || 0)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;color:#0b3d2e">${Number(u.guesses_changed || 0)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;color:#0b3d2e">${Number(u.coin_bets_created || 0) + Number(u.coin_bets_accepted || 0) + Number(u.coin_special_bets || 0) + Number(u.group_bets || 0)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;font-weight:700;color:#0b3d2e">${Number(u.points || 0)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8e7dd;text-align:center;font-weight:700;color:#0b3d2e">${Number(u.coins || 0)}</td>
    </tr>
  `).join('');
  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;color:#0b3d2e">
      <p>שלום,</p>
      <p>מצורף דוח פעילות יומי של האתר לתאריך <strong>${xmlEscape(dateLabel)}</strong>.</p>
      <table dir="rtl" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:12px;background:#f7fbf8;border:1px solid #d8e7dd;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#e8f3eb">
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:right">מדד</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">כמות</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>
      <p style="margin-top:16px;font-weight:700">10 המשתמשים הפעילים ביותר</p>
      <table dir="rtl" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:8px;background:#f7fbf8;border:1px solid #d8e7dd;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#e8f3eb">
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">דירוג</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:right">שם</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:right">כניסה אחרונה</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">דירוגים</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">שינויים</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">הימורים</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">נק'</th>
            <th style="padding:10px;border-bottom:1px solid #d8e7dd;text-align:center">שיחים</th>
          </tr>
        </thead>
        <tbody>${topRows.length ? topRows : '<tr><td colspan="7" style="padding:10px;text-align:center">אין פעילות</td></tr>'}</tbody>
      </table>
      <p style="margin-top:14px;font-size:13px;color:#0b3d2e">הדוח כולל משתמשים אמיתיים בלבד. — מונדיאל 2026</p>
    </div>
  `;
}

async function sendActivityReport(options = {}) {
  const force = Boolean(options.force);
  const s = await readSettingsMap(SETTING_KEYS);
  if (!force && !isEnabledByDefault(s.send_activity_report_to_manager)) {
    return { skipped: 'disabled' };
  }
  if (!s.smtp_server || !s.smtp_user || !s.smtp_password) {
    throw new Error('חסרים פרטי SMTP בהגדרות');
  }
  if (!force && await isShabbatNow(s)) {
    return { skipped: 'shabbat' };
  }

  const manager = String(s.smtp_manager_email || '').trim() || DEFAULT_MANAGER_EMAIL;
  const userDeliveryMode = resolveUserDeliveryMode(s);
  assertSmtpSettings(s);
  if (userDeliveryMode === 'gmail') assertGmailSettings(s);

  const { startUtc, endUtc } = previousIlDayBoundsUtc();
  const startMysql = toMysqlUtc(startUtc);
  const endMysql = toMysqlUtc(endUtc);
  const summary = await collectSummary(startMysql, endMysql);

  const transporterInfo = buildTransport(s);
  const { transporter, from, mode } = transporterInfo;
  const topUsers = summary.activeUsers;
  const dateLabel = new Intl.DateTimeFormat('he-IL', {
    timeZone: IL_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(startUtc);

  await transporter.sendMail({
    from,
    to: manager,
    subject: `דוח פעילות יומי — מונדיאל 2026 (${dateLabel})`,
    text: [
      `דוח פעילות יומי לתאריך ${dateLabel}.`,
      `התחברו: ${summary.loginUsers}`,
      `דירוגים: ${summary.predictions}`,
      `ריביוים: ${summary.reviews}`,
      `לייקים: ${summary.likes}`,
      `שיחים/הימורים: ${summary.coinSpecialBets + summary.coinBets + summary.coinAccepted}`
    ].join('\n'),
    html: buildActivityEmailHtml({ dateLabel, summary, topUsers })
  });

  return {
    to: manager,
    dateLabel,
    sent: true,
    mode
  };
}

module.exports = {
  sendActivityReport
};
