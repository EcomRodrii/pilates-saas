create or replace function public.semaforo_salud_estudio(p_studio_id text)
returns table(socio_id text, nivel text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);
  if auth.uid() is not null and current_rol() not in ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION') then
    raise exception 'ROL_NO_AUTORIZADO';
  end if;

  return query
  select
    cs.socio_id,
    case
      when bool_or(
        cs.severidad = 'ALTA'
        or exists (select 1 from unnest(cs.restricciones) r where r like 'NO\_%' escape '\')
      ) then 'ROJO'
      else 'AMBAR'
    end as nivel
  from condiciones_salud cs
  where cs.studio_id = p_studio_id and cs.estado = 'ACTIVA'
  group by cs.socio_id;
end;
$function$;
