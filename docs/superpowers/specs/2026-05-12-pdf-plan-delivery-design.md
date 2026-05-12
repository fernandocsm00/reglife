# PDF Plan Delivery — Design

**Status:** Approved · **Author:** brainstormed with Fernando · **Date:** 2026-05-12

## Problem

Hoje o plano de 90 dias só existe na plataforma. Aluno termina o nivelamento e precisa **voltar ao /meu-plano** pra consumir o conteúdo. Isso impõe atrito pra:

- Quem quer estudar offline / imprimir
- Quem perdeu interesse em logar mas ainda recebe valor de um relatório
- Quem quer compartilhar o diagnóstico com coach particular

## Goal

Entregar o plano como **PDF resumo de 3 páginas** (capa + diagnóstico + roadmap) automaticamente após o diagnóstico, via email e/ou WhatsApp, com link de download persistente na plataforma. PDF é **entrega principal**; plataforma vira opcional pros primeiros 30 dias, mas continua sendo o lugar onde EV (chat), XP, quests, retakes e Sharkscope acontecem.

## Non-Goals

- Tornar o PDF interativo (form fields, checklists clicáveis)
- Listar todas as tasks/aulas da plataforma no PDF (intencionalmente alto-nível pra incentivar volta)
- Página `/historico-pdfs` listando PDFs antigos do aluno (fica pra fase posterior)
- Personalização de template visual por aluno (template é único, dados são dinâmicos)

## High-Level Architecture

```
Aluno termina diagnóstico
        ↓
POST /api/results (modifica)
        ├── insere linha em reglife_diagnostic_results
        ├── gera PDF (lib/pdf/generatePlanPdf.ts) com @react-pdf/renderer
        ├── upload pro bucket plan-pdfs/{diagnosticId}.pdf (Supabase Storage, public read)
        ├── insere row em notifications (kind='plan_delivered')
        ├── fire-and-forget: sendPlanReportEmail() + sendPlanReportWhatsapp() conforme notify_channels
        └── retorna { diagnosticId, pdfUrl } — frontend redireciona pra /meu-plano

/meu-plano: botão "Baixar relatório (PDF)" → /r/{diagnosticId}
/r/[id] (page route): 302 redirect pro Storage
```

## Components

### 1. PDF generator — `lib/pdf/generatePlanPdf.ts`

- Função pura: recebe `(savedPlan: SavedPlan, diagnosticRow: DiagnosticResult)` e retorna `Promise<Buffer>`.
- Implementação com `@react-pdf/renderer` (sem Chromium, ~200KB de deps, Docker-friendly).
- Visual: fundo claro print-friendly, accent amber (match com a marca), tipografia limpa (uma fonte custom TTF importada via `Font.register`).
- 3 páginas A4 retrato (ver seção **PDF Layout** abaixo).

### 2. Email — `lib/email.ts`

- **Provider-agnostic interface** — usuário decide provider depois (Resend, SendGrid, AWS SES, etc.).
- Exporta `sendPlanReportEmail({ to, playerName, pdfBuffer, downloadUrl })`.
- Em dev / sem provider configurado: stub que loga `[email] would send to <to>` e segue.
- Subject: `"Seu plano Reglife · 90 dias"`.
- Body: HTML curto, narrativa do EV. Inclui link `/r/{id}` e anexo PDF.
- From: env var `EMAIL_FROM` (configurada depois com domínio `reglife.com.br`).
- Reply-to: env var `EMAIL_REPLY_TO`.
- Retry: 3 tentativas com backoff exponencial em falha 5xx.

### 3. WhatsApp delivery — extensão de `lib/notify.ts`

- Função `sendPlanReportWhatsapp({ phone, playerName, pdfUrl })`.
- Reusa `WHATSAPP_API_URL` + `WHATSAPP_API_TOKEN` já existentes.
- Estratégia em 2 passos:
  1. Tenta `POST /send-document` com `{ phone, document: pdfUrl, caption }`.
  2. Se 4xx/5xx, fallback pra `POST /send-text` com mensagem incluindo o link curto `/r/{id}`.

### 4. Storage do PDF — Supabase Storage

