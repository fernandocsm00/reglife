// scripts/nivelamento-light.data.ts — Mãos do doc "Nivelamento Light | Direcionamento",
// na ordem do doc. Fonte de verdade do sync/check dos JSONs em public/spots/.
// Spec: docs/superpowers/specs/2026-09-13-nivelamento-light-product-fit-design.md

export interface DocHand {
  pos: string;
  stack: number;
  /** Vilão (string) ou vilões (multiway). Omitido quando o JSON não usa (RFI). */
  vs?: string | string[];
  board?: string;
  combos: string[];
  answers: string[];
  /** Override de potSize/currentPotSize (river). */
  pot?: number;
  /** Override de heroStackSize/villainStackSize. */
  heroStack?: number;
}

export interface DocModule {
  slug: string;
  tier: 1 | 2;
  hands: DocHand[];
}

const h = (
  pos: string,
  stack: number,
  vs: DocHand["vs"],
  combos: string | string[],
  answers: string | string[],
  extra: Partial<Pick<DocHand, "board" | "pot" | "heroStack">> = {}
): DocHand => ({
  pos,
  stack,
  ...(vs === undefined ? {} : { vs }),
  combos: Array.isArray(combos) ? combos : [combos],
  answers: Array.isArray(answers) ? answers : [answers],
  ...extra,
});

const RAISE_33_55 = ["CALL", "RAISE 33%", "RAISE 55%"];

