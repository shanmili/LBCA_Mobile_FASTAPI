import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_ENDPOINTS } from "../../constants/apiConfig";
import { useProfile } from "../../constants/ProfileContext";
import { useTheme } from "../../constants/useTheme";
import { apiClient } from "../../services/apiClient";

// Only used for READ-ONLY display fields, never for editable TextInput values
function displayValue(value) {
  if (typeof value !== "string") return value ?? "Not provided";
  return value.trim() || "Not provided";
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  icon,
  colors,
  editable = true,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.card,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: focused ? colors.accent : colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Ionicons
          name={icon}
          size={16}
          color={focused ? colors.accent : colors.muted}
          style={{ marginRight: 10 }}
        />
        <TextInput
          value={value}
          onChangeText={editable ? onChangeText : undefined}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType || "default"}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            color: editable ? colors.text : colors.muted,
            fontSize: 14,
            fontWeight: "500",
          }}
        />
      </View>
    </View>
  );
}

export function ProfileTab({ onBack }) {
  const { colors } = useTheme();
  const { profile, updateProfile } = useProfile();

  // Local draft state — only committed on Save
  const [draft, setDraft] = useState({ ...profile });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...profile });
  }, [profile]);

  const set = (key) => (val) => setDraft((d) => ({ ...d, [key]: val }));

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setDraft((d) => ({ ...d, photo: result.assets[0].uri }));
    }
  };

  const handleSave = async () => {
    if (!draft.firstName?.trim() || !draft.lastName?.trim()) {
      Alert.alert("Required", "First and last name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch(API_ENDPOINTS.updateStudent(draft.studentId), {
        address: draft.address || null,
        guardian_first_name: draft.guardianFirstName || null,
        guardian_mid_name: draft.guardianMiddleName || null,
        guardian_last_name: draft.guardianLastName || null,
        guardian_contact: draft.guardianContact || null,
        guardian_relationship: draft.guardianRelationship || null,
      });
      updateProfile(draft);
      Alert.alert("Saved!", "Your profile has been updated.");
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.message || "Something went wrong.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const initials =
    `${draft.firstName?.[0] ?? ""}${draft.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ padding: 20 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            <TouchableOpacity
              onPress={onBack}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <View>
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: colors.text }}
              >
                Edit Profile
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                Update your personal information
              </Text>
            </View>
          </View>

          {/* Avatar Section */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <View style={{ position: "relative" }}>
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: `${colors.accent}22`,
                  borderWidth: 3,
                  borderColor: colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {draft.photo ? (
                  <Image
                    source={{ uri: draft.photo }}
                    style={{ width: 100, height: 100, borderRadius: 50 }}
                  />
                ) : (
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "800",
                      color: colors.accent,
                    }}
                  >
                    {initials}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Form */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.text,
                marginBottom: 16,
              }}
            >
              Student Information
            </Text>

            <Field
              label="First Name"
              value={displayValue(draft.firstName)}
              placeholder="First name"
              icon="person-outline"
              colors={colors}
              editable={false}
            />
            <Field
              label="Middle Name"
              value={displayValue(draft.middleName)}
              placeholder="Middle name"
              icon="person-outline"
              colors={colors}
              editable={false}
            />
            <Field
              label="Last Name"
              value={displayValue(draft.lastName)}
              placeholder="Last name"
              icon="person-outline"
              colors={colors}
              editable={false}
            />
            <Field
              label="Birthdate"
              value={displayValue(draft.birthdate)}
              placeholder="Birthdate"
              icon="calendar-outline"
              colors={colors}
              editable={false}
            />
            <Field
              label="Gender"
              value={displayValue(draft.gender)}
              placeholder="Gender"
              icon="male-female-outline"
              colors={colors}
              editable={false}
            />
            <Field
              label="Grade Level"
              value={displayValue(draft.gradeLevel)}
              placeholder="Grade level"
              icon="school-outline"
              colors={colors}
              editable={false}
            />
            <Field
              label="Section"
              value={displayValue(draft.section)}
              placeholder="Section"
              icon="people-outline"
              colors={colors}
              editable={false}
            />
          </View>

          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 28,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.text,
                marginBottom: 16,
              }}
            >
              Other Details
            </Text>

            <Field
              label="Home Address"
              value={draft.address ?? ""}
              onChangeText={set("address")}
              placeholder="House / Street / Barangay"
              icon="location-outline"
              colors={colors}
            />
            <Field
              label="Guardian First Name"
              value={draft.guardianFirstName ?? ""}
              onChangeText={set("guardianFirstName")}
              placeholder="Enter guardian first name"
              icon="person-outline"
              colors={colors}
            />
            <Field
              label="Guardian Middle Name"
              value={draft.guardianMiddleName ?? ""}
              onChangeText={set("guardianMiddleName")}
              placeholder="Enter guardian middle name"
              icon="person-outline"
              colors={colors}
            />
            <Field
              label="Guardian Last Name"
              value={draft.guardianLastName ?? ""}
              onChangeText={set("guardianLastName")}
              placeholder="Enter guardian last name"
              icon="person-outline"
              colors={colors}
            />
            <Field
              label="Guardian Contact"
              value={draft.guardianContact ?? ""}
              onChangeText={set("guardianContact")}
              placeholder="Enter guardian contact"
              keyboardType="phone-pad"
              icon="call-outline"
              colors={colors}
            />
            <Field
              label="Guardian Relationship"
              value={draft.guardianRelationship ?? ""}
              onChangeText={set("guardianRelationship")}
              placeholder="Enter guardian relationship"
              icon="people-outline"
              colors={colors}
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: colors.accent,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: saving ? 0.7 : 1,
              marginBottom: 8,
            }}
          >
            <Ionicons name="checkmark-circle" size={18} color="#0F172A" />
            <Text style={{ fontSize: 15, fontWeight: "800", color: "#0F172A" }}>
              {saving ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
