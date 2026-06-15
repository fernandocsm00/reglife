# Onboarding v2 — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformular o onboarding (6 steps) e a captura de dados — novas perguntas (Objetivo 4, Tempo horas+telas, Banca 13 faixas, Nicks multi-site), removendo Idade/Experiência/ABI/Volume e o lead score, com derivações travadas (profitGoal, volume, studyTime, stakeGrade interino).

**Architecture:** Rework do data-model do quiz: `leadScoring.ts` (root) muda tipos/opções/derivações; isso rippla por `OnboardingForm.tsx`, `diagnosticoStore.ts`, `DiagnosticoScreen.tsx`, `/api/leads`, `/api/results`. Migration adiciona 3 colunas. `playerTier`/`buildPlan` inalterados.

**Tech Stack:** Next.js (App Router — NÃO o Next.js padrão, ver `AGENTS.md`), TypeScript, motion/react, Zustand (store), Supabase. Sem suite de testes — validação via tsc/lint/build + smoke tsx + visual.

---

## Spec Reference

`docs/superpowers/specs/2026-06-15-onboarding-v2-fase1-design.md` (commit `8f69be6`).

## ⚠️ Escopo de diretório

Existem DUAS cópias no disco: `reglife\` (working dir — **a ativa**) e `reglife-trainer\` (cópia paralela). **TODAS as mudanças são só em `reglife\`.** Nunca tocar `reglife-trainer\`.

## File Structure

| Path (em `reglife/`) | Status | Responsabilidade |
|---|---|---|
| `lib/poker/leadScoring.ts` | rewrite | Tipos/opções do quiz + derivações (profitGoal, stakeGrade interino, volume, studyTime). Remove lead score. |
| `components/trainer/OnboardingForm.tsx` | rework | Form 6 steps + `OnboardingData` + finalSubmit. |
| `lib/poker/diagnosticoStore.ts` | modify | Remove leadScore/leadCategory; quizAnswers→{objetivo,banca}. |
| `components/trainer/DiagnosticoScreen.tsx` | modify | Para de ler/enviar leadScore/leadCategory; envia weeklyHours/tables/sharkscopeNicks no POST /api/leads. |
| `app/api/leads/route.ts` | modify | Persiste colunas novas; webhook novo; enrichQuiz reduzido. |
| `app/api/results/route.ts` | modify | Para de gravar lead_score/lead_category (null); remove LEAD_CATEGORY_LABELS. |
| `supabase/migrations/015_onboarding_v2.sql` | create | +weekly_hours, +tables, +sharkscope_nicks. |

**Decisão YAGNI:** `weeklyHours`/`tables` vão só pro DB (via `/api/leads`), **não** pro `SavedPlan`/`buildPlan` (nenhum consumidor na Fase 1). O spec mencionou como opcional; pulamos pra reduzir churn. Revisitar na Fase 2 se preciso.

## Janela de tsc quebrado (esperada e documentada)

A mudança de `leadScoring.ts` (Task 1) quebra os importadores até a Task 4 fechar. Ordem:

- Após **Task 1**: tsc vermelho em OnboardingForm, diagnosticoStore, /api/leads, /api/results.
- Após **Task 2**: tsc vermelho em diagnosticoStore, /api/leads, /api/results.
- Após **Task 3**: tsc vermelho em /api/leads, /api/results.
- Após **Task 4**: tsc **VERDE**.

Cada task verifica "vermelho só nos arquivos esperados". Igual ao padrão da reforma de spots.

---

## Task 1 — `lib/poker/leadScoring.ts` (rewrite)

**Files:**
- Modify (rewrite): `lib/poker/leadScoring.ts`

**Por quê:** Root da mudança. Novos tipos/opções (Objetivo 4, Banca 13, Horas, Telas, Sites), remove lead score, adiciona derivações travadas.

- [ ] **Step 1: Reescrever o arquivo inteiro**

Substituir TODO o conteúdo de `lib/poker/leadScoring.ts` por:

```ts
// lib/poker/leadScoring.ts — Quiz do onboarding (v2): tipos das respostas e
// derivações pros campos do plano (profitGoal, stakeGrade, volume, studyTime).
//
// Onboarding v2: lead score (frio/morno/quente) REMOVIDO. Idade, Experiência,
// ABI e Volume (perguntas) removidas. Quiz pontuável-de-plano = objetivo + banca.
// Tempo (horas/telas) é capturado fora do QuizAnswers.

import type { ProfitGoal, StudyTime } from "./planStorage";

// ---------------------------------------------------------------------------
// Tipos das respostas
// ---------------------------------------------------------------------------

export type ObjetivoAnswer =
  | "competitivo"
  | "renda_extra"
  | "profissional"
  | "ja_vive";

export type BancaAnswer =
  | "lt_875"
  | "875_1499"
  | "1500_2799"
  | "2800_4249"
  | "4250_5849"
  | "5850_7599"
  | "7600_9499"
  | "9500_11999"
  | "12000_15399"
  | "15400_20699"
  | "20700_26999"
  | "27000_33749"
  | "gte_33750";

export interface QuizAnswers {
  objetivo: ObjetivoAnswer;
  banca: BancaAnswer;
}

// ---------------------------------------------------------------------------
// Opções (value + label). Sem pontuação — lead score removido.
// ---------------------------------------------------------------------------

export interface QuizOption<T extends string> {
  value: T;
  label: string;
}

