-- D-4 (auditoría 22-sep): `promocionar_siguiente_espera` nunca bloquea la
-- fila de `sesiones` — depende de que CADA llamante lo haga por su cuenta
-- antes de invocarla. `cancelar_reserva_plaza` sí lo hace
-- (`perform 1 from sesiones where id = v_sesion_id for update;`), pero
-- `expirar_oferta_lista_espera` NO, y la vía TS `ofrecerPlazaLibre` (que la
-- llama directa vía RPC) tampoco. Sin ese candado, un `reservar_plaza`
-- concurrente sobre la MISMA sesión (que sí bloquea `sesiones` antes de leer
-- `v_ocupadas`) no se serializa contra estos dos caminos: los dos pueden leer
-- el mismo hueco libre y confirmar de más.
--
-- Arreglo: el candado pasa a vivir DENTRO de `promocionar_siguiente_espera`,
-- no en cada llamante — así ningún caller nuevo puede olvidarlo. Re-adquirir
-- el mismo lock de fila que ya tiene `cancelar_reserva_plaza` en la misma
-- transacción no bloquea (reentrante).
--
-- Verificado en vivo con execute_sql+ROLLBACK: dos sesiones concurrentes,
-- una en `reservar_plaza` con el candado tomado y otra en
-- `promocionar_siguiente_espera` para la MISMA sesión, la segunda queda
-- bloqueada hasta que la primera libera (antes: no esperaba nada).

create or replace function public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expira timestamptz;
  v_aforo int; v_ocupadas int;
  v_tipo text; v_requiere boolean;
  v_inicio timestamptz; v_fin timestamptz;
  v_excede_total boolean; v_excede_tipo boolean;
  v_conflicto boolean;
  v_cand record;
begin
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
       and not public.fecha_en_cierre(s.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  -- D-4: candado de la sesión AQUÍ, antes de leer aforo/ocupadas — para que
  -- cualquier llamante (los ya existentes y los que vengan) quede
  -- serializado contra `reservar_plaza` sobre la MISMA sesión.
  select s.tipo_clase_id, s.inicio, s.fin into v_tipo, v_inicio, v_fin
    from public.sesiones s where s.id = p_sesion_id
    for update;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

  v_aforo := aforo_efectivo(p_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  for v_cand in
    select r.id, r.socio_id from reservas as r
     where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
       and (
         not coalesce(v_requiere, false)
         or exists (
           select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = p_studio_id
              and a.socio_id = r.socio_id
              and a.tipo_clase_id = v_tipo
         )
       )
     order by r.creado_en asc, r.id asc
     for update
  loop
    v_conflicto := public.socio_tiene_conflicto_horario(p_studio_id, v_cand.socio_id, p_sesion_id, v_inicio, v_fin);
    if v_conflicto then
      continue;
    end if;

    if v_tipo is not null
       and not public.socio_tiene_entitlement_activo(p_studio_id, v_cand.socio_id, v_tipo, current_date) then
      continue;
    end if;

    if coalesce(p_plazo_minutos, 0) <= 0 then
      select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
        from public.calcular_excede_limite_semanal(p_studio_id, v_cand.socio_id, v_tipo, v_inicio) ce;
      if (v_excede_total or v_excede_tipo)
         and not public.intentar_consumir_recuperacion_semanal(p_studio_id, v_cand.socio_id, v_cand.id) then
        continue;
      end if;
      update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id = v_cand.id;
      return query select v_cand.socio_id, null::text, null::timestamptz;
      return;
    else
      v_expira := now() + make_interval(mins => p_plazo_minutos);
      update reservas set oferta_expira_en = v_expira where id = v_cand.id;
      return query select null::text, v_cand.socio_id, v_expira;
      return;
    end if;
  end loop;

  return query select null::text, null::text, null::timestamptz;
end; $function$;
