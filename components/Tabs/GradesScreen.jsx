import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useProfile } from "../../constants/ProfileContext";
import { useTheme } from "../../constants/useTheme";
import {
  getStudentPace,
  getStudentWarnings,
} from "../../services/earlyWarningService";

// ─── helpers ─────────────────────────────────────────────────────────────────
const SUBJECT_ICONS = {
  math: "calculator",
  science: "flask",
  english: "book",
  filipino: "globe",
  social: "flag",
  mapeh: "musical-notes",
  values: "heart",
  araling: "flag",
};

function iconFor(subject) {
  const s = subject.toLowerCase();
  for (const [k, v] of Object.entries(SUBJECT_ICONS)) {
    if (s.includes(k)) return v;
  }
  return "school";
}

const SUBJECT_PALETTE = [
  "#38BDF8",
  "#34D399",
  "#A78BFA",
  "#FBBF24",
  "#F87171",
  "#FB923C",
  "#E879F9",
  "#2DD4BF",
];

function gradeColor(pct) {
  if (pct >= 90) return "#34D399";
  if (pct >= 75) return "#38BDF8";
  if (pct >= 60) return "#FBBF24";
  return "#F87171";
}

function gradeRemarks(pct) {
  if (pct >= 90) return "Excellent";
  if (pct >= 75) return "Satisfactory";
  if (pct >= 60) return "Needs Improvement";
  return "Poor";
}

// ─── Animated progress bar ───────────────────────────────────────────────────
function Bar({ value, color, delay = 0 }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(100, Math.max(0, value)),
      duration: 900,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]);
  return (
    <View
      style={{
        height: 7,
        backgroundColor: `${color}25`,
        borderRadius: 99,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          height: "100%",
          borderRadius: 99,
          backgroundColor: color,
          width: anim.interpolate({
            inputRange: [0, 100],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </View>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ width, height, radius = 10, style }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: "#94A3B822",
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

// ─── Subject grade card ───────────────────────────────────────────────────────
function SubjectCard({ subject, pacePercent, teacher, trend, color, index }) {
  const { colors } = useTheme();
  const grade = Math.round(pacePercent);
  const gColor = gradeColor(grade);
  const remarks = gradeRemarks(grade);
  const icon = iconFor(subject);

  const trendIcon =
    trend === "improving"
      ? "trending-up"
      : trend === "declining"
        ? "trending-down"
        : "remove";
  const trendColor =
    trend === "improving"
      ? "#34D399"
      : trend === "declining"
        ? "#F87171"
        : "#94A3B8";

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 20,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: gColor,
        flexDirection: "row",
        alignItems: "flex-start",
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: `${gColor}22`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <Ionicons name={icon} size={20} color={gColor} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Remarks badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
            gap: 6,
          }}
        >
          <View
            style={{
              backgroundColor: `${gColor}22`,
              borderRadius: 100,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: gColor,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {remarks}
            </Text>
          </View>
        </View>

        {/* Subject name */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 4,
          }}
          numberOfLines={1}
        >
          {subject}
        </Text>

        {/* Progress bar */}
        <Bar value={grade} color={gColor} delay={index * 70} />

        {/* Footer: grade + trend */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Text
            style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}
          >
            {grade}% grade
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons name={trendIcon} size={12} color={trendColor} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: trendColor,
                textTransform: "capitalize",
              }}
            >
              {trend}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function GradesScreen() {
  const { colors } = useTheme();
  const { profile } = useProfile();

  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    if (!profile.studentId) {
      setSubjects([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [paces, warnings] = await Promise.all([
        getStudentPace(profile.studentId),
        getStudentWarnings(profile.studentId),
      ]);

      const paceList = Array.isArray(paces) ? paces : paces?.results || [];
      const warnList = Array.isArray(warnings)
        ? warnings
        : warnings?.results || [];

      // Deduplicate by subject — average pace_percent if multiple records
      const map = new Map();
      paceList.forEach((p) => {
        const key = p.subject?.toLowerCase();
        if (!key) return;
        const prev = map.get(key);
        if (!prev) {
          map.set(key, { ...p, _count: 1 });
        } else {
          map.set(key, {
            ...prev,
            pace_percent: prev.pace_percent + p.pace_percent,
            _count: prev._count + 1,
          });
        }
      });

      const rows = Array.from(map.values()).map((p, i) => {
        const warn = warnList.find(
          (w) => w.subject?.toLowerCase() === p.subject?.toLowerCase(),
        );
        return {
          subject: p.subject,
          pacePercent: p.pace_percent / p._count,
          teacher: warn?.teacher || p.teacher || "—",
          trend: warn?.trend || "stable",
          color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
        };
      });

      setSubjects(rows);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    } catch {
      setError("Unable to load grades. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [profile.studentId]);

  const avgGrade = subjects.length
    ? Math.round(
        subjects.reduce((s, x) => s + x.pacePercent, 0) / subjects.length,
      )
    : 0;

  // ── Skeleton ──
  if (loading) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Skeleton width={160} height={26} style={{ marginBottom: 6 }} />
        <Skeleton width={110} height={14} style={{ marginBottom: 20 }} />
        <Skeleton
          width="100%"
          height={100}
          radius={20}
          style={{ marginBottom: 16 }}
        />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton
            key={i}
            width="100%"
            height={110}
            radius={18}
            style={{ marginBottom: 12 }}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: colors.text,
              letterSpacing: -0.5,
            }}
          >
            Grades
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
            {profile.gradeLevel || ""}
            {profile.gradeLevel && profile.section ? " · " : ""}
            {profile.section || ""}
          </Text>
        </View>

        {/* Error */}
        {error && (
          <View
            style={{
              backgroundColor: "#F8717115",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={15}
              color="#F87171"
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontSize: 12, color: "#F87171", flex: 1 }}>
              {error}
            </Text>
          </View>
        )}

        {/* Average grade card */}
        {subjects.length > 0 && (
          <View
            style={{
              backgroundColor: `${gradeColor(avgGrade)}18`,
              borderRadius: 20,
              padding: 20,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: `${gradeColor(avgGrade)}35`,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                Overall Average
              </Text>
              <Text
                style={{
                  fontSize: 48,
                  fontWeight: "800",
                  color: gradeColor(avgGrade),
                  letterSpacing: -2,
                }}
              >
                {avgGrade}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: `${gradeColor(avgGrade)}bb`,
                  fontWeight: "600",
                }}
              >
                {gradeRemarks(avgGrade)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Ionicons
                name="school-outline"
                size={40}
                color={`${gradeColor(avgGrade)}50`}
              />
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
                {subjects.length} subject{subjects.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Subject cards */}
        {subjects.length > 0 ? (
          <>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: colors.muted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 12,
              }}
            >
              Subject Grades
            </Text>
            {subjects.map((s, i) => (
              <SubjectCard key={s.subject} {...s} index={i} />
            ))}
          </>
        ) : (
          !error && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Ionicons name="school-outline" size={48} color="#475569" />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: "#94A3B8",
                  marginTop: 16,
                  marginBottom: 4,
                }}
              >
                No grades yet
              </Text>
              <Text
                style={{ fontSize: 13, color: "#475569", textAlign: "center" }}
              >
                Grades will appear once your PACE records are entered.
              </Text>
            </View>
          )
        )}

        <View style={{ alignItems: "center", marginTop: 8 }}>
          <Text style={{ fontSize: 11, color: "#334155" }}>
            Pull down to refresh
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}
