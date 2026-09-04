type PtyInputWriteQueueDeps = {
  isWritable: (id: string) => boolean;
  write: (id: string, data: string) => void;
  onDrainFailure?: (id: string) => void;
};

export function createPtyInputWriteQueue(deps: PtyInputWriteQueueDeps) {
  let pending: { id: string; text: string }[] = [];
  let draining = false;

  function drain(): void {
    if (draining) return;
    draining = true;
    const step = () => {
      if (pending.length === 0) {
        draining = false;
        return;
      }
      const item = pending.shift()!;
      if (!deps.isWritable(item.id)) {
        requestAnimationFrame(step);
        return;
      }
      try {
        deps.write(item.id, item.text);
      } catch {
        deps.onDrainFailure?.(item.id);
        pending = [];
        draining = false;
        return;
      }
      if (pending.length > 0) requestAnimationFrame(step);
      else draining = false;
    };
    step();
  }

  return {
    enqueue(id: string, data: string): boolean {
      if (!data) return true;
      pending.push({ id, text: data });
      drain();
      return true;
    },
    clear(): void {
      pending = [];
    },
  };
}
