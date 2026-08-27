-- Community & Messaging OS — P0, pieza 2/4: RLS + función guardia.
--
-- "Esto es solo la UI... la cerradura está en la RLS" (lib/permisos-reglas.ts).
-- Nadie escribe conversaciones/participantes desde el cliente: todo INSERT de
-- conversaciones/participantes pasa por la RPC `abrir_conversacion` (con
-- service-role, migración 3/4). authenticated solo puede LEER lo suyo, marcar
-- su propio `leido_hasta` y escribir mensajes en conversaciones donde ya
-- participa.

create or replace function public.es_participante_conversacion(p_conversacion_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.conversacion_participantes cp
     where cp.conversacion_id = p_conversacion_id
       and cp.auth_user_id = auth.uid()
  );
$function$;

revoke all on function public.es_participante_conversacion(text) from public, anon;
grant execute on function public.es_participante_conversacion(text) to authenticated, service_role;

alter table public.conversaciones enable row level security;
alter table public.conversacion_participantes enable row level security;
alter table public.mensajes enable row level security;

-- ── conversaciones ──────────────────────────────────────────────────────────
-- ⚠️ La condición studio-wide (para EQUIPO/ALUMNA_MOSTRADOR, ambas pensadas
-- para STAFF) exige `current_studio_id()`, pero esa función solo resuelve
-- identidad de PERSONAL (instructores/dueña) — nunca de socios. Aplicarla
-- también sobre la rama de participante bloquearía a CUALQUIER alumna de
-- leer/escribir su propia conversación (bug real, encontrado verificando en
-- vivo antes de aplicar esta migración: ya afectaba a ALUMNA_INSTRUCTORA en
-- el primer borrador). El scoping por studio para la rama de participante ya
-- lo da `es_participante_conversacion` (la fila SOCIO solo existe en la
-- conversación de SU estudio) — no hace falta repetirlo. Mismo patrón que
-- `red_mensajes_insert` (0121-red), que separa "staff del estudio" de "dueña
-- del perfil" en vez de exigir `current_studio_id()` a las dos por igual.
create policy conversaciones_lectura on public.conversaciones
  for select to authenticated
  using (
    (tipo = 'EQUIPO' and studio_id = public.current_studio_id())
    or (tipo = 'ALUMNA_MOSTRADOR' and studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
    or public.es_participante_conversacion(id)
  );

grant select on table public.conversaciones to authenticated;
grant all on table public.conversaciones to service_role;

-- ── conversacion_participantes ──────────────────────────────────────────────
create policy conversacion_participantes_lectura on public.conversacion_participantes
  for select to authenticated
  using (
    exists (
      select 1 from public.conversaciones c
       where c.id = conversacion_participantes.conversacion_id
         and (
           (c.tipo = 'EQUIPO' and c.studio_id = public.current_studio_id())
           or (c.tipo = 'ALUMNA_MOSTRADOR' and c.studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
           or public.es_participante_conversacion(c.id)
         )
    )
  );

-- Cada quien marca su propio progreso de lectura, nunca el de otra persona.
-- ⚠️ Límite conocido de P0: en ALUMNA_MOSTRADOR el staff YA NO tiene fila
-- propia en `conversacion_participantes` (se resuelve dinámicamente, ver
-- migración 3/4) — así que esta policy, y el concepto de "leído hasta"
-- individual, no aplica al mostrador ahí, solo a la fila SOCIO de la
-- alumna. No se resuelve con una tabla nueva de lectura por staff en este
-- P0; documentado a propósito, no un descuido.
create policy conversacion_participantes_marca_leido on public.conversacion_participantes
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

grant select, update on table public.conversacion_participantes to authenticated;
grant all on table public.conversacion_participantes to service_role;

-- ── mensajes ─────────────────────────────────────────────────────────────────
create policy mensajes_lectura on public.mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.conversaciones c
       where c.id = mensajes.conversacion_id
         and c.studio_id = mensajes.studio_id
         and (
           (c.tipo = 'EQUIPO' and c.studio_id = public.current_studio_id())
           or (c.tipo = 'ALUMNA_MOSTRADOR' and c.studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
           or public.es_participante_conversacion(c.id)
         )
    )
  );

create policy mensajes_escritura on public.mensajes
  for insert to authenticated
  with check (
    remitente_auth_user_id = (select auth.uid())
    and exists (
      select 1 from public.conversaciones c
       where c.id = mensajes.conversacion_id
         and c.studio_id = mensajes.studio_id
         and (
           (c.tipo = 'EQUIPO' and c.studio_id = public.current_studio_id())
           or (c.tipo = 'ALUMNA_MOSTRADOR' and c.studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
           or public.es_participante_conversacion(c.id)
         )
    )
  );

grant select, insert on table public.mensajes to authenticated;
grant all on table public.mensajes to service_role;
