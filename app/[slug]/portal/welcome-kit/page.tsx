"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import {
  MessagesSquare,
  MessageCircle,
  Mail,
  Clock,
  CheckSquare,
  Package,
  CheckCircle2,
  TrendingUp,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";

function WelcomeKitContent() {
  const pathname = usePathname();
  const slug = pathname.split("/")[1];

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-xl bg-primary/5 p-12 border border-primary/5 mb-12">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              Official Documentation
            </span>
            <h1 className="text-4xl font-extrabold text-portal-on-surface mb-4 leading-tight">
              Welcome to the
              <br />
              <span className="text-primary">Agency Collective</span> Family.
            </h1>
            <p className="text-portal-secondary-text text-lg leading-relaxed">
              This Welcome Kit serves as your operational blueprint. Here
              you&apos;ll find everything you need to know about how we
              communicate, build, and succeed together.
            </p>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column — Table of Contents */}
          <div className="md:col-span-3 space-y-4">
            <div className="bg-portal-surface-lowest rounded-xl p-6 shadow-sm sticky top-24">
              <h3 className="text-sm font-bold text-portal-on-surface uppercase tracking-wider mb-6">
                In This Kit
              </h3>
              <nav className="space-y-3">
                <a
                  href="#communication"
                  className="flex items-center gap-3 text-primary font-semibold text-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Communication
                </a>
                <a
                  href="#availability"
                  className="flex items-center gap-3 text-portal-secondary-text hover:text-primary transition-colors text-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-portal-secondary-text/30" />
                  Availability
                </a>
                <a
                  href="#approval"
                  className="flex items-center gap-3 text-portal-secondary-text hover:text-primary transition-colors text-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-portal-secondary-text/30" />
                  Approval Process
                </a>
                <a
                  href="#assets"
                  className="flex items-center gap-3 text-portal-secondary-text hover:text-primary transition-colors text-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-portal-secondary-text/30" />
                  Asset Responsibilities
                </a>
                <a
                  href="#timelines"
                  className="flex items-center gap-3 text-portal-secondary-text hover:text-primary transition-colors text-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-portal-secondary-text/30" />
                  Project Timelines
                </a>
              </nav>
              <div className="mt-8 pt-6 border-t border-portal-surface-container">
                <button className="flex items-center gap-2 text-violet-600 text-xs font-bold hover:underline">
                  <Download className="w-4 h-4" />
                  DOWNLOAD PDF VERSION
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="md:col-span-9 space-y-8">
            {/* Communication Channels */}
            <div
              id="communication"
              className="bg-portal-surface-lowest rounded-xl p-8 shadow-sm"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-primary">
                  <MessagesSquare className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">Communication Channels</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Slack */}
                <div className="p-6 bg-portal-surface-low rounded-xl border border-transparent hover:border-primary/20 transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="w-5 h-5 text-primary" />
                    <h4 className="font-bold">Slack Workspace</h4>
                  </div>
                  <p className="text-sm text-portal-secondary-text mb-4 leading-relaxed">
                    Our primary hub for daily updates, quick questions, and
                    collaborative brainstorming. We respond within 2-4 hours
                    during business hours.
                  </p>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    High Priority
                  </span>
                </div>
                {/* Email */}
                <div className="p-6 bg-portal-surface-low rounded-xl border border-transparent hover:border-primary/20 transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <Mail className="w-5 h-5 text-primary" />
                    <h4 className="font-bold">Email Protocol</h4>
                  </div>
                  <p className="text-sm text-portal-secondary-text mb-4 leading-relaxed">
                    Reserved for formal approvals, project briefs, and sensitive
                    documentation. Expect a response within 24 hours.
                  </p>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-portal-secondary-text/10 text-portal-secondary-text">
                    Standard
                  </span>
                </div>
              </div>
            </div>

            {/* Availability & Business Hours */}
            <div
              id="availability"
              className="bg-portal-surface-lowest rounded-xl p-8 shadow-sm"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-primary">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">
                  Availability & Business Hours
                </h3>
              </div>
              <div className="flex flex-col md:flex-row gap-8">
                {/* Schedule */}
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-portal-secondary-text uppercase tracking-widest mb-4">
                    Standard Hours
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex justify-between text-sm py-2 border-b border-portal-surface-container">
                      <span>Monday &ndash; Friday</span>
                      <span className="text-primary font-bold">
                        9:00 AM &ndash; 5:00 PM PT
                      </span>
                    </li>
                    <li className="flex justify-between text-sm py-2 border-b border-portal-surface-container">
                      <span>Saturday</span>
                      <span className="text-portal-secondary-text italic">
                        By Appointment Only
                      </span>
                    </li>
                    <li className="flex justify-between text-sm py-2">
                      <span>Sunday</span>
                      <span className="text-destructive font-medium">
                        Closed
                      </span>
                    </li>
                  </ul>
                </div>
                {/* Holidays */}
                <div className="flex-1 bg-portal-surface-low p-6 rounded-xl">
                  <h4 className="text-xs font-bold text-portal-secondary-text uppercase tracking-widest mb-4">
                    Observed Holidays
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      "New Year's Day",
                      "Memorial Day",
                      "Independence Day",
                      "Labor Day",
                      "Thanksgiving",
                      "Christmas Break",
                    ].map((holiday) => (
                      <div
                        key={holiday}
                        className="p-2 bg-portal-surface-lowest rounded border border-portal-surface-container"
                      >
                        {holiday}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Two-Column Row: Approval Flow + Your Responsibilities */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Approval Flow */}
              <div
                id="approval"
                className="bg-portal-surface-lowest rounded-xl p-8 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-6">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Approval Flow</h3>
                </div>
                <div className="space-y-4">
                  {[
                    {
                      step: 1,
                      title: "Initial Review",
                      desc: "First draft delivered via dashboard portal for client feedback.",
                    },
                    {
                      step: 2,
                      title: "Refinement",
                      desc: "Revisions completed based on consolidated client notes.",
                    },
                    {
                      step: 3,
                      title: "Final Sign-off",
                      desc: "Formal approval required before asset hand-off or go-live.",
                    },
                  ].map((item, idx) => (
                    <div key={item.step} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                          {item.step}
                        </div>
                        {idx < 2 && (
                          <div className="w-px h-full bg-portal-surface-container" />
                        )}
                      </div>
                      <div>
                        <h5 className="text-sm font-bold">{item.title}</h5>
                        <p className="text-xs text-portal-secondary-text mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Your Responsibilities */}
              <div
                id="assets"
                className="bg-portal-surface-lowest rounded-xl p-8 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Package className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Your Responsibilities</h3>
                </div>
                <p className="italic text-sm text-portal-secondary-text mb-4">
                  To keep us on schedule, we&apos;ll need:
                </p>
                <ul className="space-y-2">
                  {[
                    "High-res logos & brand guides",
                    "Website copy & photography",
                    "Third-party platform access",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-portal-on-surface"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 p-4 bg-destructive/5 rounded-lg border border-destructive/10">
                  <p className="text-xs text-destructive font-medium">
                    Delay in providing assets may shift the project timeline by
                    equal or greater duration.
                  </p>
                </div>
              </div>
            </div>

            {/* Project Timelines */}
            <div
              id="timelines"
              className="bg-portal-surface-lowest rounded-xl p-8 shadow-sm"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-primary">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">
                  Typical Project Lifecycles
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    label: "Discovery Phase",
                    value: "1\u20132 Weeks",
                    subtitle: "Strategy & Planning",
                  },
                  {
                    label: "Build Phase",
                    value: "4\u20138 Weeks",
                    subtitle: "Design & Development",
                  },
                  {
                    label: "Launch Phase",
                    value: "1 Week",
                    subtitle: "Testing & Deployment",
                  },
                ].map((item, idx) => (
                  <div
                    key={item.label}
                    className={cn(
                      "p-6 text-center border-r border-portal-surface-container",
                      idx === 2 && "border-none"
                    )}
                  >
                    <p className="text-xs font-bold text-portal-secondary-text uppercase mb-2">
                      {item.label}
                    </p>
                    <p className="text-3xl font-extrabold text-primary">
                      {item.value}
                    </p>
                    <p className="text-xs text-portal-secondary-text mt-2">
                      {item.subtitle}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Section */}
            <div className="bg-primary p-12 rounded-xl text-center relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Ready to kick things off?
                </h3>
                <p className="text-portal-primary-container font-medium mb-8 max-w-lg mx-auto">
                  We&apos;re excited to partner with you. Head over to the
                  Onboarding tab to submit your initial brand assets.
                </p>
                <div className="flex justify-center gap-4">
                  <a
                    href={`/${slug}/portal/onboarding`}
                    className="px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-primary/5 transition-colors"
                  >
                    Start Onboarding
                  </a>
                  <button className="px-8 py-3 border border-white/30 text-white font-bold rounded-full hover:bg-white/10 transition-colors">
                    Book Intro Call
                  </button>
                </div>
              </div>
              {/* Background dot pattern */}
              <svg
                className="absolute inset-0 w-full h-full opacity-10 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="dot-pattern"
                    x="0"
                    y="0"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="5" cy="5" r="1" fill="currentColor" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#dot-pattern)" />
              </svg>
            </div>

            {/* Footer */}
            <div className="mt-16 pt-8 border-t border-portal-surface-container text-center">
              <p className="text-xs text-portal-secondary-text">
                &copy; 2024 Agency Collective. Confidential Client Resource.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export default function WelcomeKitPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </DashboardShell>
      }
    >
      <WelcomeKitContent />
    </Suspense>
  );
}
