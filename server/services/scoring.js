// מנוע חישוב ניקוד (async/MySQL) — משחק דיוק הניחוש על תוצאת האצווה
const db = require('../db');
const { settleCoinBetsForBatch, settleReviewRewardsForBatch } = require('./coins');

async function getSettingNum(key, def) {
  const r = await db.one('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return r ? Number(r.value) : def;
}

async function getSettingStr(key) {
  const r = await db.one('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return r ? r.value : null;
}

// חישוב נקודות לדירוג בודד מול תוצאת האמת (1-5):
// ניחוש מדויק → scoring_exact, סטייה של רמה אחת → scoring_close, אחרת 0.
async function calcPoints(guessLevel, outcomeLevel, weights) {
  if (outcomeLevel == null || guessLevel == null) return 0;
  const w = weights || {
    exact: await getSettingNum('scoring_exact', 5),
    close: await getSettingNum('scoring_close', 2)
  };
  const diff = Math.abs(Number(guessLevel) - Number(outcomeLevel));
  if (diff === 0) return w.exact;
  if (diff === 1) return w.close;
  return 0;
}

// עדכון ניקוד לכל הדירוגים של אצווה שנפתרה (הוזנה תוצאת אמת)
async function recalcForBatch(batchId) {
  const batch = await db.one('SELECT * FROM batches WHERE id = ?', [batchId]);
  if (!batch || batch.status !== 'finished' || batch.outcome_level == null) return 0;

  const weights = {
    exact: await getSettingNum('scoring_exact', 5),
    close: await getSettingNum('scoring_close', 2)
  };

  const ratings = await db.query('SELECT * FROM batch_ratings WHERE batch_id = ?', [batchId]);
  await db.tx(async (t) => {
    for (const r of ratings) {
      const pts = await calcPoints(r.rating, batch.outcome_level, weights);
      await t.run('UPDATE batch_ratings SET points = ? WHERE id = ?', [pts, r.id]);
    }
  });

  // עדכון ניקוד גם לניחושי הפאנלים הקבוצתיים על אותה אצווה
  await recalcGroupBetsForBatch(batchId);

  // יישוב הימורי המטבעות ("שיחים") על אותה אצווה
  await settleCoinBetsForBatch(batchId);

  // תגמול מטבעות לכותבי ריביו לפי הצבעות (מכפיל לניחוש מדויק)
  await settleReviewRewardsForBatch(batchId);

  return ratings.length;
}

// ────────── פאנלים קבוצתיים (Guess-Groups) ──────────

const GROUP_MULTIPLIER_CAP = 5; // ברירת מחדל; ניתן לשינוי דרך ההגדרה group_multiplier_cap

// מכפיל הקבוצה לפי מספר החברים (2 חברים → ×2 ... cap, יחיד → ×1)
function groupMultiplier(memberCount, cap = GROUP_MULTIPLIER_CAP) {
  return Math.min(Math.max(Number(memberCount) || 1, 1), Number(cap) || GROUP_MULTIPLIER_CAP);
}

// חישוב נקודות לניחוש קבוצתי בודד (guess_level 1-5) מול תוצאת האמת.
// ניחוש מדויק → base × מכפיל. סטייה של רמה אחת → חצי. אחרת → 0.
function calcGroupBetPoints(guessLevel, outcomeLevel, memberCount, baseWeight, cap = GROUP_MULTIPLIER_CAP) {
  if (outcomeLevel == null || guessLevel == null) return 0;
  const mult = groupMultiplier(memberCount, cap);
  const full = (Number(baseWeight) || 0) * mult;
  const diff = Math.abs(Number(guessLevel) - Number(outcomeLevel));
  if (diff === 0) return full;
  if (diff === 1) return Math.round(full / 2);
  return 0;
}

// עדכון נקודות לכל ניחושי הפאנלים על אצווה שנפתרה
async function recalcGroupBetsForBatch(batchId) {
  const batch = await db.one('SELECT * FROM batches WHERE id = ?', [batchId]);
  if (!batch || batch.status !== 'finished' || batch.outcome_level == null) return 0;

  const baseWeight = await getSettingNum('scoring_close', 2);
  const cap = await getSettingNum('group_multiplier_cap', GROUP_MULTIPLIER_CAP);

  const bets = await db.query(`
    SELECT b.id, b.group_id, b.guess_level,
      (SELECT COUNT(*) FROM guess_group_members m WHERE m.group_id = b.group_id) AS member_count
    FROM guess_group_bets b
    WHERE b.batch_id = ?
  `, [batchId]);

  await db.tx(async (t) => {
    for (const b of bets) {
      const pts = calcGroupBetPoints(b.guess_level, batch.outcome_level, b.member_count, baseWeight, cap);
      await t.run('UPDATE guess_group_bets SET points = ? WHERE id = ?', [pts, b.id]);
    }
  });
  return bets.length;
}

// טבלת מצטיינים של הפאנלים הקבוצתיים
async function groupLeaderboard() {
  // הערה: שימוש בתת-שאילתות (ולא ב-JOIN כפול לחברים+הימורים) כדי למנוע
  // הכפלה קרטזית של SUM(points) לפי מספר החברים.
  const groups = await db.query(`
    SELECT g.id, g.name, g.description, g.leader_user_id, g.entry_cost,
      lu.name AS leader_name,
      (SELECT COUNT(*) FROM guess_group_members m WHERE m.group_id = g.id) AS member_count,
      (SELECT COALESCE(SUM(b.points), 0) FROM guess_group_bets b WHERE b.group_id = g.id) AS total_points,
      (SELECT COUNT(*) FROM guess_group_bets b WHERE b.group_id = g.id AND b.points > 0) AS winning_bets,
      (SELECT COUNT(*) FROM guess_group_bets b WHERE b.group_id = g.id) AS total_bets
    FROM guess_groups g
    LEFT JOIN users lu ON lu.id = g.leader_user_id
  `);

  const cap = await getSettingNum('group_multiplier_cap', GROUP_MULTIPLIER_CAP);
  for (const g of groups) {
    g.member_count = Number(g.member_count || 0);
    g.total_points = Number(g.total_points || 0);
    g.winning_bets = Number(g.winning_bets || 0);
    g.total_bets   = Number(g.total_bets || 0);
    g.entry_cost   = Number(g.entry_cost || 0);
    g.multiplier   = groupMultiplier(g.member_count, cap);
  }

  // חברי כל קבוצה (לתצוגה בלוח ובבאנר)
  if (groups.length) {
    const members = await db.query(`
      SELECT m.group_id, u.id, u.name, u.profile_image_url, m.role
      FROM guess_group_members m
      JOIN users u ON u.id = m.user_id
      ORDER BY m.role = 'leader' DESC, u.name ASC
    `);
    const byGroup = new Map();
    for (const mem of members) {
      if (!byGroup.has(mem.group_id)) byGroup.set(mem.group_id, []);
      byGroup.get(mem.group_id).push({
        id: mem.id, name: mem.name, profile_image_url: mem.profile_image_url, role: mem.role
      });
    }
    for (const g of groups) g.members = byGroup.get(g.id) || [];
  }

  groups.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.winning_bets !== a.winning_bets) return b.winning_bets - a.winning_bets;
    return a.name.localeCompare(b.name);
  });

  // הקצאת דירוג עם טיפול בשוויון (1, 1, 3, ...)
  let lastPts = null, lastRank = 0;
  groups.forEach((g, i) => {
    if (g.total_points !== lastPts) {
      lastRank = i + 1;
      lastPts = g.total_points;
    }
    g.rank = lastRank;
  });
  return groups;
}

