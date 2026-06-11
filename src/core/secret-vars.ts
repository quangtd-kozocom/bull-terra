// Helpers for an environment's secret-var map: { KEY -> .env variable NAME }.
// A KEY is an uppercase identifier; at run time each becomes BULL_TERRA_<KEY>,
// so USER/PASS map to the BULL_TERRA_USER/_PASS that global-setup.ts reads.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

/** Prefix every injected credential gets in the Playwright process env. */
export const INJECT_PREFIX = "BULL_TERRA_";

/** Uppercase + validate a key, throwing a clear error for anything non-identifier. */
export function normalizeKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!KEY_RE.test(key)) {
    throw new Error(
      `Invalid secret-var key "${raw}". Keys must start with a letter and use only ` +
        `A-Z, 0-9 and _ (e.g. USER, PASS, API_KEY).`,
    );
  }
  return key;
}

/** Parse a CLI `--var KEY=ENV_VAR_NAME` spec into a [key, varName] pair. */
export function parseVarFlag(spec: string): [string, string] {
  const eq = spec.indexOf("=");
  if (eq < 1) {
    throw new Error(
      `Invalid --var "${spec}". Expected KEY=ENV_VAR_NAME (e.g. --var API_KEY=APP_A_STG_KEY).`,
    );
  }
  const key = normalizeKey(spec.slice(0, eq));
  const varName = spec.slice(eq + 1).trim();
  if (!varName) throw new Error(`--var ${key}= is missing the .env variable name.`);
  return [key, varName];
}

/**
 * Validate + normalize a whole map (keys uppercased, blank var-names dropped).
 * Used by the dashboard API where the map arrives as JSON rather than flags.
 */
export function normalizeSecretVars(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(input ?? {})) {
    const varName = typeof rawVal === "string" ? rawVal.trim() : "";
    if (!varName) continue;
    out[normalizeKey(rawKey)] = varName;
  }
  return out;
}
