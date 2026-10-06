// form for an employee/customer to report a maintenance problem (story #2)
import { type FormEvent, useEffect, useState } from "react";
import axios from "axios";
import { apiClient } from "../api/client";

interface Category {
  id: number;
  name: string;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function SubmitRequestPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
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
    setSubmitting(true);
    try {
      // apiClient adds our login token to the request automatically
      await apiClient.post("/requests", {
        title,
        description,
        location,
        categoryId: Number(categoryId),
        priority,
      });
      setSuccess("Request submitted! Status: Submitted");
      // clear the form so they can submit another one
      setTitle("");
      setDescription("");
      setLocation("");
      setCategoryId("");
      setPriority("MEDIUM");
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
        <label className="field">
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit request"}
        </button>
      </form>
    </div>
  );
}
