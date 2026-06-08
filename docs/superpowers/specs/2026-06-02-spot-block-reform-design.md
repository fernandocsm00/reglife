# Spec — Reforma do bloco de spots em /meu-plano (A1 + A4 + A6 + A7)

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/meu-plano` (componentes `SpotCard`, `SpotTrack`, novo `GradeCard`)
**Apelido interno:** entrega "reforma do bloco de spots" (consolida 4 pendências da auditoria)

## Problema

Quatro pendências da auditoria pós-reunião tocam todas no mesmo bloco de `/meu-plano` (SpotCard + SpotTrack + Resources) e compartilham decisões visuais. Tratá-las como spec único evita churn de PR e mantém coerência visual.

**A1 — Remover "Por que esse spot" do SpotCard.** Bloco atual (linhas 67-75 de `SpotCard.tsx`) diz "Você acertou X% no nivelamento. Esse é um dos seus leaks principais." A reunião decidiu remover: a explicação já é dada no vídeo introdutório do diagnóstico.

**A4 — "Estuda, treina e joga" no SpotCard.** A reunião reforçou esse framing como a metodologia central. Hoje o card tem 2 ações (Estuda → link aula; Treina → trainer interno). Falta a 3ª: Joga → grade do aluno.

**A6 — Cores por tier.** Hoje todos os SpotCards usam a mesma paleta amber (`rg-card--accent`). A reunião pediu cores distintas: Tier 1 amarelo, Tier 2 laranja, Tier 3 vermelho. Aluno pode ter spots de tiers diferentes simultâneos (ex: spots 1 e 2 Tier 1, spot 3 Tier 2).

**A7 — Quadrinho da grade.** Hoje a grade aparece como item dentro de `ResourcesBlock`. A reunião pediu separá-la em bloco próprio com destaque visual (peso igual aos SpotCards), mostrando "Sua grade atual: ABI $X" + link.

## Escopo desta entrega

Reforma cirúrgica do bloco de spots cobrindo A1, A4, A6 e A7 em arquivos próximos. Sem schema change. Backward-compat com planos antigos (sem `leak.tier`) via fallback Tier 1.

**Fora de escopo** (entram em specs posteriores):
- A3 — Treinar → RegLife Sim externo (decisão arquitetural sobre trainer interno vs externo).
- A5 — Tier por aluno baseado em ABI (esta entrega usa Tier por spot derivado do diagnóstico).
- A8 — PDF como manual de links.
- Reformular `ResourcesBlock` em si (segue como está, só perde a grade).

## Decisões de design (já validadas)

| Decisão | Valor |
|---|---|
| Organização | 1 spec único cobrindo as 4 pendências |
| Cores por tier | Tier 1 amber-400, Tier 2 orange-400, Tier 3 red-400 |
| Mensagem "Estuda, treina e joga" | 3 seções no SpotCard (Estuda / Treina / Joga), cada uma com botão/link |
| Link "Joga" no SpotCard | Mesma grade pra todos os spots (via `getGradeUrl(plan)`) |
| Quadrinho da grade | Bloco separado `GradeCard` entre `<SpotTrack>` e `<ResourcesBlock>` |
| `tier` por leak | Persiste no `LeakBucket.tier`, propaga pro `SpotTrackEntry` |
| Backward compat | Planos antigos sem `tier` → Tier 1 default |
| Subtítulo do SpotTrack | Mantém atual (não duplica "Estuda, treina e joga") |

## Arquitetura

5 arquivos modificados + 1 novo:

```
lib/poker/leakAnalysis.ts            ← Modify: LeakBucket ganha `tier: number`
lib/poker/spotTrack.ts               ← Modify: SpotTrackEntry ganha `tier`. Novo helper getGradeUrl(plan)
components/trainer/SpotCard.tsx      ← Modify: remove A1, adiciona 3 seções (A4), aplica cor por tier (A6), nova prop `plan`
components/trainer/GradeCard.tsx     ← Create (A7)
components/trainer/SpotTrack.tsx     ← Modify: propaga `plan` pros SpotCards
components/trainer/PlanScreen.tsx    ← Modify: instancia <GradeCard plan={plan}> entre SpotTrack e ResourcesBlock
```

**Reuso forte:**
- `getGradeLink(stakeGrade)` em `lib/poker/spotLinks.ts` (já existe) — reusado via novo `getGradeUrl(plan)` que encapsula a chamada.
- `rg-card` Tailwind class do design system — só substitui `--accent` por cores por tier dinâmicas.
- Pattern de seção do `SpotCard` ativo atual (Diagnóstico / Aula / Treino) — vira (Estuda / Treina / Joga) com mesma diagramação.

**Sem schema change.** `SavedPlan.leaks[].tier` é campo extra no JSON existente.

## Mudanças na lib pura

### `lib/poker/leakAnalysis.ts`

Acrescentar `tier: number` à interface `LeakBucket`:

```ts
export interface LeakBucket {
  id: string;
  action: string;
  actionLabel: string;
  position: string;
  stackBand: string;
  tier: number;                // NOVO — Tier do spot (1, 2, ou 3)
  errors: number;
  total: number;
  examples: ResultEntry[];
  recommendation: string;
  lessons: LessonRef[];
}
```

Na função que constrói os leaks (busca onde `LeakBucket` é instanciado — provavelmente na função `analyzeLeaks` ou similar), derivar `tier` do primeiro `ResultEntry`:

```ts
tier: examples[0]?.tier ?? 1,
```

`ResultEntry.tier` já existe (`lib/poker/diagnosticoStore.ts:20`). Cada drill carrega o tier do spot.

### `lib/poker/spotTrack.ts`

`SpotTrackEntry` ganha `tier`:

```ts
export interface SpotTrackEntry {
  index: number;
  leakId: string | null;
  label: string;
  pct: number | null;
  lessonUrl: string;
  trainerSlug: string | null;
  hasInternalTrainer: boolean;
  tier: number;       // NOVO — forwarded de leak.tier (default 1)
}
```

`buildSpotTrack` propaga:

```ts
return leaks.map((leak, i) => ({
  index: i,
  leakId: leak.id,
  label: leak.label,
  pct: leak.pct,
  lessonUrl: getLessonUrlForLeak(leak.id),
  trainerSlug: slugForLeak(leak.id),
  hasInternalTrainer: hasInternalTrainer(leak.id),
  tier: leak.tier ?? 1,        // NOVO — backward compat com planos antigos
}));
```

`topLeaks(plan, 3)` (em `lib/pdf/utils.ts`) já devolve `LeakBucket[]`, então `leak.tier` chega aqui se persistido. Planos antigos sem tier → fallback 1.

**Novo helper exportado:**

```ts
import { getGradeLink, ... } from "./spotLinks";

