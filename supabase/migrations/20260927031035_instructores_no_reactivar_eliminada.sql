-- ════════════════════════════════════════════════════════════════════════════
-- Una persona eliminada del equipo (art. 17) no se reactiva ni se vuelve a enlazar
-- ════════════════════════════════════════════════════════════════════════════
--
-- `anonimizar_instructor` deja la ficha como «Persona eliminada», inactiva y sin cuenta, y la
-- conserva por sus jornadas, clases y liquidaciones. La escritura directa de la propietaria y
-- de la gerencia sobre `instructores` (RLS) permitiría, sin embargo, ponerle `activo = true` o
-- volver a enlazarla a una cuenta, y quien llegara con ese nombre heredaría todo ese historial.
--
-- Este disparador lo impide mientras exista su constancia en `supresiones_equipo` (que solo
-- lee el servidor: por eso la función es SECURITY DEFINER; el usuario que actualiza no puede
-- leerla). Solo mira `activo` y `auth_user_id`: la propia función y la purga de un estudio
-- escriben `activo = false` y `auth_user_id = null` y pasan sin tocar nada.
--
-- Una persona que vuelve al equipo se da de alta con una ficha NUEVA.
--
-- Función de disparador: nadie la llama a mano. Aun así, los tres pasos explícitos de los
-- grants (`pg_default_acl` da EXECUTE directo a anon y authenticated); el usuario que dispara el
-- trigger no necesita EXECUTE para que se ejecute.

create or replace function public.instructores_no_reactivar_eliminada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if ((new.activo is true and old.activo is not true)
      or (new.auth_user_id is not null and old.auth_user_id is null))
     and exists (select 1 from public.supresiones_equipo se
                  where se.studio_id = new.studio_id and se.instructor_id = new.id) then
    raise exception 'PERSONA_ELIMINADA' using errcode = 'P0001',
      hint = 'Una persona eliminada del equipo no se reactiva ni se enlaza a una cuenta: se da de alta de nuevo con una ficha nueva.';
  end if;
  return new;
end;
$function$;

revoke all on function public.instructores_no_reactivar_eliminada() from public;
revoke all on function public.instructores_no_reactivar_eliminada() from anon;
revoke all on function public.instructores_no_reactivar_eliminada() from authenticated;
grant execute on function public.instructores_no_reactivar_eliminada() to service_role;

drop trigger if exists trg_instructores_no_reactivar_eliminada on public.instructores;
create trigger trg_instructores_no_reactivar_eliminada
  before update of activo, auth_user_id on public.instructores
  for each row execute function public.instructores_no_reactivar_eliminada();
