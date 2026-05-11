-- ============================================================
-- RegLife — Migration 000: tabela base do diagnóstico
--
-- Cria public.reglife_diagnostic_results, que armazena cada
-- nivelamento concluído (ou abortado por early stop). É a unidade
-- de identificação do aluno enquanto o auth não chega — o id dessa
-- linha vira `diag:<uuid>` em todas as outras integrações.
--
-- Ordem: rode esta antes da 001 se for um projeto Supabase novo.
-- A 001 supõe que essa tabela já existe.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.reglife_diagnostic_results (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),

  -- Identificação informada no onboarding
  player_name     text not null default 'Jogador',
  email           text,
  phone           text,

  -- Preferências
  study_time      text,    -- 'ate15' | 'ate40' | 'mais40'
  profit_goal     text,    -- 'usd1k' | 'usd10k' | 'usd50k' | 'usd100k'

  -- Resultado do diagnóstico
  stopped_early   boolean default false,
  spots_played    int default 0,
  spots_failed    int default 0,
  spot_summaries  jsonb default '[]'::jsonb,  -- SpotSummary[]
  results         jsonb default '[]'::jsonb   -- ResultEntry[]
);

create index if not exists reglife_diagnostic_results_created_at
  on public.reglife_diagnostic_results (created_at desc);

create index if not exists reglife_diagnostic_results_email
  on public.reglife_diagnostic_results (email);

-- RLS leve: a fase 1 não tem auth, então liberamos insert/select pro anon.
-- Proteção real fica no app (ADMIN_SECRET pra GET admin, ADMIN_SECRET ou
-- service_role pra updates). Quando auth chegar, apertar essas policies.
alter table public.reglife_diagnostic_results enable row level security;

drop policy if exists "diag_results: insert anon"
  on public.reglife_diagnostic_results;
create policy "diag_results: insert anon"
  on public.reglife_diagnostic_results for insert
  to anon, authenticated
  with check (true);

drop policy if exists "diag_results: select anon"
  on public.reglife_diagnostic_results;
create policy "diag_results: select anon"
  on public.reglife_diagnostic_results for select
  to anon, authenticated
  using (true);
