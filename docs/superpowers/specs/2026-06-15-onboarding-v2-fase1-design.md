# Onboarding v2 — Fase 1: perguntas + captura

**Apelido interno:** Onboarding v2 / Fase 1 (perguntas + captura). A Fase 2 (regras de cálculo: tier fracionário + teto ABI + escala real de stake) vem em spec separado.

## Contexto

A reunião pediu uma reformulação grande do início do direcionamento (onboarding) + regras de negócio novas no cálculo do plano. Dividimos em 2 fases:

- **Fase 1 (este spec):** reformular as perguntas do form, capturar os novos dados, e implementar as derivações já travadas (objetivo→profitGoal, fórmula de volume, studyTime). Sem schema change destrutivo.
- **Fase 2 (futuro):** tier fracionário (1.5/2.5), teto de ABI por nível técnico, escala real banca→ABI até $54, `stakeGrade` definitivo.

`onboarding-ev` é branch de dev — nenhum aluno real gera plano aqui até o merge. Logo, derivações interinas na Fase 1 (ex.: `stakeGrade`) só afetam testes.

## Decisões (tomadas no brainstorming)

| Tema | Decisão |
|---|---|
| Estrutura | 2 fases; este spec é Fase 1 (perguntas + captura) |
| ABI e Volume (perguntas diretas) | **Removidas** — viram calculadas |
| Idade e Experiência | **Removidas** |
| Lead score (frio/morno/quente) | **Dropado** de vez (leadScore/leadCategory) |
| Nicks | Multi-site, 6 sites, JSONB |
| Tempo | horas/semana (6-48) + telas (1-10) |
| 2º número do tempo ("- 30") | Grind hours (display); volume usa o **total** |
| Fórmula volume | `horas × 0,5 × telas` — **travada**, implementada na Fase 1 |
| `stakeGrade` | **Interino** na Fase 1; escala real na Fase 2 |
| `playerTier` | `assessTier` inalterado (inteiro); fracionário na Fase 2 |

## Estrutura nova do form

De 9 steps → 6 steps:

| # | Step | Status |
|---|------|--------|
| 1 | Identidade (nome / email / WhatsApp) | mantém |
| 2 | Objetivo | muda → 4 opções |
| 3 | Tempo: horas/semana + telas | novo (2 sub-perguntas) |
| 4 | Banca | muda → 13 faixas |
| 5 | Nicks | muda → multi-site (6 campos) |
| 6 | WhatsApp opt-in | mantém |

Removidos: Idade, Experiência ("há quanto tempo joga"), ABI, Volume.

## Perguntas (texto final)

### Step 2 — Objetivo

> "Qual é o seu objetivo no poker?"

Single-select, 4 opções (auto-advance):

| valor | label | profitGoal |
|---|---|---|
| `competitivo` | Quero ser competitivo, mas não pretendo viver do jogo | `usd1k` |
| `renda_extra` | Ter renda extra, poder contar com os ganhos no jogo | `usd10k` |
| `profissional` | Ser profissional, ter o jogo como renda principal | `usd100k` |
| `ja_vive` | Já vivo do poker e quero escalar os limites | `usd50k` |

Mudança vs hoje: dropa `diversao`. `objetivoToProfitGoal` passa de 5→4 casos. (Mapeamento profitGoal preservado do atual: competitivo→usd1k, renda_extra→usd10k, profissional→usd100k, ja_vive→usd50k.)

### Step 3 — Tempo (2 sub-perguntas)

**3a — Horas/semana.** Título:
> "Aproximadamente, quanto tempo por semana você tem disponível para o poker (incluindo estudar, treinar e jogar)?"

Single-select, 8 opções. Valor capturado = total de horas. Label exibe total + grind (grind = total × 5/6, só display):

| valor (`weeklyHours`) | label |
|---|---|
| `6` | 6h por semana · 5h de grind |
| `12` | 12h por semana · 10h de grind |
| `18` | 18h por semana · 15h de grind |
| `24` | 24h por semana · 20h de grind |
| `30` | 30h por semana · 25h de grind |
| `36` | 36h por semana · 30h de grind |
| `42` | 42h por semana · 35h de grind |
| `48` | 48h por semana · 40h de grind |

