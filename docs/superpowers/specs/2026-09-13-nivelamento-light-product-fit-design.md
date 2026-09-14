# Nivelamento Light + Product Fit (Bases / Protocolo / Comunidade / Time)

**Branch:** `nivelamento-light` (criado a partir de `onboarding-ev`)
**Fontes:** `TST _ pesquisa lead scoring.docx` (questionário + cores) e `_Nivelamento Light _ Direcionamento.docx` (mãos + regra 70/50).

## Contexto

Reformulação do trainer em duas frentes:

1. **Qualificação do lead.** Um questionário novo substitui 100% o form do Onboarding v2. Cada resposta indica o requisito mínimo para um produto: Bases, Protocolo, Comunidade ou Time. O resultado do teste de nivelamento também aponta um produto. O produto final é o **menor** dos dois.
2. **Sequência de mãos.** Os 16 JSONs de `public/spots/` passam a ter exatamente as mãos do doc Nivelamento Light, na ordem do doc. Isso vale para o teste e para os treinos do plano.

O produto indicado aparece **só no admin, no CSV e nos webhooks do n8n**. A experiência do aluno (tier 1/2/3, leaks, plano) continua como está.

## Decisões (brainstorming)

| Tema | Decisão |
|---|---|
| Cores do questionário | Cada cor marca o **requisito mínimo** do produto; os requisitos acumulam |
| Perfil × teste | `final = min(perfil, técnico)` |
| % do teste | Acerto sobre as mãos **jogadas**; **mantém o early stop** (3 spots abaixo de 70%) |
| Form | **Substitui 100%** pelo questionário do doc (saem horas/telas, nicks, banca em 13 faixas) |
| Exibição do produto | Só admin, CSV e webhook |
| Mãos | Substitui o conteúdo dos 16 JSONs, `mode: "ordered"` |
| Persistência | Abordagem A: colunas `product_profile`, `product_test`, `product_final` (migration 016) |
| Early stop | Por arquivo JSON (16 módulos), como hoje |

## 1. Questionário

### Telas (ordem)

| # | Tela | Tipo |
|---|---|---|
| 1 | Identidade: Nome, Email, WhatsApp | inputs (mantém o componente atual) |
| 2 | Idade | single-select, auto-advance |
| 3 | Tempo de jogo | single-select, auto-advance |
| 4 | Objetivo | single-select, auto-advance |
| 5 | ABI (Sharkscope, 6 meses) | single-select, auto-advance |
| 6 | Torneios por mês (Sharkscope) | single-select, auto-advance |
| 7 | Banca (com o texto "Lembre-se…") | single-select, auto-advance |
| 8 | Opt-in WhatsApp | mantém |

### Perguntas e valores

Textos das perguntas e das opções exatamente como no doc. A coluna "rank" é a ordem da opção (0 = primeira).

**Qual é a sua idade?** (`idade`): não pontua.

| value | label |
|---|---|
| `18_24` | 18 a 24 anos |
| `25_34` | 25 a 34 anos |
| `35_44` | 35 a 44 anos |
| `45_54` | 45 a 54 anos |
| `55_mais` | 55 anos ou mais |

**Há quanto tempo você joga poker?** (`tempoJogo`)

| rank | value | label |
|---|---|---|
| 0 | `aprendendo` | Estou aprendendo agora |
| 1 | `lt_1` | Há menos de 1 ano |
| 2 | `1_3` | Entre 1 e 3 anos |
| 3 | `3_5` | Entre 3 e 5 anos |
| 4 | `gt_5` | Há mais de 5 anos |

**Qual é o seu objetivo no poker?** (`objetivo`)

| rank | value | label |
|---|---|---|
| 0 | `diversao` | Diversão, não me preocupo com resultado |
| 1 | `competir` | Competir, mas não pretendo viver do jogo |
| 2 | `renda_extra` | Renda extra, poder contar com os ganhos no jogo |
| 3 | `profissional` | Ser profissional, ter o jogo como renda principal |
| 4 | `ja_vive` | Já vivo do poker e quero crescer na carreira |

**Segundo o Sharkscope, qual é o seu ABI (buy-in médio) em dólares nos últimos 6 meses?** (`abi`)

| rank | value | label |
|---|---|---|
| 0 | `nao_sei` | Não sei |
| 1 | `lt_5` | Abaixo de $5 |
| 2 | `5_13` | Entre $5 e $13 |
| 3 | `13_23` | Entre $13 e $23 |
| 4 | `23_54` | Entre $23 e $54 |
| 5 | `gt_54` | Acima de $54 |

