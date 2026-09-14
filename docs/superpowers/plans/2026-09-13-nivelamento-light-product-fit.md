# Nivelamento Light + Product Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o questionário do onboarding pelo de lead scoring (Bases/Protocolo/Comunidade/Time), calcular e gravar o produto indicado (perfil × teste) para admin/CSV/webhook, e sincronizar os 16 JSONs de spots com as 190 mãos do Nivelamento Light.

**Architecture:**
- `lib/poker/leadScoring.ts` passa a definir o quiz v3 (tipos, opções, validação, derivações para o plano).
- `lib/poker/productFit.ts` concentra as regras puras de produto. As rotas `/api/leads` e `/api/results` recalculam tudo no servidor e gravam em 3 colunas novas (migration 016). Admin e CSV só leem.
- As mãos ficam como dados tipados em `scripts/nivelamento-light.data.ts`. Um script de sync regrava os JSONs reaproveitando o `spotConfig` das mãos existentes (mesmo cenário), e um script de check valida o resultado.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Zustand + Supabase. Testes são scripts `scripts/check-*.ts` rodados com `npx tsx` (devDependency já presente).

**Spec:** `docs/superpowers/specs/2026-09-13-nivelamento-light-product-fit-design.md`

## Global Constraints

- Branch: `nivelamento-light`, criado como cópia do **`testecom19`** (quiz v1 com lead score, telefone internacional, sem opt-in de WhatsApp). Rodar `git branch --show-current` antes de cada commit; nunca commitar em outro branch.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Textos das perguntas e opções: exatamente como no spec (seção 1), em pt-BR.
- Ordem dos produtos: `bases < protocolo < comunidade < time`. `product_test` aceita também `comunidade_ou_protocolo`.
- Produto é admin-only: nada novo aparece para o aluno (resultado, plano, PDF).
- Migration 016 é aditiva e idempotente (`add column if not exists`), sem CHECK constraint. **Não** aplicar em prod; o usuário aplica manualmente.
- `AGENTS.md`: esta versão do Next.js tem breaking changes. Antes de alterar route handlers ou páginas, seguir os padrões dos arquivos existentes e, em dúvida, consultar `node_modules/next/dist/docs/`.
- JSONs em `public/spots/`: indentação de 2 espaços e CRLF (o working copy usa `core.autocrlf=true`).
- Rodar comandos a partir de `C:\REGLIFE_TRAINER\reglife`.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/poker/leadScoring.ts` | Reescrever | Quiz v3: tipos, opções, `QUIZ_QUESTIONS`, `parseQuizAnswers`, `answerRank`, `labelOf`, derivações |
| `lib/poker/productFit.ts` | Criar | `profileProduct`, `testBucket`, `finalProduct`, `accuracyPct`, `describeProduct`, labels |
| `scripts/check-productFit.ts` | Criar | Testes do quiz v3 + product fit |
| `components/trainer/OnboardingForm.tsx` | Modificar | 7 telas: identidade + 6 perguntas do doc (a última envia) |
| `lib/poker/diagnosticoStore.ts` | Modificar | Remove `leadScore`/`leadCategory` |
| `components/trainer/DiagnosticoScreen.tsx` | Modificar | Payloads sem `leadScore`/`leadCategory` |
| `lib/admin/exportCsv.ts` | Modificar | Colunas do quiz v3 + colunas de produto |
| `scripts/check-exportCsv.ts` | Criar | Testes do CSV |
| `supabase/migrations/016_product_fit.sql` | Criar | Colunas `product_profile`, `product_test`, `product_final` |
| `lib/supabase.ts` | Modificar | `DiagnosticRow` ganha as 3 colunas |
| `app/api/leads/route.ts` | Modificar | Valida quiz, recalcula derivações e perfil, grava (lead score = null) e envia no webhook |
| `app/api/results/route.ts` | Modificar | Calcula teste e final, grava e envia no webhook |
| `app/admin/page.tsx` | Modificar | Coluna "Produto" substitui "Lead" |
| `app/admin/resultado/[id]/page.tsx` | Modificar | Card "Produto indicado" |
| `scripts/nivelamento-light.data.ts` | Criar | As 190 mãos do doc como dados |
| `scripts/sync-nivelamento-light.ts` | Criar | Regrava os JSONs a partir dos dados |
| `scripts/check-nivelamento-light.ts` | Criar | Valida JSONs × dados |
| `public/spots/*.json` (16) | Regenerar | Saída do sync |
| `app/diagnostico/page.tsx` | Modificar | Comentário com as novas contagens |

**Nota sobre `tsc` entre tarefas:**
- A Task 1 reescreve `leadScoring.ts` e quebra a compilação de `OnboardingForm.tsx`, `diagnosticoStore.ts`, `DiagnosticoScreen.tsx`, `exportCsv.ts`, `app/api/leads/route.ts` e `app/api/results/route.ts`. Na Task 1, validar só com `npx tsx scripts/check-productFit.ts`.
- A Task 2 conserta o cliente e o CSV (typecheck filtrado).
- A Task 3 conserta as rotas. A partir dela, `npx tsc --noEmit` precisa passar inteiro.

**Base sem scripts de check:** o `testecom19` não tem `scripts/check-*.ts`, só `scripts/test-*.mts`. Os `check-*` deste plano são novos.

---

### Task 1: Quiz v3 + regras de product fit

**Files:**
- Rewrite: `lib/poker/leadScoring.ts`
- Create: `lib/poker/productFit.ts`
- Test: `scripts/check-productFit.ts`

**Interfaces:**
- Consumes: `ProfitGoal`, `StudyTime` de `lib/poker/planStorage.ts`; `GRADE_LINKS` de `lib/poker/spotLinks.ts` (só no teste).
- Produces (usados nas Tasks 2–4):
  - `leadScoring.ts`: `type QuizAnswers = { idade: IdadeAnswer; tempoJogo: TempoJogoAnswer; objetivo: ObjetivoAnswer; abi: AbiAnswer; torneiosMes: TorneiosMesAnswer; banca: BancaAnswer }`, `type QuizKey = keyof QuizAnswers`, `interface QuizOption<T extends string> { value: T; label: string }`, `interface QuizQuestion { key: QuizKey; title: string; sub?: string; options: readonly QuizOption<string>[] }`, `QUIZ_QUESTIONS: readonly QuizQuestion[]`, `answerRank(key: QuizKey, value: string | null | undefined): number`, `labelOf(key: QuizKey, value: string | null | undefined): string | null`, `parseQuizAnswers(raw: unknown): QuizAnswers | null`, `computeStakeGrade(a: QuizAnswers): number`, `objetivoToProfitGoal(o: ObjetivoAnswer): ProfitGoal`, `weeklyVolumeTarget(t: TorneiosMesAnswer): number`, `studyTimeFromTorneios(t: TorneiosMesAnswer): StudyTime`.
  - `productFit.ts`: `type Product = "bases" | "protocolo" | "comunidade" | "time"`, `type TestBucket = "time" | "comunidade" | "comunidade_ou_protocolo"`, `PRODUCT_ORDER`, `PRODUCT_LABELS`, `TEST_BUCKET_LABELS`, `PRODUCT_REQUIREMENTS`, `isProduct(v: unknown): v is Product`, `isTestBucket(v: unknown): v is TestBucket`, `profileProduct(q: QuizAnswers): Product | null`, `profileFromRaw(raw: unknown): Product | null`, `testBucket(pct: number): TestBucket`, `finalProduct(profile: Product | null, bucket: TestBucket): Product | null`, `accuracyPct(results: ReadonlyArray<{ isCorrect?: boolean }>): number`, `describeProduct(row: ProductRowLike): string`, `interface ProductRowLike { product_profile: string | null; product_test: string | null; product_final: string | null; quiz_answers: unknown }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/check-productFit.ts`:

```ts
// Verificação pura — roda com: npx tsx scripts/check-productFit.ts
import {
  QUIZ_QUESTIONS,
  answerRank,
  computeStakeGrade,
  labelOf,
  objetivoToProfitGoal,
  parseQuizAnswers,
  studyTimeFromTorneios,
  weeklyVolumeTarget,
  type QuizAnswers,
} from "../lib/poker/leadScoring";
import {
  PRODUCT_ORDER,
  PRODUCT_REQUIREMENTS,
  accuracyPct,
  describeProduct,
  finalProduct,
  profileFromRaw,
  profileProduct,
  testBucket,
} from "../lib/poker/productFit";
import { GRADE_LINKS } from "../lib/poker/spotLinks";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// Quiz mínimo: tudo na primeira opção, objetivo "competir" (fecha Bases).
const BASE: QuizAnswers = {
  idade: "25_34",
  tempoJogo: "aprendendo",
  objetivo: "competir",
  abi: "nao_sei",
  torneiosMes: "nao_sei",
  banca: "lt_875",
};
const q = (o: Partial<QuizAnswers>): QuizAnswers => ({ ...BASE, ...o });

const COMUNIDADE_MIN = q({
  tempoJogo: "gt_5", objetivo: "profissional", abi: "lt_5", torneiosMes: "100_200", banca: "875_2000",
});
const TIME_MIN = q({
  tempoJogo: "gt_5", objetivo: "ja_vive", abi: "23_54", torneiosMes: "gt_300", banca: "875_2000",
});

// ---- Questionário ----------------------------------------------------------
check("QUIZ_QUESTIONS order", QUIZ_QUESTIONS.map((x) => x.key), [
  "idade", "tempoJogo", "objetivo", "abi", "torneiosMes", "banca",
]);
check("objetivo labels", QUIZ_QUESTIONS[2].options.map((o) => o.label), [
  "Diversão, não me preocupo com resultado",
  "Competir, mas não pretendo viver do jogo",
  "Renda extra, poder contar com os ganhos no jogo",
  "Ser profissional, ter o jogo como renda principal",
  "Já vivo do poker e quero crescer na carreira",
]);
check("answerRank abi gt_54", answerRank("abi", "gt_54"), 5);
check("answerRank invalid", answerRank("abi", "xx"), -1);
check("answerRank null", answerRank("banca", null), -1);
check("labelOf banca", labelOf("banca", "875_2000"), "$875 a $2.000");
check("labelOf invalid", labelOf("banca", "875_1499"), null);

check("parse valid", parseQuizAnswers({ ...BASE }), BASE);
check("parse missing key", parseQuizAnswers({ ...BASE, banca: undefined }), null);
check("parse invalid value", parseQuizAnswers({ ...BASE, objetivo: "competitivo" }), null);
check("parse non-object", parseQuizAnswers("x"), null);
check("parse null", parseQuizAnswers(null), null);
check("parse strips extra keys", parseQuizAnswers({ ...BASE, foo: "bar" }), BASE);

// ---- Derivações ------------------------------------------------------------
check("stakeGrade lt_875", computeStakeGrade(q({ banca: "lt_875" })), 1);
check("stakeGrade 875_2000", computeStakeGrade(q({ banca: "875_2000" })), 2.5);
check("stakeGrade 2001_5000", computeStakeGrade(q({ banca: "2001_5000" })), 4);
check("stakeGrade 5001_10000", computeStakeGrade(q({ banca: "5001_10000" })), 10);
check("stakeGrade gt_10000", computeStakeGrade(q({ banca: "gt_10000" })), 19);
for (const b of QUIZ_QUESTIONS[5].options) {
  const g = computeStakeGrade(q({ banca: b.value as QuizAnswers["banca"] }));
  check(`GRADE_LINKS has ${g}`, GRADE_LINKS[g] !== undefined, true);
}

check("profitGoal diversao", objetivoToProfitGoal("diversao"), "usd1k");
check("profitGoal competir", objetivoToProfitGoal("competir"), "usd1k");
check("profitGoal renda_extra", objetivoToProfitGoal("renda_extra"), "usd10k");
check("profitGoal profissional", objetivoToProfitGoal("profissional"), "usd100k");
check("profitGoal ja_vive", objetivoToProfitGoal("ja_vive"), "usd50k");

check("volume nao_sei", weeklyVolumeTarget("nao_sei"), 25);
check("volume lt_100", weeklyVolumeTarget("lt_100"), 20);
check("volume 100_200", weeklyVolumeTarget("100_200"), 38);
check("volume 200_300", weeklyVolumeTarget("200_300"), 63);
check("volume gt_300", weeklyVolumeTarget("gt_300"), 88);

check("studyTime nao_sei", studyTimeFromTorneios("nao_sei"), "ate15");
check("studyTime lt_100", studyTimeFromTorneios("lt_100"), "ate15");
check("studyTime 100_200", studyTimeFromTorneios("100_200"), "ate40");
check("studyTime 200_300", studyTimeFromTorneios("200_300"), "ate40");
check("studyTime gt_300", studyTimeFromTorneios("gt_300"), "mais40");

// ---- Requisitos monotônicos (acumulativos) ---------------------------------
for (let i = 1; i < PRODUCT_ORDER.length; i++) {
  const prev = PRODUCT_REQUIREMENTS[PRODUCT_ORDER[i - 1]];
  const cur = PRODUCT_REQUIREMENTS[PRODUCT_ORDER[i]];
  for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
    check(`monotonic ${PRODUCT_ORDER[i]}.${k}`, cur[k] >= prev[k], true);
  }
}

// ---- Perfil ----------------------------------------------------------------
check("bases mínimo", profileProduct(BASE), "bases");
check("diversao com tudo no máximo → null",
  profileProduct(q({ ...TIME_MIN, objetivo: "diversao", abi: "gt_54", banca: "gt_10000" })), null);
check("idade não pontua", profileProduct(q({ idade: "55_mais" })), "bases");

check("protocolo mínimo", profileProduct(q({ tempoJogo: "1_3", objetivo: "renda_extra" })), "protocolo");
check("protocolo falha tempo lt_1", profileProduct(q({ tempoJogo: "lt_1", objetivo: "renda_extra" })), "bases");
check("protocolo falha objetivo competir", profileProduct(q({ tempoJogo: "gt_5", objetivo: "competir" })), "bases");

check("comunidade mínimo", profileProduct(COMUNIDADE_MIN), "comunidade");
check("comunidade falha tempo 3_5", profileProduct({ ...COMUNIDADE_MIN, tempoJogo: "3_5" }), "protocolo");
check("comunidade falha abi nao_sei", profileProduct({ ...COMUNIDADE_MIN, abi: "nao_sei" }), "protocolo");
check("comunidade falha torneios lt_100", profileProduct({ ...COMUNIDADE_MIN, torneiosMes: "lt_100" }), "protocolo");
check("comunidade falha banca lt_875", profileProduct({ ...COMUNIDADE_MIN, banca: "lt_875" }), "protocolo");

check("time mínimo", profileProduct(TIME_MIN), "time");
check("time falha abi 13_23", profileProduct({ ...TIME_MIN, abi: "13_23" }), "comunidade");
check("time falha torneios 200_300", profileProduct({ ...TIME_MIN, torneiosMes: "200_300" }), "comunidade");
check("time falha objetivo profissional", profileProduct({ ...TIME_MIN, objetivo: "profissional" }), "comunidade");
check("time herda banca de comunidade", profileProduct({ ...TIME_MIN, banca: "lt_875" }), "protocolo");
check("ja_vive com tempo lt_1 → bases", profileProduct({ ...TIME_MIN, tempoJogo: "lt_1" }), "bases");

check("profileFromRaw valid", profileFromRaw({ ...TIME_MIN }), "time");
check("profileFromRaw quiz v1", profileFromRaw({ idade: "25_34", tempo: "mais_5", objetivo: "competitivo", abi: "lt_5", volume: "gt_300", banca: "876_2000" }), null);

// ---- Teste e final ---------------------------------------------------------
check("bucket 100", testBucket(100), "time");
check("bucket 70", testBucket(70), "time");
check("bucket 69", testBucket(69), "comunidade");
check("bucket 50", testBucket(50), "comunidade");
check("bucket 49", testBucket(49), "comunidade_ou_protocolo");
check("bucket 0", testBucket(0), "comunidade_ou_protocolo");

check("final null profile", finalProduct(null, "time"), null);
check("final time/time", finalProduct("time", "time"), "time");
check("final time/comunidade", finalProduct("time", "comunidade"), "comunidade");
check("final time/cop", finalProduct("time", "comunidade_ou_protocolo"), "comunidade");
check("final comunidade/cop", finalProduct("comunidade", "comunidade_ou_protocolo"), "comunidade");
check("final protocolo/time", finalProduct("protocolo", "time"), "protocolo");
check("final protocolo/cop", finalProduct("protocolo", "comunidade_ou_protocolo"), "protocolo");
check("final bases/time", finalProduct("bases", "time"), "bases");

check("accuracy empty", accuracyPct([]), 0);
check("accuracy 2/3", accuracyPct([{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }]), 67);
check("accuracy 7/10", accuracyPct(Array.from({ length: 10 }, (_, i) => ({ isCorrect: i < 7 }))), 70);

// ---- describeProduct (admin) -----------------------------------------------
const row = (o: Partial<Parameters<typeof describeProduct>[0]>) => ({
  product_profile: null, product_test: null, product_final: null, quiz_answers: null, ...o,
});
check("describe final", describeProduct(row({ product_profile: "time", product_final: "comunidade" })), "Comunidade");
check("describe pendente", describeProduct(row({ product_profile: "protocolo" })), "Perfil: Protocolo · teste pendente");
check("describe fora do perfil", describeProduct(row({ quiz_answers: q({ objetivo: "diversao" }) })), "Fora do perfil");
check("describe lead antigo", describeProduct(row({ quiz_answers: { objetivo: "competitivo" } })), "—");
check("describe valor inválido", describeProduct(row({ product_final: "xx" })), "—");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All productFit checks passed");
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx tsx scripts/check-productFit.ts`
Expected: FAIL, erro de import (`productFit` não existe; exports novos de `leadScoring` ausentes).

- [ ] **Step 3: Reescrever `lib/poker/leadScoring.ts`**

Conteúdo completo:

```ts
// lib/poker/leadScoring.ts — Quiz do onboarding (v3, Nivelamento Light).
//
// Perguntas e opções copiadas do doc "TST | pesquisa lead scoring". A ordem
// das opções importa: `answerRank` (posição da opção) é o que as regras de
// produto em lib/poker/productFit.ts comparam.
//
// Substitui o v1 (lead score 0–25 com tempo/volume e banca em 8 faixas).

import type { ProfitGoal, StudyTime } from "./planStorage";

// ---------------------------------------------------------------------------
// Tipos das respostas
// ---------------------------------------------------------------------------

export type IdadeAnswer = "18_24" | "25_34" | "35_44" | "45_54" | "55_mais";
export type TempoJogoAnswer = "aprendendo" | "lt_1" | "1_3" | "3_5" | "gt_5";
export type ObjetivoAnswer =
  | "diversao"
  | "competir"
  | "renda_extra"
  | "profissional"
  | "ja_vive";
export type AbiAnswer = "nao_sei" | "lt_5" | "5_13" | "13_23" | "23_54" | "gt_54";
export type TorneiosMesAnswer = "nao_sei" | "lt_100" | "100_200" | "200_300" | "gt_300";
export type BancaAnswer =
  | "lt_875"
  | "875_2000"
  | "2001_5000"
  | "5001_10000"
  | "gt_10000";

export interface QuizAnswers {
  idade: IdadeAnswer;
  tempoJogo: TempoJogoAnswer;
  objetivo: ObjetivoAnswer;
  abi: AbiAnswer;
  torneiosMes: TorneiosMesAnswer;
  banca: BancaAnswer;
}

export type QuizKey = keyof QuizAnswers;

export interface QuizOption<T extends string> {
  value: T;
  label: string;
}

export interface QuizQuestion {
  key: QuizKey;
  title: string;
  sub?: string;
  options: readonly QuizOption<string>[];
}

// ---------------------------------------------------------------------------
// Opções (ordem = rank, do menor pro maior)
// ---------------------------------------------------------------------------

export const IDADE_OPTIONS: QuizOption<IdadeAnswer>[] = [
  { value: "18_24", label: "18 a 24 anos" },
  { value: "25_34", label: "25 a 34 anos" },
  { value: "35_44", label: "35 a 44 anos" },
  { value: "45_54", label: "45 a 54 anos" },
  { value: "55_mais", label: "55 anos ou mais" },
];

export const TEMPO_JOGO_OPTIONS: QuizOption<TempoJogoAnswer>[] = [
  { value: "aprendendo", label: "Estou aprendendo agora" },
  { value: "lt_1", label: "Há menos de 1 ano" },
  { value: "1_3", label: "Entre 1 e 3 anos" },
  { value: "3_5", label: "Entre 3 e 5 anos" },
  { value: "gt_5", label: "Há mais de 5 anos" },
];

export const OBJETIVO_OPTIONS: QuizOption<ObjetivoAnswer>[] = [
  { value: "diversao", label: "Diversão, não me preocupo com resultado" },
  { value: "competir", label: "Competir, mas não pretendo viver do jogo" },
  { value: "renda_extra", label: "Renda extra, poder contar com os ganhos no jogo" },
  { value: "profissional", label: "Ser profissional, ter o jogo como renda principal" },
  { value: "ja_vive", label: "Já vivo do poker e quero crescer na carreira" },
];

export const ABI_OPTIONS: QuizOption<AbiAnswer>[] = [
  { value: "nao_sei", label: "Não sei" },
  { value: "lt_5", label: "Abaixo de $5" },
  { value: "5_13", label: "Entre $5 e $13" },
  { value: "13_23", label: "Entre $13 e $23" },
  { value: "23_54", label: "Entre $23 e $54" },
  { value: "gt_54", label: "Acima de $54" },
];

export const TORNEIOS_MES_OPTIONS: QuizOption<TorneiosMesAnswer>[] = [
  { value: "nao_sei", label: "Não sei" },
  { value: "lt_100", label: "Menos de 100 torneios" },
  { value: "100_200", label: "Entre 100 e 200 torneios" },
  { value: "200_300", label: "Entre 200 e 300 torneios" },
  { value: "gt_300", label: "Mais de 300 torneios" },
];

export const BANCA_OPTIONS: QuizOption<BancaAnswer>[] = [
  { value: "lt_875", label: "Menor que $875" },
  { value: "875_2000", label: "$875 a $2.000" },
  { value: "2001_5000", label: "$2.001 a $5.000" },
  { value: "5001_10000", label: "$5.001 a $10.000" },
  { value: "gt_10000", label: "Maior que $10.000" },
];

/** Perguntas na ordem do form (uma tela cada, depois da identidade). */
export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  { key: "idade", title: "Qual é a sua idade?", options: IDADE_OPTIONS },
  { key: "tempoJogo", title: "Há quanto tempo você joga poker?", options: TEMPO_JOGO_OPTIONS },
  { key: "objetivo", title: "Qual é o seu objetivo no poker?", options: OBJETIVO_OPTIONS },
  {
    key: "abi",
    title:
      "Segundo o Sharkscope, qual é o seu ABI (buy-in médio) em dólares nos últimos 6 meses?",
    options: ABI_OPTIONS,
  },
  {
    key: "torneiosMes",
    title:
      "Segundo o Sharkscope, quantos torneios você joga por mês atualmente (pode ser a média dos últimos 6 meses)?",
    options: TORNEIOS_MES_OPTIONS,
  },
  {
    key: "banca",
    title: "Qual é a sua banca (em dólares) neste momento?",
    sub:
      "Lembre-se: sua banca (bankroll) não é apenas o que você tem nas suas contas de cada site hoje, mas todo o dinheiro que você tem disponível para o poker. Caso você tenha condições de depositar mais (mesmo que não faça isso agora), some esse valor ao que você já tem nos sites.",
    options: BANCA_OPTIONS,
  },
];

