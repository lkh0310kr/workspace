import {
  extractOnlyTerminalQueryReplies,
  isTerminalQueryReply,
} from "../../../shared/terminal-query-reply";

export function forwardXtermInputToPty(
  data: string,
  write: (data: string) => void,
  writeQueryReply: (data: string) => void,
): void {
  if (!data) {
    return;
  }
  if (isTerminalQueryReply(data)) {
    writeQueryReply(data);
    return;
  }
  const onlyReplies = extractOnlyTerminalQueryReplies(data);
  if (onlyReplies) {
    for (const reply of onlyReplies) {
      writeQueryReply(reply);
    }
    return;
  }
  write(data);
}
