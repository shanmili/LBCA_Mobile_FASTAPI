import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useProfile } from "../../constants/ProfileContext";
import { useTheme } from "../../constants/useTheme";
import {
  getStudentPace,
  getStudentWarnings,
} from "../../services/earlyWarningService";

// ─── helpers ────────────────────────────────────────────────────────────────
const toNum = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const toList = (v) =>
  Array.isArray(v) ? v : Array.isArray(v?.results) ? v.results : [];

const normalizeRisk = (v) => {
  const s = String(v || "").toLowerCase();
  if (s.includes("critical")) return "critical";
  if (s.includes("high")) return "high";
  if (s.includes("moderate") || s.includes("medium")) return "moderate";
  return "low";
};

// Derive risk from pace percentage so grade changes are immediately reflected
const riskFromPct = (pct) => {
  if (pct < 60) return "critical";
  if (pct < 75) return "high";
  if (pct < 85) return "moderate";
  return "low";
};

// Derive trend from live pace_percent rather than trusting the stale DB field.
// "improving" is only shown when pace is genuinely healthy AND the API confirms it.
// At-risk/critical subjects are always declining unless pace >= 85 and API says improving.
const trendFromPct = (pct, apiTrend) => {
  const n = Number(pct);
  const api = String(apiTrend || "").toLowerCase();
  if (!Number.isFinite(n)) return "stable";
  if (n >= 85 && api.includes("improv")) return "improving";
  if (n < 85) return "declining";
  return "stable";
};

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

const getRiskConfig = (level) =>
  ({
    critical: {
      label: "Critical",
      color: "#F87171",
      icon: "warning-circle-outline",
      bg: "#F8717118",
    },
    high: {
      label: "High Risk",
      color: "#FB923C",
      icon: "alert-circle-outline",
      bg: "#FB923C18",
    },
    moderate: {
      label: "Moderate",
      color: "#FBBF24",
      icon: "warning-outline",
      bg: "#FBBF2418",
    },
    low: {
      label: "On Track",
      color: "#34D399",
      icon: "shield-checkmark-outline",
      bg: "#34D39918",
    },
  })[level] || {
    label: "On Track",
    color: "#34D399",
    icon: "shield-checkmark-outline",
    bg: "#34D39918",
  };

// ─── Build dashboard data from raw API responses ────────────────────────────
function buildDashboard(paceRaw, warningsRaw) {
  const paces = toList(paceRaw);
  const warnings = toList(warningsRaw);

  // Deduplicate paces by subject (average pace_percent, max paces_behind)
  const paceMap = new Map();
  paces.forEach((p) => {
    const key = String(p.subject || "").toLowerCase();
    if (!key) return;
    const prev = paceMap.get(key);
    if (!prev) {
      paceMap.set(key, { ...p, _count: 1 });
    } else {
      paceMap.set(key, {
        ...prev,
        pace_percent: toNum(prev.pace_percent) + toNum(p.pace_percent),
        paces_behind: Math.max(toNum(prev.paces_behind), toNum(p.paces_behind)),
        _count: prev._count + 1,
      });
    }
  });

  // Build warning lookup
  const warnMap = {};
  warnings.forEach((w) => {
    warnMap[String(w.subject || "").toLowerCase()] = w;
  });

  // Merge paces + warnings into subject rows
  const subjects = Array.from(paceMap.values()).map((p, i) => {
    const key = String(p.subject || "").toLowerCase();
    const w = warnMap[key] || {};
    return {
      subject: p.subject || w.subject || "Subject",
      pacePercent: Math.round(toNum(p.pace_percent) / Math.max(1, p._count)),
      pacesBehind: toNum(p.paces_behind, toNum(w.paces_behind, 0)),
      teacher: w.teacher || p.teacher || "—",
      status: w.status || p.status || "On Track",
      trend: trendFromPct(
        Math.round(toNum(p.pace_percent) / Math.max(1, p._count)),
        w.trend || p.trend,
      ),
      riskLevel: riskFromPct(
        Math.round(toNum(p.pace_percent) / Math.max(1, p._count)),
      ),
      color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
    };
  });

  // Fill in any warning subjects not covered by pace records
  warnings.forEach((w) => {
    const key = String(w.subject || "").toLowerCase();
    if (!subjects.find((s) => String(s.subject).toLowerCase() === key)) {
      subjects.push({
        subject: w.subject || "Subject",
        pacePercent: toNum(w.pace_percent ?? w.pacePercent, 0),
        pacesBehind: toNum(w.paces_behind ?? w.pacesBehind, 0),
        teacher: w.teacher || "—",
        status: w.status || "On Track",
        trend: trendFromPct(toNum(w.pace_percent ?? w.pacePercent, 0), w.trend),
        riskLevel: riskFromPct(toNum(w.pace_percent ?? w.pacePercent, 0)),
        color: SUBJECT_PALETTE[subjects.length % SUBJECT_PALETTE.length],
      });
    }
  });

  const avgPace = subjects.length
    ? Math.round(
        subjects.reduce((s, x) => s + x.pacePercent, 0) / subjects.length,
      )
    : 0;

  // Overall risk = worst subject risk
  const riskOrder = { critical: 3, high: 2, moderate: 1, low: 0 };
  const overallRisk = subjects.reduce(
    (worst, s) => {
      return (riskOrder[s.riskLevel] ?? 0) > (riskOrder[worst] ?? 0)
        ? s.riskLevel
        : worst;
    },
    warnings[0]?.pace_percent != null
      ? riskFromPct(toNum(warnings[0].pace_percent))
      : "low",
  );

  // Overall trend
  const improving = subjects.filter((s) => s.trend === "improving").length;
  const declining = subjects.filter((s) => s.trend === "declining").length;
  const overallTrend =
    declining > improving
      ? "declining"
      : improving > declining
        ? "improving"
        : "stable";

  // Total paces behind
  const totalBehind = subjects.reduce((s, x) => s + x.pacesBehind, 0);

  return { subjects, avgPace, overallRisk, overallTrend, totalBehind };
}

