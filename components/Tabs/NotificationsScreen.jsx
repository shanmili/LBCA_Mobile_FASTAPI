import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useProfile } from "../../constants/ProfileContext";
import { pill, pillText } from "../../constants/styles";
import { useTheme } from "../../constants/useTheme";
import {
  getStudentPace,
  listEarlyWarnings,
} from "../../services/earlyWarningService";
import { markOneRead } from "../../services/notificationStore";

// ─── Risk level → display config ────────────────────────────────────────────
const RISK_CONFIG = {
  critical: {
    color: "#F87171",
    icon: "warning-circle-outline",
    label: "Critical",
  },
  high: { color: "#FB923C", icon: "alert-circle-outline", label: "High Risk" },
  moderate: {
    color: "#FBBF24",
    icon: "warning-outline",
    label: "Needs Attention",
  },
  low: {
    color: "#34D399",
    icon: "shield-checkmark-outline",
    label: "On Track",
  },
};

const normalizeRisk = (v) => {
  const s = String(v || "").toLowerCase();
  if (s.includes("critical")) return "critical";
  if (s.includes("high")) return "high";
  if (s.includes("moderate") || s.includes("medium")) return "moderate";
  return "low";
};

// Always derive risk from the live pace_percent so stale DB risk_level is ignored
const riskFromPct = (pct) => {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "low";
  if (n < 60) return "critical";
  if (n < 75) return "high";
  if (n < 85) return "moderate";
  return "low";
};

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// Derive trend from live pace_percent — never trust the stale DB trend string.
const trendFromPct = (pct, apiTrend) => {
  const n = Number(pct);
  const api = String(apiTrend || "").toLowerCase();
  if (!Number.isFinite(n)) return "stable";
  if (n >= 85 && api.includes("improv")) return "improving";
  if (n < 85) return "declining";
  return "stable";
};