export interface NumberOption {
  value: number;
  label: string;
}

export const OBJETIVO_OPTIONS: QuizOption<ObjetivoAnswer>[] = [
  { value: "competitivo", label: "Quero ser competitivo, mas não pretendo viver do jogo" },
  { value: "renda_extra", label: "Ter renda extra, poder contar com os ganhos no jogo" },
  { value: "profissional", label: "Ser profissional, ter o jogo como renda principal" },
  { value: "ja_vive", label: "Já vivo do poker e quero escalar os limites" },
];

export const BANCA_OPTIONS: QuizOption<BancaAnswer>[] = [
  { value: "lt_875", label: "Menor que $875" },
  { value: "875_1499", label: "Entre $875 e $1.499" },
  { value: "1500_2799", label: "Entre $1.500 e $2.799" },
  { value: "2800_4249", label: "Entre $2.800 e $4.249" },
  { value: "4250_5849", label: "Entre $4.250 e $5.849" },
  { value: "5850_7599", label: "Entre $5.850 e $7.599" },
  { value: "7600_9499", label: "Entre $7.600 e $9.499" },
  { value: "9500_11999", label: "Entre $9.500 e $11.999" },
  { value: "12000_15399", label: "Entre $12.000 e $15.399" },
  { value: "15400_20699", label: "Entre $15.400 e $20.699" },
  { value: "20700_26999", label: "Entre $20.700 e $26.999" },
  { value: "27000_33749", label: "Entre $27.000 e $33.749" },
  { value: "gte_33750", label: "$33.750 ou mais" },
];

// Horas/semana: value = total; label mostra grind (5/6 do total, só display).
export const HOURS_OPTIONS: NumberOption[] = [
  { value: 6, label: "6h por semana · 5h de grind" },
  { value: 12, label: "12h por semana · 10h de grind" },
  { value: 18, label: "18h por semana · 15h de grind" },
  { value: 24, label: "24h por semana · 20h de grind" },
  { value: 30, label: "30h por semana · 25h de grind" },
  { value: 36, label: "36h por semana · 30h de grind" },
  { value: 42, label: "42h por semana · 35h de grind" },
  { value: 48, label: "48h por semana · 40h de grind" },
];

export const TABLES_OPTIONS: NumberOption[] = Array.from(
  { length: 10 },
  (_, i) => ({ value: i + 1, label: i + 1 === 1 ? "1 tela" : `${i + 1} telas` })
);

// Sites pros nicks (multi-site). `key` = chave no JSONB; `label` = nome exibido.
export const SHARKSCOPE_SITES = [
  { key: "pokerstars", label: "PokerStars" },
  { key: "ggpoker", label: "GGPoker" },
  { key: "partypoker", label: "PartyPoker" },
  { key: "p888", label: "888Poker" },
  { key: "wpn", label: "WPN" },
  { key: "ipoker", label: "iPoker" },
] as const;
export type SharkscopeSiteKey = (typeof SHARKSCOPE_SITES)[number]["key"];

// ---------------------------------------------------------------------------
// Stake grade (banca → ABI permitido). INTERINO na Fase 1.
// ---------------------------------------------------------------------------

/**
 * Stake recomendada (ABI USD) baseada na banca. INTERINO (Fase 1): mapeia as
 * 13 faixas pros valores da escala atual (1..28), monotônico. Fase 2 troca
 * pela escala real até $54 + teto técnico por tier.
 */
export const BANCA_GRADE: Record<BancaAnswer, number> = {
  lt_875: 1,
  "875_1499": 2.5,
  "1500_2799": 4,
  "2800_4249": 7,
  "4250_5849": 10,
  "5850_7599": 13,
  "7600_9499": 13,
  "9500_11999": 19,
  "12000_15399": 19,
  "15400_20699": 28,
  "20700_26999": 28,
  "27000_33749": 28,
  gte_33750: 28,
};

export function computeStakeGrade(a: QuizAnswers): number {
  return BANCA_GRADE[a.banca];
}

// ---------------------------------------------------------------------------
// Derivações pro plano
// ---------------------------------------------------------------------------

/** Objetivo → profit_goal (4 casos). */
export function objetivoToProfitGoal(objetivo: ObjetivoAnswer): ProfitGoal {
  switch (objetivo) {
    case "competitivo":
      return "usd1k";
    case "renda_extra":
      return "usd10k";
    case "ja_vive":
      return "usd50k";
    case "profissional":
      return "usd100k";
  }
}

/**
 * Volume semanal esperado = horas × 0,5 × telas. Usa o TOTAL de horas (o
 * "grind" do label é só contexto). Mensal = ×4 (consumidores multiplicam).
 */
export function weeklyVolumeTarget(weeklyHours: number, tables: number): number {
  return Math.round(weeklyHours * 0.5 * tables);
}

/** Horas/semana → studyTime (faixa do plano). */
export function studyTimeFromHours(weeklyHours: number): StudyTime {
  if (weeklyHours <= 15) return "ate15";
  if (weeklyHours <= 40) return "ate40";
  return "mais40";
}
```

- [ ] **Step 2: Smoke `tsx` das derivações**

Criar `./tmp-smoke-leadscoring.ts`:

```ts
import {
  objetivoToProfitGoal,
  weeklyVolumeTarget,
  studyTimeFromHours,
  computeStakeGrade,
} from "./lib/poker/leadScoring";

