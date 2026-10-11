import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMyNotifications, markNotificationRead } from '../api/client';
import { formatDateTime } from '../utils/timezone';

const POLL_MS = 30 * 1000;

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// In-app notification inbox (section 49) - the logged-in user's own
// notifications from status rules and scheduled reminders. Polls every 30s
// (the same cadence the server-side scheduler fires reminders at).
export default function NotificationBell({ timezone }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = () => listMyNotifications().then(({ data: d }) => setData(d)).catch(() => {});

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openNotification = async (n) => {
    setOpen(false);
    if (!n.readAt) await markNotificationRead(n.notificationId).catch(() => {});
    load();
    if (n.registrationId) navigate(`/registrations/${n.registrationId}`);
  };

  const markAll = async () => {
    await markNotificationRead('all').catch(() => {});
    load();
  };

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell-btn" title="Notifications" onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        <BellIcon />
        {data.unreadCount > 0 && <span className="bell-count">{data.unreadCount > 99 ? '99+' : data.unreadCount}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <strong>Notifications</strong>
            {data.unreadCount > 0 && <button className="link" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="bell-list">
            {data.notifications.map((n) => (
              <button key={n.notificationId} className={`bell-item ${n.readAt ? '' : 'unread'}`} onClick={() => openNotification(n)}>
                <span className="bell-title">{n.title}</span>
                {n.message && <span className="bell-message">{n.message}</span>}
                <span className="bell-time">{formatDateTime(n.createdAt, timezone)}{n.registrationId ? ` · ${n.registrationId}` : ''}</span>
              </button>
            ))}
            {data.notifications.length === 0 && <p className="hint" style={{ padding: '0.8rem' }}>You're all caught up.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
