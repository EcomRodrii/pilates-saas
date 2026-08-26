-- Buzón de documentos (Community & Messaging OS, P2) — tabla + RLS.
--
-- Documentos que el estudio sube PARA una socia (plan firmado, factura,
-- contrato, "otro"). Mismo criterio estructural que toda la mensajería/Feed
-- de este proyecto: la socia NUNCA lee la tabla ni el bucket directo desde
-- el cliente — no tiene JWT de negocio (es un `auth.users` sin fila propia
-- de personal), así que su lectura pasa SIEMPRE por una API route con
-- service-role, que además decide ahí caducidad (`caduca_en`) y soft-delete
-- (`borrado_en`) antes de generar la URL firmada. Sin esa capa no hay forma
-- de aplicarle esas dos reglas desde una policy de storage.
--
-- Soft-delete con `borrado_en`, mismo patrón que `socios` (migración 0011):
-- se conserva la fila (auditoría de qué se subió y cuándo se retiró), el
-- panel filtra `borrado_en is null`.

create table public.documentos_socio (
  id            text primary key,
  studio_id     text not null references public.studios(id) on delete cascade,
  socio_id      text not null references public.socios(id) on delete cascade,
  categoria     text not null check (categoria in ('PLAN', 'FACTURA', 'CONTRATO', 'OTRO')),
  titulo        text not null,
  storage_path  text not null,
  subido_por    uuid not null references auth.users(id),
  caduca_en     timestamptz,
  creado_en     timestamptz not null default now(),
  borrado_en    timestamptz
);

create index idx_documentos_socio_socio on public.documentos_socio(socio_id) where borrado_en is null;

comment on table public.documentos_socio is
  'Buzón de documentos del estudio hacia una socia. Lectura de la socia SIEMPRE vía API route + service-role (URL firmada); nunca policy directa para ella. Ver migración de bucket 20260826200010.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Espejo de `puedeGestionarClientas` (lib/permisos-reglas.ts): mismo rol que
-- puede dar de alta/editar clientas puede subirles/verles documentos. Reusa
-- `public.puede_gestionar_clientas()` (migración 0118) — ya existe, no hace
-- falta una función nueva.
alter table public.documentos_socio enable row level security;

create policy documentos_socio_lectura on public.documentos_socio
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.puede_gestionar_clientas()
    and borrado_en is null
  );

create policy documentos_socio_insert on public.documentos_socio
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and public.puede_gestionar_clientas()
  );

-- Deliberadamente SIN policy de UPDATE/DELETE para `authenticated`: la baja es
-- un soft-delete (`borrado_en`) que hace la API route con service-role, no un
-- UPDATE libre desde el cliente. Y sin ninguna policy para la socia — su
-- lectura nunca pasa por aquí (ver comentario de tabla).

grant select, insert on table public.documentos_socio to authenticated;
grant all on table public.documentos_socio to service_role;
