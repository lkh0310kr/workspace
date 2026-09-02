import type { StudyAssistRequest, StudyLevel, StudyTask } from "../../../shared/japaneseStudyTypes";
import type { StudyChatMessage, StudyToken } from "../../../shared/japaneseStudyTypes";
import { resolveTranslateDirection } from "../translateDirection";

export type StudyLlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const STUDY_CHAT_LLM_TURN_LIMIT = 40;

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

function formatContextLines(lines: string[] | undefined, label: string): string | null {
  if (!lines || lines.length === 0) return null;
  return `${label}:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export const AUGMENT_DOC_CHAR_LIMIT = 12_000;

function truncateDocumentForAugment(
  doc: string,
  cursorOffset: number,
): { text: string; truncated: boolean } {
  if (doc.length <= AUGMENT_DOC_CHAR_LIMIT) return { text: doc, truncated: false };
  const cursor = Math.min(Math.max(0, cursorOffset), doc.length);
  const half = Math.floor(AUGMENT_DOC_CHAR_LIMIT / 2);
  const start = Math.max(0, cursor - half);
  const end = Math.min(doc.length, start + AUGMENT_DOC_CHAR_LIMIT);
  const adjustedStart = Math.max(0, end - AUGMENT_DOC_CHAR_LIMIT);
  return { text: doc.slice(adjustedStart, end), truncated: true };
}

function buildAugmentPrompt(req: StudyAssistRequest): { system: string; user: string } {
  const ctx = req.context;
  const fullDocument = ctx?.fullDocument ?? "";
  const cursorOffset = ctx?.cursorOffset ?? 0;
  const { text: documentBody, truncated } = truncateDocumentForAugment(fullDocument, cursorOffset);

  const system = [
    "당신은 일본어 학습 노트 보조입니다.",
    levelHint(req.level),
    "학습자의 마크다운 노트를 읽고, 커서 위치에 삽입할 **추가 내용만** 작성하세요.",
    "기존 본문은 수정·요약·재작성하지 마세요.",
    "노트에 이미 쓰인 마크다운 스타일(제목 레벨, 목록, `- [ ]` 할 일, `> ` 인용, [[wikilink]], 일본어+한국어 혼용)을 그대로 따르세요.",
    "빠진 개념 설명, 예문, 복습 포인트, 할 일, 관련 링크 제안 등을 문맥에 맞게 추가할 수 있습니다.",
    "설명·메타 텍스트 없이 삽입할 마크다운만 출력하세요.",
  ].join(" ");

  const userParts = [
    ctx?.filePath ? `노트: ${ctx.filePath}` : null,
    ctx?.cursorLine != null ? `커서 줄: ${ctx.cursorLine}` : null,
    ctx?.currentLine ? `커서 줄 내용: ${ctx.currentLine}` : null,
    formatContextLines(ctx?.previousLines, "앞 문맥"),
    formatContextLines(ctx?.nextLines, "뒤 문맥"),
    truncated ? "(참고: 문서가 길어 일부만 포함했습니다.)" : null,
    `전체 문서:\n${documentBody}`,
  ].filter(Boolean);

  return { system, user: userParts.join("\n\n") };
}

function buildDocumentContextBlock(req: StudyAssistRequest): string {
  const ctx = req.context;
  const previousLines =
    ctx?.previousLines ??
    (ctx?.previousLine ? [ctx.previousLine] : undefined);
  const nextLines = ctx?.nextLines ?? (ctx?.nextLine ? [ctx.nextLine] : undefined);

  return [
    ctx?.filePath ? `노트: ${ctx.filePath}` : null,
    ctx?.currentLine ? `현재 줄: ${ctx.currentLine}` : null,
    formatContextLines(previousLines, "앞 문맥"),
    formatContextLines(nextLines, "뒤 문맥"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function selectionAnchorBlock(req: StudyAssistRequest): string {
  const documentContext = buildDocumentContextBlock(req);
  const tokenBlock = formatTokenContext(req.dictionaryTokens);
  return [
    documentContext || null,
    `선택한 텍스트 (학습 주제):\n${req.text}`,
    tokenBlock || null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildChatSystem(level: StudyLevel | undefined): string {
  return [
    "당신은 일본어 학습 튜터입니다.",
    levelHint(level),
    "학습자와 한국어로 자연스럽게 대화하세요.",
    "선택한 텍스트는 대화의 주제/맥락일 뿐입니다. 매 응답마다 번역 한 단어만 반복하지 마세요.",
    "인사·잡담·불만·농담에도 먼저 사람처럼 반응한 뒤, 필요하면 학습 도움을 이어가세요.",
    "번역·읽기·문법·예문·뉘앙스·한자 구성은 학습자가 묻거나 맥락상 필요할 때만 설명하세요.",
    "노트의 앞뒤 문맥과 사전 정보를 참고해 지능적으로 답하세요.",
    "답변은 보통 2~5문장. 마크다운 서식(** 등) 없이 평문만 출력하세요.",
  ].join(" ");
}

export function trimChatHistoryForLlm(messages: StudyChatMessage[]): StudyChatMessage[] {
  if (messages.length <= STUDY_CHAT_LLM_TURN_LIMIT) return messages;
  return messages.slice(-STUDY_CHAT_LLM_TURN_LIMIT);
}

export function buildStudyPrompt(req: StudyAssistRequest): { system: string; user: string } {
  const level = levelHint(req.level);
  const direction = resolveTranslateDirection(req);
  const contextLines = [
    req.context?.previousLine ? `이전 줄: ${req.context.previousLine}` : null,
    req.context?.nextLine ? `다음 줄: ${req.context.nextLine}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (req.task === "chat") {
    return { system: buildChatSystem(req.level), user: selectionAnchorBlock(req) };
  }

  if (req.task === "augment") {
    return buildAugmentPrompt(req);
  }

  const system = [
    "당신은 일본어 학습 보조입니다.",
    level,
    "간결하게 답하세요.",
    "불필요한 인사말이나 장황한 설명은 피하세요.",
    "마크다운 서식(굵게 **, 기울임, 목록, 불릿)을 쓰지 말고 평문만 출력하세요.",
    outputRule(req.task, direction),
  ].join(" ");

  const tokenBlock = formatTokenContext(req.dictionaryTokens);
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

export function buildStudyLlmMessages(req: StudyAssistRequest): StudyLlmMessage[] {
  const { system, user } = buildStudyPrompt(req);
  const messages: StudyLlmMessage[] = [{ role: "system", content: system }];

  if (req.task === "chat") {
    messages.push({ role: "user", content: user });
    for (const turn of trimChatHistoryForLlm(req.messages ?? [])) {
      messages.push({ role: turn.role, content: turn.content });
    }
    if (req.userMessage?.trim()) {
      messages.push({ role: "user", content: req.userMessage.trim() });
    }
    return messages;
  }

  messages.push({ role: "user", content: user });
  return messages;
}

/** Apple FM sidecar accepts one prompt — fold chat history into a single user string. */
export function buildAppleFmUserPrompt(req: StudyAssistRequest): string {
  if (req.task !== "chat") {
    return buildStudyPrompt(req).user;
  }

  const parts: string[] = [
    "[시스템 지침]",
    buildChatSystem(req.level),
    "",
    "[학습 맥락]",
    buildStudyPrompt(req).user,
    "",
    "[대화 기록]",
  ];

  for (const turn of trimChatHistoryForLlm(req.messages ?? [])) {
    const label = turn.role === "user" ? "학습자" : "튜터";
    parts.push(`${label}: ${turn.content}`);
  }
  if (req.userMessage?.trim()) {
    parts.push(`학습자: ${req.userMessage.trim()}`);
    parts.push("튜터:");
  }
  return parts.join("\n");
}

function outputRule(task: StudyTask, direction: "to_ko" | "to_ja"): string {
  switch (task) {
    case "chat":
      return "대화형 튜터로 자연스럽게 답하세요.";
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
    case "augment":
      return "삽입할 마크다운만 출력하세요.";
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

  if (task === "grammar_hint" || task === "check_translation" || task === "chat" || task === "augment") {
    return { lines: [], note: trimmed };
  }

  const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
  return { lines: firstLine ? [firstLine] : [] };
}
