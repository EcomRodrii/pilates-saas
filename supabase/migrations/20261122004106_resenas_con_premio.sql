-- ═══════════════════════════════════════════════════════════════════════════
-- Reseñas con premio (21-nov-2026, decisión del fundador).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El estudio puede (1) poner el enlace de su página de reseñas (Google u otra)
-- y (2) regalar un código de descuento a la alumna que VALORA una clase en
-- Tentare.
--
-- ⚠️ El premio es por la valoración INTERNA (la que ya existe en `valoraciones`,
-- solo de quien asistió), NUNCA por la reseña externa:
--   · no se puede saber si alguien dejó una reseña en Google (solo si pinchó el
--     enlace), así que sería un premio por un clic;
--   · Google prohíbe incentivar reseñas y filtrar a quién se le pide, y la
--     normativa de consumo exige declarar las reseñas incentivadas.
-- Por eso el premio NO mira la nota (se da igual con un 1 que con un 5) y el
-- enlace se enseña sin mencionar el premio y sin mirar la nota (más abajo, quién
-- lo recibe lo decide la asistencia). Mismo criterio que `review_boost`
-- (20260821120000), que ya separa la recompensa de la reseña.
--
-- El premio es una fila de `codigos_descuento` (los canjean la Caja y los
-- checkouts), con id determinista por (estudio, alumna): UNA por alumna y
-- estudio, sin tabla propia para el premio (ni RLS, ni clasificación RGPD
-- aparte). El id es un hash: no lleva el id de la alumna en claro. Lo que sí
-- tiene tabla es el recuento de clics (`resenas_clics`, más abajo).

-- ── Ajustes del estudio ─────────────────────────────────────────────────────
alter table public.studios add column if not exists resena_enlace text;
alter table public.studios add column if not exists resena_premio_tipo text;
alter table public.studios add column if not exists resena_premio_valor numeric;
alter table public.studios add column if not exists resena_premio_dias integer not null default 30;

-- La cerradura es la base de datos: el enlace se pinta como `href` en la app de
-- la alumna, y un `javascript:` ahí sería un XSS; el importe lo escribe quien
-- gestiona el estudio y no debe poder regalar el 100 % por accidente.
alter table public.studios add constraint studios_resena_enlace_https
  check (resena_enlace is null or (resena_enlace ~ '^https://[^[:space:]]+$' and length(resena_enlace) <= 500));
-- ⚠️ `coalesce(…, false)`: un CHECK que da NULL se da por VÁLIDO, y con tipo sin
-- valor (o valor sin tipo) las ramas de abajo dan NULL, no false.
alter table public.studios add constraint studios_resena_premio_valido check (coalesce(
  (resena_premio_tipo is null and resena_premio_valor is null)
  or (resena_premio_tipo = 'PORCENTAJE' and resena_premio_valor between 1 and 50)
  or (resena_premio_tipo = 'IMPORTE_FIJO' and resena_premio_valor between 1 and 200),
  false));
alter table public.studios add constraint studios_resena_premio_dias_rango
  check (resena_premio_dias between 7 and 365);

comment on column public.studios.resena_enlace is
  'Enlace https de la página de reseñas del estudio (Google u otra). Se enseña a cada clienta una vez (tras 3 clases asistidas, cada 180 días como mucho) justo después de valorar: lo decide la asistencia, nunca la nota, y no menciona el premio.';
comment on column public.studios.resena_premio_tipo is
  'PORCENTAJE (1-50) o IMPORTE_FIJO (1-200 €) del código que se regala por valorar una clase en Tentare. NULL = sin premio.';

