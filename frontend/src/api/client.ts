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
