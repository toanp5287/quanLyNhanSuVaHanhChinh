import axios from "axios";

export const TOKEN_KEY = "hrm_token";
export const USER_KEY = "hrm_user";
export const LOGIN_IP_BLOCK_KEY = "hrm_login_ip_block";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  if (config.skipAuth) return config;
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    if (status === 403 && data?.code === "LOGIN_IP_NOT_ALLOWED") {
      sessionStorage.setItem(
        LOGIN_IP_BLOCK_KEY,
        JSON.stringify({
          message: data.message || "Địa chỉ IP hiện tại không được phép đăng nhập hoặc sử dụng hệ thống.",
          clientIp: data.clientIp || "",
          at: Date.now(),
        }),
      );
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hrm:login-ip-blocked", { detail: data }));
        if (!window.location.hash.includes("/login")) {
          window.location.hash = "#/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
