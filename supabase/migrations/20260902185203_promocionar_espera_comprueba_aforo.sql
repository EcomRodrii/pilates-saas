-- Auditoría 21ª pasada (2-sep-2026), P-2 + P-5 — mismo motivo del audit para
-- hacerlas juntas: tocan la misma familia de funciones.
--
-- P-2 (🔴): `promocionar_siguiente_espera` NO comprobaba aforo antes de
-- confirmar directamente cuando `p_plazo_minutos <= 0` (que es SIEMPRE hoy —
-- los 10 estudios tienen `lista_espera_plazo_aceptacion_minutos = 0`, la
-- lista de espera CON oferta está inerte en producción). Su gemela
-- `aceptar_oferta_lista_espera` sí comprueba aforo desde C-4
-- (20260817223000_aceptar_oferta_comprueba_aforo.sql) — aquí faltaba el
-- mismo candado. Si dos huecos se liberan casi a la vez y esta función se
-- invoca dos veces sobre la misma sesión antes de que la primera confirmación
-- se refleje en el recuento, la segunda podía confirmar por encima del aforo.
-- Se añade el mismo cálculo que ya usa `aceptar_oferta_lista_espera`
-- (`aforo_efectivo` + recuento de CONFIRMADA/ASISTIDA) justo antes de
-- confirmar. Si ya no hay hueco, no se confirma — la reserva se queda en
-- LISTA_ESPERA (misma fila, sin oferta activa) para el próximo intento, en
-- vez de lanzar una excepción que revertiría al llamador (mismo criterio que
-- el resto de esta función: devolver null en vez de raise).
--
-- P-5 (🟠): `expirar_oferta_lista_espera` ya capturaba `promovida_socio_id`
-- de `promocionar_siguiente_espera` (la rama de confirmación directa) en una
-- variable local, pero su `RETURNS TABLE` nunca la incluía — se perdía en
-- silencio. El llamador TS (`expirarOfertaListaEspera`,
-- lib/db/supabase-data-admin.ts) solo sabe reaccionar a `oferta_socio_id`
-- (la rama de OFERTA); la rama de CONFIRMACIÓN directa dejaba a la socia
-- promovida sin bono consumido (el consumo vive en TS, no en la RPC — mismo
-- criterio que `aceptarOfertaListaEspera`/`resolverReservaPendiente`) y sin
-- ninguna notificación. Se añade `promovida_socio_id` al `RETURNS TABLE`.
--
-- El cambio de return type de `expirar_oferta_lista_espera` no es
-- reemplazable con CREATE OR REPLACE (Postgres exige DROP primero) — y un
-- DROP+CREATE resetea el grant a PUBLIC por defecto (gotcha ya documentado
-- varias veces en este repo). Se revoca explícito y se re-otorga solo a
-- service_role, verificado después con has_function_privilege.

create or replace function public.promocionar_siguiente_espera(
  p_studio_id text, p_sesion_id text, p_plazo_minutos int
) returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamptz)
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id text; v_socio text; v_expira timestamptz;
  v_aforo int; v_ocupadas int;
begin
  -- Clase viva = existe, no cancelada y todavía no ha empezado. Si no lo está,
  -- no hay nadie a quien promocionar: se devuelve la fila vacía que el llamador
  -- ya sabe interpretar (mismo contrato que "no había nadie en la cola").
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  select r.id, r.socio_id into v_id, v_socio from reservas as r
   where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
   order by r.creado_en asc, r.id asc limit 1 for update;
  if not found then return query select null::text, null::text, null::timestamptz; return; end if;

  if coalesce(p_plazo_minutos,0) <= 0 then
    -- P-2: mismo cálculo que aceptar_oferta_lista_espera antes de confirmar
    -- de verdad. Sin oferta de por medio no hay ventana en la que otra
    -- reserva compita por el mismo hueco, pero dos llamadas casi simultáneas
    -- a esta función sobre la misma sesión sí podían confirmar dos veces el
    -- mismo hueco liberado.
    v_aforo := aforo_efectivo(p_sesion_id);
    select count(*) into v_ocupadas from reservas as r
     where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
    if v_aforo is not null and v_ocupadas >= v_aforo then
      return query select null::text, null::text, null::timestamptz;
      return;
    end if;
    update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id=v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id=v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end; $$;

drop function if exists public.expirar_oferta_lista_espera(text, text);

create function public.expirar_oferta_lista_espera(p_studio_id text, p_reserva_id text)
returns table(cancelada boolean, oferta_socio_id text, oferta_expira_en timestamptz, promovida_socio_id text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sesion_id text;
  v_tipo_clase_id text;
  v_plazo int;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_promo_socio text;
begin
  update reservas as r
     set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA'
     and r.oferta_expira_en is not null and r.oferta_expira_en <= now()
  returning r.sesion_id into v_sesion_id;

  if v_sesion_id is null then
    return query select false, null::text, null::timestamptz, null::text;
    return;
  end if;

  select tipo_clase_id into v_tipo_clase_id from sesiones where id = v_sesion_id;
  select coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
    into v_plazo
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
    into v_promo_socio, v_oferta_socio, v_oferta_expira
    from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo) as pse;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select true, v_oferta_socio, v_oferta_expira, v_promo_socio;
end;
$$;

revoke all on function public.expirar_oferta_lista_espera(text, text) from public, anon, authenticated;
grant execute on function public.expirar_oferta_lista_espera(text, text) to service_role;
