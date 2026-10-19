-- Rendimiento, tanda 2: cuatro jobs de pg_cron llamaban a Vercel en cada tic
-- aunque no hubiera nada que hacer (≈290 invocaciones al día de la cuota
-- compartida), y la guarda de `lista-espera-ofertas-expirar` evaluaba una función
-- cara (`sesiones_con_plazas_liberadas`) en CADA tic de */5 solo para decidir si
-- llamar.
--
-- Mismo patrón que `api-webhooks` y los cinco de 20261005221020: el `where` va
-- ANTES del POST. NO cambian ni el nombre, ni la cadencia, ni el timeout, ni la
-- ruta: solo cuándo se llama. Cada guarda vive en una función (probada contra
-- Postgres real en supabase/tests/cron-guardas-de-trabajo.test.ts) y el job solo
-- la llama.
--
-- ⚠️ Cada guarda es IGUAL o MÁS AMPLIA que la consulta con la que arranca su
-- ruta, nunca más estrecha (una más estrecha dejaría un aviso sin salir en
-- silencio). Los márgenes de 1 minuto cubren el hueco entre que Postgres decide
-- y la ruta lee. Si cambia la consulta de la ruta, cambia aquí también:
--   · notif-recordatorios            → lib/notificaciones/recordatorio-clase.ts (barrerRecordatoriosClase)
--   · checkin-automatico             → lib/checkin/marcar-asistidas-automatico.ts
--   · sustituciones-cerrar-vencidas  → lib/sustituciones/cerrar-vencidas.ts (+ ESTADOS_EN_JUEGO)
--   · zoom-sync                      → lib/zoom-sync.ts
--   · lista-espera-ofertas-expirar   → lib/lista-espera/expirar-ofertas.ts y plazas-liberadas.ts
--
-- Sin guarda a propósito (ya la tienen desde 20261005221020): reservas-pendientes-
-- expirar y notif-entregas-pendientes.
--
-- Los jobs se reprograman con cron.alter_job (solo `command`): conservan jobid,
-- nombre y cadencia, y repetir la migración deja lo mismo.

-- ── 1) Las guardas ──────────────────────────────────────────────────────────

-- `p_studio_id` (opcional) acota la guarda a un estudio: lo usa SOLO el test, para no
-- depender de lo que otros tests dejen en la base; el job la llama sin argumento.

-- Recordatorios: la ruta lee las reservas CONFIRMADAS con socia de las clases no
-- canceladas de estudios no suspendidos cuyo inicio cae entre «hoy + (corto − 15
-- min)» y «hoy + (largo + 30 min)», con la antelación de CADA estudio (tres
-- franjas contiguas: corto ±15 min, tardía, largo ±30 min).
create or replace function public.cron_hay_recordatorios_de_clase(p_studio_id text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.reservas r
      join public.sesiones s on s.id = r.sesion_id
      join public.studios st on st.id = s.studio_id
     where r.estado = 'CONFIRMADA'
       and r.socio_id is not null
       and not coalesce(s.cancelada, false)
       and st.suspendido_en is null
       and (p_studio_id is null or s.studio_id = p_studio_id)
       and s.inicio >= now() + make_interval(mins => st.recordatorio_corto_minutos - 16)
       and s.inicio <= now() + make_interval(mins => st.recordatorio_largo_horas * 60 + 31)
  );
$$;

-- Pasar lista automático: la ruta mira las clases no canceladas que terminaron en
-- las últimas 2 h y marca sus reservas CONFIRMADAS. Sin ninguna, no hay nada.
create or replace function public.cron_hay_checkin_automatico(p_studio_id text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.sesiones s
      join public.reservas r on r.sesion_id = s.id
     where r.estado = 'CONFIRMADA'
       and not coalesce(s.cancelada, false)
       and (p_studio_id is null or s.studio_id = p_studio_id)
       and s.fin > now() - interval '121 minutes'
       and s.fin <= now() + interval '1 minute'
  );
$$;

-- Sustituciones vencidas: las que siguen en juego (ESTADOS_EN_JUEGO de
-- lib/sustituciones/contacto.ts) y cuya clase ya empezó.
create or replace function public.cron_hay_sustituciones_vencidas(p_studio_id text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.sustituciones su
      join public.sesiones s on s.id = su.sesion_id
     where su.estado in ('buscando', 'pendiente_aprobacion', 'contactando', 'agotada')
       and (p_studio_id is null or s.studio_id = p_studio_id)
       and s.inicio <= now() + interval '1 minute'
  );