function warningToNotification(w) {
  // Use pace_percent to derive risk so stale DB risk_level is never trusted
  const riskKey = riskFromPct(w.pace_percent);
  const riskConf = RISK_CONFIG[riskKey];

  // Recompute status from the live risk so it matches the badge
  const statusMap = {
    critical: "Critical",
    high: "At Risk",
    moderate: "Warning",
    low: "On Track",
  };
  const body = statusMap[riskKey] || riskConf.label;

  return {
    id: `${w.warning_id ?? w.student_id}-${(w.subject || "").toLowerCase().replace(/\s+/g, "_")}`,
    riskKey,
    icon: riskConf.icon,
    color: riskConf.color,
    label: riskConf.label,
    title: w.subject || "Academic Update",
    body,
    trend: trendFromPct(w.pace_percent, w.trend),
    pacePercent: Number(w.pace_percent),
    time: formatRelativeTime(w.updated_at || w.created_at),
    unread: true,
  };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
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

// ─── Card ────────────────────────────────────────────────────────────────────
function NotifCard({ item, colors, onPress }) {
  const trendColor =
    item.trend === "improving"
      ? "#34D399"
      : item.trend === "declining"
        ? "#F87171"
        : "#94A3B8";
  const trendIcon =
    item.trend === "improving"
      ? "trending-up"
      : item.trend === "declining"
        ? "trending-down"
        : "remove";

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.75}
      style={{
        backgroundColor: item.unread ? colors.cardLight : colors.card,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "flex-start",
        borderLeftWidth: 3,
        borderLeftColor: item.unread ? item.color : "transparent",
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: `${item.color}22`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Risk badge + unread dot */}
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
              backgroundColor: `${item.color}22`,
              borderRadius: 100,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: item.color,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {item.label}
            </Text>
          </View>
          {item.unread && (
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: colors.accent,
              }}
            />
          )}
        </View>

        {/* Subject title */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 4,
          }}
        >
          {item.title}
        </Text>

        {/* Body: status · teacher */}
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            lineHeight: 18,
            marginBottom: 8,
          }}
        >
          {item.body}
        </Text>

        {/* Footer: time + trend */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}
          >
            {item.time}
          </Text>
          {item.trend && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Ionicons name={trendIcon} size={12} color={trendColor} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: trendColor,
                  textTransform: "capitalize",
                }}
              >
                {item.trend}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function NotificationsTab({ onNavigate, onReadOne }) {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    if (!profile.studentId) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // Fetch both warnings AND real pace records in parallel.
      // EarlyWarning.pace_percent can be stale in the DB, so we override it
      // with the authoritative value from the StudentPace table.
      const [warnings, paces] = await Promise.all([
        listEarlyWarnings({ studentId: profile.studentId }),
        getStudentPace(profile.studentId).catch(() => []),
      ]);

      const paceList = Array.isArray(paces) ? paces : [];

      // Deduplicate pace records by subject — keep the one with the most recent
      // updated_at (or the last occurrence if timestamps are absent).
      const paceBySubject = new Map();
      paceList.forEach((p) => {
        if (!p.subject) return;
        const key = p.subject.toLowerCase();
        const existing = paceBySubject.get(key);
        if (!existing) {
          paceBySubject.set(key, p);
        } else {
          // Prefer the record with the later timestamp
          const existingTs = new Date(
            existing.updated_at || existing.created_at || 0,
          ).getTime();
          const newTs = new Date(p.updated_at || p.created_at || 0).getTime();
          if (newTs >= existingTs) paceBySubject.set(key, p);
        }
      });

      // Deduplicate warnings by subject — same strategy
      const warningBySubject = new Map();
      warnings.forEach((w) => {
        if (!w.subject) return;
        const key = w.subject.toLowerCase();
        const existing = warningBySubject.get(key);
        if (!existing) {
          warningBySubject.set(key, w);
        } else {
          const existingTs = new Date(
            existing.updated_at || existing.created_at || 0,
          ).getTime();
          const newTs = new Date(w.updated_at || w.created_at || 0).getTime();
          if (newTs >= existingTs) warningBySubject.set(key, w);
        }
      });

      // Merge: one entry per subject. Pace records are the source of truth for
      // which subjects exist; warnings enrich them with extra metadata.
      const allItems = [];

      paceBySubject.forEach((p, key) => {
        const w = warningBySubject.get(key);
        const base = w
          ? { ...w, pace_percent: Number(p.pace_percent) }
          : {
              warning_id: `pace-${profile.studentId}-${key}`,
              student_id: profile.studentId,
              subject: p.subject,
              pace_percent: Number(p.pace_percent),
              trend: p.trend || "stable",
              updated_at: p.updated_at || p.created_at || null,
              created_at: p.created_at || null,
            };
        allItems.push(base);
      });

      // Include any warning subjects that had no pace record at all
      warningBySubject.forEach((w, key) => {
        if (!paceBySubject.has(key)) allItems.push(w);
      });

      setItems(allItems.map(warningToNotification));
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch {
      setError("Could not load alerts. Pull down to retry.");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [profile.studentId]);

  const unreadCount = items.filter((n) => n.unread).length;
  const markAllRead = () =>
    setItems(items.map((n) => ({ ...n, unread: false })));
  const handlePress = async (item) => {
    // Mark unread in local UI
    if (item.unread) {
      setItems(
        items.map((n) => (n.id === item.id ? { ...n, unread: false } : n)),
      );
      // Persist the read state and decrement badge in parent
      await markOneRead(
        profile.studentId,
        item.id,
        item.title, // subject name
        item.pacePercent, // may be undefined for old items — store handles it
      );
      if (onReadOne) onReadOne(item.id);
    }
    // Navigate to the Risk Assessment (Alerts) tab
    if (onNavigate) onNavigate("alert");
  };

  if (loading) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Skeleton
          width={150}
          height={28}
          radius={8}
          style={{ marginBottom: 6 }}
        />
        <Skeleton
          width={110}
          height={14}
          radius={6}
          style={{ marginBottom: 24 }}
        />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton
            key={i}
            width="100%"
            height={110}
            radius={20}
            style={{ marginBottom: 10 }}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        <View style={{ padding: 20 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                Alerts
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {unreadCount > 0
                  ? `${unreadCount} unread alert${unreadCount !== 1 ? "s" : ""}`
                  : "All caught up!"}
              </Text>
            </View>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={markAllRead}
                style={pill(colors.accent)}
              >
                <Text style={pillText(colors.accent)}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Error */}
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

          {/* Cards */}
          {items.map((item) => (
            <NotifCard
              key={item.id}
              item={item}
              colors={colors}
              onPress={handlePress}
            />
          ))}

          {/* Empty */}
          {items.length === 0 && !error && profile.studentId && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Ionicons
                name="shield-checkmark-outline"
                size={52}
                color="#34D399"
              />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.text,
                  marginTop: 16,
                  marginBottom: 4,
                }}
              >
                No active alerts
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  textAlign: "center",
                  lineHeight: 18,
                }}
              >
                Your academic progress looks good.{"\n"}Pull down to refresh
                anytime.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}
