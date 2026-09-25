-- ════════════════════════════════════════════════════════════════════════════
-- Auditoría de los cambios de dinero que hace el equipo del estudio
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un recibo, un bono o el precio de un plan los puede cambiar quien tiene
-- permiso de dinero desde el panel, y hasta ahora no quedaba constancia fiable
-- de QUIÉN lo hizo ni de QUÉ valor había antes: el feed de actividad es texto
-- libre con un nombre que escribe el propio navegador, y solo lo lee la
-- propietaria. Sin eso no se puede explicar un descuadre a una clienta ni
-- responder «¿quién tocó esto?».
--
-- Esta migración añade un libro de auditoría del ESTUDIO (no el de operadores
-- de Tentare, `plataforma_auditoria`, que no se toca):
--
--   · `auditoria_estudio` — una fila por cada alta, cambio o baja de una fila de
--     dinero hecha por una persona del equipo desde su sesión. Guarda quién
--     (uid y rol EN ESE MOMENTO), cuándo, y el valor antes y después. En un
--     UPDATE solo van las columnas que cambiaron.
--   · Se rellena por TRIGGER, no desde el cliente: así cubre también las
--     escrituras directas del navegador (que solo protege la RLS) sin tocar
--     ninguna pantalla, y un cliente no puede omitirlo ni falsearlo.
--
-- ⚠️ Decisiones (todas revisables, ninguna de seguridad implícita):
--
--   1. FAIL-OPEN. Si registrar falla, la escritura de dinero SIGUE: un fallo de
--      auditoría nunca debe impedir cobrar. Se avisa con un WARNING que empieza
--      por `AUDITORIA_FALLO` (buscable en el log de Postgres). Es el precio de no
--      bloquear el flujo de caja; si algún día se quiere lo contrario, se quita el
--      bloque `exception`. No atrapa la cancelación por timeout.
--   2. SOLO SESIONES DE PERSONAS DEL EQUIPO (`auth.uid()` presente y con rol en
--      la sede de la fila). Webhooks, crons y rutas de servidor con service-role
--      no llevan uid: no son «un ajuste de alguien», y una fila por cada reintento
--      automático taparía lo que importa. Lo que una persona dispara a mano por
--      una ruta de servidor (reembolsos, marcar devuelto, aprobar penalizaciones,
--      el TPV, y TODO `ingresos_manuales` del panel) NO queda registrado con este
--      trigger: queda para un paso posterior con actor explícito, y la columna
--      `origen` ya lo prevé. La pantalla no lo promete.
--   3. APPEND-ONLY DE VERDAD: sin permisos de UPDATE/DELETE para nadie y un
--      trigger que los rechaza también al dueño de la tabla. Un log que se
--      puede reescribir no es una auditoría.
--   4. LECTURA SOLO PARA LA PROPIETARIA (mismo criterio que
--      `actividad_reciente`): el equipo con permiso de dinero no puede leer la
--      auditoría de sus propios cambios.
--   5. NADA DE NOMBRES. El libro guarda el uid de la cuenta y su rol, no el nombre
--      de la persona: al ser inmutable no se podría suprimir ni rectificar, y la
--      purga de un estudio ya anula la ficha del equipo. La pantalla resuelve el
--      nombre con la plantilla del equipo.
--
-- Tablas vigiladas: recibos, suscripciones, ingresos_manuales, planes_tarifa
-- (todas fiscales o de precio). ⚠️ `ingresos_manuales` solo recoge lo que se
-- escriba con una sesión de persona contra la API REST: el panel lo escribe por
-- `/api/ingresos-manuales` con service-role (decisión 2). Quedan fuera a
-- propósito `credit_transactions` y `recuperaciones` (se BORRAN al suprimir a una
-- socia, y una copia en la auditoría contradiría eso) y `citas` (sus cambios no
-- son de dinero salvo `pagada`/`precio`).
--
-- Límites conocidos: cada fila auditada cuesta ~1 ms (medido en producción con un
-- UPDATE de 64 recibos: 67 ms) y abre una subtransacción (el bloque `exception`).
-- `authenticated` tiene `statement_timeout` de 8 s: un lote de miles de filas de
-- una misma sesión habría que pasarlo a un trigger de sentencia con tablas de
-- transición. Hoy los caminos masivos reales son de decenas de filas.
--
-- RGPD: la tabla lleva `socio_id`, así que está clasificada como CONSERVAR en
-- `lib/socios/supresion-clasificacion.ts`: solo audita tablas que ya se
-- conservan por ser fiscales (recibos, suscripciones), con el mismo seudónimo.
-- La purga de un estudio vencido no la toca (se conserva igual que los recibos).
-- PENDIENTE (decisión legal, no técnica): plazo de conservación del libro,
-- procedimiento documentado de supresión del `actor_uid` y aviso al equipo de que
-- sus cambios de dinero se registran.

