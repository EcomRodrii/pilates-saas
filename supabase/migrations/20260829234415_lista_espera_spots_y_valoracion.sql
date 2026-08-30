-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría 29-ago-2026 — cuatro huecos de la familia "reservas", los cuatro
-- del mismo tipo: un camino se cerró y su GEMELO se quedó abierto.
--
-- NO aplicada a mano en producción a propósito: va con el código que la
-- acompaña (el nuevo `SPOT_NO_DISPONIBLE` y el nuevo `CLASE_CANCELADA` los
-- tiene que saber leer `lib/db/supabase-data-admin.ts`). Aplicar solo la
-- migración dejaría la BD por delante del código — el fallo del 22-ago.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) "Dejarla pasar" una oferta de lista de espera dejaba la plaza huérfana ──
--
-- `components/portal/hoja-oferta-espera.tsx` afirma que rechazar la oferta «es
-- cancelarReserva de siempre: cancelar una reserva en LISTA_ESPERA ya libera el
-- hueco y promueve a la siguiente». Era falso: `cancelar_reserva_plaza` solo
-- promocionaba con `v_estado in ('CONFIRMADA','ASISTIDA')`. Resultado: rechazar
-- la oferta explícitamente era PEOR que ignorarla (dejarla caducar sí promueve,
-- vía `expirar_oferta_lista_espera`), la cola no se enteraba y la clase se daba
-- con un hueco.
--
-- Se promociona SOLO si la reserva cancelada tenía una oferta viva
-- (`oferta_expira_en is not null`): es el caso en que hay un hueco realmente
-- libre esperando a alguien. Una LISTA_ESPERA sin oferta que simplemente
-- abandona la cola NO debe promocionar a nadie — `promocionar_siguiente_espera`
-- no comprueba aforo, así que llamarla ahí confirmaría una plaza inexistente.
create or replace function public.cancelar_reserva_plaza(
  p_studio_id text, p_reserva_id text, p_socio_id text, p_omitir_penalizacion boolean default false
)
returns table(era_confirmada boolean, promovida_socio_id text, devolver_bono boolean,
              oferta_socio_id text, oferta_expira_en timestamptz, penalizacion_id text)
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
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- `oferta_expira_en` se lee AQUÍ, en el mismo FOR UPDATE que el estado y
  -- antes del update que la pone a null más abajo. Leerla después sería leer
  -- siempre null.
  --
  -- ⚠️ CUALIFICADA con `reservas.` a propósito: las columnas de `RETURNS TABLE`
  -- son variables OUT de PL/pgSQL, y esta función tiene una que se llama
  -- exactamente `oferta_expira_en`. Sin cualificar, el cuerpo entero revienta
  -- con 42702 ("column reference is ambiguous") en la PRIMERA sentencia útil —
  -- y `create or replace` NO lo detecta (no planifica el cuerpo), así que la
  -- migración se aplicaría en verde y dejaría al producto sin poder cancelar
  -- ninguna reserva, ni desde el portal ni desde el mostrador. La función no
  -- lleva `#variable_conflict use_column` (prod tampoco) y no se le añade:
  -- cambiaría la resolución de todo el cuerpo.
  select reservas.sesion_id, reservas.estado, reservas.socio_id,
         (reservas.oferta_expira_en is not null)
    into v_sesion_id, v_estado, v_res_socio, v_tenia_oferta
    from reservas where reservas.id = p_reserva_id and reservas.studio_id = p_studio_id
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

  -- CAMBIO menor no declarado en el título: se añade `oferta_expira_en = null`,
  -- que la versión de producción no ponía. Limpia la oferta de una fila que
  -- queda CANCELADA; nadie la volvería a mirar (`expirar_oferta_lista_espera` y
  -- `promocionar_siguiente_espera` filtran por `estado='LISTA_ESPERA'`), pero
  -- dejarla puesta hacía que `v_tenia_oferta` fuese la única forma de saber si
  -- la reserva estaba ofertada y ensuciaba cualquier consulta futura.
  update reservas set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
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

  -- CAMBIO: se añade la rama de la oferta rechazada. `promocionar_siguiente_espera`
  -- ya comprueba por su cuenta que la clase siga viva y coge a la siguiente SIN
  -- oferta (`oferta_expira_en is null`), así que no puede ofrecerle el hueco a
  -- quien acaba de rechazarlo.
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

