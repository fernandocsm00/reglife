# Coach IA "EV" — Design de Customer Success

**Data:** 2026-05-25
**Branch:** `onboarding-ev`
**Status:** Aprovado em brainstorm; aguardando review do spec antes do plano de implementação.

## Contexto

O Reglife já tem o esqueleto de um coach IA — persona "EV", context builder rico (plano, fase, leaks, SharkScope, streak/XP, conversa), fan-out multi-canal (in-app, Discord, WhatsApp via Z-API/Evolution genérico, email enumerado mas sem sender) com quiet hours timezone-aware, e dois crons rodando (`streak_risk` e `phase_transition`).

Hoje o EV é, na prática, **um chat reativo + 2 crons de notificação**. Para servir alunos da comunidade como um coach IA de verdade, faltam três coisas: (a) executar o plano com prova de evolução real, (b) acompanhar o aluno fora do app de forma proativa, (c) medir e exibir progresso real — não só "fez tarefa".

Esse spec descreve o caminho desse esqueleto até um loop de coaching completo, instrumentado e configurável.

## Objetivos

- **Resultado primário:** o aluno **comprova evolução técnica** (leaks fechados via retake + ROI subindo no SharkScope).
- **Norte de produto:** um **Health Score** ponderado (Resultado 80% + Conclusão 10% + Sentimento 10%) que dá sinal antes do resultado consolidar (60-90 dias).
- **Cobertura de canal:** in-app + WhatsApp (via integração genérica já existente, sem API oficial Meta) + email (a implementar) + Discord (já existe, opcional).
- **Personalização:** cadência configurável pelo aluno (leve / ritmada / intensa), com default `ritmada`.

## Não-objetivos (YAGNI)

- **Não vamos** adotar API oficial Meta com aprovação de templates. Mantemos a integração genérica via `WHATSAPP_API_URL`.
- **Não vamos** exigir prova de aula assistida (tempo no player). Conclusão = só task marcada feita.
- **Não vamos** otimizar por consistência/streak — o EV cobra **resultado**, não hábito. Streak vira sinal interno (de risco), não métrica exibida.
- **Não vamos** construir programa de embaixadores, cohort comparison, NPS formal nesta etapa.
- **Não vamos** trocar o provedor de LLM. Mantemos OpenAI/gpt-4o como já está em `app/api/manager/chat/route.ts`.
- **Não vamos** quebrar o modo sem-auth (`diag:<id>`). Toda nova feature roda em ambos os modos.

## Arquitetura

Quatro camadas, conectadas em loop diário:

```
SENSORES → HEALTH SCORE ENGINE → TRIGGER ROUTER → CHANNEL DISPATCHER
                                                            ↓
                                                      aluno (in_app/WA/email/Discord)
                                                            ↓
                                                       gera novos sensores
```

### Sensores (entrada)

| Sensor | Tabela | Estado |
|---|---|---|
| Atividade do aluno | `diagnostic_activity` | já existe |
| Retake de spots | `retake_history` (mig. 011) | já existe |
| Snapshot SharkScope | `sharkscope_snapshots` | já existe |
| Conversa com EV | `manager_conversations` | já existe |
| Notificações enviadas | `notifications` | já existe |
| **Pulse de sentimento** | `pulse_responses` | **novo** |

### Health Score Engine (cérebro)

Módulo puro em `lib/health/` que recebe estado do aluno e devolve score. Testável sem banco.

Cron diário em `app/api/cron/health-score/route.ts` (06h local — antes do `daily-pulse`) calcula 1 row/dia por aluno em `player_health_snapshots`.

### Trigger Router (sistema nervoso)

Funções isoladas em `lib/triggers/<trigger>.ts`. Cada trigger:
- recebe `diagnostic_id` e contexto;
- consulta condições (do contexto + último snapshot de health);
- decide se dispara, respeitando cadência do aluno e throttle global;
- chama `sendEvNotification` com `facts` e `fallback`.

Os crons existentes (`daily-pulse`, `sharkscope-sync`, `generate-quests`, `xp-drops`, `monthly-sharkscope`) ganham chamadas aos triggers novos. Nenhum cron novo além de `health-score`.

### Channel Dispatcher (boca do EV)

