-- Auditoría 26-ago — CUARTA repetición del mismo fallo de familia: la señal de
-- confianza del marketplace se protege en el código de la API y no en la base
-- de datos. Como `authenticated` habla con PostgREST directamente, eso no es
-- defensa en profundidad: es la única defensa, y está en el sitio equivocado.
--
-- 20260813135453 cerró el autoservicio de badges por UPDATE. Pero el trigger
-- que puso es `before update`, así que **el INSERT nunca pasó por él**, y las
-- policies de INSERT solo comprueban la propiedad de la fila. Verificado en
-- producción antes de escribir esto:
--
--   has_column_privilege('authenticated','red_experiencias','estado_verificacion','INSERT') => true
--   has_column_privilege('authenticated','red_referencias','estado','INSERT')               => true
--   has_column_privilege('authenticated','red_referencias','estado','UPDATE')               => true
--   has_column_privilege('authenticated','red_perfiles','slug','UPDATE')                    => true
--
-- Con eso, cualquiera con cuenta podía, por REST directo y con su propio JWT:
--   1. Insertar una experiencia con `estado_verificacion='confirmada'` y el
--      `studio_id` de un estudio real → sello «Perfil verificado» en la ficha
--      pública (app/network/instructoras/[slug]/page.tsx), filtro
--      `soloExperienciaVerificada` del buscador y +puntos en lib/network/ranking.ts.
--   2. Insertar/actualizar una referencia con `estado='confirmada'` → badge
--      «Referencia profesional» (lib/network/badges.ts) sin que exista ningún
--      referente. Todo el flujo real (token de un uso, caducidad 7 días, rate
--      limit) vive en app/api/public/network/referencia, o sea en la API.
--   3. Fijarse su propio `slug` público y sus propias `lat`/`lng` — moderación
--      solo genera el slug `if (fila && !fila.slug)` y la geocodificación solo
--      se recalcula cuando cambia ciudad/zona desde la API.
--
-- Comprobado antes de tocar nada: NINGÚN fichero del repo escribe estas tablas
-- desde el cliente (`grep "from('red_" ` sobre todos los ficheros 'use client'
-- => 0 resultados). Los 4 únicos escritores son rutas de API con service role.
-- Por eso cerrar `authenticated` no quita funcionalidad a nadie.
--
-- La comparación que da la forma correcta está en la tabla hermana:
-- red_certificaciones_insert_propio (20260813222513) SÍ exige
-- `estado = 'pendiente' and resuelto_en is null` en su WITH CHECK.

-- ── 1. red_experiencias: el trigger tiene que cubrir también el INSERT ─────
-- Se elige trigger y no policy por el mismo motivo que en 20260813135453: una
-- policy no puede acotar columnas concretas dentro de una fila, y el filtro
-- tiene que sobrevivir a que la policy cambie de forma.
create or replace function public.red_experiencias_proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      -- Falla en CERRADO: una experiencia nueva nace sin verificar y sin
      -- estudio atribuido, se pida lo que se pida en el body.
      new.estado_verificacion := 'sin_solicitar';
      new.studio_id := null;
    else
      new.estado_verificacion := old.estado_verificacion;
      new.studio_id := old.studio_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists red_experiencias_proteger_verificacion_trigger on public.red_experiencias;
create trigger red_experiencias_proteger_verificacion_trigger
  before insert or update on public.red_experiencias
  for each row execute function public.red_experiencias_proteger_verificacion();

-- ── 2. red_referencias: no tenía NINGÚN trigger, ni en INSERT ni en UPDATE ──
create or replace function public.red_referencias_proteger_estado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      new.estado := 'pendiente';
      new.resuelto_en := null;
    else
      -- El token y su caducidad también se congelan: son el secreto que
      -- app/api/public/network/referencia acepta como prueba de que respondió
      -- el referente. Si la dueña pudiera reescribirlo, el «un solo uso» y los
      -- 7 días de validez dejarían de significar nada.
      new.estado := old.estado;
      new.resuelto_en := old.resuelto_en;
      new.token := old.token;
      new.token_expira_en := old.token_expira_en;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists red_referencias_proteger_estado_trigger on public.red_referencias;
create trigger red_referencias_proteger_estado_trigger
  before insert or update on public.red_referencias
  for each row execute function public.red_referencias_proteger_estado();

