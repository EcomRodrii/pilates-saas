-- ─────────────────────────────────────────────────────────────────────────────
-- `anonimizar_socio`: supresión COMPLETA de una socia en UNA transacción.
--
-- Decisión de producto cerrada: se borra o anonimiza todo menos lo fiscal, que
-- se conserva seudonimizado por `socio_id`. Hasta ahora `app/api/socios/eliminar`
-- limpiaba 8 tablas y anonimizaba 17 columnas de `socios`, y se dejaba ~30
-- tablas con su nombre, su firma, sus notificaciones, logs, IBAN, créditos…
--
-- Fuente documental de la clasificación: `lib/socios/supresion-clasificacion.ts`
-- (el test `lib/socios/supresion-cobertura.test.ts` falla si una tabla con
-- columna que apunta a una socia no está clasificada, o si una BORRAR/ANONIMIZAR
-- no aparece aquí). Copia en la cabecera para quien lea solo el SQL:
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
--
-- No enlazables por socio_id y fuera de aquí a propósito: `ingresos_manuales.cliente`
-- (texto libre del estudio), `decision_snapshots` (se regenera en cada pasada),
-- `facturas.receptor_*` (fiscal). Terceros (Stripe, cuenta de acceso) → la ruta.
--
-- Idempotente: se puede volver a llamar sobre una socia ya suprimida. Lo hace
-- `restaurar_backup` al final, para que una copia antigua no la resucite.
--
-- ⚠️ Solo service_role: los tres pasos (REVOKE anon, REVOKE authenticated,
-- GRANT service_role) y `has_function_privilege` al final. `pg_default_acl` da
-- EXECUTE directo a anon/authenticated en toda SECURITY DEFINER nueva.
-- Devuelve jsonb, no `RETURNS TABLE`: sin columnas de salida que choquen con las
-- de las tablas (42702).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.anonimizar_socio(
  p_studio_id text,
  p_socio_id text,
  p_ejecutada_por uuid default null,
  p_origen text default 'panel'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- Tras la primera pasada la ficha ya no apunta a la cuenta; la supresión sí.
  if v_auth is null then
    select sp.auth_user_id into v_auth
      from public.supresiones sp
     where sp.studio_id = p_studio_id and sp.socio_id = p_socio_id;
  end if;

  -- Si su cuenta es TAMBIÉN staff de este estudio, nada de lo que va por cuenta
  -- (mensajes, likes, push, preferencias) se toca: sería del trabajo, no suyo.
  if v_auth is not null then
    v_es_staff := exists (select 1 from public.instructores i
                           where i.auth_user_id = v_auth and i.studio_id = p_studio_id)
               or exists (select 1 from public.studios st
                           where st.id = p_studio_id and st.owner_auth_user_id = v_auth);
  end if;

  -- ── 1. Salud y notas ───────────────────────────────────────────────────────
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

  -- ── 2. CRM, motor de decisiones y logs ─────────────────────────────────────
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

  -- ── 3. Mensajería y comunidad ──────────────────────────────────────────────
  -- Conversaciones que tratan SOLO de ella: fuera enteras (mensajes del staff
  -- incluidos, que también son datos sobre ella).
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

  -- ── 4. Gamificación ────────────────────────────────────────────────────────
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

  -- ── 5. Operativa ───────────────────────────────────────────────────────────
  delete from public.plazas_fijas t where t.studio_id = p_studio_id and t.socio_id = p_socio_id;
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

  -- Las suscripciones se quedan (los recibos las referencian) pero dejan de
  -- estar vivas. La de Stripe, si la hay, cae al borrar el cliente (ruta).
  update public.suscripciones su set estado = 'CANCELADA'
   where su.studio_id = p_studio_id and su.socio_id = p_socio_id and su.estado <> 'CANCELADA';

  -- ── 6. Dinero ──────────────────────────────────────────────────────────────
  -- Penalización sin recibo = no ha pasado dinero; borrarla además impide que el
  -- cron la cobre después. Con recibo es registro fiscal y se queda.
  delete from public.penalizaciones pe
   where pe.studio_id = p_studio_id and pe.socio_id = p_socio_id and pe.recibo_id is null;
  select count(*) into v_pen_conservadas
    from public.penalizaciones pe
   where pe.studio_id = p_studio_id and pe.socio_id = p_socio_id;

  -- Un cargo SEPA en vuelo puede devolverse durante semanas y el mandato es la
  -- prueba de la autorización: mientras exista, el mandato se retiene y se dice.
  v_mandato_retenido :=
        exists (select 1 from public.mandatos_sepa ms
                 where ms.studio_id = p_studio_id and ms.socio_id = p_socio_id)
    and exists (select 1 from public.recibos r
                 where r.studio_id = p_studio_id and r.socio_id = p_socio_id
                   and r.metodo_cobro = 'SEPA' and r.estado in ('PENDIENTE', 'EN_CURSO'));
  if not v_mandato_retenido then
    delete from public.mandatos_sepa ms where ms.studio_id = p_studio_id and ms.socio_id = p_socio_id;
  end if;

  -- ── 7. Huellas globales y de su cuenta ─────────────────────────────────────
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

  -- ── 8. La ficha ────────────────────────────────────────────────────────────
  -- Se quedan como PRUEBA solo fechas y origen: aceptacion_fecha/_origen y
  -- consentimiento_salud_fecha (con revocado_en puesto). La de marketing NO: en
  -- este repo `consentimiento_marketing_en` no nulo significa «consiente hoy»
  -- (la baja de marketing la pone a NULL, app/api/marketing/baja), y dejarla
  -- viva en una suprimida es dejarla dentro de cualquier sincronización.
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

  -- ── 9. Registro ────────────────────────────────────────────────────────────
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
$$;

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
