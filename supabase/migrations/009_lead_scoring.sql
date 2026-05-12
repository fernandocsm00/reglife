-- ============================================================
-- RegLife — Migration 009: lead scoring quiz
-- Aplicar manualmente no Supabase SQL Editor.
--
-- O onboarding mudou: em vez de perguntar studyTime/profitGoal, agora
-- pergunta 6 questões (5 pontuadas) que dão um lead_score 2-25 e
-- categorizam em frio / morno / quente / super_quente. Q3 (objetivo) e
-- Q5 (volume) ainda alimentam profit_goal/volume_target_weekly internamente
-- pra o planBuilder seguir funcionando — esses campos antigos continuam
-- existindo e não precisam migrar.
-- ============================================================

alter table public.reglife_diagnostic_results
  add column if not exists lead_score    int,
  add column if not exists lead_category text,   -- 'frio' | 'morno' | 'quente' | 'super_quente'
  add column if not exists quiz_answers  jsonb,  -- { idade, tempo, objetivo, abi, volume, banca }
  add column if not exists stake_grade   numeric; -- 1 | 2.5 | 4 | 7 | 10 | 13 | 19 | 28

create index if not exists reglife_diagnostic_results_lead_score
  on public.reglife_diagnostic_results (lead_score desc);

create index if not exists reglife_diagnostic_results_lead_category
  on public.reglife_diagnostic_results (lead_category);
