import axios from "axios";
import { API_BASE_URL } from "../constants/apiConfig";
import { getAccessToken } from "./authToken";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;  // ← changed Token to Bearer
  }
  return config;
});