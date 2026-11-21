import axios from "axios";

export const TOKEN_KEY = "hrm_token";
export const USER_KEY = "hrm_user";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (config.skipAuth) return config;
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.message =
        error.code === "ECONNABORTED"
          ? "Kết nối API bị timeout. Vui lòng kiểm tra backend."
          : "Không thể kết nối đến API. Kiểm tra backend đang chạy và cấu hình VITE_API_URL/proxy.";
    }
    return Promise.reject(error);
  },
);

export default api;
