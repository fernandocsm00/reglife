# A5 — Tier do aluno reforçado (TierBadge + copy por tier)

**Apelido interno:** entrega A5 da auditoria — tier do aluno mais presente.

## Contexto

Hoje `/meu-plano` mostra o tier do aluno (`playerTierLabel`) só como eyebrow do título do plano — um texto curto, sem peso visual. A reunião pediu reforçar esse conceito: o aluno precisa **sentir** que pertence a um tier específico (Tier 1 / Tier 2 / Tier 3) ao longo da experiência, não só ler uma vez.

Importante: tier do aluno **continua sendo derivado do nivelamento** (`assessTier(byTier)` em `lib/poker/leakAnalysis.ts:316`). NÃO vem da ABI/banca, apesar do que a spec da reforma A6 dizia. O algoritmo atual não muda.

A entrega anterior (reforma do bloco de spots — A1+A4+A6+A7) introduziu cores por tier **do spot** (amber/orange/red) no SpotCard. Essa decisão **fica intacta** — A5 não toca SpotCard, SpotTrack, GradeCard nem ResourcesBlock.

## Decisões

| Tema | Decisão |
|---|---|
| O que A5 muda | Reforça presença visual do `playerTier` na UX |
| Cor dos SpotCards | Continua vindo do tier do spot (A6 fica) |
| Derivação do `playerTier` | Sem mudança — `assessTier` atual permanece |
| Schema | Sem mudança — usa `playerTier` e `playerTierLabel` que já existem |
| Fallback | Plano antigo sem tier → Tier 1 (amber, copy default) |
| Escopo visual | Web (`/meu-plano`). PDF fica fora desta entrega |

## Arquitetura

3 mudanças na camada de UI + 1 refactor de tema:

1. **`lib/poker/tierTheme.ts`** (novo) — exporta `TIER_BORDER`, `TIER_ACCENT_BG`, `TIER_FG` (Tailwind classes amber/orange/red). Move os 3 mapas que hoje vivem inline em `SpotCard.tsx`. Centraliza pra serem reusados pelo `TierBadge`.

2. **`lib/poker/tierCopy.ts`** (novo) — exporta `TIER_COPY: Record<number, TierCopy>` com 3 campos por tier (eyebrow, planHeaderBlurb, scoreboardContext) e função `getTierCopy(tier)` com fallback Tier 1.

3. **`components/trainer/TierBadge.tsx`** (novo) — bloco destacado, renderizado no topo de `/meu-plano` antes do título do plano. Cor do **tier do aluno**. Sem sticky scroll.

4. **Wire em `PlanScreen.tsx` e `MonthlyScoreboard.tsx`** — instancia `TierBadge` + troca copies estáticas por `getTierCopy(plan.playerTier).*`.

Layer de dados não muda. SpotCard sofre só refactor (importa de `tierTheme` em vez de definir mapas localmente) — zero mudança visual.

## Componentes

### `lib/poker/tierTheme.ts`

```ts
/**
 * Mapas de cor por tier (amber/orange/red).
 * Originalmente embutidos em SpotCard.tsx; centralizados aqui pra reuso
 * em TierBadge (cor do tier do aluno) sem duplicação.
 *
 * Tailwind classes esperam Record<number, string> indexado pelo número
 * do tier. Consumidores aplicam fallback `?? TIER_*[1]` pra planos
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

### `lib/poker/tierCopy.ts`

```ts
/**
 * Copy adaptada por tier do aluno.
 *
 * 3 campos por tier:
 * - badgeEyebrow: eyebrow do TierBadge ("🎯 VOCÊ É TIER N")
 * - planHeaderBlurb: subtítulo curto no header de /meu-plano
 * - scoreboardContext: linha de contexto no MonthlyScoreboard
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

### `components/trainer/TierBadge.tsx`

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
 * accuracyPct ausente → linha secundária omite a parte do %.
 */

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { TIER_BORDER, TIER_ACCENT_BG, TIER_FG } from "@/lib/poker/tierTheme";
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

### Wire em `PlanScreen.tsx`

Acima do título principal do plano:

```tsx
<TierBadge plan={plan} />
<h1 className="rg-h1">{plan.title}</h1>
<p className="rg-body-sm">{getTierCopy(plan.playerTier).planHeaderBlurb}</p>
```

O subtítulo informativo atual (`{accuracyPct}% de acerto no nivelamento · {profitShort} · {studyShort}`, linhas 132-137) **permanece** — carrega info útil. A blurb por tier é **adicionada como linha extra** logo abaixo, em `<p className="rg-caption">` com `marginTop: 8`, dando contexto motivacional sem competir com a info do subtítulo.

