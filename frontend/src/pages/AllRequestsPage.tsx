// manager/admin "All Requests" page - every open request (story #4) with an assign dropdown (story #5)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { apiClient } from "../api/client";
import { Select } from "../components/Select";
import {
  formatDate,
  priorityClass,
  statusClass,
  type MaintenanceRequest,
  type Person,
} from "../lib/requests";

export function AllRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [technicians, setTechnicians] = useState<Person[]>([]);
  // which technician is picked in each row's dropdown, by request id
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<MaintenanceRequest[]>("/requests/open"),
      apiClient.get<Person[]>("/users/technicians"),
    ])
      .then(([reqRes, techRes]) => {
        if (cancelled) return;
        setRequests(reqRes.data);
        setTechnicians(techRes.data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load requests.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  async function assign(request: MaintenanceRequest) {
    const technicianId = picked[request.id] ?? request.assignedTechnicianId ?? "";
    if (!technicianId) {
      setError("Pick a technician first.");
      return;
    }
    setError(null);
    setMessage(null);
    setAssigningId(request.id);
    try {
      const { data } = await apiClient.patch<MaintenanceRequest>(`/requests/${request.id}/assign`, {
        technicianId,
      });
      // swap the updated request into the list so the status/technician change shows right away
      setRequests((list) => list.map((r) => (r.id === data.id ? data : r)));
      setMessage(`"${data.title}" assigned to ${data.assignedTechnician?.name}.`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Could not assign the request.");
      }
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <div className="card card-wide">
      <div className="card-header">
        <h2>All open requests</h2>
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
      {message && <p className="success-text">{message}</p>}

      {!error && !loading && requests.length === 0 && (
        <p className="empty-text">No open requests. Everything is resolved.</p>
      )}

      {requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r) => {
            const value = picked[r.id] ?? r.assignedTechnicianId ?? "";
            const unchanged = value === (r.assignedTechnicianId ?? "");
            return (
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
                <p className="request-date">Submitted {formatDate(r.createdAt)}</p>

                <div className="assign-row">
                  <Select
                    ariaLabel={`Technician for ${r.title}`}
                    value={value}
                    onChange={(v) => setPicked((p) => ({ ...p, [r.id]: v }))}
                    placeholder="Unassigned"
                    options={technicians.map((t) => ({ value: t.id, label: t.name }))}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => assign(r)}
                    disabled={!value || unchanged || assigningId === r.id}
                  >
                    {assigningId === r.id ? "Assigning..." : r.assignedTechnicianId ? "Reassign" : "Assign"}
                  </button>
                  <Link className="request-link" to={`/requests/${r.id}`}>
                    Details
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
