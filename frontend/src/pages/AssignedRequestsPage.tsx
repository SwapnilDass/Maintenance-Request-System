// technician "My Assigned Requests" page (story #6) - open the detail page to update status / add notes (story #7)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import { formatDate, priorityClass, statusClass, type MaintenanceRequest } from "../lib/requests";

export function AssignedRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<MaintenanceRequest[]>("/requests/assigned")
      .then((res) => {
        if (cancelled) return;
        setRequests(res.data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your assigned requests.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  return (
    <div className="card card-wide">
      <div className="card-header">
        <h2>My assigned requests</h2>
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
        <p className="empty-text">Nothing assigned to you yet.</p>
      )}

      {requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r) => (
            <li key={r.id} className="request-item">
              <div className="request-top">
                <span className="request-title">{r.title}</span>
                <span className="badge-row">
                  <span className={priorityClass(r.priority)}>{r.priority}</span>
                  <span className={statusClass(r.status)}>{r.status}</span>
                </span>
              </div>
              <p className="request-meta">
                {r.category.name} · {r.location} · from {r.user?.name}
              </p>
              <p className="request-description">{r.description}</p>
              <p className="request-date">Submitted {formatDate(r.createdAt)}</p>
              <Link className="request-link" to={`/requests/${r.id}`}>
                {r.status === "Resolved" ? "View details" : "Update status / add note"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
