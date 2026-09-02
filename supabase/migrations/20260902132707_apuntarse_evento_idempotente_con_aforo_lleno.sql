-- F-24 (auditoría 20ª pasada, 1-sep-2026): `apuntarse_evento_comunidad`
-- devolvía `false` (aforo lleno → 409 en la API) incluso a una socia que YA
-- estaba apuntada, si el aforo se llenó DESPUÉS con otras — el `on conflict
-- (post_id, socio_id) do nothing` que hacía esto idempotente nunca se
-- ejecutaba porque el corte de aforo pasaba ANTES del INSERT. Un doble clic
-- o un reintento de red sobre un evento que se llenó mientras tanto convertía
-- "ya estás dentro" en "ya no cabes".
--
-- Verificado en vivo (execute_sql + ROLLBACK) antes de aplicar: misma
-- escena (aforo 1/1, socia ya inscrita) pasa de devolver `false` a `true`,
-- sin duplicar fila; una socia NUEVA sobre un evento lleno sigue devolviendo
-- `false` como antes.

create or replace function public.apuntarse_evento_comunidad(p_post_id text, p_socio_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_aforo integer;
  v_count integer;
begin
  select tipo, evento_aforo into v_tipo, v_aforo
    from public.posts_comunidad
    where id = p_post_id
    for update;

  if not found then
    raise exception 'POST_NO_ENCONTRADO';
  end if;
  if v_tipo <> 'EVENTO' then
    raise exception 'NO_ES_EVENTO';
  end if;

  -- Ya apuntada → éxito idempotente, sin importar el aforo actual.
  if exists (
    select 1 from public.post_evento_asistentes
    where post_id = p_post_id and socio_id = p_socio_id
  ) then
    return true;
  end if;

  if v_aforo is not null then
    select count(*) into v_count from public.post_evento_asistentes where post_id = p_post_id;
    if v_count >= v_aforo then
      return false; -- aforo lleno, sin insertar
    end if;
  end if;

  insert into public.post_evento_asistentes (post_id, socio_id)
    values (p_post_id, p_socio_id)
    on conflict (post_id, socio_id) do nothing;

  return true;
end;
$$;
