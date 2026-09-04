import type { StudyAssistRequest, StudyAssistResult } from "../../../shared/japaneseStudyTypes";
import { studyAssistLog } from "../studyAssistLog";
import type { StudyLlmProvider } from "./types";

const providers = new Map<string, StudyLlmProvider>();

export function clearStudyLlmProviders(): void {
  providers.clear();
}

export function registerStudyLlmProvider(provider: StudyLlmProvider): void {
  providers.set(provider.id, provider);
}

export function getStudyLlmProvider(id: string): StudyLlmProvider | undefined {
  return providers.get(id);
}

export function listStudyLlmProviders(): StudyLlmProvider[] {
  return [...providers.values()];
}

export async function resolveStudyLlmProvider(
  preferredId?: string,
  studyConfig?: { openaiCompatible?: { apiKey?: string; baseUrl?: string } },
): Promise<StudyLlmProvider | null> {
  if (preferredId) {
    const preferred = providers.get(preferredId);
    if (preferred) {
      try {
        if (await preferred.available()) return preferred;
      } catch (err) {
        studyAssistLog("provider_available_error", {
          providerId: preferred.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  for (const id of autoProviderIds(preferredId, studyConfig)) {
    const provider = providers.get(id);
    if (!provider || provider.id === "stub") continue;
    try {
      if (await provider.available()) return provider;
    } catch (err) {
      studyAssistLog("provider_available_error", {
        providerId: provider.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stub = providers.get("stub");
  if (preferredId === "stub" && stub && (await stub.available())) return stub;
  return null;
}

function autoProviderIds(
  preferredId?: string,
  studyConfig?: { openaiCompatible?: { apiKey?: string; baseUrl?: string } },
): string[] {
  const apiKey = studyConfig?.openaiCompatible?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const hasOpenAi = Boolean(apiKey.trim());
  const darwinFallback = hasOpenAi
    ? ["openai-compatible", "ollama", "apple-fm"]
    : ["ollama", "apple-fm", "openai-compatible"];
  const defaultFallback = hasOpenAi
    ? ["openai-compatible", "ollama", "apple-fm"]
    : ["ollama", "openai-compatible", "apple-fm"];
  const order = process.platform === "darwin" ? darwinFallback : defaultFallback;
  if (!preferredId) return order;
  return [preferredId, ...order.filter((id) => id !== preferredId)];
}

export async function listStudyProviderStatus(): Promise<{ id: string; label: string; available: boolean }[]> {
  return Promise.all(
    listStudyLlmProviders().map(async (provider) => {
      try {
        return { id: provider.id, label: provider.label, available: await provider.available() };
      } catch {
        return { id: provider.id, label: provider.label, available: false };
      }
    }),
  );
}

export async function completeWithProvider(
  provider: StudyLlmProvider,
  req: StudyAssistRequest,
): Promise<Pick<StudyAssistResult, "lines" | "note">> {
  return provider.complete(req);
}
