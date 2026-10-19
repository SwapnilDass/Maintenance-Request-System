// keeps track of who's logged in across the whole app, not just the login page
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiClient } from "../api/client";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// so a page refresh doesn't log you out - we check localStorage first
function readStoredUser(): User | null {
  const raw = localStorage.getItem("user");
  return raw ? (JSON.parse(raw) as User) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);

  async function login(email: string, password: string) {
    const { data } = await apiClient.post<{ token: string; user: User }>("/auth/login", {
      email,
      password,
    });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  // api/client.ts fires this when the backend says our token is no good anymore
  useEffect(() => {
    window.addEventListener("auth:expired", logout);
    return () => window.removeEventListener("auth:expired", logout);
  }, []);

  // on page load, check the saved token with the backend so an expired one doesn't
  // leave us looking logged in (a 401 here triggers auth:expired above)
  useEffect(() => {
    if (localStorage.getItem("token")) {
      apiClient.get<User>("/auth/me").catch(() => {});
    }
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
