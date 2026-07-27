-- ─────────────────────────────────────────────────────────────────────────────
-- El rol que faltaba: quien lleva una sede.
--
-- Hasta ahora solo había PROPIETARIO / RECEPCION / INSTRUCTOR. Una cadena de dos
-- sedes con 18 instructoras no tiene dónde meter a la persona que lleva el día a
-- día de una sede: o le das la cuenta de propietaria (y ve la facturación de
-- todo el negocio) o la dejas como recepción (y no puede ni dar de alta a una
-- instructora). Las dos opciones son malas por motivos distintos.
--
-- MANAGER = recepción + equipo, SIN dinero. Decisión explícita del producto:
-- lleva su sede (horario, clientas, lista de espera, sustituciones, equipo) y no
-- ve facturación, informes de ingresos ni configuración de precios.
--
-- ── LO IMPORTANTE DE ESTE FICHERO ───────────────────────────────────────────
-- Dar de alta gente es el permiso más peligroso que existe, porque se puede
-- usar para darse permisos. Un manager con escritura sobre `instructores`
-- podría, sin más, ponerse `rol = 'PROPIETARIO'` y saltarse todo lo demás.
--
-- Por eso la policy le acota las filas por AMBOS lados:
--   · USING       — qué filas puede tocar: solo INSTRUCTOR y RECEPCION. No
--                   puede editar ni borrar a la propietaria ni a otro manager,
--                   ni a sí mismo (su propia fila es MANAGER).
--   · WITH CHECK  — en qué se pueden quedar: solo INSTRUCTOR o RECEPCION. No
--                   puede crear un manager ni ascender a nadie.
--
-- No se confía esto a la UI. La lección de la 0107 es exactamente esa: la
-- separación de roles tiene que estar en la base de datos o no está.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. El rol existe ─────────────────────────────────────────────────────────
alter table public.instructores drop constraint if exists instructores_rol_valido;
alter table public.instructores add constraint instructores_rol_valido
  check (rol in ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER')) not valid;

-- ── 2. Puede recibir avisos ──────────────────────────────────────────────────
-- Mismo paso que hubo que dar con RECEPCION (0097): sin esto, mandarle un aviso
-- de mostrador a un manager revienta con check_violation. Quien lleva la sede
-- tiene que enterarse de lo que pasa en ella.
alter table public.notification drop constraint if exists notification_recipient_role_check;
alter table public.notification add constraint notification_recipient_role_check
  check (recipient_role in ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER', 'SOCIA'));

-- ── 3. Puede gestionar su equipo, y solo hacia abajo ─────────────────────────
drop policy if exists manager_gestiona_equipo on public.instructores;
create policy manager_gestiona_equipo on public.instructores
  for all to authenticated
  using (
    public.current_rol() = 'MANAGER'
    and studio_id = public.current_studio_id()
    and rol in ('INSTRUCTOR', 'RECEPCION')
  )
  with check (
    public.current_rol() = 'MANAGER'
    and studio_id = public.current_studio_id()
    and rol in ('INSTRUCTOR', 'RECEPCION')
  );

comment on policy manager_gestiona_equipo on public.instructores is
  'Un manager da de alta y edita instructoras y recepción de SU estudio. No puede tocar filas de PROPIETARIO ni de MANAGER (incluida la suya), ni dejar una fila con esos roles: eso sería darse permisos a sí mismo.';

-- El dinero no se toca: `puede_mover_dinero()` (0107) es una lista blanca de
-- PROPIETARIO y RECEPCION, así que MANAGER queda fuera sin cambiar nada. Se deja
-- dicho aquí porque es una decisión, no un olvido.
