-- Fix: la condición original excluía el corte automático por riesgo de
-- plantón comprobando `p_socio_id is not null` — pero ESE NO ES el único
-- caller que pasa `p_socio_id: null`. El panel de staff (dbCancelarReservaPlaza,
-- lib/supabase-data.ts:2206) TAMBIÉN pasa null (la recepción cancela en
-- nombre de la socia sin pasar su id) — con la condición original, ninguna
-- cancelación desde el panel habría generado nunca una penalización, que es
-- justo el camino MÁS habitual de "la socia llama y cancela tarde". Detectado
-- en la verificación en vivo con ROLLBACK antes de tocar el resto de capas.
--
-- Fix real: parámetro de entrada explícito `p_omitir_penalizacion`, con
-- DEFAULT false para no romper ningún caller existente (portal, panel — ambos
-- SIGUEN aplicando penalización si la cancelación es tardía). Solo
-- confirmacion-riesgo.ts (corte automático, nadie pulsó "cancelar") lo pasará
-- en true explícitamente.
drop function if exists public.cancelar_reserva_plaza(text, text, text);

create or replace function public.cancelar_reserva_plaza(
  p_studio_id text, p_reserva_id text, p_socio_id text,
  p_omitir_penalizacion boolean default false
) returns table(
   era_confirmada boolean,
   promovida_socio_id text,
   devolver_bono boolean,
   oferta_socio_id text,
   oferta_expira_en timestamptz,
   penalizacion_id text
 )
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_instructor_id text;
  v_promo_socio text;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
  v_devolver_tardia boolean;
  v_tardia boolean;
  v_devolver boolean;
  v_plazo_espera int;
  v_penalizacion_importe numeric;
  v_penalizacion_aplica boolean;
  v_penalizacion_id text;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select sesion_id, estado, socio_id into v_sesion_id, v_estado, v_res_socio
    from reservas where id = p_reserva_id and studio_id = p_studio_id
    for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if p_socio_id is not null and v_res_socio is distinct from p_socio_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    select instructor_id into v_instructor_id from sesiones where id = v_sesion_id;
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_estado = 'CANCELADA' then
    return query select false, null::text, false, null::text, null::timestamptz, null::text;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id for update;

  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = v_sesion_id;
  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas),
         coalesce(st.cancelacion_devolver_bono_tardia, false),
         coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos),
         coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur),
         coalesce(st.penalizacion_aplica_cancelacion_tardia, true)
    into v_ventana, v_devolver_tardia, v_plazo_espera, v_penalizacion_importe, v_penalizacion_aplica
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  v_tardia := coalesce(v_ventana, 0) > 0
              and now() >= v_inicio - make_interval(hours => v_ventana);
  v_devolver := v_devolver_tardia or not v_tardia;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') and v_tardia and v_penalizacion_aplica
     and not p_omitir_penalizacion
     and v_penalizacion_importe is not null and v_penalizacion_importe > 0 then
    insert into penalizaciones (id, studio_id, socio_id, reserva_id, tipo, importe, estado)
      values ('pen-' || gen_random_uuid()::text, p_studio_id, v_res_socio, p_reserva_id, 'CANCELACION_TARDIA', v_penalizacion_importe, 'DETECTADA')
      on conflict (reserva_id, tipo) do nothing
      returning id into v_penalizacion_id;
  end if;

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
      into v_promo_socio, v_oferta_socio, v_oferta_expira
      from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo_espera) as pse;
  end if;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio, v_devolver, v_oferta_socio, v_oferta_expira, v_penalizacion_id;
end;
$function$;

revoke all on function public.cancelar_reserva_plaza(text, text, text, boolean) from public, anon;
grant execute on function public.cancelar_reserva_plaza(text, text, text, boolean) to authenticated, service_role;
