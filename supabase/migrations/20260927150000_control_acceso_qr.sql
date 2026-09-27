-- ─────────────────────────────────────────────────────────────────────────────
-- Control de acceso con QR: el QR permanente de la alumna y el registro de cada
-- escaneo.
--
-- Hasta hoy el QR era de una RESERVA: un token firmado que caducaba en 2 minutos
-- (lib/pase-acceso.ts), solo en el detalle de la próxima clase, y un código de 6
-- caracteres para teclearlo. Ahora el QR es de la ALUMNA y no cambia: la
-- identifica y nada más. Si puede entrar lo decide Tentare en el momento del
-- escaneo con las reglas de siempre (su reserva para ESA clase, que ya lleva
-- dentro bono, cuota y plaza fija), nunca el QR.
--
-- ── socios_qr_acceso ─────────────────────────────────────────────────────────
-- Una fila activa por alumna. Se guarda solo el HASH del token (mismo criterio
-- que `kiosko_tokens`): el token se recalcula en servidor a partir del id de la
-- fila con HMAC (lib/acceso/qr-token.ts), así que la alumna ve el mismo QR en
-- cualquier dispositivo sin que el valor viva en la base de datos. Regenerarlo
-- revoca la fila y crea otra; la revocada se queda un tiempo para poder decir
-- «este QR fue sustituido» en vez de «no lo reconozco». Solo servidor.
--
-- ── accesos_escaneos ─────────────────────────────────────────────────────────
-- Una fila por escaneo, también los que no identifican a nadie (QR ajeno o
-- inventado). Lo que se decide después de un 🟠 («Aprobar y dejar pasar»,
-- «Dejar pasar», «No permitir acceso») es OTRA fila que apunta a la primera
-- (`decision_de`, única: una decisión por escaneo, y un doble toque no aprueba
-- dos veces). No se reescribe: un UPDATE lo rechaza un trigger. Escribe solo el
-- servidor; lee el personal que gestiona el calendario (propietaria, gerencia,
-- recepción), el mismo que puede escanear en el panel.
-- Quién escaneó va como uid y rol, nunca con nombre (mismo criterio que
-- `auditoria_estudio`); si esa persona se elimina del equipo, su uid se queda
-- hasta que la retención de 12 meses borra la fila.
--
-- ── studios.control_acceso_qr ────────────────────────────────────────────────
-- El único ajuste nuevo (decisión del fundador, 27-sep): si la alumna ve su QR y
-- si se puede escanear. ENCENDIDO de serie, que es lo que ya pasaba: el pase por
-- reserva se enseñaba en todos los estudios. Si el escaneo marca asistencia lo
-- sigue decidiendo «Pasar lista» (`requiere_checkin_qr`), no esto.
--
-- ⚠️ LEGAL: plazos pendientes de validar (mismo criterio que purgar_datos_caducados).
-- Escaneos y QR revocados: 12 meses, por pg_cron, sin HTTP ni Inngest.
--
-- ── RGPD ─────────────────────────────────────────────────────────────────────
-- Las dos tablas tienen `socio_id` y se BORRAN al suprimir a la alumna, así que
-- se recrea `anonimizar_socio`: IDÉNTICA a la vigente (migr 20260925012949,
-- comprobado el md5 de prosrc contra producción el 27-sep), más las dos líneas
-- de estas tablas. La purga de un estudio vencido llama a `anonimizar_socio` por
-- cada socia, así que queda cubierta sin tocar `purgar_estudio_vencido`.
--
-- El test `lib/socios/supresion-cobertura.test.ts` lee la ÚLTIMA migración que recrea
-- la función, así que la clasificación completa (copia de
-- `lib/socios/supresion-clasificacion.ts`, fuente documental) va aquí:
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
-- | comunicaciones_socio           | BORRAR     | Asuntos de correos
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
-- | recibos / facturas / ventas_pos / devoluciones / pagos_historicos / codigos_descuento_consumos / auditoria_estudio | CONSERVAR | Fiscal (auditoria_estudio: el libro de cambios de esas mismas tablas)
-- | lecturas_ficha_salud           | CONSERVAR  | ⚠️ REVISIÓN LEGAL: registro de accesos del staff a su ficha; falta fijar plazo
-- | supresiones                    | CONSERVAR  | El propio registro
-- | solicitudes_derechos           | CONSERVAR  | ⚠️ REVISIÓN LEGAL: prueba de que el derecho se ejerció y resolvió (#1922; la función no la toca)
-- | consentimientos_salud_eventos  | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: firma → «[firma eliminada]» (un CHECK la exige), actor_uid NULL; quedan tipo/fecha/origen/texto (#1927, solo si existe)
-- | socios.consentimiento_salud_registrado_por_uid | → NULL, solo si la columna existe (#1927)
-- | aceptaciones_contrato_eventos  | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: firma → «[firma eliminada]», ip_hmac/user_agent/introducida_por/actor_uid NULL; quedan fecha/origen/texto_hash/texto_cliente_coincide (20260914015133, solo si existe)
-- | consentimientos_marketing_eventos | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: se quedan cuándo/DAR-RETIRAR/origen/texto (la prueba); ip_hmac/user_agent NULL (20260922004313, solo si existe)
--
-- No enlazables por socio_id y fuera de aquí a propósito: `ingresos_manuales.cliente`
-- (texto libre del estudio), `decision_snapshots` (se regenera en cada pasada),
-- `facturas.receptor_*` (fiscal), `terminos_versiones` (texto legal del estudio,
-- no de la socia). Terceros (Stripe, cuenta de acceso) → la ruta.
--
-- Idempotente: se puede volver a llamar sobre una socia ya suprimida.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── El ajuste ───────────────────────────────────────────────────────────────
alter table public.studios
  add column if not exists control_acceso_qr boolean not null default true;

comment on column public.studios.control_acceso_qr is
  'Control de acceso con QR: si la alumna ve su QR permanente en la app y si el equipo puede escanearlo. Encendido de serie. Si el escaneo marca asistencia lo decide requiere_checkin_qr.';

-- ⚠️ `authenticated` no tiene UPDATE de tabla sobre `studios`, solo por columnas
-- (migr 20260910171150): sin este grant el interruptor fallaría al guardarse.
grant update (control_acceso_qr) on public.studios to authenticated;

-- ── El QR de cada alumna ────────────────────────────────────────────────────
create table if not exists public.socios_qr_acceso (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  token_hash text not null,
  creado_en timestamptz not null default now(),
  revocado_en timestamptz,
  revocado_por text check (revocado_por in ('ALUMNA', 'ESTUDIO', 'SISTEMA')),
  constraint socios_qr_acceso_token_hash_unq unique (token_hash),
  constraint socios_qr_acceso_revocado_coherente check ((revocado_en is null) = (revocado_por is null))
);

-- Una sola activa por alumna: dos peticiones a la vez crean UNA (la otra choca
-- con el índice y relee la que ganó).
create unique index if not exists socios_qr_acceso_una_activa
  on public.socios_qr_acceso (socio_id) where revocado_en is null;

comment on table public.socios_qr_acceso is
  'QR permanente de acceso de cada alumna: solo el hash del token (lib/acceso/qr-token.ts). Solo servidor.';

alter table public.socios_qr_acceso enable row level security;
revoke all on table public.socios_qr_acceso from public, anon, authenticated;
grant select, insert, update, delete on table public.socios_qr_acceso to service_role;

-- ── El registro de escaneos ─────────────────────────────────────────────────
create table if not exists public.accesos_escaneos (
  id bigint generated always as identity primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  ocurrido_en timestamptz not null default now(),
  socio_id text references public.socios(id) on delete cascade,
  -- Sin FK a propósito: un `on delete set null` es un UPDATE sobre esta tabla,
  -- el trigger de abajo lo rechaza, y borrar una clase con un escaneo fallaba
  -- entero (revisión de seguridad, 27-sep). Un registro guarda lo que pasó,
  -- aunque la clase ya no exista.
  sesion_id text,
  reserva_id text,
  actor_uid uuid not null,
  actor_rol text not null,
  origen text not null check (origen in ('PANEL', 'APP_INSTRUCTORA')),
  resultado text not null check (resultado in ('PERMITIDO', 'REVISAR', 'DENEGADO')),
  motivo text not null check (motivo in (
    -- Entra
    'RESERVA_CONFIRMADA', 'PLAZA_FIJA', 'YA_ENTRO',
    -- Lo decide quien escanea
    'PENDIENTE_APROBACION', 'CLIENTA_DESACTIVADA', 'IMPAGO', 'VARIAS_CLASES',
    -- No entra
    'SIN_RESERVA', 'RESERVA_CANCELADA', 'LISTA_ESPERA', 'NO_ASISTIO', 'RESERVA_OTRA_CLASE',
    'CLASE_CANCELADA', 'CLASE_TERMINADA', 'CLASE_NO_EMPEZADA', 'SIN_CLASE_AHORA',
    'QR_NO_RECONOCIDO', 'QR_SUSTITUIDO', 'QR_OTRO_ESTUDIO',
    -- Tras decidir un 🟠
    'APROBADA_SIN_PLAZA', 'CLASE_YA_EMPEZADA', 'NO_PERMITIDO'
  )),
  decision text check (decision in ('DEJAR_PASAR', 'APROBAR', 'NO_PERMITIR')),
  decision_de bigint references public.accesos_escaneos(id) on delete cascade,
  asistencia_marcada boolean not null default false,
  constraint accesos_escaneos_decision_coherente check ((decision is null) = (decision_de is null))
);

create index if not exists accesos_escaneos_studio_idx on public.accesos_escaneos (studio_id, ocurrido_en desc);
create index if not exists accesos_escaneos_socio_idx on public.accesos_escaneos (socio_id, ocurrido_en desc) where socio_id is not null;
create index if not exists accesos_escaneos_sesion_idx on public.accesos_escaneos (sesion_id) where sesion_id is not null;
create unique index if not exists accesos_escaneos_una_decision on public.accesos_escaneos (decision_de) where decision_de is not null;

comment on table public.accesos_escaneos is
  'Historial de accesos: cada lectura de un QR de alumna y cada decisión tomada tras un 🟠. Lo escribe solo el servidor (lib/acceso/escanear-servidor.ts); no se reescribe.';

alter table public.accesos_escaneos enable row level security;
revoke all on table public.accesos_escaneos from public, anon, authenticated;
grant select on table public.accesos_escaneos to authenticated;
grant select, insert, delete on table public.accesos_escaneos to service_role;

drop policy if exists accesos_escaneos_lectura on public.accesos_escaneos;
create policy accesos_escaneos_lectura on public.accesos_escaneos
  for select to authenticated
  using (studio_id = (select public.current_studio_id())
         and (select public.puede_gestionar_calendario()));

-- Un registro que se puede reescribir no es un registro. DELETE sí (la
-- retención y la supresión RGPD), y solo lo tiene el servidor.
create or replace function public.accesos_escaneos_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'accesos_escaneos no se modifica: una decisión es una fila nueva';
end;
$$;

drop trigger if exists accesos_escaneos_inmutable on public.accesos_escaneos;
create trigger accesos_escaneos_inmutable
  before update on public.accesos_escaneos
  for each row execute function public.accesos_escaneos_inmutable();

revoke all on function public.accesos_escaneos_inmutable() from public, anon, authenticated;

-- ── Retención ───────────────────────────────────────────────────────────────
select cron.unschedule('purgar-accesos-qr')
where exists (select 1 from cron.job where jobname = 'purgar-accesos-qr');
select cron.schedule(
  'purgar-accesos-qr',
  '50 4 * * *',
  $$with escaneos as (
      delete from public.accesos_escaneos where ocurrido_en < now() - interval '12 months' returning 1
    )
    delete from public.socios_qr_acceso where revocado_en < now() - interval '12 months'$$
);

-- ── Comprobación de permisos al aplicar ─────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.socios_qr_acceso', 'SELECT')
     or has_table_privilege('anon', 'public.socios_qr_acceso', 'INSERT')
     or has_table_privilege('authenticated', 'public.socios_qr_acceso', 'SELECT')
     or has_table_privilege('authenticated', 'public.socios_qr_acceso', 'INSERT')
     or has_table_privilege('authenticated', 'public.socios_qr_acceso', 'UPDATE')
     or has_table_privilege('authenticated', 'public.socios_qr_acceso', 'DELETE') then
    raise exception 'socios_qr_acceso: el cliente no puede leer ni escribir los QR';
  end if;
  if has_table_privilege('anon', 'public.accesos_escaneos', 'SELECT')
     or has_table_privilege('anon', 'public.accesos_escaneos', 'INSERT')
     or has_table_privilege('authenticated', 'public.accesos_escaneos', 'INSERT')
     or has_table_privilege('authenticated', 'public.accesos_escaneos', 'UPDATE')
     or has_table_privilege('authenticated', 'public.accesos_escaneos', 'DELETE') then
    raise exception 'accesos_escaneos: grants más abiertos de lo previsto';
  end if;
  if not has_table_privilege('authenticated', 'public.accesos_escaneos', 'SELECT') then
    raise exception 'accesos_escaneos: el panel no podría leer el historial';
  end if;
  if not has_column_privilege('authenticated', 'public.studios', 'control_acceso_qr', 'UPDATE') then
    raise exception 'studios.control_acceso_qr: el interruptor no se podría guardar';
  end if;
  if has_function_privilege('authenticated', 'public.accesos_escaneos_inmutable()', 'EXECUTE') then
    raise exception 'accesos_escaneos_inmutable ejecutable por authenticated';
  end if;
end
$$;

-- ── anonimizar_socio: la vigente + las dos tablas de arriba ─────────────────
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