const OPTIONS_BY_KEY: Record<QuizKey, readonly QuizOption<string>[]> = {
  idade: IDADE_OPTIONS,
  tempoJogo: TEMPO_JOGO_OPTIONS,
  objetivo: OBJETIVO_OPTIONS,
  abi: ABI_OPTIONS,
  torneiosMes: TORNEIOS_MES_OPTIONS,
  banca: BANCA_OPTIONS,
};

/** Posição da opção na pergunta (0 = primeira). -1 quando inválida/ausente. */
export function answerRank(key: QuizKey, value: string | null | undefined): number {
  if (!value) return -1;
  return OPTIONS_BY_KEY[key].findIndex((o) => o.value === value);
}

/** Label human-readable da resposta, ou null se o valor não existe no quiz v3 (ex.: quiz v1). */
export function labelOf(key: QuizKey, value: string | null | undefined): string | null {
  if (!value) return null;
  return OPTIONS_BY_KEY[key].find((o) => o.value === value)?.label ?? null;
}

/**
 * Valida um payload vindo do cliente/banco. Retorna só as 6 chaves do quiz v3,
 * ou null se faltar alguma ou algum valor for desconhecido (ex.: quiz v1).
 */
export function parseQuizAnswers(raw: unknown): QuizAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(OPTIONS_BY_KEY) as QuizKey[]) {
    const v = r[key];
    if (typeof v !== "string" || answerRank(key, v) < 0) return null;
    out[key] = v;
  }
  return out as unknown as QuizAnswers;
}

