-- Auditoría 2026-09-19 · Las reservas estaban CAÍDAS en producción por tres
-- defectos encadenados. Los tres están reproducidos contra el motor, con su
-- SQLSTATE, antes de escribir esta migración:
--
--   1. `socio_tiene_entitlement_activo` lleva un `??` de JavaScript dentro de
--      SQL. `select public.socio_tiene_entitlement_activo('x','x','x',current_date)`
--      →  ERROR 42883: operator does not exist: integer ?? integer
--      Todo camino con `p_exigir_entitlement = true` (o sea, la reserva de la
--      propia alumna en cualquier estudio que exija plan) muere aquí.
--
--   2. Conviven DOS sobrecargas de `reservar_plaza` (8 y 9 parámetros, las dos
--      con defaults para todo salvo los cuatro primeros). Cualquier llamada que
--      no nombre `p_exigir_entitlement` encaja en las dos:
--      →  ERROR 42725: function reservar_plaza(...) is not unique
--      Eso tumba el camino de tras-pago y el del mostrador.
--
--   3. La migración 20260918000000 del repo declara una variante de DIEZ
--      parámetros (con `p_tipo_clase_id`) que NO es la que corre en producción
--      —la viva deriva el tipo de clase de la propia sesión, que además no se
--      puede falsear desde el llamante—. El TypeScript mandaba ese argumento
--      inexistente y PostgREST respondía PGRST202. Corregido en
--      `lib/db/supabase-data-admin.ts` en el mismo cambio que esta migración.
--
-- Esta migración deja UNA sola firma viva y replayable desde limpio.

-- ---------------------------------------------------------------------------
-- 1. `??` → `coalesce`. Mismo cuerpo, mismo `search_path`, misma semántica
--    pretendida (un bono sin sesiones registradas cuenta como cero).
-- ---------------------------------------------------------------------------
create or replace function public.socio_tiene_entitlement_activo(
  p_studio_id text, p_socio_id text, p_tipo_clase_id text,
  p_hoy date default current_date
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return exists (
    select 1
    from suscripciones s
    join planes_tarifa p on p.id = s.plan_id
    where s.studio_id = p_studio_id
      and s.socio_id = p_socio_id
      and s.estado = 'ACTIVA'
      and (s.fecha_fin is null or s.fecha_fin >= p_hoy)
      and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
      and (
        (p.tipo = 'MENSUAL')
        or (p.tipo in ('BONO', 'PUNTUAL') and coalesce(s.sesiones_restantes, 0) > 0)
      )
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Una sola firma de `reservar_plaza`.
--
--    Se borran la sobrecarga vieja de 8 parámetros (la que provoca el 42725) y,
--    defensivamente, la de 10 que declara 20260918000000 y que nunca llegó a
--    aplicarse: sin este `drop`, un `supabase db push` desde limpio
--    reintroduciría la ambigüedad por la otra punta.
--
--    Comprobado antes de borrar: ninguna función ni trigger de la base llama a
--    `reservar_plaza` (`pg_proc.prosrc ilike '%reservar_plaza%'` → 0 filas
--    aparte de ella misma), y en el repo solo hay tres llamadas, las tres con
--    service-role en `lib/db/supabase-data-admin.ts`.
-- ---------------------------------------------------------------------------
drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean);
drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text);

-- ---------------------------------------------------------------------------
-- 3. Restaurar el endurecimiento de RES-6, que 20260918000000 deshizo sin
--    quererlo.
--
--    20260916180227 revocó `authenticated` sobre `reservar_plaza` porque no
--    tiene ningún llamador cliente y un JWT de staff podía saltarse las guardas
--    de la ruta (`puedeApuntarEnClase` niega a INSTRUCTOR apuntar alumnas
--    ajenas; el guard interno de la RPC solo exige que la clase sea suya).
--    Aquel `revoke` apuntaba a la firma de 8 parámetros; al crear la de 9,
--    Postgres creó un objeto nuevo y 20260918000000 le hizo un `grant execute
--    ... to authenticated` explícito. El agujero volvió a abrirse.
--
--    Verificar tras aplicar con has_function_privilege para los tres roles.
-- ---------------------------------------------------------------------------
revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean) to service_role, postgres;

revoke execute on function public.socio_tiene_entitlement_activo(text, text, text, date) from public, anon;
grant execute on function public.socio_tiene_entitlement_activo(text, text, text, date) to authenticated, service_role, postgres;