$$;

-- Zoom: la ruta recorre los estudios con Zoom conectado (pide su token y avisa a
-- Sentry si no lo hay, haya o no clases online). Sin ninguno, no hay nada. Se
-- queda en «estudio con Zoom» y NO en «con clases online» a propósito: así el
-- aviso de token caído sigue saliendo igual.
create or replace function public.cron_hay_zoom_sync(p_studio_id text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.studios
     where zoom_email is not null and (p_studio_id is null or id = p_studio_id)
  );
$$;

-- Lista de espera: (1) ofertas caducadas, barato; (2) plazas apartadas recién
-- liberadas, caro. La función cara exige por dentro una integración que aparta
-- plazas activa y alguien en lista de espera sin oferta viva: se comprueban
-- ANTES, con `case`, que sí garantiza el orden, y solo si ambas pasan se evalúa
-- ella. Mismo resultado que antes, sin pagar 100 ms por tic.
create or replace function public.cron_hay_trabajo_lista_espera(p_studio_id text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.reservas r
       where r.estado = 'LISTA_ESPERA'
         and (p_studio_id is null or r.studio_id = p_studio_id)
         and r.oferta_expira_en is not null
         and r.oferta_expira_en <= now()
    ) then true
    when not exists (
      select 1 from public.integraciones i
       where i.activo and i.tipo = any (public.plataformas_que_apartan())
         and (p_studio_id is null or i.studio_id = p_studio_id)
    ) then false
    when not exists (
      select 1 from public.reservas r
       where r.estado = 'LISTA_ESPERA'
         and (p_studio_id is null or r.studio_id = p_studio_id)
         and (r.oferta_expira_en is null or r.oferta_expira_en <= now())
    ) then false
    else exists (
      select 1 from public.sesiones_con_plazas_liberadas(interval '15 minutes') x
       where p_studio_id is null or x.studio_id = p_studio_id
    )
  end;
$$;

-- Solo el servidor (y el cron, que corre como su dueño): ni PUBLIC, ni anon, ni
-- authenticated. `pg_default_acl` da EXECUTE directo a anon/authenticated, así que
-- revocar PUBLIC no basta.
do $$
declare f text;
begin
  foreach f in array array[
    'public.cron_hay_recordatorios_de_clase(text)',
    'public.cron_hay_checkin_automatico(text)',
    'public.cron_hay_sustituciones_vencidas(text)',
    'public.cron_hay_zoom_sync(text)',
    'public.cron_hay_trabajo_lista_espera(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ── 2) Los jobs llaman solo si la guarda lo dice ────────────────────────────

do $$
declare
  j record;
  v_cmd text;
begin
  for j in
    select * from (values
      ('notif-recordatorios',           'notif-recordatorios',           30000, 'public.cron_hay_recordatorios_de_clase()'),
      ('checkin-automatico',            'checkin-automatico',            30000, 'public.cron_hay_checkin_automatico()'),
      ('sustituciones-cerrar-vencidas', 'sustituciones-cerrar-vencidas', 30000, 'public.cron_hay_sustituciones_vencidas()'),
      ('zoom-sync',                     'zoom-sync',                     45000, 'public.cron_hay_zoom_sync()'),
      ('lista-espera-ofertas-expirar',  'lista-espera-ofertas-expirar',  30000, 'public.cron_hay_trabajo_lista_espera()')
    ) as t(jobname, ruta, timeout_ms, guarda)
  loop
    v_cmd := format($c$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/%s',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := %s
  )
  where %s;
  $c$, j.ruta, j.timeout_ms, j.guarda);
    perform cron.alter_job(jobid, command := v_cmd) from cron.job where jobname = j.jobname;
  end loop;
end $$;

-- ── 3) Comprobación de permisos (nunca fiarse del comentario) ───────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.cron_hay_recordatorios_de_clase(text)',
    'public.cron_hay_checkin_automatico(text)',
    'public.cron_hay_sustituciones_vencidas(text)',
    'public.cron_hay_zoom_sync(text)',
    'public.cron_hay_trabajo_lista_espera(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') then
      raise exception 'permisos de % mal: solo service_role', f;
    end if;
  end loop;
end $$;