**Segundo o Sharkscope, quantos torneios você joga por mês atualmente (pode ser a média dos últimos 6 meses)?** (`torneiosMes`)

| rank | value | label |
|---|---|---|
| 0 | `nao_sei` | Não sei |
| 1 | `lt_100` | Menos de 100 torneios |
| 2 | `100_200` | Entre 100 e 200 torneios |
| 3 | `200_300` | Entre 200 e 300 torneios |
| 4 | `gt_300` | Mais de 300 torneios |

**Qual é a sua banca (em dólares) neste momento?** (`banca`), com o texto de apoio do doc.

| rank | value | label |
|---|---|---|
| 0 | `lt_875` | Menor que $875 |
| 1 | `875_2000` | $875 a $2.000 |
| 2 | `2001_5000` | $2.001 a $5.000 |
| 3 | `5001_10000` | $5.001 a $10.000 |
| 4 | `gt_10000` | Maior que $10.000 |

### Derivações para o plano

O plano, o PDF e o coach IA continuam consumindo `profitGoal`, `volumeTargetWeekly`, `studyTime` e `stakeGrade`.

| Campo | Regra |
|---|---|
| `profitGoal` | diversao, competir → `usd1k` · renda_extra → `usd10k` · profissional → `usd100k` · ja_vive → `usd50k` |
| `volumeTargetWeekly` | nao_sei → 25 · lt_100 → 20 · 100_200 → 38 · 200_300 → 63 · gt_300 → 88 |
| `studyTime` | nao_sei, lt_100 → `ate15` · 100_200, 200_300 → `ate40` · gt_300 → `mais40` |
| `stakeGrade` | lt_875 → 1 · 875_2000 → 2.5 · 2001_5000 → 4 · 5001_10000 → 10 · gt_10000 → 19 |

`stakeGrade` usa o piso de cada faixa na escala `BANCA_GRADE` interina. Todos os valores existem em `GRADE_LINKS`.

## 2. Classificação (`lib/poker/productFit.ts`)

Funções puras, sem I/O. Ordem dos produtos: `bases < protocolo < comunidade < time`.

### 2.1 Perfil: `profileProduct(quiz): Product | null`

Requisitos mínimos por rank (acumulativos: cada produto herda os requisitos dos anteriores):

| Produto | tempoJogo ≥ | objetivo ≥ | abi ≥ | torneiosMes ≥ | banca ≥ |
|---|---|---|---|---|---|
| bases | 0 (aprendendo) | 1 (competir) | 0 | 0 | 0 |
| protocolo | 2 (1_3) | 2 (renda_extra) | 0 | 0 | 0 |
| comunidade | 4 (gt_5) | 3 (profissional) | 1 (lt_5) | 2 (100_200) | 1 (875_2000) |
| time | 4 (gt_5) | 4 (ja_vive) | 4 (23_54) | 4 (gt_300) | 1 (875_2000) |

Retorna o produto **mais alto** cujos requisitos são todos cumpridos. Se nem `bases` fecha (objetivo = diversao), retorna `null` ("Fora do perfil"). Idade não entra.

Origem de cada célula, pelas cores do doc: Cinza = Bases, Verde = Protocolo, Amarelo = Comunidade, Azul = Time. Onde um produto não tem cor numa pergunta, herda o requisito do produto anterior. Exemplo: Time não tem cor em tempo nem em banca, então herda os mínimos de Comunidade.

### 2.2 Técnico: `testBucket(pct): TestBucket`

- `pct >= 70` → `time`
- `pct >= 50` → `comunidade`
- `pct < 50` → `comunidade_ou_protocolo`

`pct = round(acertos / mãos jogadas × 100)`, calculado a partir de `results`. Com early stop, conta só as mãos jogadas.

### 2.3 Final: `finalProduct(profile, bucket): Product | null`

- `profile == null` → `null`
- bucket `time` → `min(profile, time)` = profile
- bucket `comunidade` ou `comunidade_ou_protocolo` → `min(profile, comunidade)`

Consequência aceita: 50–69% e <50% dão o mesmo produto final. A diferença só aparece em `product_test`, visível no admin e no CSV. Bases nunca vem do teste, só do perfil.

## 3. Mãos (`public/spots/*.json`)

### Regra de sincronização

