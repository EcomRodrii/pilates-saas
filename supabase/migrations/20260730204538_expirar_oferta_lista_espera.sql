-- Fase 2b: cancela la reserva cuya oferta de plaza caducó sin aceptar
-- (pierde el sitio entero, decisión de producto — no se reordena "al final
-- de la cola") y reutiliza promocionar_siguiente_espera para intentarlo con
-- la siguiente en la cola FIFO. Solo la llama el cron
-- (lib/inngest/lista-espera-ofertas.ts) vía service_role — sin sesión de
-- usuario detrás, sin guard de auth.uid() (mismo criterio que
-- resolver_reserva_pendiente/Fase 2a para el camino de expiración).
create or replace function public.expirar_oferta_lista_espera(p_studio_id text, p_reserva_id text)
 returns table(cancelada boolean, oferta_socio_id text, oferta_expira_en timestamptz)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_tipo_clase_id text;
  v_plazo int;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_promo_socio text;
begin
  update reservas
     set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
   where id = p_reserva_id and studio_id = p_studio_id and estado = 'LISTA_ESPERA'
     and oferta_expira_en is not null and oferta_expira_en <= now()
  returning sesion_id into v_sesion_id;

  if v_sesion_id is null then
    -- Ya resuelta (aceptada justo antes, o vuelta a llamar sobre la misma
    -- fila) — idempotente, sin efecto.
    return query select false, null::text, null::timestamptz;
    return;
  end if;

  select tipo_clase_id into v_tipo_clase_id from sesiones where id = v_sesion_id;
  select coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
    into v_plazo
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  select promovida_socio_id, oferta_socio_id, oferta_expira_en
    into v_promo_socio, v_oferta_socio, v_oferta_expira
    from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo);
  -- v_promo_socio (confirmación instantánea) solo puede darse si el plazo
  -- bajó a 0 entre medias — el caller TS mira oferta_socio_id para decidir
  -- qué notificar, igual que ejecutarCancelacionReserva con
  -- cancelar_reserva_plaza. Si en el futuro hace falta distinguir ese caso
  -- en el resultado, ampliar el RETURNS TABLE; no se necesita hoy.

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select true, v_oferta_socio, v_oferta_expira;
end;
$function$;

revoke all on function public.expirar_oferta_lista_espera(text, text) from public, anon, authenticated;
grant execute on function public.expirar_oferta_lista_espera(text, text) to service_role;
