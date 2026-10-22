-- ═══════════════════════════════════════════════════════════════════════════
-- El embudo del alta, en la base de datos (PR-1 del alta nueva: «medir primero»).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta aquí el embudo de un estudio nuevo vivía en PostHog, que va sin
-- persistencia, se apaga sin clave y no carga con bloqueadores. Con 4-11 altas
-- al mes un test A/B no termina nunca: se comparan cohortes por semana, y para
-- eso cada paso tiene que dejar huella donde no se pierde.
--
-- Tres piezas:
--   1. `embudo_alta`: los pasos que hoy NO dejan huella en ninguna tabla (abrir
--      el panel, que una alumna nueva ya pueda reservar, compartir el enlace).
--      Una fila por estudio, paso y día de Madrid: lo que se pregunta es «¿lo
--      hizo ese día?», no cuántas veces. Sin datos personales: ni cuenta, ni
--      correo, ni IP, ni texto libre. Solo la escribe el servidor
--      (lib/alta/embudo-servidor.ts).
--   2. `altas_estudio.version` y `.llegada`: con qué alta se creó la cuenta
--      (la de siempre, la nueva o la nueva en pruebas) y desde qué botón de la
--      web llegó. Las copia el trigger de auth.users del `pending_studio`.
--   3. `embudo_activacion_detalle(p_desde)`: una fila por estudio con las marcas
--      que YA existen (alta, email, estudio, primera clase, primera reserva) y
--      los pasos de `embudo_alta`. Lo que ya está en otra tabla no se copia: se
--      cruza al leer, así la cohorte «antes» sale con datos de verdad.
--
-- ⚠️ El «hoy» es el de Madrid (`public.hoy_estudio()`), y un día pasa a instante
-- con `::timestamp at time zone 'Europe/Madrid'`, nunca con `::timestamptz`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. embudo_alta ──────────────────────────────────────────────────────────
-- La lista de pasos y de detalles es CERRADA y es la misma que
-- `PASOS_EMBUDO` / `DETALLES_EMBUDO` de lib/alta/embudo.ts (lo cruza
-- lib/alta/embudo.test.ts). Un paso nuevo se añade en los dos sitios.
--   · panel_abierto        la propietaria abre el panel (d1/d7/d30), /api/billing/status
--   · clase_reservable     una alumna nueva ya puede reservar, /api/onboarding/puede-reservar
--   · enlace_compartido    copió, mandó por WhatsApp, compartió o bajó el QR de su enlace
--   · config_completada    «Tu estudio» de la bienvenida nueva (PR-3)
--   · correo_cuenta_activa el correo «Tu cuenta está activa» (PR-2)
--   · plan_ensenado        la tarjeta del plan tras la primera reserva (PR-5)
-- Los tres últimos los escriben PRs que vienen detrás; se declaran ya para no
-- tener que rehacer este CHECK en cada uno. Hasta entonces, sin filas.
create table if not exists public.embudo_alta (
  studio_id text not null references public.studios(id) on delete cascade,
  paso text not null check (paso in (
    'panel_abierto', 'clase_reservable', 'enlace_compartido',
    'config_completada', 'correo_cuenta_activa', 'plan_ensenado'
  )),
  dia date not null default public.hoy_estudio(),
  -- Por dónde: solo para `enlace_compartido` (copiar, WhatsApp, la hoja de
  -- compartir del móvil o el QR). Nada que escriba una persona.
  detalle text check (detalle is null or detalle in ('copiar', 'whatsapp', 'compartir', 'qr')),
  ocurrido_en timestamptz not null default now(),
  primary key (studio_id, paso, dia)
);

comment on table public.embudo_alta is
  'Pasos del alta que no dejan huella en otra tabla, uno por estudio, paso y día de Madrid. Sin datos personales. Solo service_role (lib/alta/embudo-servidor.ts); se lee con embudo_activacion_detalle().';

-- La RLS es la cerradura: activada y SIN políticas permisivas → el cliente no
-- lee ni escribe nada. La restrictiva del segundo paso va igual que en todas
-- (supabase/tests/rls-doble-factor.test.ts la exige en cada tabla con RLS).
alter table public.embudo_alta enable row level security;
create policy exige_doble_factor on public.embudo_alta as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
-- `pg_default_acl` concede directo a anon/authenticated, no por PUBLIC: se
-- revocan los tres.
revoke all on public.embudo_alta from public, anon, authenticated;
grant all on public.embudo_alta to service_role;