/**
 * URL da grade de torneios para esse plano. Reusa getGradeLink.
 * Quando aluno não declarou banca (stakeGrade null), cai em FIXED_LINKS.tournamentGrid.
 *
 * Encapsula getGradeLink pra que SpotCard e GradeCard usem o mesmo ponto
 * de verdade — evita import direto de spotLinks em vários consumidores.
 */
export function getGradeUrl(plan: SavedPlan): string {
  return getGradeLink(plan.stakeGrade);
}
```

## Mudanças no `SpotCard.tsx`

### Nova prop `plan`

Hoje o componente recebe `entry, state, progress, diagnosticId, lessonTitle, lessonBlurb, totalCount`. Acrescentar:

```ts
interface Props {
  entry: SpotTrackEntry;
  state: State;
  progress: SpotProgress;
  diagnosticId: string;
  lessonTitle: string | null;
  lessonBlurb: string | null;
  totalCount: number;
  plan: SavedPlan;          // NOVO — pra resolver getGradeUrl
}
```

`SpotTrack` (consumidor) já tem `plan` — propagação trivial.

### Constantes de cor por tier (topo do arquivo)

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

Helpers de lookup com fallback Tier 1:

```ts
const tierBorder = TIER_BORDER[entry.tier] ?? TIER_BORDER[1];
const tierAccentBg = TIER_ACCENT_BG[entry.tier] ?? TIER_ACCENT_BG[1];
const tierFg = TIER_FG[entry.tier] ?? TIER_FG[1];
```

### Estrutura final do `SpotCard` ATIVO

**Remover** linhas 67-75 (`<section>` "Por que esse spot"). **Reorganizar** restante em 3 seções com padrão visual idêntico (eyebrow uppercase + descrição + botão).

```tsx
<motion.article
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.22 }}
  className={`rg-card border ${tierBorder} ${tierAccentBg}`}
  style={{ padding: 28, borderRadius: "var(--rg-r-xl)" }}
