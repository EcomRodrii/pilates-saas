-- Aceptar una oferta de lista de espera comprueba el aforo. Antes no.
--
-- EL FALLO (C-4 de la auditoría del 17-ago). `aceptar_oferta_lista_espera` era
-- la ÚNICA vía de confirmación que no pasaba por el candado de aforo: validaba
-- la socia y el plazo, y hacía `update reservas set estado = 'CONFIRMADA'` sin
-- mirar cuántas plazas quedaban ni si la clase ya había empezado.
--
-- Cómo se producía el overbooking, con aforo 10 y clase llena:
--   1. Alguien cancela → se abre oferta a A, la #1 de la espera. Confirmadas 9.
--   2. La reserva de A sigue en LISTA_ESPERA, que NO cuenta como ocupada, así
--      que el hueco se ve libre en el calendario público.
--   3. Otra persona reserva por la vía normal → 9 < 10 → CONFIRMADA. Van 10.
--   4. A acepta su oferta dentro de plazo → CONFIRMADA sin comprobar nada.
--      11 alumnas para 10 reformers.
-- Y una oferta abierta a las 19:55 con 30 minutos de plazo se podía aceptar a
-- las 20:10 para una clase de las 20:00.
--
-- QUÉ HACE AHORA. Mismo patrón que `reservar_plaza`: bloquea la fila de
-- `sesiones` y cuenta las confirmadas contra `aforo_efectivo()` (que descuenta
-- las máquinas averiadas) antes de confirmar nada.
--
-- ⚠️ ORDEN DE BLOQUEO. `reservar_plaza` bloquea SESIONES y luego escribe en
-- `reservas`. Esta función bloqueaba primero la reserva; añadirle el lock de
-- sesión sin más habría dejado las dos tomando los mismos candados en orden
-- opuesto, que es un deadlock esperando a ocurrir bajo concurrencia — justo el
-- escenario de esta feature (varias personas sobre la misma clase llena). Por
-- eso ahora se lee la reserva SIN bloquear solo para saber de qué sesión es, se
-- bloquea la sesión, y solo entonces se bloquea y se revalida la reserva: mismo
-- orden que `reservar_plaza` (sesiones → reservas).
--
-- QUÉ PASA SI LLEGA TARDE. Decisión de producto explícita: PIERDE EL SITIO
-- (`CANCELADA`) y se le ofrece una recuperación, que la crea el llamador en TS
-- (`aceptarOfertaListaEspera`) reutilizando `crear_recuperacion` — la misma
-- compensación que ya se da al cancelar una plaza fija, con su tope de 4.
--
-- Por eso estos dos casos NO salen por `raise exception`: una excepción revierte
-- la transacción entera, incluida la cancelación que queremos que persista. Se
-- devuelven como estado (`AFORO_LLENO` / `CLASE_YA_EMPEZADA`), que además le
-- permite al llamador distinguirlos y contarle a la socia lo que ha pasado.
-- Los errores de validación de siempre (no autorizado, sin oferta, caducada) se
-- quedan como excepciones: ahí no hay nada que persistir.
--
-- No se promociona a la siguiente de la cola en ninguno de los dos casos: no se
-- ha liberado ningún hueco, precisamente.
--
-- Firma IDÉNTICA (text, text, text): un CREATE OR REPLACE que no cambia la
-- firma conserva los grants. Se verifican igualmente después, que en este repo
-- el gotcha de los grants ya ha mordido cuatro veces.
create or replace function public.aceptar_oferta_lista_espera(
  p_studio_id text, p_reserva_id text, p_socio_id text
)
returns table(estado text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_res_socio text;
  v_expira timestamptz;
  v_inicio timestamptz;
  v_aforo int;
  v_ocupadas int;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  -- Sin bloquear: solo para saber a qué sesión hay que pedirle el candado. Todo
  -- lo que se valide aquí se vuelve a validar abajo con la fila ya bloqueada.
  select r.sesion_id into v_sesion_id
    from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA';
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;

  -- Candado de aforo, en el mismo orden que reservar_plaza.
  select s.inicio into v_inicio
    from sesiones as s
   where s.id = v_sesion_id and s.studio_id = p_studio_id
   for update;
  if not found then raise exception 'SESION_NO_ENCONTRADA'; end if;

  -- Ahora sí, la reserva bloqueada y revalidada: entre la lectura de arriba y
  -- este punto ha podido cambiar (la caduca el cron, la cancela mostrador).
  select r.socio_id, r.oferta_expira_en into v_res_socio, v_expira
    from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA'
   for update;
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  if v_res_socio is distinct from p_socio_id then raise exception 'NO_AUTORIZADO'; end if;
  if v_expira is null then raise exception 'SIN_OFERTA_ACTIVA'; end if;
  if now() > v_expira then raise exception 'OFERTA_CADUCADA'; end if;

  -- Aceptar a tiempo una clase que ya ha empezado no confirma a nadie.
  if v_inicio <= now() then
    update reservas set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
      where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_YA_EMPEZADA'::text;
    -- ⚠️ `return query` NO termina la función: añade filas al resultado y SIGUE.
    -- Sin este `return` seco, la ejecución caía hasta el bloque de abajo y
    -- confirmaba la reserva igualmente, devolviendo DOS filas. Verificado en
    -- vivo antes de aplicar: daba 9 confirmadas sobre un aforo de 8, o sea el
    -- overbooking que esta migración viene a cerrar. La versión anterior de esta
    -- función no lo sufría porque tenía una sola salida, al final del cuerpo.
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas
    from reservas as r
   where r.sesion_id = v_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');

  -- `v_aforo is null` = sesión sin aforo definido, igual que en reservar_plaza:
  -- no hay límite que respetar.
  if v_aforo is not null and v_ocupadas >= v_aforo then
    update reservas set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
      where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'AFORO_LLENO'::text;
    return; -- imprescindible, ver la nota de arriba
  end if;

  update reservas set estado = 'CONFIRMADA', posicion_espera = null, oferta_expira_en = null
    where id = p_reserva_id;
  perform public.renumerar_lista_espera(v_sesion_id);

  return query select 'CONFIRMADA'::text;
end;
$function$;

-- Extraído porque ahora hay tres salidas que dejan la lista de espera con un
-- hueco en la numeración, no una. Mismo patrón de extracción que
-- `promocionar_siguiente_espera` (0130500) y los `*_usa_helpers.sql`.
-- SECURITY INVOKER a propósito: solo lo llaman funciones que ya son DEFINER y
-- ya han comprobado el estudio; no se expone nunca directo al cliente.
create or replace function public.renumerar_lista_espera(p_sesion_id text)
returns void
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
begin
  update reservas r
     set posicion_espera = sub.rn
    from (
      select rr.id, row_number() over (order by rr.creado_en asc, rr.id asc) as rn
        from reservas as rr
       where rr.sesion_id = p_sesion_id and rr.estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;
end;
$function$;

-- `renumerar_lista_espera` es NUEVA, así que sí le aplica el gotcha de
-- pg_default_acl: EXECUTE va directo a anon/authenticated sin pasar por PUBLIC,
-- y revocar PUBLIC no les quitaría nada. Los tres pasos explícitos.
revoke all on function public.renumerar_lista_espera(text) from public;
revoke all on function public.renumerar_lista_espera(text) from anon;
revoke all on function public.renumerar_lista_espera(text) from authenticated;
grant execute on function public.renumerar_lista_espera(text) to service_role;