-- ── 2. altas_estudio: con qué alta y desde dónde ───────────────────────────
-- `version`: 'v1' es el alta de siempre (y toda fila anterior a esta migración);
-- 'v2' el alta nueva; 'v2_prueba' el alta nueva abierta solo para probarla
-- (`/crear-estudio?alta=nueva` con ALTA_NUEVA_REGISTRO=prueba), que no entra en
-- las cohortes de serie.
-- `llegada`: la etiqueta que deja la web en `CLAVE_ORIGEN_ALTA`
-- (lib/landing/medicion.ts). NO es una lista cerrada en el código: es la
-- ubicación del botón en la landing ('hero', 'precio', 'cta_final', el id de la
-- sección…) o la ruta de la página pública ('/funcionalidades/…'). Por eso el
-- CHECK es de forma y longitud, no de valores: minúsculas, cifras y / _ . -.
alter table public.altas_estudio
  add column if not exists version text not null default 'v1'
    check (version in ('v1', 'v2', 'v2_prueba')),
  add column if not exists llegada text
    check (llegada is null or llegada ~ '^[a-z0-9/_.-]{1,80}$');

-- ── El trigger de auth.users, con version y llegada ────────────────────────
-- Mismo cuerpo que 20261001195938 más las dos columnas. ⚠️ Un valor raro NUNCA
-- rompe un alta: se normaliza ANTES del INSERT (fuera de la lista → 'v1'/null),
-- para que el CHECK no salte y se lleve la fila entera, y todo sigue dentro del
-- bloque con EXCEPTION: perder una fila de diagnóstico es aceptable; perder un
-- alta, no.
create or replace function public.altas_estudio_registrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendiente jsonb;
  v_version text;
  v_llegada text;
begin
  begin
    v_pendiente := new.raw_user_meta_data -> 'pending_studio';
    if jsonb_typeof(v_pendiente) = 'object' then
      v_version := coalesce(v_pendiente ->> 'version', '');
      if v_version not in ('v1', 'v2', 'v2_prueba') then
        v_version := 'v1';
      end if;
      v_llegada := lower(btrim(v_pendiente ->> 'llegada'));
      if v_llegada is null or v_llegada !~ '^[a-z0-9/_.-]{1,80}$' then
        v_llegada := null;
      end if;
      insert into public.altas_estudio (auth_user_id, origen, estudio_nombre, iniciada_en, version, llegada)
      values (
        new.id,
        'registro',
        nullif(left(btrim(v_pendiente ->> 'nombre'), 120), ''),
        coalesce(new.created_at, now()),
        v_version,
        v_llegada
      )
      on conflict (auth_user_id) do nothing;
    end if;
  exception when others then
    raise warning 'altas_estudio_registrar_cuenta: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Misma firma: los permisos se conservan, pero se reescriben igual (función de
-- trigger: nadie la llama, el permiso se comprueba al crear el trigger).
revoke execute on function public.altas_estudio_registrar_cuenta() from public, anon, authenticated;
grant execute on function public.altas_estudio_registrar_cuenta() to service_role;