`lib/notify.ts` já existe. Mudanças:
- Adicionar **sender de email** (Resend) — função `sendEmail`.
- Adicionar filtro de **cadência** em `sendNotification`: lê `notify_cadence` do aluno + tabela `cadence_rules[trigger][cadence]` e decide se o canal `whatsapp` sai ou não.
- Manter o resto intacto: quiet hours, `force: true`, `channels_sent`, anti-spam.

## Componentes

### 1. Health Score Engine

Local: `lib/health/`.

```
lib/health/
  score.ts       — fórmula pura (entrada: estado; saída: score + band + breakdown)
  band.ts        — mapeia score → faixa (Verde/Amarelo/Laranja/Vermelho)
  leakClosed.ts  — critério "leak fechado" (consulta retake_history)
  collect.ts     — coleta estado do aluno (chama Supabase)
  snapshot.ts    — persiste em player_health_snapshots
```

**Fórmula (espelha o que foi aprovado):**

```
HealthScore = 0.8·Resultado + 0.1·Conclusão + 0.1·Sentimento     (0-100)

Resultado:
  resultado = 0.7·leakScore + 0.3·roiScore
  leakScore = (leaks_fechados / leaks_totais_diagnostico) × 100
  roiScore  = clip( 50 + 10·(ROI_30d − ROI_baseline) , 0, 100 )

  Leak fechado:
    retake do mesmo bucket com acerto ≥ 85% em ≥ 10 mãos jogadas.
    Constantes em lib/health/score.ts: LEAK_CLOSED_ACCURACY = 0.85,
                                       LEAK_CLOSED_MIN_HANDS = 10.
    (Reajustáveis sem mudança de schema.)

  Sem SharkScope → roiScore = null → resultado = leakScore (peso 1.0).

Conclusão:
  conclusao = min(100, tasks_checked / tasks_esperadas_ate_hoje × 100)
  tasks_esperadas_ate_hoje = soma das tasks das fases já atravessadas
                              pelo cycle_day atual.

Sentimento:
  sentimento = média dos últimos 4 pulses (8 semanas), mapeados:
    😣=0   😐=33   🙂=66   😄=100
  Sem pulses → sentimento = null → peso redistribui para Resultado:
    (0.8 + 0.1) → 0.9·Resultado + 0.1·Conclusão.
```

**Faixas:**

| Banda | HS | Cor | Playbook |
|---|---|---|---|
| Verde | 80–100 | green | Celebrar, oferecer próximo Tier |
| Amarelo | 60–79 | yellow | Lembrete da meta, próxima task |
| Laranja | 40–59 | orange | Weekly review forte, sugerir humano (Discord) |
| Vermelho | <40 | red | Win-back: "o que travou?" + plano reduzido a 1 spot/dia |

### 2. Trigger Router — catálogo final

| Trigger | Disparo | Canal default | Estado |
|---|---|---|---|
| `player_initiated` | aluno manda mensagem | in_app (stream) | já existe |
| `streak_risk` | 36–96h sem atividade | in_app + WA | já existe |
| `phase_transition` | dia 31 / 61 do ciclo | in_app + WA + email | já existe |
| `daily_checkin` | 18h local, depende da cadência | in_app + WA | **novo** |
| `post_session` | sharkscope-sync detecta sessão nova | in_app + WA | **novo** |
| `weekly_review` | domingo 19h local | in_app + WA + email | **novo** |
| `leak_alert` | sharkscope-sync vê padrão negativo do leak | in_app + WA | **novo** |
| `leak_closed` | retake fecha leak | in_app + WA + email | **novo** |
| `badge_unlocked` | conquista desbloqueada | in_app | infra ✅, trigger ❌ |
| `health_band_change` | HS muda de faixa | in_app + WA | **novo** |

Throttle global por aluno:
- máx 1 mensagem WhatsApp por 6h (não-forçada),
- cap 3 mensagens não-forçadas por dia,
- `force: true` ignora ambos (reservado para `streak_risk` agudo e `leak_closed` celebratório).

### 3. Cadence Rules

Setting em `reglife_diagnostic_results.notify_cadence ∈ {leve, ritmada, intensa}`, default `ritmada`.

Tabela de regras em `lib/triggers/cadenceRules.ts`:

| Trigger | Leve | Ritmada (default) | Intensa |
|---|---|---|---|
| `daily_checkin` | ❌ nunca | seg+qua+sex | seg–sex |
| `post_session` | sessão ≥ 20 mãos | toda sessão | toda sessão |
| `weekly_review` | só email | in_app + WA + email | in_app + WA + email |
| `streak_risk` | depois de 72h | depois de 36h | depois de 36h |
| `pulse semanal` | só in_app | in_app + WA | in_app + WA |
| `leak_alert` | sempre | sempre | sempre |
| `leak_closed` | sempre | sempre | sempre |

