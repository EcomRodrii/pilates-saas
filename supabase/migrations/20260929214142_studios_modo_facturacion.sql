-- Cada estudio elige si emite facturas desde Tentare (con su registro para
-- Veri*Factu) o si sus facturas las hace fuera. Decisión del fundador
-- (16-sep y 29-sep-2026): por defecto, APAGADO.
--
-- «Apagado» NO es «facturas sin Veri*Factu». Es que Tentare no emite facturas:
-- cada cobro deja el recibo y la alumna recibe su justificante de pago, y el
-- estudio factura con su gestoría u otro programa. Facturas numeradas sin
-- registro dejan de estar permitidas en 2027, y el modo «no verificable» del
-- reglamento (registros firmados sin envío) exige una firma XAdES que Tentare no
-- tiene. Un booleano `verifactu_activo = false` invitaba a leerlo justo como lo
-- que no es; por eso es un texto con dos valores.
--
-- Se puede volver a apagar después de haber facturado («congelar»): no se emiten
-- facturas nuevas y, al encender otra vez, la cadena sigue donde estaba (es por
-- estudio y no se toca). Lo ya emitido y en cola se sigue transmitiendo cuando
-- haya con qué: son facturas que ya tienen sus alumnas. Y una rectificativa de
-- una factura ya emitida se deja emitir aunque esté apagado: una factura
-- entregada tiene que poder corregirse.
--
-- La base de datos es la que lo impide, no la pantalla: `reservar_numero_factura`
-- (la única puerta por la que nace una factura, llegue por el cobro, el TPV, el
-- panel o una ruta nueva) rechaza la serie A si el estudio no está en
-- 'verifactu'.

alter table public.studios
  add column if not exists modo_facturacion text not null default 'sin_facturas';

alter table public.studios drop constraint if exists studios_modo_facturacion_valido;
alter table public.studios
  add constraint studios_modo_facturacion_valido check (modo_facturacion in ('sin_facturas', 'verifactu'));

comment on column public.studios.modo_facturacion is
  '''verifactu'' = Tentare emite una factura por cobro (salvo efectivo) con registro Veri*Factu encadenado. ''sin_facturas'' (por defecto) = no emite facturas: solo recibo y justificante; el estudio factura fuera. Se puede cambiar en los dos sentidos; la cadena de cada estudio no se toca.';

-- Los estudios que YA tienen registros siguen como estaban (decisión del
-- fundador). El resto no podía facturar de todas formas: sin NIF válido,
-- `sellarFacturaDeRecibo` ya se negaba.
update public.studios s
   set modo_facturacion = 'verifactu'
 where exists (select 1 from public.facturas f where f.studio_id = s.id and f.verifactu_seq is not null);

-- Lo cambia la propietaria desde Configuración con su sesión (`owner_studios`
-- ya limita el UPDATE de `studios` a PROPIETARIO). `studios` da el UPDATE por
-- columnas: sin esta línea, el PATCH no guarda y la RLS ni llega a mirarse.
grant update (modo_facturacion) on public.studios to authenticated;

-- La puerta. Misma firma de 16 argumentos que la versión viva (con la guardia
-- `es_llamada_servicio()` de 20260913233644, NO la de `auth.uid()` que aún
-- aparece en el fichero de 20260910205055): `create or replace` sobre la misma
-- firma conserva dueño y grants. Se verifican igual al final.
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
  v_modo      text;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if p_serie not in ('A', 'R') then
    raise exception 'SERIE_INVALIDA: % no es una serie reconocida', p_serie;
  end if;

  -- Con el estudio en 'sin_facturas', ninguna factura nueva. `for share`: si la
  -- propietaria lo está apagando en este mismo instante, una de las dos espera
  -- a la otra y no nace una factura a medio camino. La rectificativa (serie R)
  -- sí pasa: corrige una factura que ya existe.
  select s.modo_facturacion into v_modo from studios s where s.id = p_studio_id for share;
  if p_serie = 'A' and v_modo is distinct from 'verifactu' then
    raise exception 'FACTURACION_DESACTIVADA: este estudio no emite facturas desde Tentare';
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
      raise exception 'CADENA_PENDIENTE: la factura anterior de este estudio no termino de sellarse (huella pendiente). Reintenta en unos segundos.';
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
    nullif(btrim(p_concepto), '')
  );

  return query select v_numero, v_seq, coalesce(v_tip_hash, '');
end;
$function$;

-- Por escrito, aunque `create or replace` sobre la misma firma conserve los
-- permisos: solo el servidor. Revocar PUBLIC no basta en este proyecto
-- (`pg_default_acl` los da directos a anon/authenticated).
revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from public, anon;
revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from authenticated;
grant execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) to service_role;

-- Verificación: ni el cliente ejecuta la puerta, ni pierde el servidor el
-- permiso, y la propietaria puede escribir la columna.
do $$
declare
  f regprocedure := 'public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'anon puede ejecutar reservar_numero_factura'; end if;
  if has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'authenticated puede ejecutar reservar_numero_factura'; end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'service_role no puede ejecutar reservar_numero_factura'; end if;
  if not has_column_privilege('authenticated', 'public.studios', 'modo_facturacion', 'UPDATE') then
    raise exception 'modo_facturacion: authenticated sin UPDATE';
  end if;
end $$;
