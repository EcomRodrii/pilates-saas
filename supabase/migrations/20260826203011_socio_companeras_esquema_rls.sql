-- Social graph — compañeras de clase (Community & Messaging OS, P2, última pieza).
--
-- Relación socia↔socia (solicitud/aceptación/bloqueo) dentro del mismo
-- estudio. Mismo criterio estructural que TODA la mensajería/Feed/Buzón de
-- documentos de este proyecto: la socia no tiene JWT de negocio para
-- lectura/escritura normal de tablas de negocio (la excepción de
-- `conversacion_participantes`/`mensajes` vía `auth.uid()` es solo para
-- Realtime, no un precedente general — ver comentario de
-- `documentos_socio`). Todo el ciclo de vida (crear solicitud, aceptar,
-- bloquear, listar) pasa por una API route con `getSupabaseAdmin()` +
-- `socioAutenticado()`. Deliberadamente CERO policies para `authenticated`.
create table public.socio_companeras (
  id              text primary key,
  studio_id       text not null references public.studios(id) on delete cascade,
  solicitante_id  text not null references public.socios(id) on delete cascade,
  destinataria_id text not null references public.socios(id) on delete cascade,
  estado          text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','bloqueada')),
  bloqueada_por   text references public.socios(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  resuelto_en     timestamptz,
  check (solicitante_id <> destinataria_id),
  check (estado <> 'bloqueada' or bloqueada_por is not null),
  check (bloqueada_por is null or bloqueada_por in (solicitante_id, destinataria_id))
);

-- Un solo registro de relación por PAR de socias, sin importar quién la
-- inició primero (evita que B->A duplique una A->B ya existente).
create unique index idx_socio_companeras_par
  on public.socio_companeras (least(solicitante_id,destinataria_id), greatest(solicitante_id,destinataria_id));

create index idx_socio_companeras_destinataria on public.socio_companeras(destinataria_id);

comment on table public.socio_companeras is
  'Solicitudes/relaciones de "compañeras de clase" entre socias del mismo estudio. Sin policy authenticated: toda lectura/escritura pasa por API route + service-role (socioAutenticado). Ver documentos_socio para el mismo patrón.';
comment on column public.socio_companeras.bloqueada_por is
  'Quién de las dos partes ejecutó el bloqueo — NUNCA reutilizar solicitante_id/destinataria_id para esto (esos campos son fijos desde el alta, describen quién envió la solicitud original, no quién bloqueó). Sin esta columna, "veo mis bloqueos pero no los que me hicieron a mí" no se puede resolver sin reescribir el par original.';

alter table public.socio_companeras enable row level security;

-- ⚠️ Gotcha ya documentado en este repo (memoria: "pg_default_acl: REVOKE
-- FROM PUBLIC no basta"), y verificado en vivo para ESTA tabla antes de
-- escribir esta migración: `pg_default_acl` en este proyecto concede
-- privilegios de tabla DIRECTO a anon/authenticated en cualquier tabla
-- nueva del esquema `public`, no heredados de PUBLIC. Sin este REVOKE
-- explícito, `has_table_privilege('authenticated', ...)` da true a pesar de
-- no tener ninguna policy — RLS seguiría bloqueando el acceso real (activo
-- sin policies permisivas = deniega todo), pero se revoca también el
-- privilegio de tabla como defensa en profundidad, mismo criterio que el
-- resto de tablas "solo service-role" de este proyecto.
revoke all on table public.socio_companeras from public, anon, authenticated;
grant all on table public.socio_companeras to service_role;