// ─── Animated progress bar ──────────────────────────────────────────────────
function ProgressBar({ value, color, delay = 0 }) {
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
        height: 6,
        backgroundColor: `${color}22`,
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

// ─── Skeleton loader block ──────────────────────────────────────────────────
function Skeleton({ width, height, radius = 8, style }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 800,
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
          backgroundColor: "#94A3B820",
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

// ─── Summary stat pill ──────────────────────────────────────────────────────
function StatPill({ icon, label, value, color, onPress }) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flex: 1,
        backgroundColor: `${color}12`,
        borderWidth: 1,
        borderColor: `${color}30`,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 12,
        alignItems: "center",
        marginHorizontal: 4,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: `${color}20`,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text
        style={{ fontSize: 17, fontWeight: "800", color, letterSpacing: -0.3 }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          fontWeight: "600",
          color: `${color}99`,
          marginTop: 2,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </Container>
  );
}

// ─── Subject card row ───────────────────────────────────────────────────────
function SubjectRow({
  subject,
  pacePercent,
  pacesBehind,
  teacher,
  trend,
  riskLevel,
  color,
  index,
}) {
  const { colors } = useTheme();
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
  const riskConf = getRiskConfig(riskLevel);

  return (
    <View
      style={{
        marginBottom: 10,
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: riskConf.color,
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
          backgroundColor: `${riskConf.color}22`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <Ionicons name={riskConf.icon} size={20} color={riskConf.color} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Risk badge */}
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
              backgroundColor: `${riskConf.color}22`,
              borderRadius: 100,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: riskConf.color,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {riskConf.label}
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
        <ProgressBar
          value={pacePercent}
          color={riskConf.color}
          delay={index * 80}
        />

        {/* Footer: pace % + trend */}
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
            {pacePercent}% pace
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

// ─── Overall pace ring (pure SVG via View geometry) ─────────────────────────
function PaceRing({ value, color, size = 120 }) {
  const anim = useRef(new Animated.Value(0)).current;
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value,
      duration: 1200,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]);

  const strokeDash = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [`0 ${circ}`, `${circ} ${circ}`],
  });

  // Approximate ring with border + rotation trick via nested views
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* background ring */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 8,
          borderColor: `${color}20`,
        }}
      />
      {/* Animated fill approximated with opacity pulse — real SVG needs react-native-svg */}
      <View
        style={{
          position: "absolute",
          width: size - 16,
          height: size - 16,
          borderRadius: (size - 16) / 2,
          borderWidth: 8,
          borderColor: color,
          borderTopColor: value < 25 ? `${color}20` : color,
          borderRightColor: value < 50 ? `${color}20` : color,
          borderBottomColor: value < 75 ? `${color}20` : color,
          borderLeftColor: color,
        }}
      />
      <View style={{ alignItems: "center" }}>
        <Text
          style={{ fontSize: 22, fontWeight: "800", color, letterSpacing: -1 }}
        >
          {value}%
        </Text>
        <Text
          style={{
            fontSize: 9,
            fontWeight: "600",
            color: "#94A3B8",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Avg Pace
        </Text>
      </View>
    </View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "800",
          color: colors.text,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 11, color: colors.muted }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export function DashboardTab({ unreadCount, onNotifPress, onRiskPress }) {
  const { colors } = useTheme();
  const { profile } = useProfile();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [error, setError] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    else setLoading(true);
    setError(null);

    if (!profile.studentId) {
      setState(buildDashboard([], []));
      setLoading(false);
      setRefresh(false);
      return;
    }

    try {
      const [paceRes, warnRes] = await Promise.allSettled([
        getStudentPace(profile.studentId),
        getStudentWarnings(profile.studentId),
      ]);
      const paceRaw = paceRes.status === "fulfilled" ? paceRes.value : [];
      const warningsRaw = warnRes.status === "fulfilled" ? warnRes.value : [];
      setState(buildDashboard(paceRaw, warningsRaw));
    } catch (e) {
      setError("Failed to load academic data. Pull down to retry.");
      setState(buildDashboard([], []));
    } finally {
      setLoading(false);
      setRefresh(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  };

  useEffect(() => {
    load();
  }, [profile.studentId]);

  const firstName = profile.firstName || "Student";
  const gradeLabel = profile.gradeLevel
    ? `${profile.gradeLevel}${profile.section ? " · " + profile.section : ""}`
    : null;

  const riskConf = getRiskConfig(state?.overallRisk || "low");
  const trendIcon =
    state?.overallTrend === "improving"
      ? "trending-up-outline"
      : state?.overallTrend === "declining"
        ? "trending-down-outline"
        : "remove-outline";
  const trendColor =
    state?.overallTrend === "improving"
      ? "#34D399"
      : state?.overallTrend === "declining"
        ? "#F87171"
        : "#94A3B8";

  // ── Skeleton ──
  if (loading) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* greeting */}
        <Skeleton
          width={160}
          height={28}
          radius={8}
          style={{ marginBottom: 6 }}
        />
        <Skeleton
          width={100}
          height={14}
          radius={6}
          style={{ marginBottom: 28 }}
        />
        {/* hero card */}
        <Skeleton
          width="100%"
          height={160}
          radius={20}
          style={{ marginBottom: 16 }}
        />
        {/* stat pills */}
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <Skeleton
            width="30%"
            height={90}
            radius={16}
            style={{ marginRight: 8 }}
          />
          <Skeleton
            width="30%"
            height={90}
            radius={16}
            style={{ marginRight: 8 }}
          />
          <Skeleton width="30%" height={90} radius={16} />
        </View>
        {/* subjects */}
        {[1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            width="100%"
            height={90}
            radius={14}
            style={{ marginBottom: 10 }}
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
        {/* ── Greeting ── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.subtext || "#94A3B8",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Welcome back
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: colors.text,
                letterSpacing: -0.5,
                lineHeight: 30,
              }}
            >
              {firstName} 👋
            </Text>
            {gradeLabel && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <Ionicons
                  name="school-outline"
                  size={11}
                  color="#94A3B8"
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={{ fontSize: 12, color: "#94A3B8", fontWeight: "500" }}
                >
                  {gradeLabel}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={onNotifPress}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: `${colors.accent}15`,
              borderWidth: 1,
              borderColor: `${colors.accent}30`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.accent}
            />
            {unreadCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#F87171",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: colors.bg,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>
                  {unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Hero Card: pace ring + overview ── */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <PaceRing
            value={state?.avgPace || 0}
            color={colors.accent}
            size={108}
          />
          <View style={{ flex: 1, marginLeft: 20 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Academic Overview
            </Text>
            {/* Risk */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: riskConf.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 8,
                }}
              >
                <Ionicons
                  name={riskConf.icon}
                  size={14}
                  color={riskConf.color}
                />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: "#94A3B8" }}>
                  Risk Level
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: riskConf.color,
                  }}
                >
                  {riskConf.label}
                </Text>
              </View>
            </View>
            {/* Trend */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: `${trendColor}18`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 8,
                }}
              >
                <Ionicons name={trendIcon} size={14} color={trendColor} />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: "#94A3B8" }}>
                  Overall Trend
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: trendColor,
                    textTransform: "capitalize",
                  }}
                >
                  {state?.overallTrend || "stable"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Stat Pills ── */}
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <StatPill
            icon="book-outline"
            label="Subjects"
            value={state?.subjects?.length || 0}
            color={colors.accent}
          />
          <StatPill
            icon={riskConf.icon}
            label="Status"
            value={riskConf.label}
            color={riskConf.color}
            onPress={onRiskPress}
          />
        </View>

        {/* ── Error banner ── */}
        {error && (
          <View
            style={{
              backgroundColor: "#F8717118",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={16}
              color="#F87171"
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontSize: 12, color: "#F87171", flex: 1 }}>
              {error}
            </Text>
          </View>
        )}

        {/* ── Subject Progress ── */}
        {state?.subjects?.length > 0 ? (
          <>
            <SectionHeader
              title="Subject Progress"
              subtitle={`${state.subjects.length} subject${state.subjects.length !== 1 ? "s" : ""}`}
            />
            {state.subjects.map((s, i) => (
              <SubjectRow key={s.subject} {...s} index={i} />
            ))}
          </>
        ) : (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 32,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons
              name="school-outline"
              size={36}
              color="#94A3B8"
              style={{ marginBottom: 12 }}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: "#94A3B8",
                marginBottom: 4,
              }}
            >
              No subjects yet
            </Text>
            <Text
              style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}
            >
              Academic data will appear here once your enrollment is processed.
            </Text>
          </View>
        )}

        {/* ── Pull to refresh hint ── */}
        <View style={{ alignItems: "center", marginTop: 16 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            Pull down to refresh
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}
