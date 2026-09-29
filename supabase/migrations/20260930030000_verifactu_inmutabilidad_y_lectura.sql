-- 20260930030000 · TENTARE — Veri*Factu: inmutabilidad, control de flujo y lectura por estudio
--
-- Art. 29.2.j LGT: los sistemas de facturación deben garantizar «integridad,
-- conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad de
-- los registros, sin interpolaciones, omisiones o alteraciones». La cadena de
-- huellas lo DETECTA; esto lo IMPIDE en la propia base, también para
-- service_role (que en este proyecto recibe todos los privilegios por defecto).
--
--  1. `verifactu_registros`: una vez creado, lo que forma el registro no cambia.
--     Solo se mueven las columnas operativas (estado, intentos, envío, CSV,
--     error, marcas de revisión, marcas de tiempo). La huella se escribe UNA vez
--     (al completar una reserva) y el XML UNA vez (al prepararlo). No se borra.
--     Las transiciones de estado son las de `lib/verifactu/estado.ts`
--     (TRANSICIONES); `verifactu-migraciones.test.ts` comprueba que coinciden.
--  2. `verifactu_envios`: lo enviado no cambia; la respuesta se anota una sola
--     vez (al terminar). No se borra.
--  3. `facturas`: una factura SELLADA (con huella) no cambia sus datos
--     fiscales ni se borra. Se sigue pudiendo sellar (huella de NULL a valor) y
--     actualizar su estado de envío.
--  4. `verifactu_control_flujo`: el `TiempoEsperaEnvio` de la AEAT, persistido.
--     Ámbito GLOBAL (clave 'global') mientras la AEAT no confirme si cuenta por
--     certificado, por obligado o por SIF — PENDIENTE DE CONFIRMACIÓN AEAT.
--  5. Lectura desde el cliente: la propietaria (y recepción, para los registros,
--     igual que `facturas`) ve lo de SU estudio, sin XML, sin respuesta cruda y
--     sin la traza técnica del envío.

-- ── 1 · verifactu_registros ─────────────────────────────────────────────────
create or replace function public.verifactu_transicion_permitida(p_de text, p_a text)
returns boolean
language sql immutable
set search_path = pg_catalog
as $$
  -- Espejo de TRANSICIONES en lib/verifactu/estado.ts.
  select p_de = p_a or (p_de, p_a) in (
    ('RESERVADO', 'PENDIENTE'),
    ('PENDIENTE', 'LISTO'), ('PENDIENTE', 'RECHAZADA'),
    ('LISTO', 'ENVIANDO'),
    ('ENVIANDO', 'REGISTRADA'), ('ENVIANDO', 'ACEPTADA_CON_ERRORES'), ('ENVIANDO', 'ANULADA_EN_AEAT'),
    ('ENVIANDO', 'RECHAZADA'), ('ENVIANDO', 'REINTENTAR'), ('ENVIANDO', 'INCIERTO'), ('ENVIANDO', 'LISTO'),
    ('REINTENTAR', 'LISTO'), ('REINTENTAR', 'ENVIANDO'),
    ('INCIERTO', 'REGISTRADA'), ('INCIERTO', 'ACEPTADA_CON_ERRORES'), ('INCIERTO', 'ANULADA_EN_AEAT'), ('INCIERTO', 'LISTO')
  );
$$;

create or replace function public.verifactu_registro_inmutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'VERIFACTU_INMUTABLE: un registro de facturación no se borra (%)', old.id;
  end if;

  -- Lo que forma el registro.
  if (new.id, new.studio_id, new.factura_id, new.tipo, new.seq, new.id_emisor, new.num_serie, new.fecha_expedicion,
      new.tipo_factura, new.cuota_total, new.importe_total, new.huella_anterior,
      new.anterior_id_emisor, new.anterior_num_serie, new.anterior_fecha_expedicion,
      new.subsanacion, new.rechazo_previo, new.sin_registro_previo, new.registro_origen_id, new.datos_corregidos,
      new.huella_verificada, new.creado_en)
     is distinct from
     (old.id, old.studio_id, old.factura_id, old.tipo, old.seq, old.id_emisor, old.num_serie, old.fecha_expedicion,
      old.tipo_factura, old.cuota_total, old.importe_total, old.huella_anterior,
      old.anterior_id_emisor, old.anterior_num_serie, old.anterior_fecha_expedicion,
      old.subsanacion, old.rechazo_previo, old.sin_registro_previo, old.registro_origen_id, old.datos_corregidos,
      old.huella_verificada, old.creado_en) then
    raise exception 'VERIFACTU_INMUTABLE: los datos del registro % no se modifican', old.id;
  end if;

  -- Huella y marca de tiempo: una sola vez, al completar una reserva.
  if (new.huella, new.fecha_hora_huso_gen) is distinct from (old.huella, old.fecha_hora_huso_gen)
     and not (old.estado = 'RESERVADO' and old.huella is null) then
    raise exception 'VERIFACTU_INMUTABLE: la huella del registro % ya está fijada', old.id;
  end if;

  -- XML: una sola vez, al prepararlo. Nunca se regenera.
  if (new.xml_registro, new.xml_sha256) is distinct from (old.xml_registro, old.xml_sha256)
     and old.xml_registro is not null then
    raise exception 'VERIFACTU_INMUTABLE: el XML del registro % ya está congelado', old.id;
  end if;

  if not public.verifactu_transicion_permitida(old.estado, new.estado) then
    raise exception 'VERIFACTU_TRANSICION: % → % no está permitido (registro %)', old.estado, new.estado, old.id;
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_verifactu_registro_inmutable on public.verifactu_registros;
create trigger trg_verifactu_registro_inmutable
  before update or delete on public.verifactu_registros
  for each row execute function public.verifactu_registro_inmutable();

