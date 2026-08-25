import type { PtyTransport } from "./ptyTransport";

export function sendCapturedTerminalInput(args: {
  transport: PtyTransport | undefined;
  data: string;
}): boolean {
  const { transport, data } = args;
  if (!transport) {
    return false;
  }
  transport.write(data);
  return true;
}