console.log("[profit competitivo]", objetivoToProfitGoal("competitivo")); // usd1k
console.log("[profit ja_vive]", objetivoToProfitGoal("ja_vive"));         // usd50k
console.log("[vol 36x5]", weeklyVolumeTarget(36, 5));                      // 90
console.log("[vol 6x1]", weeklyVolumeTarget(6, 1));                        // 3
console.log("[study 12]", studyTimeFromHours(12));                         // ate15
console.log("[study 36]", studyTimeFromHours(36));                         // ate40
console.log("[study 48]", studyTimeFromHours(48));                         // mais40
console.log("[stake 4250_5849]", computeStakeGrade({ objetivo: "competitivo", banca: "4250_5849" })); // 10
console.log("[stake gte_33750]", computeStakeGrade({ objetivo: "ja_vive", banca: "gte_33750" }));     // 28
```

Run: `npx tsx ./tmp-smoke-leadscoring.ts`
Expected:
```
[profit competitivo] usd1k
[profit ja_vive] usd50k
[vol 36x5] 90
[vol 6x1] 3
[study 12] ate15
[study 36] ate40
[study 48] mais40
[stake 4250_5849] 10
[stake gte_33750] 28
```

DELETE `tmp-smoke-leadscoring.ts` antes do commit.

- [ ] **Step 3: tsc — confirmar quebra contida nos importadores esperados**

Run: `npx tsc --noEmit`
Expected: erros SÓ em `OnboardingForm.tsx`, `diagnosticoStore.ts`, `app/api/leads/route.ts`, `app/api/results/route.ts` (símbolos removidos: `IDADE_OPTIONS`, `computeLeadScore`, `LeadCategory`, etc.). Confirmar que NÃO há erro em outros arquivos:

```bash
npx tsc --noEmit 2>&1 | grep -v "OnboardingForm.tsx\|diagnosticoStore.ts\|leads/route.ts\|results/route.ts"
```

Expected: vazio (ou só linhas em branco). Erro em outro arquivo = investigar (alguém mais importava de leadScoring).

- [ ] **Step 4: Lint**

Run: `npx eslint lib/poker/leadScoring.ts`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/leadScoring.ts
git commit -m "$(cat <<'EOF'
feat(plan): leadScoring v2 — quiz objetivo+banca, derivações, sem lead score

Onboarding v2 root. Remove idade/tempo/abi/volume + lead score
(computeLeadScore/Category, LeadCategory). Objetivo 4 opções, Banca
13 faixas. Novos: HOURS_OPTIONS, TABLES_OPTIONS, SHARKSCOPE_SITES.
Derivações: weeklyVolumeTarget (horas×0.5×telas), studyTimeFromHours,
objetivoToProfitGoal (4 casos), BANCA_GRADE interino (13 faixas).

Quebra tsc nos importadores até as tasks de wire fecharem (esperado).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `components/trainer/OnboardingForm.tsx` (rework)

**Files:**
- Modify: `components/trainer/OnboardingForm.tsx`

**Por quê:** Form de 9→6 steps, novo `OnboardingData`, novos estados e derivações no finalSubmit.

**Subcomponentes que NÃO mudam** (manter exatamente como estão): `StepWrapper`, `Title`, `Sub`, `ProgressBar`, `Field`, `NextButton`, `BackBar`, `inputClass`, `formatPhone`, `isValidEmail`, `isValidPhone`. Só mudam: imports, `OnboardingData`, `TOTAL_STEPS`, estados, `finalSubmit`, os steps no JSX, e `QuestionOptions` (generalizar).

- [ ] **Step 1: Trocar o bloco de imports do topo**

Substituir o import de `@/lib/poker/leadScoring` (linhas 7-29) por:

```ts
import {
  BANCA_OPTIONS,
  OBJETIVO_OPTIONS,
  HOURS_OPTIONS,
  TABLES_OPTIONS,
  SHARKSCOPE_SITES,
  computeStakeGrade,
  objetivoToProfitGoal,
  weeklyVolumeTarget,
  studyTimeFromHours,
  type BancaAnswer,
  type ObjetivoAnswer,
  type QuizAnswers,
} from "@/lib/poker/leadScoring";
```

(`QuizOption` não é mais importado aqui — `QuestionOptions` passa a usar um tipo local. `ProfitGoal`/`StudyTime` continuam vindo de `planStorage`.)

- [ ] **Step 2: Atualizar `OnboardingData`**

Substituir a interface `OnboardingData` (linhas 31-56) por:

```ts
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
  /** Horas/semana declaradas (6-48). */
  weeklyHours: number;
  /** Telas simultâneas (1-10). */
  tables: number;
  notifyCadence: "leve" | "ritmada" | "intensa";
  /** Consentimento explícito de contato via WhatsApp. */
  whatsappOptIn: boolean;
  /** Nicks por site (só preenchidos). Ex.: { ggpoker: "nick" }. */
  sharkscopeNicks: Record<string, string>;
  /** Primeiro nick preenchido — back-compat com coluna single. */
  sharkscopeUsername: string | null;
  /** Site (label) do primeiro nick — back-compat. */
  sharkscopeNetwork: string | null;
}
```

- [ ] **Step 3: `TOTAL_STEPS` e remover `SHARKSCOPE_NETWORKS`**

Trocar `const TOTAL_STEPS = 9;` (linha 62) por:

```ts
const TOTAL_STEPS = 6; // identidade + objetivo + tempo + banca + nicks + whatsapp
```

Remover o bloco `SHARKSCOPE_NETWORKS` + `type SharkscopeNetwork` (linhas 64-72) — não usados mais. Manter `const ADVANCE_DELAY_MS = 220;`.

- [ ] **Step 4: Trocar os estados do quiz**

Substituir o bloco de estados (linhas 102-116) por:

```ts
  // Quiz
  const [objetivo, setObjetivo] = useState<ObjetivoAnswer | null>(null);
  const [banca, setBanca] = useState<BancaAnswer | null>(null);
  const [weeklyHours, setWeeklyHours] = useState<number | null>(null);
  const [tables, setTables] = useState<number | null>(null);
  const [nicks, setNicks] = useState<Record<string, string>>({});
  // notifyCadence deixou de ser perguntada — fica fixa em "ritmada".
  const notifyCadence = "ritmada" as const;
  const [whatsappOptIn, setWhatsappOptIn] = useState<boolean | null>(null);
