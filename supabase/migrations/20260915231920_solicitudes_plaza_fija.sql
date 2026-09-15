-- Plaza fija desde la app de la alumna: SOLICITUDES que aprueba el estudio.
--
-- Decisión del fundador (16-sep-2026): el estudio controla las reglas y Tentare
-- automatiza su cumplimiento. Nada cambia hasta que la propietaria lo active:
--   · «Pueden pedir plaza fija desde su app»      (plaza_fija_solicitar_desde_app, por defecto no)
--   · «Pueden pedir una pausa desde su app»       (plaza_fija_pausa_desde_app, por defecto no)
--   · «Mientras dura una pausa, su sitio queda libre para otra alumna»
--                                                   (plaza_fija_pausa_libera_sitio, por defecto no:
--                                                    conserva su sitio, como hasta ahora). Vale
--                                                    para TODAS las pausas nuevas, también las del
--                                                    mostrador; las ya puestas no cambian.
--   · «Al terminar la pausa»: volver sola si su sitio sigue libre, o preguntar antes
--                                                   (plaza_fija_fin_pausa).
-- Hasta que el estudio aprueba una solicitud, la plaza real no cambia. Pasar del
-- límite semanal no bloquea la petición: decide el estudio. Rechazar la vuelta de
-- una pausa quita la plaza.
--
-- Si una pausa libera el sitio se decide al ponerla y queda escrito en la PLAZA
-- (`plazas_fijas.pausa_libera_sitio`): así encender el ajuste no cambia las pausas
-- ya puestas. Cuando la pausa empieza (y le queda más de una semana), la plaza pasa
-- a `estado = 'PAUSADA'` con sus fechas: la exclusión GiST (0083) y el motor ya
-- ignoran PAUSADA, así que el sitio y el cupo quedan libres sin tocar ninguno de
-- los dos. Antes de empezar sigue ACTIVA: hasta entonces la clase es suya. La
-- vuelta la decide el cron nocturno con `plaza_fija_hueco_para_volver`.
--
-- La tabla va SIN políticas RLS y sin grants a anon/authenticated: todo pasa por
-- el servidor (service_role), la alumna con su token y el estudio con su sesión.

