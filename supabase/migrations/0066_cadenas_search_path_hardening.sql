-- Hardening: las 3 funciones nuevas de 0062 (propagar_plan_cadena,
-- heredar_plan_de_cadena, mis_estudios) se crearon sin `set search_path`,
-- disparando el advisor "search_path mutable". El resto de funciones
-- SECURITY DEFINER de este proyecto desde 0021 en adelante ya siguen esta
-- convención (ver 0025_fix_toggle_like_search_path.sql, 0027, 0031, 0037...);
-- esto solo alinea las 3 nuevas con el mismo patrón. (current_studio_id() y
-- current_rol() nunca han fijado su propio search_path desde 0000_base —
-- advertencia preexistente, sin relación con esta migración, ver comentario
-- de 0025.)

create or replace function public.propagar_plan_cadena() returns trigger
  language plpgsql security definer
  set search_path = public
  as $$
begin
  update public.studios
    set plan = new.plan, subscription_status = new.subscription_status, current_period_end = new.current_period_end
    where cadena_id = new.id;
  return new;
end;
$$;

create or replace function public.heredar_plan_de_cadena() returns trigger
  language plpgsql security definer
  set search_path = public
  as $$
begin
  if new.cadena_id is not null then
    select plan, subscription_status, current_period_end
      into new.plan, new.subscription_status, new.current_period_end
      from public.cadenas where id = new.cadena_id;
  end if;
  return new;
end;
$$;

create or replace function public.mis_estudios() returns table(id text, nombre text, slug text, ciudad text)
  language sql stable security definer
  set search_path = public
  as $$
  select s.id, s.nombre, s.slug, s.ciudad
  from public.studios s
  where s.owner_auth_user_id = auth.uid()
     or exists (select 1 from public.instructores i where i.studio_id = s.id and i.auth_user_id = auth.uid());
$$;
