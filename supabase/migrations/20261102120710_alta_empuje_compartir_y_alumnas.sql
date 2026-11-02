-- ═══════════════════════════════════════════════════════════════════════════
-- Dos recordatorios más para quien se para después de su primera clase
-- (31-oct-2026, tras mirar a los 23 estudios nuevos de octubre: seis crearon
-- clases y se quedaron ahí; dos compartieron el enlace y nadie reservó).
--
--   1. El embudo del alta gana dos MARCAS en su lista cerrada:
--        · correo_empuje_compartir   «Tu clase está lista: falta que lo sepan
--                                    tus alumnas» ya salió (UNA vez por estudio);
--        · correo_empuje_alumnas     «Ya compartiste tu enlace: las primeras
--                                    reservas» ya salió (UNA vez por estudio).
--      Como `correo_primera_clase`, son marcas de «esto ya se mandó» y no
--      medidas de cómo arranca un estudio (PASOS_DURABLES de lib/alta/embudo.ts).
--      Sin datos personales.
--
--   2. La guarda del job `altas-sin-terminar` (cron_hay_trabajo_altas) llama
--      también cuando hay un estudio del alta nueva en alguno de estos dos
--      casos (lib/alta/recordatorio-servidor.ts, `enviarCorreosEmpuje`):
--        · compartir: la clase ya es reservable desde hace 24 h-7 días y el
--          enlace no se ha compartido ni se le ha mandado el correo;
--        · alumnas: el enlace se compartió hace 48 h-10 días, el estudio no
--          tiene NINGUNA reserva y no se le ha mandado el correo.
--      NO cambian ni el job, ni su nombre, ni la cadencia, ni la ruta: solo
--      cuándo se llama. La firma de la función es la misma, así que
--      `create or replace` conserva el dueño; los permisos se reafirman igual.
--
-- ⚠️ La guarda es IGUAL o MÁS AMPLIA que lo que mira la ruta, nunca más
-- estrecha: la ruta además deja fuera demos y suspendidos, exige el correo de
-- su dueña y solo manda si ALTA_EMPUJE está en `on`. Con el interruptor
-- apagado el job llama de más (una petición por hora y nada más), no de menos.
-- Las dos primeras ramas son, tal cual, las de 20261021160000.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El embudo: dos marcas más en la lista cerrada ──────────────────────
-- La misma lista que `PASOS_EMBUDO` de lib/alta/embudo.ts (lo cruza
-- lib/alta/embudo.test.ts contra ESTE fichero).
alter table public.embudo_alta drop constraint if exists embudo_alta_paso_check;
alter table public.embudo_alta add constraint embudo_alta_paso_check
  check (paso in (
    'panel_abierto', 'clase_reservable', 'enlace_compartido',
    'config_completada', 'correo_cuenta_activa', 'plan_ensenado',
    'correo_recibir_reservas', 'recorrido_visto', 'correo_primera_clase',
    'correo_empuje_compartir', 'correo_empuje_alumnas'
  ));

-- ── 2. La guarda del job ──────────────────────────────────────────────────
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
  ) or exists (
    -- «Falta que lo sepan tus alumnas»: la clase es reservable desde hace entre
    -- 24 h y 7 días, no compartió el enlace y no se le ha mandado este correo.
    select 1
      from public.studios s
      join public.altas_estudio a on a.auth_user_id = s.owner_auth_user_id
     where a.version in ('v2', 'v2_prueba')
       and s.cadena_id is null
       and (p_studio_id is null or s.id = p_studio_id)
       and exists (
         select 1 from public.embudo_alta e
          where e.studio_id = s.id and e.paso = 'clase_reservable'
            and e.ocurrido_en <= now() - interval '24 hours' + interval '1 minute'
            and e.ocurrido_en > now() - interval '7 days' - interval '1 minute'
       )
       and not exists (
         select 1 from public.embudo_alta e
          where e.studio_id = s.id and e.paso in ('enlace_compartido', 'correo_empuje_compartir')
       )
  ) or exists (
    -- «Ya compartiste tu enlace»: compartió hace entre 48 h y 10 días, el
    -- estudio no tiene ninguna reserva y no se le ha mandado este correo.
    select 1
      from public.studios s
      join public.altas_estudio a on a.auth_user_id = s.owner_auth_user_id
     where a.version in ('v2', 'v2_prueba')
       and s.cadena_id is null
       and (p_studio_id is null or s.id = p_studio_id)
       and exists (
         select 1 from public.embudo_alta e
          where e.studio_id = s.id and e.paso = 'enlace_compartido'
            and e.ocurrido_en <= now() - interval '48 hours' + interval '1 minute'
            and e.ocurrido_en > now() - interval '10 days' - interval '1 minute'
       )
       and not exists (
         select 1 from public.embudo_alta e
          where e.studio_id = s.id and e.paso = 'correo_empuje_alumnas'
       )
       and not exists (select 1 from public.reservas r where r.studio_id = s.id)
  );
$$;

-- Solo el servidor (y el cron, que corre como su dueño): ni PUBLIC, ni anon, ni
-- authenticated. `pg_default_acl` da EXECUTE directo a anon/authenticated, así
-- que revocar PUBLIC no basta.
revoke execute on function public.cron_hay_trabajo_altas(text) from public;
revoke execute on function public.cron_hay_trabajo_altas(text) from anon;
revoke execute on function public.cron_hay_trabajo_altas(text) from authenticated;
grant execute on function public.cron_hay_trabajo_altas(text) to service_role;

-- ── 3. Comprobación de permisos (nunca fiarse del comentario) ─────────────
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
