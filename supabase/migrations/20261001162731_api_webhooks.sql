-- ─────────────────────────────────────────────────────────────────────────────
-- F2 · API pública: registro de eventos y webhooks.
--
-- Un programa de contabilidad necesita enterarse de lo que cambia (un cobro, una
-- devolución, una factura) sin releer todo cada noche. Dos vías, sobre el MISMO
-- registro de eventos:
--   · webhooks: Tentare avisa con un POST firmado (HMAC) a la URL del estudio;
--   · `GET /api/v1/eventos`: el programa pregunta «qué ha pasado desde X».
-- Diseño y catálogo en docs/api-publica.md («Eventos y webhooks»).
--
-- ⚠️ Los eventos los escribe un TRIGGER, no el código. `recibos` tiene decenas
-- de escritores (webhook de Stripe, dunning, TPV, panel, crons, RPCs); avisar
-- desde cada uno sería olvidarse de alguno. El trigger solo registra QUÉ fila
-- cambió; la forma pública (`datos`) la escribe después el trabajador con el
-- mismo serializador que la API (lib/api-publica/serializar.ts), para que el
-- webhook y `GET /recibos` digan exactamente lo mismo.
--
-- ⚠️ Solo registra en los estudios con la API activada (`api_acceso_estudios`):
-- en el resto el trigger es una búsqueda por clave primaria y nada más. Y nunca
-- tumba la escritura que lo dispara: si registrar el evento falla, se avisa y la
-- operación de negocio sigue (un cobro vale más que su aviso).
--
-- Las tres tablas son de SERVIDOR, como `api_claves`: RLS sin políticas y sin
-- grants para anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Registro de eventos ──────────────────────────────────────────────────────
create table if not exists public.api_eventos (
  id              text primary key default ('evt_' || replace(gen_random_uuid()::text, '-', '')),
  -- Orden de llegada: el trabajador procesa por él (el cursor del registro es
  -- `publicado`, más abajo).
  seq             bigint generated always as identity,
  studio_id       text not null references public.studios(id) on delete cascade,
  tipo            text not null check (tipo ~ '^(recibo\.(creado|actualizado|eliminado)|(factura|devolucion|venta|clienta)\.(creada|actualizada|eliminada))$'),
  recurso         text not null check (recurso in ('recibo', 'factura', 'devolucion', 'venta', 'clienta')),
  recurso_id      text not null,
  -- clock_timestamp y no now(): en una transacción larga, now() es su inicio.
  creado_en       timestamptz not null default clock_timestamp(),
  -- La forma pública del recurso cuando el trabajador procesó el evento. NULL
  -- con `procesado_en` puesto = el recurso ya no existía.
  datos           jsonb,
  procesado_en    timestamptz,
  -- Quién lo está procesando: otro trabajador no lo toca hasta entonces.
  reclamado_hasta timestamptz,
  -- El cursor de `GET /api/v1/eventos`. NO es `seq`: `seq` se reparte al
  -- insertar, y una transacción que tarda en confirmar puede dejar un `seq`
  -- menor detrás de uno que ya se leyó, y el cursor se lo saltaría para
  -- siempre. `publicado` se asigna al PROCESAR (filas ya confirmadas) y bajo un
  -- cerrojo que dura hasta el commit (`api_eventos_guardar`): su orden es el de
  -- confirmación, y nunca aparece uno menor detrás de otro ya visible.
  publicado       bigint
);

create sequence if not exists public.api_eventos_publicacion_seq;

create unique index if not exists api_eventos_seq_idx on public.api_eventos (seq);
create index if not exists api_eventos_feed_idx on public.api_eventos (studio_id, publicado) where publicado is not null;
create index if not exists api_eventos_pendientes_idx on public.api_eventos (seq) where procesado_en is null;
create index if not exists api_eventos_creado_idx on public.api_eventos (creado_en);
create index if not exists api_eventos_clienta_idx on public.api_eventos (recurso_id) where recurso = 'clienta';

alter table public.api_eventos enable row level security;
revoke all on table public.api_eventos from public, anon, authenticated;
grant all on table public.api_eventos to service_role;
-- Las secuencias nuevas heredan del default ACL permisos para anon/authenticated.
-- No se pueden usar por PostgREST, pero no tienen por qué tenerlos.
do $$
begin
  execute format('revoke all on sequence %s from public, anon, authenticated', pg_get_serial_sequence('public.api_eventos', 'seq'));