// סך הנקודות האישיות של המשתמש (דירוגי אצוות שנפתרו)
async function userTotalPoints(userId) {
  const row = await db.one('SELECT COALESCE(SUM(points), 0) AS pts FROM batch_ratings WHERE user_id = ?', [userId]);
  return Number(row?.pts || 0);
}

// נקודות זמינות = נקודות אישיות פחות דמי כניסה לפאנלים ופחות פרסים שנפדו
async function userAvailablePoints(userId) {
  const total = await userTotalPoints(userId);
  const spentRow = await db.one('SELECT COALESCE(SUM(paid_points), 0) AS spent FROM guess_group_members WHERE user_id = ?', [userId]);
  const redeemedRow = await db.one(
    `SELECT COALESCE(SUM(cost_points), 0) AS redeemed FROM redemptions WHERE user_id = ? AND status <> 'cancelled'`,
    [userId]);
  return total - Number(spentRow?.spent || 0) - Number(redeemedRow?.redeemed || 0);
}

// סטטיסטיקות קבוצתיות עבור משתמש בודד (לעמוד הפרופיל)
async function userGroupStats(userId) {
  const board = await groupLeaderboard();
  const myGroups = board.filter(g => (g.members || []).some(m => m.id === userId));

  // כמה שילם המשתמש בכל קבוצה (דמי כניסה)
  const paidRows = await db.query(
    'SELECT group_id, paid_points FROM guess_group_members WHERE user_id = ?', [userId]);
  const paidByGroup = new Map(paidRows.map(r => [r.group_id, Number(r.paid_points || 0)]));

  const totalGroupPoints = myGroups.reduce((s, g) => s + g.total_points, 0);
  const totalPaid = myGroups.reduce((s, g) => s + (paidByGroup.get(g.id) || 0), 0);
  const bestGroup = myGroups.reduce((best, g) =>
    (!best || g.total_points > best.total_points) ? g : best, null);

  // עם מי ניחשתי הכי הרבה — חבר משותף במספר הקבוצות הגדול ביותר, שובר שוויון לפי נקודות משותפות
  const partners = new Map(); // userId → { name, groups, points }
  for (const g of myGroups) {
    for (const m of (g.members || [])) {
      if (m.id === userId) continue;
      const p = partners.get(m.id) || { id: m.id, name: m.name, profile_image_url: m.profile_image_url, groups: 0, points: 0 };
      p.groups += 1;
      p.points += g.total_points;
      partners.set(m.id, p);
    }
  }
  const topPartner = [...partners.values()].sort((a, b) =>
    (b.groups - a.groups) || (b.points - a.points))[0] || null;

  const available = await userAvailablePoints(userId);

  return {
    groups_count: myGroups.length,
    total_group_points: totalGroupPoints,
    total_paid: totalPaid,
    net_group_points: totalGroupPoints - totalPaid,
    available_points: available,
    best_group: bestGroup ? { id: bestGroup.id, name: bestGroup.name, points: bestGroup.total_points, rank: bestGroup.rank } : null,
    top_partner: topPartner,
    // כל קבוצה: עלות (מה ששולם) והרווח הנוכחי ממנה — לעמוד החבר
    groups: myGroups.map(g => ({
      id: g.id, name: g.name, points: g.total_points, rank: g.rank,
      member_count: g.member_count, multiplier: g.multiplier,
      entry_cost: g.entry_cost,
      cost: paidByGroup.get(g.id) || 0,
      earned: g.total_points
    }))
  };
}

