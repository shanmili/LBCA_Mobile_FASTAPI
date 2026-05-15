import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const AUTH_SESSION_KEY = "auth_session";

function getStorageAdapter() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      async setItemAsync(key, value) {
        window.localStorage.setItem(key, value);
      },
      async getItemAsync(key) {
        return window.localStorage.getItem(key);
      },
      async deleteItemAsync(key) {
        window.localStorage.removeItem(key);
      },
    };
  }

  return SecureStore;
}

const storage = getStorageAdapter();

export async function saveAuthTokens({ access, refresh }) {
  if (access) {
    await storage.setItemAsync(ACCESS_TOKEN_KEY, access);
  }
  if (refresh) {
    await storage.setItemAsync(REFRESH_TOKEN_KEY, refresh);
  }
}

export async function getAccessToken() {
  return storage.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAuthTokens() {
  await storage.deleteItemAsync(ACCESS_TOKEN_KEY);
  await storage.deleteItemAsync(REFRESH_TOKEN_KEY);
  await storage.deleteItemAsync(AUTH_SESSION_KEY);
}

export async function saveAuthSession(session) {
  await storage.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(session || {}));
}

export async function getAuthSession() {
  const raw = await storage.getItemAsync(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