Onboarding ganha pergunta única no final: **"Quanto o EV deve te cobrar?"** (default selecionado = `ritmada`).

### 4. Channel Dispatcher — Email

Novo arquivo `lib/email/send.ts` usando **Resend** (`RESEND_API_KEY`).

Templates em `lib/email/templates/` (cada um exporta `subject` + `render(ctx) => html`):
- `welcome.ts` — primeiro contato pós-diagnóstico
- `weekly_digest.ts` — review de domingo
- `leak_alert.ts` — leak detectado pelo SharkScope
- `leak_closed.ts` — leak fechado (celebratório)
- `phase_transition.ts` — entrada em nova fase
- `win_back_7d.ts` — 7 dias sem atividade
- `win_back_30d.ts` — 30 dias sem atividade

`sendNotification` ganha branch `enabled.has("email") && prefs?.email && cadenceAllows(kind, cadence, "email")` análogo aos outros canais.

### 5. Pulse de sentimento

Nova tabela `pulse_responses(id, diagnostic_id, week_iso, emoji, created_at)`.

Domingo 12h local, cron `weekly_pulse` (parte do `daily-pulse` reaproveitado) cria notificação `pulse_request` com payload `{ token }`. Renderização:
- in-app: card com 4 botões emoji que POSTam em `/api/pulse` com o token.
- WhatsApp: mensagem `"Como foi sua semana? Responde com: 1 😣 / 2 😐 / 3 🙂 / 4 😄 — ou abre: https://reg.life/p/<token>"`. Sem webhook de WhatsApp, fallback é o link curto (página `/p/[token]` com os 4 botões).
- email (cadência ≠ leve): subject "Como foi a semana?" + 4 links com `?vote=X&token=Y`.

Anti-double-vote: PK `(diagnostic_id, week_iso)`.

### 6. Dashboard admin — Saúde da turma

`app/admin/page.tsx` ganha aba "Saúde":
- KPIs no topo: alunos por faixa, distribuição de HS (histograma), leaks fechados últimos 7d, taxa de pulse respondido.
- Tabela por aluno: `nome | HS | faixa | último toque do EV | último jogo SS | próxima ação sugerida | botão "ver"`. Ordenação por HS asc (laranja/vermelho no topo). Busca por nome.
- Clicar abre `/admin/resultado/[id]` (já existe) — incluir lá o histórico de snapshots e a timeline de notificações.

CSV export já existe em `lib/admin/exportCsv.ts` — adicionar colunas de HS.

## Esquema de banco

**Novas tabelas (migração 012):**

```sql
create table player_health_snapshots (
  diagnostic_id uuid not null references reglife_diagnostic_results(id) on delete cascade,
  day date not null,
  resultado numeric(5,2),       -- 0..100 ou null
  leak_score numeric(5,2),
  roi_score numeric(5,2),
  conclusao numeric(5,2),
  sentimento numeric(5,2),
  health numeric(5,2) not null,
  band text not null check (band in ('green','yellow','orange','red')),
  breakdown jsonb,              -- tudo que entrou no cálculo, pra auditoria
  created_at timestamptz not null default now(),
  primary key (diagnostic_id, day)
);
create index player_health_snapshots_band_idx on player_health_snapshots (band, day desc);

create table pulse_responses (
  diagnostic_id uuid not null references reglife_diagnostic_results(id) on delete cascade,
  week_iso text not null,       -- "2026-W21"
  emoji text not null check (emoji in ('sad','meh','smile','grin')),
  source text not null check (source in ('in_app','whatsapp','email','link')),
  created_at timestamptz not null default now(),
  primary key (diagnostic_id, week_iso)
);
```

**Alterações em tabelas existentes:**

```sql
alter table reglife_diagnostic_results
  add column notify_cadence text not null default 'ritmada'
    check (notify_cadence in ('leve','ritmada','intensa')),
  add column roi_baseline numeric(6,2),     -- snapshot do ROI no diagnóstico
  add column email_for_notify text;         -- separado do email principal
```

## Fluxo de dados crítico

### Cálculo diário do Health Score

