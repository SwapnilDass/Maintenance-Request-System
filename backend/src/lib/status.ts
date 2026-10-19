// the request statuses and the order they move in (sprint 2)
// keep these strings in one place so the API, tests and frontend all agree on spelling
//
//   Submitted --(manager assigns, #5)--> Assigned --(technician, #7)--> In Progress --(technician, #7)--> Resolved

export const STATUS = {
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
} as const;

// a request is "open" until it's resolved (story #4)
export const CLOSED_STATUSES: string[] = [STATUS.RESOLVED];

export function isOpen(status: string) {
  return !CLOSED_STATUSES.includes(status);
}

// the only status changes a technician can make, one step forward at a time (story #7)
// ex. NEXT_STATUS["Assigned"] === "In Progress". no skipping straight to Resolved, no going backwards
export const NEXT_STATUS: Record<string, string> = {
  [STATUS.ASSIGNED]: STATUS.IN_PROGRESS,
  [STATUS.IN_PROGRESS]: STATUS.RESOLVED,
};

export function canMoveTo(from: string, to: string) {
  return NEXT_STATUS[from] === to;
}
