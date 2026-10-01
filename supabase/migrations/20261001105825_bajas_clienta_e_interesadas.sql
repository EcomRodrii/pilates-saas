-- ─────────────────────────────────────────────────────────────────────────────
-- Clientas: el MOTIVO de una baja y las INTERESADAS apuntadas a mano.
--
-- ── bajas_clienta ────────────────────────────────────────────────────────────
-- Una fila por baja: por qué se fue (se muda, motivos personales, precio,
-- horarios, no le convenció, otro), cuándo y quién la dio de baja; al volver a darla de alta se
-- cierra con su fecha (no se borra: queda su historia). Una baja abierta por
-- socia (índice único parcial). «De baja» sigue saliendo de `socios.activo`; el
-- motivo es información añadida. Lee el mostrador que gestiona clientas
-- (PROPIETARIO, MANAGER, RECEPCION); escribe solo el servidor
-- (app/api/socios/[id]/baja). No hay motivo «salud» a propósito: diría algo de
-- su salud a quien no puede leerlo (recepción no ve la ficha clínica, y esa
-- exige consentimiento vigente). Para eso está «Motivos personales».
-- Sin texto libre a propósito: el detalle de «Otro» va en una nota.
--
-- ── consultas_contacto ───────────────────────────────────────────────────────
-- Hasta hoy solo las del formulario de la web. Ahora también las que el
-- mostrador apunta a mano (alguien que llamó, escribió por Instagram, pasó por
-- la puerta): `canal` dice de dónde vino y `registrada_por` quién la apuntó. La
-- base legal es la misma (art. 6.1.b: contestar a lo que pidió, nada más); un
-- CHECK ata cada procedencia a su prueba: la del formulario con su aceptación de
-- la privacidad, la apuntada con quién la apuntó. Nunca reciben marketing:
-- campañas y automatizaciones solo leen `socios`.
-- Se pueden DESCARTAR (no le interesa, era spam). Y un trigger en `socios` las
-- ENLAZA a la ficha cuando esa persona se da de alta por cualquier camino
-- (panel, /reservar, compra, importación) y las da por atendidas: así salen
-- solas de «Interesadas». Nunca crea fichas, ni bloquea un alta.
-- La purga diaria pasa a borrar también las descartadas (90 días, como las
-- atendidas); el tope de 180 días no cambia.
--
-- ── RGPD ─────────────────────────────────────────────────────────────────────
-- Las dos tablas tienen `socio_id` y se BORRAN al suprimir a la clienta, así que
-- se recrea `anonimizar_socio`: IDÉNTICA a la vigente (migr 20260927235435; el
-- md5 de prosrc se comprueba contra producción antes de aplicar), más las líneas
-- de estas dos tablas. La purga de un estudio vencido la llama por cada socia.
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

-- ── El motivo de cada baja ──────────────────────────────────────────────────
create table if not exists public.bajas_clienta (
  id text primary key default gen_random_uuid()::text,
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  motivo text not null check (motivo in ('SE_MUDA', 'PERSONAL', 'PRECIO', 'HORARIOS', 'NO_LE_CONVENCIO', 'OTRO')),
  baja_en timestamptz not null default now(),
  -- Cuentas (sin FK), igual que `consultas_contacto.atendida_por`.
  baja_por uuid,
  alta_en timestamptz,
  alta_por uuid
);

-- (Restricciones de varias columnas aparte: el generador de db-types lee cada
-- línea del CREATE como una columna.)
alter table public.bajas_clienta drop constraint if exists bajas_clienta_alta_coherente;
alter table public.bajas_clienta add constraint bajas_clienta_alta_coherente
  check (alta_en is null or alta_en >= baja_en);
create unique index if not exists bajas_clienta_una_abierta on public.bajas_clienta (socio_id) where alta_en is null;
create index if not exists bajas_clienta_studio_baja on public.bajas_clienta (studio_id, baja_en desc);

alter table public.bajas_clienta enable row level security;
drop policy if exists bajas_clienta_lectura on public.bajas_clienta;
create policy bajas_clienta_lectura on public.bajas_clienta
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

