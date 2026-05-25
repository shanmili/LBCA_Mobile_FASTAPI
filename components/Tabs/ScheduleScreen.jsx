import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { subjectColors } from "../../constants/data";
import { useProfile } from "../../constants/ProfileContext";
import { useTheme } from "../../constants/useTheme";
import { getClassSchedules, getSubjects } from "../../services/scheduleService";

const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const dayShort = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const formatTime = (value) => {
  if (!value) return "TBA";
  const text = String(value).slice(0, 5);
  return text || "TBA";
};

const normalizeScheduleData = (rows, subjectMap) => {
  const grouped = rows.reduce((acc, row) => {
    const day = String(row.day_of_week || row.day || "").toLowerCase();
    if (!day) return acc;

    const list = acc[day] || [];
    list.push({
      subject: subjectMap.get(row.subject_id) || `Subject ${row.subject_id || ""}`.trim(),
      room: row.room || "TBA",
      teacher: row.teacher_name || row.teacher || "Teacher",
      time: formatTime(row.start_time || row.startTime),
      endTime: formatTime(row.end_time || row.endTime),
    });
    acc[day] = list;
    return acc;
  }, {});

  return dayOrder
    .filter((day) => grouped[day])
    .map((day) => ({
      day: dayShort[day] || day.slice(0, 3),
      periods: grouped[day]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((period) => ({
          ...period,
          time: period.time,
          room: period.room,
          teacher: period.teacher,
        })),
    }));
};

export function ScheduleTab() {
  const { colors } = useTheme();
  const { profile, loading: profileLoading } = useProfile();
  const [activeDay, setActiveDay] = useState(0);
  const [schedule, setSchedule] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSchedule = async () => {
      if (!profile.sectionId) {
        if (mounted) {
          setSchedule([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);

      try {
        const [scheduleRows, subjectRows] = await Promise.all([
          getClassSchedules(profile.sectionId),
          getSubjects(),
        ]);

        if (!mounted) return;

        const subjectMap = new Map(
          toList(subjectRows).map((subject) => [subject.subject_id, subject.subject_name]),
        );

        const liveSchedule = normalizeScheduleData(scheduleRows, subjectMap);
        setSchedule(liveSchedule);
      } catch {
        if (mounted) {
          setSchedule([]);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadSchedule();

    return () => {
      mounted = false;
    };
  }, [profile.sectionId]);

  const displaySchedule = useMemo(() => schedule, [schedule]);

  useEffect(() => {
    setActiveDay(0);
  }, [displaySchedule]);

  if (profileLoading || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
          Loading latest schedule...
        </Text>
      </View>
    );
  }

  const activeSection = displaySchedule[activeDay] || displaySchedule[0];

  return (
    <View style={{ padding: 20 }}>
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 4 }}>
          Schedule
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {profile.gradeLevel || "Grade 8"}
          {profile.gradeLevel && profile.section ? " — " : ""}
          {profile.section || "Section A"}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
        {displaySchedule.map((d, i) => (
          <TouchableOpacity
            key={`${d.day}-${i}`}
            onPress={() => setActiveDay(i)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 18,
              borderRadius: 100,
              backgroundColor: activeDay === i ? colors.accent : colors.card,
              borderWidth: 1,
              borderColor: activeDay === i ? colors.accent : colors.border,
              marginRight: 8,
            }}
          >
            <Text
              style={{
                color: activeDay === i ? colors.bg : colors.muted,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {d.day}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeSection?.periods?.length ? (
        activeSection.periods.map((p, i) => {
          const color = subjectColors[p.subject] || colors.accent;
          return (
            <View key={`${p.subject}-${p.time}-${i}`} style={{ flexDirection: "row", marginBottom: 12 }}>
              <View
                style={{
                  width: 50,
                  alignItems: "flex-end",
                  paddingTop: 14,
                  marginRight: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: colors.muted,
                  }}
                >
                  {p.time}
                </Text>
              </View>
              <View
                style={{
                  width: 3,
                  borderRadius: 3,
                  backgroundColor: color,
                  marginRight: 14,
                }}
              />
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
                  {p.subject}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 6 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    <Ionicons
                      name="location-outline"
                      size={12}
                      color={colors.muted}
                      style={{ marginRight: 3 }}
                    />
                    <Text style={{ fontSize: 12, color: colors.muted }}>{p.room}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons
                      name="person-outline"
                      size={12}
                      color={colors.muted}
                      style={{ marginRight: 3 }}
                    />
                    <Text style={{ fontSize: 12, color: colors.muted }}>{p.teacher}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <View style={{ paddingVertical: 18, alignItems: "center" }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>No schedule available for this day.</Text>
        </View>
      )}
    </View>
  );
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}
