import { PortalLogin } from "@/components/auth/PortalLogin";

export default function StaffLoginPage() {
  return (
    <PortalLogin
      roleKeys={["admin", "closer"]}
      hero={{
        title: "Your Agency",
        emphasis: "Command Center.",
        subtitle: "Admins and closers — sign in to manage dashboards, deals, and sales performance.",
      }}
      welcome={{ heading: "Welcome back", subheading: "Select your portal to continue." }}
    />
  );
}