-- ── 3. La lectura: una fila por estudio (y por alta que no llegó a estudio) ──
-- La usa /api/interno/crecimiento/activacion (growth.read) y el fundador por SQL.
-- SECURITY DEFINER porque lee auth.users; por eso mismo solo service_role.
--
-- Qué entra:
--   · Estudios creados desde `p_desde` (00:00 de Madrid), sin demos (`es_demo`:
--     demostraciones y pruebas del equipo) y sin sedes de cadena (`cadena_id`:
--     una sede no pasa por el alta).
--   · Las altas (`altas_estudio`) iniciadas desde `p_desde` que no llegaron a
--     tener estudio, con `studio_id` null: son la parte alta del embudo.
--   · Sin las altas de prueba (`version = 'v2_prueba'`) salvo `p_incluir_pruebas`.
--
-- Columnas, todas sin datos personales:
--   · `semana`: el lunes (Madrid) de la semana del alta; `dia_alta`: su día.
--     Con estudio, el de `studios.creado_en`; sin él, el de `iniciada_en`.
--   · `tiene_clase`: alguna fila en `sesiones`. `primera_clase_en`: la primera
--     `sesiones.creado_en` (cuándo se PROGRAMÓ, no cuándo se da), que es NULL en
--     las clases de antes del 13-sep-2026 (20260912223256): con clase y sin hora
--     es «se sabe que la tiene, no cuándo». `tiene_tipo_clase` y
--     `tiene_tarifa_activa` son el estado de HOY: ni `tipos_clase` ni
--     `planes_tarifa` guardan cuándo se crearon.
--     Tarifa activa = activa y con precio, como `lib/tour/hecho.ts`.
--   · `primera_reserva_en`: la primera reserva del estudio, cancelada o no
--     (mismo criterio que `estudioActivado`), menos las IMPORTADAS por la
--     migración (su `creado_en` es el de la importación, no el de una alumna
--     reservando): son las que guarda `migracion_batches.ids_creados.reservas`.
--   · `pasos`: el primer `ocurrido_en` de cada paso de `embudo_alta` salvo
--     `panel_abierto`, que va en `dias_panel` como días desde `dia_alta`.
--   · `medido_desde`: el primer día con datos de cada paso en TODA la tabla, el
--     mismo en todas las filas. Antes de ese día el paso no se medía: quien lo
--     lea no puede contar «no lo hizo» donde solo hay «no se miraba».
create or replace function public.embudo_activacion_detalle(
  p_desde date,
  p_incluir_pruebas boolean default false
)
returns table (
  studio_id text,
  semana date,
  dia_alta date,
  version text,
  llegada text,
  alta_iniciada_en timestamptz,
  email_confirmado_en timestamptz,
  estudio_creado_en timestamptz,
  tiene_tipo_clase boolean,
  tiene_clase boolean,
  primera_clase_en timestamptz,
  tiene_tarifa_activa boolean,
  primera_reserva_en timestamptz,
  pasos jsonb,
  dias_panel integer[],
  medido_desde jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with limite as (
    select (coalesce(p_desde, public.hoy_estudio() - 60)::timestamp at time zone 'Europe/Madrid') as instante
  ),
  medicion as (
    select coalesce(jsonb_object_agg(m.paso, m.desde), '{}'::jsonb) as desde
      from (select ea.paso, min(ea.dia) as desde from public.embudo_alta ea group by ea.paso) m
  ),
  estudios as (
    select s.id,
           s.creado_en,
           s.owner_auth_user_id,
           (s.creado_en at time zone 'Europe/Madrid')::date as dia
      from public.studios s, limite l
     where s.creado_en >= l.instante
       and not coalesce(s.es_demo, false)
       and s.cadena_id is null
  ),
  importadas as (
    select mb.studio_id, x.id
      from public.migracion_batches mb
      join estudios e on e.id = mb.studio_id
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(mb.ids_creados -> 'reservas') = 'array' then mb.ids_creados -> 'reservas' else '[]'::jsonb end
      ) as x(id)
     where x.id is not null
  ),
  con_estudio as (
    select e.id as studio_id,
           date_trunc('week', e.creado_en at time zone 'Europe/Madrid')::date as semana,
           e.dia as dia_alta,
           coalesce(a.version, 'v1') as version,
           a.llegada,
           a.iniciada_en as alta_iniciada_en,
           u.email_confirmed_at as email_confirmado_en,
           e.creado_en as estudio_creado_en,
           exists (select 1 from public.tipos_clase t where t.studio_id = e.id) as tiene_tipo_clase,
           exists (select 1 from public.sesiones se where se.studio_id = e.id) as tiene_clase,
           (select min(se.creado_en) from public.sesiones se where se.studio_id = e.id) as primera_clase_en,
           exists (
             select 1 from public.planes_tarifa pt
              where pt.studio_id = e.id and pt.activo is true and pt.precio > 0
           ) as tiene_tarifa_activa,
           (select min(r.creado_en) from public.reservas r
             where r.studio_id = e.id
               and not exists (select 1 from importadas i where i.studio_id = r.studio_id and i.id = r.id)
           ) as primera_reserva_en,
           (select coalesce(jsonb_object_agg(p.paso, p.primero), '{}'::jsonb)
              from (select ea.paso, min(ea.ocurrido_en) as primero
                      from public.embudo_alta ea
                     where ea.studio_id = e.id and ea.paso <> 'panel_abierto'
                     group by ea.paso) p
           ) as pasos,
           array(select distinct (ea.dia - e.dia)
                   from public.embudo_alta ea
                  where ea.studio_id = e.id and ea.paso = 'panel_abierto'
                  order by 1) as dias_panel
      from estudios e
      left join public.altas_estudio a on a.auth_user_id = e.owner_auth_user_id
      left join auth.users u on u.id = e.owner_auth_user_id
     where p_incluir_pruebas or coalesce(a.version, 'v1') <> 'v2_prueba'
  ),
  sin_estudio as (
    select null::text as studio_id,
           date_trunc('week', a.iniciada_en at time zone 'Europe/Madrid')::date as semana,
           (a.iniciada_en at time zone 'Europe/Madrid')::date as dia_alta,
           a.version,
           a.llegada,
           a.iniciada_en as alta_iniciada_en,
           u.email_confirmed_at as email_confirmado_en,
           null::timestamptz as estudio_creado_en,
           false as tiene_tipo_clase,
           false as tiene_clase,
           null::timestamptz as primera_clase_en,
           false as tiene_tarifa_activa,
           null::timestamptz as primera_reserva_en,
           '{}'::jsonb as pasos,
           '{}'::integer[] as dias_panel
      from public.altas_estudio a
      join auth.users u on u.id = a.auth_user_id
      cross join limite l
     where a.iniciada_en >= l.instante
       and (p_incluir_pruebas or a.version <> 'v2_prueba')
       and not exists (select 1 from public.studios s where s.owner_auth_user_id = a.auth_user_id)
  )
  select f.studio_id, f.semana, f.dia_alta, f.version, f.llegada, f.alta_iniciada_en, f.email_confirmado_en,
         f.estudio_creado_en, f.tiene_tipo_clase, f.tiene_clase, f.primera_clase_en, f.tiene_tarifa_activa, f.primera_reserva_en,
         f.pasos, f.dias_panel, m.desde
    from (select * from con_estudio union all select * from sin_estudio) f
    cross join medicion m
   order by f.dia_alta, f.studio_id nulls last;
