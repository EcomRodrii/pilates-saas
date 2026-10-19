-- ═══════════════════════════════════════════════════════════════════════════
-- La bandeja única en UNA llamada: `estado_estudio_conteos`.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `GET /api/estado-estudio` (y la herramienta del asistente) lanzaban ~30
-- consultas `count: exact` por llamada, en cada apertura del panel y en cada
-- vuelta de pestaña pasados 30 s. Esta función devuelve los MISMOS recuentos,
-- con los MISMOS filtros que cada una de aquellas consultas, en un solo viaje.
--
-- Qué NO cambia:
--   · Quién ve qué sigue decidiéndolo TypeScript (lib/permisos-reglas.ts): la
--     función recibe en `p_fuentes` los recuentos que ese rol puede ver y solo
--     calcula esos. Una fuente que no está en la lista no sale en el resultado
--     (= «no lo puedes ver»); nunca un 0 inventado.
--   · El día es el de Madrid, derivado de `p_ahora` (el mismo instante que usa
--     el servidor), no de `current_date`.
--   · Lo que necesita lógica de TypeScript se devuelve en bruto y TS decide: el
--     NIF del estudio (`nifEmisorValido`). Los festivos por decidir (calendario
--     oficial por zona) siguen leyéndose desde TypeScript.
--
-- Solo para service_role: la ruta usa el cliente de servicio y filtra por el
-- estudio de la SESIÓN. `REVOKE … FROM PUBLIC` no basta (pg_default_acl da
-- EXECUTE directo a anon/authenticated): se revocan los tres y se concede solo
-- a service_role.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.estado_estudio_conteos(
  p_studio_id text,
  p_user_id uuid,
  p_ahora timestamptz,
  p_fuentes text[],
  p_ambitos text[],
  p_roles_ficha text[],
  p_horas_limite integer
) returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_hoy date := (p_ahora at time zone 'Europe/Madrid')::date;
  v_inicio_dia timestamptz := ((p_ahora at time zone 'Europe/Madrid')::date)::timestamp at time zone 'Europe/Madrid';
  v_hace_24h timestamptz := p_ahora - interval '24 hours';
  v_propia text;
  v_horas integer;
  v_corte timestamptz;
  v_res jsonb := '{}'::jsonb;
  v_n bigint;
  v_n2 bigint;
