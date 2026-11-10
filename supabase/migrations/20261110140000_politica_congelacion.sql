-- ─────────────────────────────────────────────────────────────────────────────
-- Política de congelación del estudio: si se pueden congelar cuotas y bonos, y cuántos días como máximo alargan su fin.
--
-- Hasta hoy congelar era libre y sin tope: cada día congelado empujaba la fecha de fin de la cuota o el bono, y una
-- congelación olvidada alargaba el plan indefinidamente. Ahora la propietaria decide dos cosas:
--   · `congelacion_permitida` (de serie SÍ, como hasta ahora): con NO, no se puede congelar una suscripción nueva.
--     Las que ya están congeladas se pueden reanudar con normalidad.
--   · `congelacion_max_dias` (de serie sin tope, como hasta ahora): lo máximo que una congelación alarga la fecha de fin.
--     Los días de más siguen contando como congelados en el historial pero NO se suman al plan.
--
-- Decisiones:
--   · Las dos reglas viven aquí, en las funciones que congelan y reanudan (SECURITY DEFINER, ya acotadas al estudio y al
--     permiso de mover dinero), y no en la pantalla: la UI solo explica lo que la base de datos ya hace cumplir.
--   · Una llamada del servidor (`es_llamada_servicio()`) no se frena por «no permitida»: son los procesos del sistema.
--   · Mismas firmas que antes: `CREATE OR REPLACE` conserva sus permisos; se reafirman igualmente (gotcha ya pisado).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios add column if not exists congelacion_permitida boolean not null default true;
alter table public.studios add column if not exists congelacion_max_dias integer;

alter table public.studios drop constraint if exists studios_congelacion_max_dias_check;
alter table public.studios add constraint studios_congelacion_max_dias_check
  check (congelacion_max_dias is null or congelacion_max_dias between 1 and 365);

comment on column public.studios.congelacion_permitida is
  'false = no se pueden congelar suscripciones nuevas (las ya congeladas se reanudan con normalidad).';
comment on column public.studios.congelacion_max_dias is
  'NULL = sin tope. Con valor: lo máximo que una congelación alarga la fecha de fin de la cuota o el bono.';

create or replace function public.congelar_suscripcion(p_id text, p_suscripcion_id text, p_studio_id text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from public.suscripciones s
    where s.id = p_suscripcion_id and s.studio_id = p_studio_id
  ) then
    raise exception 'SUSCRIPCION_NO_PERTENECE_AL_STUDIO';
  end if;

  -- ↓ nuevo: la política del estudio. Los procesos del servidor no se frenan.
  if not public.es_llamada_servicio() and exists (
    select 1 from public.studios st where st.id = p_studio_id and st.congelacion_permitida is false
  ) then
    raise exception 'CONGELACION_NO_PERMITIDA';
  end if;
  -- ↑ nuevo

  begin
    insert into congelaciones (id, studio_id, suscripcion_id, desde, motivo)
      values (p_id, p_studio_id, p_suscripcion_id, public.hoy_estudio(), p_motivo);
  exception when unique_violation then
    return;
  end;

  update suscripciones set estado = 'PAUSADA'
    where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'ACTIVA';
end;
$function$;

create or replace function public.descongelar_suscripcion(p_suscripcion_id text, p_studio_id text)
 returns date
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_dias int;
  v_fin  date;
  v_tope int;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- ↓ nuevo: lo máximo que esta congelación alarga el plan (NULL = sin tope, como siempre).
  select st.congelacion_max_dias into v_tope from public.studios st where st.id = p_studio_id;

  update congelaciones
     set hasta = public.hoy_estudio(),
         dias_aplicados = least(public.hoy_estudio() - desde, coalesce(v_tope, public.hoy_estudio() - desde))
   where suscripcion_id = p_suscripcion_id and studio_id = p_studio_id and hasta is null
   returning dias_aplicados into v_dias;
  -- ↑ nuevo

  update suscripciones
     set estado = 'ACTIVA',
         fecha_fin = case when fecha_fin is not null and v_dias is not null
                          then fecha_fin + v_dias else fecha_fin end
   where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'PAUSADA'
   returning fecha_fin into v_fin;

  if not found then
    select fecha_fin into v_fin from suscripciones where id = p_suscripcion_id and studio_id = p_studio_id;
  end if;

  return v_fin;
end;
$function$;

revoke all on function public.congelar_suscripcion(text, text, text, text) from public, anon;
grant execute on function public.congelar_suscripcion(text, text, text, text) to authenticated, service_role;
revoke all on function public.descongelar_suscripcion(text, text) from public, anon;
grant execute on function public.descongelar_suscripcion(text, text) to authenticated, service_role;