```

(Removidos: idade, tempo, abi, volume, hasSharkscope, sharkscopeUsername single, sharkscopeNetwork single.)

- [ ] **Step 5: Reescrever `finalSubmit`**

Substituir `finalSubmit` (linhas 127-161) por:

```ts
  const finalSubmit = () => {
    if (!objetivo || !banca || weeklyHours === null || tables === null) return;
    if (whatsappOptIn === null) return; // exige consentimento explícito

    const completeQuiz: QuizAnswers = { objetivo, banca };

    // Nicks: só os preenchidos entram. Primeiro não-vazio (ordem dos sites)
    // vira o "primário" pras colunas single (back-compat).
    const filledNicks: Record<string, string> = {};
    for (const site of SHARKSCOPE_SITES) {
      const v = (nicks[site.key] ?? "").trim();
      if (v) filledNicks[site.key] = v;
    }
    const primarySite = SHARKSCOPE_SITES.find((s) => filledNicks[s.key]);
    const sharkscopeUsername = primarySite ? filledNicks[primarySite.key] : null;
    const sharkscopeNetwork = primarySite ? primarySite.label : null;

    onSubmit({
      playerName: playerName.trim(),
      email: email.trim().toLowerCase(),
      phone,
      notifyChannels: ["email"],
      whatsappPhone: null,
      quizAnswers: completeQuiz,
      stakeGrade: computeStakeGrade(completeQuiz),
      studyTime: studyTimeFromHours(weeklyHours),
      profitGoal: objetivoToProfitGoal(objetivo),
      volumeTargetWeekly: weeklyVolumeTarget(weeklyHours, tables),
      weeklyHours,
      tables,
      notifyCadence,
      whatsappOptIn,
      sharkscopeNicks: filledNicks,
      sharkscopeUsername,
      sharkscopeNetwork,
    });
  };
