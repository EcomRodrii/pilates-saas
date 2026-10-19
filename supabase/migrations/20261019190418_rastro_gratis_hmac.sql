-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculos del plan gratis (6): el rastro, en HMAC y borrable (RGPD).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La segunda revisión de seguridad: un sha256 a pelo de un móvil se revierte por
-- fuerza bruta en segundos (es un seudónimo, no un dato anónimo), y el rastro no
-- se borraba al suprimir a la alumna. Ahora: HMAC con una clave que vive SOLO en
-- la base de datos (ni service_role la lee: solo detectar_vinculos_gratis, que es
-- SECURITY DEFINER), y cada clave de alumna lleva su `socio_id` para borrarla al
-- suprimir su ficha (app/api/socios/eliminar). La retención (18 meses) la aplica
-- el servidor (vinculos-gratis-servidor.ts).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rastro_gratis_clave (
  id boolean primary key default true check (id),
  clave bytea not null default extensions.gen_random_bytes(32)
);
alter table public.rastro_gratis_clave enable row level security;
create policy exige_doble_factor on public.rastro_gratis_clave as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.rastro_gratis_clave from anon, authenticated, service_role;
insert into public.rastro_gratis_clave (id) values (true) on conflict do nothing;
comment on table public.rastro_gratis_clave is
  'Clave del HMAC de rastro_gratis. Solo la lee detectar_vinculos_gratis (SECURITY DEFINER); ni service_role la lee directamente.';
alter table public.rastro_gratis add column if not exists socio_id text;
create index if not exists rastro_gratis_socio on public.rastro_gratis (studio_id, socio_id);
create index if not exists rastro_gratis_visto on public.rastro_gratis (visto_en);
