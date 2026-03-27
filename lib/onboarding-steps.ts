/**
 * Canonical list of onboarding steps, shared between the client portal
 * and the admin user-management dashboard.
 *
 * The step `id` values are the keys persisted in the `onboarding_progress`
 * table — never rename them without a migration.
 */

export interface StepDef {
  id: string;
  title: string;
}

export interface SectionDef {
  id: string;
  title: string;
  steps: StepDef[];
}

export const ONBOARDING_SECTIONS: SectionDef[] = [
  {
    id: "meta-setup",
    title: "Meta Setup",
    steps: [
      { id: "meta.ads-manager", title: "Access Ads Manager" },
      { id: "meta.business-portfolio", title: "Create Business Portfolio" },
      { id: "meta.business-settings", title: "Set Up Business Settings" },
      { id: "meta.payment-method", title: "Add Payment Method" },
      { id: "meta.adding-users", title: "Add Users" },
      { id: "meta.pixel-plugin", title: "Pixel Plugin" },
    ],
  },
  {
    id: "omnisend-setup",
    title: "Omnisend Setup",
    steps: [
      { id: "omnisend.create-account", title: "Create Omnisend Account" },
      { id: "omnisend.connect-woocommerce", title: "Connect WooCommerce" },
      { id: "omnisend.connect-domain", title: "Connect Sending Domain" },
      { id: "omnisend.add-agency-access", title: "Add Agency Access" },
      { id: "omnisend.final-verification", title: "Final Verification" },
    ],
  },
];

export const ALL_STEP_IDS = ONBOARDING_SECTIONS.flatMap((s) =>
  s.steps.map((st) => st.id)
);

export const TOTAL_STEPS = ALL_STEP_IDS.length;
