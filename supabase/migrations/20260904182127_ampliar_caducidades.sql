-- Ampliar en lote la caducidad de bonos y recuperaciones.
--
-- El caso real (una propietaria de Almería, evaluando el cambio desde Timp):
-- «ampliar 7 días las recuperaciones de todos los alumnos por vacaciones,
-- festivos o cierre del centro». Hoy no había forma de hacerlo ni en lote ni
-- una a una: `dbUpdateSuscripcion` solo actualiza por id y ninguna pantalla
-- expone la fecha de caducidad como campo editable.
--
-- Va como RPC y no como N updates desde el navegador por dos motivos: es UNA
-- transacción (60 socias a medio ampliar es peor que no haber empezado) y la
-- aritmética es por fila (`fecha_fin + p_dias`), que PostgREST no sabe hacer
-- sin traerse las filas primero.
--
-- QUÉ TOCA Y QUÉ NO:
--  · Bonos (planes tipo BONO/PUNTUAL) con fecha de caducidad y aún vivos.
--  · Recuperaciones DISPONIBLE aún vivas.
--  · NO toca las cuotas MENSUALES: ahí `fecha_fin` marca el próximo cobro, y
--    moverla es mover una fecha de facturación. Si algún día se quiere
--    regalar una semana de cuota, eso es un cambio de dinero con su propio
--    diseño, no un efecto colateral de este botón.
--  · NO resucita lo ya caducado (`>= current_date`): la caducidad de una
--    recuperación es dinámica (viva = DISPONIBLE y caduca_el >= hoy), así que
--    sumarle días a una muerta la devolvería a la vida sin que nadie lo haya
--    pedido. Se amplía antes de cerrar, no después.
--
-- Guards: mismo patrón que `consumir_sesion_bono` (migr 20260902215304) —
-- STUDIO_MISMATCH + rol, ambos solo cuando hay `auth.uid()` para no romper a
-- los llamadores service-role. La cerradura es `puede_mover_dinero()`
-- (PROPIETARIO/RECEPCION, migr 0112) y no `puede_gestionar_calendario()`:
-- alargar la validez de un bono es regalar producto vendido, no gestionar la
-- agenda — MANAGER no debe poder hacerlo, igual que no puede cambiar un plan.

create or replace function public.ampliar_caducidades(
  p_studio_id text,
  p_socio_ids text[],
  p_dias integer
)
returns table (bonos_ampliados integer, recuperaciones_ampliadas integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bonos int := 0;
  v_recups int := 0;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if auth.uid() is not null and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Un tope alto pero real: 365 días. Sin él, un cero deja el botón mintiendo
  -- («ampliado») sin haber ampliado nada, y un número absurdo convierte un
  -- bono de 10 sesiones en vitalicio por una errata.
  if p_dias is null or p_dias < 1 or p_dias > 365 then
    raise exception 'DIAS_INVALIDOS';
  end if;

  if p_socio_ids is null or array_length(p_socio_ids, 1) is null then
    return query select 0, 0;
    return;
  end if;

  -- Todas las columnas van calificadas con alias: `RETURNS TABLE` expone
  -- `bonos_ampliados`/`recuperaciones_ampliadas` como variables dentro del
  -- cuerpo, y este repo ya se comió tres `42702: column reference is
  -- ambiguous` por no hacerlo (migr 20260731132000).
  with ampliados as (
    update public.suscripciones sus
       set fecha_fin = sus.fecha_fin + p_dias
      from public.planes_tarifa pt
     where pt.id = sus.plan_id
       and pt.studio_id = p_studio_id
       and pt.tipo in ('BONO', 'PUNTUAL')
       and sus.studio_id = p_studio_id
       and sus.socio_id = any(p_socio_ids)
       and sus.estado = 'ACTIVA'
       and sus.fecha_fin is not null
       and sus.fecha_fin >= current_date
    returning 1
  )
  select count(*)::int into v_bonos from ampliados;

  with ampliadas as (
    update public.recuperaciones rec
       set caduca_el = rec.caduca_el + p_dias
     where rec.studio_id = p_studio_id
       and rec.socio_id = any(p_socio_ids)
       and rec.estado = 'DISPONIBLE'
       and rec.caduca_el >= current_date
    returning 1
  )
  select count(*)::int into v_recups from ampliadas;

  return query select v_bonos, v_recups;
end;
$$;

comment on function public.ampliar_caducidades(text, text[], integer) is
  'Suma días a la caducidad de bonos vivos y recuperaciones DISPONIBLE de las socias dadas. No toca cuotas mensuales (su fecha_fin es la del próximo cobro) ni resucita lo ya caducado. Solo PROPIETARIO/RECEPCION.';

-- Grants: función NUEVA, así que nace con EXECUTE para PUBLIC y —por el
-- `pg_default_acl` de este proyecto— también DIRECTO para anon/authenticated.
-- Revocar PUBLIC no le quita nada a `anon`, que lo tiene por su cuenta: hay
-- que revocárselo explícitamente (ver la nota de grants en tentare-os.md).
revoke execute on function public.ampliar_caducidades(text, text[], integer) from public;
revoke execute on function public.ampliar_caducidades(text, text[], integer) from anon;
grant execute on function public.ampliar_caducidades(text, text[], integer) to authenticated, service_role;
