import type { StudyAssistRequest, StudyLevel, StudyTask } from "../../../shared/japaneseStudyTypes";
import type { StudyToken } from "../../../shared/japaneseStudyTypes";
import { resolveTranslateDirection } from "../translateDirection";

function levelHint(level: StudyLevel | undefined): string {
  switch (level ?? "auto") {
    case "N5":
      return "JLPT N5 수준 학습자에게 맞춰 주세요.";
    case "N4":
      return "JLPT N4 수준 학습자에게 맞춰 주세요.";
    case "N3":
      return "JLPT N3 수준 학습자에게 맞춰 주세요.";
    default:
      return "JLPT N5~N4 학습자에게 맞춰 주세요.";
  }
}

function formatTokenContext(tokens: StudyToken[] | undefined): string {
  if (!tokens || tokens.length === 0) return "";
  const lines = tokens.map((token) => {
    const reading = token.reading ? ` / ${token.reading}` : "";
    const gloss = token.glossKo ? ` = ${token.glossKo}` : "";
    return `- ${token.surface}${reading}${gloss}`;
  });
  return `\n\n사전 참고:\n${lines.join("\n")}`;
}

export function buildStudyPrompt(req: StudyAssistRequest): { system: string; user: string } {
  const level = levelHint(req.level);
  const tokenBlock = formatTokenContext(req.dictionaryTokens);
  const direction = resolveTranslateDirection(req);
  const contextLines = [
    req.context?.previousLine ? `이전 줄: ${req.context.previousLine}` : null,
    req.context?.nextLine ? `다음 줄: ${req.context.nextLine}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "당신은 일본어 학습 보조입니다.",
    level,
    "간결하게 답하세요.",
    "불필요한 인사말이나 장황한 설명은 피하세요.",
    "마크다운 서식(굵게 **, 기울임, 목록, 불릿)을 쓰지 말고 평문만 출력하세요.",
    outputRule(req.task, direction),
  ].join(" ");

  const sourceLabel =
    direction === "to_ja" ? "한국어" : req.task === "check_translation" ? "일본어" : "원문";
  const userParts = [
    contextLines || null,
    `${sourceLabel}: ${req.text}`,
    req.koreanDraft ? `학습자 번역: ${req.koreanDraft}` : null,
    tokenBlock || null,
  ].filter(Boolean);

  return { system, user: userParts.join("\n\n") };
}

function outputRule(task: StudyTask, direction: "to_ko" | "to_ja"): string {
  switch (task) {
    case "translate":
    case "translate_to_ko":
      return direction === "to_ja"
        ? "일본어 번역 한 줄만 출력하세요."
        : "한국어 번역 한 줄만 출력하세요.";
    case "translate_to_ja":
      return "일본어 번역 한 줄만 출력하세요.";
    case "grammar_hint":
      return "핵심 문법만 1~2문장의 평문으로 한국어로 설명하세요. 한자 분해, 목록, 굵게 표시는 하지 마세요.";
    case "check_translation":
      return "번역이 맞는지 1~2문장으로 짧게 평가하세요. 틀린 부분이 있으면 올바른 표현만 제시하세요. 마크다운 서식은 쓰지 마세요.";
    case "practice_sentences":
      return "연습용 일본어 문장 2~3개를 각각 한 줄씩 출력하세요. 난이도는 너무 높이지 마세요.";
    case "reading":
      return "히라가나 읽기 한 줄만 출력하세요.";
    default:
      return "요청에 맞는 결과만 출력하세요.";
  }
}

export function parseLineResponse(text: string, task: StudyTask): { lines: string[]; note?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { lines: [] };

  if (task === "practice_sentences") {
    const lines = trimmed
      .split(/\n+/)
      .map((line) => line.replace(/^[\d.)\-\s]+/, "").trim())
      .filter(Boolean);
    return { lines: lines.slice(0, 3) };
  }

  if (task === "grammar_hint" || task === "check_translation") {
    return { lines: [], note: trimmed };
  }

  const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
  return { lines: firstLine ? [firstLine] : [] };
}