// ---------------------------------------------------------------------------
// Derivações pro plano
// ---------------------------------------------------------------------------

/**
 * Stake recomendada (ABI USD) pela banca. Usa o piso de cada faixa na escala
 * interina anterior; todos os valores existem em GRADE_LINKS.
 */
export const BANCA_GRADE: Record<BancaAnswer, number> = {
  lt_875: 1,
  "875_2000": 2.5,
  "2001_5000": 4,
  "5001_10000": 10,
  gt_10000: 19,
};

export function computeStakeGrade(a: QuizAnswers): number {
  return BANCA_GRADE[a.banca];
}

/** Objetivo → profit_goal (mesmo mapa do v1; diversao cai em usd1k). */
export function objetivoToProfitGoal(objetivo: ObjetivoAnswer): ProfitGoal {
  switch (objetivo) {
    case "diversao":
    case "competir":
      return "usd1k";
    case "renda_extra":
      return "usd10k";
    case "ja_vive":
      return "usd50k";
    case "profissional":
      return "usd100k";
  }
}

/** Torneios/semana esperados = meio da faixa mensal ÷ 4. */
export const TORNEIOS_VOLUME_WEEKLY: Record<TorneiosMesAnswer, number> = {
  nao_sei: 25,
  lt_100: 20,
  "100_200": 38,
  "200_300": 63,
  gt_300: 88,
};

export function weeklyVolumeTarget(torneiosMes: TorneiosMesAnswer): number {
  return TORNEIOS_VOLUME_WEEKLY[torneiosMes];
}

/** Torneios/mês → studyTime (faixa de dedicação do plano). */
export function studyTimeFromTorneios(torneiosMes: TorneiosMesAnswer): StudyTime {
  switch (torneiosMes) {
    case "nao_sei":
    case "lt_100":
      return "ate15";
    case "100_200":
    case "200_300":
      return "ate40";
    case "gt_300":
      return "mais40";
  }
}
```

- [ ] **Step 4: Criar `lib/poker/productFit.ts`**

```ts
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
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx tsx scripts/check-productFit.ts`
Expected: `All productFit checks passed`

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add lib/poker/leadScoring.ts lib/poker/productFit.ts scripts/check-productFit.ts
git commit -m "feat(quiz): quiz v3 (lead scoring) + regras de product fit

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Form v3 + store + payloads do cliente + CSV das respostas

**Files:**
- Modify: `components/trainer/OnboardingForm.tsx` (do topo até o `}` que fecha `export function OnboardingForm`; os subcomponentes ficam)
- Modify: `lib/poker/diagnosticoStore.ts` (campos de lead score)
- Modify: `components/trainer/DiagnosticoScreen.tsx` (selectors, payloads de `/api/results` e `/api/leads`)
- Modify: `lib/admin/exportCsv.ts`
- Test: `scripts/check-exportCsv.ts`

**Interfaces:**
- Consumes (Task 1): `QUIZ_QUESTIONS`, `QuizAnswers`, `QuizKey`, `QuizOption`, `parseQuizAnswers`, `labelOf`, `computeStakeGrade`, `objetivoToProfitGoal`, `weeklyVolumeTarget`, `studyTimeFromTorneios`.
- Produces: `OnboardingData` sem `leadScore`/`leadCategory`; store sem `leadScore`/`leadCategory`; o cliente para de enviar `leadScore`/`leadCategory` para `/api/leads` e `/api/results`. `rowsToCsv(rows: DiagnosticRow[]): string` com as colunas do quiz v3 (a Task 4 acrescenta as de produto).

**Estado do `tsc` ao fim desta task:** só `app/api/leads/route.ts` e `app/api/results/route.ts` ainda têm erro, porque importam `TEMPO_OPTIONS`/`VOLUME_OPTIONS`/`LEAD_CATEGORY_LABELS`/`LeadCategory`. A Task 3 conserta.

- [ ] **Step 1: Escrever o teste do CSV que falha**

Criar `scripts/check-exportCsv.ts`:

```ts
// Verificação pura — roda com: npx tsx scripts/check-exportCsv.ts
import type { DiagnosticRow } from "../lib/supabase";
import { rowsToCsv } from "../lib/admin/exportCsv";

let failed = 0;
function expect(name: string, cond: boolean, detail = "") {
  if (!cond) {
    console.error(`FAIL ${name} ${detail}`);
    failed++;
  }
}