>
  <header className="flex items-center justify-between" style={{ marginBottom: 16 }}>
    <span className={`rg-eyebrow ${tierFg}`}>
      SPOT {entry.index + 1} / {totalCount}
    </span>
    {entry.pct !== null && (
      <span
        className={`rg-eyebrow rg-eyebrow--pill ${tierFg}`}
      >
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
```

### `LockedCard` e `CompletedCard`

Mantêm look minimalista atual (`rg-card` simples sem accent forte, ou border emerald no completed). Aplicam cor por tier no eyebrow:

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

`CompletedCard` similar — eyebrow ganha cor por tier (em vez de `var(--rg-success)` fixo).

## Novo componente `GradeCard.tsx`

```tsx
"use client";

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

**Notas:**
- Visual neutro (não usa cor por tier) — grade é "informativo geral", não amarra a um spot específico.
- `marginTop: 16` casa com o gap dos SpotCards.
- Botão `rg-btn--secondary` (não accent) pra hierarquia visual: SpotCards têm o CTA primário ("Treinar"), GradeCard tem CTA secundário.

## Mudanças em `SpotTrack.tsx`

Hoje o map renderiza `<SpotCard ... />`. Só acrescenta a prop `plan`:

```tsx
{track.map((entry, i) => {
  // ...código existente...
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
      plan={plan}          // NOVO — SpotTrack já recebe plan como prop
    />
  );
})}
```

## Mudanças em `PlanScreen.tsx`

Localizar onde `<SpotTrack>` e `<ResourcesBlock>` são renderizados. Inserir `<GradeCard plan={plan} />` entre os dois:

```tsx
<SpotTrack plan={plan} />
<GradeCard plan={plan} />     {/* NOVO */}
<ResourcesBlock plan={plan} />
```

Adicionar import no topo:

```tsx
import { GradeCard } from "./GradeCard";
```

## Error handling

| Camada | Cenário | Comportamento |
|---|---|---|
| `leakAnalysis` | `examples[0]` ausente | `tier: 1` (default Tier 1) |
| `buildSpotTrack` | `leak.tier` undefined (planos antigos) | `SpotTrackEntry.tier = 1` |
| `SpotCard` | `entry.tier` fora de [1, 3] | Cai no `TIER_BORDER[1]` via `??` |
| `getGradeUrl` | `plan.stakeGrade === null` | Cai em `FIXED_LINKS.tournamentGrid` (existente) |
| `GradeCard` | `plan.stakeGrade === null` | Título "Grade de torneios" + descriptor explicativo |
| `SpotCard` seção Joga | grade sem stakeGrade | Botão funciona, link cai no fallback |

## Testes

1. **Smoke `tsx` da lib**:
   - `LeakBucket` construído com `tier` derivado do primeiro ResultEntry.
   - `LeakBucket` sem examples → `tier: 1`.
   - `buildSpotTrack` propaga `leak.tier ?? 1`.
   - `getGradeUrl(plan)` com `stakeGrade=4` → URL específica.
   - `getGradeUrl(plan)` com `stakeGrade=null` → fallback genérico.

2. **`tsc + lint + build`** em todas as tasks.

3. **Smoke visual no dev** (`npm run dev`):
   - Aluno com 3 spots todos Tier 1 → todos amarelos.
   - Aluno com 2 Tier 1 + 1 Tier 2 → mix amber/orange.
   - SpotCard ativo mostra 3 seções (Estuda / Treina / Joga).
   - "Por que esse spot" sumiu.
   - `GradeCard` aparece entre SpotTrack e ResourcesBlock.
   - Botão "Joga" do SpotCard e "Abrir grade" do GradeCard linkam pra mesma URL.
   - Aluno sem banca declarada → GradeCard mostra "Defina sua banca com o EV".

## Performance & Risco

- **Zero impacto em runtime** — só mudança visual + 1 campo extra no shape.
- **Plans antigos no banco**: backward-compat via `?? 1`. Aluno antigo vê tudo Tier 1 até refazer diagnóstico.
- **PDF antigo (`challenge30d.ts`)**: usa `buildSpotTrack` mas não consome `entry.tier`. Sem impacto.
- **Admin (AdminSpotTrack/MonthlyScoreboard)**: usam `mergeTrackWithTraining` que extrai só `label/leakId/state`. Sem impacto.
- **`getLessonUrlForLeak` (entrega A2)**: segue funcionando, não tocada.
- **Trainer interno (`/trainer/spot/[leakId]`)**: lê do `LeakBucket` mas não usa `tier`. Sem impacto.

## Critérios de aceite

- [ ] `LeakBucket` interface ganha campo `tier: number`.
- [ ] Função que constrói leaks deriva `tier` do primeiro `ResultEntry`.
- [ ] Plano sem examples → `tier: 1` default.
- [ ] `SpotTrackEntry` interface ganha campo `tier: number`.
- [ ] `buildSpotTrack` propaga `leak.tier ?? 1` para cada entry.
- [ ] `getGradeUrl(plan)` exportado em `lib/poker/spotTrack.ts`.
- [ ] `SpotCard` ATIVO **não** mostra mais o bloco "Por que esse spot" (A1).
- [ ] `SpotCard` ATIVO mostra 3 seções com eyebrow "📺 ESTUDA", "🎯 TREINA", "🎲 JOGA" (A4).
- [ ] Seção "Joga" tem link/botão que abre `getGradeUrl(plan)` em nova aba.
- [ ] `SpotCard` ATIVO usa cor por tier:
  - Tier 1 → border amber-400/40, bg amber-400/5, eyebrow text amber-300.
  - Tier 2 → border orange-400/40, bg orange-400/5, eyebrow text orange-300.
  - Tier 3 → border red-400/40, bg red-400/5, eyebrow text red-300.
- [ ] Pílula "Tier N · X%" no header do SpotCard ativo.
- [ ] `LockedCard` aplica cor por tier no eyebrow.
- [ ] `CompletedCard` aplica cor por tier no eyebrow.
- [ ] Novo arquivo `components/trainer/GradeCard.tsx` criado.
- [ ] `GradeCard` mostra eyebrow "TUA GRADE" + título `ABI $X` (ou fallback) + descriptor + botão "Abrir grade →".
- [ ] `GradeCard` lida com `plan.stakeGrade === null` (fallback no título e descriptor).
- [ ] `PlanScreen.tsx` instancia `<GradeCard plan={plan} />` entre `<SpotTrack>` e `<ResourcesBlock>`.
- [ ] `SpotTrack` propaga `plan` pros SpotCards via nova prop.
- [ ] Plans antigos sem `leak.tier` no JSON → renderizam como Tier 1 (não quebra).
- [ ] `tsc --noEmit` e `npm run lint` passam.
- [ ] `npm run build` completa.
