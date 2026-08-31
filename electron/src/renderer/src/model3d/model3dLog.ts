export async function logModel3d(event: string, data?: Record<string, unknown>): Promise<void> {
  if (!window.api.model3d?.log) return;
  try {
    await window.api.model3d.log(event, data);
  } catch (err) {
    console.warn("[model3d] log failed", err);
  }
}
