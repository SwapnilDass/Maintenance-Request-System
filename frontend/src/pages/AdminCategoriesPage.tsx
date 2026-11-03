// admin "Categories" page (story #10) - add, rename and delete the request categories
// customers pick from on the submit form. a category requests already use can only be renamed
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { errorMessage } from "../lib/requests";

interface Category {
  id: number;
  name: string;
  requestCount: number;
}

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // the category being renamed, and the name typed so far
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .get<Category[]>("/categories")
      .then((res) => setCategories(res.data))
      .catch(() => setError("Could not load categories."))
      .finally(() => setLoading(false));
  }, []);

  const sortByName = (list: Category[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

  // wraps each action: clears old messages, shows the backend's error if it fails
  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setSaving(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const { data } = await apiClient.post<Category>("/categories", { name: newName });
      setCategories((list) => sortByName([...list, data]));
      setMessage(`Added "${data.name}".`);
      setNewName("");
    }, "Could not add the category.");
  }

  function rename(e: FormEvent, c: Category) {
    e.preventDefault();
    run(async () => {
      const { data } = await apiClient.patch<Category>(`/categories/${c.id}`, { name: editName });
      setCategories((list) => sortByName(list.map((x) => (x.id === data.id ? data : x))));
      setMessage(`Renamed "${c.name}" to "${data.name}".`);
      setEditingId(null);
    }, "Could not rename the category.");
  }

  function remove(c: Category) {
    run(async () => {
      await apiClient.delete(`/categories/${c.id}`);
      setCategories((list) => list.filter((x) => x.id !== c.id));
      setMessage(`Deleted "${c.name}".`);
    }, "Could not delete the category.");
  }

  return (
    <div className="card card-wide">
      <h2>Categories</h2>
      <p className="empty-text">
        These are the choices on the submit form. Categories that requests already use can be renamed but not
        deleted.
      </p>

      {error && <p className="error-text">{error}</p>}
      {message && <p className="success-text">{message}</p>}
      {loading && <p className="empty-text">Loading...</p>}

      {categories.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Requests</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>
                  {editingId === c.id ? (
                    <form className="rename-form" onSubmit={(e) => rename(e, c)}>
                      <input
                        aria-label={`New name for ${c.name}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={50}
                        autoFocus
                        required
                      />
                      <button type="submit" className="btn-secondary" disabled={saving}>
                        Save
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    c.name
                  )}
                </td>
                <td>{c.requestCount}</td>
                <td className="action-cell">
                  {editingId !== c.id && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-danger"
                        onClick={() => remove(c)}
                        disabled={saving || c.requestCount > 0}
                        title={c.requestCount > 0 ? "In use - rename it instead" : undefined}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="section-heading">Add a category</h3>
      <form className="rename-form" onSubmit={add}>
        <input
          aria-label="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Carpentry"
          maxLength={50}
          required
        />
        <button type="submit" className="btn-primary" disabled={saving}>
          Add
        </button>
      </form>
    </div>
  );
}
