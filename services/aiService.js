import { AI_BASE_URL, AI_ENDPOINTS } from "../constants/apiConfig";

export async function getAiStudentPrediction(studentId, payload = {}) {
  if (!AI_BASE_URL) {
    return null;
  }

  const response = await fetch(`${AI_BASE_URL.replace(/\/$/, "")}${AI_ENDPOINTS.predictRisk}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      student_id: studentId,
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI prediction failed with status ${response.status}`);
  }

  return response.json();
}
