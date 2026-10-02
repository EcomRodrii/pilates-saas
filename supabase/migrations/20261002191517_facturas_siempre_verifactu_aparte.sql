-- Factura SIEMPRE; Veri*Factu, aparte (decisión del fundador, 2-oct-2026).
--
-- Hasta hoy «emitir factura» y «enviarla a la AEAT» eran la misma cosa: un estudio
-- sin el envío a la AEAT activado no emitía NINGUNA factura ('sin_facturas'), y los
-- diez estudios de producción estaban así. Un cobro con tarjeta no dejaba factura.
--
-- Ahora son dos cosas:
--   · 'facturas'      → Tentare emite la factura (número correlativo por serie y
--                        año, importes, receptor). Sin huella, sin QR y sin envío.
--                        Es el modo por defecto.
--   · 'verifactu'     → además la encadena (huella) y la pone en la cola de la AEAT.
--                        Solo con el envío activado (trigger
--                        studios_facturas_exigen_envio_activo, sin cambios).
--   · 'sin_facturas'  → se queda como estado de SISTEMA que nadie elige: ya no
--                        lo pone ni el alta ni la pérdida del poder ante la AEAT.
--
-- La huella NO se calcula mientras Veri*Factu esté apagado: una factura de
-- 'facturas' nace con verifactu_seq y verifactu_prev_hash a NULL y no ocupa sitio
-- en la cadena. Si el estudio activa Veri*Factu después, su cadena empieza ahí.
--
-- Quién cambia el modo: solo el servidor (activar/desactivar el envío es una ruta
-- de la propietaria con service_role). El navegador ya no escribe la columna.

-- 1. Los valores y el valor por defecto ─────────────────────────────────────────
alter table public.studios drop constraint if exists studios_modo_facturacion_valido;
alter table public.studios
  add constraint studios_modo_facturacion_valido
  check (modo_facturacion in ('facturas', 'verifactu', 'sin_facturas'));
alter table public.studios alter column modo_facturacion set default 'facturas';

-- Todos los que no emitían pasan a emitir. Desde ya, no hacia atrás: los cobros
-- anteriores no se facturan solos (lo decide FACTURA_SIEMPRE_DESDE en el código).
update public.studios set modo_facturacion = 'facturas' where modo_facturacion = 'sin_facturas';

-- 2. El navegador no cambia el modo ─────────────────────────────────────────────
-- Un REVOKE de columna sí resta de un GRANT de columna (no hay grant de tabla de
-- UPDATE para authenticated en studios). El INSERT del alta (dbCreateStudio) va
-- con la sesión de la propietaria: lo cubre el trigger, que fuerza el defecto.
revoke update (modo_facturacion) on public.studios from authenticated, anon;

create or replace function public.studios_modo_facturacion_solo_servidor()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if public.es_llamada_servicio() then return new; end if;
  if tg_op = 'INSERT' then
    new.modo_facturacion := 'facturas';
  elsif new.modo_facturacion is distinct from old.modo_facturacion then
    raise exception 'MODO_FACTURACION_SOLO_SERVIDOR: el modo de facturación se cambia desde Configuración'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.studios_modo_facturacion_solo_servidor() from public, anon, authenticated;

drop trigger if exists trg_studios_modo_facturacion_solo_servidor on public.studios;
-- Corre DESPUÉS de trg_studios_facturas_exigen_envio_activo (orden alfabético):
-- un alta que pida 'verifactu' sin envío activo la rechaza esa; cualquier otro
-- valor que traiga el alta lo pisa esta con 'facturas'.
create trigger trg_studios_modo_facturacion_solo_servidor
  before insert or update of modo_facturacion on public.studios
  for each row execute function public.studios_modo_facturacion_solo_servidor();

-- 3. Perder el poder ante la AEAT ya no deja al estudio sin facturas ─────────────
create or replace function public.verifactu_sin_poder_para_facturas()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.estado in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO')
     and new.estado not in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO') then
    -- Sigue emitiendo facturas, sin envío: «factura siempre».
    update studios
       set modo_facturacion = 'facturas'
     where id = new.studio_id
       and modo_facturacion = 'verifactu';
  end if;
  return null;
end;
$$;
-- Función de trigger: nadie la llama a mano.
revoke all on function public.verifactu_sin_poder_para_facturas() from public, anon, authenticated;