-- ── 2) Aceptar una oferta de una clase CANCELADA ──────────────────────────────
--
-- Gemelo sin arreglar de `promocionar_siguiente_espera`, que desde
-- 20260819120000 sí exige que la clase esté viva. `aceptar_oferta_lista_espera`
-- comprobaba caducidad, hora de inicio y aforo — pero no `sesiones.cancelada`.
-- Camino real: cancelar una clase marca `cancelada` y cancela las reservas en
-- una llamada APARTE que puede fallar («La clase se ha cancelado, pero no hemos
-- podido cancelar sus reservas»); con la oferta todavía viva, la socia la
-- aceptaba, quedaba CONFIRMADA y se le gastaba una sesión del bono sobre una
-- clase que no existe.
--
-- Se devuelve 'CLASE_CANCELADA' por la MISMA salida que 'AFORO_LLENO': la
-- reserva se cancela y el llamante compensa con una recuperación.
create or replace function public.aceptar_oferta_lista_espera(
  p_studio_id text, p_reserva_id text, p_socio_id text
)
returns table(estado text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text; v_res_socio text; v_expira timestamptz;
  v_inicio timestamptz; v_cancelada boolean; v_aforo int; v_ocupadas int;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  select r.sesion_id into v_sesion_id from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA';
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  select s.inicio, coalesce(s.cancelada, false) into v_inicio, v_cancelada from sesiones as s
   where s.id = v_sesion_id and s.studio_id = p_studio_id for update;
  if not found then raise exception 'SESION_NO_ENCONTRADA'; end if;
  select r.socio_id, r.oferta_expira_en into v_res_socio, v_expira from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA' for update;
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  if v_res_socio is distinct from p_socio_id then raise exception 'NO_AUTORIZADO'; end if;
  if v_expira is null then raise exception 'SIN_OFERTA_ACTIVA'; end if;
  if now() > v_expira then raise exception 'OFERTA_CADUCADA'; end if;
  -- CAMBIO: la clase cancelada, antes que la hora y que el aforo (una clase
  -- cancelada del futuro pasaba las dos comprobaciones anteriores).
  if v_cancelada then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_CANCELADA'::text;
    return;
  end if;
  if v_inicio <= now() then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_YA_EMPEZADA'::text;
    return;
  end if;
  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = v_sesion_id and r.estado in ('CONFIRMADA','ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'AFORO_LLENO'::text;
    return;
  end if;
  update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
  perform public.renumerar_lista_espera(v_sesion_id);
  return query select 'CONFIRMADA'::text;
end; $function$;

-- ── 3) `reservar_plaza` no miraba `spots.activo`; su gemelo JS sí ─────────────
--
-- `asignarSpotReserva` (lib/db/supabase-data-admin.ts) comprueba
-- `!spot.activo` antes de asignar. La RPC del camino de PAGO (el único que usa
-- `p_spot_id`) no: un reformer dado de baja se podía vender por "pagar y
-- reservar sin login". Error propio (`SPOT_NO_DISPONIBLE`) en vez de reutilizar
-- `SPOT_NO_PERTENECE_A_LA_SALA`, para que el mostrador vea el motivo real.
create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true, p_requiere_aprobacion boolean default false,
  p_spot_id text default null::text
)
returns table(estado text, posicion_espera integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_sala_id text;
  v_instructor_id text;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_limite int;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_ocupado text;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  select inicio, instructor_id, sala_id into v_inicio, v_instructor_id, v_sala_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  -- Candado del spot ANTES de decidir estado: mismo criterio que el FOR
  -- UPDATE de sesiones, evita que dos pagos simultáneos elijan el mismo
  -- sitio. Se hace igual si va a terminar en LISTA_ESPERA/PENDIENTE_APROBACION
  -- (el candado no hace daño ahí, solo no se usará luego).
  if p_spot_id is not null then
    select sp.sala_id, coalesce(sp.activo, true) into v_spot_sala_id, v_spot_activo
      from spots sp
      where sp.id = p_spot_id and sp.studio_id = p_studio_id
      for update;
    if not found or v_spot_sala_id is distinct from v_sala_id then
      raise exception 'SPOT_NO_PERTENECE_A_LA_SALA';
    end if;
    if not v_spot_activo then
      raise exception 'SPOT_NO_DISPONIBLE';
    end if;

    select r.id into v_spot_ocupado
      from reservas r
      where r.sesion_id = p_sesion_id and r.spot_id = p_spot_id
        and r.estado in ('CONFIRMADA', 'ASISTIDA')
      for update;
    if v_spot_ocupado is not null then
      raise exception 'SPOT_OCUPADO';
    end if;
  end if;

  if p_requiere_aprobacion then
    v_estado := 'PENDIENTE_APROBACION';
    v_pos := null;
  else
    v_aforo := aforo_efectivo(p_sesion_id);

    select count(*) into v_ocupadas
      from reservas
      where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

    if v_aforo is null or v_ocupadas < v_aforo then
      v_estado := 'CONFIRMADA';
      v_pos := null;
    else
      if not p_permite_lista_espera then
        raise exception 'AFORO_LLENO_SIN_ESPERA';
      end if;
      select count(*) into v_espera
        from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
      v_estado := 'LISTA_ESPERA';
      v_pos := v_espera + 1;
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    select p.limite_semanal into v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and coalesce(ss.cancelada, false) = false
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
      if v_semana >= v_limite then
        select id into v_recup
          from recuperaciones
         where socio_id = p_socio_id and studio_id = p_studio_id
           and estado = 'DISPONIBLE' and caduca_el >= current_date
         order by caduca_el asc
         limit 1
         for update;
        if v_recup is null then
          raise exception 'LIMITE_SEMANAL';
        end if;
        update recuperaciones
           set estado = 'USADA', usada_en_reserva_id = p_reserva_id
         where id = v_recup;
      end if;
    end if;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now()
    );

  return query select v_estado, v_pos;