end $$;
revoke all on sequence public.api_eventos_publicacion_seq from public, anon, authenticated;
grant usage, select on sequence public.api_eventos_publicacion_seq to service_role;

-- ── Webhooks ─────────────────────────────────────────────────────────────────
-- El secreto de firma se guarda CIFRADO con la clave de las integraciones
-- (lib/integraciones/cifrado-credenciales.ts): hace falta en claro para firmar,
-- así que no basta un hash como en `api_claves`. El CHECK impide guardarlo en
-- claro aunque falte la clave: sin ella, no se pueden crear webhooks.
create table if not exists public.api_webhooks (
  id                         text primary key,
  studio_id                  text not null references public.studios(id) on delete cascade,
  url                        text not null check (url ~ '^https://' and char_length(url) <= 500),
  descripcion                text check (descripcion is null or char_length(descripcion) <= 120),
  tipos                      text[] not null check (
    cardinality(tipos) between 1 and 15
    and tipos <@ array[
      'recibo.creado', 'recibo.actualizado', 'recibo.eliminado',
      'factura.creada', 'factura.actualizada', 'factura.eliminada',
      'devolucion.creada', 'devolucion.actualizada', 'devolucion.eliminada',
      'venta.creada', 'venta.actualizada', 'venta.eliminada',
      'clienta.creada', 'clienta.actualizada', 'clienta.eliminada'
    ]::text[]
  ),
  secreto_cifrado            text not null check (secreto_cifrado like 'enc:v1:%'),
  -- Rotar deja el secreto anterior firmando también 24 h (dos firmas v1).
  secreto_anterior_cifrado   text check (secreto_anterior_cifrado is null or secreto_anterior_cifrado like 'enc:v1:%'),
  secreto_anterior_expira_en timestamptz,
  creado_por                 uuid not null,
  creado_en                  timestamptz not null default now(),
  desactivado_en             timestamptz,
  desactivado_por            uuid,
  desactivado_motivo         text check (desactivado_motivo is null or desactivado_motivo in ('manual', 'fallos', 'destino_retirado', 'api_desactivada', 'borrado')),
  -- Rastro: un webhook no se borra de verdad (igual que una clave revocada no
  -- desaparece). Quién lo creó, quién lo cambió por última vez y quién lo
  -- borró, con la URL a la que apuntaba.
  actualizado_en             timestamptz,
  actualizado_por            uuid,
  borrado_en                 timestamptz,
  borrado_por                uuid,
  -- Salud del destino, para el panel y para desactivarlo si lleva días caído.
  fallando_desde             timestamptz,
  ultimo_exito_en            timestamptz,
  ultimo_intento_en          timestamptz,
  ultimo_estado_http         integer,
  ultimo_error               text check (ultimo_error is null or char_length(ultimo_error) <= 300)
);

create index if not exists api_webhooks_studio_idx on public.api_webhooks (studio_id, creado_en desc);

alter table public.api_webhooks enable row level security;
revoke all on table public.api_webhooks from public, anon, authenticated;
grant all on table public.api_webhooks to service_role;

-- ── Entregas: un evento × un webhook ─────────────────────────────────────────
create table if not exists public.api_webhook_entregas (
  id                 text primary key default ('ent_' || replace(gen_random_uuid()::text, '-', '')),
  studio_id          text not null references public.studios(id) on delete cascade,
  webhook_id         text not null references public.api_webhooks(id) on delete cascade,
  evento_id          text not null references public.api_eventos(id) on delete cascade,
  estado             text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'ENTREGADA', 'FALLIDA', 'DESCARTADA')),
  intentos           integer not null default 0,
  proximo_intento_en timestamptz not null default now(),
  ultimo_intento_en  timestamptz,
  ultimo_estado_http integer,
  ultimo_error       text check (ultimo_error is null or char_length(ultimo_error) <= 300),
  duracion_ms        integer,
  entregada_en       timestamptz,
  creada_en          timestamptz not null default now(),
  unique (webhook_id, evento_id)
);

