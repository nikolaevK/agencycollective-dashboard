export async function register() {
  // Only run migrations in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureMigrated } = await import("./lib/db");
      await ensureMigrated();
    } catch (err) {
      console.error("[instrumentation] Migration failed, will retry on first request:", err);
    }
  }
}
