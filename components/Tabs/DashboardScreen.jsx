import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { currentStudent, subjectColors as fallbackSubjectColors } from "../../constants/data";
import { useProfile } from "../../constants/ProfileContext";
import { avatar, getStyles, pill, pillText } from "../../constants/styles";
import { useTheme } from "../../constants/useTheme";
import { getAiStudentPrediction } from "../../services/aiService";
import { getStudentPace, getStudentWarnings } from "../../services/earlyWarningService";
import { StatCard } from "../common/dashboard/StatCard";
import { SubjectProgress } from "../common/dashboard/SubjectProgress";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

const normalizeTrend = (value) => {
  if (!value) return "stable";
  const normalized = String(value).toLowerCase();
  if (normalized.includes("improv")) return "improving";
  if (normalized.includes("declin")) return "declining";
  return "stable";
};

const normalizeRisk = (value) => {
  if (!value) return "low";
  const normalized = String(value).toLowerCase();
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("moderate")) return "moderate";
  return "low";
};

const getRiskMeta = (riskLevel, colors) => {
  if (riskLevel === "critical") {
    return { label: "Critical", color: colors.red, icon: "skull-outline" };
  }
  if (riskLevel === "high") {
    return { label: "High Risk", color: colors.red, icon: "alert-circle-outline" };
  }
  if (riskLevel === "moderate") {
    return { label: "Moderate Risk", color: colors.amber, icon: "warning-outline" };
  }
  return { label: "Low Risk", color: colors.green, icon: "shield-checkmark-outline" };
};

const getSubjectColor = (subject, colors) =>
  fallbackSubjectColors[subject] || colors.accent;

const summarizeTrend = (subjects = []) => {
  if (!subjects.length) return "stable";
  const improving = subjects.filter((item) => item.trend === "improving").length;
  const declining = subjects.filter((item) => item.trend === "declining").length;
  if (declining > improving) return "declining";
  if (improving > declining) return "improving";
  return "stable";
};

const buildFallbackSubjectRows = () =>
  (currentStudent.subjects || []).map((item) => ({
    subject: item.subject,
    pacePercent: toNumber(item.pacePercent, 0),
    pacesBehind: toNumber(item.pacesBehind, 0),
    teacher: item.teacher || "—",
    status: item.status || "On Track",
    trend: normalizeTrend(item.trend),
  }));

const buildDashboardState = ({ paceRecords, warnings, aiPrediction, fallbackSubjects }) => {
  const warningsBySubject = toList(warnings).reduce((acc, warning) => {
    const key = String(warning.subject || "").toLowerCase();
    if (key) {
      acc[key] = warning;
    }
    return acc;
  }, {});

  const uniquePaces = new Map();
  toList(paceRecords).forEach((pace) => {
    const key = String(pace.subject || "").toLowerCase();
    if (!key) return;

    const existing = uniquePaces.get(key) || { ...pace };
    const count = Number(existing._count || 0) + 1;
    uniquePaces.set(key, {
      ...existing,
      ...pace,
      pace_percent: toNumber(existing.pace_percent, 0) + toNumber(pace.pace_percent, 0),
      paces_behind: Math.max(toNumber(existing.paces_behind, 0), toNumber(pace.paces_behind, 0)),
      _count: count,
    });
  });

  const derivedSubjects = Array.from(uniquePaces.values()).map((pace) => {
    const warning = warningsBySubject[String(pace.subject || "").toLowerCase()] || {};
    return {
      subject: pace.subject || warning.subject || "Subject",
      pacePercent: Math.round(
        toNumber(pace.pace_percent, 0) / Math.max(1, toNumber(pace._count, 1)),
      ),
      pacesBehind: toNumber(pace.paces_behind, toNumber(warning.paces_behind, 0)),
      teacher: warning.teacher || pace.teacher || "—",
      status: warning.status || pace.status || "On Track",
      trend: normalizeTrend(warning.trend || pace.trend),
    };
  });

  const warningSubjects = toList(warnings)
    .filter((warning) => !derivedSubjects.some((subject) => subject.subject === warning.subject))
    .map((warning) => ({
      subject: warning.subject || "Subject",
      pacePercent: toNumber(warning.pace_percent ?? warning.pacePercent, 0),
      pacesBehind: toNumber(warning.paces_behind ?? warning.pacesBehind, 0),
      teacher: warning.teacher || "—",
      status: warning.status || "On Track",
      trend: normalizeTrend(warning.trend),
    }));

  const subjects = derivedSubjects.length
    ? derivedSubjects
    : warningSubjects.length
      ? warningSubjects
      : fallbackSubjects;

  const averagePace =
    subjects.length > 0
      ? Math.round(
          subjects.reduce((sum, item) => sum + toNumber(item.pacePercent, 0), 0) /
            subjects.length,
        )
      : 0;

  const riskLevel = normalizeRisk(
    aiPrediction?.risk_level ||
      toList(warnings).find((warning) => warning.risk_level)?.risk_level ||
      currentStudent.riskLevel,
  );

  const trend = normalizeTrend(aiPrediction?.trends?.pace_direction || summarizeTrend(subjects));

  return {
    subjects,
    gwa: averagePace,
    riskLevel,
    trend,
    status: aiPrediction?.risk_level ? `${aiPrediction.risk_level} risk` : currentStudent.status,
  };
};

