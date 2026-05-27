import { API_ENDPOINTS } from "../constants/apiConfig";
import { apiClient } from "./apiClient";

const normalizeList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

export async function listEarlyWarnings({
  studentId,
  enrollmentId,
  riskLevel,
} = {}) {
  const params = {};
  if (studentId) params.student_id = studentId;
  if (enrollmentId) params.enrollment_id = enrollmentId;
  if (riskLevel && riskLevel !== "all") params.risk_level = riskLevel;

  const response = await apiClient.get(API_ENDPOINTS.earlyWarnings, { params });
  return normalizeList(response.data);
}

export async function getStudentWarnings(studentId) {
  try {
    const response = await apiClient.get(
      API_ENDPOINTS.studentWarningsById(studentId),
    );
    // Backend returns { message: "No warnings..." } when empty — handle gracefully
    if (response.data?.message) return [];
    return normalizeList(response.data);
  } catch (err) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
}

export async function getStudentPace(studentId) {
  try {
    const response = await apiClient.get(
      API_ENDPOINTS.studentPaceById(studentId),
    );
    // Backend returns 404 JSON { error: "..." } when no records — handle gracefully
    if (response.data?.error) return [];
    return normalizeList(response.data);
  } catch (err) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
}

export async function getCriticalWarnings() {
  const response = await apiClient.get(API_ENDPOINTS.criticalWarnings);
  return normalizeList(response.data);
}
