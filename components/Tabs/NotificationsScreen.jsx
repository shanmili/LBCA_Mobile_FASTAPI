import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { notifications as fallbackNotifications } from "../../constants/data";
import { useProfile } from "../../constants/ProfileContext";
import { pill, pillText } from "../../constants/styles";
import { useTheme } from "../../constants/useTheme";
import { listEarlyWarnings } from "../../services/earlyWarningService";

const TYPE_CONFIG = {
  alert: { color: "#F59E0B", label: "Alert" },
  grade: { color: "#38BDF8", label: "Grade" },
  announcement: { color: "#A78BFA", label: "Announcement" },
  schedule: { color: "#34D399", label: "Schedule" },
};

const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

const buildNotificationItems = (warnings) =>
  toList(warnings).map((warning, index) => ({
    id: warning.id || `warning-${warning.subject || "item"}-${index}`,
    type: "alert",
    ionIcon: warning.risk_level ? "shield-checkmark" : "alert-circle",
    title: warning.subject ? `${warning.subject} alert` : "Academic update",
    body:
      warning.message ||
      `${warning.status || "New update"}${warning.teacher ? ` • ${warning.teacher}` : ""}`,
    time: "Just now",
    unread: true,
    route: "home",
  }));

export function NotificationsTab({ onNavigate, items: initialItems }) {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const [items, setItems] = useState(initialItems || fallbackNotifications);

  useEffect(() => {
    let mounted = true;

    const loadItems = async () => {
      if (!profile.studentId) {
        if (mounted) {
          setItems(initialItems || fallbackNotifications);
        }
        return;
      }

      try {
        const warnings = await listEarlyWarnings({ studentId: profile.studentId });
        if (mounted) {
          const liveItems = buildNotificationItems(warnings);
          setItems(liveItems.length > 0 ? liveItems : initialItems || fallbackNotifications);
        }
      } catch {
        if (mounted) {
          setItems(initialItems || fallbackNotifications);
        }
      }
    };

    loadItems();

    return () => {
      mounted = false;
    };
  }, [initialItems, profile.studentId]);

  const unreadCount = items.filter((n) => n.unread).length;

  const markAllRead = () => setItems(items.map((n) => ({ ...n, unread: false })));

  const handlePress = (item) => {
    setItems(items.map((n) => (n.id === item.id ? { ...n, unread: false } : n)));
    if (item.route && onNavigate) {
      onNavigate(item.route);
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ padding: 20 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 4 }}>
              Notifications
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
            </Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead} style={pill(colors.accent)}>
              <Text style={pillText(colors.accent)}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {items.map((n) => {
          const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.announcement;
          const isRoutable = !!n.route;

          return (
            <TouchableOpacity
              key={n.id}
              onPress={() => handlePress(n)}
              activeOpacity={0.75}
              style={{
                backgroundColor: n.unread ? colors.cardLight : colors.card,
                borderRadius: 20,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "flex-start",
                borderLeftWidth: 3,
                borderLeftColor: n.unread ? config.color : "transparent",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: `${config.color}22`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                  flexShrink: 0,
                }}
              >
                <Ionicons name={n.ionIcon} size={20} color={config.color} />
              </View>

              <View style={{ flex: 1 }}>
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
                      backgroundColor: `${config.color}22`,
                      borderRadius: 100,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: config.color,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {config.label}
                    </Text>
                  </View>
                  {n.unread && (
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

                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {n.title}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    lineHeight: 18,
                    marginBottom: 8,
                  }}
                >
                  {n.body}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.muted,
                      fontWeight: "600",
                    }}
                  >
                    {n.time}
                  </Text>
                  {isRoutable && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.accent,
                          fontWeight: "700",
                        }}
                      >
                        View Details
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color={colors.accent} />
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {items.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.muted} />
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: colors.text,
                marginTop: 16,
              }}
            >
              No notifications yet
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              You’re all caught up!
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
