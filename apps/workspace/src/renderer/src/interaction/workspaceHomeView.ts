/** Whether the fixed home/dashboard view is active instead of a workspace tab. */
let homeViewActive = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyHomeView(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeHomeView(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isHomeViewActive(): boolean {
  return homeViewActive;
}

export function setHomeViewActive(active: boolean): void {
  if (homeViewActive === active) return;
  homeViewActive = active;
  notifyHomeView();
}