1. Cada arquivo contém **exatamente** as mãos do doc para o seu módulo, **na ordem do doc**, com `mode: "ordered"` e `sessionSize` = número de mãos. Mãos que não estão no doc são removidas.
2. Onde o doc é explícito, ele manda: posição, stack, vilão(ões), board, mão, resposta(s), pot e stacks restantes.
3. Onde o doc é vago, vale a resolução já existente no JSON atual:
   - "KQo no bordo A93rbw" → board `As-9d-3c`, combo `KQo`
   - "Qd9c call ou raise" e "Ah3d call ou raise" → `CALL|RAISE 33%|RAISE 55%`
   - "raise 33/55" → `RAISE 33%|RAISE 55%`
   - "BTN vs UTG: Ac7c no board AsAc7s" (carta duplicada, mão impossível) → combo `Ah7c`, board `As-Ad-7s`
4. Convenções de botão já estabelecidas nos JSONs:
   - SB GAP: "Call" → `LIMP`
   - Bet vs Missed: "bet 33%" → `BET 30%`
   - Cbet flop IP: "Cbet 33%" → `CBET 1/3`
   - "X ou Y" → várias respostas aceitas
   - Raise mostra só o size correto, via `defaultRaiseSize`
5. Estrutura e ordem dos arquivos inalteradas (`app/diagnostico/page.tsx`). O early stop continua por arquivo.

### Arquivo por módulo do doc

| Tier | Módulo do doc | Arquivo | Mãos |
|---|---|---|---|
| 1 | RFI | `reglife-rfi-prioridades` | 15 |
| 1 | Cbet em posição vs BB | `reglife-cbet-flop-vs-bb` | 10 |
| 1 | Cbet Turn + Cbet River vs BB | `reglife-cbet-turn-river-vs-bb` | 10 + 10 |
| 1 | Vs RFI | `reglife-vs-rfi` | 20 |
| 1 | Jogando do BB | `reglife-defesa-bb` | 10 |
| 1 | Blind War: SB GAP | `reglife-blind-war-sb-gap` | 7 |
| 1 | Blind War: SB vs ISO | `reglife-blind-war-sb-vs-iso` | 5 |
| 1 | Blind War: BB vs limp | `reglife-blind-war-bb-vs-limp` | 8 |
| 1 | Blind War: BB vs Raise | `reglife-blind-war-bb-vs-raise` | 5 |
| 1 | Jogando vs Cbet do BB | `reglife-vs-cbet-flop-bb` | 15 |
| 2 | Defesa de BB Multiway | `reglife-multiway-bb` | 20 |
| 2 | Enfrentando 3bet: UTG vs CO, CO vs BTN | `reglife-vs-3bet-ep` | 15 |
| 2 | Enfrentando 3bet: BTN vs SB | `reglife-vs-3bet-btn` | 10 |
| 2 | Cbet Fora de Posição | `reglife-cbet-vs-btn` | 15 |
| 2 | Jogando em Posição: facing bet | `reglife-vs-cbet-flop-btn` | 10 |
| 2 | Jogando em Posição: Bet vs Missed | `reglife-cbet-flop-btn-missed` | 5 |

Total: 190 mãos (Tier 1: 115, Tier 2: 75). As contagens finais vêm do script de checagem; se o parse do doc divergir desta tabela, o script manda.

### Parâmetros por spot (do doc)

- **RFI:** pot 2.5
- **Cbet flop IP:** pot 5.5, stack restante 18
- **Cbet Turn:** pot 10, stacks 30bb → **25.6** (hoje 25); 100bb mantém **93** (valor atual, o doc não especifica)
- **Cbet River:** pot por mão (do doc), stack restante = stack inicial − pot/2; botões 30bb = CHECK/BET 25%/BET 67%/ALL-IN, 100bb = CHECK/BET 40%/BET 67%/BET 100%/ALL-IN
- **Vs RFI e Jogando do BB:** pot 4.5
- **Blind War:** SB GAP pot 2.5 · SB vs ISO pot 5.5 · BB vs limp pot 3 · BB vs raise pot 5
- **Vs Cbet do BB:** pot 5.7 + 2.3
- **Multiway:** pot 7.1 (100bb) e 6.7 (25bb)
- **3bet UTG/CO:** 50bb pot 11 (FOLD/CALL/RAISE 13.65/RAISE 21/ALL-IN), 25bb pot 9.5 (FOLD/CALL/RAISE 13.65/ALL-IN)
- **3bet BTN vs SB:** 50bb pot 11.45 (FOLD/CALL/RAISE 14.7/RAISE 24.74/ALL-IN), 25bb pot 9.5 (FOLD/CALL/RAISE 14.7/ALL-IN)
- **Cbet OOP:** pot 6.7, stack 27.9
- **Jogando em Posição:** facing bet pot 7 + 2.5; Bet vs Missed pot 7

### Fonte de verdade no repo

