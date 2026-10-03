-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación en dos pasos para el equipo de los estudios.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contrato de encargo (decisión del fundador, 2-oct-2026): opcional para todo
-- el equipo del panel, y la propietaria puede exigirla a todos. Reglas en
-- lib/auth/doble-factor-reglas.ts:
--
--   A. Quien la tiene activada (factor TOTP verificado) solo ve y toca datos
--      con la sesión verificada (aal2). Esto lo decide AQUÍ la base de datos:
--      una política RESTRICTIVA `exige_doble_factor` en cada tabla de `public`
--      con RLS y en `storage.objects`. Sin ella, una contraseña robada daría
--      los datos yendo directo a la API de Supabase, sin pasar por el panel.
--      (Y `verificarSesionStaff` hace lo mismo en cada ruta de API.)
--   B. `studios.exigir_doble_factor`: sin `aal2`, el equipo del panel (no
--      INSTRUCTOR) de un estudio que la exige no ve nada hasta que la active.
--
-- Dónde se aplican en la base de datos:
--   · `current_studio_id()` devuelve NULL a una sesión a la que le falta el
--     segundo paso (A o B). Es la cerradura de casi todas las políticas y de las
--     funciones SECURITY DEFINER que el equipo puede llamar (por `current_rol()`
--     y los `puede_*`): sin esto, una RPC con privilegios se saltaba las
--     políticas de las tablas.
--   · Además, la política restrictiva de abajo (regla A) en cada tabla, para lo
--     que no depende del estudio (filas propias por `user_id`, perfiles…).
--
-- ⚠️ Una tabla NUEVA con RLS tiene que llevar también la política
-- `exige_doble_factor` (la última sentencia de este fichero, copiada). Lo vigila
-- supabase/tests/rls-doble-factor.test.ts: sin ella, CI falla.
--
-- Por qué no afecta a las apps del estudio (alumna e instructora): no consultan
-- la base de datos con su sesión, sino por rutas del servidor (service_role),
-- y la política solo se aplica al rol `authenticated`.
--
-- Coste: la función se evalúa UNA vez por consulta (`(select …)` → initPlan),
-- no por fila.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── B: la propietaria la exige a su equipo ──────────────────────────────────
alter table public.studios add column if not exists exigir_doble_factor boolean not null default false;
comment on column public.studios.exigir_doble_factor is
  'La propietaria exige la verificación en dos pasos a todo el equipo del panel (no a INSTRUCTOR). Solo la cambia el servidor (/api/estudio/doble-factor).';

create or replace function public.exigir_doble_factor_solo_servidor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.exigir_doble_factor is distinct from old.exigir_doble_factor and not public.es_llamada_servicio() then
    raise exception 'exigir_doble_factor solo se cambia desde el servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.exigir_doble_factor_solo_servidor() from public;
revoke execute on function public.exigir_doble_factor_solo_servidor() from anon;
revoke execute on function public.exigir_doble_factor_solo_servidor() from authenticated;

drop trigger if exists trg_studios_exigir_doble_factor on public.studios;
create trigger trg_studios_exigir_doble_factor
  before update of exigir_doble_factor on public.studios
  for each row execute function public.exigir_doble_factor_solo_servidor();

-- ── A: quien la tiene activada, solo con la sesión verificada ───────────────
-- SECURITY DEFINER: `authenticated` no puede leer auth.mfa_factors. No toca
-- ninguna tabla de `public`, así que no puede entrar en recursión con las
-- políticas que la llaman.
create or replace function public.nivel_acceso_suficiente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Sin usuario no hay factor que buscar (`user_id = null` no casa nada): la
  -- regla no aplica y deciden las demás políticas, que sin estudio no dan nada.
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

comment on function public.nivel_acceso_suficiente() is
  'false si quien consulta tiene la verificación en dos pasos activada y su sesión no la ha pasado (aal1). La usan las políticas restrictivas exige_doble_factor.';

