import api from "./api.js";
export const login = async (data) => {
  const response = await api.post("/auth/login", data);
  return response.data;
};
