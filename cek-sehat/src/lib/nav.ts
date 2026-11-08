/** Hand-over between screens (e.g. the voice assistant pre-filling a complaint). */
import { writePref } from './prefs';

export interface NavState {
  prefill?: string;
  autostart?: boolean;
  /** summary passed from the AI complaint check to the doctor screen */
  summary?: string;
  tab?: string;
}

const KEY = 'csm:nav';

export function goTo(route: string, state?: NavState & { kind?: string }) {
  if (state?.kind) writePref('kind', state.kind);
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  window.location.hash = route;
  window.scrollTo({ top: 0 });
}

/**
 * Read the hand-over state. It is cleared shortly after, not immediately, so a
 * screen that mounts twice (React StrictMode in development) reads the same value.
 */
export function takeNavState(): NavState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    setTimeout(() => {
      if (sessionStorage.getItem(KEY) === raw) sessionStorage.removeItem(KEY);
    }, 1500);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Read without clearing (for values several screens may show, e.g. the AI summary). */
export function peekSummary(): string | undefined {
  try {
    return sessionStorage.getItem('csm:ringkasan-ai') ?? undefined;
  } catch {
    return undefined;
  }
}
export function saveSummary(text: string) {
  try {
    sessionStorage.setItem('csm:ringkasan-ai', text);
  } catch {
    /* ignore */
  }
}
