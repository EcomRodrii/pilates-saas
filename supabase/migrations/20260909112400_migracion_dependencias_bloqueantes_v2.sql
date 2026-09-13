-- Recuperada del catálogo de producción (supabase_migrations.schema_migrations,
-- versión 20260909112400, nombre migracion_dependencias_bloqueantes_v2) el
-- 14 sep 2026: estaba aplicada en la BD y NO existía como fichero en ninguna
-- rama del repo (`git log --all -S` vacío). Por eso «Deriva de migraciones»
-- estaba en rojo en main desde el 9 sep. NO se ha vuelto a aplicar. Debajo de
-- la línea, el contenido íntegro y literal de `statements`, sin retoques.
--
-- Cotejado ese mismo día contra la BD viva:
--   * Ninguna migración posterior la sustituye: en el catálogo solo la nombran
--     la v1 (20260909072800) y esta.
--   * Queda UNA sola firma, (text, text[], text[], jsonb), y el cuerpo de
--     `pg_get_functiondef` coincide carácter a carácter con el de abajo.
--   * has_function_privilege: anon NO, authenticated NO, service_role SÍ.
--
-- ⚠️ El fichero de la v1 en el repo NO es lo que se aplicó como v1: se editó
-- después y lleva esta v2 pegada al final (sin dos comentarios del cuerpo, y
-- sin cuatro líneas de la cabecera de la v1). Da igual al reconstruir desde
-- cero en orden: esta corre después y todo es idempotente (create or replace,
-- revoke/grant, drop if exists), así que la definición final es la de abajo.
-- ─────────────────────────────────────────────────────────────────────────────
-- v2 del preflight del deshacer. La v1 (20260909072800) era correcta en la
-- intención y ROTA en la práctica: bloqueaba el deshacer para siempre.
--
-- Dos agujeros que encontró la revisión independiente:
--
-- 1. RASTRO DEL SISTEMA. `recordatorio_envios` cuelga de `sesiones` y de
--    `socios` con CASCADE, y el cron de recordatorios escribe ahí por cada
--    WhatsApp enviado; `comunicaciones_socio` registra cualquier email. O sea
--    que a las pocas horas de migrar, TODO lote tendría "datos posteriores" y
--    el deshacer moriría con un mensaje incomprensible. Esas tablas son rastro
--    que genera el propio producto, no algo que hiciera la socia: no deben
--    impedir deshacer una migración recién hecha.
--
-- 2. LO QUE CREÓ EL PROPIO LOTE. La v1 se apoyaba en que ORDEN_DESHACER borra
--    los hijos antes que los padres. Cierto salvo si `registrarIdsBatch` falló
--    para una entidad y no para otra (el caso que `batchAviso` ya contempla):
--    entonces las reservas del propio lote se veían como ajenas y bloqueaban.
--    Ahora se pasan explícitamente los ids del lote para descontarlos.
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
      and c.confdeltype = 'c'   -- solo CASCADE: es la que destruye en silencio
      and ap.attname = 'id'
  loop
    -- Rastro del sistema: se borrará con la cascada y no pasa nada.
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

-- La firma de 2 argumentos de la v1 se retira: dejarla viva sería tener dos
-- versiones del mismo guardarraíl divergiendo (el fallo que este repo repite),
-- y además `anon` heredaría el grant por defecto de una firma nueva.
drop function if exists public.migracion_dependencias_bloqueantes(text, text[]);