- Bucket: **`plan-pdfs`** (público).
- Path: `{diagnosticId}.pdf` — UUID não-enumerável é a proteção.
- PDFs antigos ficam como histórico (cada retake cria um path novo). Sem cleanup.
- Migration nova cria o bucket + policies (ver seção **Migrations**).

### 5. Short URL — `app/r/[id]/page.tsx`

- Server component, Next.js 15.
- Busca em `reglife_diagnostic_results` se o `id` existe.
- Se existe: 302 redirect pra URL pública do Storage (`{SUPABASE_URL}/storage/v1/object/public/plan-pdfs/{id}.pdf`).
- Se não existe: 404.

### 6. Endpoint manual — `app/api/plan/pdf/route.ts`

- `GET ?diagnosticId=...` → `{ url: string }`.
- Se o arquivo não está no Storage (raro: falha durante onboarding), **regenera na hora**, faz upload, retorna URL.
- Sem auth (consistente com modelo de segurança pelo UUID).

### 7. Onboarding extension — `components/trainer/OnboardingForm.tsx`

Adiciona bloco depois do campo de telefone:

```
Como você quer receber seu relatório do nivelamento

☑ Email   (vamos enviar pra <email digitado>)
☐ WhatsApp
   └ Confirme o número: [__________]

EV também usa esses canais pra te lembrar de check-ins.
Você pode mudar depois em Configurações.
```

Comportamento:
- **Email obrigatório** (campo existente vira `required`, e o checkbox de email já vem marcado por default).
- WhatsApp é opt-in explícito; abre campo extra de telefone (pré-preenchido com `phone` do bloco anterior, editável).
- Validação: pelo menos 1 canal marcado.
- No submit, popula:
  - `notify_channels`: array com `'email'` e/ou `'whatsapp'`
  - `whatsapp_phone`: só se WhatsApp marcado
  - `email`: obrigatório, vai pra coluna existente

### 8. Botão na plataforma — `components/trainer/PlanScreen.tsx`

- Botão "Baixar relatório (PDF)" perto do CTA do EV no topo.
- Click → abre `/r/{diagnosticId}` em nova aba.

## PDF Layout

### Página 1 — Capa / Identidade

- Logo Reglife (topo, centralizado)
- Título grande: **"Seu Plano de Evolução · 90 Dias"**
- Nome do aluno (subtítulo)
- Data de emissão
- Bloco destaque:
  - **Tier atual** (1, 2 ou 3)
  - **Accuracy do diagnóstico** (ex.: "78% — passou 14 de 18 spots")
- Bloco secundário:
  - Meta de profit (de `profit_goal` no onboarding)
  - Tempo de estudo declarado (`study_time`)
  - Volume target semanal (se setado)
- Rodapé: "Gerado por EV · seu Manager de Evolução"

### Página 2 — Diagnóstico

- Título: **"O que vimos na sua avaliação"**
- **Top 3 leaks** identificados, ordenados do pior pro menos ruim:
  - Nome do spot (ex.: "RFI · 15bbs")
  - Accuracy (ex.: "33%")
  - Frase do EV na 2ª pessoa, narrativa coach (ex.: "Você abre apertado demais no LJ com 15bb. Vamos consertar isso na fase 1.")
- **Gráfico horizontal de accuracy por spot** (todos os 18-19 spots):
  - Barras horizontais com cor por threshold: vermelho < 50%, amarelo 50-69%, verde ≥ 70%.
  - Renderizado como SVG/PDF nativo pelo `@react-pdf/renderer` (não imagem externa).
- Nota de rodapé: "Esses são os pontos onde EV vai te cobrar mais nos primeiros 30 dias."

### Página 3 — Roadmap de 90 dias

- Título: **"Sua jornada"**
- Timeline visual com 3 blocos:
  - **Fase 1 (0-30 dias) · Fundamentos** — 2-3 bullets do foco da fase
  - **Fase 2 (30-60 dias) · Aplicação** — 2-3 bullets
  - **Fase 3 (60-90 dias) · Integração** — 2-3 bullets
- Bloco **"Como o EV te acompanha"** com 3 itens curtos:
  - 💬 Chat — fale com EV a qualquer hora
  - 🎯 Quests semanais — desafios pra manter o ritmo
  - 📊 SharkScope — sincronizando seu volume e ROI real
- Rodapé com **QR code** + URL: "Continue na plataforma → reglife.com.br/meu-plano"

