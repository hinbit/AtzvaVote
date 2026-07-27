import { useState } from 'react';
import api from '../api/client';
import { ilDateTime } from '../utils/time';

// תג "צלף" (ניחוש מדויק בהגשה אחת ללא שינויים) + כפתור היסטוריית שינויי הדירוג לפי זמן.
export default function BetHistory({ batchId, firstTimeHitter, editCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (changes === null) {
      setLoading(true);
      try { const { data } = await api.get(`/ratings/history/${batchId}`); setChanges(data.changes || []); }
      catch { setChanges([]); } finally { setLoading(false); }
    }
  };

  return (
    <span className="bet-history">
      {firstTimeHitter && <span className="hitter-tag" title="ניחוש מדויק שהוגש פעם אחת בלבד — ללא שינויים">🎯 צלף</span>}
      <button type="button" className="bet-history-btn" onClick={toggle} title="היסטוריית שינויי הדירוג">
        🕘{editCount > 1 ? ` ${editCount}` : ''}
      </button>
      {open && (
        <span className="bet-history-pop" dir="rtl">
          {loading ? '…' : (changes && changes.length ? (
            changes.map((c, i) => (
              <span key={i} className="bet-history-row">
                <span className="bet-history-when">{ilDateTime(c.changed_at)}</span>
                <b dir="ltr">{c.rating}/5</b>
                <span className="bet-history-tag">{i === 0 ? 'דירוג ראשון' : `שינוי ${i}`}</span>
              </span>
            ))
          ) : 'אין היסטוריה')}
        </span>
      )}
    </span>
  );
}
