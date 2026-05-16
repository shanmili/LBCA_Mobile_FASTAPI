import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { subjectColors } from "../../../constants/data";
import { useTheme } from "../../../constants/useTheme";
import { getStudentPace, getStudentWarnings } from "../../../services/earlyWarningService";

const riskColorMap = {
  critical: "red",
  high: "amber",
  moderate: "amber",
  low: "green",
};
const riskLabels = {
  critical: "Critical",
  high: "High Risk",
  moderate: "Moderate",
  low: "Low Risk",
};
const trendIconNames = {
  declining: "arrow-down",
  stable: "remove",
  improving: "arrow-up",
};

const riskRank = { critical: 4, high: 3, moderate: 2, low: 1 };

const normalizeTrend = (value) => {
  if (!value) return "stable";
  const t = String(value).toLowerCase();
  if (t.includes("improv")) return "improving";
  if (t.includes("declin")) return "declining";
  return "stable";
};

const normalizeRisk = (value) => {
  if (!value) return "low";
  const v = String(value).toLowerCase();
  if (v.includes("critical")) return "critical";
  if (v.includes("high")) return "high";
  if (v.includes("moderate")) return "moderate";
  return "low";
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const getEmptyStudent = (baseStudent = null) => ({
  id: baseStudent?.id || "",
  firstName: baseStudent?.firstName || "",
  middleName: baseStudent?.middleName || "",
  lastName: baseStudent?.lastName || "",
  gradeLevel: baseStudent?.gradeLevel || "",
  section: baseStudent?.section || "",
  riskLevel: "low",
  pacesBehind: 0,
  guardianLastName: "",
  guardianContact: "",
  pacePercent: 0,
  attendance: 0,
  status: "On Track",
  trend: "stable",
  lastActivity: "",
  subjects: [],
});

const buildStudentFromApi = (paceData, warningsData, fallback) => {
  const warnings = asList(warningsData);
  const paceRecords = asList(paceData);
  const pace = paceRecords[0] || {};

  const warningBySubject = warnings.reduce((acc, w) => {
    const key = (w.subject || "").toLowerCase();
    if (key) acc[key] = w;
    return acc;
  }, {});

  const seenSubjects = new Set();
  const subjectsFromPace = paceRecords.reduce((acc, p) => {
      const key = (p.subject || "").toLowerCase();
      if (!key || seenSubjects.has(key)) return acc;
      seenSubjects.add(key);
      const relatedWarning = warningBySubject[key] || {};
      acc.push({
        subject: p.subject || "",
        pacePercent: toNumber(p.pace_percent ?? p.pacePercent, 0),
        pacesBehind: toNumber(p.paces_behind ?? p.pacesBehind, 0),
        teacher: relatedWarning.teacher || "",
        status: relatedWarning.status || "On Track",
        trend: normalizeTrend(relatedWarning.trend),
      });
      return acc;
    }, []);

  const subjectsFromWarnings = warnings.map((w) => ({
    subject: w.subject || "",
    pacePercent: toNumber(w.pace_percent ?? w.pacePercent, 0),
    pacesBehind: toNumber(w.paces_behind ?? w.pacesBehind, 0),
    teacher: w.teacher || "",
    status: w.status || "Warning",
    trend: normalizeTrend(w.trend),
  }));

  const subjects = subjectsFromPace.length > 0 ? subjectsFromPace : subjectsFromWarnings;

  const highestRisk = warnings.reduce((acc, item) => {
    const r = normalizeRisk(item.risk_level ?? item.riskLevel);
    return riskRank[r] > riskRank[acc] ? r : acc;
  }, fallback.riskLevel || "low");

  const avgPace =
    subjectsFromPace.length > 0
      ? Math.round(
          subjectsFromPace.reduce((sum, s) => sum + toNumber(s.pacePercent), 0) /
            subjectsFromPace.length,
        )
      : subjects.length > 0
        ? Math.round(subjects.reduce((sum, s) => sum + toNumber(s.pacePercent), 0) / subjects.length)
        : fallback.pacePercent;

  const totalBehind =
    subjects.length > 0
      ? subjects.reduce((sum, s) => sum + toNumber(s.pacesBehind), 0)
      : fallback.pacesBehind;

  return {
    ...fallback,
    firstName: pace.first_name || pace.firstName || fallback.firstName,
    middleName: pace.middle_name || pace.middleName || fallback.middleName,
    lastName: pace.last_name || pace.lastName || fallback.lastName,
    gradeLevel: pace.grade_level || pace.gradeLevel || fallback.gradeLevel,
    section: pace.section || fallback.section,
    riskLevel: normalizeRisk(pace.risk_level ?? pace.riskLevel ?? highestRisk),
    pacesBehind: toNumber(pace.paces_behind ?? pace.pacesBehind, totalBehind),
    guardianLastName: pace.guardian_last_name || pace.guardianLastName || fallback.guardianLastName,
    guardianContact: pace.guardian_contact || pace.guardianContact || fallback.guardianContact,
    pacePercent: toNumber(pace.pace_percent ?? pace.pacePercent, avgPace),
    attendance: toNumber(pace.attendance ?? pace.attendance_percent, fallback.attendance),
    status: pace.status || fallback.status,
    trend: normalizeTrend(pace.trend || (warnings[0] && warnings[0].trend) || fallback.trend),
    lastActivity: pace.last_activity || pace.lastActivity || (warnings[0] && (warnings[0].last_activity || warnings[0].lastActivity)) || fallback.lastActivity,
    subjects: subjects.length > 0 ? subjects : fallback.subjects,
  };
};

const MyRiskDetail = ({ onBack, studentId, baseStudent = null }) => {
  const { colors } = useTheme();
  const [studentData, setStudentData] = useState(getEmptyStudent(baseStudent));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    if (!studentId) {
      setStudentData(getEmptyStudent(baseStudent));
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const loadStudentData = async () => {
      try {
        const [paceResult, warningResult] = await Promise.allSettled([
          getStudentPace(studentId),
          getStudentWarnings(studentId),
        ]);

        const paceData = paceResult.status === "fulfilled" ? paceResult.value : null;
        const warningsData = warningResult.status === "fulfilled" ? warningResult.value : [];

        if (isMounted) {
          setStudentData(buildStudentFromApi(paceData, warningsData, getEmptyStudent(baseStudent)));
        }
      } catch {
        if (isMounted) {
          setStudentData(getEmptyStudent(baseStudent));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadStudentData();

    return () => {
      isMounted = false;
    };
  }, [studentId, baseStudent]);

  const s = useMemo(() => studentData || getEmptyStudent(baseStudent), [studentData, baseStudent]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ marginTop: 10, color: colors.muted, fontSize: 13 }}>
          Loading student risk details...
        </Text>
      </View>
    );
  }

  if (!studentId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>
          Unable to load student profile from backend. Please re-login and try again.
        </Text>
      </View>
    );
  }

  const riskColor = colors[riskColorMap[s.riskLevel]];
  const trendColor =
    s.trend === "improving"
      ? colors.green
      : s.trend === "declining"
        ? colors.red
        : colors.muted;
  const paceColor =
    s.pacePercent >= 85
      ? colors.green
      : s.pacePercent >= 65
        ? colors.amber
        : colors.red;
  const attColor =
    s.attendance >= 90
      ? colors.green
      : s.attendance >= 75
        ? colors.amber
        : colors.red;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.7}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}
      >
        <Ionicons
          name="arrow-back"
          size={18}
          color={colors.accent}
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.accent }}>
          Back to Dashboard
        </Text>
      </TouchableOpacity>

      {/* Header */}
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: colors.text,
          marginBottom: 4,
        }}
      >
        Risk Assessment
      </Text>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
        Your child's PACE progress overview
      </Text>

      {/* Student card */}
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: `${colors.accent}22`,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: "800", color: colors.accent }}
            >
              {s.firstName?.[0] || "?"}
              {s.lastName?.[0] || "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 16, fontWeight: "800", color: colors.text }}
            >
              {s.lastName}, {s.firstName}{" "}
              {s.middleName ? `${s.middleName[0]}.` : ""}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              ID: {s.id} • {s.gradeLevel} — {s.section}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: `${riskColor}22`,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: riskColor }}>
              {riskLabels[s.riskLevel]}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {/* Overall PACE */}
          <View
            style={{
              flex: 1,
              backgroundColor: `${paceColor}11`,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}
            >
              PACE Progress
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: paceColor }}>
              {s.pacePercent}%
            </Text>
            <View
              style={{
                width: "100%",
                height: 4,
                backgroundColor: colors.cardLight,
                borderRadius: 100,
                marginTop: 6,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${s.pacePercent}%`,
                  backgroundColor: paceColor,
                  borderRadius: 100,
                }}
              />
            </View>
          </View>
          {/* Attendance */}
          <View
            style={{
              flex: 1,
              backgroundColor: `${attColor}11`,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}
            >
              Attendance
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: attColor }}>
              {s.attendance}%
            </Text>
            <View
              style={{
                width: "100%",
                height: 4,
                backgroundColor: colors.cardLight,
                borderRadius: 100,
                marginTop: 6,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${s.attendance}%`,
                  backgroundColor: attColor,
                  borderRadius: 100,
                }}
              />
            </View>
          </View>
        </View>

        {/* Trend & PACEs behind */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: `${trendColor}11`,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}
            >
              Trend
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons
                name={trendIconNames[s.trend] || "remove"}
                size={13}
                color={trendColor}
              />
              <Text
                style={{ fontSize: 13, fontWeight: "800", color: trendColor }}
              >
                {s.trend}
              </Text>
            </View>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: `${riskColor}11`,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}
            >
              PACEs Behind
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: riskColor }}>
              {s.pacesBehind}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: `${colors.accent}11`,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}
            >
              Last Active
            </Text>
            <Text
              style={{ fontSize: 13, fontWeight: "700", color: colors.accent }}
            >
              {s.lastActivity}
            </Text>
          </View>
        </View>
      </View>

      {/* Subject breakdown */}
      <Text
        style={{
          fontSize: 16,
          fontWeight: "800",
          color: colors.text,
          marginBottom: 12,
        }}
      >
        Subject Breakdown
      </Text>
      <View style={{ gap: 8 }}>
        {(s.subjects || []).map((sub, index) => {
          const subColor = subjectColors[sub.subject] || colors.accent;
          const subPaceColor =
            sub.pacePercent >= 85
              ? colors.green
              : sub.pacePercent >= 65
                ? colors.amber
                : colors.red;
          const subTrendColor =
            sub.trend === "improving"
              ? colors.green
              : sub.trend === "declining"
                ? colors.red
                : colors.muted;
          return (
            <View
              key={`${sub.subject}-${index}`}
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 4,
                      height: 20,
                      borderRadius: 2,
                      backgroundColor: subColor,
                      marginRight: 10,
                    }}
                  />
                  <View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: colors.text,
                      }}
                    >
                      {sub.subject}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {sub.teacher}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: `${subPaceColor}22`,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      color: subPaceColor,
                    }}
                  >
                    {sub.status}
                  </Text>
                </View>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      PACE
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: subPaceColor,
                      }}
                    >
                      {sub.pacePercent}%
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 4,
                      backgroundColor: colors.cardLight,
                      borderRadius: 100,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${sub.pacePercent}%`,
                        backgroundColor: subPaceColor,
                        borderRadius: 100,
                      }}
                    />
                  </View>
                </View>
                <View style={{ alignItems: "center", minWidth: 50 }}>
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    Behind
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: sub.pacesBehind > 0 ? colors.amber : colors.green,
                    }}
                  >
                    {sub.pacesBehind}
                  </Text>
                </View>
                <View style={{ alignItems: "center", minWidth: 50 }}>
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    Trend
                  </Text>
                  <Ionicons
                    name={trendIconNames[sub.trend] || "remove"}
                    size={14}
                    color={subTrendColor}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

export default MyRiskDetail;
