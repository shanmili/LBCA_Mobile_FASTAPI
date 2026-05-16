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

  const refresh =
    data?.refresh_token ?? data?.refreshToken ?? data?.tokens?.refresh ?? null;

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

  const response = await apiClient.post(endpoint, { username, password });

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