-- La llaman las políticas con el rol de quien consulta: `authenticated` tiene
-- que poder ejecutarla. `anon`, no (las políticas son solo `to authenticated`).
revoke execute on function public.nivel_acceso_suficiente() from public;
revoke execute on function public.nivel_acceso_suficiente() from anon;
grant execute on function public.nivel_acceso_suficiente() to authenticated, service_role;

do $$
declare
  v_tabla text;
begin
  for v_tabla in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     order by c.relname
  loop
    execute format('drop policy if exists exige_doble_factor on public.%I', v_tabla);
    execute format(
      'create policy exige_doble_factor on public.%I as restrictive for all to authenticated '
      'using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()))',
      v_tabla);
  end loop;
end $$;

-- Los ficheros (documentos de las alumnas, avatares…): misma regla.
drop policy if exists exige_doble_factor on storage.objects;
create policy exige_doble_factor on storage.objects as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── current_studio_id(): sin estudio para una sesión sin el segundo paso ────
-- Copia de la vigente (0130_baja_revoca_acceso) con la decisión al final. Se
-- comprueba antes que producción sigue teniendo ESA versión.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.current_studio_id()'::regprocedure)
     <> '659bfaf3d03f1c5b12f0eac0ae8d2bd5' then
    raise exception 'current_studio_id ha cambiado: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.current_studio_id()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  with candidata as (
    select coalesce(
      (select sa.studio_id from public.sesion_activa sa
         where sa.auth_user_id = auth.uid()
           and (
             exists (select 1 from public.studios s where s.id = sa.studio_id and s.owner_auth_user_id = auth.uid())
             or exists (select 1 from public.instructores i where i.studio_id = sa.studio_id and i.auth_user_id = auth.uid() and coalesce(i.activo, true))
           )),
      (select studio_id from public.instructores where auth_user_id = auth.uid() and coalesce(activo, true) order by studio_id limit 1),
      (select id from public.studios where owner_auth_user_id = auth.uid() order by id limit 1)
    ) as id
  )
  select case
    -- Sesión verificada: como siempre.
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then c.id
    -- Regla A: tiene la verificación activada y esta sesión no la ha pasado.
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then null
    -- Regla B: su estudio la exige y su papel ahí es del panel (mismo orden que current_rol()).
    when exists (select 1 from public.studios s where s.id = c.id and s.exigir_doble_factor)
         and coalesce(
               (select i.rol from public.instructores i
                 where i.auth_user_id = auth.uid() and i.studio_id = c.id and coalesce(i.activo, true) limit 1),
               'PROPIETARIO') <> 'INSTRUCTOR'
      then null
    else c.id
  end
  from candidata c;
$function$;

-- Misma firma: conserva sus permisos, pero se deciden por escrito (0078).
revoke execute on function public.current_studio_id() from anon, public;
grant  execute on function public.current_studio_id() to authenticated, service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  v_sin text;
begin
  select string_agg(c.relname, ', ') into v_sin
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'exige_doble_factor' and not p.polpermissive);
  if v_sin is not null then
    raise exception 'tablas sin la política exige_doble_factor: %', v_sin;
  end if;
  if has_function_privilege('anon', 'public.nivel_acceso_suficiente()', 'EXECUTE') then
    raise exception 'anon puede ejecutar nivel_acceso_suficiente';
  end if;
  if has_function_privilege('authenticated', 'public.exigir_doble_factor_solo_servidor()', 'EXECUTE') then
    raise exception 'authenticated puede ejecutar exigir_doble_factor_solo_servidor';
  end if;
  if has_function_privilege('anon', 'public.current_studio_id()', 'EXECUTE') then
    raise exception 'anon puede ejecutar current_studio_id';
  end if;
  if position('mfa_factors' in pg_get_functiondef('public.current_studio_id()'::regprocedure)) = 0 then
    raise exception 'current_studio_id no comprueba la verificación en dos pasos';
  end if;
end $$;
