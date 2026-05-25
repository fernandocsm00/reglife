-- ============================================================
-- RegLife — Migration 012: Health Score do aluno + pulse
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================

-- 1) Snapshot diário do Health Score
create table if not exists public.player_health_snapshots (
  diagnostic_id uuid not null
    references public.reglife_diagnostic_results(id) on delete cascade,
  day date not null,
  resultado    numeric(5,2),
  leak_score   numeric(5,2),
  roi_score    numeric(5,2),
  conclusao    numeric(5,2),
  sentimento   numeric(5,2),
  health       numeric(5,2) not null,
  band         text not null check (band in ('green','yellow','orange','red')),
  breakdown    jsonb,
  created_at   timestamptz not null default now(),
  primary key (diagnostic_id, day)
);
create index if not exists player_health_snapshots_band_idx
  on public.player_health_snapshots (band, day desc);

-- 2) Pulse semanal (usado em Fase C — mas a tabela cabe na 012 pra evitar
--    migração só pra isso depois; nenhuma rota da Fase A grava nela ainda)
create table if not exists public.pulse_responses (
  diagnostic_id uuid not null
    references public.reglife_diagnostic_results(id) on delete cascade,
  week_iso     text not null,                 -- ex: "2026-W21"
  emoji        text not null check (emoji in ('sad','meh','smile','grin')),
  source       text not null check (source in ('in_app','whatsapp','email','link')),
  created_at   timestamptz not null default now(),
  primary key (diagnostic_id, week_iso)
);

-- 3) Colunas em reglife_diagnostic_results
alter table public.reglife_diagnostic_results
  add column if not exists notify_cadence text
    not null default 'ritmada'
    check (notify_cadence in ('leve','ritmada','intensa')),
  add column if not exists roi_baseline numeric(6,2),
  add column if not exists email_for_notify text;