-- ── 2 · verifactu_envios ────────────────────────────────────────────────────
create or replace function public.verifactu_envio_inmutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'VERIFACTU_INMUTABLE: un envío a la AEAT no se borra (%)', old.id;
  end if;
  if (new.id, new.studio_id, new.nif_obligado, new.operacion, new.entorno, new.endpoint, new.certificado_sha256,
      new.n_registros, new.request_xml, new.request_sha256, new.iniciado_en)
     is distinct from
     (old.id, old.studio_id, old.nif_obligado, old.operacion, old.entorno, old.endpoint, old.certificado_sha256,
      old.n_registros, old.request_xml, old.request_sha256, old.iniciado_en) then
    raise exception 'VERIFACTU_INMUTABLE: lo enviado en % no se modifica', old.id;
  end if;
  -- La respuesta se anota una vez: con el envío terminado, ya no cambia.
  if old.terminado_en is not null then
    raise exception 'VERIFACTU_INMUTABLE: el envío % ya está cerrado', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifactu_envio_inmutable on public.verifactu_envios;
create trigger trg_verifactu_envio_inmutable
  before update or delete on public.verifactu_envios
  for each row execute function public.verifactu_envio_inmutable();

-- ── 3 · facturas selladas ───────────────────────────────────────────────────
create or replace function public.factura_sellada_inmutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if old.verifactu_hash is not null then
      raise exception 'FACTURA_SELLADA: una factura emitida no se borra (%); se anula o se rectifica', old.numero_completo;
    end if;
    return old;
  end if;
  -- Sin huella todavía (reserva en curso): se deja sellar.
  if old.verifactu_hash is null then return new; end if;
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
$$;

drop trigger if exists trg_factura_sellada_inmutable on public.facturas;
create trigger trg_factura_sellada_inmutable
  before update or delete on public.facturas
  for each row execute function public.factura_sellada_inmutable();

revoke all on function public.verifactu_transicion_permitida(text, text) from public, anon, authenticated;
revoke all on function public.verifactu_registro_inmutable() from public, anon, authenticated;
revoke all on function public.verifactu_envio_inmutable() from public, anon, authenticated;
revoke all on function public.factura_sellada_inmutable() from public, anon, authenticated;
grant execute on function public.verifactu_transicion_permitida(text, text) to service_role;

-- ── 4 · Control de flujo persistido ─────────────────────────────────────────
create table if not exists public.verifactu_control_flujo (
  clave text primary key,
  proximo_envio_permitido_en timestamptz not null default now(),
  ultimo_tiempo_espera_s integer,
  actualizado_en timestamptz not null default now()
);
insert into public.verifactu_control_flujo (clave) values ('global') on conflict (clave) do nothing;

comment on table public.verifactu_control_flujo is
  'TiempoEsperaEnvio de la AEAT (Orden HAC/1177/2024 art. 16.2), persistido entre ejecuciones del cron. Clave global: el ámbito real (certificado/obligado/SIF) está PENDIENTE DE CONFIRMACIÓN AEAT.';

alter table public.verifactu_control_flujo enable row level security;
revoke all on public.verifactu_control_flujo from public, anon, authenticated;
grant select, insert, update on public.verifactu_control_flujo to service_role;
revoke delete, truncate on public.verifactu_control_flujo from service_role;

-- ── 5 · Lectura por estudio (RLS) ───────────────────────────────────────────
-- Una política nueva que solo pidiera `studio_id = current_studio_id()` se lo
-- abriría también a INSTRUCTOR (.claude/tentare-os.md): siempre con el rol.

-- Registros: como `facturas` (puede_ver_finanzas = PROPIETARIO o RECEPCION).
-- Por COLUMNAS: sin `xml_registro` ni `datos_corregidos` (datos del receptor).
drop policy if exists verifactu_registros_lectura on public.verifactu_registros;
create policy verifactu_registros_lectura on public.verifactu_registros
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());
grant select (
  id, studio_id, factura_id, tipo, seq, id_emisor, num_serie, fecha_expedicion, tipo_factura,
  cuota_total, importe_total, huella_anterior, fecha_hora_huso_gen, huella, huella_verificada,
  anterior_num_serie, anterior_fecha_expedicion, subsanacion, rechazo_previo, sin_registro_previo,
  registro_origen_id, estado, intentos, proximo_intento_en, csv, codigo_error, descripcion_error,
  estado_duplicado, revision_manual, creado_en, actualizado_en
) on public.verifactu_registros to authenticated;

-- Alta y poder: solo la propietaria de ese estudio.
drop policy if exists verifactu_estudios_lectura on public.verifactu_estudios;
create policy verifactu_estudios_lectura on public.verifactu_estudios
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO');
grant select on public.verifactu_estudios to authenticated;

drop policy if exists verifactu_representaciones_lectura on public.verifactu_representaciones;
create policy verifactu_representaciones_lectura on public.verifactu_representaciones
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO');
grant select on public.verifactu_representaciones to authenticated;

-- La traza, sin la IP ni el user-agent ni quién de Tentare actuó.
drop policy if exists verifactu_repr_eventos_lectura on public.verifactu_representacion_eventos;
create policy verifactu_repr_eventos_lectura on public.verifactu_representacion_eventos
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO');
grant select (id, studio_id, representacion_id, evento, actor_tipo, datos, creado_en)
  on public.verifactu_representacion_eventos to authenticated;

-- `verifactu_envios` (XML y respuesta cruda), `verifactu_declaraciones_responsables`
-- y `verifactu_control_flujo`: sin lectura desde el cliente. Nada que escribir
-- desde el cliente en ninguna tabla de Veri*Factu.
