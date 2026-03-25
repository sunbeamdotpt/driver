/**
 * Collabora WOPI discovery — fetch and cache discovery.xml.
 * Parses XML to extract urlsrc for each mimetype/action pair.
 */

import { withSpan } from "../telemetry.ts";

const COLLABORA_URL =
  Deno.env.get("COLLABORA_URL") ??
  "http://collabora.lasuite.svc.cluster.local:9980";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ActionEntry {
  name: string;
  ext: string;
  urlsrc: string;
}

interface DiscoveryCache {
  /** Map: mimetype -> ActionEntry[] */
  actions: Map<string, ActionEntry[]>;
  fetchedAt: number;
}

let cache: DiscoveryCache | null = null;

/**
 * Parse discovery XML into a map of mimetype -> action entries.
 */
export function parseDiscoveryXml(
  xml: string,
): Map<string, ActionEntry[]> {
  const result = new Map<string, ActionEntry[]>();

  // Match <app name="..."> blocks
  const appRegex = /<app\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/app>/g;
  for (const appMatch of xml.matchAll(appRegex)) {
    const mimetype = appMatch[1];
    const appBody = appMatch[2];

    const actions: ActionEntry[] = [];
    // Match <action name="..." ext="..." urlsrc="..." />
    const actionRegex =
      /<action\s+([^>]*?)\/?\s*>/g;
    for (const actionMatch of appBody.matchAll(actionRegex)) {
      const attrs = actionMatch[1];
      const name =
        attrs.match(/name="([^"]*)"/)?.[1] ?? "";
      const ext = attrs.match(/ext="([^"]*)"/)?.[1] ?? "";
      const urlsrc =
        attrs.match(/urlsrc="([^"]*)"/)?.[1] ?? "";
      if (name && urlsrc) {
        actions.push({ name, ext, urlsrc });
      }
    }

    if (actions.length > 0) {
      result.set(mimetype, actions);
    }
  }

  return result;
}

async function fetchDiscovery(): Promise<Map<string, ActionEntry[]>> {
  const url = `${COLLABORA_URL}/hosting/discovery`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Collabora discovery fetch failed: ${resp.status} ${resp.statusText}`,
    );
  }
  const xml = await resp.text();
  return parseDiscoveryXml(xml);
}

async function getDiscovery(): Promise<Map<string, ActionEntry[]>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.actions;
  }

  // Retry up to 3 times
  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const actions = await fetchDiscovery();
      cache = { actions, fetchedAt: Date.now() };
      return actions;
    } catch (e) {
      lastError = e as Error;
      if (i < 2) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

/**
 * Get the Collabora editor URL for a given mimetype and action.
 * Returns the urlsrc template or null if not found.
 */
export async function getCollaboraActionUrl(
  mimetype: string,
  action = "edit",
): Promise<string | null> {
  const cacheHit = !!(cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS);
  return withSpan("collabora.discovery", { "collabora.mimetype": mimetype, "collabora.action": action, "collabora.cache_hit": cacheHit }, async () => {
    const discovery = await getDiscovery();
    const actions = discovery.get(mimetype);
    if (!actions) return null;

    const match = actions.find((a) => a.name === action);
    return match?.urlsrc ?? null;
  });
}

/** Clear cache (for testing). */
export function clearDiscoveryCache(): void {
  cache = null;
}
