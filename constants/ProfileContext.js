import { createContext, useContext, useEffect, useState } from "react";
import { getAuthSession } from "../services/authToken";
import { getLoggedParentStudentInfo, getStudentById } from "../services/authService";
import { getSectionIdForProfile } from "../services/scheduleService";

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState({
    loginId: "",
    firstName: "",
    lastName: "",
    middleName: "",
    gender: "",
    birthdate: "",
    address: "",
    guardianFirstName: "",
    guardianMiddleName: "",
    guardianLastName: "",
    guardianContact: "",
    guardianRelationship: "",
    gradeLevel: "",
    section: "",
    sectionId: null,
    studentId: null,
    photo: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const [info, session] = await Promise.all([
          getLoggedParentStudentInfo(),
          getAuthSession(),
        ]);

        const studentId = info?.student_id ?? info?.studentId ?? null;
        const fullStudent = studentId
          ? await getStudentById(studentId).catch(() => null)
          : null;

        const source = fullStudent ?? info ?? {};

        if (mounted) {
          const sectionId = await getSectionIdForProfile({
            section: source.section ?? info?.section ?? "",
            gradeLevel: source.grade_level ?? info?.grade_level ?? "",
          }).catch(() => null);

          setProfile((prev) => ({
            ...prev,
            loginId: session?.username || "",
            firstName: source.first_name || info?.first_name || "",
            lastName: source.last_name || info?.last_name || "",
            middleName: source.middle_name || info?.middle_name || "",
            gender: source.gender || info?.gender || "",
            birthdate: source.birth_date || source.birthdate || info?.birth_date || info?.birthdate || "",
            address: source.address || info?.address || "",
            guardianFirstName: source.guardian_first_name || info?.guardian_first_name || "",
            guardianMiddleName: source.guardian_mid_name || info?.guardian_mid_name || "",
            guardianLastName: source.guardian_last_name || info?.guardian_last_name || "",
            guardianContact: source.guardian_contact || info?.guardian_contact || "",
            guardianRelationship: source.guardian_relationship || info?.guardian_relationship || "",
            gradeLevel: source.grade_level || info?.grade_level || "",
            section: source.section || info?.section || "",
            sectionId: sectionId ?? null,
            studentId: source.student_id || info?.student_id || null,
          }));
        }
      } catch (e) {
        console.log("ProfileContext error:", e?.response?.data || e?.message || e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const updateProfile = (fields) =>
    setProfile((prev) => ({ ...prev, ...fields }));

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, loading }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}