create index if not exists api_webhook_entregas_pendientes_idx
  on public.api_webhook_entregas (proximo_intento_en) where estado = 'PENDIENTE';
create index if not exists api_webhook_entregas_webhook_idx
  on public.api_webhook_entregas (webhook_id, creada_en desc);
create index if not exists api_webhook_entregas_evento_idx
  on public.api_webhook_entregas (evento_id);

alter table public.api_webhook_entregas enable row level security;
revoke all on table public.api_webhook_entregas from public, anon, authenticated;
grant all on table public.api_webhook_entregas to service_role;

-- ── El trigger que registra ──────────────────────────────────────────────────
-- Un UPDATE solo es evento si cambia alguna columna que la API ENSEÑA (la lista
-- de cada tabla es `COLUMNAS` de lib/api-publica/serializar.ts, y un test
-- comprueba que no se separen). Sin eso, el dunning, que toca
-- `intentos_reintento` cada noche, mandaría un aviso por recibo sin que nada
-- visible hubiera cambiado.
--
-- SECURITY DEFINER porque lo dispara también el navegador (la recepción
-- editando una clienta), que no puede leer `api_acceso_estudios` ni escribir en
-- `api_eventos`. No hace nada más que esa lectura y ese insert.
create or replace function public.api_registrar_evento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_studio  text;
  v_id      text;
  v_recurso text;
  v_accion  text;
  v_cols    text[];
  v_nueva   jsonb;
  v_vieja   jsonb;
  v_cambia  boolean;
begin
  if tg_op = 'DELETE' then
    v_studio := old.studio_id;
    v_id := old.id;
  else
    v_studio := new.studio_id;
    v_id := new.id;
  end if;

  if v_studio is null or not exists (
    select 1 from public.api_acceso_estudios a
     where a.studio_id = v_studio and a.desactivada_en is null
  ) then
    return null;
  end if;

  v_recurso := case tg_table_name
    when 'recibos' then 'recibo'
    when 'facturas' then 'factura'
    when 'devoluciones' then 'devolucion'
    when 'ventas_pos' then 'venta'
    when 'socios' then 'clienta'
  end;
  if v_recurso is null then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_cols := case tg_table_name
      when 'recibos' then array[
        'socio_id', 'suscripcion_id', 'concepto', 'importe', 'importe_devuelto', 'estado',
        'fecha_vencimiento', 'fecha_cobro', 'fecha_devolucion', 'metodo_cobro', 'es_renovacion',
        'stripe_payment_intent_id', 'anulado_en', 'reembolso_stripe_id', 'reembolso_solicitado_en']
      when 'facturas' then array[
        'recibo_id', 'venta_pos_id', 'numero_completo', 'serie', 'tipo', 'tipo_rectificativa',
        'rectifica_a', 'importe_rectificacion', 'fecha_emision', 'receptor_nombre', 'receptor_nif',
        'concepto', 'base_imponible', 'tipo_iva', 'cuota_iva', 'total', 'verifactu_estado',
        'verifactu_csv', 'verifactu_qr_url']
      when 'devoluciones' then array[
        'recibo_id', 'venta_pos_id', 'socio_id', 'origen', 'importe_cobrado', 'importe_devuelto',
        'estado', 'stripe_charge_id', 'detectada_en', 'resuelta_en']
      when 'ventas_pos' then array[
        'numero', 'socio_id', 'recibo_id', 'realizada_en', 'estado', 'metodo_pago', 'subtotal',
        'descuento', 'base_imponible', 'iva_total', 'total', 'importe_devuelto', 'devuelta_en',
        'anulada_en']
      when 'socios' then array[
        'nombre', 'apellidos', 'email', 'telefono', 'activo', 'fecha_alta', 'nif', 'direccion']
    end;
    v_nueva := to_jsonb(new);
    v_vieja := to_jsonb(old);
    select coalesce(bool_or((v_nueva -> c) is distinct from (v_vieja -> c)), false)
      into v_cambia
      from unnest(v_cols) as c;
    if not v_cambia then
      return null;
    end if;
  end if;

  v_accion := case tg_op when 'INSERT' then 'creado' when 'UPDATE' then 'actualizado' else 'eliminado' end;
  if v_recurso <> 'recibo' then
    v_accion := left(v_accion, -1) || 'a';
  end if;

  begin
    insert into public.api_eventos (studio_id, tipo, recurso, recurso_id)
    values (v_studio, v_recurso || '.' || v_accion, v_recurso, v_id);
  exception when others then
    raise warning 'api_registrar_evento(%, %): % %', tg_table_name, v_id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.api_registrar_evento() from public, anon, authenticated;
