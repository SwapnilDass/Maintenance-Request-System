// manager/admin dashboard (story #11) - request counts, completion rate, average time to resolve,
// open requests by priority and each technician's workload. numbers come from GET /api/metrics
import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { priorityClass, statusClass } from "../lib/requests";

interface Metrics {
  total: number;
  open: number;
  resolved: number;
  completionRate: number;
  avgResolveHours: number | null;
  byStatus: { status: string; count: number }[];
  openByPriority: { priority: string; count: number }[];
  workload: { id: string; name: string; assigned: number; inProgress: number; open: number; resolved: number }[];
}

// "26.5 hrs" under 2 days, otherwise "3.1 days"
function formatDuration(hours: number) {
  return hours < 48 ? `${hours} hrs` : `${Math.round((hours / 24) * 10) / 10} days`;
}

// one row of a bar chart: label, a bar sized against the biggest value, and the number
function BarRow({ label, value, max, labelClass }: { label: string; value: number; max: number; labelClass: string }) {
  return (
    <li className="bar-row">
      <span className={labelClass}>{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${max === 0 ? 0 : (value / max) * 100}%` }} />
      </span>
      <span className="bar-value">{value}</span>
    </li>
  );
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Metrics>("/metrics")
      .then((res) => {
        if (cancelled) return;
        setMetrics(res.data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const maxStatus = Math.max(0, ...(metrics?.byStatus.map((s) => s.count) ?? []));
  const maxPriority = Math.max(0, ...(metrics?.openByPriority.map((p) => p.count) ?? []));
  const maxWorkload = Math.max(0, ...(metrics?.workload.map((w) => w.open) ?? []));

  return (
    <div className="card card-wide">
      <div className="card-header">
        <h2>Dashboard</h2>
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

      {metrics && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-value">{metrics.total}</span>
              <span className="stat-label">Total requests</span>
            </div>
            <div className="stat">
              <span className="stat-value">{metrics.open}</span>
              <span className="stat-label">Open</span>
            </div>
            <div className="stat">
              <span className="stat-value">{metrics.completionRate}%</span>
              <span className="stat-label">Completion rate</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {metrics.avgResolveHours === null ? "—" : formatDuration(metrics.avgResolveHours)}
              </span>
              <span className="stat-label">Avg. time to resolve</span>
            </div>
          </div>

          <h3 className="section-heading">Requests by status</h3>
          <ul className="bar-list">
            {metrics.byStatus.map((s) => (
              <BarRow key={s.status} label={s.status} value={s.count} max={maxStatus} labelClass={statusClass(s.status)} />
            ))}
          </ul>

          <h3 className="section-heading">Open requests by priority</h3>
          <ul className="bar-list">
            {metrics.openByPriority.map((p) => (
              <BarRow
                key={p.priority}
                label={p.priority}
                value={p.count}
                max={maxPriority}
                labelClass={priorityClass(p.priority)}
              />
            ))}
          </ul>

          <h3 className="section-heading">Technician workload</h3>
          {metrics.workload.length === 0 ? (
            <p className="empty-text">No active technicians.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Assigned</th>
                  <th>In progress</th>
                  <th>Resolved</th>
                  <th className="workload-bar-col">Open work</th>
                </tr>
              </thead>
              <tbody>
                {metrics.workload.map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td>{w.assigned}</td>
                    <td>{w.inProgress}</td>
                    <td>{w.resolved}</td>
                    <td className="workload-bar-col">
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          style={{ width: `${maxWorkload === 0 ? 0 : (w.open / maxWorkload) * 100}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
