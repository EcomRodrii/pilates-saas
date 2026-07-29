-- ═══════════════════════════════════════════════════════════════════════════
-- Facturas Veri*Factu: reserva atómica de numero_completo/verifactu_seq/prev_hash
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Follow-up C-5 (lib/billing/sellar-factura-server.ts). sellarFacturaDeRecibo
-- leía el extremo de la cadena (max(verifactu_seq), su hash) y el max
-- numero_completo del año en llamadas SEPARADAS de supabase-js, sin
-- transacción compartida con el INSERT final. Dos sellados simultáneos del
-- MISMO estudio (webhook de Stripe por cobro SEPA + sellado manual desde el
-- panel, o dos reintentos del webhook) podían leer el mismo estado y
-- bifurcar la cadena fiscal: dos facturas con el MISMO verifactu_seq y el
-- MISMO prev_hash, cadena partida en dos ramas.
--
-- Prueba de que esto YA pasó (datos de siembra, nunca transmitidos a
-- Fiskaly/AEAT — fiskaly_invoice_id/verifactu_estado NULL en las 17 facturas
-- de studio-1): dos filas con verifactu_seq=3, mismo verifactu_prev_hash,
-- mismo verifactu_ts (mismo segundo, 2026-07-10T15:07:48+02:00), ids
-- "fac-auto-1783688865320-feepl"/"...-sgamz" (mismo epoch-ms de generación:
-- una tanda de siembra concurrente). Se corrige ANTES de endurecer con la
-- constraint (ninguna de las dos llegó a AEAT: seguro renumerar).
--
-- Arreglo:
--   1. Corrige el dato existente (único caso real de duplicado, ver arriba;
--      verificado con `select studio_id, numero_completo/verifactu_seq,
--      count(*) ... having count(*)>1` antes de escribir esta migración —
--      no hay más duplicados en el resto de estudios).
--   2. UNIQUE(studio_id, verifactu_seq) y UNIQUE(studio_id, numero_completo)
--      como red de seguridad dura (defensa en profundidad, no solo el lock).
--   3. reservar_numero_factura(...): RPC SECURITY DEFINER que toma
--      pg_advisory_xact_lock(hashtext(studio_id || ':verifactu')) al empezar
--      — serializa las reservas concurrentes del MISMO estudio — calcula
--      numero_completo/verifactu_seq/verifactu_prev_hash e inserta la fila
--      base (sin verifactu_hash: eso es una función pura en JS que no
--      necesita estar dentro del lock). El lock es de transacción (XACT),
--      se libera solo al terminar esta única llamada RPC — no hay problema
--      de pooling de sesión porque todo ocurre en una sola transacción.
--      Solo `service_role` puede ejecutarla: el único llamador es
--      sellarFacturaDeRecibo (server-only, admin client), igual criterio que
--      restaurar_backup (0021) y editar_serie_desde (0115, aunque esa sí es
--      invocable por `authenticated` porque el staff la llama directamente;
--      aquí NADIE del cliente debe poder llamarla).
--
--      Matiz encontrado al verificar con dos llamadas de prueba en la misma
--      transacción (rollback): dejar verifactu_hash sin rellenar en el
--      INSERT abre una ventana donde una SEGUNDA reserva del mismo estudio
--      puede leer como "extremo de la cadena" una fila que YA tiene
--      verifactu_seq pero TODAVÍA NO tiene verifactu_hash (porque su UPDATE
--      final en JS —tras calcularHuellaAlta y, si aplica, Fiskaly— no ha
--      vuelto todavía). Encadenar contra una huella NULL sería silencioso e
--      incorrecto (numeración correlativa, pero prev_hash roto). Por eso la
--      función ESPERA (con el lock ya tomado, nadie más se cuela) a que esa
--      huella pendiente se resuelva, hasta 100 intentos de 50ms (~5s); si se
--      agota, lanza 'CADENA_PENDIENTE' en vez de fabricar un prev_hash falso
--      — ruidoso y reintentable, no silencioso. Verificado con los 3 casos:
--      predecesor ya sellado (encadena al momento), predecesor pendiente que
--      se resuelve durante la espera (encadena correcto), y predecesor que
--      nunca se resuelve (lanza CADENA_PENDIENTE, no corrompe).
--
-- Reversible: DROP FUNCTION public.reservar_numero_factura(...); y
-- ALTER TABLE facturas DROP CONSTRAINT de las dos UNIQUE. La corrección de
-- datos (paso 1) no es "reversible" per se pero es un renumerado de
-- exclusivamente 2 filas de siembra jamás transmitidas — no toca facturas
-- reales ni nada transmitido a AEAT.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Corrige el ÚNICO duplicado real (studio-1, verifactu_seq=3, siembra sin
-- transmitir). Libera el hueco desplazando +1 los seq posteriores y asigna
-- el hueco liberado a la factura con el numero_completo mayor (A-2026-0028),
-- manteniendo A-2026-0027 en seq=3 (ese numero_completo no tuvo colisión).
update facturas
   set verifactu_seq = verifactu_seq + 1
 where studio_id = 'studio-1'
   and verifactu_seq >= 4;

