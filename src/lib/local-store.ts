/** Safe localStorage helpers (storage can be blocked in private windows / in-app browsers). */
export interface SavedPersona {
  title: string;
  alias: string;
  tagline: string;
  compliment: string;
}

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function savePersona(p: SavedPersona) {
  set("afterhours:persona", JSON.stringify(p));
}
export function loadPersona(): SavedPersona | null {
  try {
    const v = JSON.parse(get("afterhours:persona") ?? "null");
    return v && typeof v.title === "string" ? v : null;
  } catch {
    return null;
  }
}

export const saveInboxKey = (key: string) => set("afterhours:inbox-key", key);
export const loadInboxKey = () => get("afterhours:inbox-key");

/** "Velvet Falcon" → "velvet_falcon" */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
