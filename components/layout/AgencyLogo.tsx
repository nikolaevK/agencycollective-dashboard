"use client";

import Image from "next/image";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface AgencyLogoProps {
  className?: string;
}

export function AgencyLogo({ className }: AgencyLogoProps) {
  const { theme } = useTheme();

  return (
    <div className={cn("relative h-10 w-44", className)}>
      <Image
        src="/images/ac-logo.png"
        alt="Agency Collective"
        fill
        className={cn(
          "object-contain object-left",
          theme === "light" && "invert"
        )}
        priority
      />
    </div>
  );
}
