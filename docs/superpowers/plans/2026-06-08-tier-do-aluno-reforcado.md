# A5 — Tier do aluno reforçado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reforçar a presença do `playerTier` em `/meu-plano` via componente `TierBadge` novo + copy adaptada por tier no header do plano e no `MonthlyScoreboard`.

**Architecture:** Refactor leve (3 mapas de cor saem do `SpotCard` pra `lib/poker/tierTheme.ts` pra reuso) + novo registro central de copies por tier (`lib/poker/tierCopy.ts`) + novo componente `TierBadge` + wire em 2 telas. Sem schema change, sem mudança no algoritmo `assessTier`, sem mudança visual em `SpotCard`.

**Tech Stack:** Next.js (App Router, NÃO o Next.js padrão — ver `AGENTS.md`), TypeScript, motion/react, Tailwind. Sem suite de testes — validação via tsc/lint/build + smoke tsx + visual.

---

## Spec Reference

`docs/superpowers/specs/2026-06-08-tier-do-aluno-reforcado-design.md` (commits `11151c8` + `ae1f8ac`).

## File Structure

| Path | Status | Responsabilidade |
|------|--------|------------------|
| `lib/poker/tierTheme.ts` | NEW | Mapas Tailwind por tier (TIER_BORDER, TIER_ACCENT_BG, TIER_FG). Single source of truth pras cores. |
| `lib/poker/tierCopy.ts` | NEW | Registro `TIER_COPY: Record<number, TierCopy>` + `getTierCopy(tier)` com fallback. |
| `components/trainer/TierBadge.tsx` | NEW | Bloco destacado no topo de `/meu-plano` com cor do `playerTier`. |
| `components/trainer/SpotCard.tsx` | MODIFY | Refactor de imports — remove os mapas inline (linhas 11-27), importa de `tierTheme`. Sem mudança visual. |
| `components/trainer/PlanScreen.tsx` | MODIFY | Instancia `<TierBadge>` antes do título. Adiciona `<p>` com `planHeaderBlurb` abaixo do subtítulo atual. Propaga `playerTier` pro `MonthlyScoreboard`. |
| `components/trainer/MonthlyScoreboard.tsx` | MODIFY | Aceita prop nova `playerTier?: number | null`. Renderiza `scoreboardContext` dentro do `ReadyView`. |

## Task Order

6 tasks. Ordem importa pra evitar tsc broken entre tasks (todas as tasks devem deixar tsc clean):

1. **Task 1** — Lib pura: `lib/poker/tierTheme.ts` (mapas).
2. **Task 2** — Lib pura: `lib/poker/tierCopy.ts` (copies + getTierCopy).
3. **Task 3** — Refactor: `SpotCard.tsx` importa de `tierTheme`.
4. **Task 4** — Componente: `TierBadge.tsx`.
5. **Task 5** — Wire: `PlanScreen.tsx` (badge + blurb + propaga playerTier).
6. **Task 6** — Wire: `MonthlyScoreboard.tsx` (prop + scoreboardContext).
7. **Task 7** — Sanity final.

---

## Task 1 — `lib/poker/tierTheme.ts` (novo)

**Files:**
- Create: `lib/poker/tierTheme.ts`

**Por quê:** Centralizar os 3 mapas Tailwind que hoje vivem inline em `SpotCard.tsx:11-27`. `TierBadge` (Task 4) vai usar os mesmos. Sem duplicar.

- [ ] **Step 1: Criar `lib/poker/tierTheme.ts`**