// טבלת מצטיינים. options.quarter — סינון למשחק הרבעוני (למשל '2026-Q3')
async function leaderboard(options = {}) {
  const quarter = options.quarter || null;
  const exactWeight = await getSettingNum('scoring_exact', 5);
  const closeWeight = await getSettingNum('scoring_close', 2);

  const params = [exactWeight, closeWeight];
  let quarterJoin = '';
  if (quarter) {
    quarterJoin = 'AND EXISTS (SELECT 1 FROM batches bq WHERE bq.id = p.batch_id AND bq.quarter = ?)';
  }
  const rows = await db.query(`
    SELECT
      u.id, u.name, u.profile_image_url, u.department,
      COALESCE(SUM(p.points), 0) AS match_points,
      COUNT(p.id) AS num_predictions,
      SUM(CASE WHEN p.points = ? THEN 1 ELSE 0 END) AS exact_hits,
      SUM(CASE WHEN p.points > 0 THEN 1 ELSE 0 END) AS outcome_hits,
      SUM(CASE WHEN p.points = ? THEN 1 ELSE 0 END) AS close_hits
    FROM users u
    LEFT JOIN batch_ratings p ON p.user_id = u.id ${quarter ? quarterJoin : ''}
    WHERE u.is_admin = 0 AND u.is_guest = 0
      AND NOT EXISTS (SELECT 1 FROM sim_users sx WHERE sx.user_id = u.id AND sx.enabled = 0)
    GROUP BY u.id, u.name, u.profile_image_url, u.department
  `, quarter ? [...params, quarter] : params);

  // המרת מספרים שמגיעים כמחרוזות ב-MySQL/JS (SUM/COUNT)
  for (const r of rows) {
    r.match_points    = Number(r.match_points    || 0);
    r.num_predictions = Number(r.num_predictions || 0);
    r.exact_hits      = Number(r.exact_hits      || 0);
    r.outcome_hits    = Number(r.outcome_hits    || 0);
    r.close_hits      = Number(r.close_hits      || 0);
    // אם משקל "קרוב" שווה למדויק (משקלים חריגים) — אל תספור פעמיים
    if (closeWeight === exactWeight) r.close_hits = 0;
    r.bonus_points = 0;
    r.total_points = r.match_points;
  }

  rows.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return b.exact_hits - a.exact_hits;
  });

  // הקצאת דירוג עם טיפול בשוויון (1, 1, 3, ...)
  let lastPts = null, lastRank = 0;
  rows.forEach((r, i) => {
    if (r.total_points !== lastPts) {
      lastRank = i + 1;
      lastPts = r.total_points;
    }
    r.rank = lastRank;
  });

  // תגי הישג דינמיים — מתעדכנים בכל פעם שאצווה נפתרת (הנתונים מחושבים מחדש)
  await assignLeaderboardBadges(rows);

  return rows;
}

