-- ============================================================
-- RegLife — Migration 015: Onboarding v2 (Fase 1)
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================
--
-- O onboarding foi reformulado (perguntas + captura). Esta migration
-- adiciona os campos novos que o /api/leads passa a gravar:
--
--   weekly_hours    → horas/semana disponíveis declaradas (6-48)
--   tables          → telas simultâneas declaradas (1-10)
--   sharkscope_nicks→ nicks por site preenchidos no onboarding (JSONB).
--                     Ex.: {"ggpoker":"hero123","wpn":"shark99"}
--
-- Tudo nullable: leads legacy (anteriores à mudança) ficam null.
--
-- ⚠️  As colunas lead_score / lead_category continuam existindo mas o
--     código v2 para de escrevê-las (grava null). NÃO são dropadas aqui
--     pra evitar migration destrutiva.
--
-- Sem esta migration aplicada, /api/leads dá 500 ("column does not
-- exist") ao tentar gravar weekly_hours/tables/sharkscope_nicks.

alter table public.reglife_diagnostic_results
  add column if not exists weekly_hours integer,
  add column if not exists tables integer,
  add column if not exists sharkscope_nicks jsonb;

comment on column public.reglife_diagnostic_results.weekly_hours is
  'Horas/semana disponíveis declaradas no onboarding (6-48). null=lead legacy.';

comment on column public.reglife_diagnostic_results.tables is
  'Telas simultâneas declaradas no onboarding (1-10). null=lead legacy.';

comment on column public.reglife_diagnostic_results.sharkscope_nicks is
  'Nicks por site preenchidos no onboarding (JSONB). Ex.: {"ggpoker":"hero123"}. null=lead legacy ou nenhum nick.';
