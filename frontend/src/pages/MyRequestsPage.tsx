// list of the logged in user's own requests and their status (story #3)
import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  createdAt: string;
  category: { id: number; name: string };
}

// status is a plain string in the db (technicians change it in sprint 2),
// so match loosely and fall back to a neutral color for anything unknown
function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "submitted") return "status-badge status-submitted";
  if (s.includes("progress") || s === "assigned") return "status-badge status-progress";
  if (s === "resolved" || s === "completed" || s === "closed") return "status-badge status-done";
  return "status-badge";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// refreshKey: App bumps this after a new request is submitted so the list reloads
export function MyRequestsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false; // ignore a slow response if the list was reloaded again in the meantime
    apiClient
      .get<MaintenanceRequest[]>("/requests/mine")
      .then((res) => {
        if (cancelled) return;
        setRequests(res.data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your requests.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloadCount]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>My requests</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setLoading(true);
            setReloadCount((n) => n + 1);
          }}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {!error && !loading && requests.length === 0 && (
        <p className="empty-text">You haven't submitted any requests yet.</p>
      )}

      {requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r) => (
            <li key={r.id} className="request-item">
              <div className="request-top">
                <span className="request-title">{r.title}</span>
                <span className={statusClass(r.status)}>{r.status}</span>
              </div>
              <p className="request-meta">
                {r.category.name} · {r.priority} priority · {r.location}
              </p>
              <p className="request-description">{r.description}</p>
              <p className="request-date">Submitted {formatDate(r.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
