# Header do plano com Tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar duas linhas de contexto (eyebrow com Tier + dia do ciclo, body-sm com accuracy + meta + dedicação) logo abaixo do H1 da página `/meu-plano`, usando dados já presentes em `SavedPlan`.

**Architecture:** Edição cirúrgica em **um** componente cliente (`components/trainer/PlanScreen.tsx`) e **uma** lib pura (`lib/poker/planBuilder.ts`) pra ganhar mapas de labels curtos. Sem componente novo, sem rota nova, sem schema change, sem fetch novo. Reusa as classes utility `.rg-eyebrow` e `.rg-body-sm` que já existem em `app/reglife.css`.

**Tech Stack:** Next.js (App Router), React client component, CSS utility classes do design system (`rg-*`). Sem framework de teste no projeto — verificação por `npx tsc --noEmit`, `npm run lint`, `npm run build` e smoke test manual no `npm run dev`.

**Spec base:** `docs/superpowers/specs/2026-06-02-plano-header-tier-design.md` (commit `b8c2214`).

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/planBuilder.ts` | Modify | Adicionar `STUDY_TIME_LABELS_SHORT` e `PROFIT_GOAL_LABELS_SHORT` — versões enxutas pros badges. As versões longas ficam para os textos do plano em si. |
| `components/trainer/PlanScreen.tsx` | Modify | Importar os labels curtos, calcular `cycleDay` clamped, renderizar eyebrow + body-sm logo após o `<h1>` do header. |

Nenhum arquivo criado. Nenhum teste novo (projeto não usa Jest/Vitest).

---

## Task 1 — Labels curtos no planBuilder

**Files:**
- Modify: `lib/poker/planBuilder.ts` (após `PROFIT_GOAL_LABELS`, antes de `PROFIT_GOAL_ADVICE`)

**Por quê:** Os labels existentes (`STUDY_TIME_LABELS`, `PROFIT_GOAL_LABELS`) são longos ("Até 15h de estudo por semana", "U$ 10.000 em 12 meses") e foram desenhados para texto corrido do plano. Pro header, precisamos de versões curtas que caibam numa única linha junto com outras duas infos.

- [ ] **Step 1: Ler `lib/poker/planBuilder.ts` linhas 1-50 pra confirmar contexto**

Esperado: ver as exportações `STUDY_TIME_LABELS` (linha ~30) e `PROFIT_GOAL_LABELS` (linha ~36) e o tipo `Record<StudyTime, string>` / `Record<ProfitGoal, string>`. Confirmar que os tipos `StudyTime` (`"ate15" | "ate40" | "mais40"`) e `ProfitGoal` (`"usd1k" | "usd10k" | "usd50k" | "usd100k"`) vêm de `./planStorage`.

- [ ] **Step 2: Adicionar os dois mapas curtos**

Editar `lib/poker/planBuilder.ts` inserindo imediatamente após o `}` que fecha `PROFIT_GOAL_LABELS` (e antes do comentário `/** Texto motivacional curto...` que precede `PROFIT_GOAL_ADVICE`):

```ts
/** Labels enxutos para badges/headers — versões longas em STUDY_TIME_LABELS/PROFIT_GOAL_LABELS */
export const STUDY_TIME_LABELS_SHORT: Record<StudyTime, string> = {
  ate15:  "Até 15h/sem",
  ate40:  "Até 40h/sem",
  mais40: "+40h/sem",
};

