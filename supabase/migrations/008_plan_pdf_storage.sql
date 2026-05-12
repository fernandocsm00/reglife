-- ============================================================
-- RegLife — Migration 008: bucket pro PDF do plano
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================

-- Coluna nova: SavedPlan completo serializado pra permitir regeneração do PDF
alter table public.reglife_diagnostic_results
  add column if not exists saved_plan jsonb;

insert into storage.buckets (id, name, public)
values ('plan-pdfs', 'plan-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "plan-pdfs: public read" on storage.objects;
create policy "plan-pdfs: public read"
  on storage.objects for select
  using (bucket_id = 'plan-pdfs');

drop policy if exists "plan-pdfs: service write" on storage.objects;
create policy "plan-pdfs: service write"
  on storage.objects for insert to service_role
  with check (bucket_id = 'plan-pdfs');

drop policy if exists "plan-pdfs: service update" on storage.objects;
create policy "plan-pdfs: service update"
  on storage.objects for update to service_role
  using (bucket_id = 'plan-pdfs');
