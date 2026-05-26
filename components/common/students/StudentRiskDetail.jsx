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
import { useProfile } from "../../../constants/ProfileContext";
import { useTheme } from "../../../constants/useTheme";
import {
  getStudentPace,
  getStudentWarnings,
} from "../../../services/earlyWarningService";

// ─── helpers ─────────────────────────────────────────────────────────────────
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
  if (s.includes("moderate")) return "moderate";
  return "low";
};
const normalizeTrend = (v) => {
  const s = String(v || "").toLowerCase();
  if (s.includes("improv")) return "improving";
  if (s.includes("declin")) return "declining";
  return "stable";
};

const RISK_CONFIG = {
  critical: {
    label: "Critical",
    color: "#F87171",
    bg: "#F8717115",
    icon: "skull-outline",
    bar: "#F87171",
  },
  high: {
    label: "High Risk",
    color: "#FB923C",
    bg: "#FB923C15",
    icon: "alert-circle-outline",
    bar: "#FB923C",
  },
  moderate: {
    label: "Moderate",
    color: "#FBBF24",
    bg: "#FBBF2415",
    icon: "warning-outline",
    bar: "#FBBF24",
  },
  low: {
    label: "On Track",
    color: "#34D399",
    bg: "#34D39915",
    icon: "shield-checkmark-outline",
    bar: "#34D399",
  },
};
const riskConf = (r) => RISK_CONFIG[r] || RISK_CONFIG.low;

const TREND_CONFIG = {
  improving: {
    label: "Improving",
    color: "#34D399",
    icon: "trending-up-outline",
  },
  declining: {
    label: "Declining",
    color: "#F87171",
    icon: "trending-down-outline",
  },
  stable: { label: "Stable", color: "#94A3B8", icon: "remove-outline" },
};
const trendConf = (t) => TREND_CONFIG[t] || TREND_CONFIG.stable;

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

const RISK_ORDER = { critical: 3, high: 2, moderate: 1, low: 0 };

// ─── build unified data from API ─────────────────────────────────────────────
function buildData(paceRaw, warningsRaw) {
  const paces = toList(paceRaw);
  const warnings = toList(warningsRaw);

  const warnMap = {};
  warnings.forEach((w) => {
    warnMap[String(w.subject || "").toLowerCase()] = w;
  });

  // Deduplicate paces
  const paceMap = new Map();
  paces.forEach((p) => {
    const key = String(p.subject || "").toLowerCase();
    if (!key) return;
    const prev = paceMap.get(key);
    paceMap.set(
      key,
      prev
        ? {
            ...prev,
            pace_percent: toNum(prev.pace_percent) + toNum(p.pace_percent),
            paces_behind: Math.max(
              toNum(prev.paces_behind),
              toNum(p.paces_behind),
            ),
            _count: prev._count + 1,
          }
        : { ...p, _count: 1 },
    );
  });

  const subjects = Array.from(paceMap.values()).map((p, i) => {
    const key = String(p.subject || "").toLowerCase();
    const w = warnMap[key] || {};
    const pct = Math.round(toNum(p.pace_percent) / Math.max(1, p._count));
    return {
      subject: p.subject || w.subject || "Subject",
      pacePercent: pct,
      pacesBehind: toNum(p.paces_behind, toNum(w.paces_behind, 0)),
      teacher: w.teacher || p.teacher || "—",
      status: w.status || p.status || "On Track",
      trend: normalizeTrend(w.trend || p.trend),
      riskLevel: normalizeRisk(
        w.risk_level || (pct < 60 ? "high" : pct < 75 ? "moderate" : "low"),
      ),
      attendance: toNum(w.attendance ?? w.attendance_percent, 0),
      lastActivity: w.last_activity || w.lastActivity || "—",
      color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
    };
  });

  // Warnings not in pace
  warnings.forEach((w) => {
    const key = String(w.subject || "").toLowerCase();
    if (!subjects.find((s) => String(s.subject).toLowerCase() === key)) {
      subjects.push({
        subject: w.subject || "Subject",
        pacePercent: toNum(w.pace_percent ?? w.pacePercent, 0),
        pacesBehind: toNum(w.paces_behind ?? w.pacesBehind, 0),
        teacher: w.teacher || "—",
        status: w.status || "Warning",
        trend: normalizeTrend(w.trend),
        riskLevel: normalizeRisk(w.risk_level),
        attendance: toNum(w.attendance ?? w.attendance_percent, 0),
        lastActivity: w.last_activity || w.lastActivity || "—",
        color: SUBJECT_PALETTE[subjects.length % SUBJECT_PALETTE.length],
      });
    }
  });

  const overallRisk = subjects.reduce(
    (worst, s) =>
      (RISK_ORDER[s.riskLevel] ?? 0) > (RISK_ORDER[worst] ?? 0)
        ? s.riskLevel
        : worst,
    "low",
  );

  const atRisk = subjects.filter(
    (s) => s.riskLevel === "critical" || s.riskLevel === "high",
  );
  const warnings2 = subjects.filter((s) => s.riskLevel === "moderate");
  const onTrack = subjects.filter((s) => s.riskLevel === "low");

  const avgPace = subjects.length
    ? Math.round(
        subjects.reduce((a, s) => a + s.pacePercent, 0) / subjects.length,
      )
    : 0;
  const totalBehind = subjects.reduce((a, s) => a + s.pacesBehind, 0);

  const declining = subjects.filter((s) => s.trend === "declining").length;
  const improving = subjects.filter((s) => s.trend === "improving").length;
  const overallTrend =
    declining > improving
      ? "declining"
      : improving > declining
        ? "improving"
        : "stable";

  return {
    subjects,
    overallRisk,
    overallTrend,
    avgPace,
    totalBehind,
    atRisk,
    warnings: warnings2,
    onTrack,
  };
}