export function DashboardTab({ unreadCount, onNotifPress, onRiskPress, studentName, studentMeta }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { profile } = useProfile();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboard, setDashboard] = useState(() =>
    buildDashboardState({
      paceRecords: [],
      warnings: [],
      aiPrediction: null,
      fallbackSubjects: buildFallbackSubjectRows(),
    }),
  );

  const displayName = studentName || "Student Overview";

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      const fallbackSubjects = buildFallbackSubjectRows();
      const fallbackState = buildDashboardState({
        paceRecords: [],
        warnings: [],
        aiPrediction: null,
        fallbackSubjects,
      });

      if (!profile.studentId) {
        if (isMounted) {
          setDashboard(fallbackState);
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        const [paceResult, warningResult] = await Promise.allSettled([
          getStudentPace(profile.studentId),
          getStudentWarnings(profile.studentId),
        ]);

        const paceRecords = paceResult.status === "fulfilled" ? paceResult.value : [];
        const warnings = warningResult.status === "fulfilled" ? warningResult.value : [];

        let aiPrediction = null;
        try {
          aiPrediction = await getAiStudentPrediction(profile.studentId, {
            pace_history: toList(paceRecords)
              .map((item) => toNumber(item.pace_percent ?? item.pacePercent, 0))
              .filter(Boolean),
            attendance_history: toList(warnings)
              .map((item) => toNumber(item.attendance ?? item.attendance_percent, 0))
              .filter(Boolean),
            absences_current: toList(warnings).filter((item) =>
              String(item.status || "").toLowerCase().includes("absent"),
            ).length,
            submissions: {
              ontime: Math.max(1, toList(warnings).length),
              late: 0,
            },
          });
        } catch {
          aiPrediction = null;
        }

        if (isMounted) {
          setDashboard(
            buildDashboardState({
              paceRecords,
              warnings,
              aiPrediction,
              fallbackSubjects,
            }),
          );
        }
      } catch {
        if (isMounted) {
          setDashboard(fallbackState);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [profile.studentId]);

  const trendLabel = useMemo(() => {
    if (dashboard.trend === "improving") return "Improving";
    if (dashboard.trend === "declining") return "Declining";
    return "Stable";
  }, [dashboard.trend]);

  const riskMeta = getRiskMeta(dashboard.riskLevel, colors);

  return (
    <View style={styles.pagePad}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.h1}>{displayName}</Text>
          {!!studentMeta && (
            <View style={[pill(colors.green), { marginTop: 6 }]}>
              <Text style={pillText(colors.green)}>{`● ${studentMeta}`}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onNotifPress}>
          <View style={avatar()}>
            <Ionicons name="notifications" size={20} color={colors.accent} />
          </View>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#fff" }}>
                {unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <StatCard
          title="GWA"
          value={`${dashboard.gwa.toFixed(1)}%`}
          color={colors.green}
          icon="trending-up"
        />
        <StatCard
          title="Risk"
          value={riskMeta.label}
          color={riskMeta.color}
          icon={riskMeta.icon}
          onPress={onRiskPress}
        />
      </View>

      <View style={[styles.card, { marginBottom: 16 }]}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Text style={styles.h2}>Academic Trend</Text>
          <View style={pill(colors.accent)}>
            <Text style={pillText(colors.accent)}>{trendLabel}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
              Syncing your latest academic data...
            </Text>
          </View>
        ) : (
          dashboard.subjects.map((subject) => (
            <SubjectProgress
              key={subject.subject}
              subject={subject.subject}
              value={subject.pacePercent}
              color={getSubjectColor(subject.subject, colors)}
            />
          ))
        )}
      </View>
    </View>
  );
}
