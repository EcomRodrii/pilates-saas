-- Poder fijar a mano la caducidad de UNA recuperación concreta, sin cambiar la
-- política del estudio.
--
-- La política (studios.recuperacion_caducidad_tipo/dias, migr 0086) sigue siendo
-- el default y cubre el 95 % de los casos. Lo que faltaba es el otro 5 %: «esta
-- se la guardo hasta septiembre porque se va de Erasmus». Hoy eso obligaba a
-- cambiar la política del estudio entero, concederla, y volver a cambiarla.
--
-- ⚠️ POR QUÉ EL PARÁMETRO NUEVO NO LLEVA DEFAULT.
-- Con `p_caduca_el date default null`, una llamada de 5 argumentos encajaría a
-- la vez en la firma vieja y en la nueva, y Postgres la rechazaría por ambigua
-- ("function is not unique"). Esas llamadas de 5 argumentos existen durante el
-- despliegue: son las pestañas que la gente ya tiene abiertas con el bundle
-- anterior. Así que la firma nueva es de 6 argumentos OBLIGATORIOS y la vieja
-- se queda como envoltorio que delega pasando null: cada llamada resuelve sin
-- ambigüedad y la lógica sigue viviendo en un solo sitio.

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
  'Concede una recuperación. p_caduca_el NULL = la política del estudio (studios.recuperacion_caducidad_*); con fecha, manda la fecha. Tope de 4 vivas por socia e idempotencia por reserva de origen, igual que la firma de 5 argumentos, que ahora delega aquí.';

-- La firma vieja pasa a ser un envoltorio. `CREATE OR REPLACE` sobre la MISMA
-- firma conserva sus grants, así que aquí no hay que rehacer nada.
create or replace function public.crear_recuperacion(
  p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text
)
returns text
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.crear_recuperacion(p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, null::date);
$$;

-- Firma NUEVA: nace con EXECUTE para PUBLIC y, por el pg_default_acl de este
-- proyecto, directo para anon/authenticated. Revocar PUBLIC no le quita nada a
-- anon, que lo tiene por su cuenta.
revoke execute on function public.crear_recuperacion(text, text, text, text, text, date) from public;
revoke execute on function public.crear_recuperacion(text, text, text, text, text, date) from anon;
grant execute on function public.crear_recuperacion(text, text, text, text, text, date) to authenticated, service_role;
