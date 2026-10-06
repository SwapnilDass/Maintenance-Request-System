// landing page for technicians, managers and admins - their real features come in later sprints
// (sprint 2: technician + manager stories #4-#7, sprint 3: admin stories #9-#10)
const COMING_SOON: Record<string, { title: string; features: string[]; sprint: string }> = {
  TECHNICIAN: {
    title: "Technician dashboard",
    features: ["View requests assigned to me", "Update status and add notes"],
    sprint: "Sprint 2",
  },
  MANAGER: {
    title: "Manager dashboard",
    features: ["See all open requests", "Assign requests to technicians"],
    sprint: "Sprint 2",
  },
  ADMIN: {
    title: "Admin dashboard",
    features: ["Manage users and roles", "Manage request categories"],
    sprint: "Sprint 3",
  },
};

export function RoleHomePage({ role }: { role: string }) {
  const page = COMING_SOON[role];

  return (
    <div className="card">
      <h2>{page.title}</h2>
      <p className="empty-text">Coming in {page.sprint}:</p>
      <ul className="feature-list">
        {page.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
