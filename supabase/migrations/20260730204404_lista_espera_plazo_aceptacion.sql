-- Fase 2b (segunda pieza de "Fase 2" tras la aprobación manual, PR #570):
-- plazo para aceptar una plaza de lista de espera. Hoy `cancelar_reserva_plaza`
-- promociona INSTANTÁNEAMENTE a la primera persona en LISTA_ESPERA a
-- CONFIRMADA. Con esta regla activa, en vez de confirmar sola, se le abre una
-- "oferta" con un plazo — si no la acepta a tiempo, pierde el sitio
-- (CANCELADA, no se reordena) y se ofrece a la siguiente.
--
-- Mismo patrón override que reserva_ventana_minima_minutos/permite_lista_espera
-- (20260730152516): studios.<campo> NOT NULL DEFAULT + tipos_clase.<campo>
-- nullable = hereda. La diferencia aquí es que el override se resuelve en SQL
-- DIRECTO dentro de la RPC (como ventana_cancelacion_horas), NO con
-- heredaOverride() en TS — porque cancelar_reserva_plaza es ejecutable
-- directamente por `authenticated` desde el cliente (dbCancelarReservaPlaza,
-- lib/supabase-data.ts), sin pasar nunca por la capa TS que resuelve
-- cargarPoliticaEstudio/cargarReglasReservaTipoClase.
alter table studios add column if not exists lista_espera_plazo_aceptacion_minutos integer not null default 0;
-- 0 = comportamiento actual (confirmación instantánea), sin cambios para
-- nadie que no active la regla.

alter table tipos_clase add column if not exists lista_espera_plazo_aceptacion_minutos integer; -- null = hereda

comment on column studios.lista_espera_plazo_aceptacion_minutos is
  'Minutos que tiene una socia para aceptar una plaza liberada antes de que se ofrezca a la siguiente en la cola. 0 = confirmación instantánea (comportamiento clásico).';
comment on column tipos_clase.lista_espera_plazo_aceptacion_minutos is
  'NULL = hereda studios.lista_espera_plazo_aceptacion_minutos.';

-- reservas: metadata de "oferta viva", NO estado nuevo — mismo principio que
-- 0059_confirmacion_riesgo_planton (no tocar las ~16 comprobaciones de
-- estado repartidas por el repo). La reserva sigue en LISTA_ESPERA;
-- oferta_expira_en no nulo = "le toca a ella, tiene hasta esa hora". Si
-- caduca sin aceptar, pierde el sitio entero (decisión de producto): pasa a
-- CANCELADA, no se reordena "al final de la cola".
alter table reservas add column if not exists oferta_expira_en timestamptz;

comment on column reservas.oferta_expira_en is
  'Si no es NULL y estado=LISTA_ESPERA: oferta de plaza viva hasta esta hora. NULL = en cola normal, sin oferta activa.';

create index if not exists idx_reservas_oferta_viva on public.reservas (sesion_id)
  where oferta_expira_en is not null and estado = 'LISTA_ESPERA';

-- Helper compartido: coge la cabeza de la cola FIFO (creado_en asc, mismo
-- criterio que 0104_lista_espera_fifo_renumera) y o bien la confirma
-- instantánea (plazo<=0, comportamiento clásico) o bien le abre una oferta
-- con plazo. Reutilizado por cancelar_reserva_plaza (al liberarse un hueco) y
-- por expirar_oferta_lista_espera (al caducar una oferta, para intentarlo con
-- la siguiente). SECURITY INVOKER: nunca se expone directo a
-- authenticated/anon, solo se llama desde dentro de otras RPC SECURITY
-- DEFINER que ya han hecho sus propias comprobaciones — hereda su rol
-- elevado, mismo patrón que aforo_efectivo/validar_studio_mismatch hoy.
create or replace function public.promocionar_siguiente_espera(
  p_studio_id text, p_sesion_id text, p_plazo_minutos int
) returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamptz)
 language plpgsql
 security invoker
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id text;
  v_socio text;
  v_expira timestamptz;
begin
  select id, socio_id into v_id, v_socio
    from reservas
   where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA'
   order by creado_en asc, id asc
   limit 1 for update;

  if not found then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  if coalesce(p_plazo_minutos, 0) <= 0 then
    update reservas set estado = 'CONFIRMADA', posicion_espera = null, oferta_expira_en = null
      where id = v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id = v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end;
$function$;

revoke all on function public.promocionar_siguiente_espera(text, text, int) from public, anon, authenticated;
grant execute on function public.promocionar_siguiente_espera(text, text, int) to service_role;
