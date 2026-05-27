import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LoadingScreen from "../components/common/LoadingScreen";
import MyRiskDetail from "../components/common/students/StudentRiskDetail";
import { UnderMaintenance } from "../components/common/under-maintenance";
import { BottomTabBar } from "../components/layout/BottomTabBar";
import { TopHeader } from "../components/layout/TopHeader";
import { DashboardTab } from "../components/Tabs/DashboardScreen";
import { GradesScreen } from "../components/Tabs/GradesScreen";
import { NotificationsTab } from "../components/Tabs/NotificationsScreen";
import { ProfileTab } from "../components/Tabs/ProfileScreen";
import { ScheduleTab } from "../components/Tabs/ScheduleScreen";
import { ProfileProvider, useProfile } from "../constants/ProfileContext";
import { useTheme } from "../constants/useTheme";
import { signOut } from "../services/authService";
import {
  getStudentPace,
  listEarlyWarnings,
} from "../services/earlyWarningService";
import { computeUnreadCount, markAllRead } from "../services/notificationStore";

function HomeScreenInner() {
  const { colors, isDarkMode } = useTheme();
  const { profile, loading: profileLoading } = useProfile();
  const [activeTab, setTab] = useState("home");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [prevTab, setPrevTab] = useState("home");
  const [unreadCount, setUnreadCount] = useState(0);

  // Keep the latest raw API data so markAllRead can snapshot when the tab opens
  const latestPaceRef = useRef([]);
  const latestWarningsRef = useRef([]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  // Compute badge count using change-detection (not raw warning count)
  useEffect(() => {
    if (!profile.studentId) return;
    let cancelled = false;

    async function fetchAndCount() {
      try {
        const [warnings, paces] = await Promise.all([
          listEarlyWarnings({ studentId: profile.studentId }),
          getStudentPace(profile.studentId).catch(() => []),
        ]);
        if (cancelled) return;

        latestWarningsRef.current = Array.isArray(warnings) ? warnings : [];
        latestPaceRef.current = Array.isArray(paces) ? paces : [];

        const { unreadCount: count } = await computeUnreadCount(
          profile.studentId,
          latestPaceRef.current,
          latestWarningsRef.current,
        );
        if (!cancelled) setUnreadCount(count);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    fetchAndCount();
    return () => {
      cancelled = true;
    };
  }, [profile.studentId]);

  // Called when the user opens the notifications tab (tab bar or dashboard button)
  const handleOpenNotif = async () => {
    setTab("notif");
    setUnreadCount(0);
    await markAllRead(
      profile.studentId,
      latestPaceRef.current,
      latestWarningsRef.current,
    );
  };

  const studentName = profile.firstName
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : null;

  const studentMeta =
    profile.gradeLevel || profile.section
      ? `${profile.gradeLevel || ""}${
          profile.gradeLevel && profile.section ? " - " : ""
        }${profile.section || ""}`
      : null;

  const renderContent = () => {
    if (activeTab === "home") {
      return (
        <DashboardTab
          unreadCount={unreadCount}
          onNotifPress={handleOpenNotif}
          onRiskPress={() => setTab("alert")}
          studentName={studentName}
          studentMeta={studentMeta}
        />
      );
    }
    if (activeTab === "alert") {
      return (
        <MyRiskDetail
          onBack={() => setTab("home")}
          studentId={profile.studentId}
          baseStudent={
            profile.studentId
              ? {
                  id: profile.studentId,
                  firstName: profile.firstName,
                  middleName: profile.middleName,
                  lastName: profile.lastName,
                  gradeLevel: profile.gradeLevel,
                  section: profile.section,
                }
              : null
          }
        />
      );
    }
    if (activeTab === "grades") return <GradesScreen />;
    if (activeTab === "sched") return <ScheduleTab />;
    if (activeTab === "notif")
      return (
        <NotificationsTab
          onNavigate={(route) => setTab(route)}
          onReadOne={(notifId) => setUnreadCount((c) => Math.max(0, c - 1))}
        />
      );
    if (activeTab === "profile")
      return <ProfileTab onBack={() => setTab(prevTab)} />;
    return <UnderMaintenance />;
  };

  const selfScrolling = ["notif", "profile", "grades", "home"].includes(
    activeTab,
  );

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut();
    setTimeout(() => router.replace("/login"), 1800);
  };

  if (isLoggingOut)
    return <LoadingScreen message="See you soon!" variant="logout" />;
  if (isLoading || profileLoading)
    return <LoadingScreen message="Preparing your dashboard..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <TopHeader
        onProfilePress={() => {
          setPrevTab(activeTab);
          setTab("profile");
        }}
        onLogout={handleLogout}
      />
      {selfScrolling ? (
        <>{renderContent()}</>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {renderContent()}
        </ScrollView>
      )}
      {activeTab !== "profile" && (
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === "notif") {
              handleOpenNotif();
            } else {
              setTab(tab);
            }
          }}
          unreadCount={unreadCount}
        />
      )}
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  return (
    <ProfileProvider>
      <HomeScreenInner />
    </ProfileProvider>
  );
}