// ────────── תגי הישג בטבלת המצטיינים (10 תגים דינמיים) ──────────
// מתעדכנים בכל מחזור (פתרון אצווה / חישוב מחדש) — משתמש יכול לזכות/לאבד תג.
// הקונפיגורציה ניתנת לעריכה בלוח הניהול (הגדרה badges_config): הפעלה/כיבוי, אימוג'י, וספים.
const DEFAULT_BADGE_CONFIG = {
  badges: {
    crown:         { enabled: true, emoji: '👑' },  // מלך הניחושים — הכי הרבה מדויקים
    leader:        { enabled: true, emoji: '🏆' },  // מוביל הטבלה
    oracle:        { enabled: true, emoji: '🧠' },  // הכי הרבה פגיעות
    goal_machine:  { enabled: true, emoji: '🌿' },  // מכונת אצוות — הכי הרבה "קרוב" (רמה אחת)
    sharpshooter:  { enabled: true, emoji: '🎯' },  // הדיוק הממוצע הגבוה ביותר
    streak:        { enabled: true, emoji: '🔥' },  // רצף פגיעות נוכחי
    perfectionist: { enabled: true, emoji: '💎' },  // יחס מדויקים הגבוה ביותר
    dedicated:     { enabled: true, emoji: '🦅' },  // הכי הרבה דירוגים
    centurion:     { enabled: true, emoji: '💯' },  // עבר את רף הנקודות
    prophet:       { enabled: true, emoji: '⭐' }   // בונוס מיוחד (שמור לעתיד)
  },
  // min_points: רף נקודות מינימלי כדי לקבל תגים בכלל (תגים מוענקים רק למי שמעל הסף)
  thresholds: { centurion_points: 100, min_predictions: 5, min_streak: 2, min_points: 13 },
  // 10 תגי "שיחים" — ניתנים לעריכה (אימוג'י/שם/סף/הפעלה). metric: rank|win_rate|balance|bets_settled|bets_won
  coin_badges: {
    richest:     { enabled: true, emoji: '💰',  label: 'העשיר בשיחים', metric: 'rank',         threshold: 1 },
    silver:      { enabled: true, emoji: '🥈',  label: 'מקום שני',      metric: 'rank',         threshold: 2 },
    bronze:      { enabled: true, emoji: '🥉',  label: 'מקום שלישי',    metric: 'rank',         threshold: 3 },
    sharp:       { enabled: true, emoji: '🎯',  label: 'מנחש חד',       metric: 'win_rate',     threshold: 70 },
    high_roller: { enabled: true, emoji: '🤑',  label: 'שחקן גדול',     metric: 'balance',      threshold: 15000 },
    whale:       { enabled: true, emoji: '🐋',  label: 'לוויתן',        metric: 'balance',      threshold: 20000 },
    veteran:     { enabled: true, emoji: '🎖️',  label: 'ותיק',          metric: 'bets_settled', threshold: 10 },
    winner:      { enabled: true, emoji: '🏅',  label: 'מנצח סדרתי',    metric: 'bets_won',     threshold: 5 },
    champion:    { enabled: true, emoji: '🏆',  label: 'אלוף השיחים',   metric: 'bets_won',     threshold: 10 },
    active:      { enabled: true, emoji: '⚡',  label: 'פעלתן',         metric: 'bets_settled', threshold: 3 }
  }
};

