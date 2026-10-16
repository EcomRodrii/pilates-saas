-- ═══════════════════════════════════════════════════════════════════════════
-- El plan gratis medido EN SECO en el informe diario de bajas (bajas, PR-3 y
-- PR-4 en modo informe).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Una columna nueva en `estudio_situacion_diaria` (migr 20261016123000): `gratis`,
-- lo que el cron horario mide de cada estudio gratis ese día con la MISMA medición
-- del gate (lib/retencion/gratis-en-seco-servidor.ts):
--
--   · lo medido y la fase en que estaría con la regla de hoy, desde cuándo y si
--     coincide con lo que tiene hoy `uso_plan_gratis`;
--   · el grupo de la dueña con la regla de hoy y con la propuesta (sin los
--     eliminados, sin los suspendidos por abandono y sin demos), y si difieren;
--   · lo que no se pudo leer (`ambiguo`), sin inventar nada.
--
-- La escribe el servidor, una vez por estudio y día (solo si está vacía), y solo
-- con BAJAS_AUTOMATICAS=informe. Nada la lee para decidir: el gate sigue
-- leyendo `uso_plan_gratis`, que esto NO toca, igual que `studios`.
--
-- Sin funciones nuevas. La tabla sigue como estaba: RLS, `exige_doble_factor` y
-- nada para `anon`/`authenticated` (una columna nueva hereda los privilegios de
-- la tabla; se comprueba abajo).
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

alter table public.estudio_situacion_diaria
  add column if not exists gratis jsonb
    constraint estudio_situacion_diaria_gratis_objeto check (gratis is null or jsonb_typeof(gratis) = 'object');

comment on column public.estudio_situacion_diaria.gratis is
  'Plan gratis medido en seco ese día (lo medido, la fase con la regla de hoy y con el grupo propuesto, y si coincide con uso_plan_gratis). Solo informe: nada lo lee para decidir.';

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if has_column_privilege('anon', 'public.estudio_situacion_diaria', 'gratis', 'SELECT')
     or has_column_privilege('authenticated', 'public.estudio_situacion_diaria', 'gratis', 'SELECT')
     or has_column_privilege('authenticated', 'public.estudio_situacion_diaria', 'gratis', 'UPDATE')
     or has_column_privilege('authenticated', 'public.estudio_situacion_diaria', 'gratis', 'INSERT') then
    raise exception 'estudio_situacion_diaria.gratis: solo la lee y la escribe el servidor';
  end if;
  if not has_column_privilege('service_role', 'public.estudio_situacion_diaria', 'gratis', 'UPDATE') then
    raise exception 'estudio_situacion_diaria.gratis: el servidor tiene que poder escribirla';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.estudio_situacion_diaria'::regclass and relrowsecurity)
     or not exists (select 1 from pg_policy where polrelid = 'public.estudio_situacion_diaria'::regclass
                     and polname = 'exige_doble_factor' and not polpermissive) then
    raise exception 'estudio_situacion_diaria: falta la RLS o la política exige_doble_factor';
  end if;
end $$;
