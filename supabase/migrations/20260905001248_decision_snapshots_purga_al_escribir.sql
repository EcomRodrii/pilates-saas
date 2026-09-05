-- Purga de la caché del Decision OS: lo que ya no vale se BORRA al escribir.
--
-- `decision_cache_snapshot` (20260904235039) marcaba `es_valido = false` en la
-- fila vigente e insertaba la nueva, y nada borraba nunca ni las invalidadas
-- ni las caducadas (`valido_hasta < now()`). Cada análisis del Decision OS
-- (uno por estudio y día desde el cron de lib/inngest/decision.ts, más los
-- MANUAL/REACTIVO) dejaba una fila más para siempre: la tabla crecía sin techo.
--
-- Medido en producción el 2026-09-05. La tabla estaba VACÍA (se aplicó a las
-- 23:50 UTC del día anterior y el cron corre a las 14:30), así que se insertó
-- un snapshot con las mismas tablas y ventanas que `construirSnapshot`
-- (lib/decision/snapshot.ts) dentro de una transacción con ROLLBACK y se leyó
-- `pg_column_size(snapshot_data)` sobre esta misma tabla:
--   · estudio más grande (20 socias, 173 reservas/180d, 103 sesiones/±90d):
--     95 kB en disco (547 kB como texto; TOAST comprime ~5,7×).
--   · una pasada completa de los 10 estudios: ~130 kB.
--   · ritmo real: ~6 análisis/día (172 en 30 días) → ~3,5 MB/mes hoy, y
--     lineal con socias y reservas — un estudio de 850 socias son ~40× eso.
--
-- Por qué aquí y no en un cron: Inngest va al ~84 % del plan free, y un job
-- de pg_cron sería un tercer sitio que vigilar para un DELETE de una línea. La
-- única escritura de esta tabla es esta RPC, así que la limpieza vive donde
-- se ensucia: al guardar el snapshot nuevo de un estudio se borra TODO lo
-- anterior de ESE estudio. La fila vigente queda superada por la que entra, y
-- las invalidadas y caducadas no las lee nadie (`decision_get_cached_snapshot`
-- exige `es_valido and valido_hasta > now()`). Techo resultante: una fila por
-- estudio que siga analizándose. Un estudio que deja de analizarse
-- (suspendido, flag DECISIONES apagado) conserva su última fila caducada —
-- acotado a UNA por estudio, no crece — y al borrar el estudio se va con él
-- por el `on delete cascade`.
--
-- Todo dentro de la transacción de la función: quien lea entre medias sigue
-- viendo la fila vieja hasta el commit, nunca un hueco sin snapshot.
--
-- `es_valido` se conserva tal cual: lo filtra la lectura y lo escribe
-- `invalidateSnapshot` (lib/decision/snapshot-cache.ts, hoy sin llamadores).
--
-- Misma firma `(text, jsonb)`: `create or replace` conserva los grants, pero
-- se comprueban igual con has_function_privilege (regla de
-- .claude/tentare-os.md §Seguridad — pg_default_acl de este proyecto da
-- EXECUTE directo a anon/authenticated en toda función nueva de public).

create or replace function public.decision_cache_snapshot(
  p_studio_id text,
  p_snapshot_data jsonb
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  -- Borra, no marca (ver cabecera). Va por la primera columna del índice
  -- idx_decision_snapshots_studio_valid.
  delete from public.decision_snapshots
  where studio_id = p_studio_id;

  insert into public.decision_snapshots (studio_id, snapshot_data)
  values (p_studio_id, p_snapshot_data)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.decision_cache_snapshot(text, jsonb) is
  'Guarda el snapshot del Decision OS de un estudio y borra todo lo anterior de ese estudio: una fila por estudio. Solo service-role (lib/decision/snapshot-cache.ts).';

-- Los grants sobreviven al create or replace con la misma firma; se dejan
-- explícitos y se comprueban de todos modos.
revoke execute on function public.decision_cache_snapshot(text, jsonb) from public, anon, authenticated;
grant execute on function public.decision_cache_snapshot(text, jsonb) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.decision_cache_snapshot(text, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.decision_cache_snapshot(text, jsonb)', 'EXECUTE') then
    raise exception 'decision_cache_snapshot sigue siendo ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.decision_cache_snapshot(text, jsonb)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar decision_cache_snapshot';
  end if;
end $$;

-- Limpieza única de lo acumulado hasta ahora. A 2026-09-05 la tabla estaba
-- vacía en producción; queda por si esta migración corre en un entorno con
-- historial. Idempotente.
delete from public.decision_snapshots
where es_valido = false
   or valido_hasta <= now();