-- ── El premio ───────────────────────────────────────────────────────────────
-- Idempotente y atómica: un candado por (estudio, alumna) y el id determinista
-- hacen que reintentar, abrir el enlace dos veces o valorar desde la app y desde
-- el correo devuelvan SIEMPRE el mismo código. `p_crear = false` solo lo LEE
-- (la página del enlace del correo no crea nada al pintarse).
--
-- Devuelve jsonb (no RETURNS TABLE: sus columnas son variables del cuerpo y
-- chocan con las de las tablas, 42702) o NULL si no hay premio.
create or replace function public.otorgar_premio_resena(p_studio_id text, p_socio_id text, p_crear boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text := 'cod-res-' || substr(md5(p_studio_id || ':' || p_socio_id), 1, 20);
  v_cod public.codigos_descuento%rowtype;
  v_tipo text;
  v_valor numeric;
  v_dias integer;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_intentos integer := 0;
  v_nuevo boolean := false;
  v_hoy date := public.hoy_estudio();
begin
  select * into v_cod from public.codigos_descuento where id = v_id and studio_id = p_studio_id;

  if not found then
    if not p_crear then return null; end if;

    select s.resena_premio_tipo, s.resena_premio_valor, s.resena_premio_dias
      into v_tipo, v_valor, v_dias
      from public.studios s where s.id = p_studio_id;
    if v_tipo is null or v_valor is null then return null; end if;

    -- Una alumna de ESTE estudio, no dada de baja, que ya ha valorado una clase
    -- (la valoración solo se guarda tras asistir: lo decide el servidor al guardarla).
    if not exists (select 1 from public.socios so where so.id = p_socio_id and so.studio_id = p_studio_id and so.borrado_en is null) then
      return null;
    end if;
    if not exists (select 1 from public.valoraciones v where v.studio_id = p_studio_id and v.socio_id = p_socio_id) then
      return null;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_id, 0));
    select * into v_cod from public.codigos_descuento where id = v_id and studio_id = p_studio_id;

    if not found then
      loop
        v_codigo := 'GRACIAS-';
        for i in 1..6 loop
          v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::integer, 1);
        end loop;
        begin
          insert into public.codigos_descuento (id, studio_id, codigo, descripcion, tipo, valor, usos, usos_max, expira, activo, solo_nuevas)
          values (v_id, p_studio_id, v_codigo, 'Premio por valorar una clase', v_tipo, v_valor, 0, 1, v_hoy + v_dias, true, false)
          returning * into v_cod;
          v_nuevo := true;
          exit;
        exception when unique_violation then
          v_intentos := v_intentos + 1;
          if v_intentos >= 5 then return null; end if;
        end;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'codigo', v_cod.codigo,
    'tipo', v_cod.tipo,
    'valor', v_cod.valor,
    'expira', v_cod.expira,
    'vigente', coalesce(v_cod.activo, false)
               and (v_cod.expira is null or v_cod.expira >= v_hoy)
               and coalesce(v_cod.usos, 0) < coalesce(v_cod.usos_max, 2147483647),
    'canjeado', coalesce(v_cod.usos, 0) >= coalesce(v_cod.usos_max, 2147483647),
    'nuevo', v_nuevo
  );
end;
$$;