`scripts/nivelamento-light.data.ts` guarda a lista do doc como dados tipados: módulo, posição, stack, vilão, board, combo, respostas e pot/stack quando o doc define. Os JSONs são gerados ou atualizados a partir dela, e `scripts/check-nivelamento-light.ts` valida que:

- cada JSON tem as mesmas mãos, na mesma ordem, com as mesmas respostas;
- toda resposta existe entre os botões efetivos da mão (config ou override);
- nenhuma carta se repete entre combo e board;
- `mode === "ordered"` e `sessionSize === expectedAnswers.length`;
- `validateSpotConfig` passa em todos os arquivos.

## 4. Persistência, APIs, admin

### Migration `supabase/migrations/016_product_fit.sql`

Aditiva e idempotente; aplicar manualmente no SQL Editor de prod.

```sql
alter table public.reglife_diagnostic_results
  add column if not exists product_profile text,
  add column if not exists product_test text,
  add column if not exists product_final text;
```

Mais comments nas colunas. Sem CHECK constraint (valores validados no código), para não quebrar em drift.

As respostas do quiz ficam em `quiz_answers` (JSONB) com o novo shape `{ idade, tempoJogo, objetivo, abi, torneiosMes, banca }`. `weekly_hours`, `tables` e `sharkscope_nicks` continuam no schema e deixam de ser gravados (null).

### `POST /api/leads`

- Valida `quizAnswers` contra os enums (valor inválido → 400).
- Recalcula no servidor `product_profile`, `stakeGrade`, `profitGoal`, `studyTime` e `volumeTargetWeekly` a partir do quiz (não confia no cliente).
- Grava as colunas acima.
- Webhook `lead.quiz_submitted`: `quiz` com as 6 respostas (value + label) e `productProfile`. Saem `time` e `sharkscopeNicks`.

### `POST /api/results`

- Recalcula `pct` a partir de `results`, e depois `product_test` e `product_final` (usando o `product_profile` da linha, ou o recalculado do `quizAnswers` do body no path de INSERT legado).
- Grava as 3 colunas e as inclui no payload do webhook de resultados.

### Admin e CSV

- `/admin` (lista): coluna **Produto** = `product_final`; se null e `product_profile` preenchido → "Perfil: X · teste pendente"; se perfil null com quiz novo → "Fora do perfil"; lead antigo → "—".
- `/admin/resultado/[id]`: bloco "Produto indicado" com perfil, bucket do teste (com %) e final.
- `lib/admin/exportCsv.ts`: adiciona Idade, Tempo de jogo, ABI, Torneios/mês, Banca, Produto perfil, Produto teste, Produto final; remove Horas, Telas, Nicks.

### Onboarding e store

- `components/trainer/OnboardingForm.tsx`: telas da seção 1.
- `lib/poker/leadScoring.ts`: tipos, opções e derivações novos (substitui v2).
- `lib/poker/diagnosticoStore.ts`: `QuizAnswers` novo; remove campos de horas/telas/nicks do payload.
- `components/trainer/DiagnosticoScreen.tsx`: payloads de leads/results ajustados.

### Sharkscope

Leads novos não têm nick. Os crons (`sharkscope-sync`, `weekly-sharkscope`, `monthly-sharkscope`, `generate-quests`) precisam ignorar linhas sem nick e sem `sharkscope_username`. O plano verifica isso e corrige se algum quebrar com null.

## 5. Testes e verificação

- `scripts/check-productFit.ts` (tsx): fronteira de cada requisito por produto, herança acumulativa, diversao → null, buckets 49/50/69/70, `min()` final e todos os mapeamentos de derivação.
- `scripts/check-nivelamento-light.ts`: seção 3.
- Scripts existentes (`check-spotLinks`, `check-spotTrack`, `check-spotTraining`) continuam passando.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Manual no navegador: quiz completo → teste (com early stop e sem) → linha no `/admin` com produto → CSV exportado.

## Fora de escopo

- Mostrar o produto ao aluno (resultado, plano, PDF).
- Mudar tier 1/2/3, leaks ou `assessTier`.
- Regras editáveis por admin.
- Dropar colunas legadas (`weekly_hours`, `tables`, `sharkscope_nicks`, `lead_score`, `lead_category`).
- Aplicar a migration em prod (feito manualmente pelo usuário).

## Pontos para revisão do usuário

1. Cbet Turn 100bb: stack restante mantido em 93 (o doc só define 25.6 para 30bb).
2. "Ac7c no board AsAc7s" no doc é impossível; mantida a versão atual (Ah7c em As-Ad-7s).
3. Derivações de `volumeTargetWeekly` e `stakeGrade` (seção 1): valores propostos, confirmar com o time.
