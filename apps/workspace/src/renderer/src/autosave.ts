const STORAGE_KEY = "workspace.autoSave";

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

export function getStoredAutoSave(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setStoredAutoSave(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  for (const listener of listeners) listener(enabled);
}

export function subscribeAutoSave(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
