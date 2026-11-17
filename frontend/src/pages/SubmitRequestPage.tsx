// form for an employee/customer to report a maintenance problem (story #2).
// sprint 4: no priority field - the system scores the request and picks the priority (stories #15, #16)
import { type FormEvent, useEffect, useState } from "react";
import axios from "axios";
import { apiClient } from "../api/client";
import { Select } from "../components/Select";

interface Category {
  id: number;
  name: string;
}

// onSubmitted lets App tell the "My requests" list to reload (story #3)
export function SubmitRequestPage({ onSubmitted }: { onSubmitted?: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // load the dropdown options once when the page opens
  useEffect(() => {
    apiClient
      .get<Category[]>("/categories")
      .then((res) => setCategories(res.data))
      .catch(() => setError("Could not load categories."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    // the custom dropdown can't use the browser's "required", so check it here
    if (!categoryId) {
      setError("Please choose a category.");
      return;
    }
    setSubmitting(true);
    try {
      // apiClient adds our login token to the request automatically
      const { data } = await apiClient.post<{ priority: string }>("/requests", {
        title,
        description,
        location,
        categoryId: Number(categoryId),
      });
      setSuccess(`Request submitted! Status: Submitted · Priority: ${data.priority} (set automatically)`);
      // clear the form so they can submit another one
      setTitle("");
      setDescription("");
      setLocation("");
      setCategoryId("");
      onSubmitted?.();
    } catch (err) {
      // show the backend's message if it sent one (ex. "Title is required")
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Could not submit request. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2>Submit a maintenance request</h2>
      <form onSubmit={handleSubmit}>
        <label className="field">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="field">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={1000}
            required
          />
        </label>
        <label className="field">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Building A, room 204"
            maxLength={100}
            required
          />
        </label>
        {/* div + htmlFor instead of wrapping in <label>: a click inside the open list would otherwise
            bubble to the label and reopen it */}
        <div className="field">
          <label htmlFor="request-category">Category</label>
          <Select
            id="request-category"
            ariaLabel="Category"
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Select a category"
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </div>
        <p className="form-hint">
          Priority is set automatically from the category and the problem you describe, so urgent issues
          (like sparks, gas or flooding) get handled first.
        </p>
        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit request"}
        </button>
      </form>
    </div>
  );
}
