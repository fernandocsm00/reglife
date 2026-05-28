-- ============================================================
-- RegLife — Migration 013: Spot Training Sessions
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================
--
-- Rastreia progresso acumulado por (diagnostic_id, leak_id) no trainer
-- single-spot, usado pelo gating da trilha de 3 spots em /meu-plano.
-- Atinge 70% de acerto em >=50 mãos → completed_at é gravado e o
-- próximo spot da trilha desbloqueia.

create table if not exists public.spot_training_sessions (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null
    references public.reglife_diagnostic_results(id) on delete cascade,
  leak_id text not null,
  hands_played int not null default 0,
  hands_correct int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diagnostic_id, leak_id)
);

-- Index pensado pra query do SpotTrack: "todos os spots do aluno X".
create index if not exists spot_training_sessions_diagnostic_idx
  on public.spot_training_sessions(diagnostic_id);

-- Trigger pra manter updated_at automático em UPSERT
create or replace function public.touch_spot_training_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_spot_training_touch on public.spot_training_sessions;
create trigger trg_spot_training_touch
  before update on public.spot_training_sessions
  for each row execute function public.touch_spot_training_updated_at();

-- Lockdown anon — mesma postura de 010_lock_down_anon.sql e 012_health_score.sql.
-- A rota /api/spot-training usa supabaseAdmin (service_role).
-- anon/authenticated não deve nunca tocar essa tabela.
alter table public.spot_training_sessions enable row level security;
revoke all on public.spot_training_sessions from anon, authenticated;
