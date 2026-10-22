-- Un ID de proveedor (y un ID de ubicación) de Urban Sports Club pertenece a UN
-- solo estudio de Tentare.
--
-- ⚠️ PENDIENTE DE APLICAR EN PRODUCCIÓN: escrita y NO aplicada (USC aún no nos
-- ha dado credenciales y nada está encendido). Aplicar antes de activar USC.
-- Solo aditiva: dos índices nuevos, nada existente cambia. Si ya hubiera dos
-- estudios con el mismo ID, la migración se para con un mensaje y no toca
-- nada: hay que resolverlo a mano antes (la comprobación solo cuenta, no
-- imprime ids de nadie).
--
-- El servidor ya lo comprueba antes de guardar (PUT /api/integrations/config);
-- estos índices son el candado real frente a dos guardados a la vez. Los IDs se
-- comparan sin mayúsculas ni espacios. Una fila que ya no tiene ID (vuelta a
-- manual SIN IDs) no cuenta; una en modo manual CON IDs sí, porque el cron los
-- necesita para cancelar lo publicado.
--
-- Sin política ni GRANT nuevos: índices sobre `integraciones`, que ya solo
-- escribe el servidor (migr 20260930110315).

do $$
begin
  if exists (
    select 1 from public.integraciones
     where tipo = 'URBAN_SPORTS_CLUB' and coalesce(btrim(config->>'providerId'), '') <> ''
     group by lower(btrim(config->>'providerId')) having count(*) > 1
  ) then
    raise exception 'integraciones: hay un providerId de USC repetido entre estudios; resolverlo antes de aplicar';
  end if;
  if exists (
    select 1 from public.integraciones
     where tipo = 'URBAN_SPORTS_CLUB' and coalesce(btrim(config->>'locationId'), '') <> ''
     group by lower(btrim(config->>'locationId')) having count(*) > 1
  ) then
    raise exception 'integraciones: hay un locationId de USC repetido entre estudios; resolverlo antes de aplicar';
  end if;
end $$;

create unique index if not exists integraciones_usc_provider_id_key
  on public.integraciones ((lower(btrim(config->>'providerId'))))
  where tipo = 'URBAN_SPORTS_CLUB' and coalesce(btrim(config->>'providerId'), '') <> '';

create unique index if not exists integraciones_usc_location_id_key
  on public.integraciones ((lower(btrim(config->>'locationId'))))
  where tipo = 'URBAN_SPORTS_CLUB' and coalesce(btrim(config->>'locationId'), '') <> '';

do $$
begin
  if (select count(*) from pg_indexes
       where schemaname = 'public' and tablename = 'integraciones'
         and indexname in ('integraciones_usc_provider_id_key', 'integraciones_usc_location_id_key')) <> 2 then
    raise exception 'integraciones: faltan los índices únicos de USC';
  end if;
end $$;
