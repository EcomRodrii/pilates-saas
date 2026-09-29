-- 20260930003500 · TENTARE — el registro de facturación como entidad propia, y el registro de cada envío
--
-- Hasta aquí, «el registro Veri*Factu» eran unas columnas de `facturas`
-- (verifactu_hash/prev_hash/ts/seq/estado/csv). Eso no alcanza para lo que
-- exige la AEAT:
--
--  · Un registro RECHAZADO no se corrige tocándolo: se corrige con OTRO registro
--    (alta de subsanación, `Subsanacion=S`), con su propia huella y su propia
--    posición en la cadena. Una factura puede tener varios registros (alta,
--    subsanaciones, anulación). Cuadro de operativas del documento
--    «Validaciones» de la AEAT, v1.2.2, §6.
--  · El XML que se manda se congela la primera vez y NO se regenera nunca en un
--    reintento: se guarda en el propio registro.
--  · Hay que poder demostrar qué se mandó, cuándo, con qué credencial y qué
--    contestó la AEAT: `verifactu_envios`.
--
-- `facturas` sigue sellándose igual (reservar_numero_factura + UPDATE de la
-- huella en `lib/billing/sellar-factura-server.ts`, que NO se toca). Un trigger
-- crea el registro de ALTA en el mismo instante en que la factura recibe su
-- huella, y `facturas.verifactu_estado` pasa a ser un RESUMEN para pantallas y
-- sello del QR.
--
-- ⚠️ LA CADENA ES UNA SOLA POR ESTUDIO y la comparten facturas y registros: un
-- registro de subsanación o de anulación ocupa la siguiente posición (`seq`) y
-- la siguiente factura se encadena detrás de él. Por eso `reservar_numero_factura`
-- pasa a buscar la punta en `verifactu_punta_cadena`, que mira las dos cosas.
-- El resto de su cuerpo es EXACTAMENTE el vivo en producción (incluida la
-- comprobación de `modo_facturacion` de 20260929214142, PR #2370), verificado
-- con pg_get_functiondef el 30-sep-2026.
--
-- ⚠️ NADA SE TRANSMITE POR ESTA MIGRACIÓN. El cron solo manda registros de
-- estudios habilitados (con apoderamiento IZ860 verificado), y en esta fase
-- ninguno lo está.
--
-- TODO (decisión pendiente, NO CONFIRMADO con la AEAT) · HISTÓRICO: las
-- facturas selladas antes de la transmisión propia (verifactu_estado NULL)
-- entran como registros 'HISTORICO', fuera de la cola, igual que hasta ahora.
-- El cuadro de operativas de la AEAT tiene una vía para registros que existen
-- en el SIF y nunca se remitieron («alta de subsanación sin registro previo»,
-- Subsanacion=S + RechazoPrevio=X), pero mandarlos o no se decide aparte. Antes
-- de decidir, mirar `huella_verificada`: el 30-sep-2026, 13 registros
-- históricos del estudio de demostración NO reproducen su huella con los datos
-- actuales (sellados en julio, antes del control de NIF) y hay un eslabón roto
-- (la bifurcación que corrigió #510). `lib/verifactu/politica-cadena.ts`
-- (TRAS_ANTERIOR_HISTORICO) impide transmitir detrás de un histórico mientras
-- tanto.

-- ── La huella de alta, calculada en SQL SOLO para verificar ─────────────────
-- La huella la calcula siempre `lib/verifactu.ts` (TS). Esta función repite la
-- fórmula del documento «Especificaciones huella» de la AEAT únicamente para
-- comprobar que los campos guardados en el registro reproducen la huella que se
-- selló (`huella_verificada`). Si alguna vez divergen, manda TS; esto solo avisa.
create or replace function public.verifactu_huella_alta_sql(
  p_id_emisor text, p_num_serie text, p_fecha_expedicion text, p_tipo_factura text,
  p_cuota_total numeric, p_importe_total numeric, p_huella_anterior text, p_fecha_hora_huso text
) returns text
language sql immutable
set search_path = pg_catalog
as $$
  select upper(encode(sha256(convert_to(
    'IDEmisorFactura=' || p_id_emisor ||
    '&NumSerieFactura=' || p_num_serie ||
    '&FechaExpedicionFactura=' || p_fecha_expedicion ||
    '&TipoFactura=' || p_tipo_factura ||
    '&CuotaTotal=' || to_char(p_cuota_total, 'FM999999999990.00') ||
    '&ImporteTotal=' || to_char(p_importe_total, 'FM999999999990.00') ||
    '&Huella=' || coalesce(p_huella_anterior, '') ||
    '&FechaHoraHusoGenRegistro=' || p_fecha_hora_huso,
    'UTF8')), 'hex'));
$$;

revoke all on function public.verifactu_huella_alta_sql(text, text, text, text, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.verifactu_huella_alta_sql(text, text, text, text, numeric, numeric, text, text) to service_role;

-- ── verifactu_envios: un sobre SOAP = una fila ──────────────────────────────
create table if not exists public.verifactu_envios (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete restrict,
  nif_obligado text not null,
  operacion text not null check (operacion in ('REG_FACTU', 'CONSULTA')),
  entorno text not null check (entorno in ('preproduccion', 'produccion')),
  endpoint text not null,
  -- SHA-256 del .pfx configurado: identifica la credencial SIN guardarla.
  certificado_sha256 text not null,
  n_registros integer not null default 0 check (n_registros between 0 and 1000),
  -- El XML EXACTO que salió. Lleva datos fiscales y personales (receptor):
  -- nunca llega al navegador (sin grants a authenticated; ver RLS abajo).
  request_xml text not null,
  request_sha256 text not null,
  iniciado_en timestamptz not null default now(),
  terminado_en timestamptz,
  http_status integer,
  fallo_transporte text check (fallo_transporte in ('NO_ENVIADO', 'SIN_RESPUESTA', 'ILEGIBLE')),
  estado_envio text check (estado_envio in ('Correcto', 'ParcialmenteCorrecto', 'Incorrecto', 'FAULT')),
  fault_codigo text,
  respuesta_xml text,
  csv text,
  tiempo_espera_s integer,
  error text
);

create index if not exists idx_verifactu_envios_estudio on public.verifactu_envios (studio_id, iniciado_en desc);

comment on table public.verifactu_envios is
  'Cada llamada a la AEAT (alta/anulación o consulta): XML enviado, respuesta cruda, CSV, control de flujo y credencial usada (su huella, nunca el certificado). Solo service_role.';

-- ── verifactu_registros: el registro de facturación ─────────────────────────
create table if not exists public.verifactu_registros (
  id text primary key default gen_random_uuid()::text,
  studio_id text not null references public.studios(id) on delete restrict,
  factura_id text not null references public.facturas(id) on delete restrict,
  tipo text not null check (tipo in ('ALTA', 'ALTA_SUBSANACION', 'ANULACION')),
  -- Posición en la cadena del estudio. La comparten facturas y registros.
  seq bigint not null,

  -- Lo que entra en la huella. Se congela al crear el registro.
  id_emisor text not null,
  num_serie text not null,
  fecha_expedicion text not null check (fecha_expedicion ~ '^\d{2}-\d{2}-\d{4}$'),
  tipo_factura text,
  cuota_total numeric(14, 2),
  importe_total numeric(14, 2),
  huella_anterior text not null default '',
  fecha_hora_huso_gen text,
  huella text,
  -- ¿Reproducen los campos de arriba la huella guardada? (ver función arriba).
  -- NULL = no verificado (subsanaciones y anulaciones: su huella la calcula TS).
  huella_verificada boolean,

  -- El `RegistroAnterior` que va en el XML (datos del registro seq-1).
  anterior_id_emisor text,
  anterior_num_serie text,
  anterior_fecha_expedicion text,

  -- Marcas del cuadro de operativas (lib/verifactu/subsanacion.ts).
  subsanacion boolean not null default false,
  rechazo_previo text check (rechazo_previo in ('N', 'S', 'X')),
  sin_registro_previo boolean not null default false,
  -- A qué registro corrige o sustituye (subsanación) o qué alta anula.
  registro_origen_id text references public.verifactu_registros(id) on delete restrict,
  -- Correcciones de datos que NO entran en la huella (p. ej. nombre del
  -- receptor mal escrito), usadas al construir el XML de una subsanación.
  datos_corregidos jsonb,

  -- El XML, congelado la primera vez que se prepara. No se regenera nunca.
  xml_registro text,
  xml_sha256 text,

  -- Operativa (lib/verifactu/estado.ts).
  estado text not null default 'PENDIENTE' check (estado in (
    'RESERVADO', 'PENDIENTE', 'LISTO', 'ENVIANDO', 'REINTENTAR', 'INCIERTO',
    'REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT', 'RECHAZADA', 'HISTORICO'
  )),
  intentos integer not null default 0,
  proximo_intento_en timestamptz,
  envio_id uuid references public.verifactu_envios(id) on delete restrict,
  csv text,
  codigo_error text,
  descripcion_error text,
  estado_duplicado text check (estado_duplicado in ('Correcta', 'AceptadaConErrores', 'Anulada')),
  revision_manual boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint verifactu_registros_seq_unico unique (studio_id, seq),
  -- Sin huella solo mientras está reservado (la calcula TS justo después).
  constraint verifactu_registros_huella_presente check (huella is not null or estado = 'RESERVADO'),
  constraint verifactu_registros_huella_formato check (huella is null or huella ~ '^[0-9A-F]{64}$'),
  -- Un alta (normal o de subsanación) lleva tipo e importes; una anulación no.
  constraint verifactu_registros_campos_alta check (
    (tipo = 'ANULACION') = (tipo_factura is null and cuota_total is null and importe_total is null)
  ),
  constraint verifactu_registros_marcas check (
    ((tipo = 'ALTA_SUBSANACION') = subsanacion)
    and (rechazo_previo is distinct from 'X' or subsanacion)
    and (tipo <> 'ALTA' or (not subsanacion and not sin_registro_previo))
    and (tipo = 'ANULACION' or not sin_registro_previo)
  ),
  constraint verifactu_registros_xml_con_huella check (xml_registro is null or xml_sha256 is not null)
);

-- Un solo registro de ALTA inicial por factura.
create unique index if not exists uq_verifactu_registros_alta_por_factura
  on public.verifactu_registros (factura_id) where tipo = 'ALTA';

-- Lo que mira el cron: lo que no ha terminado, por estudio y en orden.
create index if not exists idx_verifactu_registros_activos
  on public.verifactu_registros (studio_id, seq)
  where estado in ('RESERVADO', 'PENDIENTE', 'LISTO', 'ENVIANDO', 'REINTENTAR', 'INCIERTO');

create index if not exists idx_verifactu_registros_factura on public.verifactu_registros (factura_id);

comment on table public.verifactu_registros is
  'Registros de facturación Veri*Factu (alta, alta de subsanación, anulación), uno por posición de la cadena del estudio. El XML se congela la primera vez y no se regenera. Máquina de estados: lib/verifactu/estado.ts.';

-- ── RLS y grants: cerrado hasta la PR 4 ─────────────────────────────────────
-- En esta fase nadie del cliente necesita leer esto: lo escribe y lo lee el
-- cron con service_role. La PR 4 abre la LECTURA a la propietaria de su propio
-- estudio (sin XML ni respuesta cruda) y añade los triggers de inmutabilidad.
alter table public.verifactu_envios enable row level security;
alter table public.verifactu_registros enable row level security;
revoke all on public.verifactu_envios from public, anon, authenticated;
revoke all on public.verifactu_registros from public, anon, authenticated;
grant select, insert, update on public.verifactu_envios to service_role;
grant select, insert, update on public.verifactu_registros to service_role;
-- Los privilegios por defecto del proyecto dan TODO a service_role en cada tabla
-- nueva (verificado el 30-sep: tenía DELETE). Un registro fiscal no se borra ni
-- desde el servidor: se quita explícitamente.
revoke delete, truncate on public.verifactu_envios from service_role;
revoke delete, truncate on public.verifactu_registros from service_role;

-- ── La punta de la cadena: facturas + registros que no son altas ────────────
-- Las ALTAS viven en `facturas` (el registro de ALTA es su espejo, creado por
-- trigger cuando llega la huella); las subsanaciones y anulaciones solo en
-- `verifactu_registros`. Una fila con huella NULL es una reserva en curso: quien
-- llama espera (misma regla que ya tenía reservar_numero_factura).
create or replace function public.verifactu_punta_cadena(p_studio_id text)
returns table(seq bigint, huella text, num_serie text, fecha_expedicion text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.seq, x.huella, x.num_serie, x.fecha_expedicion from (
    select f.verifactu_seq as seq, f.verifactu_hash as huella, f.numero_completo as num_serie,
           to_char(f.fecha_emision, 'DD-MM-YYYY') as fecha_expedicion
      from public.facturas f
     where f.studio_id = p_studio_id and f.verifactu_seq is not null
    union all
    select r.seq, r.huella, r.num_serie, r.fecha_expedicion
      from public.verifactu_registros r
     where r.studio_id = p_studio_id and r.tipo <> 'ALTA'
  ) x
  order by x.seq desc
  limit 1;
$$;

revoke all on function public.verifactu_punta_cadena(text) from public, anon, authenticated;
grant execute on function public.verifactu_punta_cadena(text) to service_role;

-- ── reservar_numero_factura: idéntica a la viva, salvo la punta ─────────────
-- Misma firma de 16 argumentos: `create or replace` conserva dueño y grants
-- (se comprueban con has_function_privilege al aplicar).
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
    -- ÚNICO cambio respecto a la versión viva: la punta de la cadena incluye
    -- los registros de subsanación y anulación (verifactu_registros).
    select p.huella, p.seq
      into v_tip_hash, v_tip_seq
    from public.verifactu_punta_cadena(p_studio_id) p;

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

-- Los privilegios que tiene HOY en producción (has_function_privilege, 30-sep):
-- ni anon ni authenticated, solo service_role. Se reescriben explícitos para
-- que un `create or replace` futuro con otra firma no herede el EXECUTE por
-- defecto (gotcha documentado en .claude/tentare-os.md).
revoke all on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) to service_role;

-- ── reservar_registro_verifactu: posición para una subsanación o anulación ──
-- Mismo cerrojo y misma punta que las facturas. Deja la fila RESERVADA sin
-- huella; `lib/verifactu/registros.ts` calcula la huella en TS (lib/verifactu.ts,
-- la única implementación que manda) y la completa. Mientras tanto, la punta
-- tiene huella NULL y cualquier otra reserva de ese estudio espera.
create or replace function public.reservar_registro_verifactu(
  p_studio_id text,
  p_factura_id text,
  p_tipo text,
  p_rechazo_previo text,
  p_sin_registro_previo boolean,
  p_registro_origen_id text,
  p_datos_corregidos jsonb default null
)
returns table(id text, seq bigint, huella_anterior text, anterior_num_serie text, anterior_fecha_expedicion text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_f           record;
  v_emisor      text;
  v_tip         record;
  v_intentos    int := 0;
  v_id          text;
  v_anterior_emisor text;
begin
  if not public.es_llamada_servicio() then
    raise exception 'SOLO_SERVICIO';
  end if;
  if p_tipo not in ('ALTA_SUBSANACION', 'ANULACION') then
    raise exception 'TIPO_INVALIDO: %', p_tipo;
  end if;

  select f.* into v_f from facturas f where f.id = p_factura_id and f.studio_id = p_studio_id;
  if not found then raise exception 'FACTURA_NO_ENCONTRADA'; end if;
  if v_f.verifactu_hash is null then raise exception 'FACTURA_SIN_SELLAR'; end if;

  -- El emisor es el del ALTA de esa factura: la huella del registro nuevo usa
  -- el mismo IDEmisorFactura que se selló, no el NIF que tenga hoy el estudio.
  select r.id_emisor into v_emisor from verifactu_registros r where r.factura_id = p_factura_id and r.tipo = 'ALTA';
  if v_emisor is null then raise exception 'FACTURA_SIN_REGISTRO_DE_ALTA'; end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':verifactu'));

  loop
    select * into v_tip from public.verifactu_punta_cadena(p_studio_id);
    exit when v_tip.seq is null or v_tip.huella is not null;
    v_intentos := v_intentos + 1;
    if v_intentos > 100 then
      raise exception 'CADENA_PENDIENTE: hay un registro de este estudio sin terminar de sellar.';
    end if;
    perform pg_sleep(0.05);
  end loop;

  -- El IDEmisorFactura del anterior: el de su registro si lo hay (altas y
  -- no-altas lo guardan); si no, el emisor de este (mismo estudio).
  select r.id_emisor into v_anterior_emisor from verifactu_registros r
   where r.studio_id = p_studio_id and r.seq = v_tip.seq;

  insert into verifactu_registros (
    studio_id, factura_id, tipo, seq,
    id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total,
    huella_anterior, anterior_id_emisor, anterior_num_serie, anterior_fecha_expedicion,
    subsanacion, rechazo_previo, sin_registro_previo, registro_origen_id, datos_corregidos,
    estado
  ) values (
    p_studio_id, p_factura_id, p_tipo, coalesce(v_tip.seq, 0) + 1,
    v_emisor, v_f.numero_completo, to_char(v_f.fecha_emision, 'DD-MM-YYYY'),
    case when p_tipo = 'ANULACION' then null else v_f.tipo end,
    case when p_tipo = 'ANULACION' then null else v_f.cuota_iva end,
    case when p_tipo = 'ANULACION' then null else v_f.total end,
    coalesce(v_tip.huella, ''),
    case when v_tip.seq is null then null else coalesce(v_anterior_emisor, v_emisor) end,
    v_tip.num_serie, v_tip.fecha_expedicion,
    p_tipo = 'ALTA_SUBSANACION', p_rechazo_previo, coalesce(p_sin_registro_previo, false),
    p_registro_origen_id, p_datos_corregidos,
    'RESERVADO'
  )
  returning verifactu_registros.id into v_id;

  return query select v_id, coalesce(v_tip.seq, 0) + 1, coalesce(v_tip.huella, ''), v_tip.num_serie, v_tip.fecha_expedicion;
end;
$$;

revoke all on function public.reservar_registro_verifactu(text, text, text, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.reservar_registro_verifactu(text, text, text, text, boolean, text, jsonb) to service_role;

-- ── El registro de ALTA nace cuando la factura recibe su huella ─────────────
create or replace function public.verifactu_registro_de_alta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nif     text;
  v_fecha   text;
  v_ant     record;
begin
  if new.verifactu_hash is null or new.verifactu_seq is null then return new; end if;
  if tg_op = 'UPDATE' and old.verifactu_hash is not null then return new; end if;

  -- El mismo NIF que usa el sellado para la huella (`studios.nif`, recortado).
  select btrim(s.nif) into v_nif from studios s where s.id = new.studio_id;
  v_fecha := to_char(new.fecha_emision, 'DD-MM-YYYY');

  select r.id_emisor, r.num_serie, r.fecha_expedicion into v_ant
    from verifactu_registros r
   where r.studio_id = new.studio_id and r.seq = new.verifactu_seq - 1;

  insert into verifactu_registros (
    studio_id, factura_id, tipo, seq,
    id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total,
    huella_anterior, fecha_hora_huso_gen, huella, huella_verificada,
    anterior_id_emisor, anterior_num_serie, anterior_fecha_expedicion,
    estado, csv
  ) values (
    new.studio_id, new.id, 'ALTA', new.verifactu_seq,
    coalesce(v_nif, ''), new.numero_completo, v_fecha, new.tipo, new.cuota_iva, new.total,
    coalesce(new.verifactu_prev_hash, ''), new.verifactu_ts, new.verifactu_hash,
    public.verifactu_huella_alta_sql(coalesce(v_nif, ''), new.numero_completo, v_fecha, new.tipo,
      new.cuota_iva, new.total, new.verifactu_prev_hash, new.verifactu_ts) = new.verifactu_hash,
    v_ant.id_emisor, v_ant.num_serie, v_ant.fecha_expedicion,
    -- NULL en la factura = fuera de la cola (histórico). Cualquier otro valor
    -- que llegue aquí es el de una factura recién sellada: PENDIENTE.
    case when new.verifactu_estado is null then 'HISTORICO' else 'PENDIENTE' end,
    null
  )
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.verifactu_registro_de_alta() from public, anon, authenticated;

drop trigger if exists trg_verifactu_registro_de_alta on public.facturas;
create trigger trg_verifactu_registro_de_alta
  after insert or update of verifactu_hash on public.facturas
  for each row execute function public.verifactu_registro_de_alta();

-- ── Relleno: un registro de ALTA por cada factura ya sellada ───────────────
insert into public.verifactu_registros (
  studio_id, factura_id, tipo, seq,
  id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total,
  huella_anterior, fecha_hora_huso_gen, huella, huella_verificada,
  anterior_id_emisor, anterior_num_serie, anterior_fecha_expedicion,
  estado, csv
)
select
  x.studio_id, x.id, 'ALTA', x.verifactu_seq,
  x.nif, x.numero_completo, x.fecha, x.tipo, x.cuota_iva, x.total,
  coalesce(x.verifactu_prev_hash, ''), x.verifactu_ts, x.verifactu_hash,
  public.verifactu_huella_alta_sql(x.nif, x.numero_completo, x.fecha, x.tipo, x.cuota_iva, x.total, x.verifactu_prev_hash, x.verifactu_ts) = x.verifactu_hash,
  case when x.seq_ant = x.verifactu_seq - 1 then x.nif end,
  case when x.seq_ant = x.verifactu_seq - 1 then x.num_ant end,
  case when x.seq_ant = x.verifactu_seq - 1 then x.fecha_ant end,
  case x.verifactu_estado
    when 'PENDIENTE' then 'PENDIENTE'
    when 'REGISTRADA' then 'REGISTRADA'
    when 'ACEPTADA_CON_ERRORES' then 'ACEPTADA_CON_ERRORES'
    when 'RECHAZADA' then 'RECHAZADA'
    else 'HISTORICO'
  end,
  x.verifactu_csv
from (
  select f.*, coalesce(btrim(s.nif), '') as nif, to_char(f.fecha_emision, 'DD-MM-YYYY') as fecha,
         lag(f.verifactu_seq) over w as seq_ant,
         lag(f.numero_completo) over w as num_ant,
         lag(to_char(f.fecha_emision, 'DD-MM-YYYY')) over w as fecha_ant
    from public.facturas f
    join public.studios s on s.id = f.studio_id
   where f.verifactu_hash is not null and f.verifactu_seq is not null
  window w as (partition by f.studio_id order by f.verifactu_seq)
) x
on conflict do nothing;

-- ── facturas.verifactu_estado: el resumen admite ANULADA ────────────────────
alter table public.facturas drop constraint if exists facturas_verifactu_estado_valido;
alter table public.facturas
  add constraint facturas_verifactu_estado_valido check (
    verifactu_estado is null or verifactu_estado in (
      'PENDIENTE', 'REGISTRADA', 'ACEPTADA_CON_ERRORES', 'RECHAZADA', 'ANULADA'
    )
  );

comment on column public.facturas.verifactu_estado is
  'RESUMEN del registro vigente de la factura (el detalle está en verifactu_registros). NULL = fuera de la cola (histórico). PENDIENTE = aún no admitida. REGISTRADA/ACEPTADA_CON_ERRORES = admitida (lleva QR). RECHAZADA = requiere subsanación. ANULADA = anulada en la AEAT.';
