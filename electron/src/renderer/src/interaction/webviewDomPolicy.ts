export type WebviewDomPolicy = {
  visible: boolean;
  interactive: boolean;
};

/** Electron guests must be display:none unless fully interactive. */
export function resolveWebviewDomShown(policy: WebviewDomPolicy): boolean {
  return policy.visible && policy.interactive;
}
