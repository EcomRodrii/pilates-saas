-- CAL-5, Fase 0: `authenticated` perdió UPDATE de tabla entera sobre `studios`
-- (migr 20260910171150) — la whitelist de columnas es explícita y column-
-- specific, así que una columna nueva no hereda nada por estar en el mismo
-- ALTER. Sin este GRANT, dbUpdateStudio('zonaHoraria') fallaría con 42501 en
-- cuanto se enchufe un formulario en /configuracion.
grant update (zona_horaria) on public.studios to authenticated;

do $$
begin
  if not has_column_privilege('authenticated', 'public.studios', 'zona_horaria', 'UPDATE') then
    raise exception 'zona_horaria: authenticated sigue sin UPDATE tras el grant';
  end if;
end $$;
