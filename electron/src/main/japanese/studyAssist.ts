import type { StudyAssistRequest, StudyAssistResult } from "../../shared/japaneseStudyTypes";
import {
  analyzeJapaneseLine,
  analyzeJapaneseReading,
  analyzeLineForContext,
} from "./analyzeLine";
import { tryDictionaryTranslateToJa, tryDictionaryTranslateToKo } from "./dictionaryTranslate";
import { completeWithProvider, resolveStudyLlmProvider } from "./llm/router";
import { getJapaneseStudyConfig } from "./studyConfig";
import { studyAssistLog } from "./studyAssistLog";
import { STUDY_PROVIDER_SETUP_MESSAGE } from "./studyProviderMessage";
import { isTranslateTask, resolveTranslateDirection } from "./translateDirection";

function mergeLlmResult(
  base: StudyAssistResult,
  llm: Pick<StudyAssistResult, "lines" | "note">,
  providerId: string,
): StudyAssistResult {
  return {
    ...base,
    lines: llm.lines.length > 0 ? llm.lines : base.lines,
    note: llm.note ?? base.note,
    providerId,
  };
}

async function completeWithActiveProvider(
  req: StudyAssistRequest,
  tokens = analyzeLineForContext(req.text),
): Promise<Pick<StudyAssistResult, "lines" | "note"> & { providerId: string }> {
  const config = getJapaneseStudyConfig();
  const provider = await resolveStudyLlmProvider(config.providerId);
  studyAssistLog("provider_resolve", {
    requestedProviderId: config.providerId ?? null,
    resolvedProviderId: provider?.id ?? null,
    task: req.task,
  });
  if (!provider) {
    throw new Error(STUDY_PROVIDER_SETUP_MESSAGE);
  }
  if (provider.id === "stub") {
    throw new Error(STUDY_PROVIDER_SETUP_MESSAGE);
  }

  const enrichedReq: StudyAssistRequest = {
    ...req,
    level: req.level ?? config.level ?? "auto",
    dictionaryTokens: tokens,
  };
  studyAssistLog("llm_request", {
    providerId: provider.id,
    task: enrichedReq.task,
    textLength: enrichedReq.text.length,
    translateDirection: enrichedReq.translateDirection ?? null,
  });
  const result = await completeWithProvider(provider, enrichedReq);
  studyAssistLog("llm_response", {
    providerId: provider.id,
    task: enrichedReq.task,
    lineCount: result.lines.length,
    hasNote: Boolean(result.note),
  });
  return { ...result, providerId: provider.id };
}

export async function studyAssist(req: StudyAssistRequest): Promise<StudyAssistResult> {
  const text = req.text.trim();
  studyAssistLog("assist_start", { task: req.task, textLength: text.length });
  if (!text) {
    const empty = {
      task: req.task,
      lines: [],
      providerId: "dictionary-only",
      note: "텍스트가 비어 있습니다.",
    };
    studyAssistLog("assist_done", { ...empty, reason: "empty_text" });
    return empty;
  }

  let result: StudyAssistResult;
  switch (req.task) {
    case "breakdown": {
      result = analyzeJapaneseLine(text);
      break;
    }
    case "reading": {
      const dict = analyzeJapaneseReading(text);
      if (dict.lines.length > 0) {
        result = dict;
        break;
      }
      try {
        const llm = await completeWithActiveProvider({ ...req, text });
        result = mergeLlmResult(dict, llm, llm.providerId);
      } catch (err) {
        result = {
          ...dict,
          note: err instanceof Error ? err.message : String(err),
        };
      }
      break;
    }
    case "translate":
    case "translate_to_ko":
    case "translate_to_ja":
    case "grammar_hint":
    case "check_translation":
    case "practice_sentences": {
      const tokens = analyzeLineForContext(text);
      if (isTranslateTask(req.task)) {
        const direction = resolveTranslateDirection(req);
        const dictionaryLine =
          direction === "to_ko" ? tryDictionaryTranslateToKo(text) : tryDictionaryTranslateToJa(text);
        if (dictionaryLine) {
          studyAssistLog("dictionary_translate", { task: req.task, direction });
          result = {
            task: req.task,
            lines: [dictionaryLine],
            tokens,
            providerId: "dictionary-only",
          };
          break;
        }
      }
      try {
        const llm = await completeWithActiveProvider(req, tokens);
        result = {
          task: req.task,
          lines: llm.lines,
          note: llm.note,
          tokens,
          providerId: llm.providerId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        studyAssistLog("assist_error", { task: req.task, error: message });
        result = {
          task: req.task,
          lines: [],
          tokens,
          note: message,
          providerId: "unavailable",
        };
      }
      break;
    }
    default: {
      const exhaustive: never = req.task;
      return exhaustive;
    }
  }

  studyAssistLog("assist_done", {
    task: result.task,
    providerId: result.providerId,
    lineCount: result.lines.length,
    hasNote: Boolean(result.note),
  });
  return result;
}

export function analyzeJapaneseStudyLine(text: string): StudyAssistResult {
  studyAssistLog("analyze_line", { textLength: text.length });
  return analyzeJapaneseLine(text);
}
