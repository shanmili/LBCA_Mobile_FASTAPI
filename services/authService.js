import axios from "axios";
import Constants from "expo-constants";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/apiConfig";
import { apiClient } from "./apiClient";
import { clearAuthTokens, saveAuthSession, saveAuthTokens } from "./authToken";

function parseAuthResponse(data) {
  const token =
    data?.token ??
    data?.access_token ??
    data?.accessToken ??
    data?.tokens?.access ??
    null;

  const refresh = data?.refresh_token ?? data?.refreshToken ?? data?.tokens?.refresh ?? null;

  return { access: token, refresh };
}

function extractStudentId(data, username, role) {
  const fromResponse =
    data?.student_id ??
    data?.studentId ??
    data?.child_id ??
    data?.childId ??
    data?.student?.id ??
    null;

  if (fromResponse !== null && fromResponse !== undefined && `${fromResponse}` !== "") {
    return fromResponse;
  }

  // Parent login uses student's credentials; keep username as fallback student identifier.
  if (role === "parent") {
    return username;
  }

  return null;
}

export async function signIn(username, password, role = "parent") {
  let endpoint;
  if (role === "admin") {
    endpoint = API_ENDPOINTS.adminLogin;
  } else if (role === "parent") {
    endpoint = API_ENDPOINTS.parentLogin;
  } else {
    endpoint = API_ENDPOINTS.teacherLogin;
  }

  // Try the configured client first. If that fails with a network error
  // (common on Expo Go when the device can't reach 127.0.0.1), attempt
  // to POST to a short list of likely host candidates and use the first
  // successful response.
  let response;
  try {
    response = await apiClient.post(endpoint, { username, password });
  } catch (err) {
    // If it's not a network error, rethrow immediately
    if (err && err.response) throw err;

    // Build host candidates
    const hostCandidates = [];
    // 1) current base from config
    if (API_BASE_URL) hostCandidates.push(API_BASE_URL.replace(/\/$/, ""));

    // 1b) when running in a browser (expo web), try the current page origin
    if (typeof window !== "undefined" && window.location && window.location.origin) {
      hostCandidates.push(window.location.origin.replace(/\/$/, ""));
    }

    // 2) expo debugger/host values if available
    const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
    const dbg = (Constants.manifest2?.debuggerHost || Constants.manifest?.debuggerHost || devHost) || null;
    if (dbg) {
      const h = dbg.split(":")[0];
      if (h) hostCandidates.push(`http://${h}:8000`);
    }

    // 3) Android emulator shortcut
    hostCandidates.push("http://10.0.2.2:8000");
    // 4) local loopback as last resort
    hostCandidates.push("http://127.0.0.1:8000");

    // Deduplicate while preserving order
    const seen = new Set();
    const uniqCandidates = hostCandidates.filter((u) => {
      if (!u) return false;
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });

    let lastErr = err;
    for (const base of uniqCandidates) {
      try {
        // Try a direct axios POST to the full URL
        const url = `${base.replace(/\/$/, "")}${endpoint}`;
        // small timeout for quick failover
        response = await axios.post(url, { username, password }, { timeout: 6000, headers: { "Content-Type": "application/json" } });
        if (response) break;
      } catch (e) {
        lastErr = e;
        // continue to next candidate
        console.warn(`signIn: host candidate failed: ${base} — ${e?.message || e}`);
      }
    }

    if (!response) {
      // No candidates worked
      throw lastErr || new Error("Network error while attempting to sign in");
    }
  }
  const tokens = parseAuthResponse(response.data);
  const studentId = extractStudentId(response.data, username, role);

  if (!tokens.access) {
    throw new Error("Login succeeded but no token was returned.");
  }

  await saveAuthTokens(tokens);
  await saveAuthSession({ role, username, studentId });
  return response.data;
}

export async function signOut() {
  await clearAuthTokens();
}

export async function getLoggedParentStudentInfo() {
  const response = await apiClient.get(API_ENDPOINTS.parentStudentInfo);
  return response.data;
}