```ts
/**
 * Mapas de cor por tier (amber/orange/red).
 *
 * Originalmente embutidos em SpotCard.tsx; centralizados aqui pra reuso
 * em TierBadge (cor do tier do aluno) sem duplicação.
 *
 * Tailwind classes esperam Record<number, string> indexado pelo número
 * do tier. Consumidores devem aplicar fallback `?? TIER_*[1]` pra planos
 * antigos onde `tier` pode estar undefined.
 */

export const TIER_BORDER: Record<number, string> = {
  1: "border-amber-400/40",
  2: "border-orange-400/40",
  3: "border-red-400/40",
};

export const TIER_ACCENT_BG: Record<number, string> = {
  1: "bg-amber-400/5",
  2: "bg-orange-400/5",
  3: "bg-red-400/5",
};

export const TIER_FG: Record<number, string> = {
  1: "text-amber-300",
  2: "text-orange-300",
  3: "text-red-300",
};
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Arquivo novo, sem consumidor ainda — não pode quebrar nada.

- [ ] **Step 3: Lint**

Run: `npx eslint lib/poker/tierTheme.ts`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/poker/tierTheme.ts
git commit -m "$(cat <<'EOF'
feat(plan): lib/poker/tierTheme — mapas de cor por tier centralizados

Saca os 3 mapas Tailwind (TIER_BORDER, TIER_ACCENT_BG, TIER_FG) que
hoje vivem inline em SpotCard.tsx. TierBadge (próximo) vai reusar
os mesmos. Refactor a seguir no SpotCard.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `lib/poker/tierCopy.ts` (novo)

**Files:**
- Create: `lib/poker/tierCopy.ts`

**Por quê:** Registro central de copies por tier — 3 campos × 3 tiers = 9 strings. `TierBadge`, `PlanScreen` e `MonthlyScoreboard` consomem o mesmo.

- [ ] **Step 1: Criar `lib/poker/tierCopy.ts`**

```ts
/**
 * Copy adaptada por tier do aluno.
 *
 * 3 campos por tier:
 * - badgeEyebrow: eyebrow do TierBadge ("🎯 VOCÊ É TIER N")
 * - planHeaderBlurb: linha extra de contexto motivacional no header de
 *   /meu-plano (logo abaixo do subtítulo informativo existente)
 * - scoreboardContext: linha de contexto curta no MonthlyScoreboard
 *   (logo abaixo do título "Metas do mês")
 *
 * Consumidores usam `getTierCopy(tier)` pra resolver com fallback Tier 1.
 */

export interface TierCopy {
  badgeEyebrow: string;
  planHeaderBlurb: string;
  scoreboardContext: string;
}

export const TIER_COPY: Record<number, TierCopy> = {
  1: {
    badgeEyebrow: "🎯 VOCÊ É TIER 1",
    planHeaderBlurb:
      "Foque em consistência. Domine os fundamentos antes de subir.",
    scoreboardContext:
      "Tier 1 é construção de base — disciplina semanal vale mais que ousadia.",
  },
  2: {
    badgeEyebrow: "🎯 VOCÊ É TIER 2",
    planHeaderBlurb:
      "Reg de Reg — refine os spots de alta frequência e elimine vazamentos caros.",
    scoreboardContext:
      "Tier 2 vive de detalhes. Cada % a mais de acerto vira ROI.",
  },
  3: {
    badgeEyebrow: "🎯 VOCÊ É TIER 3",
    planHeaderBlurb:
      "Você joga no topo. Cada decisão vale dinheiro grande — precisão acima de tudo.",
    scoreboardContext:
      "Tier 3 é território de elite. O placar abaixo te lembra do padrão que você precisa manter.",
  },
};

/**
 * Resolve copy do tier com fallback Tier 1 quando `tier` é undefined/null
 * (planos antigos) ou fora do range conhecido (1..3).
 */
