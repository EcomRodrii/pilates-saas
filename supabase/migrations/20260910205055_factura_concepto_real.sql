-- El concepto de la factura, guardado EN la factura al sellarla.
--
-- Hasta ahora no existía: la pantalla, el PDF y el XML de la AEAT pintaban cada
-- uno un literal distinto («Servicios de pilates», «Cuota mensual / bono»,
-- «Servicios de actividad física») pasara lo que pasara. Una factura de un
-- «Bono 10 clases» decía lo mismo que una cuota mensual.
--
-- ⚠️ Se GUARDA, no se lee del recibo en vivo, y esa es la decisión importante:
-- una factura emitida es un documento cerrado. Si se leyera `recibos.concepto`
-- al pintar, editar el concepto de un recibo mañana reescribiría lo que muestra
-- una factura ya sellada — inmutabilidad rota por la puerta de atrás.
--
-- NULL = factura sellada ANTES de este cambio. No se rellena ninguna: las 40 de
-- producción se quedan exactamente como están, y quien las pinte cae al texto
-- genérico de siempre (`conceptoDeFactura`, lib/facturas/concepto.ts).
alter table public.facturas add column if not exists concepto text;

comment on column public.facturas.concepto is
  'Concepto copiado de recibos.concepto al SELLAR. NULL = factura anterior a este cambio (cae al texto genérico). Nunca se reescribe: la factura es un documento cerrado.';

-- La RPC gana `p_concepto`. Va con DEFAULT NULL a propósito: entre aplicar esta
-- migración y desplegar el código nuevo hay una ventana en la que el código
-- viejo sigue llamando sin ese parámetro, y así no se rompe (sella sin concepto,
-- que es exactamente lo que hacía antes).
create or replace function public.reservar_numero_factura(
  p_factura_id text, p_studio_id text, p_recibo_id text, p_fecha_emision date,
  p_receptor_nombre text, p_receptor_nif text, p_base_imponible numeric,
  p_tipo_iva numeric, p_cuota_iva numeric, p_total numeric,
  p_serie text default 'A'::text, p_tipo text default null::text,
  p_rectifica_a text default null::text, p_tipo_rectificativa text default null::text,
  p_importe_rectificacion numeric default null::numeric,
  p_concepto text default null::text
)
returns table(numero_completo text, verifactu_seq bigint, verifactu_prev_hash text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_anio      int;
  v_max_num   int;
  v_numero    text;
  v_tip_hash  text;
  v_tip_seq   bigint;
  v_seq       bigint;
  v_intentos  int := 0;
  v_tipo      text;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if p_serie not in ('A', 'R') then
    raise exception 'SERIE_INVALIDA: % no es una serie reconocida', p_serie;
  end if;

  v_tipo := coalesce(p_tipo, case when p_receptor_nif is not null and p_receptor_nif <> '' then 'F1' else 'F2' end);
  if v_tipo not in ('F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5') then
    raise exception 'TIPO_INVALIDO: %', v_tipo;
  end if;

  if (v_tipo in ('R1', 'R2', 'R3', 'R4', 'R5')) <> (p_tipo_rectificativa is not null) then
    raise exception 'TIPO_RECTIFICATIVA_INCONSISTENTE: % requiere tipo_rectificativa, % no lo admite', v_tipo, v_tipo;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':verifactu'));

  v_anio := extract(year from p_fecha_emision);

  select coalesce(max((regexp_match(f.numero_completo, p_serie || '-\d{4}-(\d+)'))[1]::int), 0)
    into v_max_num
  from facturas f
  where f.studio_id = p_studio_id
    and f.numero_completo like (p_serie || '-' || v_anio || '-%');

  v_numero := p_serie || '-' || v_anio || '-' || lpad((v_max_num + 1)::text, 4, '0');

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
    verifactu_seq, verifactu_prev_hash, serie, tipo,
    rectifica_a, tipo_rectificativa, importe_rectificacion, concepto
  ) values (
    p_factura_id, p_studio_id, p_recibo_id, v_numero, p_fecha_emision,
    p_receptor_nombre, p_receptor_nif, p_base_imponible, p_tipo_iva, p_cuota_iva, p_total,
    v_seq, coalesce(v_tip_hash, ''), p_serie, v_tipo,
    p_rectifica_a, p_tipo_rectificativa, p_importe_rectificacion,
    -- Vacío = como si no viniera. Un concepto en blanco en una factura no dice
    -- nada, y así cae al genérico en vez de imprimir un hueco.
    nullif(btrim(p_concepto), '')
  );

  return query select v_numero, v_seq, coalesce(v_tip_hash, '');
end;
$function$;

-- La firma vieja (15 args) SE BORRA. `create or replace` con un argumento más
-- crea un objeto función NUEVO y deja el anterior vivo: dos funciones con los
-- mismos 10 primeros parámetros y defaults para el resto es una llamada
-- ambigua, y además una segunda puerta que nadie mantiene.
drop function if exists public.reservar_numero_factura(
  text, text, text, date, text, text, numeric, numeric, numeric, numeric,
  text, text, text, text, numeric
);

-- Grants: firma nueva = objeto función nuevo = nace con EXECUTE para PUBLIC y,
-- por el pg_default_acl de este proyecto, DIRECTO para anon/authenticated.
-- Revocar PUBLIC no le quita nada a anon. Los tres pasos, sin excepción.
revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from public;
revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from anon;
revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from authenticated;
grant execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) to service_role;