const baseRow = {
  id: "abc",
  created_at: "2026-09-13T12:00:00Z",
  player_name: "Léo",
  email: "leo@x.com",
  phone: "+5511999999999",
  study_time: "ate40",
  profit_goal: "usd10k",
  stopped_early: false,
  spots_played: 2,
  spots_failed: 0,
  spot_summaries: [],
  results: [],
  sharkscope_username: null,
  sharkscope_network: null,
  sharkscope_playergroup_id: null,
  sharkscope_last_sync: null,
  sharkscope_summary: null,
  volume_target_weekly: 38,
  lead_score: null,
  lead_category: null,
  stake_grade: 2.5,
  product_profile: null,
  product_test: null,
  product_final: null,
  previous_diagnostic_id: null,
  quiz_answers: {
    idade: "25_34",
    tempoJogo: "gt_5",
    objetivo: "profissional",
    abi: "lt_5",
    torneiosMes: "100_200",
    banca: "875_2000",
  },
} as unknown as DiagnosticRow;

const csv = rowsToCsv([baseRow]);
const [header, line] = csv.split("\n");
const cols = header.split(",");

for (const h of ["Idade", "Tempo de jogo", "Objetivo", "ABI", "Torneios/mês", "Banca"]) {
  expect(`header has ${h}`, cols.includes(h), header);
}
for (const h of ["Categoria Lead", "Lead Score", "Tempo Jogando", "Volume/mês"]) {
  expect(`header dropped ${h}`, !cols.includes(h), header);
}
expect("row has idade label", line.includes("25 a 34 anos"), line);
expect("row has tempo label", line.includes("Há mais de 5 anos"), line);
expect("row has objetivo label", line.includes("Ser profissional, ter o jogo como renda principal"), line);
expect("row has banca label", line.includes("$875 a $2.000"), line);
expect("row has torneios label", line.includes("Entre 100 e 200 torneios"), line);

// Lead do quiz v1 (valores antigos) não quebra: cai no valor cru.
const legacy = {
  ...baseRow,
  quiz_answers: { idade: "55_plus", tempo: "mais_5", objetivo: "competitivo", volume: "gt_300", banca: "876_2000" },
} as unknown as DiagnosticRow;
const legacyLine = rowsToCsv([legacy]).split("\n")[1];
expect("legacy objetivo raw", legacyLine.includes("competitivo"), legacyLine);
expect("legacy idade raw", legacyLine.includes("55_plus"), legacyLine);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All exportCsv checks passed");
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx tsx scripts/check-exportCsv.ts`
Expected: FAIL. Ou o import de `LEAD_CATEGORY_LABELS`/`TEMPO_OPTIONS` quebra em `exportCsv.ts`, ou os headers novos estão ausentes.

- [ ] **Step 3: Atualizar `lib/admin/exportCsv.ts`**

Substituir o bloco de imports de `@/lib/poker/leadScoring` por:

```ts
import { QUIZ_QUESTIONS, labelOf, type QuizKey } from "@/lib/poker/leadScoring";
```

Remover a função local `labelOf`. Depois de `PROFIT_LABELS`, acrescentar:

```ts
const QUIZ_HEADERS: Record<QuizKey, string> = {
  idade: "Idade",
  tempoJogo: "Tempo de jogo",
  objetivo: "Objetivo",
  abi: "ABI",
  torneiosMes: "Torneios/mês",
  banca: "Banca",
};

/** Label do quiz v3; lead do quiz v1 cai no valor cru. */
function quizCell(quiz: Record<string, string>, key: QuizKey): string {
  const raw = quiz[key];
  return labelOf(key, raw) ?? raw ?? "";
}
```

Substituir `HEADERS` por:

```ts
const HEADERS: string[] = [
  "Data",
  "Nome",
  "Email",
  "Telefone",
  "Stake Grade (USD)",
  ...QUIZ_QUESTIONS.map((q) => QUIZ_HEADERS[q.key]),
  "Meta de Profit",
  "Tempo de Estudo",
  "Volume Target (semana)",
  "Spots Jogados",
  "Spots Reprovados",
  "Média Acerto (%)",
  "Early Stop",
  "Sharkscope Nick",
  "Sharkscope Network",
  "Sharkscope Group",
  "ROI Médio (Sharkscope)",
  "Diagnostic ID",
];
```

Substituir `rowToCells` por:

```ts
function rowToCells(row: DiagnosticRow): string[] {
  const quiz = (row.quiz_answers ?? {}) as Record<string, string>;
  return [
    fmtDate(row.created_at),
    row.player_name ?? "",
    row.email ?? "",
    row.phone ?? "",
    row.stake_grade?.toString() ?? "",
    ...QUIZ_QUESTIONS.map((q) => quizCell(quiz, q.key)),
    PROFIT_LABELS[row.profit_goal ?? ""] ?? row.profit_goal ?? "",
    STUDY_LABELS[row.study_time ?? ""] ?? row.study_time ?? "",
    row.volume_target_weekly?.toString() ?? "",
    row.spots_played?.toString() ?? "0",
    row.spots_failed?.toString() ?? "0",
    avgAccuracy(row).toString(),
    row.stopped_early ? "Sim" : "Não",
    row.sharkscope_username ?? "",
    row.sharkscope_network ?? "",
    row.sharkscope_playergroup_id ?? "",
    row.sharkscope_summary?.avgRoi != null
      ? `${row.sharkscope_summary.avgRoi.toFixed(1)}%`
      : "",
    row.id,
  ];
}
```

(Para quem lê o legado: o quiz v1 grava `tempo`/`volume`. As colunas "Tempo de jogo" e "Torneios/mês" ficam vazias para essas linhas, e isso é aceito.)

- [ ] **Step 4: Rodar o teste do CSV**

Run: `npx tsx scripts/check-exportCsv.ts`
Expected: `All exportCsv checks passed`

- [ ] **Step 5: Reescrever o topo de `OnboardingForm.tsx`**

Substituir tudo desde a primeira linha até o `}` que fecha `export function OnboardingForm` (logo antes do comentário `// Subcomponentes`). `StepWrapper`, `Title`, `Sub`, `ProgressBar`, `inputClass`, `phoneInputClass`, `Field`, `QuestionOptions`, `NextButton` e `BackBar` ficam como estão.

```tsx
"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Logo } from "@/components/Logo";
import type { ProfitGoal, StudyTime } from "@/lib/poker/planStorage";
import {
  QUIZ_QUESTIONS,
  computeStakeGrade,
  objetivoToProfitGoal,
  parseQuizAnswers,
  studyTimeFromTorneios,
  weeklyVolumeTarget,
  type QuizAnswers,
  type QuizKey,
  type QuizOption,
} from "@/lib/poker/leadScoring";

export interface OnboardingData {
  playerName: string;
  email: string;
  phone: string;
  notifyChannels: string[];
  whatsappPhone: string | null;
  quizAnswers: QuizAnswers;
  stakeGrade: number;
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  volumeTargetWeekly: number;
}

interface Props {
  onSubmit: (data: OnboardingData) => void;
}

const TOTAL_STEPS = 1 + QUIZ_QUESTIONS.length; // 1 identidade + 6 perguntas
const ADVANCE_DELAY_MS = 220;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return phone.length > 0 && isValidPhoneNumber(phone);
}

export function OnboardingForm({ onSubmit }: Props) {
  const [step, setStep] = useState(1);

  // Identidade
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Quiz (step N ≥ 2 = QUIZ_QUESTIONS[N - 2])
  const [answers, setAnswers] = useState<Partial<Record<QuizKey, string>>>({});

  const identityValid =
    playerName.trim().length >= 2 &&
    isValidEmail(email) &&
    isValidPhone(phone);

  const finalSubmit = (complete: Partial<Record<QuizKey, string>>) => {
    const quiz = parseQuizAnswers(complete);
    if (!quiz) return;

    onSubmit({
      playerName: playerName.trim(),
      email: email.trim().toLowerCase(),
      phone,
      notifyChannels: ["email"],
      whatsappPhone: null,
      quizAnswers: quiz,
      stakeGrade: computeStakeGrade(quiz),
      studyTime: studyTimeFromTorneios(quiz.torneiosMes),
      profitGoal: objetivoToProfitGoal(quiz.objetivo),
      volumeTargetWeekly: weeklyVolumeTarget(quiz.torneiosMes),
    });
  };

  /** Seta a resposta e avança pro próximo step (ou envia, na última). */
  const answerAndAdvance = (key: QuizKey) => (value: string) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    setTimeout(() => {
      if (step === TOTAL_STEPS) finalSubmit(next);
      else setStep(step + 1);
    }, ADVANCE_DELAY_MS);
  };

  const question = step >= 2 ? (QUIZ_QUESTIONS[step - 2] ?? null) : null;

  return (
    <div className="bg-starfield glow-amber-bottom relative min-h-screen overflow-hidden text-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-amber-400/8 blur-[140px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16">
        <Logo size="md" className="mb-6" />

        <ProgressBar current={step} total={TOTAL_STEPS} />

        <AnimatePresence mode="wait">
          {step === 1 && (
            <StepWrapper key="identidade">
              <Title>Preencha suas informações</Title>
              <Sub>Personalizamos sua experiência. Leva 2 minutos.</Sub>

              <div className="mt-10 space-y-6">
                <Field label="Seu nome">
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Ex: Léo"
                    className={inputClass}
                    autoFocus
                  />
                </Field>
                <Field label="E-mail">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className={inputClass}
                    inputMode="email"
                    autoComplete="email"
                    required
                  />
                </Field>
                <Field label="WhatsApp">
                  <PhoneInput
                    international
                    defaultCountry="BR"
                    countryCallingCodeEditable={false}
                    value={phone}
                    onChange={(value) => setPhone(value ?? "")}
                    placeholder="(11) 99999-9999"
                    className={phoneInputClass}
                    numberInputProps={{ className: inputClass }}
                    autoComplete="tel"
                  />
                </Field>
              </div>

              <div className="mt-10 flex justify-end">
                <NextButton
                  disabled={!identityValid}
                  onClick={() => setStep(2)}
                  label="Continuar →"
                />
              </div>
            </StepWrapper>
          )}

          {question && (
            <StepWrapper key={question.key}>
              <Title>{question.title}</Title>
              {question.sub && <Sub>{question.sub}</Sub>}
              <QuestionOptions
                options={[...question.options] as QuizOption<string>[]}
                value={answers[question.key] ?? null}
                onChange={answerAndAdvance(question.key)}
              />
              <BackBar onBack={() => setStep(step - 1)} />
            </StepWrapper>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

(`useMemo` continua importado porque `QuestionOptions` usa. `Dispatch`/`SetStateAction` e os imports de `*_OPTIONS`/`computeLead*` saem.)

- [ ] **Step 6: Remover lead score do store (`lib/poker/diagnosticoStore.ts`)**

6a. Import:

```ts
import type { LeadCategory, QuizAnswers } from "./leadScoring";
```
→
```ts
import type { QuizAnswers } from "./leadScoring";
```

6b. Na interface `DiagnosticoState`, trocar:

```ts
  // Lead scoring (computed antes do teste, persistido pra usar no /api/results)
  quizAnswers: QuizAnswers | null;
  leadScore: number;
  leadCategory: LeadCategory | null;
  stakeGrade: number;
