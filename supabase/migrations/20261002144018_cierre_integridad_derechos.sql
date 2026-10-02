-- Motor de derechos: cierre de integridad (tras las fases 1, 2 y 3a).
--
--  1. La devolución a CIEGAS deja de poder llamarse desde el navegador. `devolver_sesion_bono(suscripcion, estudio)` suma
--     una sesión al bono que se le diga, sin saber qué reserva la provoca ni si hubo consumo (por eso la causa común de los
--     cuatro defectos de saldo). Tras #2472 ya no la llama ningún camino: el panel dejó de usarla y el servidor solo la
--     alcanzaba sin `reservaId`, y todos lo pasan. Se revoca a `authenticated` (queda para el servidor); no se borra, por si
--     alguna pestaña abierta con el bundle antiguo la llamara: recibirá un «permiso denegado» y avisará de que revise la
--     devolución, que es mejor que sumar una sesión a ciegas.
--  2. El ledger rechaza duplicados: UN registro de consumo por reserva y UNA devolución por reserva. Las dos cosas ya eran
--     ciertas por construcción (`consumir_bono_interno` decide una vez, `devolver_sesion_bono_por_reserva` sella por reserva);
--     ahora la base de datos lo exige. Si algún camino intentara duplicar, el trigger del ledger (que captura sus errores)
--     avisa y el movimiento no se escribe: la vista `ledger_conciliacion` lo enseña, y NO se rompe ninguna reserva.
--  3. `cancelar_reservas_de_sesion`: cancela las reservas de una clase ya cancelada y las libera EN LA MISMA TRANSACCIÓN.
--     Antes los caminos de servidor (cron de mínimo de asistentes y sustituciones) hacían un UPDATE y, después, una llamada
--     por reserva: si el proceso moría en medio, las reservas quedaban canceladas con la sesión sin devolver y nadie lo veía.
--     Aquí o pasa todo o no pasa nada, y repetir la llamada no devuelve dos veces. El aviso a las alumnas sigue yendo ANTES
--     (resuelven destinatarias por reservas activas): quien llama marca la clase cancelada, avisa y entonces llama a esto.
--
-- Aditiva y compatible: no cambia ningún saldo ni ningún flujo existente salvo el punto 1.

-- ── 1. La devolución ciega, solo para el servidor ────────────────────────────
revoke all on function public.devolver_sesion_bono(text, text) from public, anon, authenticated;
grant execute on function public.devolver_sesion_bono(text, text) to service_role;

-- ── 2. El ledger no admite duplicados ────────────────────────────────────────
-- Un solo registro de cómo se pagó cada reserva (bono, cuota o sin cobertura) y una sola devolución. `reserva_id is not
-- null`: los movimientos sin reserva (compras, ajustes, la devolución ciega) no entran.
create unique index if not exists movimientos_derecho_un_consumo_por_reserva
  on public.movimientos_derecho (reserva_id)
  where reserva_id is not null and tipo in ('CONSUMO_BONO', 'USO_CUOTA', 'SIN_COBERTURA');

create unique index if not exists movimientos_derecho_una_devolucion_por_reserva
  on public.movimientos_derecho (reserva_id)
  where reserva_id is not null and tipo = 'DEVOLUCION_BONO';

-- ── 3. Cancelar las reservas de una clase y liberarlas, de una vez ───────────
create or replace function public.cancelar_reservas_de_sesion(p_studio_id text, p_sesion_id text, p_motivo text)
returns table(reserva_id text, socio_id text, estado_previo text, bono text, recuperacion_restituida boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cancelada boolean;
  v_r record;
  v_lib jsonb;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_motivo is null or p_motivo not in (
    'estudio_cancela_clase', 'eliminar_clase', 'instructora_baja_sin_sustituta', 'minimo_asistentes'
  ) then
    raise exception 'MOTIVO_LIBERACION_DESCONOCIDO';
  end if;

  -- La sesión, bloqueada: serializa esto con cualquier reserva o promoción que la toque.
  select ss.cancelada into v_cancelada
    from public.sesiones as ss
   where ss.id = p_sesion_id and ss.studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;
  if v_cancelada is distinct from true then
    raise exception 'SESION_NO_CANCELADA';
  end if;

  -- Los mismos tres estados que cancelaban los dos llamadores: incluye PENDIENTE_APROBACION (si no, una petición
  -- pendiente quedaría huérfana en una clase cancelada).
  for v_r in
    select r.id as id, r.socio_id as socio_id, r.estado as estado
      from public.reservas as r
     where r.sesion_id = p_sesion_id and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION')
     order by r.id
     for update
  loop
    update public.reservas as rs
       set estado = 'CANCELADA', posicion_espera = null
     where rs.id = v_r.id;

    reserva_id := v_r.id;
    socio_id := v_r.socio_id;
    estado_previo := v_r.estado;
    bono := null;
    recuperacion_restituida := false;

    -- Solo una plaza confirmada consumió algo. La lista de espera y lo pendiente de aprobar no ocupan plaza ni gastan bono.
    if v_r.estado = 'CONFIRMADA' then
      v_lib := public.liberar_derecho(p_studio_id, v_r.id, p_motivo);
      bono := v_lib ->> 'bono';
      recuperacion_restituida := coalesce((v_lib ->> 'recuperacion_restituida')::boolean, false);
    end if;
    return next;
  end loop;
end;
$function$;

revoke all on function public.cancelar_reservas_de_sesion(text, text, text) from public, anon, authenticated;
grant execute on function public.cancelar_reservas_de_sesion(text, text, text) to service_role;

comment on function public.cancelar_reservas_de_sesion(text, text, text) is
  'Cancela las reservas activas de una clase YA cancelada y libera sus derechos (bono exacto y recuperación) en la misma transacción. Idempotente. Solo service_role. Ver 20261002144018.';

-- ── Verificación: el estado FINAL ────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.devolver_sesion_bono(text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.devolver_sesion_bono(text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.devolver_sesion_bono(text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'devolver_sesion_bono tiene que quedar solo para el servidor';
  end if;
  if has_function_privilege('anon', 'public.cancelar_reservas_de_sesion(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cancelar_reservas_de_sesion(text,text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.cancelar_reservas_de_sesion(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'cancelar_reservas_de_sesion tiene que ser solo del servidor';
  end if;
  if (select count(*) from pg_indexes
       where schemaname = 'public' and tablename = 'movimientos_derecho'
         and indexname in ('movimientos_derecho_un_consumo_por_reserva', 'movimientos_derecho_una_devolucion_por_reserva')) <> 2 then
    raise exception 'faltan los índices únicos del ledger';
  end if;
end $$;