async function loadBadgeConfig() {
  const raw = await getSettingStr('badges_config');
  if (!raw) return DEFAULT_BADGE_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    return {
      badges:      { ...DEFAULT_BADGE_CONFIG.badges,      ...(parsed.badges || {}) },
      thresholds:  { ...DEFAULT_BADGE_CONFIG.thresholds,  ...(parsed.thresholds || {}) },
      coin_badges: { ...DEFAULT_BADGE_CONFIG.coin_badges, ...(parsed.coin_badges || {}) }
    };
  } catch {
    return DEFAULT_BADGE_CONFIG;
  }
}

// רצף "חם": אורך הרצף הנוכחי של דירוגים מזכי-נקודות (לפי סדר פתרון האצוות)
async function computeCurrentStreaks() {
  const rows = await db.query(`
    SELECT p.user_id AS uid, p.points AS pts
    FROM batch_ratings p
    JOIN batches b ON b.id = p.batch_id
    WHERE b.status = 'finished' AND b.outcome_level IS NOT NULL
    ORDER BY p.user_id, b.resolved_at ASC, b.id ASC
  `);
  const streaks = new Map();
  let curUser = null, running = 0;
  for (const r of rows) {
    if (r.uid !== curUser) { curUser = r.uid; running = 0; }
    running = Number(r.pts) > 0 ? running + 1 : 0;
    streaks.set(r.uid, running); // הערך האחרון = הרצף הנוכחי (מסתיים באצווה האחרונה)
  }
  return streaks;
}

// מקצה תג (אובייקט {id, emoji}) למחזיק/י הערך המקסימלי בשדה (תיקו → כולם), בכפוף לסף.
// מדלג אם התג כבוי בקונפיגורציה.
function assignTopBadge(rows, valueFn, badgeId, cfg, { min = 1, eligibleFn = null } = {}) {
  const def = cfg.badges[badgeId];
  if (!def || !def.enabled) return;
  let best = -Infinity;
  for (const r of rows) {
    if (eligibleFn && !eligibleFn(r)) continue;
    const v = valueFn(r);
    if (v > best) best = v;
  }
  if (best < min) return;
  for (const r of rows) {
    if (eligibleFn && !eligibleFn(r)) continue;
    if (valueFn(r) === best) r.badges.push({ id: badgeId, emoji: def.emoji });
  }
}

function pushBadge(r, badgeId, cfg) {
  const def = cfg.badges[badgeId];
  if (def && def.enabled) r.badges.push({ id: badgeId, emoji: def.emoji });
}

