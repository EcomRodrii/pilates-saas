-- Badge «NUEVO» en el menú del panel: Tentare marca desde /interno qué entrada
-- es nueva y a la propietaria le aparece un distintivo al lado.
--
-- Contenido GLOBAL de Tentare, no de un estudio: no lleva `studio_id` ni RLS
-- por inquilino, igual que `changelog_versiones`. Lo que dice una fila es
-- «/cobros es nuevo», que es lo mismo para todo el mundo.
--
-- `href` es la PK: una entrada del menú está marcada o no lo está, no dos
-- veces. Volver a marcarla es un UPSERT que solo mueve la fecha.
--
-- `expira_en NOT NULL` a propósito: un «NUEVO» permanente deja de significar
-- nada en dos semanas y nadie se acuerda de ir a quitarlo. Que la fecha sea
-- obligatoria hace que el badge se retire SOLO. Quitarlo antes = borrar la
-- fila (no hay columna `activo`: una fila ES un badge vivo).
create table if not exists public.menu_novedades (
  href           text primary key,
  expira_en      date not null,
  creado_por     uuid references auth.users(id) on delete set null,
  creado_en      timestamptz not null default now()
);

-- El `href` lo valida la API contra `MODULOS` (lib/nav-config.ts), que es la
-- única fuente de verdad del menú y no se puede consultar desde SQL. Aquí solo
-- se cierra lo que SÍ se puede: que sea una ruta interna, no una URL externa
-- —el valor acaba dentro de un `<Link href>` del panel—.
alter table public.menu_novedades
  add constraint menu_novedades_href_interno check (href ~ '^/[a-z0-9/-]{1,60}$');

alter table public.menu_novedades enable row level security;

-- Lectura para cualquiera que haya iniciado sesión: el menú lo pinta el panel
-- con el cliente del navegador, y saber que «/cobros es nuevo» no es un dato
-- de nadie. `anon` NO entra: el menú del panel no existe sin sesión, y abrir
-- lectura anónima sin necesidad es justo lo que cerró la migración
-- 20260820165632.
create policy menu_novedades_lectura_staff on public.menu_novedades
  for select to authenticated using (true);

-- Escritura: solo `service_role`, o sea solo /api/interno/menu-novedades, que
-- ya exige el permiso `content.write` y deja rastro en auditoría. Sin política
-- de INSERT/UPDATE/DELETE, `authenticated` no puede escribir aunque lo intente.
--
-- ⚠️ `pg_default_acl` en este proyecto concede privilegios de tabla a
-- anon/authenticated por defecto, así que revocar no sobra: la RLS ya frena la
-- escritura, pero dejar el GRANT puesto es un permiso que nadie usa.
-- ⚠️ Ver la migración siguiente (menu_novedades_revoke_truncate): esto NO basta.
-- El default del proyecto concede además TRUNCATE/TRIGGER/REFERENCES, y los dos
-- primeros bypasan la RLS.
revoke insert, update, delete on public.menu_novedades from anon, authenticated;
grant select on public.menu_novedades to authenticated;
grant select, insert, update, delete on public.menu_novedades to service_role;

comment on table public.menu_novedades is
  'Entradas del menú del panel marcadas como NUEVO desde /interno. Global (sin studio_id). Una fila = un badge vivo hasta expira_en.';
