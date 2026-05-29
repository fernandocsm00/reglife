-- ============================================================
-- RegLife — Migration 014: WhatsApp opt-in do aluno
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================
--
-- Step 8 do onboarding deixa de perguntar "frequência de cobrança"
-- (notify_cadence) e passa a perguntar consentimento explícito pra
-- contato via WhatsApp (acompanhamento na Comunidade).
--
-- Campo é nullable propositalmente:
--   true  → aluno escolheu "Aceito"
--   false → aluno escolheu "Não aceito"
--   null  → lead legacy (anterior à mudança) — tratar como consentimento
--           tácito (o número de telefone foi entregue voluntariamente no
--           onboarding antigo)
--
-- A coluna notify_cadence continua existindo e é setada pra 'ritmada'
-- (default da maioria) automaticamente em /api/leads quando o body não
-- traz o campo. Em-app o EV continua falando normal independente desse
-- opt-in — esse flag controla SOMENTE o canal WhatsApp.

alter table public.reglife_diagnostic_results
  add column if not exists whatsapp_opt_in boolean;

comment on column public.reglife_diagnostic_results.whatsapp_opt_in is
  'Consentimento do aluno pra receber contatos via WhatsApp na Comunidade. ' ||
  'true=aceitou, false=recusou, null=lead legacy (sem pergunta explícita).';
