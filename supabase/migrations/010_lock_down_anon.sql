-- ============================================================
-- RegLife — Migration 010: fecha o banco para anon
--
-- Contexto: até aqui, várias tabelas tinham políticas RLS abertas
-- pro role `anon` (ou simplesmente não tinham RLS habilitada),
-- e a NEXT_PUBLIC_SUPABASE_ANON_KEY está embutida no bundle do
-- browser por design do Next. Combinação = qualquer visitante
-- pode fazer SELECT/INSERT direto na REST API do Supabase,
-- dumpando leads, criando lixo ou apagando dados.
--
-- Todo o backend hoje usa o service_role (via lib/supabase.ts
-- `supabaseAdmin`) — service_role bypassa RLS, então fechar
-- pro anon não quebra nada do app. As únicas leituras públicas
-- legítimas continuam:
--   - storage bucket `plan-pdfs` (UUID-based, signed-style)
--   - tabela `badges` (catálogo, leitura pública intencional)
--
-- Estratégia: RLS habilitada + nenhuma policy = nega tudo
-- pro anon/authenticated. service_role bypassa.
-- ============================================================

-- ---- reglife_diagnostic_results -------------------------------------------
-- Era o pior caso: anon SELECT/INSERT abertos.
drop policy if exists "diag_results: select anon"
  on public.reglife_diagnostic_results;
drop policy if exists "diag_results: insert anon"
  on public.reglife_diagnostic_results;
alter table public.reglife_diagnostic_results enable row level security;

-- ---- diagnostic_activity / weekly_quests (migration 003) ------------------
-- Não havia RLS habilitada — quem tem a anon key fazia o que quisesse.
alter table public.diagnostic_activity enable row level security;
alter table public.weekly_quests       enable row level security;
alter table public.sharkscope_diag_snapshots enable row level security;

-- ---- notifications / xp_drops / diagnostic_badges (migration 004) ---------
alter table public.notifications      enable row level security;
alter table public.xp_drops           enable row level security;
alter table public.diagnostic_badges  enable row level security;

-- ---- sharkscope_monthly_stats (migration 006) -----------------------------
alter table public.sharkscope_monthly_stats enable row level security;

-- ============================================================
-- Defesa em profundidade: revoga grants default do anon/authenticated
-- pras tabelas sensíveis. Mesmo se alguém criar uma policy aberta sem
-- querer, o REVOKE ainda barra (RLS roda DEPOIS do GRANT check).
-- ============================================================

revoke all on public.reglife_diagnostic_results  from anon, authenticated;
revoke all on public.diagnostic_activity         from anon, authenticated;
revoke all on public.weekly_quests               from anon, authenticated;
revoke all on public.sharkscope_diag_snapshots   from anon, authenticated;
revoke all on public.notifications               from anon, authenticated;
revoke all on public.xp_drops                    from anon, authenticated;
revoke all on public.diagnostic_badges           from anon, authenticated;
revoke all on public.sharkscope_monthly_stats    from anon, authenticated;

-- service_role mantém acesso total (bypassa RLS + grants); não precisa GRANT.

-- ============================================================
-- Sanity: lista de tabelas que INTENCIONALMENTE continuam acessíveis
-- pra anon/authenticated. Mantenha esta seção atualizada quando
-- adicionar novas tabelas públicas.
-- ============================================================

-- public.badges — catálogo de badges, leitura pública intencional
--   (policy "badges: leitura pública" criada na migration 001).
-- storage.buckets.plan-pdfs — leitura pública intencional
--   (link compartilhado por email/WhatsApp; nome do arquivo é o UUID
--    do diagnóstico, padrão signed-URL).
