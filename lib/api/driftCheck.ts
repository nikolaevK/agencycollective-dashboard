import fs from "fs";
import path from "path";
import { openApiSpec } from "./openapi";

/**
 * Dev-time spec↔routes drift guard. Scans every route.ts under app/api/v1 for
 * exported HTTP methods, converts each file path to a spec path
 * ([param] → {param}), and reports operations that exist on only one side —
 * plus operations whose route enforces a different scope than the spec's
 * x-scope advertises. Runs only in development (the filesystem layout differs
 * in a bundled deploy) — invoked from GET /api/v1/openapi.json.
 */

const METHOD_RE = /export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE)\b/g;
const SCOPE_RE = /authenticateApiRequest\(\s*request,\s*"([a-z]+:[a-z]+)"/;

/** method → scope the handler enforces (null when not statically found). */
type RouteMethods = Map<string, string | null>;

function scanRoutes(rootDir: string): Map<string, RouteMethods> {
  const found = new Map<string, RouteMethods>();
  const v1Dir = path.join(rootDir, "app", "api", "v1");
  if (!fs.existsSync(v1Dir)) return found;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "route.ts") {
        const rel = path.relative(v1Dir, dir).split(path.sep).join("/");
        const specPath = "/" + rel.replace(/\[([^\]]+)\]/g, "{$1}");
        // openapi.json itself is not a spec operation.
        if (specPath === "/openapi.json" || specPath === "/") continue;
        const source = fs.readFileSync(full, "utf8");
        const methods: RouteMethods = new Map();
        const handlerStarts: { verb: string; index: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = METHOD_RE.exec(source)) !== null) {
          handlerStarts.push({ verb: m[1].toLowerCase(), index: m.index });
        }
        // Each handler's enforced scope = the first authenticateApiRequest
        // call between its export and the next one (null if none — e.g.
        // helpers or re-exported handlers; scope check skipped for those).
        for (let i = 0; i < handlerStarts.length; i++) {
          const start = handlerStarts[i].index;
          const end = i + 1 < handlerStarts.length ? handlerStarts[i + 1].index : source.length;
          const scope = source.slice(start, end).match(SCOPE_RE)?.[1] ?? null;
          methods.set(handlerStarts[i].verb, scope);
        }
        // The payout-option routes export destructured handlers.
        if (/export const \{[^}]*GET[^}]*\}/.test(source)) {
          for (const verb of ["get", "post", "put", "patch", "delete"]) {
            if (new RegExp(`\\b${verb.toUpperCase()}\\b`).test(source.match(/export const \{[^}]*\}/)?.[0] ?? "")) {
              if (!methods.has(verb)) methods.set(verb, null);
            }
          }
        }
        methods.delete("options");
        found.set(specPath, methods);
      }
    }
  };
  walk(v1Dir);
  return found;
}

export function checkOpenApiDrift(): string[] {
  const warnings: string[] = [];
  try {
    const routes = scanRoutes(process.cwd());
    if (routes.size === 0) return warnings;

    const specOps = new Map<string, string | undefined>();
    for (const [specPath, methods] of Object.entries(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        specOps.set(
          `${method.toUpperCase()} ${specPath}`,
          (operation as { "x-scope"?: string })["x-scope"]
        );
      }
    }
    const routeOps = new Map<string, string | null>();
    for (const [routePath, methods] of routes) {
      for (const [method, scope] of methods) {
        routeOps.set(`${method.toUpperCase()} ${routePath}`, scope);
      }
    }

    for (const [routeOp, routeScope] of routeOps) {
      if (!specOps.has(routeOp)) {
        warnings.push(`Route not in spec: ${routeOp}`);
        continue;
      }
      const specScope = specOps.get(routeOp);
      if (routeScope && specScope && routeScope !== specScope) {
        warnings.push(
          `Scope mismatch: ${routeOp} enforces "${routeScope}" but spec advertises "${specScope}"`
        );
      }
    }
    for (const specOp of specOps.keys()) {
      if (!routeOps.has(specOp)) warnings.push(`Spec operation has no route: ${specOp}`);
    }
    if (warnings.length > 0) {
      console.warn("[openapi drift]", warnings.join("\n[openapi drift] "));
    }
  } catch (err) {
    console.error("[openapi drift] check failed:", err);
  }
  return warnings;
}
