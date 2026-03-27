"use client";

import { Suspense, useMemo, useState } from "react";
import {
  Megaphone,
  Mail,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  ExternalLink,
  Headset,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  useOnboardingProgress,
  useToggleOnboardingStep,
} from "@/hooks/useOnboardingProgress";
import { ALL_STEP_IDS as VALID_STEP_IDS } from "@/lib/onboarding-steps";

/* ------------------------------------------------------------------ */
/*  Types & Data                                                       */
/* ------------------------------------------------------------------ */

interface SubStep {
  text: string;
  bold?: string[];
  warning?: string;
  test?: string;
}

interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  subSteps: SubStep[];
}

interface OnboardingSection {
  id: string;
  title: string;
  phase: string;
  icon: React.ElementType;
  tasks: OnboardingTask[];
}

const SECTIONS: OnboardingSection[] = [
  {
    id: "meta-setup",
    title: "Meta Setup",
    phase: "Phase 01 \u00b7 Technical Infrastructure",
    icon: Megaphone,
    tasks: [
      {
        id: "meta.ads-manager",
        title: "Access Ads Manager",
        description:
          "Initialize and connect your primary advertising account to the portal.",
        subSteps: [
          { text: "Log into Facebook." },
          { text: 'On the left sidebar, click "See More".' },
          { text: 'Click "Ads Manager".' },
        ],
      },
      {
        id: "meta.business-portfolio",
        title: "Create Business Portfolio",
        description:
          "Aggregate your pages, Instagram accounts, and pixels under a unified portfolio.",
        subSteps: [
          {
            text: "Click the top-left toggle menu (next to the account numbers).",
          },
          {
            text: 'If no Business Portfolio exists, click "Create New Business Portfolio".',
          },
          { text: "Enter business details and complete setup." },
        ],
      },
      {
        id: "meta.business-settings",
        title: "Set Up Business Settings",
        description:
          "Configure pages, ad accounts, and pixel under your Business Portfolio.",
        subSteps: [
          {
            text: 'A. Add Page \u2014 Go to Business Settings \u2192 Pages \u2192 Add \u2192 "Create New Page". Upload logo if available.',
          },
          {
            text: 'B. Create Ad Account \u2014 Go to Ad Accounts \u2192 Add \u2192 "Create a New Ad Account". Do NOT add payment yet.',
          },
          {
            text: "C. Set Up Pixel \u2014 Go to Data Sources \u2192 Datasets/Pixels \u2192 Add \u2192 Create New Pixel. Connect it to the Ad Account.",
          },
        ],
      },
      {
        id: "meta.payment-method",
        title: "Add Payment Method",
        description:
          "Securely attach a valid credit card or billing line to ensure uninterrupted campaign delivery.",
        subSteps: [
          { text: 'Go to "Billing & Payments".' },
          { text: 'Click "Payment Methods" (left side).' },
          {
            text: 'Click "Add Business Payment Method" and enter card details.',
          },
          {
            text: "After adding, go to Ad Accounts \u2192 select the Ad Account.",
          },
          { text: 'Click "Add Payment Method".' },
          { text: 'Choose "Business Payment Method".' },
          { text: 'Set it as "Default".' },
          {
            text: "Confirm business address and billing details are correct.",
          },
        ],
      },
      {
        id: "meta.adding-users",
        title: "Add Users",
        description:
          "Invite Agency Collective partners with necessary permissions.",
        subSteps: [
          { text: "Go to Users \u2192 People." },
          { text: 'Click "Invite People".' },
          { text: "Add: Nejadbusiness@gmail.com" },
          { text: "Add: noorrenterprises@gmail.com" },
          { text: 'Grant "Full Access".' },
          {
            text: 'Ensure "Manage Access" is enabled for all permissions.',
          },
        ],
      },
      {
        id: "meta.pixel-plugin",
        title: "Pixel Plugin",
        description:
          "Install the Meta Pixel and Conversions API on your website for tracking and attribution.",
        subSteps: [
          {
            text: "Inside WordPress, go to Plugins \u2192 Add Plugin.",
          },
          {
            text: 'Install and activate the "Facebook for WooCommerce" plugin.',
          },
          {
            text: "Follow the prompts to connect the ad account/pixel.",
          },
        ],
      },
    ],
  },
  {
    id: "omnisend-setup",
    title: "Omnisend Setup",
    phase: "Phase 02 \u00b7 Lifecycle Marketing (WooCommerce)",
    icon: Mail,
    tasks: [
      {
        id: "omnisend.create-account",
        title: "Create Omnisend Account",
        description:
          "Set up your Omnisend account and connect it to your e-commerce platform.",
        subSteps: [
          { text: "Go to omnisend.com and create a new account." },
          {
            text: 'Select "WooCommerce" as your platform during setup.',
          },
          { text: "Complete basic company info." },
        ],
      },
      {
        id: "omnisend.connect-woocommerce",
        title: "Connect WooCommerce",
        description:
          "Link your store so customer data and purchase history sync automatically.",
        subSteps: [
          {
            text: "Inside Omnisend, go to Store Settings \u2192 Integrations.",
          },
          { text: 'Select "WooCommerce".' },
          {
            text: 'Install and activate the "Omnisend WooCommerce" plugin.',
          },
          { text: "Follow the prompts to connect the store." },
          {
            text: "Confirm products + contacts are syncing properly.",
            test: "Check that products appear inside Omnisend under Products.",
          },
        ],
      },
      {
        id: "omnisend.connect-domain",
        title: "Connect Sending Domain",
        description:
          "Authenticate your email domain with SPF + DKIM records for deliverability.",
        subSteps: [
          { text: "Go to Settings \u2192 Domains." },
          {
            text: "Add your branded sending domain (e.g. email.yourbrand.com).",
          },
          {
            text: "Add the required DNS records (SPF + DKIM) inside your domain provider.",
          },
          {
            text: 'Wait for verification to show "Authenticated".',
          },
          {
            text: "Do NOT send campaigns until the domain is authenticated.",
            warning:
              "Sending before authentication may harm deliverability.",
          },
        ],
      },
      {
        id: "omnisend.add-agency-access",
        title: "Add Agency Access",
        description: "Grant Agency Collective admin access to your Omnisend account.",
        subSteps: [
          { text: "Go to Settings \u2192 Team." },
          { text: 'Click "Add User".' },
          { text: "Add: emails@agencycollective.ai" },
          { text: 'Set role to "Admin".' },
        ],
      },
      {
        id: "omnisend.final-verification",
        title: "Final Verification",
        description:
          "Confirm all integrations are live before marking Omnisend setup as complete.",
        subSteps: [
          { text: "WooCommerce is syncing." },
          { text: "Domain is authenticated." },
          { text: "emails@agencycollective.ai has Admin access." },
          {
            text: "Default sender email is set to branded domain.",
          },
        ],
      },
    ],
  },
];

