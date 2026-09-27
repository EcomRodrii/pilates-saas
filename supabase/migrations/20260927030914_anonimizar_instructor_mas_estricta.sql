-- ════════════════════════════════════════════════════════════════════════════
-- anonimizar_instructor: casado por nombre más estricto y cuenta que ya es de otra ficha
-- ════════════════════════════════════════════════════════════════════════════
--
-- Revisión de la función de 20260927024813 (misma firma y mismos grants):
--   · Casar por NOMBRE (feed de actividad, avisos de otras personas, recomendaciones) reescribía
--     o borraba lo de OTRAS personas cuando la ficha tenía un nombre de una sola palabra
--     («Laura» dentro de «Laura Gómez»). Ahora solo se casa un nombre de al menos dos palabras,
--     y nunca si otra persona del equipo o una socia lleva ese nombre (igual o conteniéndolo).
--     Lo que no se reconoce con seguridad se queda, y la función lo dice en su resultado.
--   · Los límites de palabra pasan de `\m`/`\M` a lookaround: un nombre que termina en signo
--     («Ana M.») ahora casa, y un email ya no casa dentro de otro más largo (`ana@…` en `mariana@…`).
--   · Si la cuenta registrada es hoy de OTRA ficha de este estudio (la persona volvió con una
--     ficha nueva y la cuenta se conservó), repetir la llamada sobre la ficha vieja no toca lo de
--     esa cuenta.
--
create or replace function public.anonimizar_instructor(
  p_studio_id text,
  p_instructor_id text,
  p_ejecutada_por uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  c_nombre constant text := 'Persona eliminada';
  c_centinela constant uuid := '00000000-0000-0000-0000-000000000000';
  c_token_revocado constant text := 'revocado-por-purga';
  -- Los scopes del CHECK de instructor_enlaces_vigentes. Sin '.', nunca pasa por un
  -- token firmado: cualquier enlace de la persona deja de reconocerse.
  c_scopes_enlace constant text[] := array['disponibilidad', 'reportar_baja', 'invitacion'];
  -- Lo de la persona (por su id): filas que se BORRAN. Las ligadas a una ausencia caen
  -- por cascade, así que las excepciones van ANTES que las ausencias.
  c_borrar constant text[] := array[
    'instructor_bajas_seguimiento', 'bajas_instructora', 'instructora_disponibilidad_excepciones',
    'instructora_ausencias', 'instructora_disponibilidad', 'citas_disponibilidad',
    'instructor_dependency_snapshots', 'sustitucion_contactos', 'valoraciones'
  ];
  -- Su nombre en registros que se CONSERVAN: [tabla, columna de la cuenta, columna del nombre].
  c_nombres_por_cuenta constant text[][] := array[
    ['cajas', 'abierta_por', 'abierta_por_nombre'],
    ['cajas', 'cerrada_por', 'cerrada_por_nombre'],
    ['movimientos_caja', 'creado_por', 'creado_por_nombre'],
    ['movimientos_stock', 'creado_por', 'creado_por_nombre'],
    ['ventas_pos', 'vendido_por', 'vendido_por_nombre'],
    ['comunicaciones_socio', 'creado_por', 'creado_por_nombre'],
    ['lecturas_ficha_salud', 'leido_por_user_id', 'leido_por_nombre']
  ];
  -- Lo que creó o tocó con su cuenta en registros que se conservan: [tabla, columna, valor].
  -- Un centinela donde la columna es NOT NULL (`created_by`), NULL donde no.
  c_cuenta_a_centinela constant text[][] := array[
    ['instructor_work_sessions', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['instructor_work_sessions', 'edited_by', 'null'],
    ['work_session_audits', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas', 'edited_by', 'null'],
    ['clases_impartidas', 'revisada_por', 'null'],
    ['clases_impartidas_auditoria', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid']
  ];
  -- Filas de la CUENTA en este estudio que se borran: [tabla, columna de la cuenta].
  c_borrar_por_cuenta constant text[][] := array[
    ['oauth_tokens', 'auth_user_id'],
    ['oauth_codigos_autorizacion', 'auth_user_id'],
    ['oauth_consentimientos', 'otorgado_por'],
    ['sesion_activa', 'auth_user_id']
  ];
  -- Solo si NO es también socia de este estudio: son de su lado de clienta si lo es.
  c_borrar_por_cuenta_si_no_es_socia constant text[][] := array[
    ['notification_preference', 'user_id'],
    ['push_subscription', 'user_id']
  ];
  v_ficha record;
  v_uid uuid;
  v_nombre text;
  v_email text;
  v_es_socia boolean := false;
  v_ambiguo boolean := false;
  v_por_nombre boolean := false;
  v_motivo_nombre text;
  v_patron text;
  v_patron_email text;
  v_recos text[];
  v_tabla text;
  v_col text[];
  v_n bigint;
  v_borrado jsonb := '{}'::jsonb;
  v_vaciado jsonb := '{}'::jsonb;
  v_nombres jsonb := '{}'::jsonb;
  v_cuenta jsonb := '{}'::jsonb;
begin
  if not public.es_llamada_servicio() then
    raise exception 'anonimizar_instructor: solo el servidor' using errcode = '42501';
  end if;
  if p_studio_id is null or p_instructor_id is null then
    raise exception 'anonimizar_instructor: faltan estudio o persona' using errcode = '22023';
  end if;

  -- 1. Guardias. Los mensajes son CÓDIGOS estables: la ruta los traduce a una frase.
  select i.id, i.nombre, i.email, i.rol, i.activo, i.auth_user_id
    into v_ficha
    from public.instructores i
   where i.id = p_instructor_id and i.studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'PERSONA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  -- Tras una primera pasada la ficha ya no apunta a la cuenta: se recupera del registro,
  -- para que reaplicar (una copia restaurada) limpie también lo que dependía de ella.
  v_uid := coalesce(v_ficha.auth_user_id,
    (select se.auth_user_id from public.supresiones_equipo se
      where se.studio_id = p_studio_id and se.instructor_id = p_instructor_id));
  v_nombre := v_ficha.nombre;
  v_email := nullif(btrim(v_ficha.email), '');

  -- Si la cuenta que quedó registrada es hoy de OTRA ficha de este estudio (la persona volvió con una ficha nueva
  -- y la cuenta se conservó por otro vínculo), lo de esa cuenta ya no es de ESTA ficha: no se toca.
  if v_uid is not null and exists (select 1 from public.instructores i
                                    where i.studio_id = p_studio_id and i.auth_user_id = v_uid and i.id <> p_instructor_id) then
    v_uid := null;
  end if;

  -- Una misma cuenta puede ser persona del equipo Y socia del estudio: lo de su lado de socia se queda.
  v_es_socia := v_uid is not null and exists (select 1 from public.socios so
                                               where so.studio_id = p_studio_id and so.auth_user_id = v_uid
                                                 and so.borrado_en is null);
  -- Casar por NOMBRE (feed, avisos de otras personas, recomendaciones) solo es seguro con un nombre de al menos DOS palabras
  -- que nadie más del estudio lleve: ni otra persona del equipo ni una socia, iguales o CONTENIENDO ese nombre («Ana García»
  -- dentro de «Ana García Pérez»). Un nombre de una palabra («Laura») no se distingue de «Laura Gómez»: no se casa.
  -- Los límites de palabra son lookaround, no `\m`/`\M`: «Ana M.» acaba en un signo y `\M` nunca casaría.
  if v_nombre is distinct from c_nombre then
    if length(btrim(v_nombre)) >= 3 and coalesce(array_length(regexp_split_to_array(btrim(v_nombre), '\s+'), 1), 0) >= 2 then
      v_patron := '(?<![[:alnum:]_])' || regexp_replace(btrim(v_nombre), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '(?![[:alnum:]_])';
      v_ambiguo := exists (select 1 from public.instructores i
                            where i.studio_id = p_studio_id and i.id <> p_instructor_id and i.nombre ~* v_patron)
                   or exists (select 1 from public.socios so
                               where so.studio_id = p_studio_id and so.borrado_en is null
                                 and (so.nombre || ' ' || coalesce(so.apellidos, '')) ~* v_patron);
      v_por_nombre := not v_ambiguo;
      if v_ambiguo then v_motivo_nombre := 'AMBIGUO'; end if;
    else
      v_motivo_nombre := 'UNA_PALABRA';
    end if;
  end if;
  if v_email is not null then
    v_patron_email := '(?<![[:alnum:]._%+-])' || regexp_replace(v_email, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '(?![[:alnum:]_%+-])';
  end if;

  if v_ficha.activo is distinct from false then
    raise exception 'PERSONA_ACTIVA' using errcode = 'P0001';
  end if;
  if v_ficha.rol = 'PROPIETARIO'
     or (v_uid is not null and exists (select 1 from public.studios st
                                        where st.id = p_studio_id and st.owner_auth_user_id = v_uid)) then
    raise exception 'ES_PROPIETARIA' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sesiones s
              where s.studio_id = p_studio_id and s.instructor_id = p_instructor_id
                and s.inicio > now() and s.cancelada is not true)
     or exists (select 1 from public.citas c
                 where c.studio_id = p_studio_id and c.instructor_id = p_instructor_id
                   and c.inicio > now() and c.estado in ('PENDIENTE', 'CONFIRMADA')) then
    raise exception 'TIENE_CLASES_FUTURAS' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.liquidaciones_instructoras l
              where l.studio_id = p_studio_id and l.instructor_id = p_instructor_id
                and l.estado in ('BORRADOR', 'CONFIRMADA')) then
    raise exception 'TIENE_LIQUIDACION_SIN_PAGAR' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.instructor_work_sessions w
              where w.studio_id = p_studio_id and w.instructor_id = p_instructor_id
                and w.status in ('OPEN', 'PENDING_REVIEW')) then
    raise exception 'TIENE_JORNADA_ABIERTA' using errcode = 'P0001';
  end if;

  -- 2. BORRA lo de la persona.
  foreach v_tabla in array c_borrar loop
    execute format('delete from public.%I where studio_id = $1 and instructor_id = $2', v_tabla)
      using p_studio_id, p_instructor_id;
    get diagnostics v_n = row_count;
    v_borrado := v_borrado || jsonb_build_object(v_tabla, v_n);
  end loop;

  delete from public.mensajes_equipo where studio_id = p_studio_id and autor_instructor_id = p_instructor_id;
  get diagnostics v_n = row_count;
  v_borrado := v_borrado || jsonb_build_object('mensajes_equipo', v_n);

  -- 3. VACÍA el texto libre de lo que se conserva (la fila se queda; el texto, no).
  update public.sesiones set notas = null, incidencia_texto = null
   where studio_id = p_studio_id and instructor_id = p_instructor_id
     and (notas is not null or incidencia_texto is not null);
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('sesiones', v_n);

  update public.citas set notas = null
   where studio_id = p_studio_id and instructor_id = p_instructor_id and notas is not null;
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('citas', v_n);

  -- Donde participó, el motivo, el ranking (copia nombres) y las candidatas de Network.
  update public.sustituciones set motivo = null, ranking = '[]'::jsonb, candidatos_network = null
   where studio_id = p_studio_id
     and (instructor_original_id = p_instructor_id or sustituta_final_id = p_instructor_id)
     and (motivo is not null or ranking is distinct from '[]'::jsonb or candidatos_network is not null);
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('sustituciones', v_n);

  -- En las demás solo aparece como una candidata más: se le cambia el NOMBRE, sin quitar el elemento
  -- (`candidata_actual` es un índice del ranking: quitarlo movería la oferta a otra persona).
  update public.sustituciones s
     set ranking = (select coalesce(jsonb_agg(
                              case when t.e ->> 'instructor_id' = p_instructor_id and t.e ? 'nombre'
                                   then t.e || jsonb_build_object('nombre', c_nombre) else t.e end
                              order by t.ord), '[]'::jsonb)
                      from jsonb_array_elements(s.ranking) with ordinality as t(e, ord))
   where s.studio_id = p_studio_id
     and jsonb_typeof(s.ranking) = 'array'
     and position('"' || p_instructor_id || '"' in s.ranking::text) > 0;
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('sustituciones.ranking_de_otras', v_n);

  -- La preferencia de la socia se queda; solo deja de señalar a esta persona.
  update public.preferencias_socio set instructor_favorito_id = null
   where studio_id = p_studio_id and instructor_favorito_id = p_instructor_id;
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('preferencias_socio.instructor_favorito_id', v_n);

  -- Motivo libre de las correcciones de SUS jornadas y de SUS clases.
  update public.work_session_audits set reason = null
   where studio_id = p_studio_id and reason is not null
     and work_session_id in (select w.id from public.instructor_work_sessions w
                              where w.studio_id = p_studio_id and w.instructor_id = p_instructor_id);
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('work_session_audits.reason', v_n);

  update public.clases_impartidas_auditoria set motivo = null
   where studio_id = p_studio_id and motivo is not null
     and sesion_id in (select ci.sesion_id from public.clases_impartidas ci
                        where ci.studio_id = p_studio_id and ci.instructor_id = p_instructor_id);
  get diagnostics v_n = row_count;
  v_vaciado := v_vaciado || jsonb_build_object('clases_impartidas_auditoria.motivo', v_n);

  -- 4. Por su nombre y por su cuenta.
  -- El feed no guarda cuenta ni id, solo el nombre (en `actor_nombre` Y dentro del `texto`: «X eliminó a Y del
  -- equipo»): se casa por él, dentro del estudio y solo si es seguro (ver `v_por_nombre`).
  if v_por_nombre then
    update public.actividad_reciente
       set texto = regexp_replace(texto, v_patron, c_nombre, 'gi'),
           actor_nombre = case when actor_nombre = v_nombre then c_nombre else actor_nombre end
     where studio_id = p_studio_id and (actor_nombre = v_nombre or texto ~* v_patron);
    get diagnostics v_n = row_count;
    v_nombres := v_nombres || jsonb_build_object('actividad_reciente', v_n);
  end if;
  if v_email is not null then
    update public.actividad_reciente set texto = regexp_replace(texto, v_patron_email, '[email eliminado]', 'gi')
     where studio_id = p_studio_id and texto ~* v_patron_email;
    get diagnostics v_n = row_count;
    v_nombres := v_nombres || jsonb_build_object('actividad_reciente.email', v_n);
  end if;

  -- Comunidad: el autor es el id de la ficha O el uid de la cuenta (`autor_id` guarda uno u otro). Si es también
  -- socia, sus publicaciones por cuenta pueden ser de socia: solo se tocan las que llevan el id de la ficha.
  update public.posts_comunidad set autor_nombre = c_nombre, autor_inicial = 'P'
   where studio_id = p_studio_id and autor_nombre is distinct from c_nombre
     and (autor_id = p_instructor_id or (v_uid is not null and not v_es_socia and autor_id = v_uid::text));
  get diagnostics v_n = row_count;
  v_nombres := v_nombres || jsonb_build_object('posts_comunidad', v_n);

  update public.comentarios_comunidad set autor_nombre = c_nombre, autor_inicial = 'P'
   where studio_id = p_studio_id and autor_nombre is distinct from c_nombre
     and (autor_id = p_instructor_id or (v_uid is not null and not v_es_socia and autor_id = v_uid::text));
  get diagnostics v_n = row_count;
  v_nombres := v_nombres || jsonb_build_object('comentarios_comunidad', v_n);

  -- Avisos de OTRAS personas que la citan (una baja, una sustitución, un mensaje del día): por su id o, si es
  -- seguro, por su nombre. Son avisos de la campana, no un registro que haya que conservar.
  delete from public.notification
   where studio_id = p_studio_id
     and (recipient_instructor_id = p_instructor_id
          or resource_id = p_instructor_id
          or position('"' || p_instructor_id || '"' in data::text) > 0
          or (v_por_nombre and (title ~* v_patron or body ~* v_patron)));
  get diagnostics v_n = row_count;
  v_cuenta := v_cuenta || jsonb_build_object('notification.por_persona', v_n);

  -- Recomendaciones del motor de decisiones con su nombre (p. ej. carga del equipo). Como con una socia: el
  -- mensaje del día que apuntaba a una de ellas pierde su motivo (la fila se queda: garantiza un mensaje al día).
  select coalesce(array_agg(r.id), '{}') into v_recos
    from public.recomendaciones r
   where r.studio_id = p_studio_id
     and (position('"' || p_instructor_id || '"' in r.datos_usados::text) > 0
          or (v_por_nombre and (r.titulo ~* v_patron or r.motivo ~* v_patron or r.datos_usados::text ~* v_patron)));
  update public.decision_mensajes_dia dm set motivo_motor = null
   where dm.studio_id = p_studio_id and dm.recomendacion_id = any(v_recos) and dm.motivo_motor is not null;
  delete from public.recomendaciones r where r.studio_id = p_studio_id and r.id = any(v_recos);
  get diagnostics v_n = row_count;
  v_borrado := v_borrado || jsonb_build_object('recomendaciones', v_n);

  -- La caché del motor lleva nombres y emails del equipo; se regenera sola en el siguiente ciclo.
  delete from public.decision_snapshots where studio_id = p_studio_id;
  get diagnostics v_n = row_count;
  v_borrado := v_borrado || jsonb_build_object('decision_snapshots', v_n);

  if v_uid is not null then
    foreach v_col slice 1 in array c_nombres_por_cuenta loop
      execute format('update public.%I set %I = $3 where studio_id = $1 and %I = $2 and %I is distinct from $3',
                     v_col[1], v_col[3], v_col[2], v_col[3]) using p_studio_id, v_uid, c_nombre;
      get diagnostics v_n = row_count;
      v_nombres := v_nombres || jsonb_build_object(v_col[1] || '.' || v_col[3], v_n);
    end loop;

    -- La autoría de lo que ELLA creó o tocó en registros que se conservan (el motivo libre de
    -- las correcciones de sus propias jornadas y clases ya se vació arriba, por su id).
    foreach v_col slice 1 in array c_cuenta_a_centinela loop
      execute format('update public.%I set %I = %s where studio_id = $1 and %I = $2',
                     v_col[1], v_col[2], v_col[3], v_col[2]) using p_studio_id, v_uid;
      get diagnostics v_n = row_count;
      v_vaciado := v_vaciado || jsonb_build_object(v_col[1] || '.' || v_col[2], v_n);
    end loop;

    foreach v_col slice 1 in array c_borrar_por_cuenta loop
      execute format('delete from public.%I where studio_id = $1 and %I = $2', v_col[1], v_col[2])
        using p_studio_id, v_uid;
      get diagnostics v_n = row_count;
      v_cuenta := v_cuenta || jsonb_build_object(v_col[1], v_n);
    end loop;

    if not v_es_socia then
      foreach v_col slice 1 in array c_borrar_por_cuenta_si_no_es_socia loop
        execute format('delete from public.%I where studio_id = $1 and %I = $2', v_col[1], v_col[2])
          using p_studio_id, v_uid;
        get diagnostics v_n = row_count;
        v_cuenta := v_cuenta || jsonb_build_object(v_col[1], v_n);
      end loop;
      -- Sus «me gusta» en la comunidad son de su cuenta, no de su ficha de equipo.
      delete from public.post_likes where studio_id = p_studio_id and user_id = v_uid;
      get diagnostics v_n = row_count;
      v_cuenta := v_cuenta || jsonb_build_object('post_likes', v_n);
    end if;

    -- Los avisos de su cuenta; si es también socia, los de su lado de socia (recipient_role SOCIA) se quedan.
    delete from public.notification
     where studio_id = p_studio_id and recipient_user_id = v_uid
       and (not v_es_socia or recipient_role <> 'SOCIA');
    get diagnostics v_n = row_count;
    v_cuenta := v_cuenta || jsonb_build_object('notification.por_cuenta', v_n);

    -- Solo su lado de EQUIPO de las conversaciones (el de socia, si lo tiene, es de la clienta).
    delete from public.conversacion_participantes cp
     where cp.auth_user_id = v_uid and cp.rol_en_conversacion = 'STAFF'
       and cp.conversacion_id in (select c.id from public.conversaciones c where c.studio_id = p_studio_id);
    get diagnostics v_n = row_count;
    v_cuenta := v_cuenta || jsonb_build_object('conversacion_participantes', v_n);
  end if;

  -- 5. La ficha, sin ningún dato personal; sus enlaces firmados, revocados; y constancia.
  update public.instructores
     set nombre = c_nombre, email = null, telefono = null, auth_user_id = null,
         foto_url = null, avatar = null, bio = null, activo = false
   where id = p_instructor_id and studio_id = p_studio_id;

  insert into public.instructor_enlaces_vigentes (instructor_id, studio_id, scope, token)
  select p_instructor_id, p_studio_id, s.scope, c_token_revocado
    from unnest(c_scopes_enlace) as s(scope)
  on conflict (instructor_id, scope) do update
     set token = excluded.token, email_enviado_en = null, actualizado_en = now();

  insert into public.supresiones_equipo (studio_id, instructor_id, auth_user_id, ejecutada_por)
  values (p_studio_id, p_instructor_id, v_uid, p_ejecutada_por)
  on conflict (studio_id, instructor_id) do update
     set reaplicada_en = now(),
         auth_user_id = coalesce(public.supresiones_equipo.auth_user_id, excluded.auth_user_id);

  return jsonb_build_object(
    'auth_user_id', v_uid,
    'es_socia_del_estudio', v_es_socia,
    'nombre_sin_reconocer', v_motivo_nombre is not null,
    'motivo_nombre_sin_reconocer', v_motivo_nombre,
    'borrado', v_borrado,
    'vaciado', v_vaciado,
    'nombres', v_nombres,
    'cuenta', v_cuenta
  );
end;
$function$;

comment on function public.anonimizar_instructor(text, text, uuid) is
  'Supresión (art. 17) de una persona del equipo: anonimiza su ficha, borra lo suyo y vacía el texto libre de lo que se conserva. La cuenta de acceso la borra el servidor después. Solo service_role.';

revoke all on function public.anonimizar_instructor(text, text, uuid) from public;
revoke all on function public.anonimizar_instructor(text, text, uuid) from anon;
revoke all on function public.anonimizar_instructor(text, text, uuid) from authenticated;
grant execute on function public.anonimizar_instructor(text, text, uuid) to service_role;

-- ── Comprobación al aplicar (no fiarse del comentario SQL) ─────────────────
do $$
declare
  v_rol text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_rol, 'public.anonimizar_instructor(text, text, uuid)', 'EXECUTE') then
      raise exception '% puede ejecutar anonimizar_instructor', v_rol;
    end if;
    if has_table_privilege(v_rol, 'public.supresiones_equipo', 'SELECT')
       or has_table_privilege(v_rol, 'public.supresiones_equipo', 'INSERT')
       or has_table_privilege(v_rol, 'public.supresiones_equipo', 'UPDATE')
       or has_table_privilege(v_rol, 'public.supresiones_equipo', 'DELETE') then
      raise exception '% puede tocar supresiones_equipo', v_rol;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.anonimizar_instructor(text, text, uuid)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar anonimizar_instructor';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'supresiones_equipo' and c.relrowsecurity) then
    raise exception 'supresiones_equipo no tiene RLS';
  end if;
end;
$$;
