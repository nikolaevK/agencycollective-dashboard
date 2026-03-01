import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (session) {
    const user = await findUser(session.userId);
    if (user?.slug) redirect(`/${user.slug}/portal/overview`);
  }
  return <>{children}</>;
}
