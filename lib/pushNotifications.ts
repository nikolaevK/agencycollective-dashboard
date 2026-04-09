import crypto from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require("web-push");
import { getDb, ensureMigrated } from "./db";

export interface PushSubscriptionRecord {
  id: string;
  adminId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

let vapidWarned = false;

/** Returns false if VAPID keys are not configured (skips push silently). */
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    if (!vapidWarned) {
      console.warn("[push] VAPID keys not configured — push notifications disabled");
      vapidWarned = true;
    }
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function insertPushSubscription(sub: {
  adminId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT OR REPLACE INTO push_subscriptions (id, admin_id, endpoint, p256dh, auth, user_agent)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, sub.adminId, sub.endpoint, sub.p256dh, sub.auth, sub.userAgent ?? null],
  });
}

export async function deletePushSubscription(endpoint: string, adminId?: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const sql = adminId
    ? "DELETE FROM push_subscriptions WHERE endpoint = ? AND admin_id = ?"
    : "DELETE FROM push_subscriptions WHERE endpoint = ?";
  const args = adminId ? [endpoint, adminId] : [endpoint];
  const result = await db.execute({ sql, args });
  return (result.rowsAffected ?? 0) > 0;
}

export async function readPushSubscriptionsByAdmin(adminId: string): Promise<PushSubscriptionRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM push_subscriptions WHERE admin_id = ?",
    args: [adminId],
  });
  return result.rows.map(mapRow);
}

export async function readAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM push_subscriptions");
  return result.rows.map(mapRow);
}

/**
 * web-push@3.6.7 does not convert the legacy FCM endpoint to the VAPID-compatible
 * /wp/ endpoint. The old /fcm/send/ endpoint accepts VAPID requests (201) but
 * silently drops them. We must convert before sending.
 */
function fixFcmEndpoint(endpoint: string): string {
  if (endpoint.startsWith("https://fcm.googleapis.com/fcm/send/")) {
    return endpoint.replace("https://fcm.googleapis.com/fcm/send/", "https://fcm.googleapis.com/wp/");
  }
  return endpoint;
}

export async function sendPushToAllAdmins(payload: NotificationPayload): Promise<void> {
  if (!configureVapid()) return;
  const subscriptions = await readAllPushSubscriptions();
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const endpoint = fixFcmEndpoint(sub.endpoint);
        await webpush.sendNotification(
          {
            endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 410 Gone or 404 means subscription is no longer valid
        if (statusCode === 410 || statusCode === 404) {
          await deletePushSubscription(sub.endpoint).catch(() => {});
        } else {
          console.error(`[push] Failed to send to admin ${sub.adminId}:`, err);
        }
        throw err;
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[push] ${failed}/${subscriptions.length} notification(s) failed`);
  }
}

function mapRow(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    id: String(row.id),
    adminId: String(row.admin_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    userAgent: row.user_agent != null ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  };
}
