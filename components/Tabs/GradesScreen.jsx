import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { subjectColors } from "../../constants/GradesData";
import { useProfile } from "../../constants/ProfileContext";
import { getStyles, pill, pillText } from "../../constants/styles";
import { useTheme } from "../../constants/useTheme";
import { getStudentPace, getStudentWarnings } from "../../services/earlyWarningService";

const subjectIcons = {
  Mathematics: "calculator",
  Science: "flask",
  English: "book",
  Filipino: "globe",
  "Social Studies": "flag",
  MAPEH: "musical-notes",
  "Values Education": "heart",
};

function getIconForSubject(subject) {
  for (const key of Object.keys(subjectIcons)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return subjectIcons[key];
  }
  return "school";
}

function getPaceColor(colors, pacePercent) {
  if (pacePercent >= 90) return colors.green;
  if (pacePercent >= 75) return colors.accent;
  if (pacePercent >= 60) return "#F59E0B";
  return colors.red;
}

function getPaceRemarks(pacePercent) {
  if (pacePercent >= 90) return "Excellent";
  if (pacePercent >= 75) return "On Track";
  if (pacePercent >= 60) return "Needs Attention";
  return "Behind";
}

export function GradesScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { profile } = useProfile();

  const [paceData, setPaceData] = useState([]);
  const [warningsData, setWarningsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profile.studentId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [paces, warnings] = await Promise.all([
          getStudentPace(profile.studentId),
          getStudentWarnings(profile.studentId),
        ]);

        // normalize — getStudentPace returns the raw response
        const paceList = Array.isArray(paces) ? paces : (paces?.results || []);
        const warnList = Array.isArray(warnings) ? warnings : (warnings?.results || []);

        setPaceData(paceList);
        setWarningsData(warnList);
      } catch (e) {
        setError("Unable to load pace data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile.studentId]);

// Deduplicate pace records by subject (average if multiple)
const paceBySubject = paceData.reduce((acc, pace) => {
  const key = pace.subject?.toLowerCase();
  if (!key) return acc;
  if (!acc[key]) {
    acc[key] = { ...pace, _count: 1 };
  } else {
    acc[key].pace_percent = (acc[key].pace_percent + pace.pace_percent) / 2;
    acc[key].paces_behind = Math.max(acc[key].paces_behind, pace.paces_behind);
    acc[key]._count += 1;
  }
  return acc;
}, {});

const subjectRows = Object.values(paceBySubject).map((pace) => {
  const warning = warningsData.find(
    (w) => w.subject?.toLowerCase() === pace.subject?.toLowerCase()
  );
  return {
    subject: pace.subject,
    pacePercent: pace.pace_percent ?? 0,
    pacesBehind: pace.paces_behind ?? 0,
    teacher: warning?.teacher || "—",
    attendance: warning?.attendance ?? null,
    trend: warning?.trend || "stable",
    status: warning?.status || "On Track",
    riskLevel: warning?.risk_level || "low",
  };
});

  // Overall average pace
  const avgPace =
    subjectRows.length > 0
      ? Math.round(subjectRows.reduce((sum, s) => sum + s.pacePercent, 0) / subjectRows.length)
      : 0;

  const trendIcon = {
    improving: "arrow-up-circle",
    declining: "arrow-down-circle",
    stable: "remove-circle",
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>
          Loading pace data...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: colors.bg }}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 16, textAlign: "center" }}>
          {error}
        </Text>
      </View>
    );
  }

  if (subjectRows.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: colors.bg }}>
        <Ionicons name="school-outline" size={48} color={colors.muted} />
        <Text style={{ color: colors.muted, fontSize: 15, marginTop: 16, textAlign: "center" }}>
          No pace records found for this student.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
      <View style={styles.pagePad}>

        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.h1}>PACE Progress</Text>
          <Text style={[styles.p, { color: colors.muted }]}>
            {profile.gradeLevel || ""}
            {profile.gradeLevel && profile.section ? " — " : ""}
            {profile.section || ""}
          </Text>
        </View>

        {/* Overall Average Card */}
        <View style={[styles.card, {
          marginBottom: 20,
          backgroundColor: getPaceColor(colors, avgPace),
          borderColor: getPaceColor(colors, avgPace),
        }]}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff", opacity: 0.85, marginBottom: 4 }}>
            Overall PACE Completion
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 52, fontWeight: "800", color: "#fff" }}>
              {avgPace}%
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff", opacity: 0.85 }}>
              {subjectRows.length} Subjects
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: "#fff", opacity: 0.85, marginTop: 4 }}>
            {getPaceRemarks(avgPace)}
          </Text>
        </View>

        {/* Subject Rows */}
        <Text style={[styles.h2, { marginBottom: 12 }]}>Subject Breakdown</Text>

        {subjectRows.map((s, index) => {
          const color = subjectColors[s.subject] || colors.accent;
          const paceColor = getPaceColor(colors, s.pacePercent);
          const icon = getIconForSubject(s.subject);
          const trend = s.trend?.toLowerCase() || "stable";

          return (
            <View
              key={`${s.subject}-${index}`}
              style={[styles.card, { marginBottom: 12 }]}
            >
              {/* Top row: icon + name + trend + percent */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 14,
                  backgroundColor: `${color}22`,
                  alignItems: "center", justifyContent: "center",
                  marginRight: 12,
                }}>
                  <Ionicons name={icon} size={20} color={color} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
                    {s.subject}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {s.teacher}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: paceColor }}>
                    {Math.round(s.pacePercent)}%
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Ionicons
                      name={trendIcon[trend] || "remove-circle"}
                      size={13}
                      color={trend === "improving" ? colors.green : trend === "declining" ? colors.red : colors.muted}
                    />
                    <Text style={{ fontSize: 11, color: colors.muted, textTransform: "capitalize" }}>
                      {trend}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Progress bar */}
              <View style={{
                height: 8, borderRadius: 8,
                backgroundColor: `${paceColor}22`,
                marginBottom: 10,
              }}>
                <View style={{
                  height: 8, borderRadius: 8,
                  backgroundColor: paceColor,
                  width: `${Math.min(100, s.pacePercent)}%`,
                }} />
              </View>

              {/* Bottom row: badges */}
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View style={pill(paceColor)}>
                  <Text style={pillText(paceColor)}>{s.status}</Text>
                </View>
                {s.pacesBehind > 0 && (
                  <View style={pill(colors.red)}>
                    <Text style={pillText(colors.red)}>{s.pacesBehind} pace{s.pacesBehind > 1 ? "s" : ""} behind</Text>
                  </View>
                )}
                {s.attendance !== null && (
                  <View style={pill(colors.muted)}>
                    <Text style={pillText(colors.muted)}>Attendance: {Math.round(s.attendance)}%</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

      </View>
    </ScrollView>
  );
}