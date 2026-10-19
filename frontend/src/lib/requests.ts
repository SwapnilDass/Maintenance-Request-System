// shapes and helpers shared by every page that shows maintenance requests
// (the API shapes are documented in docs/sprint-2-api.md)

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

export interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  createdAt: string;
  userId: string;
  category: { id: number; name: string };
  user?: Person; // who submitted it (not included on /requests/mine)
  assignedTechnicianId?: string | null;
  assignedTechnician?: Person | null;
  notes?: Note[]; // only on GET /requests/:id
}

// the next status a technician can move a request to - same rules as backend/src/lib/status.ts
export const NEXT_STATUS: Record<string, string> = {
  Assigned: "In Progress",
  "In Progress": "Resolved",
};

// status is a plain string in the db, so match loosely and fall back to a neutral color for anything unknown
export function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "submitted") return "status-badge status-submitted";
  if (s.includes("progress") || s === "assigned") return "status-badge status-progress";
  if (s === "resolved" || s === "completed" || s === "closed") return "status-badge status-done";
  return "status-badge";
}

export function priorityClass(priority: string) {
  return `priority-badge priority-${priority.toLowerCase()}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
