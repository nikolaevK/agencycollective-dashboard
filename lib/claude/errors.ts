/**
 * User-facing descriptions of Claude API failures (server-only: imports the
 * SDK). Typed SDK error classes only — no string matching on messages, and
 * the raw provider message is never shown to the user (it goes to the log).
 */

import Anthropic from "@anthropic-ai/sdk";

export interface DescribedError {
  /** Stable code the UI can branch on. */
  code: "rate_limited" | "overloaded" | "unavailable" | "auth" | "bad_request" | "too_large" | "unknown";
  /** Safe to show to the user. */
  message: string;
  /** Sending the same thing again may work. */
  retryable: boolean;
}

export function describeClaudeError(err: unknown): DescribedError {
  if (err instanceof Anthropic.RateLimitError) {
    return {
      code: "rate_limited",
      message: "Claude is handling too many requests right now. Wait a moment and try again.",
      retryable: true,
    };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return {
      code: "auth",
      message: "The AI service isn't configured correctly (API key or permissions). Ask an admin to check it.",
      retryable: false,
    };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    // Includes APIConnectionTimeoutError.
    return {
      code: "unavailable",
      message: "Couldn't reach Claude. Check the connection and try again.",
      retryable: true,
    };
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    if (status === 529) {
      return { code: "overloaded", message: "Claude is temporarily overloaded. Try again in a minute.", retryable: true };
    }
    if (status === 413) {
      return {
        code: "too_large",
        message: "This conversation has grown too large. Start a new chat to continue.",
        retryable: false,
      };
    }
    if (status >= 500 || status === 0) {
      return { code: "unavailable", message: "Claude is temporarily unavailable. Try again shortly.", retryable: true };
    }
    if (status === 400 || status === 422) {
      return {
        code: "bad_request",
        message: "Claude couldn't process this conversation. Start a new chat and try again.",
        retryable: false,
      };
    }
  }
  return {
    code: "unknown",
    message: "Something went wrong. Try again.",
    retryable: true,
  };
}
