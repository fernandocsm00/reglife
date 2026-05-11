-- ============================================================
-- RegLife Manager.IA — Migration 001
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- -------------------------------------------------------
-- 1. PERFIL DE JOGADOR
--    Estende o auth.users com dados específicos do aluno
-- -------------------------------------------------------
create table if not exists public.player_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  -- Identificação
  display_name  text not null,
  email         text,
  phone         text,

  -- SharkScope
  sharkscope_username  text,
  sharkscope_network   text default 'PokerStars', -- PokerStars | GGPoker | 888poker | etc.
  sharkscope_last_sync timestamptz,

  -- Discord
  discord_id    text,
  discord_webhook text, -- webhook pessoal (DMs via bot)

  -- Curseduca
  curseduca_user_id text,

  -- Preferências
  notification_hour int default 18,  -- hora local para check-in (0-23)
  timezone text default 'America/Sao_Paulo'
);

-- Trigger para updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger player_profiles_updated_at
  before update on public.player_profiles
  for each row execute function public.set_updated_at();

-- RLS: cada usuário só vê o próprio perfil
alter table public.player_profiles enable row level security;

create policy "player_profiles: own row" on public.player_profiles
  for all using (auth.uid() = id);

-- -------------------------------------------------------
-- 2. PLANOS (espelho do SavedPlan do localStorage)
-- -------------------------------------------------------
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- O SavedPlan completo serializado como JSONB
  -- Contém: phases, leaks, byTrainer, studyTime, profitGoal, etc.
  data        jsonb not null,

  -- Campos indexáveis extraídos do data para queries do Manager.IA
  player_tier     int,
  accuracy_pct    int,
  study_time      text,
  profit_goal     text,
  stopped_early   boolean default false,
  spots_played    int,
  spots_failed    int,
  attempts        int default 1,

  -- Status do ciclo
  is_active   boolean default true,
  completed_at timestamptz
);

create trigger plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;
create policy "plans: own rows" on public.plans
  for all using (auth.uid() = user_id);

-- Índice para queries frequentes
create index if not exists plans_user_id_active on public.plans(user_id, is_active);

-- -------------------------------------------------------
-- 3. PROGRESSO GRANULAR DO PLANO
--    Cada evento de check (aula assistida, task concluída, etc.)
-- -------------------------------------------------------
create table if not exists public.plan_progress (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_id     uuid not null references public.plans(id) on delete cascade,

  -- Tipo do evento
  event_type  text not null,
  -- Valores: 'lesson_checked' | 'lesson_unchecked' | 'task_checked'
  --          | 'task_unchecked' | 'retake_started' | 'retake_done'
  --          | 'manager_replied' | 'session_logged'

  -- Dados adicionais do evento
  event_data  jsonb
  -- lesson_checked: { url, title, phase }
  -- task_checked: { taskId, phaseId, text }
  -- retake_done: { newTier, oldTier, newAccuracy }
  -- session_logged: { entries, profit, roi }
);

alter table public.plan_progress enable row level security;
create policy "plan_progress: own rows" on public.plan_progress
  for all using (auth.uid() = user_id);

create index if not exists plan_progress_user_plan on public.plan_progress(user_id, plan_id);
create index if not exists plan_progress_type on public.plan_progress(event_type, created_at desc);

-- -------------------------------------------------------
-- 4. SESSÕES SHARKSCOPE
--    Snapshot diário de estatísticas por filtro
-- -------------------------------------------------------
create table if not exists public.sharkscope_snapshots (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- Identificação do jogador no SharkScope
  ss_username text not null,
  ss_network  text not null,

  -- Snapshot completo (PlayerSnapshot serializado)
  snapshot    jsonb not null,

  -- Métricas indexáveis para queries do Manager.IA
  entries_total   int,
  profit_total    numeric(10,2),
  avg_roi         numeric(6,2),
  itm             numeric(5,2),
  pko_ratio       int,   -- % PKO
  winrate_label   text   -- 'Vencedor' | 'Breakeven' | 'Perdendo'
);

alter table public.sharkscope_snapshots enable row level security;
create policy "sharkscope_snapshots: own rows" on public.sharkscope_snapshots
  for all using (auth.uid() = user_id);

create index if not exists ss_snapshots_user_date
  on public.sharkscope_snapshots(user_id, created_at desc);

-- -------------------------------------------------------
-- 5. XP EVENTS
--    Log imutável de cada ponto de experiência ganho
-- -------------------------------------------------------
create table if not exists public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  xp          int not null check (xp > 0),
  reason      text not null,
  -- 'lesson_checked' | 'task_checked' | 'session_logged' | 'manager_replied'
  -- | 'retake_done' | 'tier_up' | 'streak_7d' | 'streak_30d' | 'badge_unlocked'

  metadata    jsonb  -- dados extras (badge_id, tier, etc.)
);

alter table public.xp_events enable row level security;
create policy "xp_events: own rows" on public.xp_events
  for all using (auth.uid() = user_id);

-- View de XP total por usuário (usada no ranking)
create or replace view public.xp_totals as
  select
    user_id,
    sum(xp) as total_xp,
    sum(case when created_at >= date_trunc('week', now()) then xp else 0 end) as weekly_xp
  from public.xp_events
  group by user_id;

-- -------------------------------------------------------
-- 6. STREAKS
--    Uma linha por usuário, atualizada a cada atividade
-- -------------------------------------------------------
create table if not exists public.streaks (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  current_streak    int default 0,
  longest_streak    int default 0,
  last_activity_date date,
  shield_available  int default 1  -- streak shields semanais (máx 1)
);

