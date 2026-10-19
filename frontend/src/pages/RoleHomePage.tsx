// placeholder for the admin's own tools (sprint 3: admin stories #9-#10).
// technicians and managers got their real pages in sprint 2
const COMING_SOON: Record<string, { title: string; features: string[]; sprint: string }> = {
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
