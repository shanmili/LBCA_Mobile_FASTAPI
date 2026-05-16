import Constants from "expo-constants";
import { Platform } from "react-native";

console.log("API BASE URL:", process.env.EXPO_PUBLIC_API_BASE_URL);

function normalizeHost(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const withoutScheme = raw.replace(/^(https?:\/\/|exp:\/\/|exps:\/\/)/i, "");
  const hostPort = withoutScheme.split("/")[0];
  const host = hostPort.split(":")[0];

  return host || null;
}

// Prefer an explicit Expo env override, then an explicit extra.apiBaseUrl,
// then the runtime dev host (expo debugger/hostUri), then local fallbacks.
const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const explicitExtra = Constants.expoConfig?.extra?.apiBaseUrl;

// Try to derive the device/host IP from multiple runtime locations.
// If a hostUri/debuggerHost includes a port, normalizeHost will strip it and
// we append the API port (8000) below so the backend address is consistent.
const runtimeHost =
  normalizeHost(Constants.expoGoConfig?.debuggerHost) ||
  normalizeHost(Constants.manifest2?.debuggerHost) ||
  normalizeHost(Constants.manifest?.debuggerHost) ||
  normalizeHost(Constants.expoConfig?.hostUri) ||
  (Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : null);

export const API_BASE_URL =
  envBaseUrl ||
  explicitExtra ||
  (Platform.OS === "android" && __DEV__ ? "http://10.0.2.2:8000" : null) ||
  (runtimeHost ? `http://${runtimeHost}:8000` : "http://127.0.0.1:8000");


export const API_ENDPOINTS = {
  adminLogin: "/api/admin/login/",
  teacherLogin: "/api/teacher/login/",
  parentLogin: "/api/parent/login/",
  parentStudentInfo: "/api/parent/student-info/",

  earlyWarnings: "/api/early-warnings/",
  criticalWarnings: "/api/early-warnings/critical",
  studentPaceById: (studentId) => `/api/students/${studentId}/paces`,
  studentWarningsById: (studentId) => `/api/students/${studentId}/warnings`,
};
