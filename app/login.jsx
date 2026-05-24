import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../constants/useTheme";
import { signIn } from "../services/authService";

export default function LoginScreen() {
  const { colors, isDarkMode } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    const studentId = username.trim();
    const loginPassword = password.trim() || studentId;

    if (!studentId) {
      Alert.alert("Missing field", "Please enter your Student ID.");
      return;
    }

    try {
      setIsSubmitting(true);
      await signIn(studentId, loginPassword, "parent");
      router.replace("/home");
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        "Unable to sign in.";
      Alert.alert("Login failed", String(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bgDark,
      }}
    >
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: "center", marginBottom: 48 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="school" size={32} color="#0F172A" />
            </View>
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.text }}>
              LBCA Monitor
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Lapasan Baptist Christian Academy
            </Text>
          </View>

          <View>
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.muted,
                  marginBottom: 6,
                }}
              >
                STUDENT ID
              </Text>
              <View
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                }}
              >
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setUsername}
                  placeholder="Enter your Student ID"
                  placeholderTextColor={colors.muted}
                  style={{ color: colors.text, fontSize: 15, paddingVertical: 16 }}
                  value={username}
                />
              </View>
            </View>
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.muted,
                  marginBottom: 6,
                }}
              >
                PASSWORD
              </Text>
              <View
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                }}
              >
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  style={{ color: colors.text, fontSize: 15, paddingVertical: 16 }}
                  value={password}
                />
              </View>
            </View>
            <TouchableOpacity
              disabled={isSubmitting}
              onPress={handleSignIn}
              style={{
                backgroundColor: colors.accent,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
                opacity: isSubmitting ? 0.8 : 1,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "800" }}>
                  Sign In
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
