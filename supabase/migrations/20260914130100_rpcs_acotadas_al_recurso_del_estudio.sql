-- Tres RPCs que comprobaban el estudio de quien llama pero no el del RECURSO
-- sobre el que actúan. Se valida dentro de cada una que la suscripción, el
-- post o la instructora pertenecen a `p_studio_id` (que a su vez ya se
-- compara con `current_studio_id()` en las dos llamables desde el cliente).
--
-- Las tres conservan su firma, así que CREATE OR REPLACE mantiene los grants
-- que ya tenían: `congelar_suscripcion` y `toggle_like_post` para
-- authenticated + service_role, `confirmar_sustitucion` solo service_role.
-- Cuerpos copiados de producción; solo cambia el bloque marcado.

-- ── congelar_suscripcion ───────────────────────────────────────────────────
-- Sin la comprobación, el INSERT en `congelaciones` aceptaba cualquier
-- `suscripcion_id` (la FK solo mira que exista) y el índice único de
-- congelación abierta es global: una fila con otro `studio_id` hacía que la
-- congelación legítima saliera por el `unique_violation` sin pausar nada.
create or replace function public.congelar_suscripcion(p_id text, p_suscripcion_id text, p_studio_id text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- ↓ nuevo
  if not exists (
    select 1 from public.suscripciones s
    where s.id = p_suscripcion_id and s.studio_id = p_studio_id
  ) then
    raise exception 'SUSCRIPCION_NO_PERTENECE_AL_STUDIO';
  end if;
  -- ↑ nuevo

  begin
    insert into congelaciones (id, studio_id, suscripcion_id, desde, motivo)
      values (p_id, p_studio_id, p_suscripcion_id, current_date, p_motivo);
  exception when unique_violation then
    return;
  end;

  update suscripciones set estado = 'PAUSADA'
    where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'ACTIVA';
end;
$function$;

-- ── toggle_like_post ───────────────────────────────────────────────────────
-- Misma comprobación que ya hace `toggle_like_post_portal`, con el mismo
-- código de error. Columnas calificadas: `likes` es también una salida del
-- RETURNS TABLE.
create or replace function public.toggle_like_post(p_post_id text, p_studio_id text)
 returns table(liked boolean, likes integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  if p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- ↓ nuevo
  if not exists (
    select 1 from public.posts_comunidad p
    where p.id = p_post_id and p.studio_id = p_studio_id
  ) then
    raise exception 'POST_NOT_FOUND';
  end if;
  -- ↑ nuevo

  if exists (select 1 from public.post_likes l where l.post_id = p_post_id and l.user_id = v_uid) then
    delete from public.post_likes l where l.post_id = p_post_id and l.user_id = v_uid;
    liked := false;
  else
    insert into public.post_likes (post_id, user_id, studio_id)
      values (p_post_id, v_uid, p_studio_id)
      on conflict (post_id, user_id) do nothing;
    liked := true;
  end if;

  update public.posts_comunidad p
    set likes = (select count(*) from public.post_likes l where l.post_id = p_post_id)
    where p.id = p_post_id and p.studio_id = p_studio_id
    returning p.likes into likes;

  return next;
end;
$function$;

-- ── confirmar_sustitucion ──────────────────────────────────────────────────
-- Asigna `sesiones.instructor_id` con el id que le llega. La ruta del panel
-- ya lo comprueba antes (`candidataDelEstudio`); esto cubre también el enlace
-- público de aceptar y cualquier llamador futuro. Una instructora de varias
-- sedes tiene una ficha por sede (P2-14): se confirma la de ESTA sede.
create or replace function public.confirmar_sustitucion(p_sustitucion_id text, p_instructor_id text, p_studio_id text, p_aprobada_por uuid default null::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_sesion text;
BEGIN
  -- ↓ nuevo
  IF NOT EXISTS (
    SELECT 1 FROM public.instructores i
    WHERE i.id = p_instructor_id AND i.studio_id = p_studio_id AND coalesce(i.activo, true)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'candidata_no_valida');
  END IF;
  -- ↑ nuevo

  BEGIN
    UPDATE public.sustituciones
      SET estado = 'confirmada',
          sustituta_final_id = p_instructor_id,
          aprobada_por = p_aprobada_por,
          aprobada_at = now(),
          resuelto_en = now()
    WHERE id = p_sustitucion_id
      AND studio_id = p_studio_id
      AND estado IN ('buscando', 'pendiente_aprobacion', 'contactando', 'agotada')
    RETURNING sesion_id INTO v_sesion;

    IF v_sesion IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'ya_resuelta');
    END IF;

    UPDATE public.sesiones
      SET instructor_id = p_instructor_id
    WHERE id = v_sesion;

    RETURN jsonb_build_object('ok', true, 'sesion_id', v_sesion);
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto_horario');
  END;
END;
$function$;