**3b — Telas simultâneas.** Revelada após responder 3a. Título:
> "Durante uma sessão de grind online, quantas telas simultâneas você joga na maior parte do tempo?"

Single-select, 10 opções, valor `tables` = 1..10. Labels: "1 tela", "2 telas", … "10 telas". Layout: grid compacto (ex.: 5×2) pra não virar lista longa.

### Step 4 — Banca

> "Qual é a sua banca (em dólares) para jogar poker online?"

Subtítulo:
> "Lembre-se: sua banca (bankroll) não é apenas o que você tem nas suas contas de cada site neste exato momento, mas todo o dinheiro que você tem disponível para dar buy-ins de poker online. Caso você possa depositar mais do que tem depositado, some esse valor ao que você já tem nos sites."

Single-select, 13 faixas contíguas (auto-advance):

| valor | label |
|---|---|
| `lt_875` | Menor que $875 |
| `875_1499` | Entre $875 e $1.499 |
| `1500_2799` | Entre $1.500 e $2.799 |
| `2800_4249` | Entre $2.800 e $4.249 |
| `4250_5849` | Entre $4.250 e $5.849 |
| `5850_7599` | Entre $5.850 e $7.599 |
| `7600_9499` | Entre $7.600 e $9.499 |
| `9500_11999` | Entre $9.500 e $11.999 |
| `12000_15399` | Entre $12.000 e $15.399 |
| `15400_20699` | Entre $15.400 e $20.699 |
| `20700_26999` | Entre $20.700 e $26.999 |
| `27000_33749` | Entre $27.000 e $33.749 |
| `gte_33750` | $33.750 ou mais |

### Step 5 — Nicks (multi-site)

> "Preencha seus nicks nos sites abaixo. Responda apenas os que você já tem conta. Deixe em branco os sites onde você ainda não joga."

6 campos de texto opcionais, um por site:
- PokerStars (`pokerstars`)
- GGPoker (`ggpoker`)
- PartyPoker (`partypoker`)
- 888Poker (`p888`)
- WPN (`wpn`)
- iPoker (`ipoker`)

Todos opcionais — aluno pode avançar sem preencher nenhum (botão "Continuar →" sempre habilitado neste step). Trim em cada campo; campos vazios não entram no objeto persistido.

### Step 6 — WhatsApp opt-in

Mantido exatamente como hoje (sem mudança).

## Arquitetura / Componentes

### `lib/poker/leadScoring.ts` (renomear conceito, manter arquivo)

O arquivo deixa de ser sobre "lead scoring" e passa a ser sobre "quiz answers + derivações do plano". Mudanças:

**Remover:**
- `IDADE_OPTIONS`, `TEMPO_OPTIONS`, `ABI_OPTIONS`, `VOLUME_OPTIONS` e seus tipos (`IdadeAnswer`, `TempoAnswer`, `AbiAnswer`, `VolumeAnswer`).
- `computeLeadScore`, `computeLeadCategory`, `LeadCategory`, `leadScore`/`leadCategory` (e pontuação por opção).
- `volumeToWeeklyTarget` (substituída pela fórmula).
- `defaultStudyTime` (substituída por derivação de horas).

**Alterar:**
- `OBJETIVO_OPTIONS` → 4 opções (remove `diversao`). `ObjetivoAnswer` perde `diversao`.
- `objetivoToProfitGoal` → 4 casos.
- `BANCA_OPTIONS` → 13 faixas (labels acima). `BancaAnswer` ganha os 13 valores.
- `BANCA_GRADE` → mapeamento **interino** das 13 faixas pros valores de stake existentes (monotônico). Valores definitivos na Fase 2.

> **Nota de naming:** o campo/coluna `tables` (telas) é genérico. Não é palavra reservada no Postgres, mas o implementer pode preferir `screens` pra clareza — desde que aplique consistente em `OnboardingData`, `SavedPlan`, coluna DB e payload n8n.