-- Solo el servidor (las rutas de valoración). `REVOKE ... FROM PUBLIC` no basta:
-- el default ACL del proyecto da EXECUTE directo a anon/authenticated.
revoke all on function public.otorgar_premio_resena(text, text, boolean) from public;
revoke all on function public.otorgar_premio_resena(text, text, boolean) from anon;
revoke all on function public.otorgar_premio_resena(text, text, boolean) from authenticated;
grant execute on function public.otorgar_premio_resena(text, text, boolean) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.otorgar_premio_resena(text, text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.otorgar_premio_resena(text, text, boolean)', 'EXECUTE') then
    raise exception 'otorgar_premio_resena es solo del servidor';
  end if;
  if not has_function_privilege('service_role', 'public.otorgar_premio_resena(text, text, boolean)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar otorgar_premio_resena';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pedir la reseña pública: cuándo, a quién y cómo se mide.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cómo lo hacen los grandes (Mindbody, Podium, Birdeye…): se pide JUSTO tras la
-- clase, en un solo toque y con el enlace directo, no 12 horas después por email.
-- Y se mide: sin saber cuántas piden, cuántas valoran y cuántas pinchan, no se
-- puede mejorar nada.
--
-- Lo que NO se hace, porque Google lo prohíbe en su política de reseñas: ofrecer
-- nada a cambio de una reseña, ni pedirlas solo a quien está contento. Por eso
-- quién recibe el enlace lo decide la ASISTENCIA (haber ido a 3 clases), nunca la
-- nota: `reclamar_pedido_resena` ni la recibe.

-- ── Una vez por clienta ─────────────────────────────────────────────────────
alter table public.socios add column if not exists resena_pedida_en timestamptz;
comment on column public.socios.resena_pedida_en is
  'Cuándo se le enseñó por última vez el enlace de reseñas del estudio. A lo sumo una vez cada 180 días (reclamar_pedido_resena).';

-- ── Clics en el enlace (sin datos personales: solo cuántos, por día y origen) ─
create table if not exists public.resenas_clics (
  studio_id text not null references public.studios(id) on delete cascade,
  dia date not null,
  origen text not null check (origen in ('app', 'qr')),
  n integer not null default 0 check (n >= 0),
  primary key (studio_id, dia, origen)
);
alter table public.resenas_clics enable row level security;
revoke all on public.resenas_clics from anon, authenticated;
grant select, insert, update on public.resenas_clics to service_role;

-- Toda tabla con RLS lleva la política restrictiva del segundo paso (ver
-- 20261003102845): supabase/tests/rls-doble-factor.test.ts falla sin ella.
create policy exige_doble_factor on public.resenas_clics as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── ¿Toca enseñarle el enlace a esta clienta? ───────────────────────────────
-- Atómica: marca y decide en el mismo UPDATE, así que dos valoraciones a la vez
-- (app y correo) no se lo piden dos veces. Devuelve el slug del estudio (con el
-- que se arma el enlace con seguimiento) o NULL. Condiciones, TODAS de asistencia
-- y de calendario, NINGUNA de la nota:
--   · el estudio tiene enlace de reseñas;
--   · es clienta de ese estudio y no está dada de baja;
--   · ha ASISTIDO a 3 clases o más (es el momento en que ya conoce el estudio);
--   · no se le ha enseñado en los últimos 180 días.
create or replace function public.reclamar_pedido_resena(p_studio_id text, p_socio_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
begin
  select s.slug into v_slug from public.studios s where s.id = p_studio_id and s.resena_enlace is not null;
  if v_slug is null then return null; end if;

  update public.socios so
     set resena_pedida_en = now()
   where so.id = p_socio_id and so.studio_id = p_studio_id and so.borrado_en is null
     and (so.resena_pedida_en is null or so.resena_pedida_en < now() - interval '180 days')
     and (select count(*) from public.reservas r
           where r.studio_id = p_studio_id and r.socio_id = p_socio_id and r.estado = 'ASISTIDA') >= 3;
  if not found then return null; end if;
  return v_slug;
end;
$$;

-- ── Un clic: se cuenta y se devuelve el enlace al que ir ────────────────────
-- Solo redirige al enlace que el propio estudio guardó (con CHECK de https): la
-- ruta pública nunca recibe un destino por parámetro (sería una redirección abierta).
create or replace function public.registrar_clic_resena(p_slug text, p_origen text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  v_enlace text;
  v_origen text := case when p_origen = 'app' then 'app' else 'qr' end;
begin
  select s.id, s.resena_enlace into v_id, v_enlace from public.studios s where s.slug = p_slug;
  if v_id is null or v_enlace is null then return null; end if;
  insert into public.resenas_clics (studio_id, dia, origen, n)
  values (v_id, public.hoy_estudio(), v_origen, 1)
  on conflict (studio_id, dia, origen) do update set n = public.resenas_clics.n + 1;
  return v_enlace;
end;
$$;

revoke all on function public.reclamar_pedido_resena(text, text) from public;
revoke all on function public.reclamar_pedido_resena(text, text) from anon;
revoke all on function public.reclamar_pedido_resena(text, text) from authenticated;
grant execute on function public.reclamar_pedido_resena(text, text) to service_role;
revoke all on function public.registrar_clic_resena(text, text) from public;
revoke all on function public.registrar_clic_resena(text, text) from anon;
revoke all on function public.registrar_clic_resena(text, text) from authenticated;
grant execute on function public.registrar_clic_resena(text, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.reclamar_pedido_resena(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reclamar_pedido_resena(text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.registrar_clic_resena(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.registrar_clic_resena(text, text)', 'EXECUTE') then
    raise exception 'las funciones de reseñas son solo del servidor';
  end if;
end $$;

-- ── Pedir la valoración justo tras la clase ─────────────────────────────────
-- Antes la pedía un barrido de Inngest cada 12 h: el aviso llegaba entre 0 y 12
-- horas tarde. Ahora, pg_cron cada 10 min, y solo llama a Vercel si hay una clase
-- terminada hace más de 20 min, con alguien que asistió y sin pedir (mismo patrón
-- que 20261005221020: sin trabajo, no se llama a nadie). El aviso sale unos 20-30
-- min después de la clase. El barrido de Inngest sigue como red de seguridad: el
-- compare-and-set de `sesiones.valoracion_pedida_en` evita duplicados.
--
-- ⚠️ El predicado es IGUAL o MÁS AMPLIO que la consulta de la ruta
-- (lib/valoraciones/momento.ts: 20 min y 48 h). Si cambia aquí, cambia allí.
select cron.unschedule('valoraciones-pedir')
 where exists (select 1 from cron.job where jobname = 'valoraciones-pedir');
select cron.schedule(
  'valoraciones-pedir',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/valoraciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.sesiones s
    where s.cancelada = false
      and s.instructor_id is not null
      and s.valoracion_pedida_en is null
      and s.fin < now() - interval '20 minutes'
      and s.fin > now() - interval '48 hours'
      and exists (select 1 from public.reservas r where r.sesion_id = s.id and r.estado = 'ASISTIDA' and r.socio_id is not null)
  );
  $$
);