## Data Flow

1. Aluno completa diagnóstico → `POST /api/results` com body do `SavedPlan` + canais escolhidos no onboarding.
2. API:
   - Insere linha em `reglife_diagnostic_results` (com `notify_channels`, `email`, `whatsapp_phone`, etc.).
   - Chama `generatePlanPdf(savedPlan, row)` → `Buffer`.
   - Upload pra `plan-pdfs/{id}.pdf` via Supabase Storage service role.
   - Insere row em `notifications` com `kind='plan_delivered'`, body com link.
   - Spawn promises de `sendPlanReportEmail()` e/ou `sendPlanReportWhatsapp()` (não aguarda).
   - Retorna `{ diagnosticId, pdfUrl }` em <1.5s.
3. Frontend redireciona pra `/meu-plano`.
4. Email e WhatsApp chegam em background, geralmente em segundos.
5. Se canal falhar, log em `console.error` + tenta de novo no próximo retake. Sem retry automático fora do que o provider já faz.

## Migrations

### `008_plan_pdf_storage.sql` (nova)

```sql
-- Bucket pro PDF do plano (público read; UUID protege)
insert into storage.buckets (id, name, public)
values ('plan-pdfs', 'plan-pdfs', true)
on conflict (id) do nothing;

create policy "plan-pdfs: public read"
  on storage.objects for select
  using (bucket_id = 'plan-pdfs');

create policy "plan-pdfs: service write"
  on storage.objects for insert to service_role
  with check (bucket_id = 'plan-pdfs');

create policy "plan-pdfs: service update"
  on storage.objects for update to service_role
  using (bucket_id = 'plan-pdfs');
```

Sem alteração de schema em `reglife_diagnostic_results` — colunas necessárias (`notify_channels`, `whatsapp_phone`, `email`) já existem.

## Env Vars

Novas (configurar no Easypanel quando provider de email for escolhido):

- `EMAIL_FROM` — ex.: `EV <ev@reglife.com.br>`
- `EMAIL_REPLY_TO` — ex.: `contato@reglife.com.br`
- `<PROVIDER>_API_KEY` — específico do provider escolhido (ex.: `RESEND_API_KEY`)

Existentes reusadas:

- `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Error Handling

- **Falha na geração do PDF**: retorna 500 pro POST, frontend mostra erro genérico, aluno tenta de novo. Sem queue persistente nessa primeira versão (overkill).
- **Falha no upload pro Storage**: idem.
- **Falha no envio de email/WhatsApp**: silencioso pro aluno (fire-and-forget). Log no console + chance de retry no próximo retake. Considerar adicionar tabela `delivery_attempts` numa fase futura se taxa de falha for alta.
- **PDF perdido (404 no Storage mas linha existe)**: endpoint `/api/plan/pdf` regenera na hora.

## Testing

- **Unit test em `generatePlanPdf`**: dado um `SavedPlan` mockado, gera PDF e snapshot-testa o buffer (tamanho > 50KB, header `%PDF-1.4`).
- **Smoke test E2E**: roda diagnóstico de teste em staging, confirma que o PDF chega no email e no WhatsApp.
- **Visual review** após primeira geração: você abre o PDF, me passa ajustes de visual, eu itero.

## Open Questions / Deferred

- Provider de email a ser escolhido — decidir antes da implementação (não bloqueia o spec).
- Domínio de envio (`ev@reglife.com.br` vs `relatorio@reglife.com.br` vs outro) — decidir junto com provider.
- Página `/historico-pdfs` listando todos os PDFs gerados pro aluno — fora de escopo.
- Internacionalização do PDF (atualmente só pt-BR) — fora de escopo.

## Success Criteria

1. Aluno completa diagnóstico → recebe PDF no email em < 60s na maior parte dos casos.
2. Aluno marca WhatsApp → recebe PDF (documento ou link) em < 60s.
3. PDF é legível em mobile e printable em A4.
4. Botão "Baixar relatório (PDF)" em `/meu-plano` funciona e baixa o PDF do diagnóstico atual.
5. Retake gera novo PDF e dispara novo envio nos canais configurados.
6. Custo total de geração + entrega < $0.01 por aluno (PDF gen é grátis; provider de email tipicamente $0.0001-0.001 por envio).