grant execute on function public.api_registrar_evento() to service_role, postgres;

drop trigger if exists trg_api_evento on public.recibos;
create trigger trg_api_evento after insert or update or delete on public.recibos
  for each row execute function public.api_registrar_evento();
drop trigger if exists trg_api_evento on public.facturas;
create trigger trg_api_evento after insert or update or delete on public.facturas
  for each row execute function public.api_registrar_evento();
drop trigger if exists trg_api_evento on public.devoluciones;
create trigger trg_api_evento after insert or update or delete on public.devoluciones
  for each row execute function public.api_registrar_evento();
drop trigger if exists trg_api_evento on public.ventas_pos;
create trigger trg_api_evento after insert or update or delete on public.ventas_pos
  for each row execute function public.api_registrar_evento();
drop trigger if exists trg_api_evento on public.socios;
create trigger trg_api_evento after insert or update or delete on public.socios
  for each row execute function public.api_registrar_evento();

-- ── Suprimir a una clienta borra también sus copias en el registro ──────────
-- `datos` guarda la clienta (nombre, email, teléfono) tal y como estaba en
-- cada evento. Al suprimirla (RGPD: `anonimizar_socio` deja `borrado_en` y el
-- email `borrado+…@anon.invalid`) o al borrarla, esas copias se vacían y lo que
-- quedaba por mandar de ella no se manda: si no, seguirían saliendo por
-- `GET /api/v1/eventos` y por los reintentos (o un «reenviar») durante 30 días.
-- No va en `anonimizar_socio` porque el registro no apunta a la socia por
-- `socio_id` (lo que vigila lib/socios/supresion-cobertura.test.ts), sino por
-- `recurso_id`; y así cubre cualquier camino que la suprima, no solo ese.
-- Los recibos, ventas y devoluciones solo llevan su id (seudónimo, como en
-- Facturación): esos no se tocan.
create or replace function public.api_eventos_olvidar_clienta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and not (
    (old.borrado_en is null and new.borrado_en is not null)
    or (new.email like 'borrado+%@anon.invalid' and new.email is distinct from old.email)
  ) then
    return null;
  end if;
  update public.api_eventos e
     set datos = null
   where e.recurso = 'clienta' and e.recurso_id = old.id and e.studio_id = old.studio_id
     and e.datos is not null;
  update public.api_webhook_entregas en
     set estado = 'DESCARTADA', ultimo_error = 'La clienta se ha suprimido.'
    from public.api_eventos e
   where en.evento_id = e.id and en.estado = 'PENDIENTE'
     and e.recurso = 'clienta' and e.recurso_id = old.id and e.studio_id = old.studio_id;
  return null;
end;
$$;

revoke all on function public.api_eventos_olvidar_clienta() from public, anon, authenticated;
grant execute on function public.api_eventos_olvidar_clienta() to service_role, postgres;

drop trigger if exists trg_api_eventos_olvidar on public.socios;
create trigger trg_api_eventos_olvidar after update or delete on public.socios
  for each row execute function public.api_eventos_olvidar_clienta();

-- ── Funciones del trabajador (solo service_role) ─────────────────────────────
-- Reclamar con `for update skip locked` y un plazo: dos ejecuciones del cron que
-- se pisen no procesan ni entregan lo mismo dos veces, y lo que se quede a medias
-- (la función de Vercel muere) vuelve a la cola cuando vence el plazo.
--
-- ⚠️ Con REPARTO por estudio (eventos) y por webhook (entregas): sin él, un
-- estudio que importa 2.000 alumnas llena la cola por delante de todos y los
-- demás se quedan horas sin avisos. Los candidatos se eligen con
-- `row_number()` y se bloquean aparte, porque `for update` no admite funciones
-- de ventana en la misma consulta.
create or replace function public.api_eventos_reclamar(p_limite integer default 200)
returns table (id text, studio_id text, tipo text, recurso text, recurso_id text)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with candidatos as (
    select c.id, c.seq
      from (
        select x.id, x.seq, row_number() over (partition by x.studio_id order by x.seq) as n
          from public.api_eventos x
         where x.procesado_en is null
           and (x.reclamado_hasta is null or x.reclamado_hasta < now())
      ) c
     where c.n <= 50
     order by c.n, c.seq
     limit least(greatest(coalesce(p_limite, 200), 1), 500)
  ), bloqueados as (
    select x.id from public.api_eventos x
     where x.id in (select ca.id from candidatos ca)
     for update skip locked
  )
  update public.api_eventos e
     set reclamado_hasta = now() + interval '2 minutes'
    from bloqueados b
   where e.id = b.id
  returning e.id, e.studio_id, e.tipo, e.recurso, e.recurso_id;
