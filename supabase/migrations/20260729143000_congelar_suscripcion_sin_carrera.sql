-- congelar_suscripcion comprobaba "existe una congelación activa" y luego
-- insertaba en dos pasos separados (TOCTOU): dos peticiones simultáneas (doble
-- clic, o staff + automatización) podían pasar ambas el EXISTS y crear DOS
-- congelaciones activas para la misma suscripción. Eso no rompía el freeze en
-- sí, pero descongelar_suscripcion hace un UPDATE ... RETURNING ... INTO sobre
-- esas filas: con más de una fila afectada, Postgres lanza CARDINALITY_VIOLATION
-- y la función entera falla — la suscripción se queda PAUSADA para siempre
-- porque nunca llega a la segunda mitad (reactivarla).
--
-- Fix: índice único parcial que hace imposible tener dos congelaciones activas
-- a la vez para la misma suscripción, y la función atrapa la unique_violation
-- como no-op (mismo comportamiento que el EXISTS de antes, pero sin la carrera).

create unique index if not exists uq_congelacion_activa_por_suscripcion
  on congelaciones (suscripcion_id)
  where hasta is null;

create or replace function public.congelar_suscripcion(p_id text, p_suscripcion_id text, p_studio_id text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  begin
    insert into congelaciones (id, studio_id, suscripcion_id, desde, motivo)
      values (p_id, p_studio_id, p_suscripcion_id, current_date, p_motivo);
  exception when unique_violation then
    return;
  end;

  update suscripciones set estado = 'PAUSADA'
    where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'ACTIVA';
end;
$function$;
