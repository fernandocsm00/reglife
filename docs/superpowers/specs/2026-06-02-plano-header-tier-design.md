# Spec — Header do plano com Tier + contexto do ciclo

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Arquivo principal afetado:** `components/trainer/PlanScreen.tsx`

## Problema

O topo da página `/meu-plano` mostra hoje apenas:

```
Plano de Progressão Individual — {playerName}.
```

O EV (mentor humano) e o próprio aluno perdem contexto crítico ao bater o olho na
página: em que Tier o aluno está, em que dia do ciclo de 90, qual a meta declarada
e a dedicação prometida. Toda essa informação já existe no `SavedPlan` salvo —
está sendo desperdiçada.

## Escopo desta entrega

Adicionar duas linhas de contexto logo abaixo do H1 existente, usando dados que
já vivem no `SavedPlan` (zero schema change, zero API nova).

**Fora de escopo** (entram em specs posteriores):
- Placar (`EvHud`) com metas mensais e % por spot.
- Admin: visão da trilha do aluno em `/admin/resultado/[id]`.
- Tratamento de "ciclo concluído" (dia > 90).

## Design

### Estrutura final do header

```
Plano de Progressão Individual — Fernando.

TIER 1 · DIA 5 DE 90
32% de acerto no nivelamento · Meta U$10.000 · Até 15h/sem
```

### Hierarquia visual

- **H1** (inalterado em estrutura): `Plano de Progressão Individual — {playerName}.`
- **Eyebrow** (linha 1 abaixo do H1):
  - Texto: `TIER {N} · DIA {X} DE 90`
  - Estilo: uppercase, tracking-widest, accent color (amber), ~12-13px.
- **Body-sm** (linha 2 abaixo do H1):
  - Texto: `{accuracyPct}% de acerto no nivelamento · Meta {profitGoalLabel} · {studyTimeLabel}`
  - Estilo: neutro (`var(--rg-fg-subtle)`), ~13px.

Separador entre infos: ` · ` (middle dot, espaços nos dois lados).

### Posicionamento no arquivo

`components/trainer/PlanScreen.tsx`, dentro do `<motion.div>` do header
(atualmente linhas 88–101). Inserir as duas linhas novas imediatamente após
o `<h1>`, antes do fechamento do `motion.div`. Não criar componente novo:
são ~15 linhas de JSX coladas a este header e sem reuso fora dele.

### Cálculos derivados (client-side)

Todos a partir do `SavedPlan` já em mãos:

| Campo exibido | Fonte | Fallback |
|---|---|---|
| `playerTierLabel` | `plan.playerTierLabel` (já formatado, ex.: `"Tier 1"`) | `"Tier ?"` |
| `cycleDay` | `Math.max(1, Math.floor((Date.now() - plan.createdAt) / 86_400_000) + 1)`, depois `Math.min(_, 90)` | `1` |
| `accuracyPct` | `plan.accuracyPct` | `0` (mostra `0% de acerto` honesto) |
| `profitGoalLabel` | `PROFIT_GOAL_LABELS[plan.profitGoal]` (de `lib/poker/planBuilder`) | usa raw `plan.profitGoal` |
| `studyTimeLabel` | `STUDY_TIME_LABELS[plan.studyTime]` (de `lib/poker/planBuilder`) | usa raw `plan.studyTime` |

### Edge cases

- **Aluno "Elite"** (passou em todos os spots): roteado para `/reg-life-team`,
  não cai em `PlanScreen` — sem tratamento necessário.
- **`cycleDay > 90`**: clamp em 90 (`Math.min`). Tratamento de "Ciclo concluído"
  fica para spec futuro.
- **`playerTierLabel` ausente** (planos antigos sem o campo): fallback `"Tier ?"`.
  Não bloqueia render.
- **`accuracyPct === 0`** (aluno errou tudo, mas gerou plano): mostra `0% de acerto
  no nivelamento` — informação honesta, não esconde.

### Print/PDF

`PlanScreen.tsx` já usa `print:hidden` em vários blocos para esconder do PDF
(EV card, EvHud, PulseCard, PDF hero, etc.). **O header (H1) é visível no print
hoje.** Mantemos as duas linhas novas visíveis no print também — fazem sentido
no PDF baixado pelo aluno.

Ajustes de cor para o print:
- Eyebrow no print: `text-neutral-700` (em vez de accent amber, que sumiria no fundo branco).
- Body-sm no print: `text-neutral-600`.

Usar `print:text-neutral-700` / `print:text-neutral-600` (Tailwind) para a
sobreposição.

## Arquitetura

Edição cirúrgica em um único arquivo:

```
components/trainer/PlanScreen.tsx   ← +~15 linhas JSX no header,
                                       +import { STUDY_TIME_LABELS,
                                                PROFIT_GOAL_LABELS }
                                                from "@/lib/poker/planBuilder"
```

Sem novos componentes, sem novos endpoints, sem mudanças de schema, sem mudanças
em libs.

## Testes

Spec curto, risco visual baixo. Sem teste automatizado novo dedicado.

**Verificação manual:**
1. Abrir `/meu-plano` com um plano gerado — conferir que as duas linhas aparecem
   com valores corretos.
2. Imprimir / baixar PDF — conferir contraste das linhas novas no fundo branco.
3. Forçar `playerTierLabel = undefined` localmente — conferir fallback `"Tier ?"`.
4. Forçar `createdAt` antigo (>90 dias) — conferir clamp em `Dia 90 de 90`.

## Critérios de aceite

- [ ] H1 da página `/meu-plano` permanece textualmente `Plano de Progressão
      Individual — {playerName}.`
- [ ] Logo abaixo do H1 aparece eyebrow uppercase com `TIER {N} · DIA {X} DE 90`.
- [ ] Logo abaixo do eyebrow aparece linha neutra com
      `{accuracyPct}% de acerto no nivelamento · Meta {profitGoalLabel} · {studyTimeLabel}`.
- [ ] Linhas novas aparecem no PDF/print com cor adaptada para fundo branco.
- [ ] `cycleDay` é clamped em [1, 90].
- [ ] `playerTierLabel` ausente vira `"Tier ?"` sem quebrar render.
- [ ] Nenhuma chamada HTTP nova feita pelo `PlanScreen`.