$$;

-- Guarda la forma pública de cada evento, lo publica y crea sus entregas, en
-- una sola llamada: [{ "id": "evt_…", "datos": {…} | null }]. Un evento solo se
-- entrega a los webhooks ACTIVOS del MISMO estudio suscritos a su tipo.
-- El cerrojo transaccional serializa las publicaciones: el número `publicado`
-- se reparte y se confirma antes de que otra pasada pueda repartir el siguiente.
create or replace function public.api_eventos_guardar(p_eventos jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.api_eventos_guardar'));
  with entrada as (
    select x ->> 'id' as id,
           case when jsonb_typeof(x -> 'datos') = 'object' then x -> 'datos' end as datos
      from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) as x
  ), numerados as (
    select o.id, o.datos, nextval('public.api_eventos_publicacion_seq') as publicado
      from (
        select en.id, en.datos
          from entrada en
          join public.api_eventos e on e.id = en.id
         where e.procesado_en is null
         order by e.seq
      ) o
  ), hechos as (
    update public.api_eventos e
       set datos = nu.datos, procesado_en = now(), reclamado_hasta = null, publicado = nu.publicado
      from numerados nu
     where e.id = nu.id and e.procesado_en is null
    returning e.id, e.studio_id, e.tipo
  )
  insert into public.api_webhook_entregas (studio_id, webhook_id, evento_id)
  select h.studio_id, w.id, h.id
    from hechos h
    join public.api_webhooks w
      on w.studio_id = h.studio_id and w.desactivado_en is null and h.tipo = any (w.tipos)
  on conflict (webhook_id, evento_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.api_webhooks_reclamar_entregas(p_limite integer default 25)
returns table (id text, webhook_id text, evento_id text, intentos integer)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with candidatos as (
    select c.id
      from (
        select x.id, x.proximo_intento_en, x.creada_en,
               row_number() over (partition by x.webhook_id order by x.proximo_intento_en, x.creada_en) as n
          from public.api_webhook_entregas x
         where x.estado = 'PENDIENTE' and x.proximo_intento_en <= now()
      ) c
     where c.n <= 5
     order by c.n, c.proximo_intento_en, c.creada_en
     limit least(greatest(coalesce(p_limite, 25), 1), 100)
  ), bloqueados as (
    select x.id from public.api_webhook_entregas x
     where x.id in (select ca.id from candidatos ca)
     for update skip locked
  )
  update public.api_webhook_entregas en
     set proximo_intento_en = now() + interval '3 minutes'
    from bloqueados b
   where en.id = b.id
  returning en.id, en.webhook_id, en.evento_id, en.intentos;
$$;

revoke all on function public.api_eventos_reclamar(integer) from public, anon, authenticated;
revoke all on function public.api_eventos_guardar(jsonb) from public, anon, authenticated;
revoke all on function public.api_webhooks_reclamar_entregas(integer) from public, anon, authenticated;
grant execute on function public.api_eventos_reclamar(integer) to service_role;
grant execute on function public.api_eventos_guardar(jsonb) to service_role;
grant execute on function public.api_webhooks_reclamar_entregas(integer) to service_role;

-- ── El cron: solo llama a la app si hay trabajo ──────────────────────────────
-- Cada minuto, pero el `where` va ANTES del POST: sin eventos por procesar ni
-- entregas que toquen, no hay invocación de Vercel. Un estudio sin API activada
-- no genera eventos, así que hoy esto no llama a nadie.
select cron.unschedule('api-webhooks')
 where exists (select 1 from cron.job where jobname = 'api-webhooks');
select cron.schedule(
  'api-webhooks',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/api-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  )
  where exists (select 1 from public.api_eventos where procesado_en is null)
     or exists (select 1 from public.api_webhook_entregas where estado = 'PENDIENTE' and proximo_intento_en <= now());
  $$
);

