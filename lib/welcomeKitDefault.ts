import type { WelcomeKitDoc } from "./welcomeKit";

/**
 * The built-in Welcome Kit — a block-model reproduction of the original
 * hardcoded client-portal page. Used as the fallback whenever no custom kit
 * has been saved yet, and as the seed when sharing is first toggled on.
 * Editing in the builder replaces this with a saved row.
 */
export const DEFAULT_WELCOME_KIT: WelcomeKitDoc = {
  hero: {
    badge: "Client Welcome Kit",
    titleLead: "Welcome to the",
    titleHighlight: "Agency Collective",
    titleTail: "Family.",
    subtitle:
      "Everything you need to know about how we communicate, operate, and build results together.",
  },
  sections: [
    {
      id: "sec-communication",
      num: "01 / Communication",
      icon: "messages",
      title: "How We Connect",
      blocks: [
        {
          id: "blk-comm-cols",
          type: "columns",
          items: [
            {
              id: "col-slack",
              icon: "message",
              title: "Slack",
              badge: "Primary Channel",
              body: "All clients receive a dedicated Slack channel for direct team access.",
              bullets: [
                "Project updates & milestones",
                "Quick questions & clarifications",
                "Asset requests & feedback",
                "Status updates in real time",
              ],
            },
            {
              id: "col-email",
              icon: "mail",
              title: "Email",
              badge: "Formal Communication",
              body: "Reserved for structured, documented communication requiring a paper trail.",
              bullets: [
                "Contracts & agreements",
                "Billing & invoices",
                "Formal documentation",
                "Long-form project summaries",
              ],
            },
          ],
        },
        {
          id: "blk-comm-tip",
          type: "callout",
          variant: "info",
          icon: "info",
          title: "Pro Tip",
          body: "Slack keeps communication organized. Flag urgent items in Slack for fastest response.",
        },
      ],
    },
    {
      id: "sec-availability",
      num: "02 / Availability",
      icon: "clock",
      title: "Response & Business Hours",
      blocks: [
        {
          id: "blk-avail-stat",
          type: "stat",
          value: "1",
          label: "Business Day",
          caption:
            "Response guarantee — most responses happen much faster. Urgent? Flag it in Slack.",
        },
        {
          id: "blk-avail-cols",
          type: "columns",
          items: [
            {
              id: "col-hours",
              icon: "clock",
              title: "Business Hours",
              badge: "",
              body: "",
              bullets: [
                "Mon – Fri: 9 AM – 5 PM",
                "Pacific Time (PT)",
                "Messages outside hours are addressed the next business day.",
              ],
            },
            {
              id: "col-holidays",
              icon: "calendar",
              title: "Observed Holidays",
              badge: "",
              body: "",
              bullets: [
                "New Year's Day",
                "Memorial Day",
                "Independence Day",
                "Labor Day",
                "Thanksgiving Day",
                "Christmas Day",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sec-approval",
      num: "03 / Creative",
      icon: "checkSquare",
      title: "Approval Process",
      blocks: [
        {
          id: "blk-approval-checklist",
          type: "checklist",
          title: "Creative Assets Checklist",
          note: "All assets require approval before publishing.",
          marker: "check",
          items: [
            "Ads",
            "Email campaigns",
            "SMS campaigns",
            "Landing pages",
            "Website changes",
            "Social media creatives",
          ],
        },
        {
          id: "blk-approval-after",
          type: "callout",
          variant: "success",
          icon: "check",
          title: "After Approval",
          body: "Once you approve, we proceed immediately. No delays.",
        },
        {
          id: "blk-approval-post",
          type: "callout",
          variant: "warning",
          icon: "star",
          title: "Post-Approval Changes",
          body: "Additional revisions will be scheduled per workload.",
        },
      ],
    },
    {
      id: "sec-assets",
      num: "04 / Assets",
      icon: "package",
      title: "Asset Responsibilities",
      blocks: [
        {
          id: "blk-assets-cards",
          type: "cards",
          layout: "grid",
          columns: 3,
          items: [
            { id: "card-logos", icon: "palette", label: "Logos", desc: "Brand mark & variations" },
            { id: "card-brand", icon: "file", label: "Brand Guidelines", desc: "Colors, fonts & voice" },
            { id: "card-imagery", icon: "image", label: "Product Imagery", desc: "Photos & visual assets" },
            { id: "card-copy", icon: "messages", label: "Copy & Messaging", desc: "Tone, taglines & copy" },
            { id: "card-access", icon: "globe", label: "Platform Access", desc: "Meta, Shopify, Klaviyo…" },
            { id: "card-legal", icon: "scale", label: "Legal Disclaimers", desc: "Compliance requirements" },
          ],
        },
        {
          id: "blk-assets-impact",
          type: "callout",
          variant: "danger",
          icon: "info",
          title: "Timeline Impact",
          body: "Delays in asset delivery may affect project timelines. Providing all assets upfront ensures faster results.",
        },
      ],
    },
    {
      id: "sec-timelines",
      num: "05 / Timelines",
      icon: "trending",
      title: "Project Timelines & Revisions",
      blocks: [
        {
          id: "blk-timeline-factors",
          type: "checklist",
          title: "Timeline Factors",
          note: "Estimated timelines communicated at project start.",
          marker: "dot",
          items: [
            "Client Responsiveness",
            "Asset Delivery Speed",
            "Platform Approvals",
            "Scope of Work",
          ],
        },
        {
          id: "blk-timeline-revisions",
          type: "checklist",
          title: "Revision Process",
          note: "Quality First — we aim to deliver high-quality work the first time. Revisions included.",
          marker: "check",
          items: [
            "Revisions must be clearly communicated",
            "Consolidate feedback when possible",
            "Batched requests avoid unnecessary delays",
          ],
        },
      ],
    },
    {
      id: "sec-access",
      num: "06 / Access & Scope",
      icon: "shield",
      title: "Platform Access & Scope",
      blocks: [
        {
          id: "blk-access-rows",
          type: "rows",
          title: "Platform Access Required",
          rows: [
            { id: "row-shopify", label: "Shopify / WooCommerce", value: "E-Commerce" },
            { id: "row-meta", label: "Meta Business Manager", value: "Advertising" },
            { id: "row-ga", label: "Google Analytics", value: "Analytics" },
            { id: "row-email", label: "Klaviyo / Omnisend / Brevo", value: "Email Mktg" },
            { id: "row-ads", label: "Ad Accounts", value: "Paid Media" },
          ],
        },
        {
          id: "blk-access-in",
          type: "callout",
          variant: "success",
          icon: "check",
          title: "In Scope",
          body: "- All work defined in the agreed project scope\n- Deliverables outlined in the retainer agreement\n- Revisions within the defined scope",
        },
        {
          id: "blk-access-out",
          type: "callout",
          variant: "danger",
          icon: "x",
          title: "Out of Scope",
          body: "- May require a revised timeline\n- Additional billing may apply\n- A new project agreement may be needed",
        },
        {
          id: "blk-access-security",
          type: "callout",
          variant: "info",
          icon: "shield",
          title: "We never request passwords",
          body: "Access granted via user permissions only.",
        },
        {
          id: "blk-access-disclaimer",
          type: "callout",
          variant: "neutral",
          title: "Performance Disclaimer",
          body: "While we apply proven strategies, marketing performance cannot be guaranteed. Results depend on market conditions, platform algorithms, and customer behavior.",
        },
      ],
    },
    {
      id: "sec-partnership",
      num: "07 / Partnership",
      icon: "handshake",
      title: "How to Get Best Results",
      blocks: [
        {
          id: "blk-partner-cards",
          type: "cards",
          layout: "list",
          columns: 1,
          items: [
            {
              id: "card-comm",
              icon: "messages",
              label: "Clear Communication",
              desc: "Open, direct, and timely dialogue keeps projects on track and avoids costly misunderstandings.",
            },
            {
              id: "card-feedback",
              icon: "clock",
              label: "Timely Feedback",
              desc: "Quick responses from your side directly accelerate our delivery speed and launch timelines.",
            },
            {
              id: "card-approvals",
              icon: "checkSquare",
              label: "Quick Approvals",
              desc: "Faster approvals mean faster results, faster launches, and faster revenue impact.",
            },
            {
              id: "card-strategy",
              icon: "handshake",
              label: "Strategy Collaboration",
              desc: "The best outcomes come from working together on direction, not just execution.",
            },
          ],
        },
        {
          id: "blk-partner-quote",
          type: "text",
          body: "*When both sides move quickly, results follow.*",
        },
      ],
    },
  ],
  cta: {
    enabled: true,
    title: "We're Excited to Work With You",
    body: "Our goal is simple: Build systems that grow your business. If you ever have questions, reach out in Slack and our team will take care of it.",
    buttonLabel: "Start Onboarding",
    buttonUrl: "",
    showPdf: true,
    // No built-in PDF — admins upload one in the builder (or paste a URL).
    // With showPdf true + an empty url the button stays hidden until a PDF
    // exists, then an uploaded file auto-appears via read-time injection.
    pdfUrl: "",
  },
};
