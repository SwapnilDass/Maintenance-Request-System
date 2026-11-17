// the bell in the header (story #8) - shows how many notifications are unread, and a list of the latest.
// clicking one marks it read and opens that request. checks for new ones every 30 seconds
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { formatDate } from "../lib/requests";

interface Notification {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
  requestId: string;
}

const POLL_MS = 30_000;

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  function load() {
    apiClient
      .get<{ unreadCount: number; notifications: Notification[] }>("/notifications")
      .then((res) => {
        setNotifications(res.data.notifications);
        setUnread(res.data.unreadCount);
      })
      .catch(() => {}); // the bell just stays as it was; a 401 logs out through api/client.ts
  }

  // load now, then every 30s so new ones show up without refreshing the page
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // click outside closes the list
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function openNotification(n: Notification) {
    setOpen(false);
    if (!n.read) {
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      apiClient.patch(`/notifications/${n.id}/read`).catch(() => {});
    }
    navigate(`/requests/${n.requestId}`);
  }

  async function markAllRead() {
    setNotifications((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await apiClient.patch("/notifications/read-all").catch(() => {});
  }

  return (
    <div className="bell" ref={rootRef}>
      <button
        type="button"
        className="bell-button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          if (!open) load(); // fresh list every time it opens
          setOpen(!open);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          <div className="bell-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="bell-mark-all" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="bell-empty">Nothing yet. You'll see updates on your requests here.</p>
          ) : (
            <ul className="bell-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`bell-item${n.read ? "" : " bell-item-unread"}`}
                    onClick={() => openNotification(n)}
                  >
                    <span className="bell-message">{n.message}</span>
                    <span className="bell-date">{formatDate(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