export function getTierCopy(tier: number | null | undefined): TierCopy {
  return TIER_COPY[tier ?? 1] ?? TIER_COPY[1];
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Smoke `tsx`**

Criar `./tmp-smoke-tierCopy.ts`:

```ts
import { getTierCopy, TIER_COPY } from "./lib/poker/tierCopy";

console.log("[T1 badge]", getTierCopy(1).badgeEyebrow);
console.log("[T2 badge]", getTierCopy(2).badgeEyebrow);
console.log("[T3 badge]", getTierCopy(3).badgeEyebrow);
console.log("[undef -> T1]", getTierCopy(undefined).badgeEyebrow);
console.log("[null -> T1]",  getTierCopy(null).badgeEyebrow);
console.log("[999 -> T1]",   getTierCopy(999).badgeEyebrow);
console.log("[keys count]",  Object.keys(TIER_COPY).length);
```

Run: `npx tsx ./tmp-smoke-tierCopy.ts`
Expected:
```
[T1 badge] 🎯 VOCÊ É TIER 1
[T2 badge] 🎯 VOCÊ É TIER 2
[T3 badge] 🎯 VOCÊ É TIER 3
[undef -> T1] 🎯 VOCÊ É TIER 1
[null -> T1] 🎯 VOCÊ É TIER 1
[999 -> T1] 🎯 VOCÊ É TIER 1
[keys count] 3
```

DELETE `tmp-smoke-tierCopy.ts` antes do commit.

- [ ] **Step 4: Lint**

Run: `npx eslint lib/poker/tierCopy.ts`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/tierCopy.ts
git commit -m "$(cat <<'EOF'
feat(plan): lib/poker/tierCopy — copies por tier + getTierCopy

Registro central com 9 strings (3 tiers × 3 campos: badgeEyebrow,
planHeaderBlurb, scoreboardContext). Helper getTierCopy(tier) com
fallback Tier 1 cobre planos antigos (undefined/null) e tiers fora
do range.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Refactor `SpotCard.tsx` (importa de `tierTheme`)

**Files:**
- Modify: `components/trainer/SpotCard.tsx:11-27` (remove os 3 mapas inline)

**Por quê:** Os mapas saem pro arquivo novo. SpotCard passa a importar — sem mudança visual nenhuma.

- [ ] **Step 1: Editar imports de `SpotCard.tsx`**

Adicionar import junto com os outros do topo (após `getGradeUrl` na linha 9):

```ts
import { TIER_BORDER, TIER_ACCENT_BG, TIER_FG } from "@/lib/poker/tierTheme";
```

- [ ] **Step 2: Remover os mapas inline**

Apagar exatamente as linhas 11-27 (atual). Devem sumir os 3 `const TIER_BORDER`, `TIER_ACCENT_BG`, `TIER_FG`. O bloco fica:

```ts
import { TIER_BORDER, TIER_ACCENT_BG, TIER_FG } from "@/lib/poker/tierTheme";

type State = "active" | "locked" | "completed";
```

(`type State` deve continuar na linha que estava — 29 antes, ~13 depois da remoção.)

- [ ] **Step 3: Verificar que os consumidores no arquivo continuam funcionando**

Os mapas são consumidos em 3 lugares dentro de `SpotCard.tsx`:
- Função principal `SpotCard` (resolve `tierBorder`, `tierAccentBg`, `tierFg` antes do return).
- `LockedCard` (resolve `tierFg`).
- `CompletedCard` (resolve `tierFg`).

NENHUM desses precisa mudar — os nomes dos símbolos importados são os mesmos. Apenas confirmar via grep.

Run:
```bash
grep -n "TIER_BORDER\|TIER_ACCENT_BG\|TIER_FG" components/trainer/SpotCard.tsx
```
Expected: 6+ ocorrências (1 import + uso em 3 funções).

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Refactor mecânico — não pode introduzir erro.

- [ ] **Step 5: Lint**

Run: `npx eslint components/trainer/SpotCard.tsx`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/trainer/SpotCard.tsx
git commit -m "$(cat <<'EOF'
refactor(plan): SpotCard importa mapas de cor por tier de tierTheme

Move TIER_BORDER, TIER_ACCENT_BG, TIER_FG inline pra lib/poker/tierTheme.
SpotCard apenas troca import — sem mudança visual nem comportamental.
Prep pra TierBadge (próxima) reusar os mesmos mapas.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `components/trainer/TierBadge.tsx` (novo)

**Files:**
- Create: `components/trainer/TierBadge.tsx`

**Por quê:** Bloco destacado no topo de `/meu-plano`, cor por `playerTier`. Reforço visual permanente do tier do aluno.

- [ ] **Step 1: Criar `components/trainer/TierBadge.tsx`**

```tsx
"use client";

/**
 * TierBadge — bloco destacado no topo de /meu-plano com o tier do aluno.
 *
 * Renderizado ANTES do título do plano. Cor por playerTier (amber/orange/red).
 * Sem sticky scroll — sai do viewport naturalmente.
 *
 * Mostra:
 * - eyebrow "🎯 VOCÊ É TIER N" (cor do tier)
 * - linha principal: playerTierLabel (ex: "Tier 2 · Intermediário")
 * - linha secundária: "{accuracyPct}% de acerto no diagnóstico"
 *
 * Fallback: planos antigos sem playerTier → Tier 1 (amber).
 * playerTierLabel ausente → "Tier ?".
 * accuracyPct ausente → linha secundária omite a parte do %.
 */

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  TIER_BORDER,
  TIER_ACCENT_BG,
  TIER_FG,
} from "@/lib/poker/tierTheme";
import { getTierCopy } from "@/lib/poker/tierCopy";

interface Props {
  plan: SavedPlan;
}

export function TierBadge({ plan }: Props) {
  const tier = plan.playerTier ?? 1;
  const border = TIER_BORDER[tier] ?? TIER_BORDER[1];
  const bg = TIER_ACCENT_BG[tier] ?? TIER_ACCENT_BG[1];
  const fg = TIER_FG[tier] ?? TIER_FG[1];
  const copy = getTierCopy(tier);

  const label = plan.playerTierLabel ?? "Tier ?";
  const accuracy = plan.accuracyPct;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`rg-card border ${border} ${bg}`}
      style={{ padding: 20, borderRadius: "var(--rg-r-lg)", marginBottom: 16 }}
    >
      <p className={`rg-eyebrow ${fg}`}>{copy.badgeEyebrow}</p>
      <h2 className="rg-h3" style={{ marginTop: 6 }}>{label}</h2>
      <p className="rg-caption" style={{ marginTop: 4 }}>
        {accuracy != null
          ? `${accuracy}% de acerto no diagnóstico`
          : "Resultado do diagnóstico não disponível"}
      </p>
    </motion.div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Componente novo, ainda sem consumidor — não pode quebrar nada.

- [ ] **Step 3: Lint**

Run: `npx eslint components/trainer/TierBadge.tsx`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/trainer/TierBadge.tsx
git commit -m "$(cat <<'EOF'
feat(plan): TierBadge — bloco destacado com tier do aluno

Componente novo renderizado no topo de /meu-plano (antes do título
do plano). Cor por playerTier (amber/orange/red), eyebrow "VOCÊ É
TIER N", label e accuracyPct. Sem sticky. Fallback Tier 1 cobre
planos antigos.

Próximo: wire em PlanScreen.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Wire em `PlanScreen.tsx` (badge + blurb + propaga playerTier)

**Files:**
- Modify: `components/trainer/PlanScreen.tsx`

**Por quê:** Liga o `TierBadge` na tela, adiciona blurb tier-específica como linha extra no header, e propaga `playerTier` pro `MonthlyScoreboard`.

- [ ] **Step 1: Adicionar imports**

Editar topo de `PlanScreen.tsx`. Junto com os imports atuais (linhas 12-17), adicionar:

```tsx
import { TierBadge } from "./TierBadge";
import { getTierCopy } from "@/lib/poker/tierCopy";
```

- [ ] **Step 2: Instanciar `<TierBadge>` ANTES do título do plano**

Localizar o `<h1>` em `PlanScreen.tsx:100-105`:

```tsx
<h1
  className="rg-display"
  style={{ marginTop: 28, color: "var(--rg-fg)" }}
>
  Plano de Progressão Individual — {plan.playerName}.
</h1>
```

Inserir `<TierBadge plan={plan} />` IMEDIATAMENTE ANTES do `<h1>`:

```tsx
<TierBadge plan={plan} />
<h1
  className="rg-display"
  style={{ marginTop: 28, color: "var(--rg-fg)" }}
>
  Plano de Progressão Individual — {plan.playerName}.
</h1>
```

- [ ] **Step 3: Adicionar linha extra com `planHeaderBlurb` após o subtítulo atual**

Localizar o JSX retornado pelo IIFE em `PlanScreen.tsx:124-139`:

```tsx
return (
  <>
    <p
      className="rg-eyebrow"
      style={{ marginTop: 12 }}
    >
      {tierLabel} · Dia {cycleDay} de 90
    </p>
    <p
      className="rg-body-sm"
      style={{ marginTop: 4 }}
    >
      {plan.accuracyPct}% de acerto no nivelamento · {profitShort} · {studyShort}
    </p>
  </>
);
```

Adicionar UMA TERCEIRA `<p>` LOGO ABAIXO do `<p className="rg-body-sm">`:

```tsx
return (
  <>
    <p
      className="rg-eyebrow"
      style={{ marginTop: 12 }}
    >
      {tierLabel} · Dia {cycleDay} de 90
    </p>
    <p
      className="rg-body-sm"
      style={{ marginTop: 4 }}
    >
      {plan.accuracyPct}% de acerto no nivelamento · {profitShort} · {studyShort}
    </p>
    <p
      className="rg-caption"
      style={{ marginTop: 8 }}
    >
      {getTierCopy(plan.playerTier).planHeaderBlurb}
    </p>
  </>
);
```

- [ ] **Step 4: Propagar `plan.playerTier` pro `<MonthlyScoreboard>`**

Localizar `<MonthlyScoreboard diagnosticId={plan.diagnosticId} />` em `PlanScreen.tsx:181`. Adicionar a prop:

```tsx
<MonthlyScoreboard
  diagnosticId={plan.diagnosticId}
  playerTier={plan.playerTier}
/>
```

NOTE: a Task 6 vai aceitar essa prop. Entre Task 5 (commit) e Task 6 (impl), `tsc` vai ficar com 1 erro em `MonthlyScoreboard` ("Property 'playerTier' does not exist on type ..."). Isso é esperado e documentado.

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: 1 erro em `MonthlyScoreboard.tsx` ("playerTier" não existe no Props). Confirmar com:

```bash
npx tsc --noEmit 2>&1 | grep -v "MonthlyScoreboard.tsx"
```

Expected: vazio (ou só linhas em branco). Erros em outros arquivos = problema.

- [ ] **Step 6: Lint**

Run: `npx eslint components/trainer/PlanScreen.tsx`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add components/trainer/PlanScreen.tsx
git commit -m "$(cat <<'EOF'
feat(plan): PlanScreen — TierBadge + blurb tier + propaga playerTier

3 mudanças no /meu-plano:
- <TierBadge plan={plan} /> antes do título.
- Linha extra <p className=rg-caption> abaixo do subtítulo informativo
  com getTierCopy(playerTier).planHeaderBlurb.
- <MonthlyScoreboard> recebe playerTier (consumido na Task 6).

tsc temporariamente quebra em MonthlyScoreboard.tsx — fechado na
Task 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Wire em `MonthlyScoreboard.tsx` (prop + scoreboardContext)

**Files:**
- Modify: `components/trainer/MonthlyScoreboard.tsx`

**Por quê:** Fecha o tsc da Task 5. Aceita prop opcional `playerTier` e renderiza `scoreboardContext` no `ReadyView`.

- [ ] **Step 1: Adicionar prop `playerTier` à interface `Props`**

Localizar `interface Props` em `MonthlyScoreboard.tsx:30-32`:

```tsx
interface Props {
  diagnosticId: string;
}
```

Adicionar `playerTier`:

```tsx
interface Props {
  diagnosticId: string;
  /** Tier do aluno (1..3) vindo do nivelamento. Opcional pra back-compat
   *  com callers que ainda não passam — sem prop, scoreboardContext não
   *  renderiza. */
  playerTier?: number | null;
}
```

- [ ] **Step 2: Destructure `playerTier` no componente principal**

Localizar `export function MonthlyScoreboard({ diagnosticId }: Props) {` em `MonthlyScoreboard.tsx:58`. Adicionar `playerTier`:

```tsx
export function MonthlyScoreboard({ diagnosticId, playerTier }: Props) {
```

- [ ] **Step 3: Propagar `playerTier` pro `<ReadyView>`**

Localizar onde `<ReadyView data={state.data} />` é chamado em `MonthlyScoreboard.tsx:122`. Acrescentar:

```tsx
{state.kind === "ready" && (
  <ReadyView data={state.data} playerTier={playerTier} />
)}
```

- [ ] **Step 4: Atualizar `ReadyView` pra aceitar `playerTier` e renderizar `scoreboardContext`**

Localizar a assinatura de `ReadyView` em `MonthlyScoreboard.tsx:131`:

```tsx
function ReadyView({ data }: { data: ScoreboardData }) {
  const monthLabel = data.month.label.toUpperCase();
  return (
    <>
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        Metas do mês · {monthLabel}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
```

Atualizar assinatura + adicionar import + renderizar a linha:

```tsx
function ReadyView({
  data,
  playerTier,
}: {
  data: ScoreboardData;
  playerTier?: number | null;
}) {
  const monthLabel = data.month.label.toUpperCase();
  return (
    <>
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        Metas do mês · {monthLabel}
      </p>
      {playerTier != null && (
        <p className="text-xs text-neutral-500" style={{ marginTop: 4 }}>
          {getTierCopy(playerTier).scoreboardContext}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
```

- [ ] **Step 5: Adicionar import de `getTierCopy`**

Localizar imports do topo de `MonthlyScoreboard.tsx:12-16`. Acrescentar logo após:

```tsx
import { getTierCopy } from "@/lib/poker/tierCopy";
```

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0 (tudo CLEAN — fechou o gap da Task 5).

- [ ] **Step 7: Lint**

Run: `npx eslint components/trainer/MonthlyScoreboard.tsx`
Expected: exit 0.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: build completa. Confirma que toda a cadeia compila.

- [ ] **Step 9: Commit**

```bash
git add components/trainer/MonthlyScoreboard.tsx
git commit -m "$(cat <<'EOF'
feat(plan): MonthlyScoreboard aceita playerTier + mostra scoreboardContext

Prop nova playerTier?: number | null (opcional pra back-compat).
Quando definido, renderiza linha curta de contexto por tier dentro
do ReadyView, logo abaixo do título "Metas do mês".

Fecha o tsc da Task 5.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Sanity check final

**Files:** nenhum.

**Por quê:** Atravessar critérios de aceite do spec com a feature inteira no ar.

- [ ] **Step 1: tsc + build no HEAD**

Run: `npx tsc --noEmit && echo "TSC OK" && npm run build 2>&1 | tail -8`
Expected: `TSC OK` + build completa.

- [ ] **Step 2: Smoke `tsx` lib pura**

Recriar `./tmp-smoke-tierCopy.ts` se quiser revalidar:

```ts
import { getTierCopy } from "./lib/poker/tierCopy";

for (const t of [1, 2, 3, undefined, null, 999]) {
  console.log(`[t=${t}]`, getTierCopy(t).badgeEyebrow);
}
```

Run: `npx tsx ./tmp-smoke-tierCopy.ts`
Expected: 6 linhas; 1/2/3 batem os respectivos eyebrows, undef/null/999 caem em Tier 1.

DELETE `tmp-smoke-tierCopy.ts` ao final.

- [ ] **Step 3: Smoke visual — aluno Tier 1**

Run: `npm run dev`

Abrir `/meu-plano` autenticado como aluno Tier 1. Conferir:

- [ ] TierBadge no topo com border amber + bg amber.
- [ ] Eyebrow "🎯 VOCÊ É TIER 1" em amber.
- [ ] Label "Tier 1 · Fundamentos" + linha "{X}% de acerto no diagnóstico".
- [ ] Subtítulo do header continua mostrando `{accuracyPct}% de acerto no nivelamento · {profit} · {study}`.
- [ ] Linha extra abaixo do subtítulo: "Foque em consistência. Domine os fundamentos antes de subir."
- [ ] MonthlyScoreboard mostra "Tier 1 é construção de base — disciplina semanal vale mais que ousadia." logo abaixo de "Metas do mês".
- [ ] SpotCards NÃO mudaram — borders e accent bg seguem por TIER DO SPOT (amarelo/laranja/vermelho conforme o spot).

- [ ] **Step 4: Smoke visual — aluno Tier 2**

Mesmo aluno com plano Tier 2. Conferir:
- [ ] TierBadge orange.
- [ ] Eyebrow "🎯 VOCÊ É TIER 2".
- [ ] Blurb header: "Reg de Reg — refine os spots de alta frequência…"
- [ ] Scoreboard: "Tier 2 vive de detalhes…"

- [ ] **Step 5: Smoke visual — aluno Tier 3**

Mesmo, Tier 3. Conferir:
- [ ] TierBadge red.
- [ ] Eyebrow "🎯 VOCÊ É TIER 3".
- [ ] Blurb header: "Você joga no topo…"
- [ ] Scoreboard: "Tier 3 é território de elite…"

- [ ] **Step 6: Smoke backward compat — plano antigo sem playerTier**

Se possível, abrir `/meu-plano` de aluno cujo plano foi gerado ANTES do `playerTier` existir. Conferir:

- [ ] TierBadge amber + copy Tier 1.
- [ ] Label "Tier ?" (fallback).
- [ ] Blurb header: copy Tier 1.
- [ ] MonthlyScoreboard NÃO mostra `scoreboardContext` (playerTier null → linha não renderiza). Placar não quebra.

- [ ] **Step 7: Checar critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-08-tier-do-aluno-reforcado-design.md` seção "Critérios de Aceite". Marcar:

- [ ] `lib/poker/tierTheme.ts` criado.
- [ ] `SpotCard.tsx` importa de `tierTheme` sem mudança visual.
- [ ] `lib/poker/tierCopy.ts` criado (TIER_COPY 9 strings + getTierCopy).
- [ ] `components/trainer/TierBadge.tsx` criado.
- [ ] `PlanScreen.tsx` renderiza `<TierBadge>` antes do título.
- [ ] Subtítulo do header ganha linha extra com `planHeaderBlurb`.
- [ ] `MonthlyScoreboard.tsx` ganha prop `playerTier?: number | null` e mostra `scoreboardContext`.
- [ ] `PlanScreen.tsx` propaga `plan.playerTier` pra `<MonthlyScoreboard>`.
- [ ] Plano antigo renderiza Tier 1 + sem scoreboardContext sem erro.
- [ ] tsc, lint, build limpos.
- [ ] Nenhuma mudança em SpotTrack, GradeCard, ResourcesBlock.

---

## Self-Review

**1. Spec coverage:**
- TierBadge ✓ Task 4
- tierTheme refactor ✓ Tasks 1+3
- tierCopy ✓ Task 2
- Wire PlanScreen (badge + blurb + propaga playerTier) ✓ Task 5
- Wire MonthlyScoreboard (prop + scoreboardContext) ✓ Task 6
- Sanity backward compat ✓ Task 7 step 6
- Sanity por tier (1/2/3) ✓ Task 7 steps 3-5

**2. Placeholder scan:** nenhuma ocorrência de "TBD", "TODO", "implement later", "fill in details", "handle edge cases" no plan. Todos os steps têm código exato ou comando exato.

**3. Type consistency:**
- `TierCopy { badgeEyebrow, planHeaderBlurb, scoreboardContext }` — definida em Task 2, consumida em Tasks 4, 5, 6 com os mesmos nomes.
- `TIER_BORDER / TIER_ACCENT_BG / TIER_FG` — exportados em Task 1, importados em Tasks 3 (refactor SpotCard) e 4 (TierBadge) com os mesmos nomes.
- `getTierCopy(tier: number | null | undefined): TierCopy` — definida em Task 2, chamada em Tasks 4, 5, 6 sempre como `getTierCopy(plan.playerTier)` ou `getTierCopy(playerTier)`.
- `MonthlyScoreboard` Props ganha `playerTier?: number | null` em Task 6, propagado em Task 5 (gap esperado e documentado).
- `SavedPlan.playerTier` e `playerTierLabel` e `accuracyPct` já existem em `lib/poker/planStorage.ts` — sem mudança.

**4. Backward compat:** garantido em 4 lugares independentes:
- `TIER_BORDER[tier] ?? TIER_BORDER[1]` (e variantes) em TierBadge e SpotCard.
- `getTierCopy(undefined) → TIER_COPY[1]` (fallback dentro da função).
- `plan.playerTierLabel ?? "Tier ?"` no TierBadge.
- `playerTier != null &&` no ReadyView do MonthlyScoreboard.

**5. Build order:** Task 5 deixa tsc temporariamente broken em `MonthlyScoreboard.tsx` (1 erro: prop nova não existe). Task 6 fecha. Esperado e documentado no Step 5 da Task 5.
