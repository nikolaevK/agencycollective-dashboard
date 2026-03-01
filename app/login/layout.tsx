import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { readUsers } from "@/lib/users";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (session) {
    const users = readUsers();
    const user = users.find((u) => u.id === session.userId);
    if (user?.slug) redirect(`/${user.slug}/portal/overview`);
  }
  return <>{children}</>;
}
