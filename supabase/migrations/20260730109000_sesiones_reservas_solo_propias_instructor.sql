-- ─────────────────────────────────────────────────────────────────────────────
-- Una instructora podía crear clases nuevas, editar y cancelar CUALQUIER clase
-- del estudio (no solo las suyas), gestionar sustituciones ajenas y añadir
-- clientas a una reserva — encontrado probando en persona la cuenta de una
-- instructora en un estudio real.
--
-- Causa raíz, igual que en la 0112/0113 (dinero) y la 0113 (equipo): la ÚNICA
-- barrera era el panel (`calendario/page.tsx`), que no comprobaba el rol antes
-- de ofrecer crear/editar/cancelar/eliminar una clase ni antes de añadir una
-- reserva. La RLS real era una sola policy `admin_sesiones`/`admin_reservas`
-- FOR ALL a `authenticated` sin distinguir fila ni rol — CUALQUIER persona del
-- estudio podía escribir CUALQUIER fila.
--
-- Modelo nuevo ("solo lo suyo"), decisión de producto explícita del dueño:
--   · PROPIETARIO / MANAGER / RECEPCION: control total, sin cambios.
--   · INSTRUCTOR: SELECT sin restricción (no se toca — ya podía ver toda la
--     agenda del estudio y eso es correcto). UPDATE solo en sus propias
--     clases (`instructor_id = current_instructor_id()`, y no puede
--     reasignarla a otra instructora vía UPDATE directo). Sin INSERT ni
--     DELETE — crear/eliminar sigue siendo trabajo de mostrador.
--   · `reservas`: INSERT/DELETE solo para quien gestiona clientas
--     (`puede_gestionar_calendario()`); UPDATE se deja abierto porque
--     checkin/marcarNoShow/liberarSpot/asignarSpot son trabajo legítimo de
--     cualquier rol de panel sobre la clase que tiene delante.
--
-- Verificado ANTES de aplicar (transacción con ROLLBACK, ver notas de la
-- sesión): `addReserva`/`cancelarReserva` del panel pasan por
-- `reservar_plaza`/`cancelar_reserva_plaza` (RPC SECURITY DEFINER, bypassan
-- esta RLS igual que hoy) y `confirmar_sustitucion` (sustituciones) se llama
-- SIEMPRE con el cliente service-role (`getSupabaseAdmin()`), que también
-- bypassa la RLS de tabla. Ninguno de los dos flujos se ve afectado por este
-- cambio.
--
-- Reversible: recrear `admin_sesiones`/`admin_reservas` (FOR ALL, mismo
-- `qual`/`with_check` que antes) y DROP de las funciones nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

-- Espejo de current_rol()/current_studio_id() (0000_base): la ficha de
-- instructora del usuario autenticado, o NULL si no tiene (propietaria, o
-- alguien sin ficha vinculada). SECURITY DEFINER + search_path fijo, mismo
-- patrón que current_rol()/puede_mover_dinero() (0112).
create or replace function public.current_instructor_id() returns text
  language sql stable security definer
  set search_path = public
  as $$
    select id from instructores
    where auth_user_id = auth.uid()
      and studio_id = public.current_studio_id()
      and coalesce(activo, true)
    limit 1;
  $$;

comment on function public.current_instructor_id() is
  'Ficha de instructora (instructores.id) del usuario autenticado dentro de su estudio actual, o NULL si no es instructora (p.ej. la propietaria). Ver migración 20260730109000.';

revoke all on function public.current_instructor_id() from public, anon;
grant execute on function public.current_instructor_id() to authenticated, service_role;

-- Quién puede crear/editar/cancelar/eliminar CUALQUIER clase del calendario.
-- INSTRUCTOR queda fuera a propósito: solo puede tocar (UPDATE) sus propias
-- clases, vía sesiones_escritura_update más abajo.
create or replace function public.puede_gestionar_calendario() returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select public.current_rol() in ('PROPIETARIO', 'MANAGER', 'RECEPCION');
  $$;

comment on function public.puede_gestionar_calendario() is
  'Roles que pueden crear/eliminar clases y reasignar/cancelar la de CUALQUIER instructora, e insertar/borrar reservas directamente. Espejo de puede_mover_dinero() (0112). Ver migración 20260730109000.';

revoke all on function public.puede_gestionar_calendario() from public, anon;
grant execute on function public.puede_gestionar_calendario() to authenticated, service_role;

-- ── sesiones ─────────────────────────────────────────────────────────────────
drop policy if exists admin_sesiones on public.sesiones;

-- SELECT: sin restricción de rol — no se toca. La instructora necesita ver
-- toda la agenda del estudio (huecos, quién da qué) para poder trabajar.
create policy sesiones_lectura on public.sesiones
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy sesiones_escritura_insert on public.sesiones
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

-- UPDATE: quien gestiona el calendario, sobre cualquier fila — O una
-- instructora sobre SU PROPIA clase, sin poder reasignarla a otra persona (el
-- with_check exige que la fila resultante SIGA siendo suya).
create policy sesiones_escritura_update on public.sesiones
  for update to authenticated
  using (
    studio_id = public.current_studio_id()
    and (
      public.puede_gestionar_calendario()
      or (public.current_rol() = 'INSTRUCTOR' and instructor_id = public.current_instructor_id())
    )
  )
  with check (
    studio_id = public.current_studio_id()
    and (
      public.puede_gestionar_calendario()
      or (public.current_rol() = 'INSTRUCTOR' and instructor_id = public.current_instructor_id())
    )
  );

create policy sesiones_escritura_delete on public.sesiones
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

-- ── reservas ─────────────────────────────────────────────────────────────────
drop policy if exists admin_reservas on public.reservas;

-- SELECT: sin restricción de rol — no se toca (la instructora ve quién viene).
create policy reservas_lectura on public.reservas
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy reservas_escritura_insert on public.reservas
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

-- UPDATE se deja abierto a cualquier rol de panel (sin cambios): checkin,
-- marcar no-show/deshacer, liberar/asignar spot son trabajo legítimo de la
-- instructora sobre la clase que tiene delante, y ya pasaban por aquí.
create policy reservas_escritura_update on public.reservas
  for update to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());

create policy reservas_escritura_delete on public.reservas
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());
