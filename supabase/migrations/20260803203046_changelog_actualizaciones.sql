-- ═══════════════════════════════════════════════════════════════════════════
-- Changelog de Tentare ("Actualizaciones") · publicable sin deploy
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Antes "Novedades" (lib/novedades.ts) era una lista hardcodeada en TS: cada
-- entrada nueva exigía tocar código y desplegar. Esta migración crea el
-- changelog de verdad: versionado (0.92, 0.93...), con una ETIQUETA POR
-- CAMBIO (no por versión entera, tal como se pidió), publicable desde el
-- backoffice interno (app/interno/actualizaciones) sin volver a tocar código.
--
-- Dos tablas, no una con JSON — la etiqueta por cambio es una relación
-- consultable de verdad (contar arreglos, filtrar por tipo) sin parsear JSON
-- en cada lectura.

create table public.changelog_versiones (
  id                uuid primary key default gen_random_uuid(),
  version           text not null unique check (version ~ '^\d+\.\d+(\.\d+)?$'),
  titulo            text not null,
  -- La fecha que VE la propietaria en la tarjeta — deliberadamente distinta de
  -- `creado_en`: se puede preparar un borrador un día y fecharlo/publicarlo otro.
  fecha_publicacion date not null,
  estado            text not null default 'borrador' check (estado in ('borrador', 'publicado')),
  -- NULL en borrador; se rellena al publicar. Es la auditoría del EVENTO real
  -- de publicación, no confundir con fecha_publicacion (la que se muestra).
  publicado_en      timestamptz,
  creado_en         timestamptz not null default now(),
  creado_por        uuid references public.plataforma_admin(auth_user_id)
);

create table public.changelog_cambios (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.changelog_versiones(id) on delete cascade,
  etiqueta   text not null check (etiqueta in ('NUEVA_FUNCIONALIDAD', 'MEJORA', 'RENDIMIENTO', 'ARREGLO')),
  texto      text not null,
  orden      smallint not null default 0
);

create index idx_changelog_versiones_publicadas
  on public.changelog_versiones (fecha_publicacion desc, version desc)
  where estado = 'publicado';
create index idx_changelog_cambios_version on public.changelog_cambios (version_id, orden);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Lectura: cualquier `authenticated` (staff de CUALQUIER estudio — es
-- contenido de producto global, no de negocio de un estudio) ve solo lo
-- PUBLICADO. Sin política de escritura para authenticated/anon: todo INSERT/
-- UPDATE/DELETE pasa por service-role desde /api/interno/changelog, después
-- de comprobar el permiso `content.write` en TypeScript — mismo patrón que el
-- resto de /api/interno/*.
alter table public.changelog_versiones enable row level security;
alter table public.changelog_cambios enable row level security;

create policy changelog_versiones_lectura on public.changelog_versiones
  for select to authenticated
  using (estado = 'publicado');

create policy changelog_cambios_lectura on public.changelog_cambios
  for select to authenticated
  using (exists (
    select 1 from public.changelog_versiones v
    where v.id = version_id and v.estado = 'publicado'
  ));

grant select on public.changelog_versiones, public.changelog_cambios to authenticated;
grant select, insert, update, delete on public.changelog_versiones, public.changelog_cambios to service_role;

-- ── Tiempo real ───────────────────────────────────────────────────────────
-- Mismo mecanismo ya usado en 0022 (chat de equipo) y 20260801233748
-- (self-claim de instructora, también un UPDATE) — el widget del panel se
-- suscribe a postgres_changes sobre changelog_versiones (evento: la fila
-- pasa a estado='publicado') y refetch. REPLICA IDENTITY DEFAULT ya basta:
-- solo hace falta la fila NUEVA, no la anterior.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'changelog_versiones'
  ) then
    alter publication supabase_realtime add table public.changelog_versiones;
  end if;
end $$;

-- ── Migración de las 10 entradas ya existentes en lib/novedades.ts ──────────
-- Sin versión real histórica (nunca hubo versionado antes de ahora): se
-- agrupan por fecha de publicación en 3 versiones retroactivas 0.1–0.3, cada
-- una con sus cambios como bullets — así se refleja el formato real de
-- destino (una versión, varios cambios) en vez de una versión por bullet. La
-- etiqueta SEGURIDAD (que no existe en el catálogo nuevo de 4) se mapea a
-- ARREGLO, tal como se decidió.
insert into public.changelog_versiones (version, titulo, fecha_publicacion, estado, publicado_en) values
  ('0.1', 'Trazabilidad de salud y avisos de disputas', '2026-07-29', 'publicado', '2026-07-29T00:00:00Z'),
  ('0.2', 'Estabilidad, rendimiento y seguridad del panel', '2026-07-30', 'publicado', '2026-07-30T00:00:00Z'),
  ('0.3', 'Reglas de reserva más flexibles y ficha de clienta más segura', '2026-07-31', 'publicado', '2026-07-31T00:00:00Z');

insert into public.changelog_cambios (version_id, etiqueta, texto, orden)
select v.id, c.etiqueta, c.texto, c.orden
from public.changelog_versiones v
join (values
  ('0.1', 'MEJORA',   'Si un banco reclama un cobro con tarjeta (disputa), ahora te avisamos en el panel en cuanto ocurre.', 0),
  ('0.1', 'ARREGLO',  'Queda constancia de cada vez que alguien del equipo abre la ficha de salud de una clienta — trazabilidad para tu tranquilidad y la suya.', 1),
  ('0.2', 'MEJORA',   '"Mi plan" se ha dividido en dos pantallas más claras en la app de tus clientas: Bonos (su saldo) y Compras (comprar, pagar y facturas).', 0),
  ('0.2', 'ARREGLO',  'Si una clienta tiene una plaza fija contratada, ahora se lo enseña su app — antes no llegaba a verse ahí aunque estuviera pagada.', 1),
  ('0.2', 'MEJORA',   'Las notificaciones que reciben tus clientas en el móvil muestran el logo de tu estudio en vez del genérico de Tentare.', 2),
  ('0.2', 'ARREGLO',  'Si añades el panel a la pantalla de inicio de tu móvil, ya abre el panel de verdad — antes te llevaba a la web pública por error.', 3),
  ('0.2', 'RENDIMIENTO', 'La ficha de una clienta y la pantalla de marcar entrada ("Leer un pase") desbordaban un poco a los lados en el móvil. Arreglado.', 4),
  ('0.2', 'ARREGLO',  'Se ha cerrado un hueco que, en teoría, podía dejar sobrescribir el logo o una foto de perfil de otro estudio.', 5),
  ('0.3', 'MEJORA',   'Ahora puedes exigir plan, poner antelación mínima/máxima y permitir o no lista de espera de forma distinta para cada tipo de clase, no solo para todo el estudio.', 0),
  ('0.3', 'ARREGLO',  'La nota de seguimiento con IA de una clienta ya solo la ve quien debe (propietaria/instructora), no cualquier perfil con acceso al panel.', 1)
) as c(version, etiqueta, texto, orden) on c.version = v.version;
