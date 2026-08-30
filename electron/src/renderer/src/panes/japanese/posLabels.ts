/** Short labels for common JMdict POS codes (subset). */
const POS_LABELS: Record<string, string> = {
  n: "명사",
  v1: "동사(一段)",
  v5: "동사(五段)",
  vs: "する動詞",
  adj: "형용詞",
  adj_i: "い形容詞",
  adj_na: "な形容詞",
  adv: "副詞",
  int: "감탄사",
  exp: "표현",
  prt: "조사",
  conj: "접속詞",
  pn: "대명사",
  pref: "접두사",
  suf: "접미사",
  ctr: "수사",
};

export function formatJapanesePos(code: string): string {
  const normalized = code.replace(/^&/, "").replace(/;$/, "");
  return POS_LABELS[normalized] ?? normalized;
}
