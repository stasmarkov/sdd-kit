// Run limits shared by the engine and the tool descriptions, kept free of imports so tools.mjs stays light.

/** How long a claim lasts before the job moves to `expired`. */
export const LEASE_MS = 30 * 60 * 1000
/** The most workers a run may have claimed at once. */
export const MAX_ACTIVE_LIMIT = 16
/** The worker limit of a run that does not set `maxActive`. */
export const DEFAULT_MAX_ACTIVE = 3