-- El registro guarda 30 días (lo que promete docs/api-publica.md). Borrar el
-- evento borra sus entregas (on delete cascade).
select cron.unschedule('api-eventos-purgar')
 where exists (select 1 from cron.job where jobname = 'api-eventos-purgar');
select cron.schedule(
  'api-eventos-purgar',
  '25 4 * * *',
  $$delete from public.api_eventos where creado_en < now() - interval '30 days'$$
);

-- ── La purga de un estudio vencido borra también sus eventos y webhooks ──────
-- Copia literal de la definición vigente (20261001140538_api_publica_claves),
-- con las tres tablas nuevas en `c_borrar` ANTES de `api_acceso_estudios`: la
-- anonimización de las socias (que va antes del bucle) dispara eventos, y así
-- se borran en la misma pasada. Se comprueba antes que producción sigue
-- teniendo ESA versión: si otra sesión la ha cambiado entretanto, esto falla en
-- vez de pisarla.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.purgar_estudio_vencido(text, boolean)'::regprocedure)
     <> 'a4704a204a973333fc715b61c62698f3' then
    raise exception 'purgar_estudio_vencido ha cambiado desde 20261001140538: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.purgar_estudio_vencido(p_studio_id text, p_ejecutar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- ⚠️ LEGAL: suelo de la guardia; el plazo real lo decide el ciclo en TS.
  c_dias_minimos constant interval := interval '90 days';
  c_borrar constant text[] := array[
    'recomendacion_outcomes', 'recomendaciones', 'decision_snapshots', 'decision_mensajes_dia',
    'notification_delivery', 'notification', 'notification_preference', 'push_subscription',
    'automation_logs', 'actividad_reciente', 'widget_eventos', 'intentos_reserva_fallidos', 'avisos_hueco',
    'valoraciones_iniciales_salud', 'valoraciones_iniciales', 'condiciones_salud',
    'respuestas_cuestionario_salud', 'respuestas_sesion', 'notas_internas', 'notas_progreso',
    'documentos_socio', 'memoria_socio', 'comunicaciones_socio', 'preferencias_socio', 'tareas',
    'mensajes', 'conversaciones', 'mensajes_equipo',
    'comentarios_comunidad', 'post_likes', 'posts_comunidad',
    'valoraciones', 'favoritos_clase', 'socio_companeras', 'reto_participaciones',
    'achievement_history', 'achievement_progress', 'challenge_history', 'challenge_progress',
    'reward_history', 'reward_redemptions', 'reward_actions', 'credit_transactions', 'member_credits',
    'instructor_bajas_seguimiento', 'bajas_instructora', 'instructora_disponibilidad_excepciones',
    'instructora_ausencias', 'instructora_disponibilidad', 'citas_disponibilidad',
    'instructor_dependency_snapshots', 'sustitucion_contactos',
    'oauth_auditoria_accesos', 'oauth_codigos_autorizacion', 'oauth_tokens', 'oauth_consentimientos',
    'integracion_credenciales', 'migracion_batches', 'resumen_semanal_envios', 'soporte_solicitudes',
    'backups', 'consultas_contacto',
    'api_webhook_entregas', 'api_webhooks', 'api_eventos', 'api_claves', 'api_acceso_estudios'
  ];
  -- Texto libre en filas que se conservan: [tabla, columna, valor vacío en SQL].
  c_vaciar constant text[][] := array[
    ['sustituciones', 'motivo', 'null'],
    ['sustituciones', 'ranking', '''[]''::jsonb'],
    ['sustituciones', 'candidatos_network', 'null'],
    ['sesiones', 'notas', 'null'],
    ['sesiones', 'incidencia_texto', 'null'],
    ['citas', 'notas', 'null'],
    -- Jornadas y su auditoría se conservan (registro de jornada) sin quién las
    -- tocó ni por qué: la cuenta pasa a un centinela y el motivo, libre, se vacía.
    ['instructor_work_sessions', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['instructor_work_sessions', 'edited_by', 'null'],
    ['work_session_audits', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['work_session_audits', 'reason', 'null'],
    -- Igual con las clases impartidas: se conservan (qué clase se dio y cuándo)
    -- sin quién las tocó ni el motivo libre de las correcciones.
    ['clases_impartidas', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas', 'edited_by', 'null'],
    ['clases_impartidas', 'revisada_por', 'null'],
    ['clases_impartidas_auditoria', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas_auditoria', 'motivo', 'null']
  ];
  -- Los scopes del CHECK de instructor_enlaces_vigentes. Sin '.', nunca pasa por
  -- un token firmado: cualquier enlace de la instructora deja de reconocerse.
  c_scopes_enlace constant text[] := array['disponibilidad', 'reportar_baja', 'invitacion'];
  c_token_revocado constant text := 'revocado-por-purga';
  c_conservar constant text[] := array[
    'facturas', 'recibos', 'ventas_pos', 'devoluciones', 'pagos_historicos', 'mandatos_sepa',
    'penalizaciones', 'liquidaciones_instructoras', 'instructor_tarifas', 'lecturas_ficha_salud',
    'reservas', 'suscripciones', 'instructor_work_sessions', 'work_session_audits',
    'clases_impartidas', 'clases_impartidas_auditoria'
  ];
  v_estudio     record;
  v_tabla       text;
  v_col         text[];
  v_n           bigint;
  v_borrar      jsonb := '{}'::jsonb;
  v_conservar   jsonb := '{}'::jsonb;
  v_vaciar      jsonb := '{}'::jsonb;
  v_socio       record;
  v_n_socias    bigint;
  v_n_instr     bigint;
  v_anonimizar  boolean := to_regprocedure('public.anonimizar_socio(text,text,uuid,text)') is not null;
begin
  select id, subscription_status, subscription_id, trial_ends_at
    into v_estudio from public.studios where id = p_studio_id;
  if not found then
    raise exception 'purgar_estudio_vencido: el estudio % no existe', p_studio_id;
  end if;

  -- Guardia EN LA BD, no solo en el cron: jamás se purga un estudio que paga,
  -- que tiene suscripción de Stripe o que no lleva 90 días vencido.
  if v_estudio.subscription_status is distinct from 'trial_expirado'
     or v_estudio.subscription_id is not null
     or v_estudio.trial_ends_at is null
     or v_estudio.trial_ends_at > now() - c_dias_minimos then
    raise exception 'purgar_estudio_vencido: % no está en trial_expirado sin suscripción con más de 90 días', p_studio_id;
  end if;

  select count(*) into v_n_socias from public.socios where studio_id = p_studio_id and borrado_en is null;
  select count(*) into v_n_instr from public.instructores
   where studio_id = p_studio_id
     and (email is not null or telefono is not null or auth_user_id is not null
          or foto_url is not null or avatar is not null or bio is not null);

  if p_ejecutar and v_n_socias > 0 and not v_anonimizar then
    raise exception 'purgar_estudio_vencido: falta public.anonimizar_socio(text, text, uuid, text); no se purga sin anonimizar a las socias';
  end if;

  if p_ejecutar then
    for v_socio in select id from public.socios where studio_id = p_studio_id and borrado_en is null loop
      perform public.anonimizar_socio(p_studio_id, v_socio.id);
    end loop;

    update public.instructores
       set nombre = 'Instructora eliminada', email = null, telefono = null, auth_user_id = null,
           foto_url = null, avatar = null, bio = null, activo = false
     where studio_id = p_studio_id;
  end if;

  foreach v_tabla in array c_borrar loop
    if p_ejecutar then
      execute format('delete from public.%I where studio_id = $1', v_tabla) using p_studio_id;
      get diagnostics v_n = row_count;
    else
      execute format('select count(*) from public.%I where studio_id = $1', v_tabla) into v_n using p_studio_id;
    end if;
    v_borrar := v_borrar || jsonb_build_object(v_tabla, v_n);
  end loop;

  -- La fila se queda (la clase, la cita, quién cubrió a quién); el texto, no.
  foreach v_col slice 1 in array c_vaciar loop
    if p_ejecutar then
      execute format('update public.%I set %I = %s where studio_id = $1 and %I is distinct from %s',
                     v_col[1], v_col[2], v_col[3], v_col[2], v_col[3]) using p_studio_id;
      get diagnostics v_n = row_count;
    else
      execute format('select count(*) from public.%I where studio_id = $1 and %I is distinct from %s',
                     v_col[1], v_col[2], v_col[3]) into v_n using p_studio_id;
    end if;
    v_vaciar := v_vaciar || jsonb_build_object(v_col[1] || '.' || v_col[2], v_n);
  end loop;

  -- Enlaces de la instructora: centinela y no DELETE (ver cabecera de la migración).
  select count(*) into v_n from public.instructor_enlaces_vigentes
   where studio_id = p_studio_id and token <> c_token_revocado;
  if p_ejecutar then
    insert into public.instructor_enlaces_vigentes (instructor_id, studio_id, scope, token)
    select i.id, i.studio_id, s.scope, c_token_revocado
      from public.instructores i
     cross join unnest(c_scopes_enlace) as s(scope)
     where i.studio_id = p_studio_id
    on conflict (instructor_id, scope) do update
       set token = excluded.token, email_enviado_en = null, actualizado_en = now();
  end if;
  v_vaciar := v_vaciar || jsonb_build_object('instructor_enlaces_vigentes.token', v_n);

  foreach v_tabla in array c_conservar loop
    execute format('select count(*) from public.%I where studio_id = $1', v_tabla) into v_n using p_studio_id;
    v_conservar := v_conservar || jsonb_build_object(v_tabla, v_n);
  end loop;

  return jsonb_build_object(
    'modo', case when p_ejecutar then 'activa' else 'informe' end,
    'socios_a_anonimizar', v_n_socias,
    'instructoras_a_anonimizar', v_n_instr,
    'anonimizar_socio_disponible', v_anonimizar,
    'borrar', v_borrar,
    'vaciar', v_vaciar,
    'conservar', v_conservar
  );
end;
$$;

revoke execute on function public.purgar_estudio_vencido(text, boolean) from public;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from anon;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from authenticated;
grant  execute on function public.purgar_estudio_vencido(text, boolean) to service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.purgar_estudio_vencido(text, boolean)'::regprocedure);
  v_rol text;
  v_fn  text;
  v_tab text;
begin
  if has_function_privilege('anon', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'purgar_estudio_vencido sigue siendo ejecutable por anon/authenticated';
  end if;
  if position('''api_eventos''' in v_def) = 0 or position('''api_webhooks''' in v_def) = 0
     or position('''api_webhook_entregas''' in v_def) = 0 or position('''api_claves''' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido no borra los eventos y webhooks del estudio';
  end if;
  foreach v_rol in array array['anon', 'authenticated'] loop
    foreach v_fn in array array[
      'public.api_registrar_evento()', 'public.api_eventos_olvidar_clienta()', 'public.api_eventos_reclamar(integer)',
      'public.api_eventos_guardar(jsonb)', 'public.api_webhooks_reclamar_entregas(integer)'
    ] loop
      if has_function_privilege(v_rol, v_fn, 'EXECUTE') then
        raise exception '% puede ejecutar %', v_rol, v_fn;
      end if;
    end loop;
    foreach v_tab in array array[pg_get_serial_sequence('public.api_eventos', 'seq'), 'public.api_eventos_publicacion_seq'] loop
      if has_sequence_privilege(v_rol, v_tab, 'USAGE') or has_sequence_privilege(v_rol, v_tab, 'UPDATE') then
        raise exception '% puede usar la secuencia %', v_rol, v_tab;
      end if;
    end loop;
    foreach v_tab in array array['public.api_eventos', 'public.api_webhooks', 'public.api_webhook_entregas'] loop
      if has_table_privilege(v_rol, v_tab, 'SELECT') or has_table_privilege(v_rol, v_tab, 'INSERT')
         or has_table_privilege(v_rol, v_tab, 'UPDATE') or has_table_privilege(v_rol, v_tab, 'DELETE') then
        raise exception '% tiene acceso a %', v_rol, v_tab;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role', 'public.api_eventos_guardar(jsonb)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar api_eventos_guardar';
  end if;
end $$;
