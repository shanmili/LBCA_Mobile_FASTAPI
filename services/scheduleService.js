import { API_ENDPOINTS } from "../constants/apiConfig";
import { apiClient } from "./apiClient";

const normalizeList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const normalizeGradeText = (value) => {
  const cleaned = normalizeText(value);
  if (!cleaned) return "";
  const digits = cleaned.replace(/grade/g, "");
  return digits.replace(/[^0-9]+/g, "");
};

export async function getClassSchedules(sectionId = null) {
  if (!sectionId) {
    return [];
  }

  const response = await apiClient.get(API_ENDPOINTS.classSchedules, {
    params: { section_id: sectionId },
  });
  return normalizeList(response.data);
}

export async function getSubjects() {
  const response = await apiClient.get(API_ENDPOINTS.subjects);
  return normalizeList(response.data);
}

export async function getSections() {
  const response = await apiClient.get(API_ENDPOINTS.sections);
  return normalizeList(response.data);
}

export function resolveSectionId(profile, sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return null;
  }

  const requestedSection = normalizeText(profile?.section);
  const requestedGrade = normalizeGradeText(profile?.gradeLevel);

  const candidates = sections.filter((section) => {
    const sectionName = normalizeText(section?.name);
    const sectionCode = normalizeText(section?.section_code);
    const sectionGrade = normalizeGradeText(section?.grade_level_display);

    const nameMatch = requestedSection && (sectionName === requestedSection || sectionCode === requestedSection);
    const gradeMatch = !requestedGrade || !sectionGrade || requestedGrade === sectionGrade;

    return nameMatch && gradeMatch;
  });

  if (candidates.length === 1) {
    return candidates[0]?.section_id ?? null;
  }

  const fallback = sections.find((section) => {
    const sectionName = normalizeText(section?.name);
    const sectionCode = normalizeText(section?.section_code);

    return requestedSection && (sectionName === requestedSection || sectionCode === requestedSection);
  });

  return fallback?.section_id ?? null;
}

export async function getSectionIdForProfile(profile) {
  const sections = await getSections();
  return resolveSectionId(profile, sections);
}