export const PROFIT_GOAL_LABELS_SHORT: Record<ProfitGoal, string> = {
  usd1k:   "Meta U$ 1k",
  usd10k:  "Meta U$ 10k",
  usd50k:  "Meta U$ 50k",
  usd100k: "Meta U$ 100k",
};
```

Atenção:
- A `Meta ` já está embutida no label curto do profit goal — o consumidor concatena direto (não prefixar de novo no JSX).
- `STUDY_TIME_LABELS_SHORT["mais40"]` usa `+40h/sem` (sem a palavra "Mais") pra economizar caractere.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: sem erros novos. Se aparecer erro `Property 'X' is missing in type` significa que algum dos valores de `StudyTime`/`ProfitGoal` mudou desde a leitura do Step 1 — voltar e ajustar.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: sem warnings/errors novos no arquivo modificado.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/planBuilder.ts
git commit -m "$(cat <<'EOF'
feat(plan): add short labels for study time and profit goal

Adiciona STUDY_TIME_LABELS_SHORT e PROFIT_GOAL_LABELS_SHORT para uso
em badges/headers onde os labels longos atuais não cabem. Mantém as
versões longas pra textos corridos do plano.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Header do PlanScreen com eyebrow + body-sm

**Files:**
- Modify: `components/trainer/PlanScreen.tsx` (linhas 1-13 dos imports, linhas 88-101 do header)

**Por quê:** Entregar visualmente o eyebrow e a body-sm aprovados no spec, dentro do mesmo `<motion.div>` do H1 atual.

- [ ] **Step 1: Adicionar import dos labels curtos**

Editar `components/trainer/PlanScreen.tsx` linha 6 (atual: `import type { SavedPlan } from "@/lib/poker/planStorage";`). Logo após essa linha, inserir:

```ts
import {
  STUDY_TIME_LABELS_SHORT,
  PROFIT_GOAL_LABELS_SHORT,
} from "@/lib/poker/planBuilder";
```

- [ ] **Step 2: Adicionar bloco eyebrow + body-sm dentro do header**

Localizar o bloco do header (atualmente linhas 88-101):

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
  style={{ marginTop: 28, marginBottom: 32 }}
>
  <Logo size="md" />
  <h1
    className="rg-display"
    style={{ marginTop: 28, color: "var(--rg-fg)" }}
  >
    Plano de Progressão Individual — {plan.playerName}.
  </h1>
</motion.div>
```

Substituir por:

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
  style={{ marginTop: 28, marginBottom: 32 }}
>
  <Logo size="md" />
  <h1
    className="rg-display"
    style={{ marginTop: 28, color: "var(--rg-fg)" }}
  >
    Plano de Progressão Individual — {plan.playerName}.
  </h1>
  {(() => {
    // cycleDay: dias corridos desde a geração do plano, clamped em [1, 90].
    // Cap em 90 evita "Dia 137 de 90" pra alunos que ficaram no plano
    // depois do ciclo terminar. Tratamento de "Ciclo concluído" fica
    // pra spec futuro.
    const rawCycleDay =
      Math.floor((Date.now() - plan.createdAt) / 86_400_000) + 1;
    const cycleDay = Math.min(90, Math.max(1, rawCycleDay));

    // Fallback explícito: planos antigos podem não ter playerTierLabel.
    const tierLabel = plan.playerTierLabel ?? "Tier ?";

    // Labels curtos com fallback ao raw caso valor venha fora dos enums.
    const studyShort =
      STUDY_TIME_LABELS_SHORT[plan.studyTime] ?? plan.studyTime;
    const profitShort =
      PROFIT_GOAL_LABELS_SHORT[plan.profitGoal] ?? `Meta ${plan.profitGoal}`;

    return (
      <>
        <p
          className="rg-eyebrow print:text-neutral-700"
          style={{ marginTop: 12 }}
        >
          {tierLabel} · Dia {cycleDay} de 90
        </p>
        <p
          className="rg-body-sm print:text-neutral-600"
          style={{ marginTop: 4 }}
        >
          {plan.accuracyPct}% de acerto no nivelamento · {profitShort} · {studyShort}
        </p>
      </>
    );
  })()}
</motion.div>
```

Notas de implementação:
- O `Date.now()` na render é estável pro ciclo de re-render dessa sessão. Não há perda de precisão prática num componente `"use client"` — mudar de dia mid-session é caso de borda aceitável.
- `print:text-neutral-700` e `print:text-neutral-600` são classes Tailwind que sobrescrevem a cor das utilities `rg-eyebrow` / `rg-body-sm` apenas no print, garantindo contraste em fundo branco (a cor accent amber sumiria).
- A IIFE `(() => { ... })()` mantém os cálculos isolados ao header sem poluir o corpo do componente com 4 `const`s novos no top-level.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: sem erros novos. Se aparecer `Property 'playerTierLabel' does not exist on type 'SavedPlan'`, conferir `lib/poker/planStorage.ts` linha ~50 — o campo deve estar lá.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: sem warnings/errors novos. Caso o ESLint não goste da IIFE inline (`@typescript-eslint/no-floating-promises` não se aplica, mas pode haver `react/jsx-no-useless-fragment` se algum linter rigoroso reclamar do `<>`), trocar pelo padrão de extrair as variáveis pro topo de `PlanScreen` antes do `return`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build completa sem erros. Confirma que não quebrou outras páginas que importam `PlanScreen` ou `planBuilder`.

- [ ] **Step 6: Smoke test manual no dev**

Run: `npm run dev` em um terminal separado.

Abrir `http://localhost:3000/meu-plano` com um plano válido no localStorage. Conferir visualmente:

