export type ShortcutScope = "workspace" | "app" | "document";

export type ShortcutHandler = (event: KeyboardEvent) => boolean;

export type ShortcutRegistration = {
  id: string;
  scope: ShortcutScope;
  /** Higher runs first within the same scope. */
  priority?: number;
  when?: () => boolean;
  handle: ShortcutHandler;
};

const SCOPE_RANK: Record<ShortcutScope, number> = {
  workspace: 3,
  app: 2,
  document: 1,
};

let registrations: ShortcutRegistration[] = [];

function sortRegistrations(items: ShortcutRegistration[]): ShortcutRegistration[] {
  return [...items].sort((a, b) => {
    const scopeDelta = SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope];
    if (scopeDelta !== 0) return scopeDelta;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });
}

export function registerShortcut(registration: ShortcutRegistration): () => void {
  registrations = sortRegistrations([...registrations, registration]);
  return () => {
    registrations = registrations.filter((entry) => entry !== registration);
  };
}

/** Returns true when a handler consumed the event. */
export function dispatchShortcut(event: KeyboardEvent): boolean {
  for (const registration of registrations) {
    if (registration.when && !registration.when()) continue;
    if (registration.handle(event)) return true;
  }
  return false;
}

/** Test helper — not for production call sites. */
export function clearShortcutRegistry(): void {
  registrations = [];
}
