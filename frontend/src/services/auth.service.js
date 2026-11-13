import api, { TOKEN_KEY, USER_KEY } from "./api.js";

export const saveSession = (token, user) => {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
};

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);

export const getCurrentUser = () => {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    clearSession();
    return null;
  }
};

export const hasPermission = (permissionCode, user = getCurrentUser()) => {
  if (!permissionCode || !user) return false;
  return Array.isArray(user.permissions)
    ? user.permissions.includes(permissionCode)
    : false;
};

export const hasAnyPermission = (permissionCodes = [], user = getCurrentUser()) => {
  return permissionCodes.some((code) => hasPermission(code, user));
};

export const login = async (identifier, password) => {
  const response = await api.post("/auth/login", { identifier, password });
  const { token, user } = response.data;

  saveSession(token, user);

  return response.data;
};

export const getMe = async () => {
  const response = await api.get("/auth/me");

  if (response.data?.user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
  }

  return response.data.user;
};

export const getEmployees = async () => {
  const response = await api.get("/auth/employees");
  return response.data;
};

export const logout = () => {
  clearSession();
  window.location.href = "/";
};
