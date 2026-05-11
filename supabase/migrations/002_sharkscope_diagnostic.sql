-- ============================================================
-- RegLife — Migration 002: SharkScope no diagnóstico (sem auth)
-- Adiciona nick/network do SharkScope direto na linha do
-- diagnóstico. Estratégia válida enquanto a Fase 1 não tem auth;
-- quando o login chegar, migra-se para player_profiles.
-- ============================================================

alter table public.reglife_diagnostic_results
  add column if not exists sharkscope_username  text,
  add column if not exists sharkscope_network   text default 'PokerStars',
  add column if not exists sharkscope_last_sync timestamptz,
  -- Snapshot completo (PlayerSnapshot serializado) — útil pro Manager.IA
  add column if not exists sharkscope_snapshot  jsonb,
  -- Resumo indexável usado nas listas/cards do admin
  add column if not exists sharkscope_summary   jsonb;

create index if not exists reglife_diagnostic_results_ss_username
  on public.reglife_diagnostic_results (sharkscope_username);