update facturas
   set verifactu_seq = 4
 where id = 'fac-auto-1783688865320-feepl'
   and studio_id = 'studio-1';

-- 2) Red de seguridad dura.
alter table facturas
  add constraint facturas_studio_verifactu_seq_key unique (studio_id, verifactu_seq);

alter table facturas
  add constraint facturas_studio_numero_completo_key unique (studio_id, numero_completo);

-- 3) Reserva atómica.
create or replace function public.reservar_numero_factura(
  p_factura_id      text,
  p_studio_id       text,
  p_recibo_id       text,
  p_fecha_emision   date,
  p_receptor_nombre text,
  p_receptor_nif    text,
  p_base_imponible  numeric,
  p_tipo_iva        numeric,
  p_cuota_iva       numeric,
  p_total           numeric
)
returns table(numero_completo text, verifactu_seq bigint, verifactu_prev_hash text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_anio      int;
  v_max_num   int;
  v_numero    text;
  v_tip_hash  text;
  v_tip_seq   bigint;
  v_seq       bigint;
  v_intentos  int := 0;
begin
  -- Guard multi-inquilino, igual criterio que editar_serie_desde/reservar_plaza
  -- (service_role sin auth.uid() lo salta; es el único llamador real: solo se
  -- concede EXECUTE a service_role más abajo).
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Serializa TODAS las reservas concurrentes de este estudio. Se libera solo
  -- al terminar la transacción de esta función (XACT, no de sesión).
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':verifactu'));

  v_anio := extract(year from p_fecha_emision);

  select coalesce(max((regexp_match(f.numero_completo, 'A-\d{4}-(\d+)'))[1]::int), 0)
    into v_max_num
  from facturas f
  where f.studio_id = p_studio_id
    and f.numero_completo like ('A-' || v_anio || '-%');

  v_numero := 'A-' || v_anio || '-' || lpad((v_max_num + 1)::text, 4, '0');

  -- El extremo de la cadena: la última factura por seq. Si existe pero su
  -- huella todavía no se ha rellenado (otra reserva de este mismo estudio
  -- terminó de reservar pero su UPDATE con la huella —tras calcularHuellaAlta
  -- y, si aplica, Fiskaly— no ha vuelto todavía), se espera: no se puede
  -- encadenar contra una huella que no existe sin romper la cadena. Con el
  -- lock ya tomado, nadie más puede colarse por delante mientras se espera.
  loop
    select f.verifactu_hash, f.verifactu_seq
      into v_tip_hash, v_tip_seq
    from facturas f
    where f.studio_id = p_studio_id
      and f.verifactu_seq is not null
    order by f.verifactu_seq desc
    limit 1;

    exit when v_tip_seq is null or v_tip_hash is not null;

    v_intentos := v_intentos + 1;
    if v_intentos > 100 then
      raise exception 'CADENA_PENDIENTE: la factura anterior de este estudio no terminó de sellarse (huella pendiente). Reintenta en unos segundos.';
    end if;
    perform pg_sleep(0.05);
  end loop;

  v_seq := coalesce(v_tip_seq, 0) + 1;

  insert into facturas (
    id, studio_id, recibo_id, numero_completo, fecha_emision,
    receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total,
    verifactu_seq, verifactu_prev_hash
  ) values (
    p_factura_id, p_studio_id, p_recibo_id, v_numero, p_fecha_emision,
    p_receptor_nombre, p_receptor_nif, p_base_imponible, p_tipo_iva, p_cuota_iva, p_total,
    v_seq, coalesce(v_tip_hash, '')
  );

  return query select v_numero, v_seq, coalesce(v_tip_hash, '');
end;
$$;

revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric) from public;
grant execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric) to service_role;
