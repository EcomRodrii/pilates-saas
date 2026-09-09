-- Migración Mágica · preflight del DESHACER.
--
-- El deshacer promete —tres veces en pantalla— «se borra exactamente lo que
-- creó esta importación, y nada más». Era falso: 39 tablas cuelgan de `socios`
-- con ON DELETE CASCADE (recibos, member_credits, credit_transactions,
-- condiciones_salud, notas_progreso, documentos_socio, valoraciones_iniciales…)
-- y 4 de `sesiones`. Postgres las arrastraba EN SILENCIO, así que el guardarraíl
-- de deshacerBatch —que solo reacciona al 23503— nunca disparaba: únicamente lo
-- hace para las 7 FK que son NO ACTION. Resultado: deshacer una migración de
-- hace tres días borraba también las reservas, los recibos y la ficha clínica
-- que esas socias generaron DESPUÉS de migrar, y devolvía ok:true.
--
-- Medido en producción sobre una socia real cualquiera: 17 tablas hijas, 128
-- filas, entre ellas 12 recibos, 41 reservas, 9 suscripciones y 7 movimientos
-- de crédito. Por una sola socia.
--
-- Esta función cuenta las filas hijas que quedarían destruidas por la cascada.
-- Se llama justo ANTES de borrar cada entidad y, como ORDEN_DESHACER ya ha
-- borrado antes lo que el propio lote creó (citas, reservas, suscripciones…),
-- todo lo que siga colgando es por definición ajeno al lote. Verificado en prod:
-- ninguna de estas tablas se rellena por un trigger ON INSERT de las entidades
-- importadas, así que no hay falsas alarmas por efectos del propio import.
--
-- Se deriva de pg_constraint a propósito: una tabla hija nueva queda cubierta
-- sola, sin tener que acordarse de añadirla a una lista (que es exactamente el
-- fallo de «gemelos divergentes» que este repo repite).
create or replace function public.migracion_dependencias_bloqueantes(
  p_tabla text,
  p_ids text[]
) returns table (tabla_hija text, filas bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  n bigint;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  for r in
    select c.conrelid::regclass::text as hija, ah.attname::text as col
    from pg_constraint c
    join lateral unnest(c.conkey, c.confkey) with ordinality as u(ck, cfk, ord) on true
    join pg_attribute ah on ah.attrelid = c.conrelid and ah.attnum = u.ck
    join pg_attribute ap on ap.attrelid = c.confrelid and ap.attnum = u.cfk
    where c.contype = 'f'
      and c.confrelid = p_tabla::regclass
      and c.confdeltype = 'c'   -- solo CASCADE: es la que destruye en silencio
      and ap.attname = 'id'
  loop
    execute format('select count(*) from public.%I where %I = any($1)', r.hija, r.col)
      into n using p_ids;
    if n > 0 then
      tabla_hija := r.hija;
      filas := n;
      return next;
    end if;
  end loop;
end;
$fn$;

-- Solo la service-role (el deshacer corre con ella). Un SECURITY DEFINER que
-- acepta un nombre de tabla NO puede quedar accesible a anon/authenticated:
-- este repo ya ha olvidado este REVOKE varias veces.
revoke all on function public.migracion_dependencias_bloqueantes(text, text[]) from public, anon, authenticated;
grant execute on function public.migracion_dependencias_bloqueantes(text, text[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- v2 (misma sesión, tras la revisión independiente). La v1 de arriba era
-- correcta en la intención y ROTA en la práctica: bloqueaba el deshacer PARA
-- SIEMPRE. Se deja el histórico visible a propósito — el fallo es instructivo.
--
-- 1. RASTRO DEL SISTEMA. `recordatorio_envios` cuelga de `sesiones` y de
--    `socios` con CASCADE, y el cron de recordatorios escribe ahí por cada
--    aviso enviado; `comunicaciones_socio` registra cualquier email o WhatsApp.
--    A las pocas horas de migrar, TODO lote tendría "datos posteriores" y el
--    deshacer moriría con un mensaje incomprensible. Un guardarraíl que nunca
--    deja pasar es tan inútil como el que nunca frena.
--
-- 2. LO QUE CREÓ EL PROPIO LOTE. La v1 se apoyaba en que ORDEN_DESHACER borra
--    los hijos antes que los padres. Cierto salvo si `registrarIdsBatch` falló
--    para una entidad y no para otra (justo el caso que `batchAviso` ya avisa):
--    entonces las reservas del propio lote se veían como ajenas y bloqueaban.
--
-- Verificado en prod sobre una socia real: 17 tablas hijas sin filtros → 14
-- ignorando el rastro; `reservas` 41 → 0 al excluir los ids del lote; control
-- negativo (id inexistente) → 0 filas; `anon` sin EXECUTE, `service_role` con
-- él; y una sola firma viva tras el DROP.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.migracion_dependencias_bloqueantes(
  p_tabla text,
  p_ids text[],
  p_ignorar text[] default '{}',
  p_excluir jsonb default '{}'::jsonb
) returns table (tabla_hija text, filas bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  n bigint;
  excluidos text[];
  tiene_id boolean;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  for r in
    select distinct c.conrelid::regclass::text as hija, ah.attname::text as col
    from pg_constraint c
    join lateral unnest(c.conkey, c.confkey) with ordinality as u(ck, cfk, ord) on true
    join pg_attribute ah on ah.attrelid = c.conrelid and ah.attnum = u.ck
    join pg_attribute ap on ap.attrelid = c.confrelid and ap.attnum = u.cfk
    where c.contype = 'f'
      and c.confrelid = p_tabla::regclass
      and c.confdeltype = 'c'
      and ap.attname = 'id'
  loop
    if r.hija = any(coalesce(p_ignorar, '{}')) then
      continue;
    end if;

    excluidos := coalesce(
      array(select jsonb_array_elements_text(coalesce(p_excluir -> r.hija, '[]'::jsonb))),
      '{}'::text[]);

    select exists (
      select 1 from pg_attribute
      where attrelid = format('public.%I', r.hija)::regclass
        and attname = 'id' and attnum > 0 and not attisdropped
    ) into tiene_id;

    if tiene_id and array_length(excluidos, 1) is not null then
      execute format(
        'select count(*) from public.%I where %I = any($1) and not (id = any($2))',
        r.hija, r.col)
        into n using p_ids, excluidos;
    else
      execute format('select count(*) from public.%I where %I = any($1)', r.hija, r.col)
        into n using p_ids;
    end if;

    if n > 0 then
      tabla_hija := r.hija;
      filas := n;
      return next;
    end if;
  end loop;
end;
$fn$;

revoke all on function public.migracion_dependencias_bloqueantes(text, text[], text[], jsonb) from public, anon, authenticated;
grant execute on function public.migracion_dependencias_bloqueantes(text, text[], text[], jsonb) to service_role;

-- La firma de 2 argumentos se retira: dos versiones vivas del mismo guardarraíl
-- acabarían divergiendo (el fallo que este repo repite), y una firma nueva
-- hereda el grant por defecto a `public`.
drop function if exists public.migracion_dependencias_bloqueantes(text, text[]);