begin
  -- ── Decidir ──
  if 'sustitucionesPorDecidir' = any(p_fuentes) then
    select count(*) into v_n from public.sustituciones x
      join public.sesiones s on s.id = x.sesion_id
     where x.studio_id = p_studio_id and x.estado in ('pendiente_aprobacion', 'agotada') and s.inicio > p_ahora;
    v_res := v_res || jsonb_build_object('sustitucionesPorDecidir', v_n);
  end if;

  if 'sustitucionesConNetwork' = any(p_fuentes) then
    -- Mismo tope (200 filas) que la lectura de antes; el jsonb no sale de aquí.
    select count(*) into v_n from (
      select x.candidatos_network from public.sustituciones x
        join public.sesiones s on s.id = x.sesion_id
       where x.studio_id = p_studio_id and x.estado = 'agotada' and s.inicio > p_ahora
       limit 200
    ) f
    where jsonb_typeof(f.candidatos_network) = 'array' and jsonb_array_length(f.candidatos_network) > 0;
    v_res := v_res || jsonb_build_object('sustitucionesConNetwork', v_n);
  end if;

  if 'reservasPorAprobar' = any(p_fuentes) then
    select count(*) into v_n from public.reservas r
      join public.sesiones s on s.id = r.sesion_id
     where r.studio_id = p_studio_id and r.estado = 'PENDIENTE_APROBACION' and s.inicio > p_ahora;
    v_res := v_res || jsonb_build_object('reservasPorAprobar', v_n);
  end if;

  if 'recibosFallidos' = any(p_fuentes) then
    -- situacionRecibo() === 'IMPAGADO' (lib/billing/situacion-recibo.ts): FALLIDO,
    -- o DEVUELTO que aún se puede cobrar (sin reembolso pedido ni devuelto entero).
    -- Mismo tope (2000 filas) que la lectura de antes.
    select count(*) into v_n from (
      select rc.estado, rc.importe, rc.importe_devuelto, rc.reembolso_stripe_id, rc.reembolso_solicitado_en
        from public.recibos rc
       where rc.studio_id = p_studio_id and rc.estado in ('FALLIDO', 'DEVUELTO')
       limit 2000
    ) f
    where f.estado = 'FALLIDO'
       or (f.estado = 'DEVUELTO'
           and coalesce(f.reembolso_stripe_id, '') = ''
           and f.reembolso_solicitado_en is null
           and not (coalesce(f.importe_devuelto, 0) >= f.importe));
    v_res := v_res || jsonb_build_object('recibosFallidos', v_n);
  end if;

  if 'renovacionesSinCobro' = any(p_fuentes) then
    select count(*) into v_n from public.recibos rc
     where rc.studio_id = p_studio_id and rc.estado = 'PENDIENTE' and rc.es_renovacion = true and rc.proximo_reintento is null;
    v_res := v_res || jsonb_build_object('renovacionesSinCobro', v_n);
  end if;

  if 'penalizacionesPorAprobar' = any(p_fuentes) then
    select count(*) into v_n from public.penalizaciones p
     where p.studio_id = p_studio_id and p.estado = 'PENDIENTE_APROBACION';
    select count(*) into v_n2 from public.penalizaciones p
      join public.recibos rc on rc.id = p.recibo_id
     where p.studio_id = p_studio_id and p.estado = 'FALLIDA' and rc.estado = 'PENDIENTE' and rc.proximo_reintento is null;
    v_res := v_res || jsonb_build_object('penalizacionesPorAprobar', v_n + v_n2);
  end if;

  if 'devolucionesPorRevisar' = any(p_fuentes) then
    select count(*) into v_n from public.devoluciones d
     where d.studio_id = p_studio_id and d.estado = 'PENDIENTE_REVISION';
    v_res := v_res || jsonb_build_object('devolucionesPorRevisar', v_n);
  end if;

  if 'automatizacionesEsperando' = any(p_fuentes) then
    select count(*) into v_n from public.automation_logs a
     where a.studio_id = p_studio_id and a.resultado = 'PENDIENTE_ADMIN';
    v_res := v_res || jsonb_build_object('automatizacionesEsperando', v_n);
  end if;

  if 'canjesPorEntregar' = any(p_fuentes) then
    select count(*) into v_n from public.reward_redemptions c
     where c.studio_id = p_studio_id and c.estado = 'PENDIENTE';
    v_res := v_res || jsonb_build_object('canjesPorEntregar', v_n);
  end if;

  if 'bajasPorRevisar' = any(p_fuentes) then
    -- Sin la suya propia (una gerente que da clases).
    select i.id into v_propia from public.instructores i
     where i.studio_id = p_studio_id and i.auth_user_id = p_user_id limit 1;
    select count(*) into v_n from public.bajas_instructora b
     where b.studio_id = p_studio_id and b.revision = 'PENDIENTE'
       and (v_propia is null or b.instructor_id <> v_propia);
    v_res := v_res || jsonb_build_object('bajasPorRevisar', v_n);
  end if;

  if 'seriesPorRenovar' = any(p_fuentes) then
    select count(*) into v_n from public.series_por_renovar(p_studio_id, 30);
    v_res := v_res || jsonb_build_object('seriesPorRenovar', v_n);
  end if;

  if 'plazasFijasPorDecidir' = any(p_fuentes) then
    select count(*) into v_n from public.solicitudes_plaza_fija sp
     where sp.studio_id = p_studio_id and sp.estado = 'PENDIENTE';
    v_res := v_res || jsonb_build_object('plazasFijasPorDecidir', v_n);
  end if;

  if 'reconciliacionesPorRevisar' = any(p_fuentes) then
    select count(*) into v_n from public.reconciliaciones_pos rp
     where rp.studio_id = p_studio_id and rp.estado = 'PENDIENTE';
    v_res := v_res || jsonb_build_object('reconciliacionesPorRevisar', v_n);
  end if;

  -- ── En marcha ──
  if 'sustitucionesBuscando' = any(p_fuentes) then
    select count(*) into v_n from public.sustituciones x
      join public.sesiones s on s.id = x.sesion_id
     where x.studio_id = p_studio_id and x.estado = 'contactando' and s.inicio > p_ahora;
    v_res := v_res || jsonb_build_object('sustitucionesBuscando', v_n);
  end if;

  if 'ofertasListaEspera' = any(p_fuentes) then
    select count(*) into v_n from public.reservas r
     where r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en > p_ahora;
    v_res := v_res || jsonb_build_object('ofertasListaEspera', v_n);
  end if;

  if 'cobrosEnReintento' = any(p_fuentes) then
    select count(*) into v_n from public.recibos rc
     where rc.studio_id = p_studio_id and rc.estado = 'PENDIENTE' and rc.intentos_reintento > 0 and rc.proximo_reintento is not null;
    v_res := v_res || jsonb_build_object('cobrosEnReintento', v_n);
  end if;

  -- ── Resuelto ──
  if 'sustitucionesCubiertas24h' = any(p_fuentes) then
    select count(*) into v_n from public.sustituciones x
     where x.studio_id = p_studio_id and x.estado = 'confirmada' and x.resuelto_en >= v_hace_24h;
    v_res := v_res || jsonb_build_object('sustitucionesCubiertas24h', v_n);
  end if;

  if 'accionesAutonomasHoy' = any(p_fuentes) then
    select count(*) into v_n from public.recomendaciones rm
     where rm.studio_id = p_studio_id and rm.resuelto_por = 'AUTONOMIA' and rm.estado = 'EJECUTADA' and rm.resuelto_en >= v_inicio_dia;
    v_res := v_res || jsonb_build_object('accionesAutonomasHoy', v_n);
  end if;

  if 'mensajesAutomaticosHoy' = any(p_fuentes) then
    select count(*) into v_n from public.automation_logs a
     where a.studio_id = p_studio_id and a.resultado = 'EJECUTADO' and a.ejecutado_en >= v_inicio_dia;
    v_res := v_res || jsonb_build_object('mensajesAutomaticosHoy', v_n);
  end if;

  if 'alertasApertura' = any(p_fuentes) then
    select count(*) into v_n from public.alertas_opening al
     where al.studio_id = p_studio_id and al.resuelta_en is null;
    v_res := v_res || jsonb_build_object('alertasApertura', v_n);
  end if;

  -- Jornadas y clases no dadas: solo de las fichas que puede gestionar quien mira.
  if 'jornadasPorRevisar' = any(p_fuentes) or 'clasesNoDadasPorRevisar' = any(p_fuentes) then
    select coalesce(
      (select c.open_session_limit_hours from public.studio_config_tiempo c where c.studio_id = p_studio_id),
      p_horas_limite) into v_horas;
    v_corte := p_ahora - make_interval(hours => v_horas);
    if 'jornadasPorRevisar' = any(p_fuentes) then
      -- Dos recuentos de estados excluyentes: sumarlos no cuenta nada dos veces.
      select count(*) into v_n from public.instructor_work_sessions w
       where w.studio_id = p_studio_id and w.status = 'PENDING_REVIEW'
         and w.instructor_id in (select i.id from public.instructores i where i.studio_id = p_studio_id and i.rol = any(p_roles_ficha));
      select count(*) into v_n2 from public.instructor_work_sessions w
       where w.studio_id = p_studio_id and w.status = 'OPEN' and w.check_in_at < v_corte
         and w.instructor_id in (select i.id from public.instructores i where i.studio_id = p_studio_id and i.rol = any(p_roles_ficha));
      v_res := v_res || jsonb_build_object('jornadasPorRevisar', v_n + v_n2);
    end if;
    if 'clasesNoDadasPorRevisar' = any(p_fuentes) then
      select count(*) into v_n from public.clases_impartidas ci
       where ci.studio_id = p_studio_id and ci.estado = 'NO_DADA' and ci.revisada_en is null
         and ci.instructor_id in (select i.id from public.instructores i where i.studio_id = p_studio_id and i.rol = any(p_roles_ficha));
      v_res := v_res || jsonb_build_object('clasesNoDadasPorRevisar', v_n);
    end if;
  end if;

  if 'clasesSinInstructora' = any(p_fuentes) then
    select count(*) into v_n from public.sesiones s
      join public.instructores i on i.id = s.instructor_id
     where s.studio_id = p_studio_id and s.cancelada = false and s.inicio > p_ahora and i.activo = false;
    v_res := v_res || jsonb_build_object('clasesSinInstructora', v_n);
  end if;

  if 'doblesCobrosPorRevisar' = any(p_fuentes) then
    select count(*) into v_n from public.dobles_cobros_detectados dc
     where dc.studio_id = p_studio_id and dc.estado = 'DETECTADA';
    v_res := v_res || jsonb_build_object('doblesCobrosPorRevisar', v_n);
  end if;

  if 'seguimientosParaHoy' = any(p_fuentes) then
    select count(*) into v_n from public.tareas t
     where t.studio_id = p_studio_id and t.estado = 'PENDIENTE' and t.socio_id is not null and t.vence_el <= v_hoy
       and (t.asignada_a is null or t.asignada_a = p_user_id);
    v_res := v_res || jsonb_build_object('seguimientosParaHoy', v_n);
  end if;

  -- Sin NIF no sale ninguna factura. Si es válido lo decide TypeScript
  -- (`nifEmisorValido`), así que se devuelve en bruto. Sin estudio: null.
  if 'facturasSinNif' = any(p_fuentes) then
    if exists (select 1 from public.studios st where st.id = p_studio_id) then
      select count(*) into v_n from public.recibos rc
       where rc.studio_id = p_studio_id and rc.estado = 'COBRADO' and rc.factura_pendiente_sellar = true;
      v_res := v_res || (select jsonb_build_object('facturasSinNif', jsonb_build_object(
        'nif', st.nif, 'modoFacturacion', st.modo_facturacion, 'sinSellar', v_n))
        from public.studios st where st.id = p_studio_id);
    else
      v_res := v_res || jsonb_build_object('facturasSinNif', null);
    end if;
  end if;

  if 'denunciasPorRevisar' = any(p_fuentes) then
    select count(*) into v_n from public.denuncias dn
     where dn.studio_id = p_studio_id and dn.estado = 'PENDIENTE' and dn.destino = 'ESTUDIO'
       and dn.ambito = any(p_ambitos)
       -- Las que van contra quien mira, ni se cuentan: no decide sobre sí misma.
       and (dn.autor_auth_user_id is null or dn.autor_auth_user_id <> p_user_id);
    v_res := v_res || jsonb_build_object('denunciasPorRevisar', v_n);
  end if;

  return v_res;
end;
$function$;

comment on function public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer) is
  'Los recuentos de la bandeja única (lib/estado-estudio-servidor.ts) en una sola llamada. Solo calcula las fuentes de p_fuentes. Solo service_role.';

revoke all on function public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer) from public;
revoke all on function public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer) from anon;
revoke all on function public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer) from authenticated;
grant execute on function public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.estado_estudio_conteos(text, uuid, timestamptz, text[], text[], text[], integer)', 'EXECUTE') then
    raise exception 'estado_estudio_conteos: grants incorrectos';
  end if;
end $$;
