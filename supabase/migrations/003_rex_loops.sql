-- ============================================================
-- RegLife — Migration 003: Rex como Manager (Fase A + B)
--
-- Adiciona infra para os loops do Rex:
--   1. Volume semanal alvo (cobrança) na linha do diagnóstico
--   2. Histórico de snapshots SharkScope no path sem-auth
--   3. Log de atividade do plano (XP, streak, eventos) sem-auth
--   4. Quests semanais do Rex
--
-- Quando o auth chegar, migrar dessas tabelas pras já existentes
-- (xp_events, plan_progress) usando user_id em vez de diagnostic_id.
-- ============================================================

-- 1) Meta de volume semanal -----------------------------------------------
alter table public.reglife_diagnostic_results
  add column if not exists volume_target_weekly int;

-- 2) Histórico de snapshots SharkScope (sem-auth) -------------------------
-- A linha do diagnóstico só guarda o último; aqui guardamos a série
-- pra calcular delta (volume da semana = entries_hoje - entries_7d_atras).
create table if not exists public.sharkscope_diag_snapshots (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  diagnostic_id   uuid not null references public.reglife_diagnostic_results(id) on delete cascade,
  snapshot        jsonb not null,
  -- Campos indexáveis pra queries rápidas
  entries_total   int,
  profit_total    numeric(10,2),
  avg_roi         numeric(6,2),
  itm             numeric(5,2)
);

create index if not exists ssd_snapshots_diag_date
  on public.sharkscope_diag_snapshots (diagnostic_id, created_at desc);

-- 3) Log de atividade (substituto de plan_progress + xp_events sem-auth) --
create table if not exists public.diagnostic_activity (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  diagnostic_id   uuid not null references public.reglife_diagnostic_results(id) on delete cascade,
  -- 'task_checked' | 'task_unchecked' | 'lesson_checked' | 'lesson_unchecked'
  -- | 'session_logged' | 'manager_replied' | 'quest_progress' | 'quest_completed'
  event_type      text not null,
  event_data      jsonb,
  xp_earned       int default 0
);

create index if not exists diag_activity_by_diag
  on public.diagnostic_activity (diagnostic_id, created_at desc);
create index if not exists diag_activity_by_type
  on public.diagnostic_activity (event_type, created_at desc);

-- View: totais agregados (XP total, XP semanal, dias ativos)
create or replace view public.diagnostic_activity_totals as
  select
    diagnostic_id,
    sum(xp_earned) as total_xp,
    sum(case when created_at >= date_trunc('week', now()) then xp_earned else 0 end) as weekly_xp,
    count(distinct date(created_at)) as active_days_total,
    max(date(created_at)) as last_active_date
  from public.diagnostic_activity
  group by diagnostic_id;

-- 4) Quests semanais ------------------------------------------------------
create table if not exists public.weekly_quests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  diagnostic_id   uuid references public.reglife_diagnostic_results(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  week_start      date not null,                      -- segunda da semana ISO
  title           text not null,
  description     text,
  target_kind     text not null,                      -- 'tasks' | 'volume' | 'spot_accuracy' | 'lessons'
  target_payload  jsonb,                              -- ex.: { spotLabel, position, accuracyPct }
  target_count    int not null default 1,
  progress        int not null default 0,
  reward_xp       int not null default 100,
  completed_at    timestamptz,
  expires_at      timestamptz not null,
  -- Garante que diagnostic_id ou user_id estejam preenchidos (não os dois nulls)
  constraint weekly_quests_owner_check check (
    diagnostic_id is not null or user_id is not null
  )
);

create index if not exists weekly_quests_diag_week
  on public.weekly_quests (diagnostic_id, week_start desc);
create index if not exists weekly_quests_open
  on public.weekly_quests (diagnostic_id) where completed_at is null;

-- ============================================================
-- VARIÁVEIS DE AMBIENTE adicionais necessárias:
--
-- CRON_SECRET=...   (para autenticar /api/cron/* via Vercel cron)
-- ============================================================
