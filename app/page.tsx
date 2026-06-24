import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { PortalLogin } from "@/components/auth/PortalLogin";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { portal?: string };
}) {
  // Backward compatibility: every middleware redirect, layout guard, and logout
  // button still targets /?portal=admin|closer. The root is now the client
  // login, so forward those staff entry points to the staff login — no existing
  // flow breaks. (?portal=client and no param fall through to the client form.)
  if (searchParams.portal === "admin") redirect("/staff?role=admin");
  if (searchParams.portal === "closer") redirect("/staff?role=closer");

  // Already-signed-in clients skip the form and go straight to their portal.
  const session = getSession();
  if (session) {
    const user = await findUser(session.userId);
    if (user?.slug) redirect(`/${user.slug}/portal/overview`);
  }

  return (
    <PortalLogin
      roleKeys={["client"]}
      hero={{
        title: "Your Ad Performance",
        emphasis: "Command Center.",
        subtitle: "Track your campaign performance, creative, and results — all in one place.",
      }}
      welcome={{ heading: "Welcome back", subheading: "Sign in to your client portal." }}
    />
  );
}