```

- [ ] **Step 6: `sharkscopeValid` removido; nicks sempre válido**

Remover `sharkscopeValid` (linhas 123-125). Não é mais necessário — step de nicks é sempre avançável.

- [ ] **Step 7: Substituir os steps 2-9 do JSX**

Substituir todo o bloco dos steps `{step === 2 && ...}` até `{step === 9 && ...}` (linhas 241-476) por estes 5 steps:

```tsx
          {step === 2 && (
            <StepWrapper key="objetivo">
              <Title>Qual é o seu objetivo no poker?</Title>
              <QuestionOptions
                options={OBJETIVO_OPTIONS}
                value={objetivo}
                onChange={autoAdvance(setObjetivo, 3)}
              />
              <BackBar onBack={() => setStep(1)} />
            </StepWrapper>
          )}

          {step === 3 && (
            <StepWrapper key="tempo">
              <Title>
                Aproximadamente, quanto tempo por semana você tem disponível
                para o poker (incluindo estudar, treinar e jogar)?
              </Title>
              <QuestionOptions
                options={HOURS_OPTIONS}
                value={weeklyHours}
                onChange={(v) => setWeeklyHours(v)}
              />

              {weeklyHours !== null && (
                <div className="mt-8">
                  <p className="mb-3 text-center text-sm text-neutral-300">
                    Durante uma sessão de grind online, quantas telas
                    simultâneas você joga na maior parte do tempo?
                  </p>
                  <QuestionOptions
                    options={TABLES_OPTIONS}
                    value={tables}
                    onChange={(v) => setTables(v)}
                    grid
                  />
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={weeklyHours === null || tables === null}
                  onClick={() => setStep(4)}
                  label="Continuar →"
                />
              </div>
              <BackBar onBack={() => setStep(2)} />
            </StepWrapper>
          )}

          {step === 4 && (
            <StepWrapper key="banca">
              <Title>Qual é a sua banca (em dólares) para jogar poker online?</Title>
              <Sub>
                Lembre-se: sua banca (bankroll) não é apenas o que você tem nas
                suas contas de cada site neste exato momento, mas todo o
                dinheiro que você tem disponível para dar buy-ins de poker
                online. Caso você possa depositar mais do que tem depositado,
                some esse valor ao que você já tem nos sites.
              </Sub>
              <QuestionOptions
                options={BANCA_OPTIONS}
                value={banca}
                onChange={autoAdvance(setBanca, 5)}
              />
              <BackBar onBack={() => setStep(3)} />
            </StepWrapper>
          )}

          {step === 5 && (
            <StepWrapper key="nicks">
              <Title>Preencha seus nicks nos sites abaixo.</Title>
              <Sub>
                Responda apenas os que você já tem conta. Deixe em branco os
                sites onde você ainda não joga.
              </Sub>

              <div className="mt-8 space-y-4">
                {SHARKSCOPE_SITES.map((site) => (
                  <Field key={site.key} label={site.label}>
                    <input
                      type="text"
                      value={nicks[site.key] ?? ""}
                      onChange={(e) =>
                        setNicks((prev) => ({ ...prev, [site.key]: e.target.value }))
                      }
                      placeholder={`Seu nick na ${site.label}`}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={false}
                  onClick={() => setStep(6)}
                  label="Continuar →"
                />
              </div>
              <BackBar onBack={() => setStep(4)} />
            </StepWrapper>
          )}

          {step === 6 && (
            <StepWrapper key="whatsapp-opt-in">
              <Title>
                Podemos te contatar pelo WhatsApp pra acompanhar sua execução
                na Comunidade?
              </Title>
              <Sub>
                A gente usa só pra te lembrar de tarefas, mandar review e
                avisar quando algo importante acontecer. Você pode mudar depois.
              </Sub>

              <div className="mt-8 space-y-2">
                {[
                  {
                    value: true,
                    label: "Aceito",
                    sub: "Quero receber lembretes e acompanhamento no WhatsApp.",
                  },
                  {
                    value: false,
                    label: "Não aceito",
                    sub: "Prefiro não receber mensagens no WhatsApp.",
                  },
                ].map((o) => {
                  const selected = whatsappOptIn === o.value;
                  return (
                    <button
                      type="button"
                      key={String(o.value)}
                      onClick={() => setWhatsappOptIn(o.value)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? "border-amber-400/70 bg-amber-400/15 text-amber-100"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold">{o.label}</span>
                        <span className="block text-xs text-neutral-400">{o.sub}</span>
                      </span>
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={whatsappOptIn === null}
                  onClick={() => finalSubmit()}
                  label="Concluir →"
                />
              </div>
              <BackBar onBack={() => setStep(5)} />
            </StepWrapper>
          )}
```

- [ ] **Step 8: Generalizar `QuestionOptions` (string|number + grid)**

Substituir `QuestionOptions` (linhas 563-599) por:

```tsx
function QuestionOptions<T extends string | number>({
  options,
  value,
  onChange,
  grid = false,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  grid?: boolean;
}) {
  const opts = useMemo(() => options, [options]);
  return (
    <div className={grid ? "mt-8 grid grid-cols-2 gap-2" : "mt-8 space-y-2"}>
      {opts.map((o) => {
        const selected = value === o.value;
        return (
          <button
            type="button"
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
              selected
                ? "border-amber-400/70 bg-amber-400/15 text-amber-100"
                : "border-neutral-800 bg-neutral-900/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
            }`}
          >
            <span>{o.label}</span>
            <span
              className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
```

(`autoAdvance` é genérico `<T extends string>` — funciona pra objetivo/banca, que são string. Horas/telas NÃO usam autoAdvance, usam `onChange={(v) => setX(v)}` direto, então sem conflito de tipo.)

- [ ] **Step 9: tsc — confirmar quebra contida**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -v "diagnosticoStore.ts\|leads/route.ts\|results/route.ts"
```
Expected: vazio. `OnboardingForm.tsx` deve estar limpo agora; resto da quebra fica em store + rotas (Tasks 3-4).

- [ ] **Step 10: Lint**

Run: `npx eslint components/trainer/OnboardingForm.tsx`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add components/trainer/OnboardingForm.tsx
git commit -m "$(cat <<'EOF'
feat(plan): OnboardingForm v2 — 6 steps, tempo+telas, banca 13, nicks multi

Form 9→6 steps: Identidade, Objetivo (4), Tempo (horas 6-48 + telas
1-10), Banca (13 faixas), Nicks (6 sites opcionais), WhatsApp.
Remove Idade/Experiência/ABI/Volume. finalSubmit deriva profitGoal,
volumeTargetWeekly (horas×0.5×telas), studyTime, stakeGrade; monta
sharkscopeNicks + primário (back-compat). QuestionOptions
generalizado (string|number + grid).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `diagnosticoStore.ts` + `DiagnosticoScreen.tsx`

**Files:**
- Modify: `lib/poker/diagnosticoStore.ts`
- Modify: `components/trainer/DiagnosticoScreen.tsx`

**Por quê:** O store carrega leadScore/leadCategory e tipa quizAnswers; a tela lê e reenvia. Remover essas refs e propagar os campos novos pro POST /api/leads.

- [ ] **Step 1: `diagnosticoStore.ts` — remover leadScore/leadCategory do state**

No arquivo `lib/poker/diagnosticoStore.ts`:

1. No import de tipos do `leadScoring` (topo), remover `LeadCategory` se importado; `QuizAnswers` continua.
2. No state (linhas ~81-84), remover `leadScore: number;` e `leadCategory: LeadCategory | null;`. Manter `quizAnswers: QuizAnswers | null;` e `stakeGrade: number;`.
3. No tipo do `setOnboarding` (linhas ~123-135), remover `leadScore: number;` e `leadCategory: LeadCategory;`. Manter o resto.
4. Nos defaults (linhas ~170-178), remover `leadScore: 0,` e `leadCategory: null,`.
5. Na implementação de `setOnboarding` (linhas ~184-210), remover `leadScore,` e `leadCategory,` do destructure e do objeto setado.

- [ ] **Step 2: `DiagnosticoScreen.tsx` — parar de ler leadScore/leadCategory do store**

1. Remover as linhas que lêem do store: `const leadScore = useDiagnosticoStore((s) => s.leadScore);` e `const leadCategory = useDiagnosticoStore((s) => s.leadCategory);` (linhas ~56-57).
2. Remover `leadScore`/`leadCategory` do array de deps do `useEffect` (linha ~259).

- [ ] **Step 3: `DiagnosticoScreen.tsx` — tirar leadScore/leadCategory dos 3 POSTs**

Nos 3 corpos de `body: JSON.stringify({...})`:
- POST /api/results (abandono, ~linha 130) — remover `leadScore,` e `leadCategory,`.
- POST /api/results (final, ~linha 204) — remover `leadScore,` e `leadCategory,`.
- POST /api/leads (~linha 301) — remover `leadScore: data.leadScore,` e `leadCategory: data.leadCategory,`.

- [ ] **Step 4: `DiagnosticoScreen.tsx` — adicionar campos novos ao POST /api/leads**

No corpo do POST `/api/leads` (~linhas 301-317), adicionar (usando `data.*`):

```ts
              weeklyHours: data.weeklyHours,
              tables: data.tables,
              sharkscopeNicks: data.sharkscopeNicks,
```

E trocar a linha `sharkscopeUsername: data.sharkscopeUsername,` mantendo-a (já existe) — confirmar que `sharkscopeNetwork: data.sharkscopeNetwork,` também segue. (Os campos single continuam vindo do `data` pelo back-compat montado no form.)

- [ ] **Step 5: tsc — confirmar quebra contida nas rotas**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -v "leads/route.ts\|results/route.ts"
```
Expected: vazio. Store + tela limpos; só rotas faltam.

- [ ] **Step 6: Lint**

Run: `npx eslint lib/poker/diagnosticoStore.ts components/trainer/DiagnosticoScreen.tsx`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/poker/diagnosticoStore.ts components/trainer/DiagnosticoScreen.tsx
git commit -m "$(cat <<'EOF'
feat(plan): store + DiagnosticoScreen — drop lead score, envia tempo/nicks

diagnosticoStore remove leadScore/leadCategory do state e setOnboarding.
DiagnosticoScreen para de ler/enviar leadScore/leadCategory nos 3 POSTs
e adiciona weeklyHours/tables/sharkscopeNicks no POST /api/leads.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `/api/leads` + `/api/results` (fecha o tsc)

**Files:**
- Modify: `app/api/leads/route.ts`
- Modify: `app/api/results/route.ts`

**Por quê:** Remover imports/uso de símbolos que sumiram, persistir colunas novas, atualizar webhook. Após esta task tsc fica VERDE.

- [ ] **Step 1: `/api/leads` — imports**

Substituir o import de `@/lib/poker/leadScoring` (linhas 21-32) por:

```ts
import {
  BANCA_OPTIONS,
  OBJETIVO_OPTIONS,
  type QuizAnswers,
  type QuizOption,
} from "@/lib/poker/leadScoring";
```

(Removidos: `ABI_OPTIONS`, `IDADE_OPTIONS`, `TEMPO_OPTIONS`, `VOLUME_OPTIONS`, `LEAD_CATEGORY_LABELS`, `LeadCategory`.)

- [ ] **Step 2: `/api/leads` — `enrichQuiz` reduzido**

Substituir `enrichQuiz` (linhas 45-62) por:

```ts
/**
 * Enriquece as respostas do quiz com labels human-readable pro n8n.
 * Onboarding v2: só objetivo + banca.
 */
function enrichQuiz(answers: QuizAnswers | null) {
  if (!answers) return null;
  return {
    objetivo: {
      value: answers.objetivo,
      label: labelOf(OBJETIVO_OPTIONS, answers.objetivo),
    },
    banca: { value: answers.banca, label: labelOf(BANCA_OPTIONS, answers.banca) },
  };
}
```

- [ ] **Step 3: `/api/leads` — `WebhookPayload`**

Substituir a interface `WebhookPayload` (linhas 64-89) por:

```ts
interface WebhookPayload {
  event: "lead.quiz_submitted";
  diagnosticId: string;
  createdAt: string;
  player: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  stakeGrade: number | null;
  quiz: ReturnType<typeof enrichQuiz>;
  time: {
    weeklyHours: number | null;
    tables: number | null;
  };
  sharkscopeNicks: Record<string, string> | null;
  preferences: {
    notifyChannels: string[];
    whatsappPhone: string | null;
    whatsappOptIn: boolean | null;
  };
  legacy: {
    profitGoal: string | null;
    studyTime: string | null;
    volumeTargetWeekly: number | null;
  };
}
```

- [ ] **Step 4: `/api/leads` — parsing dos campos novos + remover leadScore/leadCategory**

No `POST`, remover os blocos `const leadScore = ...` e `const leadCategory = ...` (linhas ~163-170). Adicionar, perto do parsing de `stakeGrade`:

```ts
  const weeklyHours =
    typeof body.weeklyHours === "number" && Number.isFinite(body.weeklyHours)
      ? Math.round(body.weeklyHours)
      : null;
  const tables =
    typeof body.tables === "number" && Number.isFinite(body.tables)
      ? Math.round(body.tables)
      : null;
  const sharkscopeNicks =
    body.sharkscopeNicks && typeof body.sharkscopeNicks === "object"
      ? (body.sharkscopeNicks as Record<string, string>)
      : null;
```

- [ ] **Step 5: `/api/leads` — insert**

No objeto do `.insert([{ ... }])`:
- Trocar `lead_score: leadScore,` por `lead_score: null,`
- Trocar `lead_category: leadCategory,` por `lead_category: null,`
- Adicionar:

```ts
        weekly_hours: weeklyHours,
        tables: tables,
        sharkscope_nicks: sharkscopeNicks,
```

(Manter `sharkscope_username`/`sharkscope_network` como já estão — vêm do primário.)

- [ ] **Step 6: `/api/leads` — payload do webhook**

Substituir o objeto `const payload: WebhookPayload = {...}` (linhas ~251-275) por:

```ts
  const payload: WebhookPayload = {
    event: "lead.quiz_submitted",
    diagnosticId: data.id,
    createdAt: data.created_at ?? new Date().toISOString(),
    player: {
      name: body.playerName ?? "Jogador",
      email: body.email ?? null,
      phone: body.phone ?? null,
    },
    stakeGrade,
    quiz: enrichQuiz(quizAnswers),
    time: { weeklyHours, tables },
    sharkscopeNicks,
    preferences: {
      notifyChannels,
      whatsappPhone,
      whatsappOptIn,
    },
    legacy: {
      profitGoal: body.profitGoal ?? null,
      studyTime: body.studyTime ?? "ate15",
      volumeTargetWeekly: volumeTarget,
    },
  };
```

- [ ] **Step 7: `/api/results` — remover leadScore/leadCategory**

No `app/api/results/route.ts`:
1. Remover import de `LEAD_CATEGORY_LABELS` (e `LeadCategory` se importado) do `@/lib/poker/leadScoring`.
2. Remover os blocos `const leadScore = ...` e `const leadCategory = ...` (linhas ~133-138).
3. No insert, trocar `lead_score: leadScore,` → `lead_score: null,` e `lead_category: leadCategory,` → `lead_category: null,` (linhas ~216-217).
4. No bloco de response que usa `leadScore`/`leadCategory`/`LEAD_CATEGORY_LABELS` (linhas ~342-346), remover esses campos do objeto de resposta (ou setar `score: null, category: null, categoryLabel: null`). Inspecionar o objeto e remover as 3 refs de forma que o response continue válido.

- [ ] **Step 8: tsc — VERDE**

Run: `npx tsc --noEmit`
Expected: exit 0 (sem erros). Toda a cadeia compila.

- [ ] **Step 9: Lint**

Run: `npx eslint app/api/leads/route.ts app/api/results/route.ts`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add app/api/leads/route.ts app/api/results/route.ts
git commit -m "$(cat <<'EOF'
feat(plan): rotas leads/results — persiste tempo/nicks, drop lead score

/api/leads: enrichQuiz só objetivo+banca, persiste weekly_hours/tables/
sharkscope_nicks, grava lead_score/category null, webhook v2 (time +
sharkscopeNicks, sem leadScore/Category). /api/results: para de gravar
lead_score/category (null), remove LEAD_CATEGORY_LABELS. Fecha o tsc.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Migration `015_onboarding_v2.sql`

**Files:**
- Create: `supabase/migrations/015_onboarding_v2.sql`

**Por quê:** Persistir os campos novos. Última migration é `014_whatsapp_opt_in.sql` — seguir o mesmo estilo/idempotência.

- [ ] **Step 1: Inspecionar a migration anterior pra casar o estilo**

Run: `cat supabase/migrations/014_whatsapp_opt_in.sql`
Observar: header de comentário, uso de `IF NOT EXISTS`, comentários `COMMENT ON COLUMN` se houver.

- [ ] **Step 2: Criar `supabase/migrations/015_onboarding_v2.sql`**

```sql
-- 015_onboarding_v2.sql
-- Onboarding v2 (Fase 1): captura de tempo (horas/telas) e nicks multi-site.
-- lead_score/lead_category continuam existindo mas param de ser escritas.

ALTER TABLE reglife_diagnostic_results
  ADD COLUMN IF NOT EXISTS weekly_hours integer,
  ADD COLUMN IF NOT EXISTS tables integer,
  ADD COLUMN IF NOT EXISTS sharkscope_nicks jsonb;

COMMENT ON COLUMN reglife_diagnostic_results.weekly_hours IS
  'Horas/semana disponíveis declaradas no onboarding (6-48).';
COMMENT ON COLUMN reglife_diagnostic_results.tables IS
  'Telas simultâneas declaradas no onboarding (1-10).';
COMMENT ON COLUMN reglife_diagnostic_results.sharkscope_nicks IS
  'Nicks por site preenchidos no onboarding. Ex.: {"ggpoker":"nick"}.';
```

(Ajustar header/sintaxe se `014` usar um padrão diferente.)

- [ ] **Step 3: ⚠️ Registrar no plano que precisa aplicar em prod**

A migration **NÃO roda sozinha** em prod (Supabase easypanel tem drift). Após o merge/deploy, rodar este SQL manualmente no Supabase de prod, senão `/api/leads` dá 500 "db error" ao gravar `weekly_hours`/`tables`/`sharkscope_nicks`.

(Nada a executar localmente além de criar o arquivo — não temos como aplicar em prod daqui.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_onboarding_v2.sql
git commit -m "$(cat <<'EOF'
feat(plan): migration 015 — weekly_hours, tables, sharkscope_nicks

Adiciona as 3 colunas pro Onboarding v2. Idempotente (IF NOT EXISTS).
APLICAR EM PROD MANUALMENTE (drift do Supabase easypanel) — senão
/api/leads dá 500 ao gravar os campos novos.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Sanity check final

**Files:** nenhum.

**Por quê:** Garantir a cadeia inteira compilando + smokes dos critérios de aceite.

- [ ] **Step 1: tsc + lint + build**

Run: `npx tsc --noEmit && echo "TSC OK" && npx eslint . 2>&1 | tail -5 && npm run build 2>&1 | tail -8`
Expected: `TSC OK` + lint sem erros novos + build completa.

- [ ] **Step 2: Smoke `tsx` das derivações (revalidar)**

Recriar `./tmp-smoke-leadscoring.ts` (mesmo da Task 1) e rodar `npx tsx ./tmp-smoke-leadscoring.ts`. Conferir as 9 linhas. DELETAR depois.

- [ ] **Step 3: Smoke visual — fluxo do onboarding**

Run: `npm run dev` → abrir a home do diagnóstico (onde o `OnboardingForm` renderiza).

Conferir:
- [ ] 6 steps na ordem: Identidade → Objetivo (4 opções) → Tempo (horas, depois telas em grid) → Banca (13 faixas) → Nicks (6 campos) → WhatsApp.
- [ ] Sem steps de Idade/Experiência/ABI/Volume.
- [ ] Tempo: escolher horas revela telas; "Continuar" só habilita com os dois.
- [ ] Nicks: avança mesmo sem preencher nenhum.
- [ ] "Concluir" no último step submete sem erro no console.
- [ ] ProgressBar mostra "Passo X de 6".

- [ ] **Step 4: Smoke de persistência (se DB de dev disponível)**

Submeter o onboarding completo (ex.: Objetivo renda_extra, 36h, 5 telas, banca "Entre $4.250 e $5.849", nick só GGPoker). Conferir no Supabase de dev a linha em `reglife_diagnostic_results`:
- [ ] `weekly_hours = 36`, `tables = 5`, `volume_target_weekly = 90`.
- [ ] `study_time = ate40`, `profit_goal = usd10k`, `stake_grade = 10`.
- [ ] `sharkscope_nicks = { "ggpoker": "..." }`, `sharkscope_username` = o nick, `sharkscope_network = "GGPoker"`.
- [ ] `lead_score`/`lead_category` = null.

(Se o DB de dev não tiver as colunas, aplicar a `015` lá primeiro.)

- [ ] **Step 5: Checar critérios de aceite do spec**

Reabrir `docs/superpowers/specs/2026-06-15-onboarding-v2-fase1-design.md` seção "Critérios de Aceite" e marcar cada item.

---

## Self-Review

**1. Spec coverage:**
- Form 6 steps / remove Idade/Exp/ABI/Volume → Task 2 ✓
- Objetivo 4 + objetivoToProfitGoal → Tasks 1, 2 ✓
- Tempo horas+telas capturados → Tasks 1, 2 ✓
- Banca 13 faixas → Tasks 1, 2 ✓
- Nicks 6 + JSONB + primário → Tasks 2, 3, 4 ✓
- volumeTargetWeekly fórmula → Task 1 (weeklyVolumeTarget), usado em Task 2 ✓
- studyTime derivado → Task 1, usado em Task 2 ✓
- stakeGrade interino → Task 1 ✓
- leadScore removido + colunas param de escrever → Tasks 1, 3, 4 ✓
- Migration → Task 5 ✓
- Payload n8n → Task 4 ✓
- playerTier inalterado → não tocado ✓

**2. Placeholder scan:** sem TBD/TODO; código completo em cada step que muda código; comandos com expected output.

**3. Type consistency:**
- `QuizAnswers = { objetivo, banca }` definido na Task 1, consumido idêntico em Tasks 2/3/4.
- `weeklyVolumeTarget(weeklyHours, tables)`, `studyTimeFromHours(weeklyHours)`, `objetivoToProfitGoal`, `computeStakeGrade` — assinaturas da Task 1 batem com os usos na Task 2.
- `OnboardingData` (Task 2) adiciona `weeklyHours`/`tables`/`sharkscopeNicks`; consumidos no POST da Task 3; persistidos na Task 4.
- `BancaAnswer` (13 valores) e `BANCA_GRADE` (13 chaves) consistentes — todas as 13 chaves mapeadas.
- Colunas DB (`weekly_hours`, `tables`, `sharkscope_nicks`) batem entre Task 4 (insert) e Task 5 (migration).

**4. Desvio do spec (consciente):** `weeklyHours`/`tables` NÃO entram em `SavedPlan`/`buildPlan` (YAGNI — sem consumidor na Fase 1). Vão só pro DB. Documentado na File Structure.

**5. Build order:** Tasks 1-3 deixam tsc vermelho (contido nos importadores listados); Task 4 fecha. Documentado na seção "Janela de tsc quebrado".