create table if not exists public.auditoria_estudio (
  id            bigint generated always as identity primary key,
  studio_id     text        not null,
  ocurrido_en   timestamptz not null default now(),
  -- Quién: la cuenta que hizo el cambio y su rol en la sede EN ESE MOMENTO.
  actor_uid     uuid        not null,
  actor_rol     text        not null,
  -- 'panel' = sesión de una persona del equipo (lo escribe el trigger). El
  -- valor 'servidor' queda reservado para las rutas de servidor con actor
  -- explícito (paso posterior).
  origen        text        not null default 'panel' check (origen in ('panel', 'servidor')),
  tabla         text        not null,
  fila_id       text        not null,
  operacion     text        not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  -- Copia del `socio_id` de la fila auditada, para la vista por clienta.
  socio_id      text,
  -- Solo en UPDATE: nombres de las columnas que cambiaron.
  cambios       text[],
  -- Qué fila era, en palabras: unas pocas columnas de identificación que fija
  -- cada trigger (el concepto del recibo, el nombre del plan…). En un UPDATE
  -- `antes`/`despues` solo llevan lo que cambió, y sin esto «cambió un recibo»
  -- no diría cuál. Son los valores de la fila DESPUÉS del cambio (ANTES en un
  -- DELETE).
  contexto      jsonb,
  -- INSERT: solo `despues` (fila entera). DELETE: solo `antes` (fila entera).
  -- UPDATE: solo las columnas de `cambios`, antes y después.
  antes         jsonb,
  despues       jsonb
);

comment on table public.auditoria_estudio is
  'Libro de auditoría de los cambios de dinero hechos por el equipo del estudio (quién, cuándo, antes y después). Append-only; lo rellena el trigger auditar_cambio_dinero(). Solo lo lee la propietaria.';

-- La pantalla pagina por `id` (varias filas de un mismo cambio comparten fecha).
create index if not exists auditoria_estudio_estudio_idx
  on public.auditoria_estudio (studio_id, id desc);
create index if not exists auditoria_estudio_socio_idx
  on public.auditoria_estudio (studio_id, socio_id, id desc)
  where socio_id is not null;
create index if not exists auditoria_estudio_tabla_idx
  on public.auditoria_estudio (studio_id, tabla, id desc);

-- ── Acceso ─────────────────────────────────────────────────────────────────
alter table public.auditoria_estudio enable row level security;

-- El default de Supabase da todos los permisos a anon, authenticated y
-- service_role sobre una tabla y una secuencia nuevas: se quitan y se concede
-- solo lo necesario.
revoke all on table public.auditoria_estudio from public, anon, authenticated, service_role;
revoke all on sequence public.auditoria_estudio_id_seq from public, anon, authenticated, service_role;
grant select on table public.auditoria_estudio to authenticated;
-- service_role solo LEE. Cuando llegue la escritura de servidor con actor
-- explícito se le concederá INSERT en esa migración: sin consumidor, un permiso
-- de más solo serviría para fabricar entradas con un actor falso. Nunca
-- UPDATE/DELETE.
grant select on table public.auditoria_estudio to service_role;

drop policy if exists auditoria_estudio_lectura on public.auditoria_estudio;
create policy auditoria_estudio_lectura on public.auditoria_estudio
  for select to authenticated
  using (studio_id = (select public.current_studio_id())
         and (select public.current_rol()) = 'PROPIETARIO');

