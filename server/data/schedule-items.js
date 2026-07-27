// לוח הזמנים של המשחק הרבעוני — ניתן לעריכה מלאה בלוח הניהול
module.exports = [
  {
    title: 'פתיחת רבעון הדירוג',
    date_label: '1.7.2026',
    description: 'תחילת משחק דירוג האצוות לרבעון Q3',
    start_at: '2026-07-01 00:00:00',
    end_at: '2026-07-01 23:59:59',
    sort_order: 10,
    prize_slot: null
  },
  {
    title: 'חודש ראשון',
    date_label: '1.7–31.7',
    description: 'דירוג אצוות בכל התחנות: גידול, עיבוד, יישון, מפעל, שיווק ומכירות',
    start_at: '2026-07-01 00:00:00',
    end_at: '2026-07-31 23:59:59',
    sort_order: 20,
    prize_slot: null
  },
  {
    title: 'פרס שלישי',
    date_label: '31.7.2026',
    description: 'מוביל טבלת הדיוק בסוף החודש הראשון',
    start_at: '2026-07-31 00:00:00',
    end_at: '2026-07-31 23:59:59',
    sort_order: 30,
    prize_slot: 3
  },
  {
    title: 'חודש שני',
    date_label: '1.8–31.8',
    description: 'המשך דירוג אצוות ותוצאות מכירה ראשונות',
    start_at: '2026-08-01 00:00:00',
    end_at: '2026-08-31 23:59:59',
    sort_order: 40,
    prize_slot: null
  },
  {
    title: 'פרס שני',
    date_label: '31.8.2026',
    description: 'מוביל טבלת הדיוק בסוף החודש השני',
    start_at: '2026-08-31 00:00:00',
    end_at: '2026-08-31 23:59:59',
    sort_order: 50,
    prize_slot: 2
  },
  {
    title: 'ספרינט הסיום',
    date_label: '1.9–29.9',
    description: 'האצוות האחרונות של הרבעון נסגרות ונמכרות',
    start_at: '2026-09-01 00:00:00',
    end_at: '2026-09-29 23:59:59',
    sort_order: 60,
    prize_slot: null
  },
  {
    title: '🏆 סיכום הרבעון',
    date_label: '30.9.2026',
    description: 'כל האצוות שנמכרו מחלקות ציון — הכרזת אלוף הרבעון וחלוקת הפרס הראשון',
    start_at: '2026-09-30 00:00:00',
    end_at: '2026-09-30 23:59:59',
    sort_order: 70,
    prize_slot: 1
  }
];