-- ── 3. red_referencias.token no puede ser LEGIBLE por su propia dueña ──────
-- Sin esto el punto 2 se puentea por la puerta principal: `red_referencias_
-- select_propio` deja a la dueña leer su fila entera, `token` incluido, y con
-- ese token se confirma a sí misma llamando al endpoint público legítimo.
-- El GET de app/api/network/referencias ya excluye `token` de su lista de
-- COLUMNAS — esto hace que esa decisión sea cierta también por REST directo.
--
-- OJO (regla 4-bis del método): `revoke select (token)` sería un NO-OP mientras
-- exista el grant a nivel de TABLA. Hay que revocar en la tabla y volver a
-- conceder por columna. Verificado que existía: has_table_privilege(
-- 'authenticated','red_referencias','UPDATE') => true.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attname)
    into cols
  from pg_attribute
  where attrelid = 'public.red_referencias'::regclass
    and attnum > 0
    and not attisdropped
    and attname <> 'token';

  execute 'revoke select, insert, update on public.red_referencias from authenticated';
  execute format('grant select (%s) on public.red_referencias to authenticated', cols);
  execute format('grant insert (%s) on public.red_referencias to authenticated', cols);
  execute format('grant update (%s) on public.red_referencias to authenticated', cols);
end $$;

-- ── 4. red_perfiles: slug, lat y lng tampoco son auto-otorgables ───────────
-- Mismo mecanismo que 20260825074240 (revoke de TABLA + grant por columna),
-- ampliando la lista de exclusión. `slug` decide la URL pública y su UNIQUE
-- permite hacer squatting de la de otra; `lat`/`lng` deciden en qué búsquedas
-- «cerca de mí» aparece el perfil.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attname)
    into cols
  from pg_attribute
  where attrelid = 'public.red_perfiles'::regclass
    and attnum > 0
    and not attisdropped
    and attname not in ('destacado', 'identidad_verificada_en', 'slug', 'lat', 'lng');

  execute 'revoke update, insert on public.red_perfiles from authenticated';
  execute format('grant update (%s) on public.red_perfiles to authenticated', cols);
  execute format('grant insert (%s) on public.red_perfiles to authenticated', cols);
end $$;

-- ── 5. red_verificaciones_experiencia: el gemelo, encontrado en la revisión ─
-- Misma familia y misma forma: `red_verificaciones_insert_propio`
-- (20260813111206:176) solo comprueba la propiedad de la fila, y `estado`
-- admite 'confirmada' en su CHECK. El daño directo está acotado (el badge lo
-- decide `red_experiencias.estado_verificacion`, ya blindado arriba), pero hay
-- un `unique (experiencia_id)`: una fila auto-insertada BLOQUEA la solicitud
-- legítima posterior (app/api/network/experiencia/verificar) y además aparece
-- en la bandeja del estudio.
--
-- Solo `before insert`: el UPDATE lo usa `red_verificaciones_update_staff`,
-- que es el camino por el que el estudio resuelve la solicitud. Tocarlo sin
-- necesidad sería cambiar comportamiento de negocio.
create or replace function public.red_verificaciones_proteger_estado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.estado := 'pendiente';
    new.resuelto_en := null;
    new.resuelto_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists red_verificaciones_proteger_estado_trigger on public.red_verificaciones_experiencia;
create trigger red_verificaciones_proteger_estado_trigger
  before insert on public.red_verificaciones_experiencia
  for each row execute function public.red_verificaciones_proteger_estado();

-- ── Salvedad para quien restaure un dump ───────────────────────────────────
-- `auth.role()` devuelve NULL cuando no hay JWT, y `NULL is distinct from
-- 'service_role'` es TRUE: estos triggers también se aplican a una conexión
-- psql directa, al editor SQL del panel y a un `pg_restore`. En una restauración
-- eso rebajaría todas las verificaciones a 'sin_solicitar'/'pendiente' y
-- perdería los tokens de referencia, EN SILENCIO (asignan, no lanzan).
-- Antes de recargar un dump: `alter table <tabla> disable trigger all;` y
-- volver a habilitarlo al terminar.
-- Se deja como asignación y no como `raise exception` a propósito: lanzar
-- rompería la restauración entera en vez de degradarla, y el caso frecuente
-- (un PATCH malicioso por REST) se atiende mejor ignorando el campo que
-- devolviendo un error que le diga al atacante qué columna vigilamos.
