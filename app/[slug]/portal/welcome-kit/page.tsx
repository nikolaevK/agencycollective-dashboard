"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import {
  MessagesSquare,
  MessageCircle,
  Mail,
  Clock,
  CheckSquare,
  CheckCircle2,
  Package,
  TrendingUp,
  Download,
  ShieldCheck,
  Handshake,
  Image,
  FileText,
  Palette,
  Globe,
  Scale,
  Star,
  Info,
  X,
  Check,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";

/* ------------------------------------------------------------------ */
/*  TOC nav link                                                       */
/* ------------------------------------------------------------------ */

function TocLink({
  href,
  children,
  num,
}: {
  href: string;
  children: React.ReactNode;
  num: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 text-portal-secondary-text hover:text-primary transition-colors text-sm group"
    >
      <span className="text-[10px] font-bold text-portal-outline-variant group-hover:text-primary w-4 text-right">
        {num}
      </span>
      <span>{children}</span>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({
  id,
  num,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  num: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-portal-surface-lowest rounded-xl p-5 md:p-8 shadow-sm scroll-mt-24"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-primary">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-portal-outline-variant uppercase tracking-widest">
            {num}
          </p>
          <h3 className="text-2xl font-bold">{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main content                                                       */
/* ------------------------------------------------------------------ */

function WelcomeKitContent() {
  const pathname = usePathname();
  const slug = pathname.split("/")[1];

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-xl bg-primary/5 p-6 md:p-12 border border-primary/5 mb-12">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              Client Welcome Kit
            </span>
            <h1 className="text-2xl md:text-4xl font-extrabold text-portal-on-surface mb-4 leading-tight">
              Welcome to the
              <br />
              <span className="text-primary">Agency Collective</span> Family.
            </h1>
            <p className="text-portal-secondary-text text-lg leading-relaxed">
              Everything you need to know about how we communicate, operate, and
              build results together.
            </p>
          </div>
        </div>

        {/* ── Bento Grid ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* ── Left Column — TOC ────────────────────────────── */}
          <div className="md:col-span-3 space-y-4">
            <div className="bg-portal-surface-lowest rounded-xl p-6 shadow-sm sticky top-24">
              <h3 className="text-sm font-bold text-portal-on-surface uppercase tracking-wider mb-6">
                Contents
              </h3>
              <nav className="space-y-3">
                <TocLink href="#communication" num="01">Communication</TocLink>
                <TocLink href="#availability" num="02">Response & Business Hours</TocLink>
                <TocLink href="#approval" num="03">Creative Approval Process</TocLink>
                <TocLink href="#assets" num="04">Asset Responsibilities</TocLink>
                <TocLink href="#timelines" num="05">Project Timelines & Revisions</TocLink>
                <TocLink href="#access" num="06">Platform Access & Scope</TocLink>
                <TocLink href="#partnership" num="07">Partnership Success</TocLink>
              </nav>
              <div className="mt-8 pt-6 border-t border-portal-surface-container">
                <a
                  href="/Agency_Collective_Welcome_Kit.pdf"
                  download
                  className="flex items-center gap-2 text-primary text-xs font-bold hover:underline"
                >
                  <Download className="w-4 h-4" />
                  DOWNLOAD PDF VERSION
                </a>
              </div>
            </div>
          </div>

          {/* ── Right Column — Sections ──────────────────────── */}
          <div className="md:col-span-9 space-y-8">
            {/* ═══ 01 / COMMUNICATION ═══════════════════════════ */}
            <Section id="communication" num="01 / Communication" icon={MessagesSquare} title="How We Connect">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Slack */}
                <div className="p-6 bg-portal-surface-low rounded-xl">
                  <div className="flex items-center gap-3 mb-1">
                    <MessageCircle className="w-5 h-5 text-primary" />
                    <h4 className="font-bold">Slack</h4>
                  </div>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">
                    Primary Channel
                  </p>
                  <p className="text-sm text-portal-secondary-text mb-4 leading-relaxed">
                    All clients receive a dedicated Slack channel for direct team
                    access.
                  </p>
                  <p className="text-[10px] font-bold text-portal-secondary-dim uppercase tracking-widest mb-2">
                    Used For
                  </p>
                  <ul className="space-y-1.5 text-sm text-portal-on-surface">
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary shrink-0" />Project updates & milestones</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary shrink-0" />Quick questions & clarifications</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary shrink-0" />Asset requests & feedback</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary shrink-0" />Status updates in real time</li>
                  </ul>
                </div>
                {/* Email */}
                <div className="p-6 bg-portal-surface-low rounded-xl">
                  <div className="flex items-center gap-3 mb-1">
                    <Mail className="w-5 h-5 text-primary" />
                    <h4 className="font-bold">Email</h4>
                  </div>
                  <p className="text-[10px] font-bold text-portal-secondary-text uppercase tracking-widest mb-3">
                    Formal Communication
                  </p>
                  <p className="text-sm text-portal-secondary-text mb-4 leading-relaxed">
                    Reserved for structured, documented communication requiring a
                    paper trail.
                  </p>
                  <p className="text-[10px] font-bold text-portal-secondary-dim uppercase tracking-widest mb-2">
                    Used For
                  </p>
                  <ul className="space-y-1.5 text-sm text-portal-on-surface">
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-portal-secondary-text shrink-0" />Contracts & agreements</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-portal-secondary-text shrink-0" />Billing & invoices</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-portal-secondary-text shrink-0" />Formal documentation</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-portal-secondary-text shrink-0" />Long-form project summaries</li>
                  </ul>
                </div>
              </div>
              {/* Pro Tip */}
              <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10 flex items-start gap-3">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-portal-on-surface">
                  <span className="font-bold">Pro Tip:</span> Slack keeps
                  communication organized. Flag urgent items in Slack for fastest
                  response.
                </p>
              </div>
            </Section>

            {/* ═══ 02 / AVAILABILITY ════════════════════════════ */}
            <Section id="availability" num="02 / Availability" icon={Clock} title="Response & Business Hours">
              {/* Response guarantee */}
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="md:col-span-1 bg-primary p-6 rounded-xl text-white text-center flex flex-col items-center justify-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-2">
                    Response Guarantee
                  </p>
                  <p className="text-5xl font-black leading-none mb-1">1</p>
                  <p className="text-sm font-bold">Business Day</p>
                  <p className="text-xs opacity-70 mt-2 leading-relaxed">
                    Most responses happen much faster. Urgent? Flag it in Slack.
                  </p>
                </div>
                {/* Hours */}
                <div className="md:col-span-1">
                  <h4 className="text-xs font-bold text-portal-secondary-text uppercase tracking-widest mb-4">
                    Business Hours
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex justify-between text-sm py-2 border-b border-portal-surface-container">
                      <span>Mon &ndash; Fri</span>
                      <span className="text-primary font-bold">9 AM &ndash; 5 PM</span>
                    </li>
                    <li className="text-sm py-2 border-b border-portal-surface-container">
                      <span className="text-primary font-bold">Pacific Time (PT)</span>
                    </li>
                  </ul>
                  <p className="text-xs text-portal-secondary-text mt-3 leading-relaxed">
                    Messages outside hours are addressed the next business day.
                  </p>
                </div>
                {/* Holidays */}
                <div className="md:col-span-1 bg-portal-surface-low p-6 rounded-xl">
                  <h4 className="text-xs font-bold text-portal-secondary-text uppercase tracking-widest mb-4">
                    Observed Holidays
                  </h4>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {[
                      "New Year's Day",
                      "Memorial Day",
                      "Independence Day",
                      "Labor Day",
                      "Thanksgiving Day",
                      "Christmas Day",
                    ].map((h) => (
                      <div
                        key={h}
                        className="p-2 bg-portal-surface-lowest rounded border border-portal-surface-container"
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* ═══ 03 / CREATIVE APPROVAL ═══════════════════════ */}
            <Section id="approval" num="03 / Creative" icon={CheckSquare} title="Approval Process">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Checklist */}
                <div>
                  <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">
                    Creative Assets Checklist
                  </h4>
                  <ul className="space-y-2.5">
                    {[
                      "Ads",
                      "Email campaigns",
                      "SMS campaigns",
                      "Landing pages",
                      "Website changes",
                      "Social media creatives",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm text-portal-on-surface">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-portal-secondary-text mt-4 font-medium">
                    All assets require approval before publishing.
                  </p>
                </div>
                {/* After approval + Post-approval */}
                <div className="space-y-4">
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/20">
                    <div className="flex items-center gap-3 mb-2">
                      <Check className="w-5 h-5 text-emerald-600" />
                      <h5 className="font-bold text-sm">After Approval</h5>
                    </div>
                    <p className="text-sm text-portal-secondary-text leading-relaxed">
                      Once you approve, we proceed immediately. No delays.
                    </p>
                  </div>
                  <div className="p-6 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20">
                    <div className="flex items-center gap-3 mb-2">
                      <Star className="w-5 h-5 text-amber-600" />
                      <h5 className="font-bold text-sm">Post-Approval Changes</h5>
                    </div>
                    <p className="text-sm text-portal-secondary-text leading-relaxed">
                      Additional revisions will be scheduled per workload.
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            {/* ═══ 04 / ASSETS ══════════════════════════════════ */}
            <Section id="assets" num="04 / Assets" icon={Package} title="Asset Responsibilities">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {[
                  { icon: Palette, label: "Logos", desc: "Brand mark & variations" },
                  { icon: FileText, label: "Brand Guidelines", desc: "Colors, fonts & voice" },
                  { icon: Image, label: "Product Imagery", desc: "Photos & visual assets" },
                  { icon: MessagesSquare, label: "Copy & Messaging", desc: "Tone, taglines & copy" },
                  { icon: Globe, label: "Platform Access", desc: "Meta, Shopify, Klaviyo\u2026" },
                  { icon: Scale, label: "Legal Disclaimers", desc: "Compliance requirements" },
                ].map((a) => (
                  <div
                    key={a.label}
                    className="p-5 bg-portal-surface-low rounded-xl flex flex-col items-center text-center gap-2"
                  >
                    <a.icon className="w-6 h-6 text-primary" />
                    <p className="text-sm font-bold text-portal-on-surface">{a.label}</p>
                    <p className="text-xs text-portal-secondary-text">{a.desc}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-destructive/5 rounded-lg border border-destructive/10 flex items-start gap-3">
                <Info className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive font-medium">
                  <span className="font-bold">Timeline Impact:</span> Delays in
                  asset delivery may affect project timelines. Providing all
                  assets upfront ensures faster results.
                </p>
              </div>
            </Section>

            {/* ═══ 05 / TIMELINES ═══════════════════════════════ */}
            <Section id="timelines" num="05 / Timelines" icon={TrendingUp} title="Project Timelines & Revisions">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Timeline Factors */}
                <div>
                  <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">
                    Timeline Factors
                  </h4>
                  <p className="text-sm text-portal-secondary-text mb-4">
                    These factors directly influence delivery speed.
                  </p>
                  <ul className="space-y-3">
                    {[
                      "Client Responsiveness",
                      "Asset Delivery Speed",
                      "Platform Approvals",
                      "Scope of Work",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        <span className="text-sm font-medium text-portal-on-surface">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-portal-secondary-text mt-4 italic">
                    Estimated timelines communicated at project start.
                  </p>
                </div>
                {/* Revision Process */}
                <div className="bg-portal-surface-low p-6 rounded-xl">
                  <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">
                    Revision Process
                  </h4>
                  <div className="flex items-center gap-3 mb-4">
                    <Star className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <p className="font-bold text-sm text-portal-on-surface">Quality First</p>
                      <p className="text-xs text-portal-secondary-text">
                        We aim to deliver high-quality work the first time.
                        Revisions included.
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-portal-on-surface">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      Revisions must be clearly communicated
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      Consolidate feedback when possible
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      Batched requests avoid unnecessary delays
                    </li>
                  </ul>
                </div>
              </div>
            </Section>

            {/* ═══ 06 / PLATFORM ACCESS & SCOPE ═════════════════ */}
            <Section id="access" num="06 / Access & Scope" icon={ShieldCheck} title="Platform Access & Scope">
              {/* Platform table */}
              <div className="mb-8">
                <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">
                  Platform Access Required
                </h4>
                <div className="space-y-2">
                  {[
                    { platform: "Shopify / WooCommerce", category: "E-Commerce" },
                    { platform: "Meta Business Manager", category: "Advertising" },
                    { platform: "Google Analytics", category: "Analytics" },
                    { platform: "Klaviyo / Omnisend / Brevo", category: "Email Mktg" },
                    { platform: "Ad Accounts", category: "Paid Media" },
                  ].map((p) => (
                    <div
                      key={p.platform}
                      className="flex items-center justify-between p-3 bg-portal-surface-low rounded-lg"
                    >
                      <span className="text-sm font-medium text-portal-on-surface">{p.platform}</span>
                      <span className="text-[10px] font-bold text-portal-secondary-dim uppercase tracking-wider">
                        {p.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scope */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/20">
                  <h5 className="font-bold text-sm mb-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" /> In Scope
                  </h5>
                  <ul className="space-y-2 text-sm text-portal-on-surface">
                    <li>All work defined in the agreed project scope</li>
                    <li>Deliverables outlined in the retainer agreement</li>
                    <li>Revisions within the defined scope</li>
                  </ul>
                </div>
                <div className="p-6 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-800/20">
                  <h5 className="font-bold text-sm mb-3 flex items-center gap-2">
                    <X className="w-4 h-4 text-red-600" /> Out of Scope
                  </h5>
                  <ul className="space-y-2 text-sm text-portal-on-surface">
                    <li>May require a revised timeline</li>
                    <li>Additional billing may apply</li>
                    <li>A new project agreement may be needed</li>
                  </ul>
                </div>
              </div>

              {/* Security note */}
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 flex items-start gap-3 mb-4">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-portal-on-surface">
                  <span className="font-bold">We never request passwords.</span>{" "}
                  Access granted via user permissions only.
                </p>
              </div>

              {/* Performance disclaimer */}
              <div className="p-4 bg-portal-surface-low rounded-lg">
                <p className="text-[10px] font-bold text-portal-secondary-dim uppercase tracking-widest mb-1">
                  Performance Disclaimer
                </p>
                <p className="text-xs text-portal-secondary-text leading-relaxed">
                  While we apply proven strategies, marketing performance cannot
                  be guaranteed. Results depend on market conditions, platform
                  algorithms, and customer behavior.
                </p>
              </div>
            </Section>

            {/* ═══ 07 / PARTNERSHIP ═════════════════════════════ */}
            <Section id="partnership" num="07 / Partnership" icon={Handshake} title="How to Get Best Results">
              <div className="space-y-6">
                {[
                  {
                    icon: MessagesSquare,
                    title: "Clear Communication",
                    desc: "Open, direct, and timely dialogue keeps projects on track and avoids costly misunderstandings.",
                  },
                  {
                    icon: Clock,
                    title: "Timely Feedback",
                    desc: "Quick responses from your side directly accelerate our delivery speed and launch timelines.",
                  },
                  {
                    icon: CheckSquare,
                    title: "Quick Approvals",
                    desc: "Faster approvals mean faster results, faster launches, and faster revenue impact.",
                  },
                  {
                    icon: Handshake,
                    title: "Strategy Collaboration",
                    desc: "The best outcomes come from working together on direction, not just execution.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h5 className="font-bold text-sm text-portal-on-surface mb-1">
                        {item.title}
                      </h5>
                      <p className="text-sm text-portal-secondary-text leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs text-portal-secondary-text font-medium italic text-center">
                When both sides move quickly, results follow.
              </p>
            </Section>

            {/* ═══ CTA ══════════════════════════════════════════ */}
            <div className="bg-primary p-6 md:p-12 rounded-xl text-center relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-white mb-4">
                  We&apos;re Excited to Work With You
                </h3>
                <p className="text-white/80 font-medium mb-8 max-w-lg mx-auto">
                  Our goal is simple: Build systems that grow your business. If
                  you ever have questions, reach out in Slack and our team will
                  take care of it.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <a
                    href={`/${slug}/portal/onboarding`}
                    className="px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-primary/5 transition-colors"
                  >
                    Start Onboarding
                  </a>
                  <a
                    href="/Agency_Collective_Welcome_Kit.pdf"
                    download
                    className="px-8 py-3 border border-white/30 text-white font-bold rounded-full hover:bg-white/10 transition-colors inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </a>
                </div>
              </div>
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

            {/* ═══ Footer ═══════════════════════════════════════ */}
            <div className="mt-16 pt-8 border-t border-portal-surface-container text-center">
              <p className="text-xs text-portal-secondary-text">
                &copy; {new Date().getFullYear()} Agency Collective. Confidential
                Client Resource.
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