// מקצה תג למחזיק יחיד בלבד: הראשון (לפי סדר הדירוג שכבר ממוין) בעל הערך המקסימלי.
// שובר-שוויון דטרמיניסטי — אין שני זוכים גם אם יש תיקו בערך.
function assignSingleTopBadge(rows, valueFn, badgeId, cfg, { min = 1, eligibleFn = null } = {}) {
  const def = cfg.badges[badgeId];
  if (!def || !def.enabled) return;
  let best = -Infinity;
  for (const r of rows) {
    if (eligibleFn && !eligibleFn(r)) continue;
    const v = valueFn(r);
    if (v > best) best = v;
  }
  if (best < min) return;
  const winner = rows.find(r => (!eligibleFn || eligibleFn(r)) && valueFn(r) === best);
  if (winner) winner.badges.push({ id: badgeId, emoji: def.emoji });
}

async function assignLeaderboardBadges(rows) {
  const cfg = await loadBadgeConfig();
  const minPreds = Number(cfg.thresholds.min_predictions) || 5;
  const minStreak = Number(cfg.thresholds.min_streak) || 2;
  const centurionPts = Number(cfg.thresholds.centurion_points) || 100;
  const minPoints = Number.isFinite(Number(cfg.thresholds.min_points)) ? Number(cfg.thresholds.min_points) : 13;

  for (const r of rows) {
    r.badges = [];
    r.accuracy    = r.num_predictions > 0 ? r.match_points / r.num_predictions : 0;
    r.exact_ratio = r.num_predictions > 0 ? r.exact_hits / r.num_predictions : 0;
  }
  const streaks = await computeCurrentStreaks();
  for (const r of rows) r.current_streak = streaks.get(r.id) || 0;

  // תגים מוענקים אך ורק למשתמשים עם יותר מ-minPoints נקודות
  const eligibleRows = rows.filter(r => Number(r.total_points) > minPoints);

  const enoughPreds = (r) => r.num_predictions >= minPreds;

  // "מלך הניחושים" (crown) — זוכה יחיד בלבד (הכי הרבה ניחושים מדויקים, שובר-שוויון לפי הדירוג)
  assignSingleTopBadge(eligibleRows, r => r.exact_hits, 'crown',        cfg, { min: 1 });
  assignTopBadge(eligibleRows, r => r.outcome_hits,    'oracle',        cfg, { min: 1 });
  assignTopBadge(eligibleRows, r => r.close_hits,      'goal_machine',  cfg, { min: 1 });
  assignTopBadge(eligibleRows, r => r.num_predictions, 'dedicated',     cfg, { min: 1 });
  assignTopBadge(eligibleRows, r => r.current_streak,  'streak',        cfg, { min: minStreak });
  assignTopBadge(eligibleRows, r => r.accuracy,        'sharpshooter',  cfg, { min: 0.0001, eligibleFn: enoughPreds });
  assignTopBadge(eligibleRows, r => r.exact_ratio,     'perfectionist', cfg, { min: 0.0001, eligibleFn: enoughPreds });

  // "המוביל" (leader) — זוכה יחיד בלבד: המדורג ראשון (הניקוד הגבוה ביותר) מעל הסף
  const leaderRow = eligibleRows.find(r => r.rank === 1 && r.total_points > 0);
  if (leaderRow) pushBadge(leaderRow, 'leader', cfg);

  // תגי-סף (כל מי שעומד בתנאי) — גם הם רק למעל הסף
  for (const r of eligibleRows) {
    if (r.total_points >= centurionPts) pushBadge(r, 'centurion', cfg);
    if (r.bonus_points > 0) pushBadge(r, 'prophet', cfg);
  }
}

// הרבעון הנוכחי בפורמט '2026-Q3' (לפי שעון ישראל אין צורך — חתך רבעוני גס)
function currentQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

module.exports = {
  calcPoints, recalcForBatch, leaderboard,
  calcGroupBetPoints, groupMultiplier, recalcGroupBetsForBatch, groupLeaderboard, userGroupStats,
  userTotalPoints, userAvailablePoints,
  loadBadgeConfig, DEFAULT_BADGE_CONFIG,
  GROUP_MULTIPLIER_CAP,
  currentQuarter
};