end;
$function$;

-- ── 4) Valorar una clase CONGELABA la reserva ────────────────────────────────
--
-- `reservas_valoracion_experiencia_solo_asistida` (20260828010312) es un CHECK
-- de FILA, no de inserción: una vez valorada, CUALQUIER update posterior de
-- `estado` fallaba con 23514. Verificado en producción sobre una reserva real
-- (dentro de una transacción revertida): CANCELADA, NO_ASISTIO y CONFIRMADA
-- daban las tres el mismo 23514.
--
-- Rompía tres caminos reales del mostrador: marcar no-show
-- (`dbUpdateReserva(..., NO_ASISTIO)`), deshacer un check-in, y cancelar una
-- reserva ASISTIDA para cuadrar histórico. Hoy hay 0 filas valoradas, así que
-- estaba latente pero garantizado.
--
-- El invariante que se quiere ("solo se valora una clase a la que se asistió")
-- es sobre la ESCRITURA de la valoración, no sobre la fila para siempre: pasa a
-- un trigger que valida únicamente cuando la valoración se pone o cambia. La
-- valoración ya escrita sobrevive a un cambio de estado posterior, que es lo
-- que quiere el negocio (la clase se dio y se valoró; el ajuste administrativo
-- de después no borra la opinión).
alter table public.reservas
  drop constraint if exists reservas_valoracion_experiencia_solo_asistida;

create or replace function public.reservas_valoracion_solo_asistida()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.valoracion_experiencia is not null
     and (tg_op = 'INSERT' or new.valoracion_experiencia is distinct from old.valoracion_experiencia)
     and new.estado <> 'ASISTIDA' then
    raise exception 'VALORACION_SOLO_ASISTIDA';
  end if;
  return new;
end; $$;

drop trigger if exists reservas_valoracion_solo_asistida_trigger on public.reservas;
create trigger reservas_valoracion_solo_asistida_trigger
  before insert or update on public.reservas
  for each row execute function public.reservas_valoracion_solo_asistida();

comment on function public.reservas_valoracion_solo_asistida() is
  'Sustituye al CHECK de fila reservas_valoracion_experiencia_solo_asistida (auditoría 29-ago-2026): valida SOLO cuando la valoración se pone o cambia, para no congelar el estado de la reserva a partir del momento en que se valora.';