-- ⚠️ `solicitudes_plaza_fija` guarda `socio_id`, así que la supresión RGPD tiene
-- que decidir qué hace con ella. Decisión: BORRAR (sin plaza no hay nada que
-- decidir, y el motivo de rechazo es texto sobre ella). Por eso al final esta
-- migración recrea `anonimizar_socio` ENTERA —idéntica a la vigente
-- (20260914015248) más ese delete—: el test `lib/socios/supresion-cobertura.test.ts`
-- lee la ÚLTIMA migración que la recrea. Fuente documental de la clasificación:
-- `lib/socios/supresion-clasificacion.ts`; copia para quien lea solo el SQL:
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
-- | notification                   | BORRAR     | Suyas + las del staff que la nombran; delivery en cascada
-- | tareas                         | BORRAR     | Tareas del staff sobre ella
-- | intentos_reserva_fallidos      | BORRAR     | Log
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
-- | recibos / facturas / ventas_pos / devoluciones / pagos_historicos / codigos_descuento_consumos | CONSERVAR | Fiscal
-- | lecturas_ficha_salud           | CONSERVAR  | ⚠️ REVISIÓN LEGAL: registro de accesos del staff a su ficha; falta fijar plazo
-- | supresiones                    | CONSERVAR  | El propio registro
-- | solicitudes_derechos           | CONSERVAR  | ⚠️ REVISIÓN LEGAL: prueba de que el derecho se ejerció y resolvió (#1922; la función no la toca)
-- | consentimientos_salud_eventos  | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: firma → «[firma eliminada]» (un CHECK la exige), actor_uid NULL; quedan tipo/fecha/origen/texto (#1927, solo si existe)
-- | socios.consentimiento_salud_registrado_por_uid | → NULL, solo si la columna existe (#1927)
-- | aceptaciones_contrato_eventos  | ANONIMIZAR | ⚠️ REVISIÓN LEGAL: firma → «[firma eliminada]», ip_hmac/user_agent/introducida_por/actor_uid NULL; quedan fecha/origen/texto_hash/texto_cliente_coincide (20260914015133, solo si existe)
--
-- No enlazables por socio_id y fuera de aquí a propósito: `ingresos_manuales.cliente`
-- (texto libre del estudio), `decision_snapshots` (se regenera en cada pasada),
-- `facturas.receptor_*` (fiscal), `terminos_versiones` (texto legal del estudio,
-- no de la socia). Terceros (Stripe, cuenta de acceso) → la ruta.
--
-- Idempotente: se puede volver a llamar sobre una socia ya suprimida.
--
-- ⚠️ Solo service_role: los tres pasos (REVOKE anon, REVOKE authenticated,
-- GRANT service_role) y `has_function_privilege` al final. Sin guardas de
-- `auth.uid()` (#1945): el límite es el grant.
--
-- Tablas calientes: un ALTER que no consigue su lock enseguida falla en vez de
-- dejar en cola las lecturas.
set lock_timeout = '5s';

-- ── Ajustes del estudio ──────────────────────────────────────────────────────
alter table public.studios
  add column if not exists plaza_fija_solicitar_desde_app boolean not null default false,
  add column if not exists plaza_fija_pausa_desde_app boolean not null default false,
  add column if not exists plaza_fija_pausa_libera_sitio boolean not null default false,
  add column if not exists plaza_fija_fin_pausa text not null default 'RECUPERAR_SI_LIBRE';

alter table public.studios drop constraint if exists studios_plaza_fija_fin_pausa_check;
alter table public.studios add constraint studios_plaza_fija_fin_pausa_check
  check (plaza_fija_fin_pausa in ('RECUPERAR_SI_LIBRE', 'PENDIENTE_CONFIRMAR'));

grant update (plaza_fija_solicitar_desde_app, plaza_fija_pausa_desde_app, plaza_fija_pausa_libera_sitio, plaza_fija_fin_pausa)
  on public.studios to authenticated;

-- ── La marca de la pausa, en la plaza ────────────────────────────────────────
-- La escribe solo el servidor al poner la pausa. Sin grant de columna nuevo: la
-- RLS de `plazas_fijas` ya la cubre y el panel no la escribe.
alter table public.plazas_fijas
  add column if not exists pausa_libera_sitio boolean not null default false;

alter table public.plazas_fijas drop constraint if exists plazas_fijas_libera_sitio_con_pausa;
alter table public.plazas_fijas add constraint plazas_fijas_libera_sitio_con_pausa
  check (not pausa_libera_sitio or pausa_desde is not null);

-- ── Las solicitudes ──────────────────────────────────────────────────────────
create table if not exists public.solicitudes_plaza_fija (
  id text primary key default ('spf-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  tipo text not null check (tipo in ('CREAR', 'PAUSAR', 'REANUDAR')),
  -- REANUDAR la crea el cron (SISTEMA) cuando la vuelta de una pausa necesita confirmación.
  origen text not null default 'ALUMNA' check (origen in ('ALUMNA', 'SISTEMA')),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'CADUCADA')),
  -- CREAR: la clase desde la que pide y la franja congelada al pedir (la clase puede moverse).
  sesion_id text references public.sesiones(id) on delete set null,
  dia_semana smallint check (dia_semana between 0 and 6),
  hora_inicio time,
  sala_id text,
  tipo_clase_id text,
  -- Pasaba del límite semanal de su cuota al pedirla: la decide el estudio.
  supera_limite boolean not null default false,
  -- PAUSAR / REANUDAR
  plaza_id text references public.plazas_fijas(id) on delete cascade,
  desde_propuesta date,
  hasta_propuesta date,
  desde_aprobada date,
  hasta_aprobada date,
  -- REANUDAR: por qué no volvió sola (SIN_CUPO | SITIO_OCUPADO | SIN_CUOTA | SUPERA_LIMITE | PREGUNTAR).
  motivo_sistema text,
  motivo_rechazo text check (motivo_rechazo is null or length(motivo_rechazo) <= 200),
  resultado_plaza_id text references public.plazas_fijas(id) on delete set null,
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid,
  constraint solicitudes_plaza_fija_resuelta_coherente check ((estado = 'PENDIENTE') = (resuelta_en is null)),
  constraint solicitudes_plaza_fija_crear_con_franja check (tipo <> 'CREAR' or (dia_semana is not null and hora_inicio is not null and sala_id is not null and plaza_id is null)),
  constraint solicitudes_plaza_fija_con_plaza check (tipo = 'CREAR' or plaza_id is not null),
  constraint solicitudes_plaza_fija_pausa_fechas check (tipo <> 'PAUSAR' or (desde_propuesta is not null and hasta_propuesta is not null and hasta_propuesta >= desde_propuesta))
);

-- Una sola pendiente por plaza y tipo, y por franja al pedir plaza (doble toque = la misma).
create unique index if not exists spf_una_pendiente_plaza
  on public.solicitudes_plaza_fija (plaza_id, tipo) where estado = 'PENDIENTE' and plaza_id is not null;
create unique index if not exists spf_una_pendiente_franja
  on public.solicitudes_plaza_fija (socio_id, dia_semana, hora_inicio, sala_id) where estado = 'PENDIENTE' and tipo = 'CREAR';
create index if not exists spf_bandeja on public.solicitudes_plaza_fija (studio_id, estado);

alter table public.solicitudes_plaza_fija enable row level security;
-- Sin políticas: solo service_role. Los grants por defecto de tabla SÍ llegan a
-- anon/authenticated en este proyecto, así que se quitan explícitamente.
revoke all on public.solicitudes_plaza_fija from public, anon, authenticated;
grant all on public.solicitudes_plaza_fija to service_role;

-- ── ¿Puede volver de su pausa? ───────────────────────────────────────────────
-- Espejo de solo lectura del emparejamiento del motor. Cuenta PLAZAS FIJAS, no
-- reservas: que una semana concreta la haya reservado alguien clase a clase no le
-- quita la plaza recurrente (eso ya lo avisa `plazas_fijas_sin_materializar`).
--   'SITIO_OCUPADO' → otra plaza ACTIVA tiene su sitio concreto en su franja;
--   'SIN_CUPO'      → en alguna clase de su franja de las 6 semanas tras la pausa,
--                     las plazas fijas ACTIVAS de otras ya llenan el aforo;
--   'OK'            → puede volver.
create or replace function public.plaza_fija_hueco_para_volver(p_plaza_id text)
 returns text
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  with p as (
    select * from plazas_fijas where id = p_plaza_id
  )
  select case
    when exists (
      select 1 from plazas_fijas o, p
      where o.id <> p.id and o.studio_id = p.studio_id and o.estado = 'ACTIVA'
        and p.spot_id is not null and o.spot_id = p.spot_id
        and o.sala_id = p.sala_id and o.dia_semana = p.dia_semana and o.hora_inicio = p.hora_inicio
        and (o.vigencia_hasta is null or o.vigencia_hasta >= coalesce(p.pausa_hasta, current_date))
    ) then 'SITIO_OCUPADO'
    when exists (
      select 1
      from p
      join sesiones s
        on s.studio_id = p.studio_id and s.sala_id = p.sala_id and coalesce(s.cancelada, false) = false
       and s.inicio >= greatest(now(), (coalesce(p.pausa_hasta, current_date) + 1)::timestamp at time zone 'Europe/Madrid')
       and s.inicio < (coalesce(p.pausa_hasta, current_date) + 43)::timestamp at time zone 'Europe/Madrid'
       and extract(dow from s.inicio at time zone 'Europe/Madrid') = p.dia_semana
       and (s.inicio at time zone 'Europe/Madrid')::time = p.hora_inicio
       and (p.tipo_clase_id is null or s.tipo_clase_id = p.tipo_clase_id)
      where (
        select count(*) from plazas_fijas o
        where o.id <> p.id and o.studio_id = p.studio_id and o.estado = 'ACTIVA'
          and o.sala_id = p.sala_id and o.dia_semana = p.dia_semana and o.hora_inicio = p.hora_inicio
          and (o.tipo_clase_id is null or o.tipo_clase_id = s.tipo_clase_id)
          and (s.inicio at time zone 'Europe/Madrid')::date >= o.vigencia_desde
          and (o.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= o.vigencia_hasta)
          and not (o.pausa_desde is not null and (s.inicio at time zone 'Europe/Madrid')::date between o.pausa_desde and o.pausa_hasta)
      ) >= aforo_efectivo(s.id)
    ) then 'SIN_CUPO'
    else 'OK'
  end;
$function$;

revoke all on function public.plaza_fija_hueco_para_volver(text) from public, anon, authenticated;
grant execute on function public.plaza_fija_hueco_para_volver(text) to service_role;

-- ── Supresión RGPD: sus peticiones se van con su plaza ──────────────────────
-- Recreada idéntica a la vigente más el delete de `solicitudes_plaza_fija`
-- (bloque 5, con las demás de operativa). Misma firma, mismos grants y las
-- mismas comprobaciones al aplicar.

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
  delete from public.recordatorio_envios t where t.socio_id = p_socio_id;
  delete from public.favoritos_clase t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
  delete from public.avisos_hueco t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;

  update public.automation_logs al
     set socio_nombre = 'Socia eliminada', mensaje_cliente = null, detalle = null
   where al.studio_id = p_studio_id and al.socio_id = p_socio_id
     and (al.socio_nombre is distinct from 'Socia eliminada' or al.mensaje_cliente is not null or al.detalle is not null);

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

  -- 8c. Evidencia de aceptación del contrato (20260914015133; puede no existir aún). ⚠️ REVISIÓN LEGAL.
  if to_regclass('public.aceptaciones_contrato_eventos') is not null then
    execute 'update public.aceptaciones_contrato_eventos '
         || 'set firma = ''[firma eliminada]'', ip_hmac = null, user_agent = null, introducida_por = null, actor_uid = null '
         || 'where studio_id = $1 and socio_id = $2 '
         || 'and (firma <> ''[firma eliminada]'' or ip_hmac is not null or user_agent is not null '
         || 'or introducida_por is not null or actor_uid is not null)'
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
