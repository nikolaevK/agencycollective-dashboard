export async function register() {
  // Only run migrations in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureMigrated } = await import("./lib/db");
    await ensureMigrated();
  }
}