alter table public.streaks enable row level security;
create policy "streaks: own row" on public.streaks
  for all using (auth.uid() = user_id);

-- -------------------------------------------------------
-- 7. BADGES / CONQUISTAS
-- -------------------------------------------------------
create table if not exists public.badges (
  id          text primary key, -- 'first_plan', 'streak_7d', 'tier_up', etc.
  label       text not null,
  description text not null,
  icon        text not null,    -- emoji ou path para ícone
  xp_reward   int default 0
);

-- Seed inicial dos badges
insert into public.badges (id, label, description, icon, xp_reward) values
  ('first_plan',      'Primeiro Plano',     'Completou o nivelamento e recebeu seu plano de 90 dias', '🎯', 0),
  ('streak_7d',       'Em Chamas',          '7 dias consecutivos de atividade', '🔥', 150),
  ('streak_30d',      'Inabalável',         '30 dias consecutivos de atividade', '💎', 500),
  ('lessons_10',      'Estudioso',          '10 aulas marcadas como assistidas', '📚', 0),
  ('lessons_30',      'Dedicado',           '30 aulas marcadas como assistidas', '🎓', 0),
  ('phase1_complete', 'Fase 1 Concluída',   'Todas as tasks da Fase Fundamentos completas', '💪', 0),
  ('phase2_complete', 'Fase 2 Concluída',   'Todas as tasks da Fase Aplicação completas', '⚡', 0),
  ('cycle_complete',  '90 Dias',            'Completou o ciclo completo de 90 dias', '🏆', 0),
  ('tier_up',         'Evolução de Tier',   'Subiu de tier no re-nivelamento', '🚀', 200),
  ('profitable',      'No Lucro',           'ROI positivo em 50+ torneios (SharkScope)', '💰', 0),
  ('accuracy_90',     'Sniper',             '90%+ de accuracy em um spot do trainer', '🎯', 0),
  ('first_session',   'Primeira Sessão',    'Registrou a primeira sessão via SharkScope', '♠️', 0),
  ('manager_streak',  'Parceria',           '7 dias respondendo ao Manager.IA', '🤝', 0)
on conflict (id) do nothing;

-- Conquistas desbloqueadas por usuário
create table if not exists public.user_badges (
  user_id     uuid references auth.users(id) on delete cascade,
  badge_id    text references public.badges(id),
  unlocked_at timestamptz default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;
create policy "user_badges: own rows" on public.user_badges
  for all using (auth.uid() = user_id);

-- badges são públicos (para o ranking)
alter table public.badges enable row level security;
create policy "badges: leitura pública" on public.badges
  for select using (true);

-- -------------------------------------------------------
-- 8. CONVERSAS COM O MANAGER.IA
-- -------------------------------------------------------
create table if not exists public.manager_conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  role        text not null check (role in ('manager', 'player')),
  content     text not null,

  -- Metadados da mensagem do Manager
  trigger_type text,
  -- 'player_initiated' | 'daily_checkin' | 'post_session' | 'streak_risk'
  -- | 'weekly_review' | 'badge_unlock' | 'leak_alert'

  metadata    jsonb  -- dados extras (snapshot_id, badge_id, etc.)
);

alter table public.manager_conversations enable row level security;
create policy "manager_conversations: own rows" on public.manager_conversations
  for all using (auth.uid() = user_id);

create index if not exists manager_conv_user_date
  on public.manager_conversations(user_id, created_at desc);

-- -------------------------------------------------------
-- 9. FUNÇÃO: atualizar streak após atividade
-- -------------------------------------------------------
create or replace function public.record_activity(p_user_id uuid)
returns void language plpgsql security definer as $$
declare
  v_today date := current_date;
  v_streak record;
begin
  -- Upsert streak
  insert into public.streaks (user_id, current_streak, longest_streak, last_activity_date)
  values (p_user_id, 1, 1, v_today)
  on conflict (user_id) do update
    set
      current_streak = case
        when streaks.last_activity_date = v_today - 1 then streaks.current_streak + 1
        when streaks.last_activity_date = v_today then streaks.current_streak
        else 1
      end,
      longest_streak = greatest(
        streaks.longest_streak,
        case
          when streaks.last_activity_date = v_today - 1 then streaks.current_streak + 1
          when streaks.last_activity_date = v_today then streaks.current_streak
          else 1
        end
      ),
      last_activity_date = v_today;
end;
$$;

-- -------------------------------------------------------
-- 10. RANKING VIEW (público — para o leaderboard)
-- -------------------------------------------------------
create or replace view public.weekly_ranking as
  select
    pp.display_name,
    pp.id as user_id,
    x.weekly_xp,
    x.total_xp,
    s.current_streak,
    rank() over (order by x.weekly_xp desc) as rank
  from public.xp_totals x
  join public.player_profiles pp on pp.id = x.user_id
  left join public.streaks s on s.user_id = x.user_id
  order by x.weekly_xp desc;

-- weekly_ranking é pública (anônima pode ler)
create policy "weekly_ranking: leitura pública" on public.player_profiles
  for select using (true);

-- ============================================================
-- VARIÁVEIS DE AMBIENTE necessárias no .env.local:
--
-- NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
-- NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
-- SUPABASE_SERVICE_ROLE_KEY=eyJ...  (apenas server-side)
-- SHARKSCOPE_USERNAME=seu_usuario
-- SHARKSCOPE_PASSWORD=sua_senha
-- OPENAI_API_KEY=sk-...
-- ADMIN_SECRET=reglife2024
-- ============================================================
