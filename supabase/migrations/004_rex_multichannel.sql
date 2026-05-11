-- ============================================================
-- RegLife — Migration 004: Rex multi-canal + gamificação (Fase C+D)
--
-- Adiciona:
--   1. Configurações de canal por aluno (Discord/WhatsApp/quiet hours)
--   2. Caixa de notificações (in-app)
--   3. XP drops globais (multiplicador temporário)
--   4. Badges no path sem-auth (espelho de user_badges)
-- ============================================================

-- 1) Configurações de canal -----------------------------------------------
alter table public.reglife_diagnostic_results
  add column if not exists discord_webhook_url text,
  add column if not exists whatsapp_phone      text,
  -- Canais ativos: subset de ['in_app','discord','whatsapp']. Default só in-app.
  add column if not exists notify_channels     text[] default array['in_app']::text[],
  -- Janela de silêncio em hora local (0-23). Default 23h-9h.
  add column if not exists notify_quiet_start  int default 23,
  add column if not exists notify_quiet_end    int default 9,
  add column if not exists timezone            text default 'America/Sao_Paulo';

-- 2) Notificações in-app --------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  diagnostic_id uuid references public.reglife_diagnostic_results(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  -- 'post_session' | 'streak_risk' | 'quest_done' | 'quest_expiring'
  -- | 'drop_active' | 'badge_unlocked' | 'leak_alert' | 'phase_transition'
  kind          text not null,
  title         text not null,
  body          text,
  payload       jsonb,
  -- Histórico de envio: ['in_app','discord','whatsapp']
  channels_sent text[] default array['in_app']::text[],
  read_at       timestamptz,
  constraint notifications_owner_check check (
    diagnostic_id is not null or user_id is not null
  )
);

create index if not exists notifications_diag_unread
  on public.notifications (diagnostic_id, created_at desc)
  where read_at is null;

create index if not exists notifications_diag_all
  on public.notifications (diagnostic_id, created_at desc);

-- 3) XP Drops globais -----------------------------------------------------
-- Janela de tempo em que todo evento ganha xp multiplicado.
create table if not exists public.xp_drops (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  multiplier  numeric(4,2) not null default 2.0,
  description text
);

create index if not exists xp_drops_active
  on public.xp_drops (ends_at desc);

-- 4) Badges no path sem-auth ----------------------------------------------
-- Espelho leve de public.user_badges, chaveado por diagnostic_id.
create table if not exists public.diagnostic_badges (
  diagnostic_id uuid not null references public.reglife_diagnostic_results(id) on delete cascade,
  badge_id      text not null references public.badges(id),
  unlocked_at   timestamptz default now(),
  primary key (diagnostic_id, badge_id)
);

-- ============================================================
-- VARIÁVEIS DE AMBIENTE adicionais opcionais:
--
-- WHATSAPP_API_URL=https://...   (Z-API ou Evolution API endpoint)
-- WHATSAPP_API_TOKEN=...         (token bearer)
-- ============================================================
