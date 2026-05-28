# Design — `/meu-plano` v2 (trilha de 3 spots) + migração do Health Score

**Data:** 2026-05-28
**Branch:** `onboarding-ev`
**Status:** Aprovado para implementação

---

## 1. Contexto e objetivo

Hoje a página `/meu-plano` entrega ao aluno:

- Um bloco grande de **Health Score** (0–100, banda colorida, breakdown)
- Uma **lista vertical de 6 itens** rotulados genericamente como "Spot 1 — aula + treino", "Spot 2 — aula + treino" etc., construída em `lib/poker/challenge30d.ts`

Problemas identificados:

- **Genérico:** o aluno não sabe por que esse spot, o que vai aprender ou o que treinar
- **Sem priorização:** os 3 spots aparecem como itens iguais
- **Sem plano de ação:** só links, sem meta, sem critério de conclusão
- **Visual fraco:** nada destaca a importância de cada spot
- **Health Score no lugar errado:** é informação que serve o admin/coach para triagem, não o aluno

**Objetivo deste design:**

1. Reformular `/meu-plano` em torno de uma **trilha sequencial de 3 spots**, com gating automático medido pelo trainer
2. **Remover** o Health Score do aluno e levá-lo ao admin (listagem + página do aluno)

O resto da infra (PDF, EV Manager, EvHud, PulseCard, fluxo de diagnóstico, leadScoring, cálculo do health) é preservada.

---

## 2. Decisões fechadas no brainstorm

| Decisão | Valor |
|---|---|
| Modelo dos 3 spots | Sequencial (Spot 1 → 2 → 3) com gating rígido |
| Conteúdo por card | Diagnóstico + aula + treino + critério de conclusão |
| Critério de conclusão | Automático via trainer |
| Threshold | 70% de acerto em ≥ 50 mãos |
| Trainer | Trainer interno isolado por spot (`/trainer/spot/[leakId]`) |
| Hierarquia | Trilha em destaque; Carreira/Grade/Manager viram "Recursos" secundários |
| Health Score (aluno) | Removido de `/meu-plano` |
| Health Score (admin) | Coluna em `/admin` + bloco detalhado em `/admin/resultado/[id]` |

---

## 3. Nova estrutura de `/meu-plano`

A página passa a ter 3 zonas, nessa ordem:

### Zona 1 — Topo (contexto leve)

- Logo + título "Plano de Progressão Individual — {nome}"
- **Removido:** `HealthScoreBlock`
- Mantém: `EvHud` (Streak/XP/Volume/Quest), `PulseCard`, botão "Baixar plano em PDF"

### Zona 2 — Trilha dos 3 Spots (destaque principal)

Header "Sua trilha de 30 dias". Abaixo, 3 cards verticais empilhados com hierarquia visual forte:

- **Spot ativo** — card grande, accent amber, conteúdo expandido (ver §4)
- **Spot bloqueado** — card médio, desaturado, ícone de cadeado, mostra só nome do leak + "Disponível após concluir Spot {n-1}"
- **Spot concluído** — card médio, checkmark verde, "Concluído em N mãos · X% de acerto"

Apenas 1 spot fica em estado "ativo" por vez. Quando o ativo fecha, o próximo expande automaticamente.

### Zona 3 — "Recursos pra sua jornada" (secundária)

Visualmente menor, sem accent. Contém:

- Card "Aula de construção de carreira" (Yuri)
- Card "Grade de torneios" (rota por ABI)
- Card "EV — Manager de Evolução" (chat)

### Footer

"Refazer nivelamento" + "Baixar PDF" (mantém).

---

## 4. Anatomia do card de Spot ativo

Layout vertical, 4 blocos:

```
┌─────────────────────────────────────────────┐
│ SPOT 1 / 3                  [pílula: Tier 1]│
│ Cbet do BTN em 40bb                         │
│                                             │
│ ─ Por que esse spot ────────────────────────│
│ Você acertou 35% no nivelamento. Esse é seu │
│ leak nº1 — em média custa 4 bb/100 jogadas. │
│                                             │
│ ─ O que você vai aprender ──────────────────│
│ 📺 Aula: "C-Bet IP em 40bb"  [ ] Vi a aula  │
│ "Quando puxar pequena, grande ou checar     │
│  texturas dry vs. wet com SPR baixo."       │
│                                             │
│ ─ Treine este spot ─────────────────────────│
│ Meta: 70% de acerto em 50 mãos              │
│                                             │
│ ▰▰▰▰▰▱▱▱▱▱  32/50 mãos · 68% acerto         │
│                                             │
│ [▶ Treinar este spot]                       │
│                                             │
│ ✓ Critério: 70% em 50 mãos → libera Spot 2  │
└─────────────────────────────────────────────┘
```

### Componentes-chave

- **Diagnóstico real:** vem do `DiagnosticSummary` (campos `leak.pct` + custo estimado em bb/100). O texto é gerado por template a partir do leak.
- **Aula com título + sinopse:** título e sinopse de 1 linha vêm do `lessonCatalog.ts` (ver §9, item *lessonCatalog*). Checkbox "Vi a aula" é puramente marcador local — não bloqueia avanço.
- **Barra de progresso ao vivo:** lê do endpoint de progresso por spot (ver §5).
- **CTA "Treinar este spot":** leva pra `/trainer/spot/[leakId]`.
- **Critério explícito** abaixo do botão.

### Estados do card

| Estado | Visual | Conteúdo |
|---|---|---|
| `active` | Card grande, accent amber, expandido | 4 blocos completos |
| `locked` | Card médio, desaturado, cadeado | "Spot N — {nome do leak} · Disponível após concluir Spot {n-1}" |
| `completed` | Card médio, checkmark verde | "Concluído em N mãos · X% de acerto" |

---

## 5. Trainer isolado por spot (`/trainer/spot/[leakId]`)

Nova rota. Reaproveita o `TrainerScreen` atual em modo "single-spot":

- Recebe `leakId` na URL (ex.: `cBet-BTN-40`)
- Em vez de sortear de todos os spots do diagnóstico, sorteia **apenas** mãos daquele spot (usa `lib/poker/listSpots.ts` filtrado por `leakId`)
- Não termina em `ResultsScreen`. Sessão fica "infinita" — aluno pode jogar quanto quiser. Sai pelo botão "voltar" ou fecha aba.
- Cada mão registrada chama `POST /api/spot-training` com `{ diagnosticId, leakId, correct: bool }`
- Quando `hands_played >= 50 && correct/played >= 0.70` → `completed_at` é gravado e o front é notificado (próxima resposta da API inclui flag `unlockNext: true`)

### Persistência

Nova tabela Supabase `spot_training_sessions`:

```sql
create table spot_training_sessions (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id text not null references diagnostics(id),
  leak_id text not null,
  hands_played int not null default 0,
  hands_correct int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diagnostic_id, leak_id)
);

create index on spot_training_sessions(diagnostic_id);
```

Uma linha por `(diagnosticId, leakId)`. Cada POST faz upsert + incremento.

### Identidade do aluno

Chave de progresso: `diagnosticId` (já existe, hoje persistido em localStorage + DB).

**Aceito como limitação do v1:** se aluno trocar de device sem ter o `diagnosticId` no localStorage local, perde o progresso de treino. Mitigação futura (não no escopo deste spec): pedir e-mail no início do treino para vincular sessões antigas.

---

## 6. Critério e gating

- **Threshold:** 70% acerto em ≥ 50 mãos
- **Cálculo:** acumulativo sobre todas as sessões do mesmo `leakId` daquele aluno (uma linha na tabela, ver §5)
- **Anti-cheese:** janela mínima de 50 mãos. Aluno não consegue completar em poucos acertos sortudos.
- **Visualização:** barra de progresso na frente do card. Se passar de 50 mãos com < 70%, copy muda para "Quase lá — continue até 70%."
- **Conclusão:** ao bater critério → micro-animação "Spot N concluído ✓" + próximo card expande automaticamente. Aluno pode continuar treinando o spot concluído livremente.
- **Ordem dos spots:** definida em `buildSpotTrack` usando a mesma ordenação canônica de `canonicalSlotForLeak` que já existe em `lib/poker/spotLinks.ts`.

