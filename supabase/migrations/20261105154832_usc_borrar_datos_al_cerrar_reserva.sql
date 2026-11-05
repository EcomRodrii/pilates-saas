-- Urban Sports Club: los datos de la persona se borran cuando su reserva se
-- cierra sin asistencia.
--
-- APLICADA EN PRODUCCIÓN el 5-nov-2026 (versión 20261105154832).
--
-- Por qué: el contrato con USC (anexo 1, encargo de tratamiento de datos) obliga
-- a borrar «sin demora» el nombre y el identificador de la persona cuando la
-- reserva se cancela o la persona no asiste, y a que no queden accesibles para
-- el estudio. USC es el responsable del dato; nosotros, encargados.
--
-- Qué hace: un trigger BEFORE UPDATE OF estado sobre `reservas`. Si una reserva
-- de origen URBAN_SPORTS_CLUB pasa a CANCELADA o NO_ASISTIO:
--   · nombre_externo     → 'Persona eliminada' (el CHECK reservas_origen_coherente
--     exige un nombre de 1 a 200 caracteres en toda reserva externa; es el mismo
--     texto que usa la purga de un estudio, 20261007143246).
--   · id_cliente_externo → null.
--   · id_reserva_externa se queda: es la referencia de la RESERVA en USC (no de
--     la persona) y la necesitan sus webhooks y la conciliación.
-- Una reserva ASISTIDA conserva sus datos (la asistencia es lo que el estudio
-- registra). ClassPass y Wellhub no se tocan: su contrato es otro.
--
-- Por qué en la base de datos y no en el código: cubre TODOS los caminos que
-- cierran una reserva (webhook de USC, recepción, cancelación de la clase,
-- barrido de no-shows) sin que ninguno tenga que acordarse.
--
-- ⚠️ El NOMBRE del trigger importa: los BEFORE disparan por orden alfabético y
-- `trg_congelar_origen_reserva` prohíbe a quien no es servidor cambiar estos
-- campos. Este se llama `trg_zz_…` para disparar DESPUÉS de ese candado, que así
-- ve la fila sin tocar y la deja pasar; el candado no se ha modificado. Lo fija
-- lib/plataformas/usc/borrado-al-cerrar-contrato.test.ts.
--
-- Medido en producción el 5-nov: 0 reservas externas. Probado en una transacción
-- deshecha con cuatro filas (USC cancelada, USC no asistió, USC asistida y
-- ClassPass cancelada): solo las dos primeras quedaron borradas.

create or replace function public.anonimizar_externa_al_cerrar()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.origen = 'URBAN_SPORTS_CLUB'
     and new.estado in ('CANCELADA', 'NO_ASISTIO')
     and (new.nombre_externo is distinct from 'Persona eliminada' or new.id_cliente_externo is not null) then
    new.nombre_externo := 'Persona eliminada';
    new.id_cliente_externo := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_zz_anonimizar_externa_al_cerrar on public.reservas;
create trigger trg_zz_anonimizar_externa_al_cerrar
  before update of estado on public.reservas
  for each row execute function public.anonimizar_externa_al_cerrar();

-- Función de trigger: nadie la llama directamente.
revoke all on function public.anonimizar_externa_al_cerrar() from public, anon, authenticated;
grant execute on function public.anonimizar_externa_al_cerrar() to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.anonimizar_externa_al_cerrar()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.anonimizar_externa_al_cerrar()', 'EXECUTE') then
    raise exception 'anonimizar_externa_al_cerrar: permisos distintos de lo previsto';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_zz_anonimizar_externa_al_cerrar' and tgrelid = 'public.reservas'::regclass) then
    raise exception 'falta el trigger trg_zz_anonimizar_externa_al_cerrar';
  end if;
end $$;
