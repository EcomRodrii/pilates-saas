-- Fase 2b: la socia acepta la oferta de plaza dentro de su plazo. A
-- diferencia de cancelar_reserva_plaza (donde p_socio_id puede venir null
-- para llamadas del sistema), aceptar es SIEMPRE la propia socia con sesión
-- iniciada (decisión de producto: sin enlace mágico sin login) — nunca el
-- sistema ni el panel en su nombre, así que no hay bypass de socio null.
--
-- No hace falta recomprobar aforo: mientras la oferta está viva la reserva
-- sigue en LISTA_ESPERA, que nunca cuenta para aforo_efectivo() — el hueco
-- sigue "reservado" para ella igual que durante la confirmación instantánea
-- de hoy. El bono se consume en TS al confirmar el éxito de esta RPC (mismo
-- patrón que resolver_reserva_pendiente/Fase 2a), no aquí.
create or replace function public.aceptar_oferta_lista_espera(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(estado text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_res_socio text;
  v_expira timestamptz;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  select sesion_id, socio_id, oferta_expira_en into v_sesion_id, v_res_socio, v_expira
    from reservas where id = p_reserva_id and studio_id = p_studio_id and estado = 'LISTA_ESPERA'
    for update;
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  if v_res_socio is distinct from p_socio_id then raise exception 'NO_AUTORIZADO'; end if;
  if v_expira is null then raise exception 'SIN_OFERTA_ACTIVA'; end if;
  if now() > v_expira then raise exception 'OFERTA_CADUCADA'; end if;

  update reservas set estado = 'CONFIRMADA', posicion_espera = null, oferta_expira_en = null
    where id = p_reserva_id;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select 'CONFIRMADA'::text;
end;
$function$;

revoke all on function public.aceptar_oferta_lista_espera(text, text, text) from public, anon;
grant execute on function public.aceptar_oferta_lista_espera(text, text, text) to authenticated, service_role;
