// admin "Users" page (story #9) - add users, change roles, deactivate/reactivate.
// uses the /api/users admin routes; the backend stops an admin changing their own role or deactivating themselves
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { Select } from "../components/Select";
import { useAuth } from "../context/AuthContext";
import { errorMessage, formatDate } from "../lib/requests";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const ROLE_OPTIONS = ["CUSTOMER", "TECHNICIAN", "MANAGER", "ADMIN"].map((r) => ({ value: r, label: r }));

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // add-user form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("CUSTOMER");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiClient
      .get<AdminUser[]>("/users")
      .then((res) => setUsers(res.data))
      .catch(() => setError("Could not load users."))
      .finally(() => setLoading(false));
  }, []);

  // swap the changed user into the list (keeps the row where it is so it doesn't jump while you're working)
  function replace(updated: AdminUser) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function changeRole(u: AdminUser, newRole: string) {
    if (newRole === u.role) return;
    setError(null);
    setMessage(null);
    setSavingId(u.id);
    try {
      const { data } = await apiClient.patch<AdminUser>(`/users/${u.id}/role`, { role: newRole });
      replace(data);
      setMessage(`${data.name} is now a ${data.role}.`);
    } catch (err) {
      setError(errorMessage(err, "Could not change the role."));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(u: AdminUser) {
    setError(null);
    setMessage(null);
    setSavingId(u.id);
    try {
      const { data } = await apiClient.patch<AdminUser>(`/users/${u.id}/active`, { active: !u.active });
      replace(data);
      setMessage(data.active ? `${data.name} can log in again.` : `${data.name} was deactivated and can't log in.`);
    } catch (err) {
      setError(errorMessage(err, "Could not update the user."));
    } finally {
      setSavingId(null);
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setAdding(true);
    try {
      const { data } = await apiClient.post<AdminUser>("/users", { name, email, password, role });
      setUsers((list) => [...list, data]);
      setMessage(`Added ${data.name} (${data.role}). Give them their password so they can log in.`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("CUSTOMER");
    } catch (err) {
      setError(errorMessage(err, "Could not add the user."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="card card-wide">
      <h2>Users</h2>

      {error && <p className="error-text">{error}</p>}
      {message && <p className="success-text">{message}</p>}
      {loading && <p className="empty-text">Loading...</p>}

      {users.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id} className={u.active ? "" : "row-inactive"}>
                  <td>
                    <span className="cell-main">
                      {u.name}
                      {isMe && " (you)"}
                    </span>
                    <span className="cell-sub">
                      {u.email} · added {formatDate(u.createdAt)}
                    </span>
                  </td>
                  <td className="role-cell">
                    {isMe ? (
                      u.role
                    ) : (
                      <Select
                        ariaLabel={`Role for ${u.name}`}
                        value={u.role}
                        onChange={(v) => changeRole(u, v)}
                        options={ROLE_OPTIONS}
                      />
                    )}
                  </td>
                  <td>
                    <span className={u.active ? "status-badge status-done" : "status-badge"}>
                      {u.active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="action-cell">
                    {!isMe && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => toggleActive(u)}
                        disabled={savingId === u.id}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3 className="section-heading">Add a user</h3>
      <form className="inline-form" onSubmit={addUser}>
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Starting password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </label>
        <div className="field">
          <label htmlFor="new-user-role">Role</label>
          <Select id="new-user-role" ariaLabel="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        </div>
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? "Adding..." : "Add user"}
        </button>
      </form>
    </div>
  );
}