```
por:
```ts
  // Quiz (computed antes do teste, persistido pra usar no /api/results)
  quizAnswers: QuizAnswers | null;
  stakeGrade: number;
```

6c. No tipo do parâmetro de `setOnboarding`, remover as linhas `leadScore: number;` e `leadCategory: LeadCategory;`.

6d. No estado inicial, remover `leadScore: 0,` e `leadCategory: null,`.

6e. Em `setOnboarding: ({ ... }) => set({ ... })`, remover `leadScore,` e `leadCategory,` da desestruturação e do `set`.

- [ ] **Step 7: Remover lead score do `DiagnosticoScreen.tsx`**

7a. Remover os dois selectors:

```ts
  const leadScore = useDiagnosticoStore((s) => s.leadScore);
  const leadCategory = useDiagnosticoStore((s) => s.leadCategory);
```

7b. No `body` do POST de elite (`allPassed`) e no do POST normal de `/api/results`, remover as linhas `leadScore,` e `leadCategory,`.

7c. No array de dependências do `useEffect` de conclusão, trocar `quizAnswers, leadScore, leadCategory, stakeGrade, leadId, previousLeadId]);` por `quizAnswers, stakeGrade, leadId, previousLeadId]);`.

7d. No `body` do `fetch("/api/leads")`, remover `leadScore: data.leadScore,` e `leadCategory: data.leadCategory,`.

- [ ] **Step 8: Typecheck parcial e lint**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "app/api/leads/route.ts\|app/api/results/route.ts"`
Expected: saída vazia (os únicos erros restantes são das duas rotas).

Run: `npx eslint components/trainer/OnboardingForm.tsx components/trainer/DiagnosticoScreen.tsx lib/poker/diagnosticoStore.ts lib/admin/exportCsv.ts lib/poker/leadScoring.ts lib/poker/productFit.ts`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add components/trainer/OnboardingForm.tsx components/trainer/DiagnosticoScreen.tsx lib/poker/diagnosticoStore.ts lib/admin/exportCsv.ts scripts/check-exportCsv.ts
git commit -m "feat(onboarding): form v3 com as 6 perguntas do doc, sem lead score + CSV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Migration 016 + product fit gravado em /api/leads e /api/results

**Files:**
- Create: `supabase/migrations/016_product_fit.sql`
- Modify: `lib/supabase.ts` (`DiagnosticRow`)
- Modify: `app/api/leads/route.ts`
- Modify: `app/api/results/route.ts`

**Interfaces:**
- Consumes (Task 1): `parseQuizAnswers`, `QUIZ_QUESTIONS`, `labelOf`, `computeStakeGrade`, `objetivoToProfitGoal`, `studyTimeFromTorneios`, `weeklyVolumeTarget`, `QuizAnswers`; `profileProduct`, `profileFromRaw`, `testBucket`, `finalProduct`, `accuracyPct`, `Product`, `TestBucket`.
- Produces:
  - Colunas `product_profile`, `product_test`, `product_final` em `reglife_diagnostic_results` e em `DiagnosticRow` (`string | null` cada). `lead_score`/`lead_category` passam a gravar `null`.
  - Webhook `lead.quiz_submitted`: sai `leadScore`/`leadCategory`/`leadCategoryLabel`; entra `productProfile`; `quiz` passa a ter as 6 chaves v3.
  - Webhook `diagnostic.completed`: `leadScoring` fica só com `{ stakeGrade, quiz }`; entra `productFit: { profile, test, final, accuracyPct }`.

A lógica já foi testada na Task 1. Aqui a verificação é typecheck + chamada real das rotas (Step 6).

Numeração: o `testecom19` só tem migrations até `011`. A nova é **016** de propósito, para não colidir com a 012–015 do `onboarding-ev`, que podem já estar aplicadas em prod.

- [ ] **Step 1: Criar a migration**

`supabase/migrations/016_product_fit.sql`:

```sql
-- ============================================================
-- RegLife — Migration 016: Product fit (Nivelamento Light)
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================
--
-- Produto indicado pro lead (admin-only):
--   product_profile → pelo questionário: bases | protocolo | comunidade | time
--                     (null = fora do perfil ou lead legacy)
--   product_test    → pelo % do nivelamento: time | comunidade | comunidade_ou_protocolo
--                     (null = teste não concluído)
--   product_final   → min(perfil, teste): bases | protocolo | comunidade | time
--
-- Substitui o lead score (lead_score/lead_category continuam existindo, mas
-- o código passa a gravar null).
-- Numerada 016 (e não 012) pra não colidir com 012–015 do branch onboarding-ev.
-- Sem CHECK constraint: valores validados no código (lib/poker/productFit.ts).
-- Sem esta migration aplicada, /api/leads e /api/results dão 500
-- ("column does not exist").

alter table public.reglife_diagnostic_results
  add column if not exists product_profile text,
  add column if not exists product_test text,
  add column if not exists product_final text;

comment on column public.reglife_diagnostic_results.product_profile is
  'Produto pelo questionário (bases/protocolo/comunidade/time). null = fora do perfil ou lead legacy.';

comment on column public.reglife_diagnostic_results.product_test is
  'Bucket do nivelamento (time/comunidade/comunidade_ou_protocolo). null = teste não concluído.';

comment on column public.reglife_diagnostic_results.product_final is
  'Produto final = min(perfil, teste). null = teste pendente ou fora do perfil.';
```

- [ ] **Step 2: Atualizar `DiagnosticRow` em `lib/supabase.ts`**

Logo depois de `stake_grade: number | null;`, acrescentar:

```ts
  /** Produto pelo questionário (lib/poker/productFit.ts). null = fora do perfil/legacy. */
  product_profile: string | null;
  /** Bucket do nivelamento: time | comunidade | comunidade_ou_protocolo. */
  product_test: string | null;
  /** min(perfil, teste). */
  product_final: string | null;
```

E trocar o comentário `// Lead scoring (admin-only)` por `// Lead scoring legado (grava null) + quiz (admin-only)`.

- [ ] **Step 3: Atualizar `app/api/leads/route.ts`**

3a. Substituir o bloco `import { ABI_OPTIONS, ..., type LeadCategory } from "@/lib/poker/leadScoring";` por:

```ts
import {
  QUIZ_QUESTIONS,
  computeStakeGrade,
  labelOf,
  objetivoToProfitGoal,
  parseQuizAnswers,
  studyTimeFromTorneios,
  weeklyVolumeTarget,
  type QuizAnswers,
} from "@/lib/poker/leadScoring";
import { profileProduct, type Product } from "@/lib/poker/productFit";
```

3b. Substituir a função local `labelOf` e a `enrichQuiz` (com o doc-comment dela) por:

```ts
/**
 * Enriquece as respostas do quiz v3 com labels human-readable, pro n8n
 * não precisar mapear de "25_34" pra "25 a 34 anos" lá do outro lado.
 */
function enrichQuiz(answers: QuizAnswers) {
  return Object.fromEntries(
    QUIZ_QUESTIONS.map((q) => [
      q.key,
      { value: answers[q.key], label: labelOf(q.key, answers[q.key]) },
    ])
  );
}
```

3c. Em `interface WebhookPayload`, trocar:

```ts
  leadScore: number | null;
  leadCategory: LeadCategory | null;
  leadCategoryLabel: string | null;
  stakeGrade: number | null;
```
por:
```ts
  stakeGrade: number;
  productProfile: Product | null;
```

3d. No `POST`, remover os blocos `const volumeTarget = ...`, `const quizAnswers = ...`, `const leadScore = ...`, `const leadCategory = ...` e `const stakeGrade = ...`. Logo depois de `const body = await req.json();`, inserir:

```ts
  // Quiz v3: validado e todas as derivações recalculadas no servidor —
  // não confia no que o cliente mandou pra plano/produto.
  const quizAnswers = parseQuizAnswers(body.quizAnswers);
  if (!quizAnswers) {
    return NextResponse.json({ error: "quizAnswers inválido" }, { status: 400 });
  }
  const stakeGrade = computeStakeGrade(quizAnswers);
  const profitGoal = objetivoToProfitGoal(quizAnswers.objetivo);
  const studyTime = studyTimeFromTorneios(quizAnswers.torneiosMes);
  const volumeTarget = weeklyVolumeTarget(quizAnswers.torneiosMes);
  const productProfile = profileProduct(quizAnswers);
```

3e. No objeto do `.insert([{...}])`, trocar as linhas de `study_time` até `stake_grade` por:

```ts
        study_time: studyTime,
        profit_goal: profitGoal,
        volume_target_weekly: volumeTarget,
        notify_channels: notifyChannels,
        whatsapp_phone: whatsappPhone,
        quiz_answers: quizAnswers,
        lead_score: null,
        lead_category: null,
        stake_grade: stakeGrade,
        product_profile: productProfile,
```

3f. No `const payload: WebhookPayload = {...}`, trocar o trecho de `leadScore,` até o fim de `legacy: {...},` por:

```ts
    stakeGrade,
    productProfile,
    quiz: enrichQuiz(quizAnswers),
    preferences: {
      notifyChannels,
      whatsappPhone,
    },
    legacy: {
      profitGoal,
      studyTime,
      volumeTargetWeekly: volumeTarget,
    },
```

3g. No doc-comment do topo, trocar "dados de identidade, canais e quiz (lead score)" por "dados de identidade, canais, quiz v3 e produto pelo perfil (product_profile)".

- [ ] **Step 4: Atualizar `app/api/results/route.ts`**

4a. Trocar `import { LEAD_CATEGORY_LABELS } from "@/lib/poker/leadScoring";` por:

```ts
import {
  accuracyPct,
  finalProduct,
  profileFromRaw,
  testBucket,
  type Product,
  type TestBucket,
} from "@/lib/poker/productFit";
```

4b. Em `interface ResultsWebhookPayload`, trocar o bloco `leadScoring: {...};` por:

```ts
  leadScoring: {
    stakeGrade: number | null;
    quiz: Record<string, string> | null;
  };
  productFit: {
    profile: Product | null;
    test: TestBucket | null;
    final: Product | null;
    accuracyPct: number;
  };
```

4c. Trocar o comentário `// Lead scoring (admin-side, lead não vê)` por `// Quiz + stake grade (admin-side, lead não vê)` e remover os blocos `const leadScore = ...` e `const leadCategory = ...`.

4d. Logo depois do bloco `const previousDiagnosticId = ...;` e antes de `let diagnosticId: string;`, inserir:

```ts
  // Product fit (admin-only): % sobre as mãos jogadas (com early stop conta
  // só o que foi jogado). Sem mãos → teste não concluído, fica null.
  const playedResults: { isCorrect?: boolean }[] = Array.isArray(body.results)
    ? body.results
    : [];
  const testPct = accuracyPct(playedResults);
  const productTest: TestBucket | null =
    playedResults.length > 0 ? testBucket(testPct) : null;
  let productProfile: Product | null = null;
```

4e. No ramo `if (existingId)`, logo depois de `if (!session.ok) return session.response;`, inserir:

```ts
    // Perfil vem do quiz gravado pelo /api/leads (fonte de verdade da linha).
    const { data: leadRow } = await supabase
      .from("reglife_diagnostic_results")
      .select("quiz_answers")
      .eq("id", existingId)
      .maybeSingle();
    productProfile = profileFromRaw(leadRow?.quiz_answers ?? quizAnswers);
```

E no `.update({...})` desse ramo, depois de `whatsapp_phone: whatsappPhone,`, acrescentar:

```ts
        product_test: productTest,
        product_final: productTest ? finalProduct(productProfile, productTest) : null,
```

4f. No ramo `else` (INSERT legado), antes de `const { data, error } = await supabase`, inserir:

```ts
    productProfile = profileFromRaw(quizAnswers);
```

E no objeto do `.insert([{...}])`, trocar:

```ts
          lead_score: leadScore,
          lead_category: leadCategory,
          stake_grade: stakeGrade,
```
por:
```ts
          lead_score: null,
          lead_category: null,
          stake_grade: stakeGrade,
          product_profile: productProfile,
          product_test: productTest,
          product_final: productTest ? finalProduct(productProfile, productTest) : null,
```

4g. No `const webhookPayload: ResultsWebhookPayload = {...}`, trocar o bloco `leadScoring: {...},` por:

```ts
      leadScoring: {
        stakeGrade,
        quiz: quizAnswers as Record<string, string> | null,
      },
      productFit: {
        profile: productProfile,
        test: productTest,
        final: productTest ? finalProduct(productProfile, productTest) : null,
        accuracyPct: testPct,
      },
```

- [ ] **Step 5: Typecheck, lint e testes puros**

Run: `npx tsc --noEmit`
Expected: sem erros (agora o projeto todo compila).

Run: `npm run lint`
Expected: sem erros novos.

Run: `npx tsx scripts/check-productFit.ts && npx tsx scripts/check-exportCsv.ts`
Expected: os dois passam.

- [ ] **Step 6: Verificação no navegador contra o banco de dev**

Pré-requisito: a migration 016 aplicada no Supabase que o `.env.local` aponta. Se não estiver, **parar e pedir ao usuário** para rodar `supabase/migrations/016_product_fit.sql` no SQL Editor desse projeto. Não aplicar por conta própria.

Com o dev server rodando (preview do app, `npm run dev`):
1. Abrir `/diagnostico`. Conferir:
   - 7 passos ("Passo N de 7");
   - as 6 perguntas na ordem Idade → Tempo de jogo → Objetivo → ABI → Torneios/mês → Banca, com os textos do spec e o texto "Lembre-se…" na Banca;
   - cada opção avança sozinha e "← Voltar" mantém a resposta marcada;
   - a última (Banca) envia e leva à introdução do teste.
2. Responder com perfil Time: tempo "Há mais de 5 anos", objetivo "Já vivo…", ABI "Entre $23 e $54", torneios "Mais de 300", banca "$875 a $2.000". No painel de rede, `POST /api/leads` → 201.
3. Jogar até o fim (ou até o early stop). `POST /api/results` → 201.
4. Via `GET /api/results`, filtrando a linha pelo email usado, confirmar:
   - `product_profile = "time"`;
   - `lead_score = null`;
   - `product_test`/`product_final` coerentes com o % de acerto das mãos jogadas.
5. `POST /api/leads` com `quizAnswers: { objetivo: "competitivo" }` (quiz v1) → 400 `quizAnswers inválido`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add supabase/migrations/016_product_fit.sql lib/supabase.ts app/api/leads/route.ts app/api/results/route.ts
git commit -m "feat(product-fit): migration 016 + perfil/teste/final em leads e results (sai lead score)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Produto no admin (lista, detalhe) e no CSV

**Files:**
- Modify: `app/admin/page.tsx` (const `LEAD_BADGE`, thead "Lead", td do lead)
- Modify: `app/admin/resultado/[id]/page.tsx` (imports + card antes de `{/* Spot summary grid */}`)
- Modify: `lib/admin/exportCsv.ts`
- Test: `scripts/check-exportCsv.ts`

**Interfaces:**
- Consumes: `describeProduct`, `isProduct`, `isTestBucket`, `PRODUCT_LABELS`, `TEST_BUCKET_LABELS`, `accuracyPct` (Task 1); `parseQuizAnswers` (Task 1); colunas de `DiagnosticRow` (Task 3).
- Produces: UI admin + CSV com "Produto perfil", "Produto teste", "Produto final".

- [ ] **Step 1: Estender o teste do CSV (falha)**

Em `scripts/check-exportCsv.ts`, antes do bloco `if (failed > 0)`, acrescentar:

```ts
// ---- Produto -----------------------------------------------------------------
const productRow = {
  ...baseRow,
  product_profile: "time",
  product_test: "comunidade",
  product_final: "comunidade",
} as unknown as DiagnosticRow;
const [pHeader, pLine] = rowsToCsv([productRow]).split("\n");
const pCols = pHeader.split(",");
const pCells = pLine.split(",");
for (const h of ["Produto perfil", "Produto teste", "Produto final"]) {
  expect(`header has ${h}`, pCols.includes(h), pHeader);
}
expect("cell produto perfil", pCells[pCols.indexOf("Produto perfil")] === "Time", pLine);
expect("cell produto teste", pCells[pCols.indexOf("Produto teste")] === "Comunidade (50–69%)", pLine);
expect("cell produto final", pCells[pCols.indexOf("Produto final")] === "Comunidade", pLine);

const emptyCells = rowsToCsv([baseRow]).split("\n")[1].split(",");
expect("empty produto final", emptyCells[pCols.indexOf("Produto final")] === "", emptyCells.join(","));
```

(Nenhuma célula das linhas de teste tem vírgula antes das colunas de produto, então o `split(",")` simples é seguro aqui.)

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx tsx scripts/check-exportCsv.ts`
Expected: FAIL `header has Produto perfil`.

- [ ] **Step 3: Colunas de produto no CSV**

Em `lib/admin/exportCsv.ts`:

Import:

```ts
import {
  PRODUCT_LABELS,
  TEST_BUCKET_LABELS,
  isProduct,
  isTestBucket,
} from "@/lib/poker/productFit";
```

Em `HEADERS`, logo depois de `...QUIZ_QUESTIONS.map((q) => QUIZ_HEADERS[q.key]),`:

```ts
  "Produto perfil",
  "Produto teste",
  "Produto final",
```

Em `rowToCells`, logo depois de `...QUIZ_QUESTIONS.map((q) => quizCell(quiz, q.key)),`:

```ts
    isProduct(row.product_profile) ? PRODUCT_LABELS[row.product_profile] : "",
    isTestBucket(row.product_test) ? TEST_BUCKET_LABELS[row.product_test] : "",
    isProduct(row.product_final) ? PRODUCT_LABELS[row.product_final] : "",
