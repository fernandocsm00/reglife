# Spot Block Reform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformar o bloco de spots em `/meu-plano` consolidando 4 pendências da auditoria: remover "Por que esse spot" (A1), adicionar 3 seções "Estuda/Treina/Joga" por SpotCard (A4), aplicar cores por tier (A6), e criar bloco separado `GradeCard` (A7).

**Architecture:** `LeakBucket` ganha campo `tier` derivado do `ResultEntry.tier`. `SpotTrackEntry` propaga. Novo helper `getGradeUrl(plan)` em `spotTrack.ts`. `SpotCard` reformulado em 3 seções com cor dinâmica por tier. Novo `GradeCard.tsx` renderizado entre `<SpotTrack>` e `<ResourcesBlock>` no `PlanScreen`. Backward-compat com planos antigos via fallback Tier 1.

**Tech Stack:** Next.js App Router (TS), React client components, Tailwind para cores dinâmicas. Sem framework de testes — validação via `tsc`/`lint`/`build` + smoke `tsx` na lib + visual no dev.

**Spec base:** `docs/superpowers/specs/2026-06-02-spot-block-reform-design.md` (commit `20ac0c0`).

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/leakAnalysis.ts` | **Modify** | `LeakBucket` ganha `tier: number`. Builder no map (linha ~331) deriva `tier` do `ResultEntry.tier`. |
| `lib/poker/spotTrack.ts` | **Modify** | `SpotTrackEntry` ganha `tier: number`. `buildSpotTrack` propaga `leak.tier ?? 1`. Novo helper `getGradeUrl(plan)`. |
| `components/trainer/SpotCard.tsx` | **Modify** | Nova prop `plan`. Const `TIER_BORDER`/`TIER_ACCENT_BG`/`TIER_FG`. Remove bloco "Por que esse spot". Reorganiza em 3 seções (Estuda/Treina/Joga). LockedCard e CompletedCard aplicam cor por tier no eyebrow. |
| `components/trainer/GradeCard.tsx` | **Create** | Novo componente: eyebrow "TUA GRADE" + título ABI + descriptor + botão "Abrir grade →". Lida com `stakeGrade === null`. |
| `components/trainer/SpotTrack.tsx` | **Modify** (linha 124) | Passa `plan={plan}` pro `<SpotCard>`. |
| `components/trainer/PlanScreen.tsx` | **Modify** (linhas 15-16 imports, linha 257) | Import `GradeCard`. Instancia `<GradeCard plan={plan} />` entre `<SpotTrack>` e `<ResourcesBlock>`. |

Nenhum schema change. Nenhuma migração.

## Sequência das tasks

1. **Task 1** — Lib: `LeakBucket.tier` + builder + smoke `tsx`.
2. **Task 2** — Lib: `SpotTrackEntry.tier` + `getGradeUrl` + smoke `tsx`.
3. **Task 3** — Componente: `SpotCard` reformulado (A1+A4+A6).
4. **Task 4** — Componente: novo `GradeCard.tsx`.
5. **Task 5** — Wire: `SpotTrack` propaga plan, `PlanScreen` instancia `GradeCard`.
6. **Task 6** — Sanity check final.

---

## Task 1 — `LeakBucket` ganha `tier`

**Files:**
- Modify: `lib/poker/leakAnalysis.ts`

**Por quê:** Tier por spot tem que viver no `LeakBucket` (decisão prévia). Builder já tem acesso a `r.tier` no loop — só falta adicionar o campo na interface e atribuir.

- [ ] **Step 1: Adicionar `tier` à interface `LeakBucket`**

Editar `lib/poker/leakAnalysis.ts`. A interface atual (linhas 11-23):

```ts
export interface LeakBucket {
  /** Stable id, e.g. "RFI-BTN-15" */
  id: string;
  action: string; // "RFI" / "cBet" / etc
  actionLabel: string; // human-readable: "Vs RFI", "C-Bet" …
  position: string;
  stackBand: string; // "10bb", "15bb", "100bb"
  errors: number;
  total: number;
  examples: ResultEntry[];
  recommendation: string;
  lessons: LessonRef[];
}
```

Acrescentar `tier: number` entre `stackBand` e `errors`:

```ts
export interface LeakBucket {
  /** Stable id, e.g. "RFI-BTN-15" */
  id: string;
  action: string;
  actionLabel: string;
  position: string;
  stackBand: string;
  /** Tier do spot (1, 2, ou 3). Derivado do ResultEntry.tier. Default 1. */
  tier: number;
  errors: number;
  total: number;
  examples: ResultEntry[];
  recommendation: string;
  lessons: LessonRef[];
}
```

- [ ] **Step 2: Atribuir `tier` no builder do `LeakBucket`**

Localizar o bloco onde `leakMap.set(id, { ... })` é chamado (linhas 331-342). Atualmente:

```ts
leakMap.set(id, {
  id,
  action: r.action,
  actionLabel: spotDisplayLabel(r.action, r.position),
  position: r.position,
  stackBand: stackBand(r.stackSize),
  errors: r.isCorrect ? 0 : 1,
  total: 1,
  examples: r.isCorrect ? [] : [r],
  recommendation: recommendationFor(r.action, r.position, r.stackSize),
  lessons: recommendLessons(r.action, r.position, r.stackSize),
});
```

Trocar por (acrescentando `tier: r.tier`):

```ts
leakMap.set(id, {
  id,
  action: r.action,
  actionLabel: spotDisplayLabel(r.action, r.position),
  position: r.position,
  stackBand: stackBand(r.stackSize),
  tier: r.tier,
  errors: r.isCorrect ? 0 : 1,
  total: 1,
  examples: r.isCorrect ? [] : [r],
  recommendation: recommendationFor(r.action, r.position, r.stackSize),
  lessons: recommendLessons(r.action, r.position, r.stackSize),
});
```

`ResultEntry.tier` já existe em `lib/poker/diagnosticoStore.ts:20`, todos os drills carregam tier.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: erros podem aparecer em consumidores de `LeakBucket` que constroem o objeto direto (raros). Se aparecerem, anotar e tratar em steps seguintes desta task.

- [ ] **Step 4: Smoke `tsx` da derivação**

Criar `./tmp-smoke-leakAnalysis.ts` na raiz:

```ts
import { analyzeLeaks } from "./lib/poker/leakAnalysis";
import type { ResultEntry } from "./lib/poker/diagnosticoStore";

