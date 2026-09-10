-- 20260910130000 · TENTARE — crear_recuperacion() ya comprueba el rol de quien llama
--
-- 48ª pasada de auditoría (2026-09-10), hallazgo H-1. crear_recuperacion()
-- (SECURITY DEFINER, supabase/migrations/20260904215616_...) validaba
-- pertenencia al estudio, caducidad, deduplicación por reserva de origen y
-- el tope de 4 vivas — pero nunca el rol de quien la invoca. Al ser
-- SECURITY DEFINER, la RLS real de `recuperaciones`
-- (recuperaciones_escritura_insert, 0122_rls_mandatos_y_recuperaciones.sql,
-- exige puede_gestionar_clientas()) queda bypaseada: cualquier miembro de
-- personal autenticado — incluida una INSTRUCTOR, a quien 0122 excluyó
-- explícitamente — podía llamar a `public.rpc('crear_recuperacion', ...)`
-- directo por PostgREST y conceder clases gratis a cualquier socia de su
-- propio estudio, sin pasar por la UI (que sí oculta el botón, pero la UI
-- nunca es el límite de seguridad).
--
-- Mismo patrón ya usado en `ampliar_caducidades`
-- (20260904182127_ampliar_caducidades.sql): el guard va DENTRO de la
-- función, solo cuando hay `auth.uid()`, para no romper a los llamadores
-- service-role (cron semanal, importador CSV, cancelación de plaza fija).
-- No cambia la firma → CREATE OR REPLACE sobre la MISMA firma conserva los
-- grants ya endurecidos, sin necesitar REVOKE/GRANT de nuevo.

create or replace function public.crear_recuperacion(
  p_id text,
  p_studio_id text,
  p_socio_id text,
  p_origen_reserva_id text,
  p_motivo text,
  p_caduca_el date
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text;
  v_dias int;
  v_vivas int;
  v_caduca date;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Una recuperación que nace caducada no es una recuperación: es una fila
  -- muerta que nadie va a poder usar y que encima ocupa sitio en el tope de 4.
  if p_caduca_el is not null and p_caduca_el < current_date then
    raise exception 'CADUCIDAD_EN_PASADO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':recuperaciones:' || p_socio_id));

  if p_origen_reserva_id is not null and exists (
    select 1 from recuperaciones
     where studio_id = p_studio_id and socio_id = p_socio_id
       and origen_reserva_id = p_origen_reserva_id
  ) then
    return 'YA_EXISTE';
  end if;

  select recuperacion_caducidad_tipo, recuperacion_caducidad_dias into v_tipo, v_dias
    from studios where id = p_studio_id;

  select count(*) into v_vivas
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= current_date;
  if v_vivas >= 4 then
    return 'TOPE';
  end if;

  -- La fecha a medida gana a la política; sin ella, todo sigue igual que antes.
  v_caduca := coalesce(
    p_caduca_el,
    calcular_caduca_recuperacion(current_date, coalesce(v_tipo, 'FIN_MES_SIGUIENTE'), v_dias)
  );

  insert into recuperaciones (id, studio_id, socio_id, origen_reserva_id, motivo, caduca_el, estado)
    values (p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, v_caduca, 'DISPONIBLE');
  return 'CREADA';
end;
$$;

comment on function public.crear_recuperacion(text, text, text, text, text, date) is
  'Concede una recuperación. Solo personal con puede_gestionar_clientas() (o service_role). p_caduca_el NULL = la política del estudio (studios.recuperacion_caducidad_*); con fecha, manda la fecha. Tope de 4 vivas por socia e idempotencia por reserva de origen, igual que la firma de 5 argumentos, que delega aquí.';
