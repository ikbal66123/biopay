/** Small wrappers around localStorage that never throw (private mode, blocked storage). */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`csm:${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`csm:${key}`, value);
  } catch {
    /* ignore */
  }
}