---

## 7. Edge cases — alunos atípicos

### Aluno com menos de 3 leaks

Se o diagnóstico gerou só 1 ou 2 leaks (aluno passou em quase tudo), os slots restantes na trilha viram **cards informativos** sem cadeado e sem bloquear nada:

> "Você passou nos demais spots do nivelamento. Foque em volume e revise mãos próprias."

Não há Spot 3 com cadeado eterno. Trilha pode ter 1, 2 ou 3 spots reais.

### Leak sem aula real (placeholder)

Se um leak cai em `PLACEHOLDER` no `spotLinks.ts`, o bloco "O que você vai aprender" no card mostra um fallback elegante:

> "Aula em produção — fale com o EV Manager pra orientação personalizada."

E o link do trainer ainda funciona (o sistema de spots não depende da aula).

### Leak Tier 3 sem spot interno jogável

Alguns temas em `THEME` (squeeze, probeTurn, etc.) têm aula mas **não têm spot jogável no trainer**. Se um leak cair nessa categoria:

- O card mostra aula + descrição normalmente
- O bloco "Treine este spot" é substituído por um aviso: "Esse spot ainda não está no trainer interno. Treine no [link externo] e marque manualmente abaixo."
- Aparece um checkbox manual "Concluí este spot" que substitui o gating automático **apenas para esse spot específico**

Pré-requisito: a função `hasInternalTrainer(leakId)` precisa ser implementada (mapa estático em `lib/poker/spotLinks.ts`).

---

## 8. Migração do Health Score para o admin

### Remover do aluno

- Em `components/trainer/PlanScreen.tsx` (linhas ~139-144): remover o bloco `{plan.diagnosticId && <HealthScoreBlock ... />}`
- Remover o import de `HealthScoreBlock` em `PlanScreen.tsx`
- Componente em si **fica no codebase** — reaproveitado no admin
- Infra preservada: `lib/health/score.ts`, `lib/health/snapshot.ts`, `api/cron/health-score`, `lib/triggers/healthBandChange.ts`

### Adicionar no admin

**(a) Listagem `/admin` — nova coluna "Health":**

- Mostra número (0–100) + bolinha colorida pela banda (verde/amarelo/laranja/vermelho)
- Sortável (clicar ordena alunos do pior pro melhor — triagem rápida de quem está vermelho)
- Mostra `—` se ainda não foi calculado

**(b) Detalhe `/admin/resultado/[id]` — novo bloco no topo:**

- Reutiliza `HealthScoreBlock` em modo `admin` (ver prop nova abaixo)
- Mostra: número grande + barra + 3 pílulas (Resultado/Conclusão/Sentimento) + leaks fechados
- Adiciona mini-histórico de 7 dias (sparkline simples) lendo de `health_snapshots`

### Mudança no componente `HealthScoreBlock`

Adicionar prop `mode: "self" | "admin"`:

- `mode="self"` (default) → comportamento atual: chama `/api/health/me?diag=...`
- `mode="admin"` → chama `/api/admin/health/[diagnosticId]` (nova rota), exibe mini-histórico de 7 dias

### Nova rota

`app/api/admin/health/[diagnosticId]/route.ts` — GET retorna `{ snapshot, history: HealthSnapshot[] }`. Gated por auth de admin (mesmo padrão de `/api/results`).

---

## 9. Mudanças concretas no código

### Arquivos novos

- `app/trainer/spot/[leakId]/page.tsx`
- `components/trainer/SpotTrainerScreen.tsx` (ou refator de `TrainerScreen` aceitando modo `single-spot`)
- `components/trainer/SpotTrack.tsx` — a trilha de 3 cards
- `components/trainer/SpotCard.tsx` — card individual (active/locked/completed)
- `components/trainer/ResourcesBlock.tsx` — bloco "Recursos pra sua jornada"
- `app/api/spot-training/route.ts` — `POST` registra mão e devolve progresso/`unlockNext`; `GET ?diagnosticId=&leakId=` lê progresso
- `app/api/admin/health/[diagnosticId]/route.ts` — GET snapshot + histórico
- Migration Supabase: `spot_training_sessions`

