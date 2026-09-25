-- CANCEL-1 (auditoría 25-sep): la devolución del bono al cancelar es multi-paso
-- (TypeScript, después del commit de `cancelar_reserva_plaza`) y NO tenía barrido
-- reparador, al contrario que el consumo (D-5, `reparar-bono-sin-decidir`).
--
-- Un barrido ingenuo de «canceladas con bono y sin `bono_devuelto_en`» habría
-- devuelto también las cancelaciones TARDÍAS, que la política del estudio no
-- devuelve a propósito. Lo que faltaba era saber que la devolución PROCEDÍA:
-- `bono_devolucion_debida_en` la marca `cancelar_reserva_plaza`, en la misma
-- transacción, solo cuando `v_devolver` es verdadero.
--
-- El barrido (`reparar_devoluciones_bono`, pg_cron cada 15 min, en SQL puro sin
-- ruta ni Inngest) llama a `devolver_sesion_bono_por_reserva`, que ya es
-- idempotente por reserva (`bono_devuelto_en`). Solo reservas RASTREADAS: en una
-- legada no se sabe de qué bono salió y la elige el TypeScript.
--
-- `cancelar_reserva_plaza` se recrea IDÉNTICA a la definición vigente (migr
-- 20260922225815, R-8) salvo ese UPDATE, y con los mismos grants: solo servidor.

alter table public.reservas add column if not exists bono_devolucion_debida_en timestamptz;
comment on column public.reservas.bono_devolucion_debida_en is
  'La cancelación concedía devolver el bono (política) y la reserva había consumido uno rastreado. Lo escribe cancelar_reserva_plaza; reparar_devoluciones_bono lo reintenta si bono_devuelto_en sigue vacío.';
create index if not exists reservas_devolucion_bono_debida_idx
  on public.reservas (bono_devolucion_debida_en) where bono_devolucion_debida_en is not null;

create or replace function public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text, p_omitir_penalizacion boolean default false)
 returns table(era_confirmada boolean, promovida_socio_id text, devolver_bono boolean, oferta_socio_id text, oferta_expira_en timestamp with time zone, penalizacion_id text)
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
  v_tenia_oferta boolean;
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
  if not public.es_llamada_servicio() and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select reservas.sesion_id, reservas.estado, reservas.socio_id,
         (reservas.oferta_expira_en is not null)
    into v_sesion_id, v_estado, v_res_socio, v_tenia_oferta
    from reservas where reservas.id = p_reserva_id and reservas.studio_id = p_studio_id
    for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if p_socio_id is not null and v_res_socio is distinct from p_socio_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not public.es_llamada_servicio() and public.current_rol() = 'INSTRUCTOR' then
    -- R-8: defensa en profundidad, mismo motivo que las dos de abajo.
    select instructor_id into v_instructor_id from sesiones where id = v_sesion_id and studio_id = p_studio_id;
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_estado = 'CANCELADA' then
    return query select false, null::text, false, null::text, null::timestamptz, null::text;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id and studio_id = p_studio_id for update;

  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = v_sesion_id and ss.studio_id = p_studio_id;
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

  -- CANCEL-1 (auditoría 25-sep): la devolución del bono vive en TypeScript, DESPUÉS
  -- de este commit. Si el proceso muere en medio, la socia pierde la sesión en
  -- silencio, y no había forma de distinguir «no se devolvió porque la política no
  -- la concede» (cancelación tardía) de «debía devolverse y no se hizo». Aquí, en la
  -- MISMA transacción que cancela, se deja constancia de que la devolución PROCEDE
  -- (política que la concede + reserva que consumió un bono rastreado);
  -- `reparar_devoluciones_bono()` la reintenta si `bono_devuelto_en` sigue vacío.
  update reservas set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null,
         bono_devolucion_debida_en = case
           when v_devolver and v_estado in ('CONFIRMADA', 'ASISTIDA')
                and bono_consumo_rastreado is true and bono_suscripcion_id is not null
                and bono_devuelto_en is null
           then now() end
   where id = p_reserva_id;

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

  if v_estado in ('CONFIRMADA', 'ASISTIDA')
     or (v_estado = 'LISTA_ESPERA' and v_tenia_oferta) then
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

revoke all on function public.cancelar_reserva_plaza(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_plaza(text, text, text, boolean) to service_role, postgres;

create or replace function public.reparar_devoluciones_bono()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v integer;
  n integer := 0;
begin
  -- Las ya devueltas por el camino normal no necesitan la marca.
  update public.reservas set bono_devolucion_debida_en = null
   where bono_devolucion_debida_en is not null and bono_devuelto_en is not null;

  for r in
    select id, studio_id from public.reservas
     where estado = 'CANCELADA'
       and bono_devolucion_debida_en is not null
       and bono_devolucion_debida_en < now() - interval '5 minutes'
       and bono_devuelto_en is null
     order by bono_devolucion_debida_en
     limit 200
  loop
    begin
      v := public.devolver_sesion_bono_por_reserva(r.studio_id, r.id);
      if v is not null then n := n + 1; end if;
      -- Un intento por reserva: null = ya sellada o el bono estaba al tope del
      -- plan (no hay nada más que hacer); sin quitar la marca se reintentaría
      -- cada 15 min para siempre.
      update public.reservas set bono_devolucion_debida_en = null where id = r.id;
    exception when others then
      -- Un fallo real deja la marca y se reintenta en la pasada siguiente.
      raise warning 'reparar_devoluciones_bono: reserva % (%)', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$function$;

-- Solo la ejecuta pg_cron. `pg_default_acl` da EXECUTE directo a anon/authenticated
-- en toda función nueva: hay que nombrarlos.
revoke all on function public.reparar_devoluciones_bono() from public, anon, authenticated;
grant execute on function public.reparar_devoluciones_bono() to postgres, service_role;

select cron.schedule(
  'reparar-devoluciones-bono',
  '*/15 * * * *',
  $$select public.reparar_devoluciones_bono();$$
);

do $$
begin
  if has_function_privilege('anon', 'public.cancelar_reserva_plaza(text, text, text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cancelar_reserva_plaza(text, text, text, boolean)', 'EXECUTE') then
    raise exception 'cancelar_reserva_plaza quedó llamable por roles de cliente';
  end if;
  if has_function_privilege('anon', 'public.reparar_devoluciones_bono()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reparar_devoluciones_bono()', 'EXECUTE') then
    raise exception 'reparar_devoluciones_bono quedó llamable por roles de cliente';
  end if;
end $$;