-- ── Inmutable ──────────────────────────────────────────────────────────────
create or replace function public.auditoria_estudio_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'auditoria_estudio es inmutable: % no está permitido', tg_op;
end;
$$;

revoke all on function public.auditoria_estudio_inmutable() from public, anon, authenticated;

drop trigger if exists trg_auditoria_estudio_inmutable on public.auditoria_estudio;
create trigger trg_auditoria_estudio_inmutable
  before update or delete on public.auditoria_estudio
  for each row execute function public.auditoria_estudio_inmutable();

drop trigger if exists trg_auditoria_estudio_no_truncate on public.auditoria_estudio;
create trigger trg_auditoria_estudio_no_truncate
  before truncate on public.auditoria_estudio
  for each statement execute function public.auditoria_estudio_inmutable();

-- ── El registro ────────────────────────────────────────────────────────────
create or replace function public.auditar_cambio_dinero()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_rol     text;
  v_studio  text;
  v_fila    jsonb;
  v_vieja   jsonb;
  v_antes   jsonb;
  v_despues jsonb;
  v_cambios text[];
  v_contexto jsonb;
  -- tg_argv[0]: columnas de identificación (van a `contexto`).
  -- tg_argv[1]: columnas que NUNCA se copian al libro (datos de terceros que el
  --             libro, al ser inmutable, no podría rectificar ni suprimir).
  v_excluir text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
begin
  -- Solo lo que hace una persona del equipo desde su sesión (ver cabecera). Esta
  -- salida va FUERA del bloque de excepción de abajo: un webhook o un cron (sin
  -- uid) no debe pagar una subtransacción por cada fila que toca.
  if v_uid is null then
    return null;
  end if;

  begin
    if tg_op = 'INSERT' then
      v_fila := to_jsonb(new) - v_excluir;
      v_despues := v_fila;
    elsif tg_op = 'DELETE' then
      v_fila := to_jsonb(old) - v_excluir;
      v_antes := v_fila;
    else
      v_fila := to_jsonb(new) - v_excluir;
      v_vieja := to_jsonb(old) - v_excluir;
      -- Solo lo que cambió. `updated_at` y parecidos los mueve la propia base en
      -- cada UPDATE, y `matricula_gratis_usados` es un contador que suma
      -- `reservar_matricula` por su cuenta: no son un cambio de nadie.
      select array_agg(n.key order by n.key),
             jsonb_object_agg(n.key, o.value),
             jsonb_object_agg(n.key, n.value)
        into v_cambios, v_antes, v_despues
        from jsonb_each(v_fila) n
        join jsonb_each(v_vieja) o on o.key = n.key
       where n.key not in ('updated_at', 'actualizado_en', 'modificado_en', 'matricula_gratis_usados')
         and o.value is distinct from n.value;
      if v_cambios is null then
        return null;
      end if;
    end if;

    v_studio := v_fila ->> 'studio_id';
    if v_studio is null then
      return null;
    end if;

    -- Rol de quien actúa EN LA SEDE DE LA FILA (no en la activa de su sesión:
    -- una RPC que escribiera en otra sede registraría el rol equivocado). Misma
    -- regla que `current_rol()`: la ficha de equipo activa y, si no, la dueña.
    select i.rol into v_rol
      from public.instructores i
     where i.auth_user_id = v_uid and i.studio_id = v_studio and coalesce(i.activo, true)
     limit 1;
    if v_rol is null then
      select 'PROPIETARIO' into v_rol
        from public.studios s
       where s.id = v_studio and s.owner_auth_user_id = v_uid;
    end if;
    -- Sin rol en esa sede (una socia que pasa por una RPC, p. ej.): no es el equipo.
    if v_rol is null then
      return null;
    end if;

    -- Columnas de identificación que fija cada trigger. Solo las que existan.
    if tg_nargs > 0 then
      select jsonb_object_agg(c, v_fila -> c)
        into v_contexto
        from unnest(string_to_array(tg_argv[0], ',')) as c
       where v_fila ? c;
    end if;

    -- ⚠️ `left(…, 200)`: los ids son texto que elige el cliente (la RLS solo mira
    -- `studio_id` y el permiso de dinero) y los índices del libro rechazan una
    -- entrada de más de ~2.700 bytes. Con un id así de largo el INSERT fallaba,
    -- el `exception` de abajo se lo tragaba y esa fila de dinero quedaba SIN
    -- auditar durante toda su vida: justo el camino de quien no quiere que se vea
    -- lo que hace. El id completo sigue en `antes`/`despues` en altas y bajas.
    insert into public.auditoria_estudio
      (studio_id, actor_uid, actor_rol, tabla, fila_id, operacion,
       socio_id, cambios, contexto, antes, despues)
    values
      (left(v_studio, 200), v_uid, v_rol, tg_table_name, left(coalesce(v_fila ->> 'id', ''), 200), tg_op,
       left(v_fila ->> 'socio_id', 200), v_cambios, v_contexto, v_antes, v_despues);
  exception when others then
    -- FAIL-OPEN (decisión 1 de la cabecera): jamás se impide una escritura de
    -- dinero por un fallo al registrarla. No atrapa la cancelación por timeout
    -- (`query_canceled`): esa sí aborta la sentencia entera.
    raise warning 'AUDITORIA_FALLO (%): %', tg_table_name, sqlerrm;
  end;

  return null;
