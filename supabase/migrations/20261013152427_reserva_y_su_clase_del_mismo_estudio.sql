-- Una reserva y su clase, siempre del mismo estudio.
--
-- `reservas` guarda `studio_id` y `sesion_id`, y la FK solo exige que la clase
-- exista: nada obligaba a que fuese del MISMO estudio que la reserva. Todo lo
-- que cuenta plazas por `sesion_id` (aforo, lista de espera, `evaluar_reserva`)
-- da por hecho que lo es. Los caminos del servidor ya lo cumplen
-- (`reservar_plaza`, `resolver_reserva_pendiente` y `aceptar_oferta_lista_espera`
-- buscan la clase con `studio_id = p_studio_id`; las plazas fijas cruzan por
-- `studio_id`; la importación busca las clases del estudio), pero la regla no
-- estaba escrita en la base de datos, que es donde vive en este repo.
--
-- La regla, una vez y para todos (también service_role): al crear una reserva o
-- al cambiarle la clase o el estudio, la clase tiene que existir y ser del mismo
-- estudio. Si no, 42501. Medido antes de aplicar (13-oct-2026): 0 reservas en
-- producción con la clase en otro estudio y 0 sin clase, así que no rompe nada.
--
-- SECURITY DEFINER para que la comprobación no dependa de la RLS de `sesiones`
-- de quien escribe. Solo la dispara el trigger: el permiso se comprueba al CREAR
-- el trigger, no al dispararse. Y `pg_default_acl` da EXECUTE directo a
-- anon/authenticated en este proyecto, así que revocar PUBLIC no bastaría: se
-- revocan los tres y se verifica abajo.
--
-- El nombre del trigger empieza por `reservas_s…` para dispararse antes que los
-- demás BEFORE de `reservas` (van por orden alfabético): ninguno tiene que ver
-- una reserva con la clase de otro estudio.

create or replace function public.reservas_sesion_del_mismo_estudio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sesion_id is null or not exists (
    select 1 from public.sesiones s
     where s.id = new.sesion_id and s.studio_id = new.studio_id
  ) then
    raise exception 'SESION_NO_ES_DEL_ESTUDIO' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.reservas_sesion_del_mismo_estudio() is
  'Una reserva solo puede apuntar a una clase de su mismo estudio (42501 SESION_NO_ES_DEL_ESTUDIO). La dispara reservas_sesion_del_mismo_estudio_trigger al crear la reserva o al cambiarle sesion_id o studio_id.';

revoke all on function public.reservas_sesion_del_mismo_estudio() from public, anon, authenticated;
grant execute on function public.reservas_sesion_del_mismo_estudio() to service_role;

drop trigger if exists reservas_sesion_del_mismo_estudio_trigger on public.reservas;
create trigger reservas_sesion_del_mismo_estudio_trigger
  before insert or update of sesion_id, studio_id on public.reservas
  for each row execute function public.reservas_sesion_del_mismo_estudio();

do $verificacion$
begin
  if has_function_privilege('anon', 'public.reservas_sesion_del_mismo_estudio()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reservas_sesion_del_mismo_estudio()', 'EXECUTE') then
    raise exception 'reservas_sesion_del_mismo_estudio: anon/authenticated no deben tener EXECUTE';
  end if;
  if not has_function_privilege('service_role', 'public.reservas_sesion_del_mismo_estudio()', 'EXECUTE') then
    raise exception 'reservas_sesion_del_mismo_estudio: service_role debe tener EXECUTE';
  end if;
end
$verificacion$;
