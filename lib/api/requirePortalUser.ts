import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ensureMigrated } from "@/lib/db";
import { findUser, type UserRecord } from "@/lib/users";

/**
 * Client-portal API guard: verified `u_sess` cookie + the user still exists
 * (DB is the truth, never the token). Every portal route acts ONLY on
 * `user.id` — ids from the URL/body are always checked against it.
 */
export async function requirePortalUser(): Promise<
  { user: UserRecord; response?: undefined } | { response: NextResponse; user?: undefined }
> {
  const session = getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  await ensureMigrated();
  const user = await findUser(session.userId);
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}