- [ ] O H1 segue exatamente `Plano de Progressão Individual — {nome}.` (com ponto final, em formatação `rg-display`).
- [ ] Imediatamente abaixo, eyebrow uppercase em amber: `TIER 1 · DIA X DE 90` (X = dia corrido desde `createdAt`).
- [ ] Imediatamente abaixo do eyebrow, linha cinza menor: `{accuracy}% de acerto no nivelamento · Meta U$ {N} · Até {N}h/sem`.
- [ ] Print preview do navegador (Ctrl+P): eyebrow vira cinza escuro (não amber), body-sm vira cinza médio — ambos legíveis no fundo branco.

- [ ] **Step 7: Commit**

```bash
git add components/trainer/PlanScreen.tsx
git commit -m "$(cat <<'EOF'
feat(plan): show tier and cycle context in /meu-plano header

Acrescenta abaixo do H1 do PlanScreen:
- eyebrow: 'Tier N · Dia X de 90' (cycleDay clamped em [1,90])
- body-sm: '{accuracy}% de acerto no nivelamento · Meta U$ N · Até Nh/sem'

Usa labels curtos novos do planBuilder. Sem fetch, sem componente
novo. Print/PDF mantém as linhas com cor adaptada (neutral-700/600).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Verificação final

**Files:** nenhum.

- [ ] **Step 1: Conferir critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-plano-header-tier-design.md`, seção "Critérios de aceite". Marcar mentalmente cada item contra o estado atual da branch:

  - [ ] H1 textualmente inalterado em formato.
  - [ ] Eyebrow uppercase `TIER N · DIA X DE 90` abaixo do H1.
  - [ ] Body-sm `{N}% de acerto no nivelamento · Meta {…} · {…}` abaixo do eyebrow.
  - [ ] Print/PDF com cor adaptada (testado no Step 6 da Task 2).
  - [ ] `cycleDay` clamped em [1, 90] (garantido pelo `Math.min(90, Math.max(1, …))`).
  - [ ] `playerTierLabel` ausente → `"Tier ?"` (garantido pelo `??`).
  - [ ] Nenhuma chamada HTTP nova no `PlanScreen` (Task 2 não adicionou `fetch`).

- [ ] **Step 2: Conferir histórico de commits da feature**

Run: `git log --oneline -5`
Expected: ver pelo menos os dois commits desta feature:
- `feat(plan): show tier and cycle context in /meu-plano header`
- `feat(plan): add short labels for study time and profit goal`
- (E o commit do spec `docs(spec): header do plano com tier...` já presente antes.)

- [ ] **Step 3: Sinalizar pronto pra review**

Sem ação de código. Apenas reportar ao usuário: feature implementada, dois commits no branch `onboarding-ev`, pronto pra ele rodar `npm run dev` e dar OK final antes de PR/merge.

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada item do design vira task.
- Estrutura final → Task 2 Step 2.
- Hierarquia visual (eyebrow + body-sm) → Task 2 Step 2 (usa `rg-eyebrow` e `rg-body-sm` existentes).
- Posicionamento no arquivo → Task 2 Step 2 (substituição do `<motion.div>` do header).
- Cálculos derivados (`cycleDay`, `tierLabel`, `studyShort`, `profitShort`) → Task 2 Step 2.
- Edge cases (clamp 90, `Tier ?`, `accuracyPct=0`) → Task 2 Step 2 + comentários inline.
- Print/PDF → Task 2 Step 2 (classes `print:text-neutral-*`) + Step 6 (verificação).
- Arquitetura (sem componente, 1 arquivo) → File Structure.
- Testes (sem teste auto) → Task 2 Step 3-5 + Task 3 Step 1 cobrem como "verificar".
- Critérios de aceite → Task 3 Step 1.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps têm código ou comando concreto.

**3. Type consistency:** `STUDY_TIME_LABELS_SHORT` e `PROFIT_GOAL_LABELS_SHORT` definidos em Task 1 com os mesmos `Record<StudyTime, string>` / `Record<ProfitGoal, string>` que os mapas longos. Consumidos em Task 2 com os mesmos nomes. `playerTierLabel`, `studyTime`, `profitGoal`, `accuracyPct`, `createdAt` são campos existentes do `SavedPlan` (linha 50, 37, 38, 53, 31 de `lib/poker/planStorage.ts`).
