// lib/poker/productFit.ts — Produto indicado pro lead (admin-only).
//
// Perfil (quiz): cada cor do doc "TST | pesquisa lead scoring" marca o
// requisito mínimo (rank da opção) de um produto; requisitos acumulam. O lead
// fica com o produto mais alto cujos mínimos cumpre.
// Técnico (teste): % de acerto sobre as mãos jogadas → 70/50.
// Final = menor dos dois. Ver docs/superpowers/specs/2026-09-13-nivelamento-light-product-fit-design.md

import { answerRank, parseQuizAnswers, type QuizAnswers } from "./leadScoring";

export type Product = "bases" | "protocolo" | "comunidade" | "time";
export type TestBucket = "time" | "comunidade" | "comunidade_ou_protocolo";

export const PRODUCT_ORDER: readonly Product[] = ["bases", "protocolo", "comunidade", "time"];

export const PRODUCT_LABELS: Record<Product, string> = {
  bases: "Bases",
  protocolo: "Protocolo",
  comunidade: "Comunidade",
  time: "Time",
};

export const TEST_BUCKET_LABELS: Record<TestBucket, string> = {
  time: "Time (≥70%)",
  comunidade: "Comunidade (50–69%)",
  comunidade_ou_protocolo: "Comunidade ou Protocolo (<50%)",
};

type ScoredKey = Exclude<keyof QuizAnswers, "idade">;

/** Rank mínimo por pergunta. Monotônico produto a produto (acumulativo). */
export const PRODUCT_REQUIREMENTS: Record<Product, Record<ScoredKey, number>> = {
  bases: { tempoJogo: 0, objetivo: 1, abi: 0, torneiosMes: 0, banca: 0 },
  protocolo: { tempoJogo: 2, objetivo: 2, abi: 0, torneiosMes: 0, banca: 0 },
  comunidade: { tempoJogo: 4, objetivo: 3, abi: 1, torneiosMes: 2, banca: 1 },
  time: { tempoJogo: 4, objetivo: 4, abi: 4, torneiosMes: 4, banca: 1 },
};

const TIME_PCT = 70;
const COMUNIDADE_PCT = 50;

export function isProduct(v: unknown): v is Product {
  return typeof v === "string" && (PRODUCT_ORDER as readonly string[]).includes(v);
}

export function isTestBucket(v: unknown): v is TestBucket {
  return typeof v === "string" && v in TEST_BUCKET_LABELS;
}

export function profileProduct(quiz: QuizAnswers): Product | null {
  let best: Product | null = null;
  for (const product of PRODUCT_ORDER) {
    const req = PRODUCT_REQUIREMENTS[product];
    const meets = (Object.keys(req) as ScoredKey[]).every(
      (k) => answerRank(k, quiz[k]) >= req[k]
    );
    // Requisitos são monotônicos: se falha num produto, falha nos acima.
    if (!meets) break;
    best = product;
  }
  return best;
}

/** Perfil a partir de um quiz cru (body/banco). Quiz inválido ou v1 → null. */
export function profileFromRaw(raw: unknown): Product | null {
  const quiz = parseQuizAnswers(raw);
  return quiz ? profileProduct(quiz) : null;
}

export function testBucket(pct: number): TestBucket {
  if (pct >= TIME_PCT) return "time";
  if (pct >= COMUNIDADE_PCT) return "comunidade";
  return "comunidade_ou_protocolo";
}

function minProduct(a: Product, b: Product): Product {
  return PRODUCT_ORDER.indexOf(a) <= PRODUCT_ORDER.indexOf(b) ? a : b;
}

/**
 * Final = min(perfil, técnico). "comunidade_ou_protocolo" resolve pra
 * Comunidade quando o perfil permite; senão fica o perfil — ou seja, o mesmo
 * teto do bucket "comunidade".
 */
export function finalProduct(profile: Product | null, bucket: TestBucket): Product | null {
  if (!profile) return null;
  const ceiling: Product = bucket === "time" ? "time" : "comunidade";
  return minProduct(profile, ceiling);
}

/** % de acerto sobre as mãos jogadas (arredondado). Sem mãos → 0. */
export function accuracyPct(results: ReadonlyArray<{ isCorrect?: boolean }>): number {
  if (results.length === 0) return 0;
  const correct = results.filter((r) => r.isCorrect === true).length;
  return Math.round((correct / results.length) * 100);
}

export interface ProductRowLike {
  product_profile: string | null;
  product_test: string | null;
  product_final: string | null;
  quiz_answers: unknown;
}

/** Texto curto pra lista do admin. */
export function describeProduct(row: ProductRowLike): string {
  if (isProduct(row.product_final)) return PRODUCT_LABELS[row.product_final];
  if (isProduct(row.product_profile)) {
    return `Perfil: ${PRODUCT_LABELS[row.product_profile]} · teste pendente`;
  }
  if (parseQuizAnswers(row.quiz_answers)) return "Fora do perfil";
  return "—";
}