const results: ResultEntry[] = [
  {
    spotLabel: "RFI",
    action: "RFI",
    tier: 1,
    position: "BTN",
    stackSize: 40,
    board: "",
    hand: "AKo",
    picked: "fold",
    expected: ["raise"],
    isCorrect: false,
  },
  {
    spotLabel: "cBet",
    action: "cBet",
    tier: 2,
    position: "BTN",
    stackSize: 40,
    board: "QhJs9c",
    hand: "AKo",
    picked: "check",
    expected: ["bet"],
    isCorrect: false,
  },
];

const summary = analyzeLeaks(results);
console.log(
  "leaks:",
  summary.leaks.map((l) => ({ id: l.id, tier: l.tier })),
);
// Esperado: leaks: [ { id: "RFI-BTN", tier: 1 }, { id: "cBet-BTN", tier: 2 } ]
// (ordem pode variar por erros — confirma que ambos têm tier correto)
```

Run: `npx tsx ./tmp-smoke-leakAnalysis.ts`
Expected: cada leak no output tem `tier` correto (RFI=1, cBet=2). Se algum vier sem ou com tier errado, debugar e ajustar.

DELETE `tmp-smoke-leakAnalysis.ts` antes do commit.

- [ ] **Step 5: Lint**

Run: `npx eslint lib/poker/leakAnalysis.ts`
Expected: zero warnings/errors.

- [ ] **Step 6: Commit**

```bash
git add lib/poker/leakAnalysis.ts
git commit -m "$(cat <<'EOF'
feat(plan): LeakBucket ganha campo tier