// Validate at module load that local SECTIONS stay in sync with the canonical list
const LOCAL_STEP_IDS = SECTIONS.flatMap((s) => s.tasks.map((t) => t.id));
if (LOCAL_STEP_IDS.length !== VALID_STEP_IDS.length || !LOCAL_STEP_IDS.every((id, i) => id === VALID_STEP_IDS[i])) {
  console.error("[onboarding] Local step IDs are out of sync with lib/onboarding-steps.ts");
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusBadge({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <span className="text-[10px] px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full font-bold shrink-0">
        COMPLETE
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full font-bold shrink-0">
      PENDING
    </span>
  );
}

function TaskCard({
  task,
  completed,
  onToggle,
  isPending,
}: {
  task: OnboardingTask;
  completed: boolean;
  onToggle: () => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "group bg-portal-surface-lowest rounded-xl transition-all",
        completed
          ? "border border-transparent hover:border-portal-surface-high"
          : "border-2 border-primary/10 hover:border-primary/20"
      )}
    >
      {/* Header — always visible */}
      <div
        className="flex items-start gap-4 p-6 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={isPending}
          className={cn(
            "w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
            completed
              ? "border-primary bg-primary text-white"
              : "border-portal-outline bg-white dark:bg-transparent hover:border-primary",
            isPending && "opacity-50"
          )}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
        >
          {completed && <Check className="w-3 h-3" />}
        </button>

        {/* Title + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span
              className={cn(
                "font-bold text-portal-on-surface",
                completed && "line-through opacity-50"
              )}
            >
              {task.title}
            </span>
            <StatusBadge completed={completed} />
          </div>
          <p
            className={cn(
              "text-sm text-portal-secondary-text leading-relaxed",
              completed && "opacity-60"
            )}
          >
            {task.description}
          </p>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          className={cn(
            "w-5 h-5 text-portal-outline-variant shrink-0 mt-1 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div className="px-6 pb-6 pt-0">
          <div className="ml-10 border-l-2 border-portal-surface-container pl-5 space-y-3">
            {task.subSteps.map((sub, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="text-xs font-bold text-portal-secondary-dim bg-portal-surface-low rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="text-sm text-portal-on-surface leading-relaxed">
                  <span>{sub.text}</span>
                  {sub.test && (
                    <span className="flex items-center gap-1.5 mt-1.5 text-xs text-primary font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Test: {sub.test}
                    </span>
                  )}
                  {sub.warning && (
                    <span className="flex items-center gap-1.5 mt-1.5 text-xs text-destructive font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {sub.warning}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  completedSteps,
  onToggle,
  pendingStepId,
}: {
  section: OnboardingSection;
  completedSteps: Set<string>;
  onToggle: (stepId: string) => void;
  pendingStepId: string | null;
}) {
  const Icon = section.icon;
  const doneCount = section.tasks.filter((t) => completedSteps.has(t.id)).length;

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-portal-surface-low flex items-center justify-center text-primary">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{section.title}</h2>
          <p className="text-xs font-medium text-portal-secondary-text">
            {section.phase}
          </p>
        </div>
        <span className="text-xs font-bold text-portal-secondary-text">
          {doneCount}/{section.tasks.length}
        </span>
      </div>

      <div className="space-y-4">
        {section.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            completed={completedSteps.has(task.id)}
            onToggle={() => onToggle(task.id)}
            isPending={pendingStepId === task.id}
          />
        ))}
      </div>
    </section>
  );
}

function MilestoneSummary({
  completedSteps,
}: {
  completedSteps: Set<string>;
}) {
  const milestones = useMemo(() => {
    const meta = SECTIONS.find((s) => s.id === "meta-setup")!;
    const omnisend = SECTIONS.find((s) => s.id === "omnisend-setup")!;

    const metaDone = meta.tasks.filter((t) => completedSteps.has(t.id)).length;
    const omnisendDone = omnisend.tasks.filter((t) =>
      completedSteps.has(t.id)
    ).length;

    return [
      {
        label: "Meta Setup",
        count: `${metaDone}/${meta.tasks.length} Tasks`,
        iconBg: metaDone === meta.tasks.length ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-amber-50 dark:bg-amber-900/20",
        iconColor: metaDone === meta.tasks.length ? "text-emerald-600" : "text-amber-600",
        Icon: metaDone === meta.tasks.length ? CheckCircle2 : Clock,
      },
      {
        label: "Omnisend Setup",
        count: `${omnisendDone}/${omnisend.tasks.length} Tasks`,
        iconBg: omnisendDone === omnisend.tasks.length ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-amber-50 dark:bg-amber-900/20",
        iconColor: omnisendDone === omnisend.tasks.length ? "text-emerald-600" : "text-amber-600",
        Icon: omnisendDone === omnisend.tasks.length ? CheckCircle2 : Clock,
      },
      {
        label: "Content Audit",
        count: "Locked",
        iconBg: "bg-slate-50 dark:bg-slate-800",
        iconColor: "text-slate-400",
        Icon: Lock,
      },
    ];
  }, [completedSteps]);

  return (
    <div className="bg-portal-surface-lowest p-8 rounded-xl shadow-sm">
      <h3 className="text-sm font-bold text-portal-secondary-dim uppercase tracking-widest mb-6">
        Milestone Summary
      </h3>
      <div className="space-y-6">
        {milestones.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  m.iconBg,
                  m.iconColor
                )}
              >
                <m.Icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-portal-on-surface">
                {m.label}
              </span>
            </div>
            <span className="text-xs font-medium text-portal-secondary-text">
              {m.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main content                                                       */
/* ------------------------------------------------------------------ */

function OnboardingContent() {
  const { data, isLoading } = useOnboardingProgress();
  const { mutate: toggle, variables: pendingStep } = useToggleOnboardingStep();

  const completedSteps = useMemo(() => {
    const set = new Set<string>();
    if (data?.completedSteps) {
      for (const stepId of Object.keys(data.completedSteps)) {
        set.add(stepId);
      }
    }
    return set;
  }, [data]);

  const progress = useMemo(() => {
    const total = VALID_STEP_IDS.length;
    if (total === 0) return 0;
    return Math.round((completedSteps.size / total) * 100);
  }, [completedSteps]);

  function handleToggle(stepId: string) {
    toggle(stepId);
  }

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="mb-12">
          <div className="flex flex-wrap justify-between items-end mb-6 gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-portal-on-surface mb-2">
                Onboarding Checklist
              </h1>
              <p className="text-portal-secondary-text max-w-2xl">
                Complete these steps to ensure your advertising ecosystem is
                fully optimized and integrated with the Agency Collective
                framework.
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-light text-primary">
                {isLoading ? "\u2014" : `${progress}%`}
              </div>
              <div className="text-xs font-bold text-portal-secondary-dim uppercase tracking-wider">
                Overall Progress
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 w-full bg-portal-surface-low rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, hsl(263 70% 52%) 0%, hsl(261 100% 77%) 100%)",
              }}
            />
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-8">
          {/* Left Column */}
          <div className="col-span-12 lg:col-span-4 space-y-8">
            <MilestoneSummary completedSteps={completedSteps} />

            {/* Need Assistance Card */}
            <div className="relative overflow-hidden bg-primary p-8 rounded-xl text-white">
              <div className="relative z-10">
                <h3 className="text-lg font-bold mb-2">Need Assistance?</h3>
                <p className="text-sm opacity-80 mb-6 leading-relaxed">
                  Schedule a quick 15-minute technical walkthrough with our
                  integration team.
                </p>
                <button className="px-6 py-2 bg-white text-primary font-bold text-sm rounded-lg hover:shadow-lg transition-all active:scale-95">
                  Book Call
                </button>
              </div>
              <Headset
                className="absolute -right-8 -bottom-8 opacity-10"
                size={120}
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="col-span-12 lg:col-span-8 space-y-10">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-xl bg-muted/60"
                  />
                ))}
              </div>
            ) : (
              SECTIONS.map((section) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  completedSteps={completedSteps}
                  onToggle={handleToggle}
                  pendingStepId={
                    typeof pendingStep === "string" ? pendingStep : null
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </DashboardShell>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
