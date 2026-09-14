-- ─────────────────────────────────────────────────────────────────────────────
-- 60ª auditoría (14-sep-2026) — la puerta que la 40ª pasada NOMBRÓ y no cerró.
--
-- `20260909154528` dejó escrito que «la política `admin_sustituciones` (0037),
-- sin distinguir rol, permite a cualquier socia/instructora autenticada del
-- mismo estudio invocarla directo por PostgREST» — y arregló SOLO la RPC
-- `confirmar_sustitucion`. La policy siguió `FOR ALL TO authenticated USING
-- (studio_id = current_studio_id())`, cinco días más.
--
-- Medido en producción el 14-sep, impersonando a una INSTRUCTORA real de
-- studio-1 (`set local role authenticated` + su `auth_user_id`, todo revertido):
--
--     UPDATE sustituciones AJENAS = 6 filas
--     DELETE sustituciones AJENAS = 6 filas
--     SELECT devuelve el `ranking` completo con nombres y motivos de las
--            compañeras — justo lo que /api/portal/instructora/baja le oculta
--            a propósito («lleva el ranking con nombres de compañeras»)
--
-- Y lo que lo hace urgente hoy: #1958 y #1960 (de anoche) le acaban de dar a
-- cada instructora una app que la lleva a esta tabla.
--
-- Ningún navegador toca estas dos tablas: las 11 escrituras del repo son con
-- `admin` (service_role) y el panel entra por `/api/sustituciones`. Así que
-- cerrar la puerta no apaga ninguna pantalla — se verifica abajo con control
-- positivo, no con el `success: true` de esta migración.
--
-- Se cierra también el gemelo `instructora_disponibilidad_excepciones`, que es
-- donde se materializan las ausencias que `20260914000209` sí blindó en
-- `instructora_ausencias`: hoy una instructora puede borrar los bloqueos de
-- vacaciones de una compañera (y el motor la propondría estando de vacaciones)
-- o inventarle bloqueos para que no la propongan nunca. La LECTURA se deja como
-- está —saber quién no está y qué días ya es visible para el equipo—; lo que se
-- quita es la escritura ajena.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── sustituciones ────────────────────────────────────────────────────────────
drop policy if exists admin_sustituciones on public.sustituciones;

-- Lectura: quien gestiona el calendario (PROPIETARIO, MANAGER, RECEPCION).
-- La instructora no la necesita: su app recibe lo suyo por
-- `/api/portal/instructora/*`, que se lo da ya filtrado y sin el ranking.
create policy sustituciones_lectura_gestion on public.sustituciones
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

create policy sustituciones_escritura_gestion on public.sustituciones
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

-- ── instructora_disponibilidad_excepciones ───────────────────────────────────
drop policy if exists admin_instructora_disp_exc on public.instructora_disponibilidad_excepciones;

create policy instructora_disp_exc_lectura on public.instructora_disponibilidad_excepciones
  for select to authenticated
  using (studio_id = public.current_studio_id());

-- Escritura: quien gestiona el equipo, o la propia instructora sobre sus días.
create policy instructora_disp_exc_escritura on public.instructora_disponibilidad_excepciones
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and (public.puede_gestionar_equipo() or instructor_id = public.current_instructor_id())
  )
  with check (
    studio_id = public.current_studio_id()
    and (public.puede_gestionar_equipo() or instructor_id = public.current_instructor_id())
  );

-- ── `rankear_candidatas`: que el comentario sea verdad ───────────────────────
-- `20260914011337` revocó `sustitucion_contactos` razonando que esta función
-- «solo se llama con service-role». Eso describe de dónde SUELE venir la
-- llamada, no lo que la hace cierta: es SECURITY INVOKER y `authenticated`
-- conservaba EXECUTE, así que quedaba una RPC que falla con un 42501 sin
-- explicación. Los 3 llamantes del repo usan `admin.rpc`.
do $$
declare v_sig text;
begin
  for v_sig in
    select p.oid::regprocedure::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rankear_candidatas'
  loop
    execute format('revoke execute on function %s from authenticated, anon', v_sig);
  end loop;
end $$;

-- ── Verificación (control positivo y negativo, o la migración falla) ─────────
do $$
declare
  v_lectura_sin_rol boolean;
  v_escritura_sin_rol boolean;
  v_exec_rank boolean;
begin
  -- Que no quede ninguna política de estas dos tablas que permita a un rol
  -- cualquiera del estudio escribir sin pasar por una función de rol.
  select exists (
    select 1 from pg_policies
     where tablename = 'sustituciones'
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       and coalesce(with_check, qual) not like '%puede_gestionar_calendario%'
  ) into v_escritura_sin_rol;
  if v_escritura_sin_rol then
    raise exception 'queda una política de escritura de sustituciones sin gate de rol';
  end if;

  select exists (
    select 1 from pg_policies
     where tablename = 'sustituciones' and cmd = 'SELECT'
       and qual not like '%puede_gestionar_calendario%'
  ) into v_lectura_sin_rol;
  if v_lectura_sin_rol then
    raise exception 'queda una política de lectura de sustituciones sin gate de rol';
  end if;

  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rankear_candidatas'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) into v_exec_rank;
  if v_exec_rank then
    raise exception 'authenticated sigue pudiendo ejecutar rankear_candidatas';
  end if;

  -- Control positivo: service_role tiene que seguir entrando (es quien escribe
  -- de verdad). Si esto falla, la migración ha roto el producto.
  if not has_table_privilege('service_role', 'public.sustituciones', 'UPDATE') then
    raise exception 'service_role ha perdido la escritura de sustituciones';
  end if;
  if not has_table_privilege('service_role', 'public.instructora_disponibilidad_excepciones', 'UPDATE') then
    raise exception 'service_role ha perdido la escritura de las excepciones de disponibilidad';
  end if;
end $$;
