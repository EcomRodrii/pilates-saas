-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría 3-ago-2026, I-6: el favicon subido desde el editor de tema pisaba
-- INMEDIATAMENTE el path publicado (`favicon-<studioId>`), antes de pulsar
-- "Publicar" — a diferencia del resto del tema (`studio_theme.config_draft`
-- vs `config_published`, ver lib/theme-data.ts), el favicon no tenía borrador
-- de verdad: cambiar el archivo mientras se edita ya cambiaba lo que veían las
-- clientas en producción.
--
-- Se le da al favicon un path de BORRADOR propio (`favicon-borrador-<studioId>`),
-- distinto del publicado (`favicon-<studioId>`). El editor sube/borra contra el
-- de borrador; publicarTheme() (lib/theme-data.ts) copia borrador -> publicado
-- solo al pulsar "Publicar", igual que ya hace con el JSON del tema.
--
-- avatars_path_autorizado(name) necesita reconocer el nuevo prefijo: sin esto,
-- `favicon-borrador-%` caería en la rama genérica `favicon-%` existente, que
-- extrae el id desde el PRIMER guion (justo después de "favicon"), dando
-- v_id = 'borrador-<studioId>' en vez de '<studioId>' — el propio dueño del
-- estudio se vería rechazado al subir su borrador. Por eso la rama nueva va
-- ANTES de la genérica, no como alternativa dentro de ella.
--
-- Misma firma que la función existente (text -> boolean): un CREATE OR REPLACE
-- con la firma sin cambios NO resetea los grants ya endurecidos en
-- 20260731011803/20260731011858 (a diferencia del gotcha de firma NUEVA ya
-- documentado en otras RPCs de este repo) — se verifica igualmente abajo.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.avatars_path_autorizado(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_id text;
begin
  if p_name like 'favicon-borrador-%' then
    v_id := substring(p_name from length('favicon-borrador-') + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'logo-%' or p_name like 'favicon-%' or p_name like 'admin-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'instructor-%' then
    v_id := substring(p_name from length('instructor-') + 1);
    return exists (
      select 1 from public.instructores i
      where i.id = v_id
        and (i.studio_id = public.current_studio_id() or i.auth_user_id = auth.uid())
    );
  elsif p_name like 'clase-%' then
    v_id := substring(p_name from length('clase-') + 1);
    return exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = public.current_studio_id()
    );
  elsif p_name like 'banner-%' then
    v_id := substring(p_name from length('banner-') + 1);
    return exists (
      select 1 from public.contenido_portal_banners b
      where b.id = v_id and b.studio_id = public.current_studio_id()
    );
  else
    return exists (
      select 1 from public.socios so
      where so.id = p_name
        and (so.studio_id = public.current_studio_id() or so.auth_user_id = auth.uid())
    );
  end if;
end;
$function$;

comment on function public.avatars_path_autorizado(text) is
  'Valida que el path de storage.objects (bucket avatars) pertenezca al estudio activo de la sesión, o a la propia persona (instructora/socia). favicon-borrador-<id> es el path de BORRADOR del favicon (I-6); ver migración avatars_favicon_borrador_path.';