revoke all on table public.bajas_clienta from public, anon, authenticated;
grant select on table public.bajas_clienta to authenticated;
grant select, insert, update, delete on table public.bajas_clienta to service_role;

-- ── Interesadas apuntadas a mano ────────────────────────────────────────────
alter table public.consultas_contacto
  add column if not exists canal text not null default 'FORMULARIO',
  add column if not exists registrada_por uuid,
  add column if not exists convertida_en timestamptz,
  add column if not exists descartada_en timestamptz,
  add column if not exists descartada_por uuid;
-- Sentencia aparte: la guardia de la exportación (exportar-datos-socia.test.ts)
-- detecta `add column socio_id` justo detrás del nombre de la tabla.
alter table public.consultas_contacto add column if not exists socio_id text references public.socios(id) on delete set null;
alter table public.consultas_contacto alter column email drop not null;
alter table public.consultas_contacto alter column privacidad_aceptada_en drop not null;

alter table public.consultas_contacto drop constraint if exists consultas_contacto_canal_check;
alter table public.consultas_contacto add constraint consultas_contacto_canal_check
  check (canal in ('FORMULARIO', 'INSTAGRAM', 'LLAMADA', 'WHATSAPP', 'EN_PERSONA', 'RECOMENDADA', 'OTRO'));
alter table public.consultas_contacto drop constraint if exists consultas_contacto_algun_contacto;
alter table public.consultas_contacto add constraint consultas_contacto_algun_contacto
  check (email is not null or telefono is not null);
-- Cada procedencia con su prueba: la del formulario, su aceptación de la
-- privacidad; la apuntada a mano, quién la apuntó.
alter table public.consultas_contacto drop constraint if exists consultas_contacto_procedencia;
alter table public.consultas_contacto add constraint consultas_contacto_procedencia
  check ((canal = 'FORMULARIO' and privacidad_aceptada_en is not null and registrada_por is null)
      or (canal <> 'FORMULARIO' and privacidad_aceptada_en is null and registrada_por is not null));
alter table public.consultas_contacto drop constraint if exists consultas_contacto_estado_check;
alter table public.consultas_contacto add constraint consultas_contacto_estado_check
  check (estado in ('nueva', 'atendida', 'descartada'));
alter table public.consultas_contacto drop constraint if exists consultas_contacto_cierre_coherente;
alter table public.consultas_contacto add constraint consultas_contacto_cierre_coherente check (
     (estado = 'nueva' and atendida_en is null and atendida_por is null and descartada_en is null)
  or (estado = 'atendida' and atendida_en is not null and descartada_en is null)
  or (estado = 'descartada' and descartada_en is not null));

create index if not exists consultas_contacto_por_email on public.consultas_contacto (studio_id, lower(email))
  where socio_id is null and email is not null;
create index if not exists consultas_contacto_socio on public.consultas_contacto (socio_id) where socio_id is not null;

-- Cerrar sigue siendo del panel con su sesión (como hoy), y ahora también
-- descartar. Solo las que siguen abiertas: una vez cerrada, ni quién la atendió
-- ni cuándo se reescriben desde el panel (es su rastro, y de esa fecha cuelga la
-- purga). Las ya enlazadas a una ficha tampoco: esas las cerró el alta.
drop policy if exists consultas_contacto_atender on public.consultas_contacto;
drop policy if exists consultas_contacto_cerrar on public.consultas_contacto;
create policy consultas_contacto_cerrar on public.consultas_contacto
  for update to authenticated
  using (estado = 'nueva' and socio_id is null
         and studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()))
  with check (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas())
              and ((estado = 'atendida' and atendida_por = (select auth.uid()))
                or (estado = 'descartada' and descartada_por = (select auth.uid()))));
grant update (descartada_en, descartada_por) on table public.consultas_contacto to authenticated;

