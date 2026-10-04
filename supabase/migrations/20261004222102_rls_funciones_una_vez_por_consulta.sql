-- Las políticas RLS de `public` llamaban a sus funciones de ayuda —current_studio_id(),
-- current_rol(), las puede_*(), auth.uid()…— a pelo, y Postgres las ejecutaba POR CADA
-- FILA. Cada una consulta `instructores`/`studios`, así que una tabla de unos miles de
-- filas costaba segundos: el embudo del widget llegó a cortar por statement timeout
-- (#2519 arregló esa tabla sola). Envueltas en `( SELECT f() )` Postgres las calcula UNA
-- vez por consulta (InitPlan). Misma regla, mismo resultado: solo cambia cuántas veces
-- se calcula.
--
-- Medido en producción antes de aplicarlo (4-oct-2026), dentro de una transacción
-- deshecha: 244 tablas con RLS contadas como propietaria, instructora, alumna y anon,
-- antes y después — 0 diferencias. Tiempo de recorrerlas todas: ~4 s → ~0,8 s por
-- usuaria del equipo; `sesiones` vista por una instructora, 1.906 ms → 13 ms.
--
-- Va como bloque que reescribe lo que haya, no como 300 ALTER copiados a mano: así
-- vale igual en producción que en una base levantada desde cero, y volver a ejecutarlo
-- no cambia nada.
--
-- ⚠️ Una política nueva debe escribir estas llamadas ya envueltas: `( select
-- public.current_rol() )`, nunca `current_rol()` a pelo.
do $$
declare
  -- Funciones sin argumentos, todas STABLE (comprobado en pg_proc antes de escribir
  -- esto): dan el mismo valor en toda la sentencia, así que calcularlas una vez o por
  -- fila da lo mismo, salvo en el tiempo. Una VOLATILE NO puede entrar en esta lista.
  v_fns constant text := 'current_studio_id|current_rol|current_instructor_id|nivel_acceso_suficiente'
    || '|puede_gestionar_clientas|puede_gestionar_sede|puede_configurar_negocio|puede_mover_dinero'
    || '|puede_gestionar_calendario|puede_gestionar_equipo|puede_ver_finanzas|uid';
  v_desenvolver text;
  v_envolver text;
  r record;
  v_qual text; v_check text;
  v_cambiadas int := 0;
  v_ruta text := pg_catalog.current_setting('search_path');
begin
  v_desenvolver := '\( SELECT ((?:public\.|auth\.)?(?:' || v_fns || ')\(\)) AS [a-z_]+\)';
  v_envolver := '\m((?:public\.|auth\.)?(?:' || v_fns || ')\(\))';
  -- Ruta vacía: pg_get_expr escribe cada nombre con su esquema y el ALTER lo vuelve a
  -- leer igual, sea cual sea la search_path de quien aplique la migración.
  perform set_config('search_path', '', true);
  for r in
    select n.nspname, c.relname, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as wcheck
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    -- Primero se quita el envoltorio que ya tuvieran («( SELECT f() AS f)» → «f()») y
    -- luego se envuelven todas: cada llamada queda envuelta UNA vez, y volver a
    -- ejecutar esto no cambia nada.
    v_qual := pg_catalog.regexp_replace(pg_catalog.regexp_replace(r.qual, v_desenvolver, '\1', 'g'), v_envolver, '( SELECT \1 )', 'g');
    v_check := pg_catalog.regexp_replace(pg_catalog.regexp_replace(r.wcheck, v_desenvolver, '\1', 'g'), v_envolver, '( SELECT \1 )', 'g');
    if v_qual is distinct from r.qual and v_check is distinct from r.wcheck then
      execute pg_catalog.format('alter policy %I on %I.%I using (%s) with check (%s)', r.polname, r.nspname, r.relname, v_qual, v_check);
    elsif v_qual is distinct from r.qual then
      execute pg_catalog.format('alter policy %I on %I.%I using (%s)', r.polname, r.nspname, r.relname, v_qual);
    elsif v_check is distinct from r.wcheck then
      execute pg_catalog.format('alter policy %I on %I.%I with check (%s)', r.polname, r.nspname, r.relname, v_check);
    else
      continue;
    end if;
    v_cambiadas := v_cambiadas + 1;
  end loop;
  perform pg_catalog.set_config('search_path', v_ruta, true);
  raise notice 'políticas reescritas: %', v_cambiadas;
end $$;