$$;

-- Los tres pasos, explícitos: `revoke from public` NO basta en este proyecto
-- (`pg_default_acl` da EXECUTE directo a anon y authenticated).
revoke execute on function public.embudo_activacion_detalle(date, boolean) from public;
revoke execute on function public.embudo_activacion_detalle(date, boolean) from anon;
revoke execute on function public.embudo_activacion_detalle(date, boolean) from authenticated;
grant execute on function public.embudo_activacion_detalle(date, boolean) to service_role;

-- ── Verificación ────────────────────────────────────────────────────────────
do $$
declare
  f text := 'public.embudo_activacion_detalle(date, boolean)';
  t text := 'public.altas_estudio_registrar_cuenta()';
  r text;
  p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, f, 'EXECUTE') then
      raise exception '% puede ejecutar %', r, f;
    end if;
    if has_function_privilege(r, t, 'EXECUTE') then
      raise exception '% puede ejecutar %', r, t;
    end if;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, 'public.embudo_alta', p) then
        raise exception '% tiene % sobre embudo_alta', r, p;
      end if;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege(r, 'public.embudo_alta', p) then
        raise exception '% tiene % de columna sobre embudo_alta', r, p;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar %', f;
  end if;
  if not (has_table_privilege('service_role', 'public.embudo_alta', 'SELECT')
          and has_table_privilege('service_role', 'public.embudo_alta', 'INSERT')) then
    raise exception 'service_role no puede leer o escribir embudo_alta';
  end if;
  if exists (select 1 from pg_policy pl where pl.polrelid = 'public.embudo_alta'::regclass and pl.polpermissive) then
    raise exception 'embudo_alta tiene una política permisiva: el cliente no debe ver nada';
  end if;
  if not exists (
    select 1 from pg_policy pl
     where pl.polrelid = 'public.embudo_alta'::regclass and pl.polname = 'exige_doble_factor' and not pl.polpermissive
  ) then
    raise exception 'embudo_alta sin la política restrictiva exige_doble_factor';
  end if;
end;
$$;
