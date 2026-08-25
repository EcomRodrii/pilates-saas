-- CORRECCIÓN de 20260825074144, que en su primera mitad fue un NO-OP.
--
-- `revoke update (col) ... from authenticated` NO hace nada mientras exista el
-- grant a NIVEL DE TABLA: en Postgres el privilegio de tabla implica todas las
-- columnas, presentes y futuras, y el revoke por columna no lo recorta.
-- Verificado en producción: tras aplicar la anterior,
-- has_column_privilege('authenticated','red_perfiles','destacado','UPDATE')
-- seguía devolviendo true.
--
-- Es exactamente el mismo error que dejó la fuga de PII del 14-ago abierta
-- tres días dándose por cerrada. La forma correcta —y la que ya usa este
-- proyecto para el SELECT de esta misma tabla— es: revocar en la tabla y
-- volver a conceder por columna.
do $$
declare
  cols text;
begin
  -- Todas las columnas MENOS las dos señales de confianza.
  select string_agg(quote_ident(attname), ', ' order by attname)
    into cols
  from pg_attribute
  where attrelid = 'public.red_perfiles'::regclass
    and attnum > 0
    and not attisdropped
    and attname not in ('destacado', 'identidad_verificada_en');

  execute 'revoke update, insert on public.red_perfiles from authenticated';
  execute format('grant update (%s) on public.red_perfiles to authenticated', cols);
  execute format('grant insert (%s) on public.red_perfiles to authenticated', cols);
end $$;

-- Nota para el futuro: al quitar el grant de tabla, las columnas que se añadan
-- a `red_perfiles` a partir de ahora NO serán escribibles por `authenticated`
-- hasta que se conceda explícitamente. Es lo correcto: todas las escrituras
-- legítimas van por service role (app/api/network/perfil, con su lista blanca
-- `saneaCambios`, y app/api/interno/network/** tras
-- `exigirPermiso(..., 'network.moderate')`), así que el defecto debe ser
-- "cerrado".