-- La hora de cerrarla la pone el servidor, no el reloj del navegador: la de
-- «atendida» ya lo hacía (migr 20260927022951); ahora también la de «descartada».
create or replace function public.consultas_contacto_sella_atendida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'atendida' and old.estado is distinct from 'atendida' then
    new.atendida_en := now();
  end if;
  if new.estado = 'descartada' and old.estado is distinct from 'descartada' then
    new.descartada_en := now();
  end if;
  return new;
end;
$$;

revoke all on function public.consultas_contacto_sella_atendida() from public, anon, authenticated;

-- Al darse de alta una socia, sus consultas abiertas (mismo email, mismo
-- estudio) se enlazan a su ficha y se dan por atendidas. Un fallo aquí NUNCA
-- bloquea el alta: se avisa y sigue.
create or replace function public.socios_vincula_consulta() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.email is null or new.email like 'borrado+%@anon.invalid' then
    return new;
  end if;
  begin
    update public.consultas_contacto c
       set socio_id = new.id,
           convertida_en = now(),
           estado = case when c.estado = 'nueva' then 'atendida' else c.estado end,
           atendida_en = case when c.estado = 'nueva' then now() else c.atendida_en end
     where c.studio_id = new.studio_id
       and c.socio_id is null
       and c.estado <> 'descartada'
       and c.email is not null
       and lower(c.email) = lower(new.email);
  exception when others then
    raise warning 'socios_vincula_consulta: %', sqlerrm;
  end;
  return new;
end
$$;

drop trigger if exists trg_socios_vincula_consulta on public.socios;
create trigger trg_socios_vincula_consulta
  after insert on public.socios
  for each row execute function public.socios_vincula_consulta();

revoke all on function public.socios_vincula_consulta() from public, anon, authenticated;

-- ⚠️ LEGAL: plazos pendientes de validar (mismo criterio que purgar_datos_caducados).
-- Atendidas y descartadas: 90 días. Cualquiera: 180 como tope (lo que promete el
-- formulario). SQL directo por pg_cron, sin HTTP ni Inngest.
select cron.unschedule('purgar-consultas-contacto')
where exists (select 1 from cron.job where jobname = 'purgar-consultas-contacto');
select cron.schedule(
  'purgar-consultas-contacto',
  '45 4 * * *',
  $$delete from public.consultas_contacto
     where (estado = 'atendida' and atendida_en < now() - interval '90 days')
        or (estado = 'descartada' and descartada_en < now() - interval '90 days')
        or creada_en < now() - interval '180 days'$$
);

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

do $$
begin
  if has_table_privilege('authenticated', 'public.consultas_contacto', 'INSERT')
     or has_column_privilege('authenticated', 'public.consultas_contacto', 'socio_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.consultas_contacto', 'canal', 'UPDATE')
     or has_column_privilege('authenticated', 'public.consultas_contacto', 'mensaje', 'UPDATE') then
    raise exception 'consultas_contacto: el cliente no da de alta, no enlaza ni reescribe consultas';
  end if;
  if not has_column_privilege('authenticated', 'public.consultas_contacto', 'descartada_por', 'UPDATE') then
    raise exception 'consultas_contacto: el panel no podría descartar';
  end if;
  if has_table_privilege('anon', 'public.bajas_clienta', 'SELECT')
     or has_table_privilege('authenticated', 'public.bajas_clienta', 'INSERT')
     or has_table_privilege('authenticated', 'public.bajas_clienta', 'UPDATE')
     or has_table_privilege('authenticated', 'public.bajas_clienta', 'DELETE')
     or not has_table_privilege('authenticated', 'public.bajas_clienta', 'SELECT') then
    raise exception 'bajas_clienta: permisos distintos de los previstos';
  end if;
  if has_function_privilege('anon', 'public.socios_vincula_consulta()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.socios_vincula_consulta()', 'EXECUTE') then
    raise exception 'socios_vincula_consulta ejecutable desde el cliente';
  end if;
  if not exists (select 1 from cron.job where jobname = 'purgar-consultas-contacto' and command like '%descartada_en%') then
    raise exception 'la purga de consultas no cubre las descartadas';
  end if;
end $$;
