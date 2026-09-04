export function runGuardedWriteCompletionStep(context: string, step: () => void): void {
  try {
    step();
  } catch (error: unknown) {
    console.error(`[terminal] write-completion step "${context}" threw`, error);
  }
}
