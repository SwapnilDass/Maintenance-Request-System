// one request with its notes (story #7 - "so that everyone sees progress").
// everyone who can see the request reads the notes; the assigned technician moves the status forward;
// the assigned technician and managers/admins can add notes. the backend enforces all of this too
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { homeFor } from "../auth/roles";
import {
  formatDate,
  NEXT_STATUS,
  priorityClass,
  statusClass,
  type MaintenanceRequest,
  type Note,
} from "../lib/requests";

function errorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err) && err.response?.data?.error) return err.response.data.error as string;
  return fallback;
}

export function RequestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<MaintenanceRequest>(`/requests/${id}`)
      .then((res) => {
        if (!cancelled) setRequest(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 404) setLoadError("This request doesn't exist.");
        else if (status === 403) setLoadError("You don't have access to this request.");
        else setLoadError("Could not load this request.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const backLink = (
    <Link className="request-link" to={homeFor(user?.role ?? "")}>
      ← Back
    </Link>
  );

  if (loadError) {
    return (
      <div className="card card-wide">
        <p className="error-text">{loadError}</p>
        {backLink}
      </div>
    );
  }
  if (!request) {
    return (
      <div className="card card-wide">
        <p className="empty-text">Loading...</p>
      </div>
    );
  }

  const isAssignedTech = user?.role === "TECHNICIAN" && request.assignedTechnicianId === user.id;
  const canAddNote = isAssignedTech || user?.role === "MANAGER" || user?.role === "ADMIN";
  const nextStatus = isAssignedTech ? NEXT_STATUS[request.status] : undefined;

  async function moveStatus(status: string) {
    setError(null);
    setSaving(true);
    try {
      const { data } = await apiClient.patch<MaintenanceRequest>(`/requests/${id}/status`, { status });
      // the PATCH response has no notes, so keep the ones already on screen
      setRequest((r) => (r ? { ...r, ...data, notes: r.notes } : r));
    } catch (err) {
      setError(errorMessage(err, "Could not update the status."));
    } finally {
      setSaving(false);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data } = await apiClient.post<Note>(`/requests/${id}/notes`, { body: noteText });
      setRequest((r) => (r ? { ...r, notes: [...(r.notes ?? []), data] } : r));
      setNoteText("");
    } catch (err) {
      setError(errorMessage(err, "Could not add the note."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-wide">
      {backLink}
      <div className="request-top detail-top">
        <h2>{request.title}</h2>
        <span className="badge-row">
          <span className={priorityClass(request.priority)}>{request.priority}</span>
          <span className={statusClass(request.status)}>{request.status}</span>
        </span>
      </div>

      <p className="request-meta">
        {request.category.name} · {request.location}
      </p>
      <p className="request-description">{request.description}</p>
      <dl className="detail-list">
        <dt>Submitted by</dt>
        <dd>{request.user?.name}</dd>
        <dt>Submitted</dt>
        <dd>{formatDate(request.createdAt)}</dd>
        <dt>Technician</dt>
        <dd>{request.assignedTechnician?.name ?? "Not assigned yet"}</dd>
      </dl>

      {nextStatus && (
        <button
          type="button"
          className="btn-primary detail-action"
          onClick={() => moveStatus(nextStatus)}
          disabled={saving}
        >
          Mark as {nextStatus}
        </button>
      )}

      {error && <p className="error-text">{error}</p>}

      <h3 className="notes-heading">Notes</h3>
      {request.notes && request.notes.length > 0 ? (
        <ul className="note-list">
          {request.notes.map((n) => (
            <li key={n.id} className="note-item">
              <p className="note-body">{n.body}</p>
              <p className="request-date">
                {n.author.name} ({n.author.role}) · {formatDate(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">No notes yet.</p>
      )}

      {canAddNote && (
        <form className="note-form" onSubmit={addNote}>
          <label className="field">
            Add a note
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Ordered a replacement part, back Thursday"
              required
            />
          </label>
          <button type="submit" className="btn-secondary" disabled={saving || !noteText.trim()}>
            Add note
          </button>
        </form>
      )}
    </div>
  );
}