-- 4. Reservar número: con cadena con Veri*Factu, o si rectifica una con cadena ──
-- Una rectificativa sigue a su ORIGINAL, no al modo de hoy: si la original está
-- en la cadena (y en la cola de la AEAT), su rectificativa también, o el día que se
-- active el envío iría el alta y nunca su corrección.
create or replace function public.reservar_numero_factura(
  p_factura_id text, p_studio_id text, p_recibo_id text, p_fecha_emision date,
  p_receptor_nombre text, p_receptor_nif text, p_base_imponible numeric, p_tipo_iva numeric,
  p_cuota_iva numeric, p_total numeric, p_serie text default 'A'::text, p_tipo text default null::text,
  p_rectifica_a text default null::text, p_tipo_rectificativa text default null::text,
  p_importe_rectificacion numeric default null::numeric, p_concepto text default null::text)
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
  v_encadena  boolean;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if p_serie not in ('A', 'R') then
    raise exception 'SERIE_INVALIDA: % no es una serie reconocida', p_serie;
  end if;

  select s.modo_facturacion into v_modo from studios s where s.id = p_studio_id for share;
  if p_serie = 'A' and v_modo not in ('facturas', 'verifactu') then
    raise exception 'FACTURACION_DESACTIVADA: este estudio no emite facturas desde Tentare';
  end if;

  v_tipo := coalesce(p_tipo, case when p_receptor_nif is not null and p_receptor_nif <> '' then 'F1' else 'F2' end);
  if v_tipo not in ('F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5') then
    raise exception 'TIPO_INVALIDO: %', v_tipo;
  end if;

  if (v_tipo in ('R1', 'R2', 'R3', 'R4', 'R5')) <> (p_tipo_rectificativa is not null) then
    raise exception 'TIPO_RECTIFICATIVA_INCONSISTENTE: % requiere tipo_rectificativa, % no lo admite', v_tipo, v_tipo;
  end if;

  -- El mismo lock para las dos: la NUMERACIÓN por serie y año es una sola, con
  -- Veri*Factu o sin él.
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':verifactu'));

  -- Una sola factura de serie A por recibo. Bajo el lock: dos sellados del mismo
  -- recibo con ids distintos (webhook, conciliador, mostrador) ya no sacan dos
  -- facturas numeradas. 23505 es lo que el servidor ya trata como «retómala».
  if p_serie = 'A' and p_recibo_id is not null and exists (
    select 1 from facturas f
     where f.studio_id = p_studio_id and f.recibo_id = p_recibo_id
       and f.serie = 'A' and f.id is distinct from p_factura_id
  ) then
    raise exception 'FACTURA_YA_EMITIDA: el recibo % ya tiene factura', p_recibo_id
      using errcode = 'unique_violation';
  end if;

  v_encadena := v_modo = 'verifactu'
    or (p_serie = 'R' and exists (
      select 1 from facturas o
       where o.id = p_rectifica_a and o.studio_id = p_studio_id and o.verifactu_seq is not null
    ));

  v_anio := extract(year from p_fecha_emision);

  select coalesce(max((regexp_match(f.numero_completo, p_serie || '-\d{4}-(\d+)'))[1]::int), 0)
    into v_max_num
  from facturas f
  where f.studio_id = p_studio_id
    and f.numero_completo like (p_serie || '-' || v_anio || '-%');

  v_numero := p_serie || '-' || v_anio || '-' || lpad((v_max_num + 1)::text, 4, '0');

  -- Sin Veri*Factu: la factura nace emitida, sin sitio en la cadena y sin huella.
  if not v_encadena then
    insert into facturas (
      id, studio_id, recibo_id, numero_completo, fecha_emision,
      receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total,
      verifactu_seq, verifactu_prev_hash, serie, tipo,
      rectifica_a, tipo_rectificativa, importe_rectificacion, concepto
    ) values (
      p_factura_id, p_studio_id, p_recibo_id, v_numero, p_fecha_emision,
      p_receptor_nombre, p_receptor_nif, p_base_imponible, p_tipo_iva, p_cuota_iva, p_total,
      null, null, p_serie, v_tipo,
      p_rectifica_a, p_tipo_rectificativa, p_importe_rectificacion,
      nullif(btrim(p_concepto), '')
    );
    return query select v_numero, null::bigint, null::text;
    return;
  end if;

  loop
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

-- Solo el servidor (ver default ACL: revocar PUBLIC no basta).
revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text) to service_role;

-- 5. Una factura sin Veri*Factu también es inmutable ────────────────────────────
-- Emitida = con huella (Veri*Factu) o sin sitio en la cadena (sin Veri*Factu). Lo
-- único editable es una reserva de Veri*Factu a medias: seq puesto y huella no.
create or replace function public.factura_sellada_inmutable()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.verifactu_hash is not null or old.verifactu_seq is null then
      raise exception 'FACTURA_SELLADA: una factura emitida no se borra (%); se anula o se rectifica', old.numero_completo;
    end if;
    return old;
  end if;
  if old.verifactu_hash is null and old.verifactu_seq is not null then return new; end if;
  if (new.studio_id, new.numero_completo, new.fecha_emision, new.receptor_nombre, new.receptor_nif,
      new.base_imponible, new.tipo_iva, new.cuota_iva, new.total,
      new.verifactu_hash, new.verifactu_prev_hash, new.verifactu_ts, new.verifactu_seq,
      new.serie, new.tipo, new.rectifica_a, new.tipo_rectificativa, new.importe_rectificacion, new.concepto)
     is distinct from
     (old.studio_id, old.numero_completo, old.fecha_emision, old.receptor_nombre, old.receptor_nif,
      old.base_imponible, old.tipo_iva, old.cuota_iva, old.total,
      old.verifactu_hash, old.verifactu_prev_hash, old.verifactu_ts, old.verifactu_seq,
      old.serie, old.tipo, old.rectifica_a, old.tipo_rectificativa, old.importe_rectificacion, old.concepto) then
    raise exception 'FACTURA_SELLADA: los datos fiscales de % no se modifican; se corrige con una rectificativa o una subsanación', old.numero_completo;
  end if;
  return new;
end;
$function$;

-- 6. Comprobación de privilegios ───────────────────────────────────────────────
do $$
declare
  f regprocedure := 'public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric, text)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'reservar_numero_factura sigue ejecutable desde el cliente';
  end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'reservar_numero_factura sin EXECUTE para service_role';
  end if;
  if has_column_privilege('authenticated', 'public.studios', 'modo_facturacion', 'UPDATE') then
    raise exception 'authenticated sigue pudiendo cambiar studios.modo_facturacion';
  end if;
end $$;
