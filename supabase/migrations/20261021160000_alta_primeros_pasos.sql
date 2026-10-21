-- ═══════════════════════════════════════════════════════════════════════════
-- «Pon en marcha tu estudio» y el correo de la primera clase (PR-5 del alta
-- nueva, maqueta aprobada del 21-oct-2026). Dos cosas:
--
--   1. El embudo del alta gana dos pasos en su lista cerrada:
--        · recorrido_visto        el recorrido rápido de tres paradas ya salió
--                                 (no vuelve a salir solo, en ningún navegador);
--        · correo_primera_clase   «Tu primera clase en Tentare, en 5 minutos»
--                                 ya salió (UNA vez por estudio).
--      Los dos, como `plan_ensenado`, son MARCAS de «esto ya se hizo» y no
--      medidas de cómo arranca un estudio: el servidor las apunta pase el día
--      que pase (PASOS_DURABLES de lib/alta/embudo.ts). Sin datos personales.
--
--   2. El job `altas-sin-terminar` (cada hora, al minuto 23) llama a Vercel
--      también cuando hay un estudio del alta nueva de entre 24 y 72 h sin
--      clase que una alumna nueva pueda reservar y sin ese correo
--      (lib/alta/recordatorio-servidor.ts, `enviarCorreosPrimeraClase`). La
--      guarda pasa a una función (`cron_hay_trabajo_altas`), como las de
--      20261020110000, probada contra Postgres real en
--      supabase/tests/alta-primeros-pasos.test.ts. NO cambian ni el nombre, ni
--      la cadencia, ni el timeout, ni la ruta: solo cuándo se llama.
--
-- ⚠️ La guarda es IGUAL o MÁS AMPLIA que lo que mira la ruta, nunca más
-- estrecha: la ruta además deja fuera las demos y los estudios suspendidos, y
-- pregunta si una alumna nueva ya puede reservar (si puede, apunta el hito
-- `clase_reservable` y la guarda deja de llamar por ese estudio). La parte de
-- las altas a medias es, tal cual, la de 20261001195953 (la condición de
-- `altas_estudio_detalle(true)`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El embudo: dos pasos más en la lista cerrada ───────────────────────
-- La misma lista que `PASOS_EMBUDO` de lib/alta/embudo.ts (lo cruza
-- lib/alta/embudo.test.ts contra ESTE fichero).
alter table public.embudo_alta drop constraint if exists embudo_alta_paso_check;
alter table public.embudo_alta add constraint embudo_alta_paso_check
  check (paso in (
    'panel_abierto', 'clase_reservable', 'enlace_compartido',
    'config_completada', 'correo_cuenta_activa', 'plan_ensenado',
    'correo_recibir_reservas', 'recorrido_visto', 'correo_primera_clase'
  ));

-- ── 2. La guarda del job ──────────────────────────────────────────────────
-- `p_studio_id` (opcional) la acota a un estudio (y, en la parte de las altas a
-- medias, a la cuenta de su dueña): lo usa SOLO el test, para no depender de lo
-- que otros tests dejen en la base; el job la llama sin argumento.
create or replace function public.cron_hay_trabajo_altas(p_studio_id text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    -- Altas a medias de hace más de 24 h, sin recordatorio todavía.
    select 1 from public.altas_estudio a
     where a.recordatorio_enviado_en is null
       and a.recordatorio_reclamado_en is null
       and a.recordatorio_descartado is null
       and a.iniciada_en <= now() - interval '24 hours'
       and (a.origen = 'registro' or a.plan_en is not null or a.error_estudio_en is not null)
       and (p_studio_id is null
            or a.auth_user_id = (select s.owner_auth_user_id from public.studios s where s.id = p_studio_id))
  ) or exists (
    -- Estudios del alta nueva de entre 24 y 72 h, sin clase reservable ni el
    -- correo de la primera clase. Un minuto de margen por cada lado: el hueco
    -- entre que Postgres decide y la ruta lee.
    select 1
      from public.studios s
      join public.altas_estudio a on a.auth_user_id = s.owner_auth_user_id
     where a.version in ('v2', 'v2_prueba')
       and s.cadena_id is null
       and s.creado_en <= now() - interval '24 hours' + interval '1 minute'
       and s.creado_en > now() - interval '72 hours' - interval '1 minute'
       and (p_studio_id is null or s.id = p_studio_id)
       and not exists (
         select 1 from public.embudo_alta e
          where e.studio_id = s.id
            and e.paso in ('clase_reservable', 'correo_primera_clase')
       )
  );
$$;

-- Solo el servidor (y el cron, que corre como su dueño): ni PUBLIC, ni anon, ni
-- authenticated. `pg_default_acl` da EXECUTE directo a anon/authenticated, así
-- que revocar PUBLIC no basta.
revoke execute on function public.cron_hay_trabajo_altas(text) from public;
revoke execute on function public.cron_hay_trabajo_altas(text) from anon;
revoke execute on function public.cron_hay_trabajo_altas(text) from authenticated;
grant execute on function public.cron_hay_trabajo_altas(text) to service_role;

-- ── 3. El job llama solo si la guarda lo dice ─────────────────────────────
-- Con cron.alter_job (solo `command`): conserva jobid, nombre y cadencia, y
-- repetir la migración deja lo mismo. Si el job no está, o su comando no queda
-- como se pretendía, la migración aborta.
do $$
declare
  v_cmd text := $c$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/altas-sin-terminar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where public.cron_hay_trabajo_altas();
  $c$;
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'altas-sin-terminar';
  if v_id is null then
    raise exception 'el job altas-sin-terminar no existe: no se puede ponerle la guarda nueva';
  end if;
  perform cron.alter_job(v_id, command := v_cmd);
  if not exists (select 1 from cron.job where jobid = v_id and command = v_cmd) then
    raise exception 'el job altas-sin-terminar no quedó reprogramado';
  end if;
end $$;

-- ── 4. Comprobación de permisos (nunca fiarse del comentario) ─────────────
do $$
begin
  if has_function_privilege('anon', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') then
    raise exception 'cron_hay_trabajo_altas: anon no debería poder ejecutarla';
  end if;
  if has_function_privilege('authenticated', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') then
    raise exception 'cron_hay_trabajo_altas: authenticated no debería poder ejecutarla';
  end if;
  if not has_function_privilege('service_role', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') then
    raise exception 'cron_hay_trabajo_altas: service_role tiene que poder ejecutarla';
  end if;
end $$;
