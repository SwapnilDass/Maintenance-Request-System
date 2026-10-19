// which page each role lands on after logging in (story #1)
export type Role = "CUSTOMER" | "TECHNICIAN" | "MANAGER" | "ADMIN";

export const HOME_FOR_ROLE: Record<Role, string> = {
  CUSTOMER: "/requests",
  TECHNICIAN: "/technician",
  MANAGER: "/manager",
  ADMIN: "/admin",
};

export function homeFor(role: string) {
  return HOME_FOR_ROLE[role as Role] ?? "/login";
}
