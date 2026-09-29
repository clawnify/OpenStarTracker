// The shared vocabulary every route module imports: the bindings, the app type,
// and the few helpers that would otherwise be rewritten per file.

import { OpenAPIHono, orgId, z } from "@clawnify/app";
import type { Context } from "hono";

export interface Bindings {
  DB: D1Database;
  /**
   * A GitHub token, from the org's Environment Variables. Required in practice:
   * without one GitHub allows 60 requests an hour per IP address, and a
   * Worker's outbound address is shared with so many others that the allowance
   * is usually spent before this app asks. It is also the only way to see
   * traffic. A fine-grained token needs "Administration: read" on the repos; a
   * classic token needs push access to them.
   */
  GITHUB_TOKEN?: string;
  /** Minted per org by the platform. Present in production, absent locally. */
  CLAWNIFY_TOKEN?: string;
  /** Points @clawnify/queue at a local stand-in. Unset on the platform. */
  CLAWNIFY_QUEUE_URL?: string;
}

export interface Env {
  Bindings: Bindings;
}

export type App = OpenAPIHono<Env>;

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");
export const OkSchema = z.object({ ok: z.boolean() }).openapi("Ok");

export function ok<T extends z.ZodTypeAny>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}

export function fail(description: string) {
  return { description, content: { "application/json": { schema: ErrorSchema } } };
}

/**
 * Whether this request may see the app's data. The database belongs to the one
 * org that deployed the app, and the platform only injects an org id for its
 * own members, agents and tokens. Everyone else (a public route, a bypass
 * secret, the agent's browser) gets nothing.
 */
export function member(c: Context): boolean {
  return orgId(c) !== null;
}

/** Today in UTC, as YYYY-MM-DD: the unit every table here is keyed by. */
export function today(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** The UTC day `n` days before `day`. */
export function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return today(d);
}
