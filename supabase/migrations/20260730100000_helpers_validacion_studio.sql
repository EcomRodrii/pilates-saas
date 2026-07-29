-- Extrae los dos bloques de validación que esta sesión copió y pegó en 8
-- RPCs nuevas (reservar_plaza, ajustar_creditos, crear_recuperacion,
-- reservar_cita, congelar_suscripcion, otorgar_credito_disparador,
-- editar_serie_desde, semaforo_salud_estudio) — hallazgo de limpieza de la
-- revisión ultra sobre esta rama. El check STUDIO_MISMATCH ya llevaba 20+
-- copias en el historial del repo (0009, 0023, 0079, 0086...); no se tocan
-- esas funciones ya verificadas en producción — solo se ofrece el helper
-- para que el código NUEVO deje de copiarlo, y se aplica a las 8 RPCs que
-- esta misma sesión introdujo (su propio código, su propio riesgo).
--
-- SECURITY INVOKER (no DEFINER): solo leen current_studio_id()/auth.uid()/una
-- tabla ya cubierta por RLS para el socio — no necesitan privilegio elevado
-- propio, heredan el de quien los llama.

create or replace function public.validar_studio_mismatch(p_studio_id text)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
end;
$function$;

create or replace function public.validar_socio_del_studio(p_socio_id text, p_studio_id text)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from socios where id = p_socio_id and studio_id = p_studio_id) then
    raise exception 'SOCIO_NO_PERTENECE_AL_STUDIO';
  end if;
end;
$function$;

revoke all on function public.validar_studio_mismatch(text) from public, anon;
grant execute on function public.validar_studio_mismatch(text) to authenticated, service_role;
revoke all on function public.validar_socio_del_studio(text, text) from public, anon;
grant execute on function public.validar_socio_del_studio(text, text) to authenticated, service_role;