### Arquivos modificados

- `components/trainer/PlanScreen.tsx` — remove `HealthScoreBlock`; troca lista atual por `<SpotTrack>` + `<ResourcesBlock>`
- `components/trainer/HealthScoreBlock.tsx` — adiciona prop `mode`; quando `admin`, busca endpoint admin e mostra mini-histórico
- `lib/poker/challenge30d.ts` — refator: divide em `buildSpotTrack(plan)` (3 spots) e `buildResources(plan)` (carreira + grade)
- `lib/poker/spotLinks.ts` — adiciona `hasInternalTrainer(leakId)` (mapa estático)
- `lib/poker/lessonCatalog.ts` — garantir título + sinopse curta (1 linha) por tema. Onde faltar, popular.
- `app/admin/page.tsx` — nova coluna Health, sortável
- `app/admin/resultado/[id]/page.tsx` — bloco `HealthScoreBlock mode="admin"` no topo

### Não muda

- PDF (`lib/pdf/generatePlanPdf.tsx`) — continua usando a entrega tradicional. Sugestão futura (fora do escopo): refletir a trilha no PDF.
- EV Manager, fluxo de diagnóstico (`/diagnostico`), `leadScoring.ts`, cálculo do health (`lib/health/*`)

---

## 10. Sinopse de aula (fonte)

Por enquanto, sinopses ficam **estáticas no `lessonCatalog.ts`** (em vez de gerar dinamicamente). Uma sinopse curta por tema (RFI, Cbet IP, Cbet OOP, etc.). O título da aula já existe no catálogo; só falta a sinopse de 1 linha em alguns temas.

Vantagem: rápido, determinístico, fácil de editar. Não depende de LLM no runtime.

---

## 11. Mini-histórico de Health Score (escopo v1)

**Incluído no v1.** É a feature que torna o bloco do admin realmente útil pra acompanhamento ao longo do tempo. Implementação simples: sparkline SVG com até 7 pontos lendo direto de `health_snapshots`.

---

## 12. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Aluno troca de device, perde progresso de treino | Aceito no v1. Aluno mantém `diagnosticId` no localStorage, e o `/diagnostico` re-vincula se ele refizer. Mitigação futura: e-mail. |
| Leak cai em aula placeholder | Card mostra fallback elegante (§7) |
| Spot Tier 3 não tem trainer interno | Card vira modo manual com checkbox + link externo (§7) |
| Mudança de identidade visual quebra layout em mobile | Cards são vertical-stack; testar em viewport ≤375px na implementação |
| API `/api/health/me` exposta sem auth admin | Nova rota separada `/api/admin/health/[id]` com gating de admin; rota antiga permanece para o caso de roll-back rápido |

---

## 13. Critérios de sucesso (verificação manual no fim)

- [ ] `/meu-plano` mostra trilha de 3 spots, não a lista de 6 itens
- [ ] Spot 2 e Spot 3 começam bloqueados (cadeado) quando o aluno chega na página
- [ ] `/trainer/spot/[leakId]` sorteia apenas mãos do spot escolhido
- [ ] Após 50 mãos com ≥70% de acerto, o spot fecha automaticamente e o próximo expande
- [ ] Aluno com 0 leaks vê trilha com 3 cards informativos, sem cadeado
- [ ] `/meu-plano` NÃO mostra mais o Health Score
- [ ] `/admin` mostra coluna Health Score sortável com bolinha colorida
- [ ] `/admin/resultado/[id]` mostra bloco Health Score grande + sparkline de 7 dias
- [ ] Carreira, Grade de torneios e Manager EV ainda existem em `/meu-plano`, em seção "Recursos"
- [ ] PDF do plano continua gerando sem erro