end;
$$;

-- Función de trigger, pero el default de Supabase da EXECUTE directo a anon y
-- authenticated (no solo a PUBLIC): se quita a los tres.
revoke all on function public.auditar_cambio_dinero() from public, anon, authenticated;

-- Argumento 1: columnas de identificación que van a `contexto`. Argumento 2
-- (opcional): columnas que no se copian nunca (`ingresos_manuales` lleva el NIF y
-- el nombre de un tercero: en un libro que no se puede rectificar no deben entrar;
-- efecto lateral aceptado: un UPDATE que solo toca esas columnas no deja fila).
drop trigger if exists trg_auditar_recibos on public.recibos;
create trigger trg_auditar_recibos
  after insert or update or delete on public.recibos
  for each row execute function public.auditar_cambio_dinero('concepto,fecha_vencimiento');

drop trigger if exists trg_auditar_suscripciones on public.suscripciones;
create trigger trg_auditar_suscripciones
  after insert or update or delete on public.suscripciones
  for each row execute function public.auditar_cambio_dinero('plan_id,estado');

drop trigger if exists trg_auditar_ingresos_manuales on public.ingresos_manuales;
create trigger trg_auditar_ingresos_manuales
  after insert or update or delete on public.ingresos_manuales
  for each row execute function public.auditar_cambio_dinero('concepto,fecha', 'cliente,nif,nota');

drop trigger if exists trg_auditar_planes_tarifa on public.planes_tarifa;
create trigger trg_auditar_planes_tarifa
  after insert or update or delete on public.planes_tarifa
  for each row execute function public.auditar_cambio_dinero('nombre');

-- ── Comprobación al aplicar (no fiarse del comentario SQL) ─────────────────
do $$
declare
  v_rol text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_rol, 'public.auditar_cambio_dinero()', 'EXECUTE') then
      raise exception 'auditar_cambio_dinero() es ejecutable por %', v_rol;
    end if;
    if has_table_privilege(v_rol, 'public.auditoria_estudio', 'INSERT')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'UPDATE')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'DELETE') then
      raise exception 'auditoria_estudio es escribible por %', v_rol;
    end if;
  end loop;
  foreach v_rol in array array['anon', 'authenticated', 'service_role'] loop
    if has_sequence_privilege(v_rol, 'public.auditoria_estudio_id_seq', 'USAGE')
       or has_sequence_privilege(v_rol, 'public.auditoria_estudio_id_seq', 'UPDATE') then
      raise exception 'la secuencia de auditoria_estudio es utilizable por %', v_rol;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.auditoria_estudio', 'SELECT') then
    raise exception 'auditoria_estudio es legible por anon';
  end if;
  if has_table_privilege('service_role', 'public.auditoria_estudio', 'INSERT')
     or has_table_privilege('service_role', 'public.auditoria_estudio', 'UPDATE')
     or has_table_privilege('service_role', 'public.auditoria_estudio', 'DELETE') then
    raise exception 'auditoria_estudio es escribible por service_role';
  end if;
end;
$$;