Acrescenta tier: number à interface LeakBucket e atribui no builder
derivando de r.tier (ResultEntry). Cada leak passa a carregar o
tier do spot que ele representa. Persiste no SavedPlan.leaks como
campo extra (zero schema change). Backward-compat: planos antigos
sem tier serão tratados com fallback nos consumidores (Task 2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `SpotTrackEntry.tier` + `getGradeUrl(plan)`

**Files:**
- Modify: `lib/poker/spotTrack.ts`

**Por quê:** `SpotTrackEntry` propaga `tier` pro `SpotCard`. Novo helper `getGradeUrl` encapsula `getGradeLink` pra reuso pelo `SpotCard` seção Joga e pelo `GradeCard`.

- [ ] **Step 1: Adicionar `tier` ao `SpotTrackEntry`**

Editar `lib/poker/spotTrack.ts`. A interface atual (linhas 19-34):

```ts
export interface SpotTrackEntry {
  /** Order index 0..N — used as display number (1, 2, 3). */
  index: number;
  /** Leak id (ex.: "cBet-BTN-40"). Null only when filling an empty slot. */
  leakId: string | null;
  /** Pretty label (ex.: "Cbet do BTN em 40bb"). */
  label: string;
  /** Diagnostic % from the leak (0..100). Null when no leak (filler slot). */
  pct: number | null;
  /** Lesson URL (course content). */
  lessonUrl: string;
  /** Internal trainer slug or null when leak goes Tier-3 / external only. */
  trainerSlug: string | null;
  /** Has an internal trainer? Mirrors trainerSlug !== null. */
  hasInternalTrainer: boolean;
}
```

Acrescentar `tier: number` no fim:

```ts
export interface SpotTrackEntry {
  index: number;
  leakId: string | null;
  label: string;
  pct: number | null;
  lessonUrl: string;
  trainerSlug: string | null;
  hasInternalTrainer: boolean;
  /** Tier do spot (1, 2, ou 3). Propagado de leak.tier. Default 1. */
  tier: number;
}
```

- [ ] **Step 2: Propagar `leak.tier ?? 1` em `buildSpotTrack`**

A função atual (linhas 49-63) é:

```ts
export function buildSpotTrack(plan: SavedPlan): SpotTrackEntry[] {
  const leaks = [...topLeaks(plan, 3)].sort(
    (a, b) => canonicalSlotForLeak(a.id) - canonicalSlotForLeak(b.id)
  );

  return leaks.map((leak, i) => ({
    index: i,
    leakId: leak.id,
    label: leak.label,
    pct: leak.pct,
    lessonUrl: getLessonUrlForLeak(leak.id),
    trainerSlug: slugForLeak(leak.id),
    hasInternalTrainer: hasInternalTrainer(leak.id),
  }));
}
```

Acrescentar `tier: leak.tier ?? 1` ao objeto:

```ts
export function buildSpotTrack(plan: SavedPlan): SpotTrackEntry[] {
  const leaks = [...topLeaks(plan, 3)].sort(
    (a, b) => canonicalSlotForLeak(a.id) - canonicalSlotForLeak(b.id)
  );

  return leaks.map((leak, i) => ({
    index: i,
    leakId: leak.id,
    label: leak.label,
    pct: leak.pct,
    lessonUrl: getLessonUrlForLeak(leak.id),
    trainerSlug: slugForLeak(leak.id),
    hasInternalTrainer: hasInternalTrainer(leak.id),
    tier: leak.tier ?? 1,
  }));
}
```

`leak` aqui vem de `topLeaks(plan, 3)` que devolve `LeakBucket[]`. Como Task 1 adicionou `tier` ao bucket, `leak.tier` está disponível. `?? 1` cobre planos antigos cujo JSON na DB ainda não tem `tier` no leak.

- [ ] **Step 3: Adicionar helper `getGradeUrl(plan)`**

No final do arquivo (após `buildResources`), acrescentar:

```ts
/**
 * URL da grade de torneios para esse plano. Reusa getGradeLink.
 * Quando aluno não declarou banca (stakeGrade null), cai em
 * FIXED_LINKS.tournamentGrid (placeholder neutro).
 *
 * Encapsula getGradeLink pra que SpotCard (seção "Joga") e GradeCard
 * usem o mesmo ponto de verdade — evita import direto de spotLinks
 * em vários consumidores.
 */
export function getGradeUrl(plan: SavedPlan): string {
  return getGradeLink(plan.stakeGrade);
}
```

`getGradeLink` já está importado no topo do arquivo (verificar linha 12 atual). Se não estiver, adicionar.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: erros se algum consumidor de `SpotTrackEntry` constrói o objeto literal direto. SpotCard recebe via `entry` prop — sem mudança. `scripts/check-spotTrack.ts` pode precisar update.

Se aparecer erro em `scripts/check-spotTrack.ts`, adicionar `tier: 1` aos objetos de teste lá. Inspecionar e ajustar.

- [ ] **Step 5: Smoke `tsx` do helper**

Criar `./tmp-smoke-spotTrack.ts`:

```ts
import { getGradeUrl } from "./lib/poker/spotTrack";
import type { SavedPlan } from "./lib/poker/planStorage";

// stakeGrade = 4 → URL específica
const plan1 = { stakeGrade: 4 } as SavedPlan;
console.log("[1]", getGradeUrl(plan1));
// Esperado: https://reglife.com.br/abi-4

// stakeGrade = 7 → URL específica
const plan2 = { stakeGrade: 7 } as SavedPlan;
console.log("[2]", getGradeUrl(plan2));
// Esperado: https://reglife.com.br/abi-7

// stakeGrade = null → fallback genérico
const plan3 = { stakeGrade: null } as SavedPlan;
console.log("[3]", getGradeUrl(plan3));
// Esperado: https://reglife.com.br/aula-em-breve (FIXED_LINKS.tournamentGrid PLACEHOLDER)

// stakeGrade fora do mapa → fallback genérico
const plan4 = { stakeGrade: 999 } as SavedPlan;
console.log("[4]", getGradeUrl(plan4));
// Esperado: https://reglife.com.br/aula-em-breve
```

Run: `npx tsx ./tmp-smoke-spotTrack.ts`
Expected: 4 linhas batendo os comentários `// Esperado` (URLs exatas — confirmar contra `lib/poker/spotLinks.ts:27-36`).

DELETE `tmp-smoke-spotTrack.ts` antes do commit.

- [ ] **Step 6: Lint**

Run: `npx eslint lib/poker/spotTrack.ts`
Expected: zero warnings/errors.

- [ ] **Step 7: Commit**

```bash
git add lib/poker/spotTrack.ts
git commit -m "$(cat <<'EOF'
feat(plan): SpotTrackEntry.tier + getGradeUrl(plan)

SpotTrackEntry ganha tier propagado de leak.tier ?? 1 (backward-compat
com planos antigos). Novo helper getGradeUrl(plan) encapsula
getGradeLink pra que SpotCard (seção 'Joga') e GradeCard reusem
sem duplicar import.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `SpotCard.tsx` reformulado (A1 + A4 + A6)

**Files:**
- Modify: `components/trainer/SpotCard.tsx`

**Por quê:** Coração visual da entrega. Remove A1, adiciona A4 (3 seções), aplica A6 (cores por tier). Tudo num arquivo só pra evitar estado intermediário visual inconsistente.

- [ ] **Step 1: Atualizar imports e tipo `Props`**

Editar `components/trainer/SpotCard.tsx`. Após os imports atuais, garantir que `SavedPlan` está importado e adicionar `getGradeUrl`:

```ts
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { SpotTrackEntry } from "@/lib/poker/spotTrack";
import type { SpotProgress } from "@/lib/poker/spotTraining";
import { THRESHOLD_HANDS, THRESHOLD_PCT } from "@/lib/poker/spotTraining";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { getGradeUrl } from "@/lib/poker/spotTrack";
```

Atualizar interface `Props` pra incluir `plan`:

```ts
interface Props {
  entry: SpotTrackEntry;
  state: State;
  progress: SpotProgress;
  diagnosticId: string;
  /** Lesson title pulled from lessonCatalog or null when there is no match. */
  lessonTitle: string | null;
  /** 1-line synopsis. Null when there is no specific copy for this theme. */
  lessonBlurb: string | null;
  /** Total number of spots in the track (for "Spot N / 3"). */
  totalCount: number;
  /** SavedPlan — usado pra resolver getGradeUrl na seção Joga. */
  plan: SavedPlan;
}
```

Atualizar destructure no componente principal:

```ts
export function SpotCard({
  entry,
  state,
  progress,
  diagnosticId,
  lessonTitle,
  lessonBlurb,
  totalCount,
  plan,
}: Props) {
```

- [ ] **Step 2: Adicionar mapas de cor por tier (top do arquivo, após imports)**

Acrescentar logo antes do `type State`:

```ts
const TIER_BORDER: Record<number, string> = {
  1: "border-amber-400/40",
  2: "border-orange-400/40",
  3: "border-red-400/40",
};

const TIER_ACCENT_BG: Record<number, string> = {
  1: "bg-amber-400/5",
  2: "bg-orange-400/5",
  3: "bg-red-400/5",
};

const TIER_FG: Record<number, string> = {
  1: "text-amber-300",
  2: "text-orange-300",
  3: "text-red-300",
};
```

- [ ] **Step 3: Reformular o card ATIVO**

Localizar o bloco `// Active` (linha ~36). Atualmente termina em `return ( <motion.article className="rg-card rg-card--accent" ... )`.

Antes do `return`, adicionar as resoluções de cor por tier:

```ts
  const pctDisplay  = Math.round(progress.pct * 100);
  const handsTarget = THRESHOLD_HANDS;
  const handsBarPct = Math.min(100, (progress.handsPlayed / handsTarget) * 100);
  const showAlmostThere =
    progress.handsPlayed >= THRESHOLD_HANDS && progress.pct < THRESHOLD_PCT;

  const trainerHref =
    entry.trainerSlug && entry.leakId
      ? `/trainer/spot/${encodeURIComponent(entry.leakId)}?diag=${encodeURIComponent(diagnosticId)}`
      : null;

  const tierBorder = TIER_BORDER[entry.tier] ?? TIER_BORDER[1];
  const tierAccentBg = TIER_ACCENT_BG[entry.tier] ?? TIER_ACCENT_BG[1];
  const tierFg = TIER_FG[entry.tier] ?? TIER_FG[1];
```

Substituir todo o bloco `<motion.article>` (do return atual do active até o fechamento `</motion.article>`) por:

```tsx
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
      className={`rg-card border ${tierBorder} ${tierAccentBg}`}
      style={{ padding: 28, borderRadius: "var(--rg-r-xl)" }}
    >
      <header className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span className={`rg-eyebrow ${tierFg}`}>
          SPOT {entry.index + 1} / {totalCount}
        </span>
        {entry.pct !== null && (
          <span className={`rg-eyebrow rg-eyebrow--pill ${tierFg}`}>
            Tier {entry.tier} · {entry.pct}%
          </span>
        )}
      </header>

      <h3 className="rg-h2" style={{ marginBottom: 18 }}>{entry.label}</h3>

      {/* SEÇÃO 1 — ESTUDA */}
      <section style={{ marginBottom: 16 }}>
        <p className={`rg-eyebrow ${tierFg}`} style={{ marginBottom: 6 }}>
          📺 ESTUDA
        </p>
        <a
          href={entry.lessonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rg-row"
          style={{ padding: "12px 14px" }}
        >
          <span>{lessonTitle ?? "Aula recomendada"}</span>
          <span className="rg-row__arrow">→</span>
        </a>
        {lessonBlurb && (
          <p className="rg-caption" style={{ marginTop: 8 }}>{lessonBlurb}</p>
        )}
      </section>

      {/* SEÇÃO 2 — TREINA */}
      <section style={{ marginBottom: 16 }}>
        <p className={`rg-eyebrow ${tierFg}`} style={{ marginBottom: 6 }}>
          🎯 TREINA
        </p>
        <p className="rg-caption" style={{ marginBottom: 12 }}>
          Meta: {Math.round(THRESHOLD_PCT * 100)}% de acerto em {THRESHOLD_HANDS} mãos
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div className="rg-progress" style={{ flex: 1 }}>
            <div className="rg-progress__bar" style={{ width: `${handsBarPct}%` }} />
          </div>
          <span className="rg-mono" style={{ fontSize: 12, color: "var(--rg-fg-subtle)" }}>
            {progress.handsPlayed}/{handsTarget} mãos · {pctDisplay}% acerto
          </span>
        </div>

        {showAlmostThere && (
          <p className="rg-caption" style={{ color: "var(--rg-warn)", marginBottom: 8 }}>
            Quase lá — continue até {Math.round(THRESHOLD_PCT * 100)}%
          </p>
        )}

        {trainerHref ? (
          <Link href={trainerHref} className="rg-btn rg-btn--primary rg-btn--lg">
            ▶ Treinar este spot
          </Link>
        ) : (
          <p className="rg-caption">
            Esse spot ainda não está no trainer interno. Estude a aula acima e fale com o EV Manager.
          </p>
        )}
      </section>

      {/* SEÇÃO 3 — JOGA */}
      <section style={{ marginBottom: 12 }}>
        <p className={`rg-eyebrow ${tierFg}`} style={{ marginBottom: 6 }}>
          🎲 JOGA
        </p>
        <a
          href={getGradeUrl(plan)}
          target="_blank"
          rel="noopener noreferrer"
          className="rg-row"
          style={{ padding: "12px 14px" }}
        >
          <span>Sua grade de torneios</span>
          <span className="rg-row__arrow">→</span>
        </a>
      </section>

      <p className="rg-caption" style={{ marginTop: 12 }}>
        ✓ Critério: {Math.round(THRESHOLD_PCT * 100)}% em {THRESHOLD_HANDS} mãos → libera o próximo Spot
      </p>
    </motion.article>
  );
}
```

Mudanças aplicadas:
- **A1**: bloco `<section>` "Por que esse spot" (antigo linhas 67-75) REMOVIDO inteiro.
- **A4**: 3 seções com eyebrow "📺 ESTUDA" / "🎯 TREINA" / "🎲 JOGA". Estuda mantém link da aula. Treina mantém barra de progresso + botão "Treinar este spot". Joga é novo: link pra grade via `getGradeUrl(plan)`.
- **A6**: `className` do article passa de `"rg-card rg-card--accent"` pra `` `rg-card border ${tierBorder} ${tierAccentBg}` ``. Eyebrows ganham `${tierFg}`. Pílula no header mostra `Tier {entry.tier} · {entry.pct}%`.

- [ ] **Step 4: Atualizar `LockedCard` pra cor por tier no eyebrow**

Localizar `function LockedCard({ entry, totalCount }: { entry: SpotTrackEntry; totalCount: number })` (final do arquivo). Substituir o corpo:

```tsx
function LockedCard({ entry, totalCount }: { entry: SpotTrackEntry; totalCount: number }) {
  const tierFg = TIER_FG[entry.tier] ?? TIER_FG[1];
  return (
    <article
      className="rg-card"
      style={{ padding: 20, borderRadius: "var(--rg-r-lg)", opacity: 0.55 }}
    >
      <div className="flex items-center justify-between">
        <span className={`rg-eyebrow ${tierFg}`}>SPOT {entry.index + 1} / {totalCount}</span>
        <span className="rg-meta">🔒 Bloqueado</span>
      </div>
      <h3 className="rg-h3" style={{ marginTop: 8 }}>{entry.label}</h3>
      <p className="rg-caption" style={{ marginTop: 6 }}>
        Disponível após concluir o Spot {entry.index}
      </p>
    </article>
  );
}
```

Mudança: span do eyebrow recebe `className={`rg-eyebrow ${tierFg}`}` em vez de só `rg-eyebrow`.

- [ ] **Step 5: Atualizar `CompletedCard` pra cor por tier no eyebrow**

Localizar `function CompletedCard(...)`. Substituir o corpo:

```tsx
function CompletedCard({
  entry,
  progress,
  totalCount,
}: {
  entry: SpotTrackEntry;
  progress: SpotProgress;
  totalCount: number;
}) {
  const tierFg = TIER_FG[entry.tier] ?? TIER_FG[1];
  return (
    <article
      className="rg-card"
      style={{
        padding: 20,
        borderRadius: "var(--rg-r-lg)",
        borderColor: "var(--rg-success)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className={`rg-eyebrow ${tierFg}`}>
          SPOT {entry.index + 1} / {totalCount} · CONCLUÍDO
        </span>
        <span className="rg-meta" style={{ color: "var(--rg-success)" }}>✓</span>
      </div>
      <h3 className="rg-h3" style={{ marginTop: 8 }}>{entry.label}</h3>
      <p className="rg-caption" style={{ marginTop: 6 }}>
        {progress.handsPlayed} mãos · {Math.round(progress.pct * 100)}% de acerto
      </p>
    </article>
  );
}
```

Mudança: span do eyebrow `className={`rg-eyebrow ${tierFg}`}` em vez de `rg-eyebrow` com `style={{ color: "var(--rg-success)" }}`. Border verde mantida (sucesso).

- [ ] **Step 6: Passar `plan` pra LockedCard/CompletedCard quando chamadas**

Localizar o início da função principal `export function SpotCard(...)` onde os fallbacks pra Locked/Completed estão:

```ts
  if (state === "locked") return <LockedCard entry={entry} totalCount={totalCount} />;
  if (state === "completed") return <CompletedCard entry={entry} progress={progress} totalCount={totalCount} />;
```

Não precisa mudar — Locked e Completed não usam `plan`, só `entry.tier`. OK.

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit`
Expected: erros em `SpotTrack.tsx` porque o consumidor do SpotCard ainda não passa `plan`. Isso é esperado — Task 5 resolve. Confirmar com:

```bash
npx tsc --noEmit 2>&1 | grep -v "SpotTrack.tsx"
```

Expected: vazio (ou só linhas em branco).

- [ ] **Step 8: Lint**

Run: `npx eslint components/trainer/SpotCard.tsx`
Expected: zero warnings/errors.

- [ ] **Step 9: Commit**

```bash
git add components/trainer/SpotCard.tsx
git commit -m "$(cat <<'EOF'
feat(plan): SpotCard reformulado (A1 + A4 + A6)

A1: remove bloco 'Por que esse spot'.
A4: reorganiza ativo em 3 seções (Estuda 📺 / Treina 🎯 / Joga 🎲)
com botão/link cada. Joga linka pra getGradeUrl(plan) — mesma grade
pra todos os spots.
A6: cores por tier (Tier 1 amber, Tier 2 orange, Tier 3 red) nas
bordas, accent bg e eyebrows. LockedCard e CompletedCard também
aplicam cor por tier no eyebrow.

Nova prop `plan: SavedPlan` — SpotTrack vai propagar na Task 5.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Novo `GradeCard.tsx`

**Files:**
- Create: `components/trainer/GradeCard.tsx`

**Por quê:** Bloco separado entre `<SpotTrack>` e `<ResourcesBlock>` (A7). Mesmo "peso visual" dos SpotCards mas paleta neutra (grade não é tier-coded).

- [ ] **Step 1: Criar `components/trainer/GradeCard.tsx`**

```tsx
"use client";

/**
 * GradeCard — bloco separado em /meu-plano mostrando a grade do aluno.
 *
 * Renderizado entre <SpotTrack> e <ResourcesBlock>. Visual com peso
 * similar aos SpotCards (rg-card grande) mas paleta neutra — grade
 * é "informativo geral", não amarra a um spot específico.
 *
 * Lida com plan.stakeGrade === null (aluno não declarou banca) via
 * fallback no título e descriptor.
 */

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { getGradeUrl } from "@/lib/poker/spotTrack";

interface Props {
  plan: SavedPlan;
}

const GRADE_DESCRIPTORS: Record<number, string> = {
  1:    "Sunday Storm e companhia",
  2.5:  "$2.50 entry — Stars Vanilla e PKO",
  4:    "$4 entry — Mid stakes",
  7:    "$7 entry — Approach a $10",
  10:   "$10 entry — High mid",
  13:   "$13 entry — $20 cusp",
  19:   "$19 entry — High stakes",
  28:   "$28 entry — Sunday Million regs",
};

function gradeTitle(stakeGrade: number | null | undefined): string {
  if (stakeGrade == null) return "Grade de torneios";
  return `ABI $${stakeGrade}`;
}

function gradeDescriptor(stakeGrade: number | null | undefined): string {
  if (stakeGrade == null) {
    return "Defina sua banca com o EV pra liberar a grade sugerida.";
  }
  return GRADE_DESCRIPTORS[stakeGrade] ?? `Grade ABI $${stakeGrade}`;
}

export function GradeCard({ plan }: Props) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rg-card border border-neutral-700/40 bg-neutral-900/40"
      style={{ padding: 28, borderRadius: "var(--rg-r-xl)", marginTop: 16 }}
    >
      <span className="rg-eyebrow">TUA GRADE</span>
      <h3 className="rg-h2" style={{ marginTop: 8, marginBottom: 6 }}>
        {gradeTitle(plan.stakeGrade)}
      </h3>
      <p className="rg-body-sm" style={{ marginBottom: 18 }}>
        {gradeDescriptor(plan.stakeGrade)}
      </p>
      <a
        href={getGradeUrl(plan)}
        target="_blank"
        rel="noopener noreferrer"
        className="rg-btn rg-btn--secondary"
      >
        📋 Abrir grade →
      </a>
    </motion.article>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: ainda há o erro pré-existente em `SpotTrack.tsx` (consumidor do SpotCard sem prop `plan`). Task 5 resolve.

```bash
npx tsc --noEmit 2>&1 | grep -v "SpotTrack.tsx"
```

Expected: vazio (ou só linhas em branco).

- [ ] **Step 3: Lint**

Run: `npx eslint components/trainer/GradeCard.tsx`
Expected: zero warnings/errors.

- [ ] **Step 4: Commit**

```bash
git add components/trainer/GradeCard.tsx
git commit -m "$(cat <<'EOF'
feat(plan): GradeCard component (A7)

Bloco separado pra ser renderizado entre <SpotTrack> e
<ResourcesBlock>. Mostra eyebrow 'TUA GRADE' + título 'ABI \$X' (ou
fallback se stakeGrade null) + descriptor por grade + botão 'Abrir
grade →' linkando pra getGradeUrl(plan). Paleta neutra (não usa
cor por tier — grade não amarra a spot específico).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Wire: `SpotTrack` propaga `plan`, `PlanScreen` instancia `GradeCard`

**Files:**
- Modify: `components/trainer/SpotTrack.tsx`
- Modify: `components/trainer/PlanScreen.tsx`

**Por quê:** Fecha o circuito: SpotCard agora exige `plan`, e GradeCard precisa ser instanciado.

- [ ] **Step 1: SpotTrack propaga `plan` pro SpotCard**

Localizar o `<SpotCard ... />` em `components/trainer/SpotTrack.tsx` (linha ~124-133). Atualmente:

```tsx
return (
  <SpotCard
    key={`${entry.index}-${id ?? "empty"}`}
    entry={entry}
    state={state}
    progress={progress}
    diagnosticId={diagnosticId}
    lessonTitle={title}
    lessonBlurb={blurb}
    totalCount={track.length}
  />
);
```

Acrescentar `plan={plan}` (componente SpotTrack já recebe `plan` como prop — confirmar lendo linhas 1-20 do arquivo, se sim só propagar):

```tsx
return (
  <SpotCard
    key={`${entry.index}-${id ?? "empty"}`}
    entry={entry}
    state={state}
    progress={progress}
    diagnosticId={diagnosticId}
    lessonTitle={title}
    lessonBlurb={blurb}
    totalCount={track.length}
    plan={plan}
  />
);
```

- [ ] **Step 2: PlanScreen importa GradeCard e instancia**

Editar `components/trainer/PlanScreen.tsx`. Localizar imports (linhas 1-20). Após o import de `ResourcesBlock` (linha 16):

```tsx
import { ResourcesBlock } from "./ResourcesBlock";
```

Acrescentar:

```tsx
import { GradeCard } from "./GradeCard";
```

Localizar o bloco onde `<SpotTrack>` e `<ResourcesBlock>` são renderizados (linhas 257-258):

```tsx
<SpotTrack plan={plan} />
<ResourcesBlock plan={plan} />
```

Inserir `<GradeCard plan={plan} />` entre eles:

```tsx
<SpotTrack plan={plan} />
<GradeCard plan={plan} />
<ResourcesBlock plan={plan} />
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Os erros das tasks anteriores resolvem aqui.

- [ ] **Step 4: Lint**

Run: `npx eslint components/trainer/SpotTrack.tsx components/trainer/PlanScreen.tsx`
Expected: zero warnings/errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build completa. Confirma que toda a cadeia compila.

- [ ] **Step 6: Commit**

```bash
git add components/trainer/SpotTrack.tsx components/trainer/PlanScreen.tsx
git commit -m "$(cat <<'EOF'
feat(plan): SpotTrack propaga plan + PlanScreen instancia GradeCard

SpotTrack passa plan pra SpotCard (consumido pelo seção Joga via
getGradeUrl). PlanScreen renderiza <GradeCard plan={plan} /> entre
<SpotTrack> e <ResourcesBlock>. Wire final da reforma.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Sanity check final

**Files:** nenhum.

**Por quê:** Atravessar critérios de aceite do spec com a feature inteira no ar.

- [ ] **Step 1: tsc + build no HEAD**

Run: `npx tsc --noEmit && echo "TSC OK" && npm run build 2>&1 | tail -8`
Expected: `TSC OK` + build completa.

- [ ] **Step 2: Smoke no dev**

Run: `npm run dev`
Esperado: dev server em http://localhost:3000.

- [ ] **Step 3: Aluno com plano Tier 1 puro**

Abrir `/meu-plano` autenticado como aluno cujo plano tem 3 spots todos Tier 1. Conferir:

- [ ] Todos os 3 SpotCards com border amber, accent bg amber.
- [ ] Eyebrow "SPOT N / 3" em text-amber-300.
- [ ] Pílula header mostra "Tier 1 · X%".
- [ ] SpotCard ATIVO NÃO mostra mais "Por que esse spot" (A1).
- [ ] SpotCard ATIVO mostra 3 seções: 📺 ESTUDA / 🎯 TREINA / 🎲 JOGA.
- [ ] Botão Joga abre a URL da grade do aluno em nova aba.

- [ ] **Step 4: Aluno com plano misto Tier 1 + Tier 2**

Abrir `/meu-plano` de aluno com spots de tiers diferentes (ex: 2 Tier 1 + 1 Tier 2). Conferir:

- [ ] Spots Tier 1 → amber.
- [ ] Spots Tier 2 → orange.
- [ ] Spots Tier 3 (se houver) → red.

- [ ] **Step 5: GradeCard**

Abrir `/meu-plano` de aluno com `stakeGrade` declarado (ex: 4). Conferir:

- [ ] Bloco "TUA GRADE" aparece entre o último SpotCard e o ResourcesBlock.
- [ ] Mostra título "ABI $4" + descriptor "$4 entry — Mid stakes".
- [ ] Botão "📋 Abrir grade →" abre a mesma URL que o botão Joga dos SpotCards.

- [ ] **Step 6: GradeCard sem banca**

Abrir `/meu-plano` de aluno SEM `stakeGrade`. Conferir:

- [ ] GradeCard mostra "Grade de torneios" + "Defina sua banca com o EV pra liberar a grade sugerida."
- [ ] Botão "Abrir grade →" leva pra URL fallback (FIXED_LINKS.tournamentGrid).

- [ ] **Step 7: Plano antigo (backward compat)**

Se possível, abrir `/meu-plano` de um aluno cujo `saved_plan.leaks` foi gerado ANTES desta entrega (sem `tier` no JSON dos leaks). Conferir:

- [ ] Todos os spots renderizam como Tier 1 (amber) — não quebra.

- [ ] **Step 8: Checar critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-spot-block-reform-design.md` seção "Critérios de aceite". Marcar:

- [ ] `LeakBucket.tier` adicionado e derivado.
- [ ] Plano sem examples → tier 1 default.
- [ ] `SpotTrackEntry.tier` propagado.
- [ ] `buildSpotTrack` usa `leak.tier ?? 1`.
- [ ] `getGradeUrl(plan)` exportado.
- [ ] SpotCard ATIVO sem "Por que esse spot".
- [ ] SpotCard ATIVO com 3 seções.
- [ ] Seção Joga linka pra `getGradeUrl(plan)`.
- [ ] Cores por tier (amber-400, orange-400, red-400) aplicadas.
- [ ] Pílula "Tier N · X%" no header.
- [ ] LockedCard e CompletedCard aplicam cor por tier.
- [ ] `GradeCard.tsx` criado.
- [ ] GradeCard mostra título + descriptor + botão.
- [ ] GradeCard lida com `stakeGrade === null`.
- [ ] `PlanScreen` instancia `<GradeCard>` entre SpotTrack e ResourcesBlock.
- [ ] SpotTrack propaga `plan`.
- [ ] Plans antigos sem `leak.tier` → Tier 1.
- [ ] `tsc + lint + build` passam.

- [ ] **Step 9: Reportar pronto**

Sem ação de código. Reportar: feature completa, 5 commits de feature no branch `onboarding-ev`, smoke ok, pronto pra `finishing-a-development-branch`.

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada critério mapeia em uma task.

- LeakBucket.tier → Task 1.
- SpotTrackEntry.tier + getGradeUrl → Task 2.
- SpotCard A1+A4+A6 → Task 3.
- GradeCard.tsx → Task 4.
- Wire SpotTrack+PlanScreen → Task 5.
- Sanity check → Task 6.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps têm código completo. Step 7 (Backward compat) é opcional pra Task 6 — explícito.

**3. Type consistency:**
- `tier: number` consistente em `LeakBucket` (Task 1) e `SpotTrackEntry` (Task 2).
- `Props.plan: SavedPlan` em SpotCard (Task 3) e GradeCard (Task 4).
- `getGradeUrl(plan: SavedPlan): string` mesma assinatura nas referências.
- Mapas de cor (`TIER_BORDER`, `TIER_ACCENT_BG`, `TIER_FG`) defined uma vez em SpotCard.

**4. Backward compat:** garantido por `?? 1` em `buildSpotTrack` (Task 2) e `?? TIER_*[1]` em SpotCard (Task 3) + LockedCard/CompletedCard.

**5. Build order:** Tasks 3 e 4 deixam tsc "quebrado" porque SpotCard exige `plan` mas SpotTrack ainda não passa. Task 5 fecha. Esperado e documentado no Step 7 da Task 3 e Step 2 da Task 4.