export const NIVELAMENTO_LIGHT: DocModule[] = [
  // ======================= TIER 1 =======================
  {
    slug: "reglife-rfi-prioridades",
    tier: 1,
    hands: [
      h("LJ", 15, undefined, "98s", "FOLD"),
      h("UTG", 25, undefined, "33", "FOLD"),
      h("LJ", 25, undefined, "KTo", "RAISE 2"),
      h("UTG", 50, undefined, "A9o", "FOLD"),
      h("HJ", 25, undefined, "K6s", "RAISE 2"),
      h("BTN", 50, undefined, "J3s", "RAISE 2"),
      h("BTN", 15, undefined, "22", "ALL-IN"),
      h("HJ", 100, undefined, "A7o", "FOLD"),
      h("CO", 100, undefined, "Q4s", "RAISE 2"),
      h("UTG", 10, undefined, "66", "ALL-IN"),
      h("UTG", 10, undefined, "QJo", "FOLD"),
      h("CO", 10, undefined, "J9s", "ALL-IN"),
      h("BTN", 10, undefined, "K6o", "FOLD"),
      h("BTN", 15, undefined, "JTs", "ALL-IN"),
      h("BTN", 15, undefined, "Q6s", "RAISE 2"),
    ],
  },
  {
    slug: "reglife-cbet-flop-vs-bb",
    tier: 1,
    hands: [
      h("UTG1", 20, "BB", "QsTs", "CBET 1/3", { board: "Jh-4h-2d" }),
      h("UTG1", 20, "BB", "AdKs", "CBET 1/3", { board: "Th-Td-4h" }),
      h("UTG1", 20, "BB", "TsTc", "CBET 1/3", { board: "Jh-4h-2d" }),
      h("UTG1", 20, "BB", "KsKd", "CBET 1/3", { board: "Ad-5h-6h" }),
      h("BTN", 20, "BB", ["8s8c", "8s8d", "8d8c"], "CBET 1/3", { board: "9h-8h-5d" }),
      h("BTN", 20, "BB", "As3d", "CBET 1/3", { board: "Th-Td-4h" }),
      h("BTN", 20, "BB", "Ah8d", "CHECK", { board: "6h-4d-2c" }),
      h("BTN", 20, "BB", ["9s9c", "9s9d", "9s9h", "9d9c", "9h9c", "9h9d"], "CBET 1/3", { board: "Kh-Qd-Jh" }),
      h("BTN", 20, "BB", "Ad7d", "CHECK", { board: "9h-8h-5d" }),
      h("BTN", 20, "BB", "As8d", "CBET 1/3", { board: "9h-6h-2h" }),
    ],
  },
  {
    slug: "reglife-cbet-turn-river-vs-bb",
    tier: 1,
    hands: [
      // Turn — pot 10; 30bb com stacks 25.6 (doc); 100bb mantém o valor atual
      h("BTN", 30, "BB", "Qd4d", "CHECK", { board: "Jd-6d-2c-4h", heroStack: 25.6 }),
      h("BTN", 30, "BB", "6d4d", ["BET 40%", "BET 72%"], { board: "Ad-Jh-Th-3h", heroStack: 25.6 }),
      h("BTN", 30, "BB", "Qs2s", "BET 72%", { board: "6d-4h-3c-9d", heroStack: 25.6 }),
      h("BTN", 30, "BB", "QsQh", "BET 100%", { board: "Jd-6d-2c-4h", heroStack: 25.6 }),
      h("BTN", 30, "BB", "KsTd", "CHECK", { board: "Ah-9d-3c-9s", heroStack: 25.6 }),
      h("BTN", 30, "BB", "6d7d", ["BET 40%", "BET 72%"], { board: "Ah-9d-3c-9s", heroStack: 25.6 }),
      h("BTN", 100, "BB", "Ac2h", ["BET 72%", "BET 100%", "BET 165%"], { board: "Tc-7d-6s-Qd" }),
      h("BTN", 100, "BB", "QhJc", "CHECK", { board: "Ad-Jh-Th-8s" }),
      h("BTN", 100, "BB", "5s5c", ["BET 40%", "CHECK"], { board: "6d-4h-3c-Ks" }),
      h("BTN", 100, "BB", "Jc7s", "CHECK", { board: "Jd-6d-2c-2d" }),
      // River — pot por mão; stack restante = stack − pot/2
      h("BTN", 30, "BB", "AdJc", "ALL-IN", { board: "Qh-Qd-8h-As-7c", pot: 18, heroStack: 21 }),
      h("BTN", 30, "BB", "Kh5h", "ALL-IN", { board: "6d-4h-3c-Ks-Ts", pot: 25, heroStack: 17.5 }),
      h("BTN", 30, "BB", "Qc8d", "ALL-IN", { board: "6d-4h-3c-9d-Td", pot: 25, heroStack: 17.5 }),
      h("BTN", 30, "BB", "9dTs", "ALL-IN", { board: "Qh-Qd-8h-7h-6s", pot: 18, heroStack: 21 }),
      h("BTN", 100, "BB", "Kc7h", "CHECK", { board: "Ah-9d-3c-Tc-2s", pot: 40, heroStack: 80 }),
      h("BTN", 100, "BB", "KdQs", "CHECK", { board: "Tc-7d-6s-8s-Ks", pot: 25, heroStack: 87.5 }),
      h("BTN", 100, "BB", "8d7c", ["BET 100%", "ALL-IN"], { board: "6d-4h-3c-9d-Td", pot: 38, heroStack: 81 }),
      h("BTN", 100, "BB", "JhJd", "ALL-IN", { board: "Tc-7d-6s-Qd-Js", pot: 30, heroStack: 85 }),
      h("BTN", 100, "BB", "KdKh", "CHECK", { board: "Tc-7d-6s-Qd-Js", pot: 35, heroStack: 82.5 }),
      h("BTN", 100, "BB", "3s3d", "ALL-IN", { board: "Ah-9d-3c-Tc-2s", pot: 38, heroStack: 81 }),
    ],
  },
  {
    slug: "reglife-vs-rfi",
    tier: 1,
    hands: [
      h("UTG1", 100, "UTG", "ATo", "FOLD"),
      h("UTG1", 25, "UTG", "AJo", ["RAISE 5", "FOLD"]),
      h("UTG1", 50, "UTG", "Q9s", "FOLD"),
      h("HJ", 15, "LJ", "KJo", "FOLD"),
      h("HJ", 15, "LJ", "99", "ALL-IN"),
      h("HJ", 100, "LJ", "QJo", "FOLD"),
      h("HJ", 25, "LJ", "33", "FOLD"),
      h("BTN", 25, "CO", "ATs", "CALL"),
      h("BTN", 25, "CO", "KTs", "ALL-IN"),
      h("BTN", 25, "CO", "88", "ALL-IN"),
      h("BTN", 50, "CO", "A7o", "FOLD"),
      h("BTN", 50, "CO", "K5s", ["CALL", "RAISE 6"]),
      h("SB", 25, "BTN", "55", "ALL-IN"),
      h("SB", 25, "BTN", "QTs", "ALL-IN"),
      h("SB", 15, "BTN", "75s", "FOLD"),
      h("SB", 15, "BTN", "KJo", "ALL-IN"),
      h("SB", 15, "BTN", "22", "ALL-IN"),
      h("SB", 50, "BTN", "J8s", "CALL"),
      h("SB", 50, "BTN", "A6o", "FOLD"),
      h("SB", 50, "BTN", "AJs", "RAISE 7"),
    ],
  },
  {
    slug: "reglife-defesa-bb",
    tier: 1,
    hands: [
      h("BB", 100, "UTG", "84s", "CALL"),
      h("BB", 100, "UTG", "Q6o", "FOLD"),
      h("BB", 25, "CO", "AJo", "ALL-IN"),
      h("BB", 25, "CO", "J6o", "CALL"),
      h("BB", 25, "CO", "A9s", "CALL"),
      h("BB", 25, "CO", "44", "ALL-IN"),
      h("BB", 25, "CO", "K2o", "CALL"),
      h("BB", 25, "BTN", "A2o", "ALL-IN"),
      h("BB", 25, "BTN", "KJs", "CALL"),
      h("BB", 25, "BTN", "64o", "CALL"),
    ],
  },
  {
    slug: "reglife-blind-war-sb-gap",
    tier: 1,
    hands: [
      h("SB", 50, "BB", "52o", "FOLD"),
      h("SB", 15, "BB", "72s", "LIMP"),
      h("SB", 15, "BB", "A8o", "ALL-IN"),
      h("SB", 60, "BB", "75o", "LIMP"),
      h("SB", 30, "BB", "ATs", "RAISE 3"),
      h("SB", 30, "BB", "J4o", "LIMP"),
      h("SB", 15, "BB", "QJs", "LIMP"),
    ],
  },
  {
    slug: "reglife-blind-war-sb-vs-iso",
    tier: 1,
    hands: [
      h("SB", 30, "BB", "KTs", "CALL"),
      h("SB", 60, "BB", "Q2s", "CALL"),
      h("SB", 60, "BB", "K2o", "FOLD"),
      h("SB", 15, "BB", "QJs", "CALL"),
      h("SB", 30, "BB", "33", "ALL-IN"),
    ],
  },
  {
    slug: "reglife-blind-war-bb-vs-limp",
    tier: 1,
    hands: [
      h("BB", 15, "SB", "A6o", "ALL-IN"),
      h("BB", 15, "SB", "22", "ALL-IN"),
      h("BB", 15, "SB", "Q8s", "CHECK"),
      h("BB", 15, "SB", "AQs", "RAISE 3"),
      h("BB", 15, "SB", "99", "RAISE 3"),
      h("BB", 15, "SB", "72o", "RAISE 3"),
      h("BB", 30, "SB", "T3o", "RAISE 3"),
      h("BB", 30, "SB", "K7s", "CHECK"),
    ],
  },
  {
    slug: "reglife-blind-war-bb-vs-raise",
    tier: 1,
    hands: [
      h("BB", 15, "SB", "A2o", "ALL-IN"),
      h("BB", 30, "SB", "KJs", "CALL"),
      h("BB", 30, "SB", "ATs", "CALL"),
      h("BB", 30, "SB", "JJ", "RAISE 7.5"),
      h("BB", 30, "SB", "94s", "CALL"),
    ],
  },
  {
    slug: "reglife-vs-cbet-flop-bb",
    tier: 1,
    hands: [
      h("BB", 30, "BTN", "Ac9h", "CALL", { board: "Th-5h-5d" }),
      h("BB", 30, "BTN", "6h4h", "CALL", { board: "9h-6d-2h" }),
      h("BB", 30, "BTN", "KhQh", "CALL", { board: "9h-6d-2h" }),
      h("BB", 30, "BTN", "9sTd", RAISE_33_55, { board: "Kh-Jd-4d" }),
      h("BB", 30, "BTN", "9s3s", "CALL", { board: "Ac-Kc-3d" }),
      h("BB", 30, "BTN", "Qd9c", RAISE_33_55, { board: "Jd-6d-2c" }),
      h("BB", 30, "BTN", "Ac4d", "FOLD", { board: "Kd-Th-7h" }),
      h("BB", 30, "BTN", "Ah3d", RAISE_33_55, { board: "Kd-Th-7h" }),
      h("BB", 30, "BTN", "Ks8c", "RAISE 33%", { board: "8s-3s-2s" }),
      h("BB", 30, "BTN", "Qh7d", "RAISE 33%", { board: "Qd-Qc-Js" }),
      h("BB", 30, "BTN", "KQo", "CALL", { board: "As-9d-3c" }),
      h("BB", 30, "UTG", "4c2c", "CALL", { board: "Kd-Tc-7c" }),
      h("BB", 30, "UTG", "Ac7c", ["CALL", "RAISE 33%"], { board: "6d-4h-3c" }),
      h("BB", 30, "UTG", "7d2d", "CALL", { board: "9h-6d-2c" }),
      h("BB", 30, "UTG", "AhTs", "FOLD", { board: "Kc-6c-3s" }),
    ],
  },

  // ======================= TIER 2 =======================
  {
    slug: "reglife-multiway-bb",
    tier: 2,
    hands: [
      h("BB", 25, ["CO", "BTN"], "J7o", "CALL"),
      h("BB", 25, ["CO", "BTN"], "93s", "CALL"),
      h("BB", 25, ["CO", "BTN"], "QJs", "ALL-IN"),
      h("BB", 25, ["CO", "BTN"], "77", "ALL-IN"),
      h("BB", 100, ["CO", "SB"], "QTs", "RAISE 11.9"),
      h("BB", 100, ["CO", "SB"], "53o", "CALL"),
      h("BB", 100, ["CO", "SB"], "Q3o", "FOLD"),
      h("BB", 25, ["CO", "SB"], "T7o", "CALL"),
      h("BB", 25, ["CO", "SB"], "A9o", "ALL-IN"),
      h("BB", 25, ["CO", "SB"], "33", "ALL-IN"),
      h("BB", 25, ["CO", "SB"], "Q6o", "CALL"),
      h("BB", 25, ["CO", "SB"], "JTs", "ALL-IN"),
      h("BB", 100, ["UTG", "LJ"], "A8o", "FOLD"),
      h("BB", 100, ["UTG", "LJ"], "T4s", "CALL"),
      h("BB", 100, ["UTG", "LJ"], "KQs", "RAISE 11.9"),
      h("BB", 25, ["UTG", "LJ"], "TT", "ALL-IN"),
      h("BB", 25, ["UTG", "LJ"], "J6o", "FOLD"),
      h("BB", 25, ["UTG", "LJ"], "K8o", "CALL"),
      h("BB", 25, ["UTG", "LJ"], "Q7o", "FOLD"),
      h("BB", 25, ["UTG", "LJ"], "KJs", "ALL-IN"),
    ],
  },
  {
    slug: "reglife-vs-3bet-ep",
    tier: 2,
    hands: [
      h("UTG", 50, "CO", "AJo", "FOLD"),
      h("UTG", 50, "CO", "55", "CALL"),
      h("UTG", 50, "CO", "56s", "CALL"),
      h("UTG", 25, "CO", "K9s", "CALL"),
      h("UTG", 25, "CO", "A4s", ["CALL", "ALL-IN"]),
      h("UTG", 25, "CO", "KJo", "FOLD"),
      h("CO", 25, "BTN", "88", "ALL-IN"),
      h("CO", 25, "BTN", "AJo", ["CALL", "ALL-IN"]),
      h("CO", 25, "BTN", "A8o", "FOLD"),
      h("CO", 25, "BTN", "K7s", "CALL"),
      h("CO", 50, "BTN", "TT", ["ALL-IN", "RAISE 13.65"]),
      h("CO", 50, "BTN", "A9o", ["FOLD", "RAISE 13.65"]),
      h("CO", 50, "BTN", "KTo", "FOLD"),
      h("CO", 50, "BTN", "AJs", "CALL"),
      h("CO", 50, "BTN", "67s", "CALL"),
    ],
  },
  {
    slug: "reglife-vs-3bet-btn",
    tier: 2,
    hands: [
      h("BTN", 25, "SB", "ATs", "CALL"),
      h("BTN", 25, "SB", "AJo", "ALL-IN"),
      h("BTN", 25, "SB", "QTo", "FOLD"),
      h("BTN", 25, "SB", "K6s", "CALL"),
      h("BTN", 50, "SB", "99", "ALL-IN"),
      h("BTN", 50, "SB", "A2s", ["CALL", "ALL-IN"]),
      h("BTN", 50, "SB", "KJo", "CALL"),
      h("BTN", 50, "SB", "J8s", "CALL"),
      h("BTN", 50, "SB", "A7o", "FOLD"),
      h("BTN", 50, "SB", "K9o", "FOLD"),
    ],
  },
  {
    slug: "reglife-cbet-vs-btn",
    tier: 2,
    hands: [
      h("CO", 30, "BTN", "KdQd", "CHECK", { board: "6d-4h-3c" }),
      h("UTG", 30, "BTN", "8d8c", ["CHECK", "BET 66%"], { board: "9h-6d-2h" }),
      h("CO", 30, "BTN", "AsAc", "CHECK", { board: "Ad-Jh-Th" }),
      h("UTG", 30, "BTN", "Ah8h", "CHECK", { board: "Kc-6c-3s" }),
      h("CO", 30, "BTN", "Jd6d", "CHECK", { board: "8s-3s-2s" }),
      h("UTG", 30, "BTN", "TsTc", ["CHECK", "BET 30%"], { board: "8s-3s-2s" }),
      h("UTG", 30, "BTN", "5h5d", "BET 30%", { board: "As-Ac-7s" }),
      h("CO", 30, "BTN", "As4s", "CHECK", { board: "9h-6d-2h" }),
      h("UTG", 30, "BTN", "AcKc", "BET 66%", { board: "Tc-7d-6s" }),
      h("CO", 30, "BTN", "Qs4s", "CHECK", { board: "Tc-7d-6s" }),
      h("UTG", 30, "BTN", "AhKh", ["BET 30%", "BET 66%"], { board: "Js-8s-8h" }),
      h("UTG", 30, "BTN", "TsTh", "BET 30%", { board: "Qd-Qc-Js" }),
      h("CO", 30, "BTN", "Ac9d", "CHECK", { board: "Qh-8h-3h" }),
      h("CO", 30, "BTN", "Jd9d", "CHECK", { board: "Ad-Jh-Th" }),
      h("UTG", 30, "BTN", "9s9h", "CHECK", { board: "Ac-Kc-3d" }),
    ],
  },
  {
    slug: "reglife-vs-cbet-flop-btn",
    tier: 2,
    hands: [
      h("BTN", 30, "UTG", "Tc8c", "FOLD", { board: "Jd-6d-2c" }),
      h("BTN", 30, "CO", "4h4d", "CALL", { board: "Qd-Qc-Js" }),
      h("BTN", 30, "CO", "KcJc", "CALL", { board: "Tc-7d-6s" }),
      h("BTN", 30, "UTG", "9cTc", "CALL", { board: "Qh-8h-3h" }),
      h("BTN", 30, "UTG", "AdTc", "FOLD", { board: "Js-8s-8d" }),
      h("BTN", 30, "CO", "JcTs", "CALL", { board: "Tc-7d-6s" }),
      h("BTN", 30, "UTG", "8h8d", "CALL", { board: "Kd-Th-7h" }),
      // Doc: "Ac7c no board AsAc7s" (carta duplicada) → versão atual do JSON
      h("BTN", 30, "UTG", "Ah7c", "CALL", { board: "As-Ad-7s" }),
      h("BTN", 30, "UTG", "AdTs", "FOLD", { board: "Kc-6c-3s" }),
      h("BTN", 30, "CO", "KcQd", "CALL", { board: "Qh-8h-3h" }),
    ],
  },
  {
    slug: "reglife-cbet-flop-btn-missed",
    tier: 2,
    hands: [
      h("BTN", 40, "CO", "Kh8h", "CHECK", { board: "As-Ks-4h" }),
      h("BTN", 40, "CO", "QhJd", ["CHECK", "BET 30%"], { board: "8d-6h-5h" }),
      h("BTN", 40, "CO", "9h9d", ["CHECK", "BET 30%"], { board: "Kh-4h-3h" }),
      h("BTN", 40, "CO", "AcQc", ["CHECK", "BET 60%"], { board: "As-Ks-4h" }),
      h("BTN", 40, "CO", "Kh4h", "BET 30%", { board: "Th-8h-7h" }),
    ],
  },
];
