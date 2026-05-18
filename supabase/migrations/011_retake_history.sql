-- ============================================================
-- RegLife — Migration 011: histórico de retakes
-- Aplicar manualmente no Supabase SQL Editor.
--
-- Antes: refazer o teste sobrescrevia a linha original em
-- reglife_diagnostic_results. Agora cada retake gera uma linha nova e
-- aponta pra tentativa anterior via previous_diagnostic_id — admin
-- consegue ver a sequência de tentativas do mesmo lead sem agrupar por
-- email.
-- ============================================================

alter table public.reglife_diagnostic_results
  add column if not exists previous_diagnostic_id uuid
    references public.reglife_diagnostic_results(id) on delete set null;

create index if not exists reglife_diagnostic_results_previous
  on public.reglife_diagnostic_results (previous_diagnostic_id);
