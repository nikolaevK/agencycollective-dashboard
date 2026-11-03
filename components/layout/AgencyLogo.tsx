"use client";

import Image from "next/image";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface AgencyLogoProps {
  className?: string;
  /** "mark" = the square AC monogram (the collapsed sidebar rail). */
  variant?: "full" | "mark";
}

export function AgencyLogo({ className, variant = "full" }: AgencyLogoProps) {
  const { theme } = useTheme();

  if (variant === "mark") {
    // Dark artwork on transparent — inverted for dark mode.
    return (
      <Image
        src="/ac-icon.png"
        alt="Agency Collective"
        width={32}
        height={32}
        className={cn("size-8 shrink-0 dark:invert", className)}
      />
    );
  }

  return (
    <div className={cn("relative h-10 w-44", className)}>
      <Image
        src="/images/ac-logo.png"
        alt="Agency Collective"
        fill
        sizes="176px"
        className={cn(
          "object-contain object-left",
          theme === "light" && "invert"
        )}
        priority
      />
    </div>
  );
}
