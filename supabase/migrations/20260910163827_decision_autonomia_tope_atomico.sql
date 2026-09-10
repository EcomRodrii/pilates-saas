-- 20260910150000 · TENTARE — el tope diario del piloto automático se aprueba de forma atómica
--
-- 52ª pasada de auditoría (2026-09-10), hallazgo H2. El tope diario de
-- auto-ejecuciones (studios.decision_autonomia_config → dbCountAutonomasHoy +
-- seleccionarAutonomas, lib/inngest/decision.ts) se leía UNA vez por
-- invocación del cron, y cada aprobación individual ya era compare-and-set
-- (UPDATE ... WHERE estado = 'PENDIENTE'), pero el CONTEO usado para decidir
-- CUÁNTAS aprobar no lo era. Dos invocaciones casi simultáneas (el cron y un
-- "Analizar ahora" manual solapado, o un reintento de Inngest) podían leer
-- el mismo recuento de "ya hechas hoy" antes de que ninguna hubiera escrito
-- nada, y cada una aprobar hasta su propio cupo calculado — superando el
-- tope configurado hasta el doble. Acotado por MAX_DIARIO_TOPE=50 (nunca
-- ilimitado), pero es un freno best-effort, no una garantía de BD.
--
-- Esta función mueve el conteo+aprobación de UNA recomendación a una sola
-- transacción con un advisory lock por estudio+día: cada aprobación
-- individual vuelve a contar en caliente antes de decidir, así que aunque
-- dos invocaciones ataquen la misma recomendación o estudio a la vez, se
-- serializan por el lock y ninguna ve un conteo obsoleto. La ordenación por
-- score (qué recomendaciones intentar primero) sigue siendo cosa de
-- seleccionarAutonomas() en TS — esta función solo decide, para UNA
-- recomendación concreta, si todavía hay cupo de verdad en el momento de
-- aprobarla.

create or replace function public.aprobar_recomendacion_autonoma(
  p_id text, p_studio_id text, p_max_diario integer
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_hoy_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':autonomia:' || current_date::text));

  select count(*) into v_hoy_count
    from recomendaciones
   where studio_id = p_studio_id
     and resuelto_por = 'AUTONOMIA'
     and resuelto_en >= date_trunc('day', now() at time zone 'utc');

  if v_hoy_count >= p_max_diario then
    return 'TOPE';
  end if;

  update recomendaciones
     set estado = 'APROBADA', resuelto_por = 'AUTONOMIA', resuelto_en = now()
   where id = p_id and studio_id = p_studio_id and estado = 'PENDIENTE';

  if not found then
    return 'YA_RESUELTA';
  end if;

  return 'APROBADA';
end;
$$;

comment on function public.aprobar_recomendacion_autonoma(text, text, integer) is
  'Piloto automático del Decision OS: aprueba UNA recomendación PENDIENTE como AUTONOMIA solo si el tope diario del estudio, recontado en caliente bajo un advisory lock por estudio+día, todavía no se ha alcanzado. Devuelve APROBADA / TOPE / YA_RESUELTA. Solo service_role — la llama el cron (lib/inngest/decision.ts), nunca el navegador.';

revoke all on function public.aprobar_recomendacion_autonoma(text, text, integer) from public, anon, authenticated;
grant execute on function public.aprobar_recomendacion_autonoma(text, text, integer) to service_role;