**Adicionar:**
- `QuizAnswers` reduzido para `{ objetivo: ObjetivoAnswer; banca: BancaAnswer }`.
- `weeklyVolumeTarget(weeklyHours: number, tables: number): number` → `Math.round(weeklyHours * 0.5 * tables)`.
- `studyTimeFromHours(weeklyHours: number): StudyTime` → `weeklyHours <= 15 ? "ate15" : weeklyHours <= 40 ? "ate40" : "mais40"`.

**`BANCA_GRADE` interino (Fase 1):** mapear as 13 faixas pros 8 valores atuais (1, 2.5, 4, 7, 10, 13, 19, 28), monotônico:

```ts
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
```

(Interino — Fase 2 substitui pela escala real até $54.)

### `components/trainer/OnboardingForm.tsx`

- Remove steps Idade, Experiência, ABI, Volume.
- Step Objetivo: 4 opções.
- Novo step Tempo: 3a (horas, auto-advance revela 3b) + 3b (telas). Estado: `weeklyHours: number | null`, `tables: number | null`. Validação: ambos preenchidos pra avançar.
- Step Banca: 13 faixas.
- Step Nicks: 6 campos de texto opcionais. Estado: `sharkscopeNicks: Record<string, string>`. Substitui o step SharkScope atual (hasSharkscope/network/username single).
- `OnboardingData` atualizado: remove `quizAnswers.idade/tempo/abi/volume`, `leadScore`, `leadCategory`; `quizAnswers` vira `{ objetivo, banca }`; adiciona `weeklyHours`, `tables`, `sharkscopeNicks`. `stakeGrade`, `profitGoal`, `volumeTargetWeekly`, `studyTime` continuam (derivados como acima).
- Total de steps: 6.

**`finalSubmit` deriva:**
- `profitGoal = objetivoToProfitGoal(objetivo)`
- `stakeGrade = BANCA_GRADE[banca]` (interino)
- `volumeTargetWeekly = weeklyVolumeTarget(weeklyHours, tables)`
- `studyTime = studyTimeFromHours(weeklyHours)`

**Back-compat de nicks:** `sharkscopeUsername` = primeiro nick não-vazio (ordem dos 6 sites); `sharkscopeNetwork` = o site correspondente. Mantém as colunas single populadas.

### `app/api/leads/route.ts`

- Body aceita os novos campos (`weeklyHours`, `tables`, `sharkscopeNicks`) e os derivados.
- Persiste em `reglife_diagnostic_results`: `weekly_hours`, `tables`, `sharkscope_nicks` (jsonb), + `sharkscope_username`/`sharkscope_network` (primário, back-compat).
- Para de gravar `lead_score`/`lead_category` (grava null — colunas mantidas).
- Payload do n8n webhook: remove idade/tempo/abi/volume/leadScore/leadCategory; adiciona weeklyHours/tables/sharkscopeNicks.

### Migration (`reglife_diagnostic_results`)

```sql
ALTER TABLE reglife_diagnostic_results
  ADD COLUMN IF NOT EXISTS weekly_hours integer,
  ADD COLUMN IF NOT EXISTS tables integer,
  ADD COLUMN IF NOT EXISTS sharkscope_nicks jsonb;
```

⚠️ **Aplicar em prod explicitamente.** O Supabase de prod (easypanel) tem drift de migrations não aplicadas — esta migration precisa ser rodada lá manualmente, senão `/api/leads` dá 500 "db error" ao gravar os campos novos.

Colunas `lead_score`/`lead_category` **não** são dropadas (evita migration destrutiva); apenas param de ser escritas.

### `lib/poker/planBuilder.ts` / `planStorage.ts`

- `SavedPlan` ganha (opcionais, back-compat): `weeklyHours?: number`, `tables?: number`. `volumeTargetWeekly` e `stakeGrade` já existem.
- `buildPlan` propaga `weeklyHours`/`tables` se vierem; `volumeTargetWeekly` e `studyTime` já chegam derivados do submit.
- Sem mudança em `playerTier` (Fase 2).

