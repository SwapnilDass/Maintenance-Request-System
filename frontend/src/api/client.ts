// wrapper around axios so every API call automatically carries our login token
import axios from "axios";

export const apiClient = axios.create({
  baseURL: "http://localhost:4000/api",
});

// runs before every request - grabs the saved token and attaches it, if we have one
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// runs after every response - a 401 means our token expired or is fake, so log out
// (skip the login call itself, a 401 there just means wrong password)
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/login")) {
      window.dispatchEvent(new Event("auth:expired")); // AuthContext listens for this
    }
    return Promise.reject(err);
  }
);
