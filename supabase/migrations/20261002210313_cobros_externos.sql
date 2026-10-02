-- ─────────────────────────────────────────────────────────────────────────────
-- Cobros externos (PR1): los movimientos que vienen de fuera de Tentare (el
-- fichero del banco: transferencias, Bizum, el datáfono) y su emparejamiento con
-- los recibos. Diseño completo en docs/cobros-externos-diseno.md.
--
-- Un movimiento NO es un cobro. El cobro confirmado sigue viviendo en `recibos`,
-- lo escribe `confirmarCobro()` (origen 'externo') y es la fuente de verdad.
-- Ninguna cifra financiera lee estas tablas.
--
-- Qué hace esta migración:
--   1. `recibos.conciliado_por` admite 'externo'.
--   2. `recibos_marcas_de_tiempo`: un cobro externo no se queda con la hora en que
--      alguien lo confirma (como el conciliador, «llega tarde»). Si el fichero trae
--      la hora del pago, la escribe el servidor y el trigger la respeta.
--   3. Dos tablas DE SERVIDOR: `cobros_externos_lotes` (cada fichero subido) y
--      `cobros_externos` (cada movimiento). RLS activada sin políticas y sin
--      permisos para anon/authenticated: el panel entra por rutas de API que
--      comprueban `puedeMoverDinero`. El fichero NO se guarda en ningún sitio.
--   4. `anonimizar_socio`: la vigente + vaciar sus datos en `cobros_externos`.
--   5. `purgar_estudio_vencido`: la vigente + las dos tablas en `c_borrar`.
--   6. Retención: el nombre de quien paga, el concepto y la referencia (texto
--      libre de quien ordena el pago) se vacían a los 90 días de resolverse el
--      movimiento y a los 180 si sigue sin resolver.
--
-- RGPD: `cobros_externos` tiene `socio_id` y se ANONIMIZA al suprimir a la
-- clienta. El test `lib/socios/supresion-cobertura.test.ts` lee la ÚLTIMA
-- migración que recrea `anonimizar_socio`, así que la clasificación completa
-- (copia de `lib/socios/supresion-clasificacion.ts`, fuente documental) va aquí:
--
-- | Tabla                          | Acción     | Qué / por qué
-- |--------------------------------|------------|-----------------------------------------------
-- | condiciones_salud              | BORRAR     | Ficha clínica (art. 9)
-- | respuestas_cuestionario_salud  | BORRAR     | Cuestionario de salud
-- | respuestas_sesion              | BORRAR     | Notas por sesión
-- | notas_internas / notas_progreso| BORRAR     | Notas del staff / progreso clínico
-- | preferencias_socio             | BORRAR     | Preferencias
-- | valoraciones_iniciales_salud   | BORRAR     | Mitad de salud de la valoración inicial (primero)
-- | valoraciones_iniciales         | BORRAR     | Valoración inicial
-- | documentos_socio               | BORRAR     | Filas; Storage lo borra la ruta ANTES (se devuelven las rutas)
-- | memoria_socio                  | BORRAR     | Memoria del Decision OS
-- | recomendaciones                | BORRAR     | Con su nombre; outcomes en cascada
-- | decision_mensajes_dia          | ANONIMIZAR | motivo_motor → NULL (la fila garantiza 1 mensaje/día)
-- | actividad_reciente             | BORRAR     | Feed con su nombre
-- | comunicaciones_socio           | BORRAR     | Asuntos de correos y contactos apuntados a mano (tipo 'contacto': canal, resultado, nota)
-- | consultas_contacto             | BORRAR     | Las suyas: enlazadas a su ficha o con su mismo email (lo que preguntó antes de ser clienta)
-- | bajas_clienta                  | BORRAR     | Motivo de cada baja y su vuelta
-- | automation_logs                | ANONIMIZAR | socio_nombre «Socia eliminada», mensaje_cliente/detalle NULL
-- | campana_envios                | ANONIMIZAR | detalle NULL (puede llevar su nombre/correo); la fila y provider_id se quedan para las métricas de la campaña (AUT-B)
-- | notification                   | BORRAR     | Suyas + las del staff que la nombran; delivery en cascada
-- | tareas                         | BORRAR     | Tareas del staff sobre ella
-- | intentos_reserva_fallidos      | BORRAR     | Log
-- | socios_qr_acceso               | BORRAR     | Su QR de acceso (solo el hash) y los revocados
-- | accesos_escaneos               | BORRAR     | Cada lectura de su QR en la puerta
-- | recordatorio_envios            | BORRAR     | Dedupe de recordatorios
-- | favoritos_clase / avisos_hueco | BORRAR     |
-- | widget_eventos                 | ANONIMIZAR | socio_id → NULL
-- | instructor_dependency_snapshots| ANONIMIZAR | detalle[socioId=ella].nombre → «Socia eliminada»
-- | instructor_bajas_seguimiento   | ANONIMIZAR | alumnas_cautivas[socioId=ella].nombre → ídem
-- | conversaciones                 | BORRAR     | ALUMNA_* donde es la única socia (mensajes en cascada)
-- | mensajes                       | ANONIMIZAR | Los suyos que quedan: cuerpo «[mensaje eliminado]»
-- | conversacion_participantes     | BORRAR     |
-- | posts_comunidad                | BORRAR     | autor_id = su cuenta o su ficha (comentarios/likes del post en cascada)
-- | comentarios_comunidad          | BORRAR     | autor_id = su cuenta o su ficha
-- | post_likes                     | BORRAR     | user_id = su cuenta en este estudio
-- | post_evento_asistentes         | BORRAR     |
-- | member_credits, credit_transactions, reward_actions, reward_history,
-- | reward_redemptions, achievement_progress, achievement_history,
-- | challenge_progress, challenge_history,
-- | reto_participaciones           | BORRAR     | Gamificación (créditos ≠ dinero)
-- | socio_companeras               | BORRAR     | Solicitante, destinataria o bloqueo
-- | plazas_fijas                   | BORRAR     | Si no, el cron la seguiría materializando
-- | solicitudes_plaza_fija         | BORRAR     | Lo que pidió sobre su plaza fija y el motivo que le contestaron
-- | recuperaciones / socio_excepciones / socio_tipos_clase_autorizados | BORRAR |
-- | citas                          | ANONIMIZAR | notas NULL; futuras abiertas → CANCELADA
-- | valoraciones                   | ANONIMIZAR | comentario NULL (la puntuación queda seudónima)
-- | penalizaciones                 | BORRAR*    | *Solo las SIN recibo (no pasó dinero y ya no debe pasar). Con recibo: CONSERVAR (fiscal)
-- | mandatos_sepa                  | BORRAR*    | *Salvo recibo SEPA PENDIENTE/EN_CURSO: ese cargo puede devolverse y el mandato es la prueba → se retiene y se devuelve `mandato_sepa_retenido`
-- | email_rebotes                  | BORRAR     | Global por email: solo si nadie más (socia activa, instructora, estudio) lo usa
-- | rate_limits                    | BORRAR     | `otp-verify-email:<email>`, misma condición
-- | push_subscription / notification_preference | BORRAR | De su cuenta en ESTE estudio, salvo que la cuenta sea staff aquí
-- | socios                         | ANONIMIZAR | Ver el UPDATE; se quedan fechas de consentimiento como prueba
-- | reservas                       | CONSERVAR  | Seudónima (las futuras las cancela la ruta antes)
-- | suscripciones                  | CONSERVAR  | Seudónima, estado CANCELADA (recibos la referencian)
-- | movimientos_derecho            | CONSERVAR  | Libro de su saldo de sesiones y recuperaciones: ids, cifras, fechas y un motivo del sistema o del equipo (20261002133851). Solo documentado aquí: la función no lo toca
-- | recibos / facturas / ventas_pos / devoluciones / pagos_historicos / codigos_descuento_consumos / auditoria_estudio | CONSERVAR | Fiscal (auditoria_estudio: el libro de cambios de esas mismas tablas)
-- | lecturas_ficha_salud           | CONSERVAR  | ⚠️ REVISIÓN LEGAL: registro de accesos del staff a su ficha; falta fijar plazo
-- | supresiones                    | CONSERVAR  | El propio registro
-- | solicitudes_derechos           | CONSERVAR  | ⚠️ REVISIÓN LEGAL: prueba de que el derecho se ejerció y resolvió (#1922; la función no la toca)
-- | consentimientos_salud_eventos  | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: firma → «[firma eliminada]» (un CHECK la exige), actor_uid NULL; quedan tipo/fecha/origen/texto (#1927, solo si existe)
-- | socios.consentimiento_salud_registrado_por_uid | → NULL, solo si la columna existe (#1927)
-- | aceptaciones_contrato_eventos  | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: firma → «[firma eliminada]», ip_hmac/user_agent/introducida_por/actor_uid NULL; quedan fecha/origen/texto_hash/texto_cliente_coincide (20260914015133, solo si existe)
-- | consentimientos_marketing_eventos | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: se quedan cuándo/DAR-RETIRAR/origen/texto (la prueba); ip_hmac/user_agent NULL (20260922004313, solo si existe)
-- | cobros_externos                | ANONIMIZAR | socio_id, pagador_nombre, concepto y referencia → NULL; el movimiento queda como traza del cobro (cobros externos, PR1)
--
-- Las funciones 2, 4 y 5 son copias LITERALES de la vigente con lo nuevo
-- añadido; antes de reemplazar cada una se comprueba que producción sigue
-- teniendo ESA versión (md5 de prosrc). Si alguien la cambió entre medias, falla
-- en vez de pisarla.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. conciliado_por = 'externo' ────────────────────────────────────────────
alter table public.recibos drop constraint if exists recibos_conciliado_por_check;
alter table public.recibos add constraint recibos_conciliado_por_check
  check (conciliado_por = any (array['webhook', 'conciliador', 'manual', 'tpv', 'externo']));

-- ── 2. La hora del cobro: un movimiento externo no la inventa ────────────────
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.recibos_marcas_de_tiempo()'::regprocedure)
     <> '51895568a7b49db287cb4db2bc3626a9' then
    raise exception 'recibos_marcas_de_tiempo ha cambiado desde 20261002131832: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.recibos_marcas_de_tiempo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_hora timestamptz;
begin
  -- 1. La hora del cobro. Solo si el registro es del momento del pago: hoy en Madrid,
  --    ni domiciliación ni transferencia, y no lo que se concilia tarde (el
  --    conciliador, o un movimiento del fichero del banco: si este trae la hora
  --    del pago, la escribe el servidor y aquí se respeta).
  if new.estado = 'COBRADO' then
    v_hora := case
      when new.fecha_cobro = v_hoy
       and coalesce(new.metodo_cobro, '') not in ('SEPA', 'TRANSFERENCIA')
       and new.conciliado_por is distinct from 'conciliador'
       and new.conciliado_por is distinct from 'externo'
      then now()
    end;
    if tg_op = 'INSERT' then
      if new.cobrado_en is null then
        new.cobrado_en := v_hora;
      end if;
    elsif old.estado is distinct from 'COBRADO' then
      if new.cobrado_en is not distinct from old.cobrado_en
         and (old.cobrado_en is null
              or new.fecha_cobro is distinct from old.fecha_cobro
              or new.conciliado_en is distinct from old.conciliado_en
              or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id) then
        new.cobrado_en := v_hora;
      end if;
    end if;
  end if;

  -- 2. El envío al banco y el día de cargo pedido.
  if new.estado = 'EN_CURSO' and (tg_op = 'INSERT' or old.estado is distinct from 'EN_CURSO') then
    new.enviado_al_banco_en := now();
    new.cargo_pedido_para := case
      when new.stripe_payment_intent_id is null
       and new.checkout_session_id is null
       and new.cobro_mostrador_pi is null
      then v_hoy + 5
    end;
  elsif tg_op = 'UPDATE' and old.estado = 'EN_CURSO' and new.estado = 'PENDIENTE' then
    new.enviado_al_banco_en := null;
    new.cargo_pedido_para := null;
  end if;

  return new;
end;
$fn$;

revoke all on function public.recibos_marcas_de_tiempo() from public, anon, authenticated;

-- ── 3. Las tablas ────────────────────────────────────────────────────────────
create table if not exists public.cobros_externos_lotes (
  id              text primary key,
  studio_id       text not null references public.studios(id) on delete cascade,
  fuente          text not null check (fuente in ('norma43', 'fb500', 'csv', 'excel')),
  -- SHA-256 del contenido normalizado: el mismo fichero, guardado otra vez, da la misma.
  huella_fichero  text not null check (huella_fichero ~ '^[0-9a-f]{64}$'),
  nombre_fichero  text check (nombre_fichero is null or char_length(nombre_fichero) <= 120),
  -- Solo los 4 últimos dígitos de la cuenta. Nunca el número completo.
  cuenta_final    text check (cuenta_final is null or cuenta_final ~ '^[0-9]{4}$'),
  periodo_desde   date,
  periodo_hasta   date,
  leidos          integer not null default 0 check (leidos >= 0),
  nuevos          integer not null default 0 check (nuevos >= 0),
  ya_importados   integer not null default 0 check (ya_importados >= 0),
  no_de_alumnas   integer not null default 0 check (no_de_alumnas >= 0),
  cargos          integer not null default 0 check (cargos >= 0),
  con_error       integer not null default 0 check (con_error >= 0),
  -- Línea y código. NUNCA el contenido de la línea.
  errores         jsonb not null default '[]'::jsonb check (jsonb_typeof(errores) = 'array'),
  subido_por      uuid not null,
  subido_en       timestamptz not null default now(),
  unique (studio_id, huella_fichero)
);

create table if not exists public.cobros_externos (
  id                  text primary key,
  studio_id           text not null references public.studios(id) on delete cascade,
  lote_id             text references public.cobros_externos_lotes(id) on delete set null,
  fuente              text not null check (fuente in ('norma43', 'fb500', 'csv', 'excel', 'viva', 'sumup')),
  clave_idempotencia  text not null check (char_length(clave_idempotencia) between 8 and 200),
  id_externo          text check (id_externo is null or char_length(id_externo) <= 120),
  tipo                text not null check (tipo in ('COBRO', 'LIQUIDACION', 'NO_ALUMNA')),
  metodo              text not null check (metodo in ('TARJETA', 'TRANSFERENCIA', 'BIZUM', 'OTRO')),
  -- Solo abonos (dinero que entra).
  importe_centimos    bigint not null check (importe_centimos > 0),
  moneda              text not null default 'EUR' check (moneda = 'EUR'),
  -- Fecha REAL del cobro, día del estudio. La hora, si la fuente la da.
  fecha_operacion     date not null,
  hora_operacion      time,
  fecha_valor         date,
  referencia          text check (referencia is null or char_length(referencia) <= 80),
  tarjeta_ultimos4    text check (tarjeta_ultimos4 is null or tarjeta_ultimos4 ~ '^[0-9]{4}$'),
  tarjeta_marca       text check (tarjeta_marca is null or char_length(tarjeta_marca) <= 20),
  terminal_ref        text check (terminal_ref is null or char_length(terminal_ref) <= 60),
  -- Datos personales: se vacían con la retención (6) y al suprimir a la alumna (4),
  -- igual que `referencia`. Antes de guardar se les quitan tarjetas e IBAN (texto.ts).
  pagador_nombre      text check (pagador_nombre is null or char_length(pagador_nombre) <= 80),
  concepto            text check (concepto is null or char_length(concepto) <= 140),
  estado              text not null default 'IMPORTADO'
                      check (estado in ('IMPORTADO', 'POR_REVISAR', 'CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO', 'DOBLE_COBRO', 'DESCARTADO')),
  -- Foto de las candidatas al decidir: ids y códigos, nunca nombres.
  decision            jsonb check (decision is null or jsonb_typeof(decision) = 'object'),
  posible_duplicado_de text references public.cobros_externos(id) on delete set null,
  recibo_id           text references public.recibos(id),
  socio_id            text references public.socios(id) on delete set null,
  resuelto_como       text check (resuelto_como is null or resuelto_como in ('humano', 'auto')),
  resuelto_por        uuid,
  resuelto_en         timestamptz,
  bloqueado_en        timestamptz,
  descartado_motivo   text check (descartado_motivo is null
                      or descartado_motivo in ('DUPLICADO', 'NO_ES_DE_UNA_ALUMNA', 'DEVUELTO_A_LA_ALUMNA', 'OTRO')),
  error_ultimo        text check (error_ultimo is null or char_length(error_ultimo) <= 300),
  revisar_tras        timestamptz,
  datos_personales_purgados_en timestamptz,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  unique (studio_id, clave_idempotencia),
  -- Lo que está a punto de cobrarse, cobrado o enlazado apunta SIEMPRE a su recibo.
  constraint cobros_externos_ligado_con_recibo check (
    estado not in ('CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO', 'DOBLE_COBRO') or recibo_id is not null),
  -- Descartado ⇔ con motivo.
  constraint cobros_externos_descartado_con_motivo check ((estado = 'DESCARTADO') = (descartado_motivo is not null)),
  -- El cerrojo lleva su hora (para recuperar un CONFIRMANDO colgado).
  constraint cobros_externos_cerrojo_con_hora check (estado <> 'CONFIRMANDO' or bloqueado_en is not null)
);

-- La bandeja.
create index if not exists cobros_externos_bandeja_idx
  on public.cobros_externos (studio_id, estado, fecha_operacion desc);
-- Un recibo, como mucho UN movimiento que lo cobra, lo va a cobrar o lo enlaza.
-- Incluye CONFIRMANDO: dos movimientos no pueden estar cobrando el mismo recibo a la vez.
create unique index if not exists cobros_externos_un_movimiento_por_recibo
  on public.cobros_externos (recibo_id) where estado in ('CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO');
-- Historial de tarjetas y de pagos de cada alumna (señales del motor).
create index if not exists cobros_externos_historial_idx
  on public.cobros_externos (studio_id, socio_id, fecha_operacion desc) where estado = 'CONFIRMADO';
create index if not exists cobros_externos_lote_idx on public.cobros_externos (lote_id);

alter table public.cobros_externos_lotes enable row level security;
alter table public.cobros_externos enable row level security;
revoke all on table public.cobros_externos_lotes from public, anon, authenticated;
revoke all on table public.cobros_externos from public, anon, authenticated;
grant all on table public.cobros_externos_lotes to service_role;
grant all on table public.cobros_externos to service_role;

-- ── 4. anonimizar_socio: la vigente + cobros_externos ────────────────────────
do $$
begin
  if (select md5(prosrc) from pg_proc
       where oid = 'public.anonimizar_socio(text, text, uuid, text)'::regprocedure)
     <> '818f9f20889235ca50082ce4c55f5b5b' then
    raise exception 'anonimizar_socio ha cambiado desde 20261001105825: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.anonimizar_socio(
  p_studio_id text,
  p_socio_id text,
  p_ejecutada_por uuid default null,
  p_origen text default 'panel'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth uuid;
  v_email text;
  v_es_staff boolean := false;
  v_email_libre boolean := false;
  v_mandato_retenido boolean := false;
  v_docs text[];
  v_recos text[];
  v_pen_conservadas integer := 0;
begin
  if p_studio_id is null or p_socio_id is null then
    raise exception 'anonimizar_socio: faltan estudio o socia' using errcode = '22023';
  end if;
  if p_origen not in ('panel', 'restauracion', 'backfill') then
    raise exception 'anonimizar_socio: origen no válido (%)', p_origen using errcode = '22023';
  end if;

  select s.auth_user_id, lower(s.email)
    into v_auth, v_email
    from public.socios s
   where s.id = p_socio_id and s.studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'anonimizar_socio: la socia no existe en ese estudio' using errcode = 'P0002';
  end if;

  if v_auth is null then
    select sp.auth_user_id into v_auth
      from public.supresiones sp
     where sp.studio_id = p_studio_id and sp.socio_id = p_socio_id;
  end if;

  if v_auth is not null then
    v_es_staff := exists (select 1 from public.instructores i
                           where i.auth_user_id = v_auth and i.studio_id = p_studio_id)
               or exists (select 1 from public.studios st
                           where st.id = p_studio_id and st.owner_auth_user_id = v_auth);
  end if;

  -- 1. Salud y notas
  delete from public.condiciones_salud t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.respuestas_cuestionario_salud t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.respuestas_sesion t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.notas_internas t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.notas_progreso t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.preferencias_socio t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.valoraciones_iniciales_salud t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.valoraciones_iniciales t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;

  with borrados as (
    delete from public.documentos_socio t
     where t.studio_id = p_studio_id and t.socio_id = p_socio_id
    returning t.storage_path
  )
  select coalesce(array_agg(b.storage_path), '{}') into v_docs from borrados b;

  -- 2. CRM, motor de decisiones y logs
  delete from public.memoria_socio t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;

  select coalesce(array_agg(r.id), '{}') into v_recos
    from public.recomendaciones r
   where r.studio_id = p_studio_id and r.socio_id = p_socio_id;
  update public.decision_mensajes_dia dm
     set motivo_motor = null
   where dm.studio_id = p_studio_id and dm.recomendacion_id = any(v_recos) and dm.motivo_motor is not null;
  delete from public.recomendaciones r where r.studio_id = p_studio_id and r.id = any(v_recos);

  delete from public.actividad_reciente t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.comunicaciones_socio t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  -- Lo que preguntó antes de ser clienta (enlazado a su ficha, o con su email) y
  -- el motivo de sus bajas (migr …_bajas_clienta_e_interesadas).
  delete from public.consultas_contacto t
   where t.studio_id = p_studio_id
     and (t.socio_id = p_socio_id or (t.socio_id is null and v_email is not null and lower(t.email) = v_email));
  delete from public.bajas_clienta t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.tareas t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.intentos_reserva_fallidos t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  -- Control de acceso con QR (20260927150000): su QR y cada lectura en la puerta.
  delete from public.socios_qr_acceso t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.accesos_escaneos t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.recordatorio_envios t where t.socio_id = p_socio_id;
  delete from public.favoritos_clase t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.avisos_hueco t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;

  update public.automation_logs al
     set socio_nombre = 'Socia eliminada', mensaje_cliente = null, detalle = null
   where al.studio_id = p_studio_id and al.socio_id = p_socio_id
     and (al.socio_nombre is distinct from 'Socia eliminada' or al.mensaje_cliente is not null or al.detalle is not null);

  -- AUT-B: registro por destinataria de una campaña. La fila se queda (métricas de
  -- la campaña y el id del envío para cruzar rebotes); se vacía el `detalle`, que
  -- puede llevar su nombre o su correo («X no tiene email en su ficha»).
  update public.campana_envios ce set detalle = null
   where ce.studio_id = p_studio_id and ce.socio_id = p_socio_id and ce.detalle is not null;

  delete from public.notification n
   where n.studio_id = p_studio_id
     and (n.recipient_socio_id = p_socio_id
          or n.data ->> 'socioId' = p_socio_id
          or (jsonb_typeof(n.data -> 'socioIds') = 'array' and (n.data -> 'socioIds') ? p_socio_id)
          or (v_auth is not null and n.recipient_role = 'SOCIA' and n.recipient_user_id = v_auth));

  update public.widget_eventos w set socio_id = null
   where w.studio_id = p_studio_id and w.socio_id = p_socio_id;

  -- Cobros externos (migr cobros_externos): el movimiento se conserva (es la
  -- traza de un cobro, como el recibo), sin nada que diga quién es: ni a quién se
  -- ligó, ni el nombre de quien pagó, ni el concepto ni la referencia.
  update public.cobros_externos ce
     set socio_id = null, pagador_nombre = null, concepto = null, referencia = null,
         datos_personales_purgados_en = coalesce(ce.datos_personales_purgados_en, now())
   where ce.studio_id = p_studio_id and ce.socio_id = p_socio_id;

  update public.instructor_dependency_snapshots ids
     set detalle = (
       select jsonb_agg(case when x.e ->> 'socioId' = p_socio_id
                             then jsonb_set(x.e, '{nombre}', to_jsonb('Socia eliminada'::text))
                             else x.e end order by x.o)
         from jsonb_array_elements(ids.detalle) with ordinality as x(e, o))
   where ids.studio_id = p_studio_id
     and jsonb_typeof(ids.detalle) = 'array'
     and ids.detalle @> jsonb_build_array(jsonb_build_object('socioId', p_socio_id));

  update public.instructor_bajas_seguimiento ibs
     set alumnas_cautivas = (
       select jsonb_agg(case when x.e ->> 'socioId' = p_socio_id
                             then jsonb_set(x.e, '{nombre}', to_jsonb('Socia eliminada'::text))
                             else x.e end order by x.o)
         from jsonb_array_elements(ibs.alumnas_cautivas) with ordinality as x(e, o))
   where ibs.studio_id = p_studio_id
     and jsonb_typeof(ibs.alumnas_cautivas) = 'array'
     and ibs.alumnas_cautivas @> jsonb_build_array(jsonb_build_object('socioId', p_socio_id));

  -- 3. Mensajería y comunidad
  delete from public.conversaciones c
   where c.studio_id = p_studio_id
     and c.tipo in ('ALUMNA_MOSTRADOR', 'ALUMNA_INSTRUCTORA')
     and exists (select 1 from public.conversacion_participantes cp
                  where cp.conversacion_id = c.id and cp.socio_id = p_socio_id)
     and not exists (select 1 from public.conversacion_participantes cp
                      where cp.conversacion_id = c.id and cp.socio_id is not null and cp.socio_id <> p_socio_id);

  if v_auth is not null and not v_es_staff then
    update public.mensajes m
       set cuerpo = '[mensaje eliminado]'
     where m.studio_id = p_studio_id and m.remitente_auth_user_id = v_auth
       and m.cuerpo <> '[mensaje eliminado]';
  end if;

  delete from public.conversacion_participantes cp where cp.socio_id = p_socio_id;

  delete from public.comentarios_comunidad cc
   where cc.studio_id = p_studio_id
     and (cc.autor_id = p_socio_id or (v_auth is not null and not v_es_staff and cc.autor_id = v_auth::text));
  delete from public.posts_comunidad pc
   where pc.studio_id = p_studio_id
     and (pc.autor_id = p_socio_id or (v_auth is not null and not v_es_staff and pc.autor_id = v_auth::text));
  if v_auth is not null and not v_es_staff then
    delete from public.post_likes pl where pl.studio_id = p_studio_id and pl.user_id = v_auth;
  end if;
  delete from public.post_evento_asistentes pea where pea.socio_id = p_socio_id;

  -- 4. Gamificación
  delete from public.reward_redemptions t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.reward_history t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.reward_actions t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.credit_transactions t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.member_credits t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.achievement_history t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.achievement_progress t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.challenge_history t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.challenge_progress t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.reto_participaciones t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.socio_companeras t
   where t.studio_id = p_studio_id
     and (t.solicitante_id = p_socio_id or t.destinataria_id = p_socio_id or t.bloqueada_por = p_socio_id);

  -- 5. Operativa
  delete from public.plazas_fijas t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.solicitudes_plaza_fija t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.recuperaciones t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.socio_excepciones t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.socio_tipos_clase_autorizados t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;

  update public.citas ci set notas = null
   where ci.studio_id = p_studio_id and ci.socio_id = p_socio_id and ci.notas is not null;
  update public.citas ci set estado = 'CANCELADA'
   where ci.studio_id = p_studio_id and ci.socio_id = p_socio_id
     and ci.inicio > now() and ci.estado in ('PENDIENTE', 'CONFIRMADA');

  update public.valoraciones v set comentario = null
   where v.studio_id = p_studio_id and v.socio_id = p_socio_id and v.comentario is not null;

  update public.suscripciones su set estado = 'CANCELADA'
   where su.studio_id = p_studio_id and su.socio_id = p_socio_id and su.estado <> 'CANCELADA';

  -- 6. Dinero
  delete from public.penalizaciones pe
   where pe.studio_id = p_studio_id and pe.socio_id = p_socio_id and pe.recibo_id is null;
  select count(*) into v_pen_conservadas
    from public.penalizaciones pe
   where pe.studio_id = p_studio_id and pe.socio_id = p_socio_id;

  v_mandato_retenido :=
        exists (select 1 from public.mandatos_sepa ms
                 where ms.studio_id = p_studio_id and ms.socio_id = p_socio_id)
    and exists (select 1 from public.recibos r
                 where r.studio_id = p_studio_id and r.socio_id = p_socio_id
                   and r.metodo_cobro = 'SEPA' and r.estado in ('PENDIENTE', 'EN_CURSO'));
  if not v_mandato_retenido then
    delete from public.mandatos_sepa ms where ms.studio_id = p_studio_id and ms.socio_id = p_socio_id;
  end if;

  -- 7. Huellas globales y de su cuenta
  if v_email is not null and v_email not like 'borrado+%@anon.invalid' then
    v_email_libre :=
          not exists (select 1 from public.socios s2
                       where lower(s2.email) = v_email and s2.id <> p_socio_id and s2.borrado_en is null)
      and not exists (select 1 from public.instructores i2 where lower(i2.email) = v_email)
      and not exists (select 1 from public.studios st2 where lower(st2.email) = v_email);
    if v_email_libre then
      delete from public.email_rebotes er where er.email = v_email;
      delete from public.rate_limits rl where rl.bucket_key = 'otp-verify-email:' || v_email;
    end if;
  end if;

  if v_auth is not null and not v_es_staff then
    delete from public.push_subscription ps where ps.studio_id = p_studio_id and ps.user_id = v_auth;
    delete from public.notification_preference np where np.studio_id = p_studio_id and np.user_id = v_auth;
  end if;

  -- 8. La ficha (quedan como prueba solo fechas y origen de aceptación/consentimiento de salud)
  update public.socios s set
    nombre = 'Socia',
    apellidos = 'eliminada',
    email = 'borrado+' || p_socio_id || '@anon.invalid',
    telefono = null,
    nif = null,
    direccion = null,
    fecha_nacimiento = null,
    foto_url = null,
    avatar = null,
    auth_user_id = null,
    stripe_customer_id = null,
    stripe_payment_method_id = null,
    sepa_mandate_id = null,
    sepa_payment_method_id = null,
    tarjeta_marca = null,
    tarjeta_ultimos4 = null,
    tarjeta_exp_mes = null,
    tarjeta_exp_anio = null,
    tags = '{}',
    lead_stage = null,
    origen_lead = null,
    referido_por = null,
    usuario = null,
    campos_extra = '{}'::jsonb,
    visible_en_clase = false,
    objetivo_clases_mes = null,
    aceptacion_firma = null,
    aceptacion_version = null,
    aceptacion_por = null,
    consentimiento_salud_texto = null,
    consentimiento_salud_registrado_por = null,
    consentimiento_marketing_en = null,
    consentimiento_marketing_texto = null,
    consentimiento_marketing_por = null,
    activo = false,
    borrado_en = coalesce(s.borrado_en, now()),
    consentimiento_salud_revocado_en = coalesce(s.consentimiento_salud_revocado_en, now())
  where s.id = p_socio_id and s.studio_id = p_studio_id;

  -- 8b. Evidencia de consentimiento de salud (#1927; puede no existir aún). ⚠️ REVISIÓN LEGAL.
  if to_regclass('public.consentimientos_salud_eventos') is not null then
    execute 'update public.consentimientos_salud_eventos '
         || 'set firma = case when firma is null then null else ''[firma eliminada]'' end, actor_uid = null '
         || 'where studio_id = $1 and socio_id = $2 '
         || 'and ((firma is not null and firma <> ''[firma eliminada]'') or actor_uid is not null)'
      using p_studio_id, p_socio_id;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'socios'
                and column_name = 'consentimiento_salud_registrado_por_uid') then
    execute 'update public.socios set consentimiento_salud_registrado_por_uid = null '
         || 'where id = $1 and studio_id = $2 and consentimiento_salud_registrado_por_uid is not null'
      using p_socio_id, p_studio_id;
  end if;

  -- 8c. Evidencia de aceptación del contrato (20260914150100; puede no existir aún). ⚠️ REVISIÓN LEGAL.
  if to_regclass('public.aceptaciones_contrato_eventos') is not null then
    execute 'update public.aceptaciones_contrato_eventos '
         || 'set firma = ''[firma eliminada]'', ip_hmac = null, user_agent = null, introducida_por = null, actor_uid = null '
         || 'where studio_id = $1 and socio_id = $2 '
         || 'and (firma <> ''[firma eliminada]'' or ip_hmac is not null or user_agent is not null '
         || 'or introducida_por is not null or actor_uid is not null)'
      using p_studio_id, p_socio_id;
  end if;

  -- 8d. Historial de consentimiento de marketing (20260922004313; puede no
  -- existir aún). Se quedan cuándo, DAR/RETIRAR, origen y el texto aceptado o
  -- retirado (la prueba); se vacían IP y navegador. ⚠️ REVISIÓN LEGAL.
  if to_regclass('public.consentimientos_marketing_eventos') is not null then
    execute 'update public.consentimientos_marketing_eventos '
         || 'set ip_hmac = null, user_agent = null '
         || 'where studio_id = $1 and socio_id = $2 '
         || 'and (ip_hmac is not null or user_agent is not null)'
      using p_studio_id, p_socio_id;
  end if;

  -- 9. Registro
  insert into public.supresiones as sp (studio_id, socio_id, auth_user_id, ejecutada_en, ejecutada_por, origen)
  values (p_studio_id, p_socio_id, v_auth, now(), p_ejecutada_por, p_origen)
  on conflict (studio_id, socio_id) do update
     set reaplicada_en = now(),
         auth_user_id = coalesce(sp.auth_user_id, excluded.auth_user_id),
         ejecutada_en = coalesce(sp.ejecutada_en, excluded.ejecutada_en),
         ejecutada_por = coalesce(sp.ejecutada_por, excluded.ejecutada_por);

  return jsonb_build_object(
    'socio_id', p_socio_id,
    'documentos_storage_paths', to_jsonb(v_docs),
    'mandato_sepa_retenido', v_mandato_retenido,
    'penalizaciones_conservadas', v_pen_conservadas,
    'cuenta_es_staff_del_estudio', v_es_staff
  );
end;
$function$;

comment on function public.anonimizar_socio(text, text, uuid, text) is
  'Supresión RGPD completa de una socia (idempotente). Solo service_role. Clasificación en lib/socios/supresion-clasificacion.ts.';

revoke all on function public.anonimizar_socio(text, text, uuid, text) from public;
revoke all on function public.anonimizar_socio(text, text, uuid, text) from anon;
revoke all on function public.anonimizar_socio(text, text, uuid, text) from authenticated;
grant execute on function public.anonimizar_socio(text, text, uuid, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.anonimizar_socio(text, text, uuid, text)', 'EXECUTE') then
    raise exception 'anon puede ejecutar anonimizar_socio';
  end if;
  if has_function_privilege('authenticated', 'public.anonimizar_socio(text, text, uuid, text)', 'EXECUTE') then
    raise exception 'authenticated puede ejecutar anonimizar_socio: cualquier sesión borraría socias ajenas';
  end if;
  if not has_function_privilege('service_role', 'public.anonimizar_socio(text, text, uuid, text)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar anonimizar_socio: la ruta de baja se quedaría sin supresión';
  end if;
end
$$;

-- ── 5. purgar_estudio_vencido: la vigente + las dos tablas ───────────────────
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.purgar_estudio_vencido(text, boolean)'::regprocedure)
     <> '9644ba2b508b97e95cfde21831d8cec8' then
    raise exception 'purgar_estudio_vencido ha cambiado desde 20261001162731: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.purgar_estudio_vencido(p_studio_id text, p_ejecutar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- ⚠️ LEGAL: suelo de la guardia; el plazo real lo decide el ciclo en TS.
  c_dias_minimos constant interval := interval '90 days';
  c_borrar constant text[] := array[
    'recomendacion_outcomes', 'recomendaciones', 'decision_snapshots', 'decision_mensajes_dia',
    'notification_delivery', 'notification', 'notification_preference', 'push_subscription',
    'automation_logs', 'actividad_reciente', 'widget_eventos', 'intentos_reserva_fallidos', 'avisos_hueco',
    'valoraciones_iniciales_salud', 'valoraciones_iniciales', 'condiciones_salud',
    'respuestas_cuestionario_salud', 'respuestas_sesion', 'notas_internas', 'notas_progreso',
    'documentos_socio', 'memoria_socio', 'comunicaciones_socio', 'preferencias_socio', 'tareas',
    'mensajes', 'conversaciones', 'mensajes_equipo',
    'comentarios_comunidad', 'post_likes', 'posts_comunidad',
    'valoraciones', 'favoritos_clase', 'socio_companeras', 'reto_participaciones',
    'achievement_history', 'achievement_progress', 'challenge_history', 'challenge_progress',
    'reward_history', 'reward_redemptions', 'reward_actions', 'credit_transactions', 'member_credits',
    'instructor_bajas_seguimiento', 'bajas_instructora', 'instructora_disponibilidad_excepciones',
    'instructora_ausencias', 'instructora_disponibilidad', 'citas_disponibilidad',
    'instructor_dependency_snapshots', 'sustitucion_contactos',
    'oauth_auditoria_accesos', 'oauth_codigos_autorizacion', 'oauth_tokens', 'oauth_consentimientos',
    'integracion_credenciales', 'migracion_batches', 'resumen_semanal_envios', 'soporte_solicitudes',
    'backups', 'consultas_contacto',
    'api_webhook_entregas', 'api_webhooks', 'api_eventos', 'api_claves', 'api_acceso_estudios',
    -- Antes los movimientos que sus lotes.
    'cobros_externos', 'cobros_externos_lotes'
  ];
  -- Texto libre en filas que se conservan: [tabla, columna, valor vacío en SQL].
  c_vaciar constant text[][] := array[
    ['sustituciones', 'motivo', 'null'],
    ['sustituciones', 'ranking', '''[]''::jsonb'],
    ['sustituciones', 'candidatos_network', 'null'],
    ['sesiones', 'notas', 'null'],
    ['sesiones', 'incidencia_texto', 'null'],
    ['citas', 'notas', 'null'],
    -- Jornadas y su auditoría se conservan (registro de jornada) sin quién las
    -- tocó ni por qué: la cuenta pasa a un centinela y el motivo, libre, se vacía.
    ['instructor_work_sessions', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['instructor_work_sessions', 'edited_by', 'null'],
    ['work_session_audits', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['work_session_audits', 'reason', 'null'],
    -- Igual con las clases impartidas: se conservan (qué clase se dio y cuándo)
    -- sin quién las tocó ni el motivo libre de las correcciones.
    ['clases_impartidas', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas', 'edited_by', 'null'],
    ['clases_impartidas', 'revisada_por', 'null'],
    ['clases_impartidas_auditoria', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas_auditoria', 'motivo', 'null']
  ];
  -- Los scopes del CHECK de instructor_enlaces_vigentes. Sin '.', nunca pasa por
  -- un token firmado: cualquier enlace de la instructora deja de reconocerse.
  c_scopes_enlace constant text[] := array['disponibilidad', 'reportar_baja', 'invitacion'];
  c_token_revocado constant text := 'revocado-por-purga';
  c_conservar constant text[] := array[
    'facturas', 'recibos', 'ventas_pos', 'devoluciones', 'pagos_historicos', 'mandatos_sepa',
    'penalizaciones', 'liquidaciones_instructoras', 'instructor_tarifas', 'lecturas_ficha_salud',
    'reservas', 'suscripciones', 'instructor_work_sessions', 'work_session_audits',
    'clases_impartidas', 'clases_impartidas_auditoria'
  ];
  v_estudio     record;
  v_tabla       text;
  v_col         text[];
  v_n           bigint;
  v_borrar      jsonb := '{}'::jsonb;
  v_conservar   jsonb := '{}'::jsonb;
  v_vaciar      jsonb := '{}'::jsonb;
  v_socio       record;
  v_n_socias    bigint;
  v_n_instr     bigint;
  v_anonimizar  boolean := to_regprocedure('public.anonimizar_socio(text,text,uuid,text)') is not null;
begin
  select id, subscription_status, subscription_id, trial_ends_at
    into v_estudio from public.studios where id = p_studio_id;
  if not found then
    raise exception 'purgar_estudio_vencido: el estudio % no existe', p_studio_id;
  end if;

  -- Guardia EN LA BD, no solo en el cron: jamás se purga un estudio que paga,
  -- que tiene suscripción de Stripe o que no lleva 90 días vencido.
  if v_estudio.subscription_status is distinct from 'trial_expirado'
     or v_estudio.subscription_id is not null
     or v_estudio.trial_ends_at is null
     or v_estudio.trial_ends_at > now() - c_dias_minimos then
    raise exception 'purgar_estudio_vencido: % no está en trial_expirado sin suscripción con más de 90 días', p_studio_id;
  end if;

  select count(*) into v_n_socias from public.socios where studio_id = p_studio_id and borrado_en is null;
  select count(*) into v_n_instr from public.instructores
   where studio_id = p_studio_id
     and (email is not null or telefono is not null or auth_user_id is not null
          or foto_url is not null or avatar is not null or bio is not null);

  if p_ejecutar and v_n_socias > 0 and not v_anonimizar then
    raise exception 'purgar_estudio_vencido: falta public.anonimizar_socio(text, text, uuid, text); no se purga sin anonimizar a las socias';
  end if;

  if p_ejecutar then
    for v_socio in select id from public.socios where studio_id = p_studio_id and borrado_en is null loop
      perform public.anonimizar_socio(p_studio_id, v_socio.id);
    end loop;

    update public.instructores
       set nombre = 'Instructora eliminada', email = null, telefono = null, auth_user_id = null,
           foto_url = null, avatar = null, bio = null, activo = false
     where studio_id = p_studio_id;
  end if;

  foreach v_tabla in array c_borrar loop
    if p_ejecutar then
      execute format('delete from public.%I where studio_id = $1', v_tabla) using p_studio_id;
      get diagnostics v_n = row_count;
    else
      execute format('select count(*) from public.%I where studio_id = $1', v_tabla) into v_n using p_studio_id;
    end if;
    v_borrar := v_borrar || jsonb_build_object(v_tabla, v_n);
  end loop;

  -- La fila se queda (la clase, la cita, quién cubrió a quién); el texto, no.
  foreach v_col slice 1 in array c_vaciar loop
    if p_ejecutar then
      execute format('update public.%I set %I = %s where studio_id = $1 and %I is distinct from %s',
                     v_col[1], v_col[2], v_col[3], v_col[2], v_col[3]) using p_studio_id;
      get diagnostics v_n = row_count;
    else
      execute format('select count(*) from public.%I where studio_id = $1 and %I is distinct from %s',
                     v_col[1], v_col[2], v_col[3]) into v_n using p_studio_id;
    end if;
    v_vaciar := v_vaciar || jsonb_build_object(v_col[1] || '.' || v_col[2], v_n);
  end loop;

  -- Enlaces de la instructora: centinela y no DELETE (ver cabecera de la migración).
  select count(*) into v_n from public.instructor_enlaces_vigentes
   where studio_id = p_studio_id and token <> c_token_revocado;
  if p_ejecutar then
    insert into public.instructor_enlaces_vigentes (instructor_id, studio_id, scope, token)
    select i.id, i.studio_id, s.scope, c_token_revocado
      from public.instructores i
     cross join unnest(c_scopes_enlace) as s(scope)
     where i.studio_id = p_studio_id
    on conflict (instructor_id, scope) do update
       set token = excluded.token, email_enviado_en = null, actualizado_en = now();
  end if;
  v_vaciar := v_vaciar || jsonb_build_object('instructor_enlaces_vigentes.token', v_n);

  foreach v_tabla in array c_conservar loop
    execute format('select count(*) from public.%I where studio_id = $1', v_tabla) into v_n using p_studio_id;
    v_conservar := v_conservar || jsonb_build_object(v_tabla, v_n);
  end loop;

  return jsonb_build_object(
    'modo', case when p_ejecutar then 'activa' else 'informe' end,
    'socios_a_anonimizar', v_n_socias,
    'instructoras_a_anonimizar', v_n_instr,
    'anonimizar_socio_disponible', v_anonimizar,
    'borrar', v_borrar,
    'vaciar', v_vaciar,
    'conservar', v_conservar
  );
end;
$$;

-- Los mismos permisos que ya tiene en producción, explícitos: solo service_role (el cron de purga).
revoke all on function public.purgar_estudio_vencido(text, boolean) from public, anon;
revoke all on function public.purgar_estudio_vencido(text, boolean) from authenticated;
grant execute on function public.purgar_estudio_vencido(text, boolean) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'purgar_estudio_vencido no puede ser ejecutable por anon ni authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar purgar_estudio_vencido: el cron de purga se quedaría sin ella';
  end if;
end $$;

-- ── 6. Retención de los datos personales (solo SQL, sin coste de Vercel) ─────
select cron.unschedule('cobros-externos-retencion')
 where exists (select 1 from cron.job where jobname = 'cobros-externos-retencion');
select cron.schedule(
  'cobros-externos-retencion',
  '23 3 * * *',
  $$update public.cobros_externos
       set pagador_nombre = null, concepto = null, referencia = null, datos_personales_purgados_en = now()
     where datos_personales_purgados_en is null
       and (pagador_nombre is not null or concepto is not null or referencia is not null)
       and ((resuelto_en is not null and resuelto_en < now() - interval '90 days')
         or (resuelto_en is null and creado_en < now() - interval '180 days'))$$
);

-- ── Verificación: si algo no quedó como se espera, se deshace todo ───────────
do $$
declare
  r text;
  t text;
begin
  foreach t in array array['public.cobros_externos', 'public.cobros_externos_lotes'] loop
    foreach r in array array['anon', 'authenticated'] loop
      -- TRUNCATE se salta la RLS; MAINTAIN lo dan los privilegios por defecto del proyecto.
      if has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT')
         or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE')
         or has_table_privilege(r, t, 'TRUNCATE') or has_table_privilege(r, t, 'REFERENCES')
         or has_table_privilege(r, t, 'TRIGGER') or has_table_privilege(r, t, 'MAINTAIN') then
        raise exception '% no puede ser accesible para %', t, r;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'recibos_conciliado_por_check'
                  and pg_get_constraintdef(oid) like '%externo%') then
    raise exception 'recibos_conciliado_por_check sin externo';
  end if;
  if position('cobros_externos' in (select prosrc from pg_proc where oid = 'public.anonimizar_socio(text, text, uuid, text)'::regprocedure)) = 0 then
    raise exception 'anonimizar_socio no trata cobros_externos';
  end if;
  if position('''cobros_externos''' in (select prosrc from pg_proc where oid = 'public.purgar_estudio_vencido(text, boolean)'::regprocedure)) = 0 then
    raise exception 'purgar_estudio_vencido no borra cobros_externos';
  end if;
end $$;
