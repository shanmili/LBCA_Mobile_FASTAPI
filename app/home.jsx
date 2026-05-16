import { router } from "expo-router";
import { useEffect, useState } from "react";
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
import { notifications } from "../constants/data";
import { ProfileProvider, useProfile } from "../constants/ProfileContext";
import { useTheme } from "../constants/useTheme";
import { signOut } from "../services/authService";

function HomeScreenInner() {
  const { colors, isDarkMode } = useTheme();
  const { profile, loading: profileLoading } = useProfile();
  const [activeTab, setTab] = useState("home");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [prevTab, setPrevTab] = useState("home");
  const [unreadCount, setUnreadCount] = useState(
    notifications.filter((n) => n.unread).length,
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  const studentName = profile.firstName
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : null;

  const studentMeta =
    profile.gradeLevel || profile.section
      ? `${profile.gradeLevel || ""}${profile.gradeLevel && profile.section ? " - " : ""}${profile.section || ""}`
      : null;

  const renderContent = () => {
    if (activeTab === "home") {
      return (
        <DashboardTab
          unreadCount={unreadCount}
          onNotifPress={() => setTab("notif")}
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
    if (activeTab === "notif") return <NotificationsTab onNavigate={(route) => {
      setTab(route);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }} />;
    if (activeTab === "profile") return <ProfileTab onBack={() => setTab(prevTab)} />;
    return <UnderMaintenance />;
  };

  const selfScrolling = ["notif", "profile", "grades"].includes(activeTab);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut();
    setTimeout(() => router.replace("/login"), 1800);
  };

  if (isLoggingOut) return <LoadingScreen message="See you soon!" variant="logout" />;
  if (isLoading || profileLoading) return <LoadingScreen message="Preparing your dashboard..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <TopHeader
        onProfilePress={() => { setPrevTab(activeTab); setTab("profile"); }}
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
          onTabChange={setTab}
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