## Data Flow

```
OnboardingForm (6 steps)
  └─ objetivo  → objetivoToProfitGoal → profitGoal
  └─ weeklyHours + tables → weeklyVolumeTarget → volumeTargetWeekly
                          → studyTimeFromHours → studyTime
  └─ banca → BANCA_GRADE (interino) → stakeGrade
  └─ sharkscopeNicks → {site: nick} + primário (back-compat)
         ↓ POST /api/leads
  reglife_diagnostic_results (+ weekly_hours, tables, sharkscope_nicks)
         ↓ diagnóstico roda → assessTier → playerTier (inteiro, inalterado)
         ↓ POST /api/results → buildPlan → SavedPlan
```

## Error Handling / Edge Cases

- **Nenhum nick preenchido:** `sharkscopeNicks = {}`, `sharkscopeUsername`/`Network` = null. Step avança normalmente (todos opcionais).
- **weeklyHours/tables não selecionados:** step não avança (validação).
- **Plano antigo (localStorage) sem weeklyHours/tables:** campos opcionais em `SavedPlan`; consumidores usam `?? undefined`. `volumeTargetWeekly` já existente segue.
- **Migration não aplicada em prod:** `/api/leads` daria 500 ao gravar colunas inexistentes — daí o heads-up. Mitigação: aplicar a migration antes do deploy.

## Out of Scope (Fase 2)

- Tier fracionário (1.5 / 2.5) no `assessTier`.
- Teto de ABI por nível técnico (max $7/$13/$19/$28/$54).
- Escala real banca→ABI (13 faixas → valores até $54), substituindo o `BANCA_GRADE` interino.
- ABI recomendado final = `min(banca-permitido, teto-técnico)` ("primeiro critério é banca").
- Qualquer ajuste do fluxo n8n (lado do usuário, não-código).

## Critérios de Aceite

- [ ] Form tem 6 steps; Idade/Experiência/ABI/Volume removidos.
- [ ] Objetivo com 4 opções; `objetivoToProfitGoal` cobre os 4.
- [ ] Step Tempo: horas (6-48, label com grind) + telas (1-10), ambos capturados.
- [ ] Banca com 13 faixas contíguas (labels exatos do spec).
- [ ] Nicks: 6 campos opcionais; `sharkscopeNicks` JSONB; primário em `sharkscope_username`/`network`.
- [ ] `volumeTargetWeekly = round(weeklyHours * 0.5 * tables)`.
- [ ] `studyTime` derivado de `weeklyHours`.
- [ ] `stakeGrade` = `BANCA_GRADE` interino (13 faixas).
- [ ] `leadScore`/`leadCategory` removidos do código; colunas param de ser escritas (não dropadas).
- [ ] Migration adiciona `weekly_hours`, `tables`, `sharkscope_nicks`; marcada pra aplicar em prod.
- [ ] Payload n8n atualizado (campos novos entram, antigos saem).
- [ ] `playerTier` inalterado (inteiro).
- [ ] tsc, lint, build limpos.

## Validação Manual

Projeto sem suite de testes. Smoke:

1. Preencher onboarding completo → conferir os 6 steps na ordem, sem Idade/Experiência/ABI/Volume.
2. Objetivo "renda_extra" → plano com `profitGoal = usd10k`.
3. Tempo 36h + 5 telas → `volumeTargetWeekly = 90` (36×0,5×5), `studyTime = ate40`.
4. Banca "Entre $4.250 e $5.849" → `stakeGrade = 10` (interino).
5. Nicks: preencher só GGPoker → `sharkscopeNicks = { ggpoker: "x" }`, `sharkscope_username = "x"`, `sharkscope_network = "GGPoker"`.
6. Nenhum nick → `sharkscopeNicks = {}`, colunas single null, avança normal.
7. `npx tsc --noEmit`, lint, `npm run build` limpos.
