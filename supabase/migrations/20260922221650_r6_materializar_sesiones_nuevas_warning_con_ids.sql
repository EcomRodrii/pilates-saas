-- R-6 (auditoría 22-sep): el fallo al materializar plazas fijas para
-- sesiones RECIÉN CREADAS se traga en un `raise warning` sin más detalle que
-- el mensaje de Postgres — mitigado en la práctica porque el barrido de la
-- noche (`materializarPlazasFijas`, con Sentry en su propio camino de error)
-- reintenta todo lo que entre en su horizonte, así que la ventana de un fallo
-- real es de horas, no permanente. Lo único que faltaba: el warning no
-- llevaba QUÉ sesiones fallaron, así que si alguien SÍ mira los logs de
-- Postgres no puede cruzar directamente contra ellas sin adivinar.
--
-- Cambio puramente aditivo: mismo mecanismo (raise warning, mismo
-- try/exception, mismo trigger), solo se añade `v_ids` al mensaje.

create or replace function public.materializar_plazas_fijas_sesiones_nuevas()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids text[];
begin
  select coalesce(array_agg(n.id), '{}') into v_ids
  from nuevas n
  where n.sala_id is not null and coalesce(n.cancelada, false) = false
    and exists (
      select 1 from plazas_fijas pf
      where pf.estado = 'ACTIVA' and pf.studio_id = n.studio_id and pf.sala_id = n.sala_id
    );

  if array_length(v_ids, 1) is null then
    return null;
  end if;

  begin
    perform public.materializar_plazas_fijas_interno(180, null, v_ids);
  exception when others then
    -- R-6 (auditoría 22-sep): el mensaje no llevaba QUÉ sesiones fallaron —
    -- útil solo si alguien mira los logs de Postgres sabiendo ya qué buscar.
    -- Con los ids, el barrido de la noche (o quien mire) puede cruzar
    -- directamente contra esas sesiones sin adivinar.
    raise warning 'materializar_plazas_fijas_sesiones_nuevas: % (%) sesiones=%', sqlerrm, sqlstate, v_ids;
  end;

  return null;
end;
$function$;

-- El contrato de este repo exige que TODA migración que redefina una función
-- SECURITY DEFINER decida por escrito sobre anon EN LA MISMA migración
-- (lib/rgpd-grants-anon-guardias-contrato.test.ts) — la firma no cambia,
-- pero se restata igual (redundante con lo que ya tenía; repetido otra vez
-- en la siguiente migración, defensa en profundidad).
revoke all on function public.materializar_plazas_fijas_sesiones_nuevas() from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas_sesiones_nuevas() to service_role;
