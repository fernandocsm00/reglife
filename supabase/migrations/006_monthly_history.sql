-- ============================================================
-- RegLife — Migration 006: Histórico mensal de SharkScope
--
-- 1 linha por aluno por mês com stats consolidadas do período.
-- Diferente de `sharkscope_diag_snapshots` (que tira foto cumulativa
-- diária), aqui usamos o filtro Date: do SharkScope pra ter o mês
-- isolado — então ROI/profit/entries refletem só aquele mês.
--
-- Cron `/api/cron/monthly-sharkscope` roda no dia 1 de cada mês
-- e popula a linha do mês anterior.
-- ============================================================

create table if not exists public.sharkscope_monthly_stats (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  diagnostic_id   uuid not null references public.reglife_diagnostic_results(id) on delete cascade,
  year            int not null,
  month           int not null check (month between 1 and 12),
  -- Origem do dado (espelho do que estava conectado no momento da coleta)
  source          text not null default 'player',   -- 'player' | 'playergroup'
  subject_value   text not null,                    -- nick ou nome do group
  network         text not null,

  -- Stats do mês (todas calculadas pelo SharkScope com Date:filtro)
  entries         int,
  count_sessions  int,
  avg_stake       numeric(10,2),
  profit          numeric(12,2),
  avg_roi         numeric(7,2),
  total_roi       numeric(7,2),
  itm             numeric(5,2),
  avg_entrants    numeric(8,2),
  final_tables    int,
  re_entries      int,

  -- Snapshot bruto pra auditoria
  raw             jsonb,

  unique (diagnostic_id, year, month)
);

create index if not exists monthly_stats_diag_year_month
  on public.sharkscope_monthly_stats (diagnostic_id, year desc, month desc);
