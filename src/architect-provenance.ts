/**
 * Provenance for the vendored agent-creation architect prompt.
 *
 * `src/prompts/agent-creation-architect.md` is copied verbatim from omp's
 * `/agents` hub prompt. omp's extension loader does not resolve the SDK subpath
 * that prompt lives under, so the plugin ships its own copy; this constant is the
 * omp version it was copied from. Bump it and the prompt's header comment
 * together when re-syncing after an omp upgrade (see
 * `docs/dev/agent-authoring.md`), so a drift is a visible test failure rather
 * than a silent one.
 *
 * Kept in its own module (not `agent-architect.ts`) because that module imports
 * `@oh-my-pi/pi-coding-agent`, which only resolves inside omp — a test cannot
 * import it.
 */
export const ARCHITECT_PROMPT_VERSION = "18.4.8";
