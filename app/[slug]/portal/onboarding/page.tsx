"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Megaphone,
  Mail,
  CheckCircle2,
  Clock,
  Lock,
  MessageCircle,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge, StatusBadge, badgeVariants, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useOnboardingProgress,
  useToggleOnboardingStep,
} from "@/hooks/useOnboardingProgress";
import { ALL_STEP_IDS as VALID_STEP_IDS } from "@/lib/onboarding-steps";
import { OnboardingQuestionnaire } from "@/components/onboarding/OnboardingQuestionnaire";
import { useOnboardingForm } from "@/hooks/useOnboardingForm";

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
    <Card>
      {/* Header — always visible */}
      <div
        className="flex cursor-pointer select-none items-start gap-3 p-4 transition-colors hover:bg-muted/30 md:gap-4 md:p-6"
        onClick={() => setExpanded((v) => !v)}
      >
        <Checkbox
          checked={completed}
          onCheckedChange={() => onToggle()}
          onClick={(e) => e.stopPropagation()}
          // Radix checkboxes ignore Enter; the old button toggled on it.
          onKeyDown={(e) => {
            if (e.key === "Enter") onToggle();
          }}
          disabled={isPending}
          className="mt-0.5 size-5"
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
        />

        {/* Title + description */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-medium text-foreground",
                completed && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </span>
            <StatusBadge tone={completed ? "success" : "neutral"}>
              {completed ? "Complete" : "Pending"}
            </StatusBadge>
          </div>
          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              completed && "opacity-70"
            )}
          >
            {task.description}
          </p>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 md:px-6 md:pb-6">
          <div className="ml-8 space-y-3 border-l pl-4 md:ml-9 md:pl-5">
            {task.subSteps.map((sub, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 text-sm leading-relaxed text-foreground">
                  <span>{sub.text}</span>
                  {sub.test && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" />
                      Test: {sub.test}
                    </span>
                  )}
                  {sub.warning && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {sub.warning}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
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
      <div className="mb-4 flex items-start gap-3">
        <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
          <p className="text-xs text-muted-foreground">{section.phase}</p>
        </div>
        <Badge variant="secondary" className="mt-1 tabular-nums">
          {doneCount}/{section.tasks.length}
        </Badge>
      </div>

      <div className="space-y-3">
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
        tone: (metaDone === meta.tasks.length ? "success" : "warning") as BadgeTone,
        Icon: metaDone === meta.tasks.length ? CheckCircle2 : Clock,
      },
      {
        label: "Omnisend Setup",
        count: `${omnisendDone}/${omnisend.tasks.length} Tasks`,
        tone: (omnisendDone === omnisend.tasks.length ? "success" : "warning") as BadgeTone,
        Icon: omnisendDone === omnisend.tasks.length ? CheckCircle2 : Clock,
      },
      {
        label: "Content Audit",
        count: "Locked",
        tone: "neutral" as BadgeTone,
        Icon: Lock,
      },
    ];
  }, [completedSteps]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Milestone Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 md:pt-5">
        {milestones.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <m.Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium text-foreground">
                {m.label}
              </span>
            </div>
            <StatusBadge tone={m.tone} className="tabular-nums">
              {m.count}
            </StatusBadge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main content                                                       */
/* ------------------------------------------------------------------ */

function SetupChecklist() {
  const { data, isLoading } = useOnboardingProgress();
  const { mutate: toggle, variables: pendingStep, isPending: toggling } = useToggleOnboardingStep();

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
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
              Onboarding Checklist
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Complete these steps to ensure your advertising ecosystem is
              fully optimized and integrated with the Agency Collective
              framework.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {isLoading ? "\u2014" : `${progress}%`}
            </div>
            <div className="text-xs text-muted-foreground">Overall Progress</div>
          </div>
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-2 [&>div]:bg-chart-1" />
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-5 md:gap-6">
        {/* Left Column */}
        <div className="col-span-12 space-y-5 lg:col-span-4">
          <MilestoneSummary completedSteps={completedSteps} />

          {/* Need Assistance Card */}
          <Card>
            <CardHeader className="flex-row items-start gap-3 space-y-0">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <CardTitle>Need Assistance?</CardTitle>
                <CardDescription className="leading-relaxed">
                  Reach out in your dedicated Slack channel and our team will
                  help you through any step.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Right Column */}
        <div className="col-span-12 space-y-8 lg:col-span-8">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-3xl" />
              ))}
            </div>
          ) : (
            SECTIONS.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                completedSteps={completedSteps}
                onToggle={handleToggle}
                // `variables` outlive the request — only an in-flight toggle
                // marks its step busy.
                pendingStepId={
                  toggling && typeof pendingStep === "string" ? pendingStep : null
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type OnboardingTab = "questionnaire" | "checklist";

function OnboardingContent() {
  const searchParams = useSearchParams();
  const form = useOnboardingForm();
  const progress = useOnboardingProgress();
  const linked = searchParams.get("tab");
  const [picked, setPicked] = useState<OnboardingTab | null>(
    linked === "questionnaire" || linked === "checklist" ? linked : null
  );
  // The questionnaire leads until it's submitted. Decided ONCE when the form
  // first loads — submitting must not yank the client off the confirmation.
  useEffect(() => {
    if (picked === null && form.data) {
      setPicked(form.data.status === "submitted" ? "checklist" : "questionnaire");
    }
  }, [picked, form.data]);
  const tab: OnboardingTab =
    picked ?? (form.data?.status === "submitted" ? "checklist" : "questionnaire");
  const stepsDone = Object.keys(progress.data?.completedSteps ?? {}).length;

  const tabs: { id: OnboardingTab; label: string; badge: string }[] = [
    {
      id: "questionnaire",
      label: "Questionnaire",
      badge: form.data?.status === "submitted" ? "Submitted" : "Start here",
    },
    { id: "checklist", label: "Setup checklist", badge: `${stepsDone}/${VALID_STEP_IDS.length}` },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <Tabs value={tab} onValueChange={(v) => setPicked(v as OnboardingTab)}>
          <TabsList aria-label="Onboarding" className="w-full sm:w-fit">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="sm:px-4">
                {t.label}
                <span
                  className={cn(
                    t.id === "questionnaire" && form.data?.status === "submitted"
                      ? badgeVariants({ variant: "outline", tone: "success" })
                      : badgeVariants({ variant: "secondary" }),
                    "hidden tabular-nums sm:inline-flex"
                  )}
                >
                  {t.badge}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Both stay mounted so switching tabs never drops unsaved answers. */}
        <div hidden={tab !== "questionnaire"}>
          <OnboardingQuestionnaire />
        </div>
        <div hidden={tab !== "checklist"}>
          <SetupChecklist />
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