### Wire em `MonthlyScoreboard.tsx`

`MonthlyScoreboard` hoje só recebe `diagnosticId`. Ganha prop opcional `playerTier?: number | null` (opcional pra não quebrar callers que ainda não passam). `PlanScreen.tsx` passa `plan.playerTier`.

Adiciona linha discreta de contexto dentro do `ReadyView`, logo abaixo do título "Metas do mês · {monthLabel}":

```tsx
{playerTier != null && (
  <p className="text-xs text-neutral-500" style={{ marginTop: 4 }}>
    {getTierCopy(playerTier).scoreboardContext}
  </p>
)}
```

`playerTier` é propagado por prop até `ReadyView`. Quando `null/undefined`, a linha não renderiza (mantém o placar limpo pra casos legados).

## Data Flow

```
Diagnóstico → assessTier(byTier) → playerTier (1..3)
                                        ↓
                              SavedPlan.playerTier
                                        ↓
                  ┌─────────────────────┼─────────────────────┐
                  ↓                     ↓                     ↓
            TierBadge            PlanScreen.blurb      MonthlyScoreboard
            (cor + eyebrow)       (planHeaderBlurb)   (scoreboardContext)
```

Tudo derivado client-side a partir do mesmo `plan.playerTier` que já vem do servidor. Sem novas chamadas, sem mudança em endpoints.

## Backward Compat

Sem migration. Sem schema change.

- **`playerTier` ausente** (plano antigo gerado antes do conceito): cai em Tier 1 via `?? 1`. `getTierCopy(undefined)` retorna `TIER_COPY[1]`. Cor amber.
- **`playerTierLabel` ausente**: label vira `"Tier ?"` (mesmo fallback do header do plano hoje).
- **`accuracyPct` ausente**: linha secundária do TierBadge mostra "Resultado do diagnóstico não disponível".

Cobertos por 3 fallbacks independentes — nenhuma quebra de render.

## Out of Scope

- **PDF** — gerado por `lib/pdf/utils.ts` segue inalterado. Pode receber tratamento equivalente em entrega futura ("A5 + PDF").
- **Sticky scroll** do TierBadge — explicitamente fora por complexidade de layout. Pode virar opção depois.
- **Pílula tier do spot no SpotCard** — fica como está (mostra "Tier N · X%"). Não muda na A5.
- **A3, A8** — pendências de outras famílias.

## Critérios de Aceite

- [ ] `lib/poker/tierTheme.ts` criado com `TIER_BORDER`, `TIER_ACCENT_BG`, `TIER_FG`.
- [ ] `SpotCard.tsx` importa esses mapas em vez de definir localmente (refactor sem mudança visual).
- [ ] `lib/poker/tierCopy.ts` criado com `TIER_COPY` (9 strings: 3 tiers × 3 campos) + `getTierCopy(tier)`.
- [ ] `components/trainer/TierBadge.tsx` criado.
- [ ] `PlanScreen.tsx` renderiza `<TierBadge plan={plan} />` antes do título do plano.
- [ ] Subtítulo do header de `/meu-plano` vem de `getTierCopy(plan.playerTier).planHeaderBlurb`.
- [ ] `MonthlyScoreboard.tsx` ganha prop `playerTier?: number | null` e mostra `getTierCopy(playerTier).scoreboardContext` quando definido.
- [ ] `PlanScreen.tsx` propaga `plan.playerTier` pra `<MonthlyScoreboard>`.
- [ ] Plano antigo (sem `playerTier`) renderiza Tier 1 (amber + copy default) sem erro.
- [ ] `tsc --noEmit`, lint e build limpos.
- [ ] Nenhuma mudança em SpotCard (além do refactor de import), SpotTrack, GradeCard, ResourcesBlock.

## Validação Manual

Projeto não tem suite de testes. Validar smokes:

1. Aluno Tier 1 → TierBadge amber, copy "Foque em consistência…", scoreboard mostra "Tier 1 é construção de base…".
2. Aluno Tier 2 → TierBadge orange, copy "Reg de Reg…".
3. Aluno Tier 3 → TierBadge red, copy "Você joga no topo…".
4. Plano antigo sem `playerTier` → TierBadge amber + copy Tier 1, label "Tier ?".

`scripts/check-spotTrack.ts` segue passando (sem mudança no consumidor dele).
