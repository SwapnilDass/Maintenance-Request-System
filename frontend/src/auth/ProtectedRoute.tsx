// route guard (story #1) - wrap a page in this so only logged in users with the right role can see it
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeFor, type Role } from "./roles";

export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();

  // not logged in -> login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // logged in but wrong role (ex. a technician typing /requests in the url) -> send them to their own page
  if (!roles.includes(user.role as Role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return <>{children}</>;
}