// ─── animated bar ─────────────────────────────────────────────────────────────
function Bar({ value, color, height = 6, delay = 0 }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: Math.min(100, Math.max(0, value)),
      duration: 800,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]);
  return (
    <View
      style={{
        height,
        backgroundColor: `${color}20`,
        borderRadius: 99,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          height: "100%",
          borderRadius: 99,
          backgroundColor: color,
          width: w.interpolate({
            inputRange: [0, 100],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </View>
  );
}

// ─── skeleton ─────────────────────────────────────────────────────────────────
function Sk({ w, h, r = 10, style }) {
  const op = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(op, {
          toValue: 0.9,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(op, {
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
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: "#94A3B822",
          opacity: op,
        },
        style,
      ]}
    />
  );
}

// ─── Risk tier header strip ───────────────────────────────────────────────────
function TierHeader({ label, count, color, icon }) {
  if (!count) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
        marginTop: 6,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: `${color}20`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 8,
        }}
      >
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          color,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          flex: 1,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: `${color}20`,
          borderRadius: 99,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "800", color }}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Subject alert card ───────────────────────────────────────────────────────
function SubjectCard({
  subject,
  pacePercent,
  pacesBehind,
  teacher,
  status,
  trend,
  riskLevel,
  attendance,
  lastActivity,
  color,
  index,
}) {
  const rc = riskConf(riskLevel);
  const tc = trendConf(trend);
  const paceColor =
    pacePercent >= 85 ? "#34D399" : pacePercent >= 65 ? "#FBBF24" : "#F87171";

  return (
    <View
      style={{
        backgroundColor: "#1E293B",
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: `${rc.color}25`,
        borderLeftWidth: 3,
        borderLeftColor: rc.color,
      }}
    >
      {/* Top row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: "#F1F5F9",
              marginBottom: 2,
            }}
            numberOfLines={1}
          >
            {subject}
          </Text>
          {teacher !== "—" && (
            <Text style={{ fontSize: 11, color: "#64748B" }}>👤 {teacher}</Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View
            style={{
              backgroundColor: rc.bg,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: rc.color }}>
              {rc.label}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons name={tc.icon} size={11} color={tc.color} />
            <Text style={{ fontSize: 10, fontWeight: "600", color: tc.color }}>
              {tc.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Pace bar */}
      <View style={{ marginBottom: 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            PACE Progress
          </Text>
          <Text style={{ fontSize: 11, fontWeight: "800", color: paceColor }}>
            {pacePercent}%
          </Text>
        </View>
        <Bar
          value={pacePercent}
          color={paceColor}
          height={7}
          delay={index * 60}
        />
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#ffffff06",
            borderRadius: 10,
            padding: 8,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: "#64748B",
              marginBottom: 2,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Behind
          </Text>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: pacesBehind > 0 ? "#F87171" : "#34D399",
            }}
          >
            {pacesBehind}
          </Text>
        </View>
        {attendance > 0 && (
          <View
            style={{
              flex: 1,
              backgroundColor: "#ffffff06",
              borderRadius: 10,
              padding: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 9,
                color: "#64748B",
                marginBottom: 2,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Attendance
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color:
                  attendance >= 90
                    ? "#34D399"
                    : attendance >= 75
                      ? "#FBBF24"
                      : "#F87171",
              }}
            >
              {attendance}%
            </Text>
          </View>
        )}
        <View
          style={{
            flex: 1,
            backgroundColor: "#ffffff06",
            borderRadius: 10,
            padding: 8,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: "#64748B",
              marginBottom: 2,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Status
          </Text>
          <Text
            style={{ fontSize: 11, fontWeight: "700", color: paceColor }}
            numberOfLines={1}
          >
            {status}
          </Text>
        </View>
      </View>

      {lastActivity && lastActivity !== "—" && (
        <Text style={{ fontSize: 10, color: "#475569", marginTop: 8 }}>
          🕐 Last activity: {lastActivity}
        </Text>
      )}
    </View>
  );
}

// ─── Summary metric box ───────────────────────────────────────────────────────
function MetricBox({ icon, label, value, color, sub }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: `${color}12`,
        borderRadius: 14,
        padding: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: `${color}25`,
        marginHorizontal: 3,
      }}
    >
      <Ionicons
        name={icon}
        size={16}
        color={color}
        style={{ marginBottom: 4 }}
      />
      <Text
        style={{ fontSize: 18, fontWeight: "800", color, letterSpacing: -0.5 }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 9,
          fontWeight: "600",
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 2,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      {sub ? (
        <Text style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const MyRiskDetail = ({ onBack, studentId, baseStudent = null }) => {
  const { colors } = useTheme();
  const { profile } = useProfile();

  const sid = studentId || profile?.studentId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setFilter] = useState("all"); // all | critical | high | moderate | low

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    else {
      setLoading(true);
      fadeAnim.setValue(0);
    }
    setError(null);

    if (!sid) {
      setData(buildData([], []));
      setLoading(false);
      setRefresh(false);
      return;
    }

    try {
      const [pr, wr] = await Promise.allSettled([
        getStudentPace(sid),
        getStudentWarnings(sid),
      ]);
      const paceRaw = pr.status === "fulfilled" ? pr.value : [];
      const warningsRaw = wr.status === "fulfilled" ? wr.value : [];
      setData(buildData(paceRaw, warningsRaw));
    } catch {
      setError("Could not load data. Pull down to retry.");
      setData(buildData([], []));
    } finally {
      setLoading(false);
      setRefresh(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }
  };

  useEffect(() => {
    load();
  }, [sid]);

  const firstName = baseStudent?.firstName || profile?.firstName || "Student";
  const lastName = baseStudent?.lastName || profile?.lastName || "";
  const gradeLabel =
    (baseStudent?.gradeLevel || profile?.gradeLevel || "") +
    (baseStudent?.section || profile?.section
      ? " · " + (baseStudent?.section || profile?.section)
      : "");

  // ── Skeleton ──
  if (loading) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Sk w={180} h={26} style={{ marginBottom: 6 }} />
        <Sk w={120} h={14} style={{ marginBottom: 24 }} />
        <Sk w="100%" h={110} r={20} style={{ marginBottom: 14 }} />
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <Sk w="30%" h={80} r={14} style={{ marginRight: 6 }} />
          <Sk w="30%" h={80} r={14} style={{ marginRight: 6 }} />
          <Sk w="30%" h={80} r={14} />
        </View>
        {[1, 2, 3].map((i) => (
          <Sk key={i} w="100%" h={130} r={16} style={{ marginBottom: 10 }} />
        ))}
      </ScrollView>
    );
  }

  const rc = riskConf(data?.overallRisk || "low");
  const tc = trendConf(data?.overallTrend || "stable");

  const FILTERS = [
    { key: "all", label: "All", color: "#94A3B8" },
    { key: "critical", label: "Critical", color: "#F87171" },
    { key: "high", label: "High", color: "#FB923C" },
    { key: "moderate", label: "Moderate", color: "#FBBF24" },
    { key: "low", label: "On Track", color: "#34D399" },
  ];

  const visible =
    activeFilter === "all"
      ? data?.subjects || []
      : (data?.subjects || []).filter((s) => s.riskLevel === activeFilter);

  // Group visible by severity
  const criticals = visible.filter((s) => s.riskLevel === "critical");
  const highs = visible.filter((s) => s.riskLevel === "high");
  const moderates = visible.filter((s) => s.riskLevel === "moderate");
  const lows = visible.filter((s) => s.riskLevel === "low");

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        {/* ── Page header ── */}
        <View style={{ marginBottom: 20 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Ionicons
              name="shield-half-outline"
              size={18}
              color={rc.color}
              style={{ marginRight: 8 }}
            />
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: "#F1F5F9",
                letterSpacing: -0.5,
              }}
            >
              Risk Assessment
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: "#64748B" }}>
            {firstName} {lastName}
            {gradeLabel ? "  ·  " + gradeLabel : ""}
          </Text>
        </View>

        {/* ── Error ── */}
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

        {/* ── Overall status banner ── */}
        <View
          style={{
            backgroundColor: rc.bg,
            borderRadius: 20,
            padding: 18,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: `${rc.color}30`,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: `${rc.color}25`,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <Ionicons name={rc.icon} size={26} color={rc.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: `${rc.color}99`,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 2,
              }}
            >
              Overall Risk Level
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: rc.color,
                letterSpacing: -0.5,
              }}
            >
              {rc.label}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
                gap: 4,
              }}
            >
              <Ionicons name={tc.icon} size={12} color={tc.color} />
              <Text
                style={{ fontSize: 12, color: tc.color, fontWeight: "600" }}
              >
                {tc.label} trend
              </Text>
            </View>
          </View>
          {data?.totalBehind > 0 && (
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: "800",
                  color: "#F87171",
                  letterSpacing: -1,
                }}
              >
                {data.totalBehind}
              </Text>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "600",
                  color: "#F87171aa",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                behind
              </Text>
            </View>
          )}
        </View>

        {/* ── Summary metrics ── */}
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <MetricBox
            icon="speedometer-outline"
            label="Avg Pace"
            value={`${data?.avgPace || 0}%`}
            color={
              data?.avgPace >= 85
                ? "#34D399"
                : data?.avgPace >= 65
                  ? "#FBBF24"
                  : "#F87171"
            }
          />
          <MetricBox
            icon="book-outline"
            label="Subjects"
            value={data?.subjects?.length || 0}
            color="#38BDF8"
          />
          <MetricBox
            icon="alert-outline"
            label="At Risk"
            value={data?.atRisk?.length || 0}
            color={data?.atRisk?.length > 0 ? "#F87171" : "#34D399"}
          />
        </View>

        {/* ── Filter tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
        >
          <View style={{ flexDirection: "row", gap: 8, paddingRight: 4 }}>
            {FILTERS.map((f) => {
              const active = activeFilter === f.key;
              const cnt =
                f.key === "all"
                  ? data?.subjects?.length || 0
                  : (data?.subjects || []).filter((s) => s.riskLevel === f.key)
                      .length;
              if (f.key !== "all" && cnt === 0) return null;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 99,
                    backgroundColor: active ? f.color : `${f.color}15`,
                    borderWidth: 1,
                    borderColor: active ? f.color : `${f.color}30`,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: active ? "#0F172A" : f.color,
                    }}
                  >
                    {f.label}
                  </Text>
                  <View
                    style={{
                      backgroundColor: active ? "#0F172A33" : `${f.color}25`,
                      borderRadius: 99,
                      width: 18,
                      height: 18,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "800",
                        color: active ? "#0F172A" : f.color,
                      }}
                    >
                      {cnt}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* ── Subject cards, grouped by severity ── */}
        {visible.length === 0 ? (
          <View
            style={{
              backgroundColor: "#1E293B",
              borderRadius: 20,
              padding: 32,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#ffffff10",
            }}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={40}
              color="#34D399"
              style={{ marginBottom: 12 }}
            />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: "#34D399",
                marginBottom: 4,
              }}
            >
              All clear!
            </Text>
            <Text
              style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}
            >
              No subjects match this filter.
            </Text>
          </View>
        ) : (
          <>
            {criticals.length > 0 && (
              <>
                <TierHeader
                  label="Critical"
                  count={criticals.length}
                  color="#F87171"
                  icon="skull-outline"
                />
                {criticals.map((s, i) => (
                  <SubjectCard key={s.subject + i} {...s} index={i} />
                ))}
              </>
            )}
            {highs.length > 0 && (
              <>
                <TierHeader
                  label="High Risk"
                  count={highs.length}
                  color="#FB923C"
                  icon="alert-circle-outline"
                />
                {highs.map((s, i) => (
                  <SubjectCard key={s.subject + i} {...s} index={i} />
                ))}
              </>
            )}
            {moderates.length > 0 && (
              <>
                <TierHeader
                  label="Needs Attention"
                  count={moderates.length}
                  color="#FBBF24"
                  icon="warning-outline"
                />
                {moderates.map((s, i) => (
                  <SubjectCard key={s.subject + i} {...s} index={i} />
                ))}
              </>
            )}
            {lows.length > 0 && (
              <>
                <TierHeader
                  label="On Track"
                  count={lows.length}
                  color="#34D399"
                  icon="shield-checkmark-outline"
                />
                {lows.map((s, i) => (
                  <SubjectCard key={s.subject + i} {...s} index={i} />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ alignItems: "center", marginTop: 16 }}>
          <Text style={{ fontSize: 11, color: "#334155" }}>
            Pull down to refresh
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

export default MyRiskDetail;