```

- [ ] **Step 4: Rodar o teste**

Run: `npx tsx scripts/check-exportCsv.ts`
Expected: `All exportCsv checks passed`

- [ ] **Step 5: Coluna "Produto" substitui "Lead" na lista do admin**

Em `app/admin/page.tsx`:

5a. Import (junto dos outros):

```ts
import { describeProduct, isProduct } from "@/lib/poker/productFit";
```

5b. Remover a constante `LEAD_BADGE` inteira (`const LEAD_BADGE: Record<...> = { super_quente: ..., frio: ... };`).

5c. No `<thead>`, trocar `<th className="px-4 py-3 text-center">Lead</th>` por `<th className="px-4 py-3 text-center">Produto</th>`.

5d. No `<tbody>`, substituir o `<td className="px-4 py-3 text-center">` que começa com `{row.lead_category && LEAD_BADGE[row.lead_category] ? (` (até o `</td>` correspondente) por:

```tsx
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className={`text-xs ${
                            isProduct(row.product_final)
                              ? "font-semibold text-emerald-300"
                              : "text-neutral-500"
                          }`}
                        >
                          {describeProduct(row)}
                        </span>
                        {row.stake_grade != null && (
                          <span className="text-[10px] text-neutral-600 tabular-nums">
                            ${row.stake_grade}
                          </span>
                        )}
                      </div>
                    </td>
```

O `colSpan={10}` continua 10, porque é o mesmo número de colunas.

- [ ] **Step 6: Card "Produto indicado" no detalhe**

Em `app/admin/resultado/[id]/page.tsx`:

Imports:

```ts
import { parseQuizAnswers } from "@/lib/poker/leadScoring";
import {
  PRODUCT_LABELS,
  TEST_BUCKET_LABELS,
  accuracyPct,
  isProduct,
  isTestBucket,
} from "@/lib/poker/productFit";
```

Logo antes de `{/* Spot summary grid */}`, inserir:

```tsx
        {/* Produto indicado (admin-only) */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Perfil (questionário)</p>
            <p className="font-semibold">
              {/* Quiz v3 válido sem perfil = fora do perfil; quiz v1 = "—" */}
              {isProduct(row.product_profile)
                ? PRODUCT_LABELS[row.product_profile]
                : parseQuizAnswers(row.quiz_answers)
                  ? "Fora do perfil"
                  : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Nivelamento</p>
            <p className="font-semibold">
              {isTestBucket(row.product_test) ? TEST_BUCKET_LABELS[row.product_test] : "Pendente"}
            </p>
            {row.results.length > 0 && (
              <p className="text-xs text-neutral-500">{accuracyPct(row.results)}% de acerto nas mãos jogadas</p>
            )}
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Produto final</p>
            <p className="text-2xl font-black text-emerald-300">
              {isProduct(row.product_final) ? PRODUCT_LABELS[row.product_final] : "—"}
            </p>
          </div>
        </div>
```

- [ ] **Step 7: Typecheck, lint e navegador**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run lint` → sem erros novos.

No navegador (`/admin`, com as credenciais de admin do `.env.local`):
- coluna "Produto" no lugar de "Lead", mostrando o lead da Task 3;
- um lead antigo (quiz v1) com "—";
- o detalhe `/admin/resultado/<id>` com o card preenchido;
- "Exportar CSV" com as colunas do quiz v3 e as 3 de produto.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add app/admin/page.tsx "app/admin/resultado/[id]/page.tsx" lib/admin/exportCsv.ts scripts/check-exportCsv.ts
git commit -m "feat(admin): produto indicado substitui lead score na lista, detalhe e CSV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Mãos do Nivelamento Light nos 16 JSONs

**Files:**
- Create: `scripts/nivelamento-light.data.ts`
- Create: `scripts/sync-nivelamento-light.ts`
- Create: `scripts/check-nivelamento-light.ts`
- Modify (gerado): os 16 `public/spots/reglife-*.json`
- Modify: `app/diagnostico/page.tsx` (comentário do topo)

**Interfaces:**
- Consumes: `ExpectedAnswer`, `SpotConfigFile` de `lib/poker/types.ts`; `validateSpotConfig`, `initializeDrillContext`, `createDrill` de `lib/poker/spotEngine.ts`.
- Produces: `NIVELAMENTO_LIGHT: DocModule[]`, `interface DocHand { pos: string; stack: number; vs?: string | string[]; board?: string; combos: string[]; answers: string[]; pot?: number; heroStack?: number }`, `interface DocModule { slug: string; tier: 1 | 2; hands: DocHand[] }`.

Independente das Tasks 1–4.

**Como o sync funciona:**
- Para cada mão do doc, o script procura no JSON atual uma entrada do **mesmo cenário**: mesma posição, stack e vilão(ões), com board do mesmo tamanho (mesma street). Prefere a de board idêntico.
- Clona o `spotConfig` dessa entrada (action history, botões por stack, pot, stacks).
- Aplica posição, stack, vilões, board, combos e respostas do doc.
- Se a mão definir `pot` ou `heroStack`, sobrescreve esses valores.
- Se não existir template, o script aborta com erro.

- [ ] **Step 1: Criar os dados (`scripts/nivelamento-light.data.ts`)**

Convenções:
- Posições como nos JSONs (`UTG1` = UTG+1).
- Boards com `-`.
- "Call" do SB GAP vira `LIMP`; "bet 33%" do Bet vs Missed vira `BET 30%`; "Cbet 33%" vira `CBET 1/3`; "X ou Y" vira `[X, Y]`.
- Pares com carta no board ficam com os combos explícitos (sem a carta do board).
- A mão impossível "Ac7c em AsAc7s" fica como `Ah7c` em `As-Ad-7s`.

```ts
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
```

- [ ] **Step 2: Escrever o check que falha (`scripts/check-nivelamento-light.ts`)**

```ts
// Verificação — roda com: npx tsx scripts/check-nivelamento-light.ts
// Confere que public/spots/*.json batem com scripts/nivelamento-light.data.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NIVELAMENTO_LIGHT, type DocHand } from "./nivelamento-light.data";
import {
  createDrill,
  initializeDrillContext,
  validateSpotConfig,
} from "../lib/poker/spotEngine";
import type { ExpectedAnswer, SpotConfigFile } from "../lib/poker/types";

const SPOTS_DIR = join(process.cwd(), "public", "spots");

let failed = 0;
function expect(name: string, cond: boolean, detail = "") {
  if (!cond) {
    console.error(`FAIL ${name} ${detail}`);
    failed++;
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function villainsOf(e: ExpectedAnswer): string[] {
  return e.villainPositions ?? (e.villainPosition ? [e.villainPosition] : []);
}
function docVillains(hand: DocHand): string[] {
  return hand.vs === undefined ? [] : Array.isArray(hand.vs) ? hand.vs : [hand.vs];
}
/** Um conjunto de cartas (board + mão) por combo específico (ex.: "AhKd"). */
function cardsOf(hand: DocHand): string[][] {
  const board = hand.board ? hand.board.split("-") : [];
  return hand.combos
    .filter((c) => /^([2-9TJQKA][cdhs]){2}$/.test(c))
    .map((c) => [...board, c.slice(0, 2), c.slice(2, 4)]);
}

// Cobertura: todo JSON de public/spots está nos dados e vice-versa.
const files = readdirSync(SPOTS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
expect("slugs cover public/spots", same([...files].sort(), NIVELAMENTO_LIGHT.map((m) => m.slug).sort()),
  `${files.join(",")}`);

const totals: Record<number, number> = { 1: 0, 2: 0 };

for (const mod of NIVELAMENTO_LIGHT) {
  const config = JSON.parse(readFileSync(join(SPOTS_DIR, `${mod.slug}.json`), "utf-8")) as SpotConfigFile;
  const tag = mod.slug;
  totals[mod.tier] += mod.hands.length;

  expect(`${tag} validateSpotConfig`, validateSpotConfig(config));
  expect(`${tag} tier`, config.tier === mod.tier, `got ${config.tier}`);
  expect(`${tag} mode ordered`, config.mode === "ordered", `got ${config.mode}`);
  expect(`${tag} sessionSize`, config.sessionSize === mod.hands.length, `got ${config.sessionSize}`);
  expect(`${tag} count`, config.expectedAnswers.length === mod.hands.length,
    `got ${config.expectedAnswers.length}, expected ${mod.hands.length}`);

  const ctx = initializeDrillContext(config);

  mod.hands.forEach((hand, i) => {
    const e = config.expectedAnswers[i];
    const at = `${tag}#${i + 1}`;
    if (!e) return;
    expect(`${at} position`, e.position === hand.pos, `got ${e.position}`);
    expect(`${at} stack`, e.stackSize === hand.stack, `got ${e.stackSize}`);
    expect(`${at} villains`, same(villainsOf(e), docVillains(hand)), `got ${villainsOf(e)}`);
    expect(`${at} board`, (e.board ?? "") === (hand.board ?? ""), `got ${e.board}`);
    expect(`${at} combos/answers`,
      same(e.expectedAnswers, [{ combos: hand.combos, answer: hand.answers }]),
      JSON.stringify(e.expectedAnswers));

    const buttons = (e.spotConfig?.actionButtons ?? config.actionButtons).map((b) => b.text);
    for (const a of hand.answers) {
      expect(`${at} answer "${a}" is a button`, buttons.includes(a), buttons.join("/"));
    }
    if (hand.pot !== undefined) {
      expect(`${at} pot`, e.spotConfig?.potSize === hand.pot && e.spotConfig?.currentPotSize === hand.pot,
        JSON.stringify(e.spotConfig));
    }
    if (hand.heroStack !== undefined) {
      expect(`${at} heroStack`,
        e.spotConfig?.heroStackSize === hand.heroStack && e.spotConfig?.villainStackSize === hand.heroStack,
        JSON.stringify(e.spotConfig));
    }
    for (const cards of cardsOf(hand)) {
      expect(`${at} no duplicate cards`, new Set(cards).size === cards.length, cards.join(","));
    }

    try {
      const drill = createDrill(ctx, { expectedAnswerIndex: i });
      expect(`${at} drill deals cards`, drill.cardsOnHand.length >= 4, drill.cardsOnHand);
    } catch (err) {
      expect(`${at} createDrill`, false, String(err));
    }
  });
}

expect("tier 1 total 115", totals[1] === 115, `got ${totals[1]}`);
expect("tier 2 total 75", totals[2] === 75, `got ${totals[2]}`);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All nivelamento-light checks passed");
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `npx tsx scripts/check-nivelamento-light.ts`
Expected: FAIL. Por exemplo, `reglife-rfi-prioridades mode ordered` (got sequential) e `count` (got 19, expected 15).

- [ ] **Step 4: Escrever o sync (`scripts/sync-nivelamento-light.ts`)**

```ts
// Regrava public/spots/*.json com as mãos do Nivelamento Light.
// Roda com: npx tsx scripts/sync-nivelamento-light.ts
//
// Pra cada mão do doc, clona o spotConfig de uma entrada existente do mesmo
// cenário (posição + stack + vilões + street) — assim action history, botões
// por stack, pot e stacks continuam os que já foram validados no trainer — e
// aplica board/combos/respostas/overrides do doc.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NIVELAMENTO_LIGHT, type DocHand } from "./nivelamento-light.data";
import type { ExpectedAnswer, SpotConfigFile } from "../lib/poker/types";

const SPOTS_DIR = join(process.cwd(), "public", "spots");

function villainsOf(e: ExpectedAnswer): string[] {
  return e.villainPositions ?? (e.villainPosition ? [e.villainPosition] : []);
}
function docVillains(hand: DocHand): string[] {
  return hand.vs === undefined ? [] : Array.isArray(hand.vs) ? hand.vs : [hand.vs];
}
const boardLen = (b: string | undefined) => (b ? b.split("-").length : 0);

function scenarioMatches(e: ExpectedAnswer, hand: DocHand): boolean {
  return (
    e.position === hand.pos &&
    e.stackSize === hand.stack &&
    villainsOf(e).join("+") === docVillains(hand).join("+") &&
    boardLen(e.board) === boardLen(hand.board)
  );
}

function buildEntry(slug: string, hand: DocHand, existing: ExpectedAnswer[]): ExpectedAnswer {
  const candidates = existing.filter((e) => scenarioMatches(e, hand));
  const template =
    candidates.find((e) => (e.board ?? "") === (hand.board ?? "")) ?? candidates[0];
  if (!template) {
    throw new Error(
      `[${slug}] sem template pra ${hand.pos} ${hand.stack}bb vs ${docVillains(hand).join("+") || "-"} board=${hand.board ?? "-"}`
    );
  }

  const entry: ExpectedAnswer = structuredClone(template);
  delete entry.id;
  entry.position = hand.pos;
  entry.stackSize = hand.stack;

  const villains = docVillains(hand);
  delete entry.villainPosition;
  delete entry.villainPositions;
  if (villains.length === 1) entry.villainPosition = villains[0];
  if (villains.length > 1) entry.villainPositions = villains;

  if (hand.board) entry.board = hand.board;
  else delete entry.board;

  if (hand.pot !== undefined) {
    entry.spotConfig = { ...entry.spotConfig, potSize: hand.pot, currentPotSize: hand.pot };
  }
  if (hand.heroStack !== undefined) {
    entry.spotConfig = {
      ...entry.spotConfig,
      heroStackSize: hand.heroStack,
      villainStackSize: hand.heroStack,
    };
  }

  entry.expectedAnswers = [{ combos: hand.combos, answer: hand.answers }];
  return entry;
}

for (const mod of NIVELAMENTO_LIGHT) {
  const path = join(SPOTS_DIR, `${mod.slug}.json`);
  const config = JSON.parse(readFileSync(path, "utf-8")) as SpotConfigFile;
  const existing = config.expectedAnswers;

  config.expectedAnswers = mod.hands.map((hand) => buildEntry(mod.slug, hand, existing));
  config.mode = "ordered";
  config.sessionSize = config.expectedAnswers.length;
  config.tier = mod.tier;

  // Working copy usa CRLF (core.autocrlf=true) e 2 espaços.
  const out = JSON.stringify(config, null, 2).replace(/\n/g, "\r\n") + "\r\n";
  writeFileSync(path, out, "utf-8");
  console.log(`${mod.slug}: ${existing.length} → ${config.expectedAnswers.length} mãos`);
}
```

- [ ] **Step 5: Rodar o sync**

Run: `npx tsx scripts/sync-nivelamento-light.ts`
Expected: 16 linhas, sem erro. Por exemplo: `reglife-rfi-prioridades: 19 → 15 mãos`, `reglife-multiway-bb: 21 → 20 mãos`, `reglife-cbet-turn-river-vs-bb: 22 → 20 mãos`, `reglife-vs-rfi: 27 → 20 mãos`.

Se abortar com `sem template`, a mão do doc não tem cenário equivalente no JSON. **Não inventar spotConfig**: parar e reportar ao usuário a mão e o arquivo.

- [ ] **Step 6: Rodar o check**

Run: `npx tsx scripts/check-nivelamento-light.ts`
Expected: `All nivelamento-light checks passed`

- [ ] **Step 7: Conferir o diff dos JSONs**

Run: `git diff --stat public/spots`
Expected: 16 arquivos alterados.

Run: `git diff public/spots/reglife-cbet-turn-river-vs-bb.json`
Expected: `mode` virou `"ordered"`; `sessionSize` foi de 22 para 20; saíram TsTd (turn) e Kc8h (river); os turns de 30bb têm `heroStackSize`/`villainStackSize` 25.6; o resto é idêntico.

Se o diff mostrar mudanças só de fim de linha em blocos inteiros, conferir `git diff --ignore-cr-at-eol` e ajustar o `replace` de CRLF no sync.

- [ ] **Step 8: Atualizar o comentário de `app/diagnostico/page.tsx`**

Substituir o comentário acima de `TRAINER_SEQUENCE` por:

```ts
// Ordem do percurso = Nivelamento Light (190 mãos). Com early stop
// (3 spots reprovados) a maioria termina muito antes do final.
// Mãos: scripts/nivelamento-light.data.ts (sync + check em scripts/).
//
// Tier 1 (115):
//   RFI(15) → Cbet Flop vs BB(10) → Cbet Turn+River vs BB(20)
//   → Vs RFI(20) → Defesa de BB(10) → BW SB GAP(7) → BW SB vs ISO(5)
//   → BW BB vs Limp(8) → BW BB vs Raise(5) → Vs Cbet Flop BB(15)
// Tier 2 (75):
//   Multiway(20) → Vs 3bet EP(15) → Vs 3bet BTN(10)
//   → Cbet vs BTN(15) → Vs Cbet Flop BTN(10) → Bet vs Missed BTN(5)
```

- [ ] **Step 9: Scripts existentes continuam passando**

Run: `npx tsx scripts/test-engine.mts && npx tsx scripts/test-rfi.mts && npx tsx scripts/test-cbet-vs-bb.mts`
Expected: os três terminam com exit 0. Se algum falhar só por assumir o `mode: "sequential"` ou a contagem antiga, ajustar a expectativa do script e citar isso no commit; se falhar por outro motivo, parar e investigar.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add scripts/nivelamento-light.data.ts scripts/sync-nivelamento-light.ts scripts/check-nivelamento-light.ts public/spots app/diagnostico/page.tsx
git commit -m "feat(spots): mãos do Nivelamento Light nos 16 JSONs (ordered, 190 mãos)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verificação final

**Files:** nenhum novo (só correções que aparecerem).

- [ ] **Step 1: Todos os checks puros**

Run:

```bash
npx tsx scripts/check-productFit.ts && npx tsx scripts/check-exportCsv.ts && npx tsx scripts/check-nivelamento-light.ts && npx tsx scripts/test-engine.mts && npx tsx scripts/test-rfi.mts && npx tsx scripts/test-cbet-vs-bb.mts
```

Expected: todos passam.

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run lint` → sem erros novos.
Run: `npm run build` → build conclui.

- [ ] **Step 3: Resíduos do quiz v1 e do lead score**

Buscar com a ferramenta Grep por `computeLeadScore|computeLeadCategory|LEAD_CATEGORY_LABELS|LeadCategory|leadScore|leadCategory|LEAD_BADGE|TEMPO_OPTIONS|VOLUME_OPTIONS|volumeToWeeklyTarget|defaultStudyTime` em `app`, `components` e `lib`.
Expected: nenhum resultado. Os campos `lead_score`/`lead_category` em `DiagnosticRow` e nos inserts com `null` são esperados.

- [ ] **Step 4: Fluxo completo no navegador**

Com o dev server e a migration 016 aplicada no banco de dev:
1. `/diagnostico`: perfil **Protocolo** (tempo "Entre 1 e 3 anos", objetivo "Renda extra…", o resto nas primeiras opções). Errar de propósito até o early stop. `/admin` deve mostrar Produto "Protocolo".
2. Perfil **Time** (combinação da Task 3). Jogar a primeira mão do RFI e conferir que é LJ 15bb com 98s, na ordem do doc. Terminar o teste. O produto final deve bater com o % do card do detalhe (≥70 → Time; senão Comunidade).
3. Objetivo **Diversão**: admin mostra "Fora do perfil" antes e depois do teste.
4. Exportar CSV e conferir colunas Idade → Banca e Produto perfil/teste/final.
5. `/trainer/reglife-rfi-prioridades` (treino do plano): 15 mãos na ordem do doc.

- [ ] **Step 5: Handoff ao usuário**

Reportar:
- a migration `supabase/migrations/016_product_fit.sql` precisa ser aplicada manualmente no SQL Editor de **prod** antes do deploy (sem ela, `/api/leads` dá 500);
- o webhook do n8n mudou de shape: `quiz` usa as chaves v3 (`tempoJogo`, `torneiosMes`); entram `productProfile` e `productFit`; saem `leadScore`/`leadCategory`/`leadCategoryLabel` e `leadScoring.score/category`. As automações precisam ser ajustadas;
- o admin e o CSV não mostram mais lead score; o produto substitui;
- os pontos de revisão do spec (turn 100bb = 93; Ac7c; derivações de volume/stake).
```