```
cron 06h local
  ↓
para cada aluno ativo:
  ↓
collect.ts → puxa em paralelo:
   • leaks_totais (do plano)
   • leaks_fechados (de retake_history, aplicando critério)
   • roi_30d e roi_baseline (de sharkscope_snapshots)
   • tasks_checked + tasks_esperadas_ate_hoje (do plan_progress + cycle_day)
   • últimos 4 pulses (de pulse_responses)
  ↓
score.ts → calcula HS + breakdown
  ↓
snapshot.ts → upsert em player_health_snapshots
  ↓
compara band com snapshot do dia anterior:
  • diferente? → dispara trigger health_band_change
  • leak_score subiu ≥ 1 leak? → dispara trigger leak_closed
```

### Resposta de pulse via link curto

```
EV manda WA com link https://reg.life/p/<token>
  ↓
GET /p/[token] → mostra página com 4 botões
  ↓
POST /api/pulse {token, vote} →
  • valida token (HMAC com diagnostic_id + week_iso)
  • insert em pulse_responses (PK garante anti-double)
  • responde "Anotado!"
```

## Tratamento de erros

- **LLM falha** → `sendEvNotification` já tem fallback via `ev-voice`; mantemos.
- **WhatsApp falha** → `sendWhatsapp` retorna false; notificação fica registrada apenas em `channels_sent: ["in_app"]`. Não tenta de novo (anti-spam).
- **Email falha** → mesma política: registra in-app, log warn, segue.
- **SharkScope sem dados** → `roiScore = null` (já tratado na fórmula).
- **Sem pulses ainda** → `sentimento = null` (já tratado).
- **Health Score Engine quebra para um aluno** → cron continua para os demais; aluno fica com snapshot do dia anterior; log de erro com `diagnostic_id`.

## Testes

- `lib/health/score.test.ts` — fórmula pura, casos: sem SS, sem pulses, leak 0/total=0, ROI extremo.
- `lib/health/leakClosed.test.ts` — critério com retake mockado.
- `lib/triggers/<trigger>.test.ts` — condições de disparo + throttle + cadência.
- `lib/notify.test.ts` — cadência filtra WhatsApp para `leve` em `daily_checkin`.
- Smoke do cron de health-score em `app/api/cron/health-score/route.test.ts` (mock Supabase).

## Faseamento

| Fase | Escopo | Estim. |
|---|---|---|
| **A — Núcleo** | Migração 012 (health_snapshots + pulse_responses + colunas), `lib/health/*`, cron `health-score`, 5 triggers novos (`daily_checkin`, `post_session`, `weekly_review`, `leak_alert`, `leak_closed`, `health_band_change`, `badge_unlocked`), WhatsApp ligado em todos (já existe), `ev-voice` para os novos triggers, dashboard admin (aba Saúde) | 4–6 semanas |
| **B — Email** | `lib/email/send.ts` (Resend), 7 templates, fan-out de email em `notify.ts`, digest semanal cron | 1–2 semanas |
| **C — Cadência + Pulse** | Setting `notify_cadence` no onboarding + perfil, `cadenceRules.ts`, filtro de cadência em `notify.ts`, pulse semanal end-to-end (in_app + WA com link + email), página `/p/[token]` | 2–3 semanas |

Cada fase entrega valor isolado e tem critério de aceitação independente:
- Fase A: um aluno teste vê seu HS no app, recebe ao menos 1 trigger novo via WhatsApp, e admin vê tabela ordenada por faixa.
- Fase B: digest semanal entregue ao inbox de teste com layout limpo.
- Fase C: aluno consegue escolher cadência no onboarding e o WhatsApp do `daily_checkin` respeita.

## Decisões em aberto (para o plano de implementação resolver)

- Provider de email: **Resend recomendado** (DX bom, free tier suficiente pra começar). Confirmar antes do plano.
- Forma exata do `roi_baseline`: snapshot do `avgRoi` no momento do diagnóstico, congelado em `reglife_diagnostic_results.roi_baseline`. Atualiza só se aluno explicitamente "resetar baseline".
- UI do Health Score pro aluno: número grande + barra de progresso + 3 sub-scores em pílulas. Local: header de `/meu-plano`. Wireframe no plano de implementação.

## Convenção do projeto

> AGENTS.md: "Esta versão do Next.js tem breaking changes. Ler `node_modules/next/dist/docs/` antes de escrever código."

O plano de implementação deve respeitar essa instrução em cada task que toque rota/API/build.
