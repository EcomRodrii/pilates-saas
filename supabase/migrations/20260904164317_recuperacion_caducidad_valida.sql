-- La política de caducidad de recuperaciones (migr 0086) pasa a editarse desde
-- Configuración → Reservas, y `dbUpdateStudio` escribe `studios` con la sesión
-- de la propietaria: la columna deja de ser solo-SQL y pasa a ser un campo que
-- llega del cliente. Mismo criterio que `studios_plan_valido` — elegir la
-- política es intencionado, escribir cualquier cosa en la columna no.
--
-- Sin esto: un tipo desconocido cae en el `else` de calcular_caduca_recuperacion
-- (degrada a FIN_MES_SIGUIENTE, benigno) pero un número de días NEGATIVO no
-- degrada a nada — `p_desde + (-5)` da una recuperación que nace caducada.

alter table public.studios
  drop constraint if exists studios_recuperacion_caducidad_tipo_valido;
alter table public.studios
  add constraint studios_recuperacion_caducidad_tipo_valido
  check (recuperacion_caducidad_tipo in ('DIAS', 'FIN_MES', 'FIN_MES_SIGUIENTE'));

alter table public.studios
  drop constraint if exists studios_recuperacion_caducidad_dias_valido;
alter table public.studios
  add constraint studios_recuperacion_caducidad_dias_valido
  check (recuperacion_caducidad_dias is null or recuperacion_caducidad_dias between 1 and 365);
