import { createContext, useContext, useEffect, useState } from "react";
import { getLoggedParentStudentInfo } from "../services/authService";

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
    email: "",
    address: "",
    guardianName: "",
    gradeLevel: "",
    section: "",
    studentId: null,
    photo: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        const info = await getLoggedParentStudentInfo();
        console.log("student-info response:", info);
        if (mounted && info) {
          setProfile((prev) => ({
            ...prev,
            firstName: info.first_name || "",
            lastName: info.last_name || "",
            middleName: info.middle_name || "",
            gradeLevel: info.grade_level || "",
            section: info.section || "",
            studentId: info.student_id || null,
            guardianName: info.guardian_first_name
              ? `${info.guardian_first_name} ${info.guardian_last_name || ""}`.trim()
              : "",
          }));
        }
      } catch (e) {
        console.log("ProfileContext error:", e?.response?.data || e?.message || e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadProfile();
    return () => { mounted = false; };
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