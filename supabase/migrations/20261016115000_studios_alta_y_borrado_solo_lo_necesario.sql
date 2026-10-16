-- ═══════════════════════════════════════════════════════════════════════════
-- `studios`: el navegador crea un estudio con lo justo y no lo borra nunca.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El UPDATE ya iba por columnas. Faltaban las otras dos escrituras:
--
-- 1) DELETE: fuera para `authenticated`. Borrar un estudio es un proceso del
--    servidor, con sus comprobaciones (lo que se conserva por ley, lo que queda
--    pendiente de cobrar o de devolver): `purgar_estudio_vencido` y el ciclo de
--    baja, que corren como service_role. Ningún código lo hace con la sesión de
--    la propietaria (medido el 16-oct: ni en el panel, ni en funciones SQL).
--
-- 2) INSERT: de tabla a columnas. El alta (`dbCreateStudio`) manda nueve columnas
--    (lib/estudio/alta-escritura-navegador.ts); el resto de la fila la deciden
--    los valores por defecto, los triggers del alta y el servidor (las sedes de
--    una cadena nacen por /api/cadena/sedes, con service_role). Un REVOKE de
--    columna no resta de un grant de tabla: por eso es REVOKE de tabla + GRANT
--    por columnas, en ese orden (mismo patrón que `recibos`, 20261002094636).
--
-- 3) `creado_en` lo pone el servidor, como segunda cerradura por si un GRANT
--    futuro reabriera la columna: un trigger pone now() en el alta, salvo para el
--    servidor (`es_llamada_servicio()`: service_role, y postgres en seed.sql y en
--    las migraciones). Con ella se ancla la antigüedad de un estudio.
--
-- Sin cambios para nadie que use el producto: el alta sigue mandando lo mismo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Toca `studios` (candado al crear el trigger): mejor fallar que hacer cola
-- detrás del tráfico del panel.
set local lock_timeout = '5s';

-- ── 1) y 2) Privilegios ─────────────────────────────────────────────────────
revoke delete on public.studios from authenticated;
revoke insert on public.studios from authenticated;
grant insert (id, nombre, ciudad, telefono, plan, owner_auth_user_id, slug, como_nos_conocio, tipo_cuenta) on public.studios to authenticated;

-- ── 3) `creado_en` lo pone el servidor ──────────────────────────────────────
-- Invoker, como studios_widget_dominios_solo_servidor: `es_llamada_servicio()`
-- tiene que ver el rol de quien escribe.
create or replace function public.studios_creado_en_solo_servidor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.es_llamada_servicio() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creado_en := now();
  elsif new.creado_en is distinct from old.creado_en then
    new.creado_en := old.creado_en;
  end if;
  return new;
end;
$$;

-- Función de trigger: el permiso se comprueba al crear el trigger, no al dispararse.
revoke execute on function public.studios_creado_en_solo_servidor() from public, anon, authenticated;
grant execute on function public.studios_creado_en_solo_servidor() to service_role;

drop trigger if exists trg_studios_creado_en_solo_servidor on public.studios;
create trigger trg_studios_creado_en_solo_servidor
  before insert or update of creado_en on public.studios
  for each row execute function public.studios_creado_en_solo_servidor();

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  v_cols text;
  f text := 'public.studios_creado_en_solo_servidor()';
begin
  if has_table_privilege('authenticated', 'public.studios', 'DELETE') then
    raise exception 'authenticated sigue pudiendo borrar estudios';
  end if;
  if has_table_privilege('authenticated', 'public.studios', 'INSERT') then
    raise exception 'authenticated sigue teniendo INSERT de tabla sobre studios';
  end if;
  if has_table_privilege('anon', 'public.studios', 'DELETE') or has_any_column_privilege('anon', 'public.studios', 'INSERT') then
    raise exception 'anon puede crear o borrar estudios';
  end if;
  if not (has_table_privilege('service_role', 'public.studios', 'INSERT') and has_table_privilege('service_role', 'public.studios', 'DELETE')) then
    raise exception 'service_role perdió su escritura sobre studios';
  end if;

  select string_agg(a.attname, ',' order by a.attname) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.studios'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.studios', a.attname, 'INSERT');
  if v_cols is distinct from 'ciudad,como_nos_conocio,id,nombre,owner_auth_user_id,plan,slug,telefono,tipo_cuenta' then
    raise exception 'columnas insertables por authenticated inesperadas: %', v_cols;
  end if;

  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
     or not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception '% tiene que ser solo de service_role', f;
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_studios_creado_en_solo_servidor'
                  and tgrelid = 'public.studios'::regclass and not tgisinternal) then
    raise exception 'falta el trigger trg_studios_creado_en_solo_servidor';
  end if;
end $$;
