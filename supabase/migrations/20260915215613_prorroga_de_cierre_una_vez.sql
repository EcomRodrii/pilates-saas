-- La prórroga de un cierre del centro se suma UNA vez por día cerrado.
--
-- Guardar un cierre (lib/cierres/aplicar-cierre.ts) alarga los bonos y las
-- recuperaciones de todas las alumnas con `ampliar_caducidades`. Hasta aquí esa
-- suma no dejaba rastro, así que se repetía:
--   · al reintentar el POST de un cierre que ya existía (el INSERT choca con
--     23505 y el código seguía adelante, a propósito, para terminar de cancelar
--     clases — y volvía a sumar los días);
--   · al quitar un cierre y volver a ponerlo: la fila de `cierres_estudio` se
--     borra, y con ella lo único que decía que ese rango ya se había prorrogado.
-- Alargar un bono dos veces es regalar producto vendido, a todas a la vez.
--
-- Restar los días al quitar un cierre NO es opción: `ampliar_caducidades` no
-- guarda a qué filas sumó, y entretanto un bono puede haberse gastado, renovado
-- o caducado; restarle días quitaría vigencia que la alumna ya da por suya.
--
-- Lo que se hace:
--  · `cierres_prorrogas`: el registro de lo prorrogado, una fila por cierre. SIN
--    clave foránea a `cierres_estudio` a propósito: tiene que sobrevivir a que se
--    quite el cierre, que es justo el caso que se olvidaba.
--  · `prorrogar_por_cierre`: en UNA transacción y con el estudio bloqueado,
--    cuenta los días del cierre que ningún cierre anterior había prorrogado
--    (quitado o no), suma solo esos y lo apunta. Mismo cierre otra vez → cero.
--    Un rango que se solapa con otro → solo los días nuevos. Uno aparte → todos.
--    Como prorrogar y apuntarlo van juntos, un intento cortado a medias no deja
--    ni la suma sin apuntar ni el apunte sin la suma.
--
-- Límite asumido: un bono comprado después de la primera prórroga no recibe los
-- días si el cierre se quita y se vuelve a poner. Es el precio de no sumar dos
-- veces a todas las demás.

create table if not exists public.cierres_prorrogas (
  cierre_id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  desde date not null,
  hasta date not null,
  -- Días que se sumaron por ESTE cierre (los que no cubría ya otro).
  dias integer not null check (dias >= 0),
  bonos_ampliados integer not null default 0,
  recuperaciones_ampliadas integer not null default 0,
  aplicada_en timestamptz not null default now(),
  constraint cierres_prorrogas_rango_valido check (hasta >= desde)
);

create index if not exists idx_cierres_prorrogas_rango
  on public.cierres_prorrogas (studio_id, desde, hasta);

comment on table public.cierres_prorrogas is
  'Días de cierre ya sumados a las caducidades. Sin FK a cierres_estudio: sobrevive a quitar el cierre para no volver a sumarlos. Solo servidor.';

-- Solo servidor: nadie del panel escribe ni lee aquí.
alter table public.cierres_prorrogas enable row level security;
revoke all on table public.cierres_prorrogas from anon;
revoke all on table public.cierres_prorrogas from authenticated;
grant all on table public.cierres_prorrogas to service_role;

create or replace function public.prorrogar_por_cierre(
  p_studio_id text,
  p_cierre_id text
)
returns table (
  dias_prorrogados integer,
  dias_ya_prorrogados integer,
  bonos_prorrogados integer,
  recuperaciones_prorrogadas integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_desde date;
  v_hasta date;
  v_total int;
  v_dias int;
  v_socios text[];
  v_bonos int := 0;
  v_recups int := 0;
begin
  -- Suma días a los bonos de TODO el estudio: nunca desde el navegador. El rol
  -- lo comprueba la ruta (/api/cierres) antes de llamar con service_role.
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Dos cierres guardados a la vez en el mismo estudio: sin esto los dos
  -- contarían los mismos días como libres y los sumarían dos veces.
  perform pg_advisory_xact_lock(hashtext('prorroga_cierre:' || p_studio_id));

  select c.desde, c.hasta into v_desde, v_hasta
    from public.cierres_estudio c
   where c.id = p_cierre_id and c.studio_id = p_studio_id;
  if not found then
    raise exception 'CIERRE_NO_ENCONTRADO';
  end if;

  v_total := (v_hasta - v_desde) + 1;

  -- Reintento del mismo cierre: ya está hecho.
  if exists (select 1 from public.cierres_prorrogas p where p.cierre_id = p_cierre_id) then
    return query select 0, v_total, 0, 0;
    return;
  end if;

  -- Días de este cierre que ningún cierre del estudio había prorrogado ya,
  -- esté puesto o se haya quitado.
  select count(*)::int into v_dias
    from generate_series(0, v_hasta - v_desde) as g(n)
   where not exists (
     select 1 from public.cierres_prorrogas p
      where p.studio_id = p_studio_id
        and v_desde + g.n between p.desde and p.hasta
   );

  -- Mismo tope que `ampliar_caducidades`; la ruta ya no llama por encima.
  if v_dias > 365 then
    raise exception 'DIAS_INVALIDOS';
  end if;

  if v_dias >= 1 then
    select array_agg(s.id) into v_socios
      from public.socios s
     where s.studio_id = p_studio_id and s.borrado_en is null;

    -- Alias en todo: las columnas de `returns table` son variables aquí dentro
    -- (el 42702 que ya documenta migr 20260731132000).
    select a.bonos_ampliados, a.recuperaciones_ampliadas into v_bonos, v_recups
      from public.ampliar_caducidades(p_studio_id, v_socios, v_dias) as a;
  end if;

  insert into public.cierres_prorrogas
    (cierre_id, studio_id, desde, hasta, dias, bonos_ampliados, recuperaciones_ampliadas)
  values
    (p_cierre_id, p_studio_id, v_desde, v_hasta, v_dias, coalesce(v_bonos, 0), coalesce(v_recups, 0));

  return query select v_dias, v_total - v_dias, coalesce(v_bonos, 0), coalesce(v_recups, 0);
end;
$function$;

comment on function public.prorrogar_por_cierre(text, text) is
  'Suma a bonos y recuperaciones los días de un cierre que no se hubieran sumado ya (por él o por otro cierre, quitado o no) y lo apunta en cierres_prorrogas, en una transacción. Solo servidor.';

-- Función NUEVA: nace con EXECUTE para PUBLIC y, por el pg_default_acl de este
-- proyecto, también directo para authenticated. Revocar PUBLIC no basta: los
-- tres pasos explícitos (ver tentare-os.md §Seguridad). Tras aplicarla,
-- comprobar has_function_privilege para anon, authenticated y service_role.
revoke execute on function public.prorrogar_por_cierre(text, text) from public;
revoke execute on function public.prorrogar_por_cierre(text, text) from anon;
revoke execute on function public.prorrogar_por_cierre(text, text) from authenticated;
grant execute on function public.prorrogar_por_cierre(text, text) to service_role;
