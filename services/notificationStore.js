/**
 * notificationStore.js
 *
 * Persists two things per student (keyed by studentId) in SecureStore:
 *
 *  1. snapshot  — { [subjectKey]: pace_percent }  last pace values the user
 *                 has "seen" (i.e. they were current when the badge was last cleared).
 *
 *  2. readIds   — Set<string>  notification IDs the user has explicitly tapped.
 *
 * Badge count = subjects whose current pace_percent differs from the snapshot
 *               AND whose notification ID is not in readIds.
 *
 * On "mark all read" or navigating to the notifications tab we:
 *   - save the current pace values as the new snapshot
 *   - clear readIds
 *   → badge becomes 0 and stays 0 until a grade actually changes again.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ─── Storage adapter (mirrors authToken.js) ──────────────────────────────────
function getStorage() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      async setItemAsync(key, value) {
        window.localStorage.setItem(key, value);
      },
      async getItemAsync(key) {
        return window.localStorage.getItem(key);
      },
      async deleteItemAsync(key) {
        window.localStorage.removeItem(key);
      },
    };
  }
  return SecureStore;
}

const storage = getStorage();

function snapshotKey(studentId) {
  return `notif_snapshot_${studentId}`;
}
function readIdsKey(studentId) {
  return `notif_read_${studentId}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function loadSnapshot(studentId) {
  try {
    const raw = await storage.getItemAsync(snapshotKey(studentId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveSnapshot(studentId, snapshot) {
  try {
    await storage.setItemAsync(
      snapshotKey(studentId),
      JSON.stringify(snapshot),
    );
  } catch {
    /* non-fatal */
  }
}

async function loadReadIds(studentId) {
  try {
    const raw = await storage.getItemAsync(readIdsKey(studentId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

async function saveReadIds(studentId, readIds) {
  try {
    await storage.setItemAsync(
      readIdsKey(studentId),
      JSON.stringify([...readIds]),
    );
  } catch {
    /* non-fatal */
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build notification items from pace records and compute the unread badge count.
 *
 * @param {string|number} studentId
 * @param {Array}  paceList   — raw pace records from getStudentPace()
 * @param {Array}  warnings   — raw warning records from listEarlyWarnings()
 * @returns {{ unreadCount: number, changedSubjects: Set<string> }}
 *   changedSubjects = lowercase subject keys that changed since last snapshot
 */
export async function computeUnreadCount(studentId, paceList, warnings) {
  if (!studentId) return { unreadCount: 0, changedSubjects: new Set() };

  const snapshot = await loadSnapshot(studentId);
  const readIds = await loadReadIds(studentId);

  // Deduplicate paces by subject (keep latest)
  const paceBySubject = new Map();
  (paceList || []).forEach((p) => {
    if (!p.subject) return;
    const key = p.subject.toLowerCase();
    const existing = paceBySubject.get(key);
    if (!existing) {
      paceBySubject.set(key, p);
    } else {
      const eTs = new Date(
        existing.updated_at || existing.created_at || 0,
      ).getTime();
      const nTs = new Date(p.updated_at || p.created_at || 0).getTime();
      if (nTs >= eTs) paceBySubject.set(key, p);
    }
  });

  // Also cover subjects only in warnings (no pace record)
  (warnings || []).forEach((w) => {
    if (!w.subject) return;
    const key = w.subject.toLowerCase();
    if (!paceBySubject.has(key)) {
      paceBySubject.set(key, {
        subject: w.subject,
        pace_percent: w.pace_percent,
      });
    }
  });

  const changedSubjects = new Set();

  paceBySubject.forEach((p, key) => {
    const current = Number(p.pace_percent);
    const previous = snapshot[key];

    // A subject is "new/changed" if:
    //   - it has never appeared in a snapshot before, OR
    //   - its pace_percent has changed since the last snapshot
    const hasChanged =
      previous === undefined || Math.round(previous) !== Math.round(current);

    if (hasChanged) {
      // Build the same ID format used in warningToNotification
      const warningId =
        (warnings || []).find(
          (w) => w.subject && w.subject.toLowerCase() === key,
        )?.warning_id ??
        p.student_id ??
        studentId;

      const notifId = `${warningId}-${key.replace(/\s+/g, "_")}`;
      if (!readIds.has(notifId)) {
        changedSubjects.add(key);
      }
    }
  });

  return { unreadCount: changedSubjects.size, changedSubjects };
}

/**
 * Mark a single notification as read.
 * Decrements the badge for that subject.
 *
 * @param {string|number} studentId
 * @param {string}        notifId   — the id field from the notification item
 */
export async function markNotificationRead(studentId, notifId) {
  if (!studentId || !notifId) return;
  const readIds = await loadReadIds(studentId);
  readIds.add(String(notifId));
  await saveReadIds(studentId, readIds);
}

/**
 * Mark ALL notifications as read and save the current pace values as the new
 * snapshot so the badge stays 0 until grades actually change again.
 *
 * @param {string|number} studentId
 * @param {Array}         paceList   — current pace records
 * @param {Array}         warnings   — current warning records
 */
export async function markAllRead(studentId, paceList, warnings) {
  if (!studentId) return;

  // Snapshot the current pace values
  const snapshot = {};
  const paceBySubject = new Map();

  (paceList || []).forEach((p) => {
    if (!p.subject) return;
    const key = p.subject.toLowerCase();
    paceBySubject.set(key, Number(p.pace_percent));
  });
  (warnings || []).forEach((w) => {
    if (!w.subject) return;
    const key = w.subject.toLowerCase();
    if (!paceBySubject.has(key)) paceBySubject.set(key, Number(w.pace_percent));
  });

  paceBySubject.forEach((pct, key) => {
    snapshot[key] = pct;
  });

  await saveSnapshot(studentId, snapshot);
  await saveReadIds(studentId, new Set()); // clear read IDs — snapshot handles it now
}

/**
 * Call after a single card tap. Saves the notifId as read and, if this subject's
 * pace matches the current value, updates the snapshot entry for it.
 *
 * @param {string|number} studentId
 * @param {string}        notifId
 * @param {string}        subject      — subject name (raw)
 * @param {number}        pacePercent  — current pace value
 */
export async function markOneRead(studentId, notifId, subject, pacePercent) {
  if (!studentId) return;
  // Persist the read ID
  await markNotificationRead(studentId, notifId);
  // Update snapshot for this subject so it won't re-appear until pace changes again
  if (subject) {
    const snapshot = await loadSnapshot(studentId);
    snapshot[subject.toLowerCase()] = Number(pacePercent);
    await saveSnapshot(studentId, snapshot);
  }
}
