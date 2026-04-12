import type Anthropic from "@anthropic-ai/sdk";

export const CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "display_metrics",
    description:
      "Display a grid of KPI/metric cards inline in the chat. Use this when presenting 2–6 key performance indicators to the user. Prefer this over plain text or markdown tables for small sets of important numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        metrics: {
          type: "array",
          description: "Array of metric cards to display (2–6 items)",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Short metric label, e.g. 'ROAS', 'Total Spend', 'CPA'",
              },
              value: {
                type: "string",
                description: "Formatted value, e.g. '$12,450', '4.82x', '2.1%'",
              },
              subtitle: {
                type: "string",
                description: "Optional context line, e.g. 'vs $10,200 last period'",
              },
              trend: {
                type: "string",
                enum: ["up", "down", "neutral"],
                description: "Trend direction for visual indicator",
              },
              color: {
                type: "string",
                description: "Optional accent color: 'green', 'red', 'blue', 'purple', 'amber'",
              },
            },
            required: ["label", "value"],
          },
          minItems: 2,
          maxItems: 6,
        },
      },
      required: ["metrics"],
    },
  },
  {
    name: "display_chart",
    description:
      "Render an interactive chart inline in the chat. Use 'line' for trends over time, 'bar' for comparisons between categories, 'pie' or 'donut' for proportion/distribution breakdowns. The data array should contain objects with a key for the x-axis and numeric values for each metric.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["line", "bar", "pie", "donut"],
          description: "Chart type",
        },
        title: {
          type: "string",
          description: "Chart title displayed above the visualization",
        },
        data: {
          type: "array",
          description:
            "Array of data points. Each object should have a key matching xAxisKey (or 'name' by default) and numeric values for each metric.",
          items: { type: "object" },
        },
        metrics: {
          type: "array",
          description:
            "Array of metric keys to plot from the data objects. For pie/donut charts, use a single metric key representing the value.",
          items: { type: "string" },
        },
        xAxisKey: {
          type: "string",
          description: "Key in data objects used for x-axis labels. Defaults to 'name'.",
        },
      },
      required: ["type", "title", "data", "metrics"],
    },
  },
  {
    name: "display_table",
    description:
      "Display a formatted data table inline in the chat. Use this for detailed tabular data with many rows where a chart would lose precision. Supports optional column formatting.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Table title",
        },
        columns: {
          type: "array",
          description: "Column definitions",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Data key in row objects" },
              label: { type: "string", description: "Display header label" },
              format: {
                type: "string",
                enum: ["currency", "percent", "number", "text"],
                description: "Value formatting hint",
              },
            },
            required: ["key", "label"],
          },
        },
        rows: {
          type: "array",
          description: "Array of row data objects",
          items: { type: "object" },
        },
      },
      required: ["title", "columns", "rows"],
    },
  },
  {
    name: "generate_report",
    description:
      "Generate a comprehensive, structured performance report for a client. Use ONLY when the user explicitly asks for a report, client summary, or performance document. The report will be rendered as a branded card with a PDF download option. The accountId must be a valid Meta ad account ID from the context data.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: {
          type: "string",
          description: "Client/business name for the report header",
        },
        accountId: {
          type: "string",
          description: "Meta ad account ID to pull data for (e.g. 'act_123456')",
        },
        period: {
          type: "string",
          description: "Human-readable period label, e.g. 'Last 30 Days', 'March 2026'",
        },
        sections: {
          type: "array",
          description: "Which report sections to include. Use audit_score for performance scoring against benchmarks, andromeda for Andromeda-era strategy assessment, campaign_structure for structure evaluation with recommended structures, and landing_page for landing page audit (requires landingPageUrl).",
          items: {
            type: "string",
            enum: [
              "overview",
              "campaigns",
              "demographics",
              "placements",
              "conversions",
              "recommendations",
              "audit_score",
              "andromeda",
              "campaign_structure",
              "landing_page",
            ],
          },
          minItems: 1,
        },
        landingPageUrl: {
          type: "string",
          description: "Optional landing page URL for the landing_page section. Only needed when landing_page is included in sections.",
        },
      },
      required: ["clientName", "accountId", "period", "sections"],
    },
  },
  {
    name: "fetch_landing_page",
    description:
      "Fetch and extract text content from a landing page URL for CRO audit. Use this when the user provides a landing page URL and wants it analyzed for ad-to-page alignment, conversion optimization, or landing page quality. Returns the page's text content including headlines, body copy, CTAs, forms, and meta information.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The full landing page URL to fetch (e.g. 'https://example.com/offer')",
        },
      },
      required: ["url"],
    },
  },
];

/** Tool names that are purely presentational (server auto-returns result) */
export const DISPLAY_TOOLS = new Set(["display_metrics", "display_chart", "display_table"]);

/** Tool names that require server-side execution */
export const SERVER_TOOLS = new Set(["generate_report", "fetch_landing_page"]);
