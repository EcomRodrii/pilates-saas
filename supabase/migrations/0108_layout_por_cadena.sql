-- Menú por cadena: la configuración de menú/home deja de ser POR SEDE y pasa a
-- ser POR CADENA. Antes, studio_layout tenía una fila por estudio y getLayout()
-- la leía por la SEDE ACTIVA; en una cadena multi-sede cada sede podía tener
-- distinto `ocultos`, así que el menú cambiaba al cambiar de sede sin que la
-- dueña supiera por qué (el editor incluso decía "se aplica a todo el estudio",
-- que una dueña de cadena lee como "toda la cadena"). Ahora una cadena tiene UN
-- solo menú, consistente en todas sus sedes.
--
-- Modelo: el layout de una cadena vive en cadenas.layout_config, con la misma
-- forma que studio_layout.config ({ orden, ocultos, menuPosition, home }). Un
-- estudio sin cadena (cadena_id null) sigue usando studio_layout, sin cambios.
-- La capa de datos (lib/layout-data.ts) resuelve el alcance: cadena_id ?? id.
--
-- Por qué en `cadenas` y no re-clavando studio_layout: studio_layout.studio_id
-- tiene FK a studios(id) —un cadena_id no cabe ahí— y así el camino del estudio
-- suelto (la inmensa mayoría) queda intacto, sin riesgo de regresión. `cadenas`
-- ya es la única fuente de verdad de lo que es común a la cadena (el billing).

alter table public.cadenas add column if not exists layout_config jsonb;

-- ── Consolidación de las cadenas ya existentes ──────────────────────────────
-- Cada cadena hereda un único menú a partir de los de sus sedes. Regla para
-- `ocultos`: INTERSECCIÓN entre TODAS las sedes — un módulo queda oculto en la
-- cadena solo si estaba oculto en cada una. Las sedes sin fila cuentan como
-- "nada oculto", así que basta con que UNA sede lo mostrara para que siga
-- visible: ningún módulo visible en alguna sede desaparece al unificar (que era
-- justo la queja). El resto de campos (orden, menuPosition, home) se toman de la
-- sede modificada más recientemente, como intención más actual de la cadena.
with sede_ocultos as (
  select s.cadena_id,
         -- Solo tratamos `ocultos` como lista si de verdad es un array JSON;
         -- cualquier fila legacy/manual con otra forma cuenta como "nada oculto"
         -- en vez de reventar jsonb_array_elements_text más abajo.
         case when jsonb_typeof(sl.config->'ocultos') = 'array'
              then sl.config->'ocultos'
              else '[]'::jsonb
         end as ocultos
  from public.studios s
  left join public.studio_layout sl on sl.studio_id = s.id
  where s.cadena_id is not null
),
n as (
  select cadena_id, count(*)::int as n_sedes
  from sede_ocultos
  group by cadena_id
),
href_counts as (
  select so.cadena_id, e.href, count(*)::int as veces
  from sede_ocultos so
  cross join lateral jsonb_array_elements_text(so.ocultos) as e(href)
  group by so.cadena_id, e.href
),
ocultos_comunes as (
  select hc.cadena_id, jsonb_agg(to_jsonb(hc.href) order by hc.href) as ocultos
  from href_counts hc
  join n using (cadena_id)
  where hc.veces = n.n_sedes
  group by hc.cadena_id
),
base as (
  select distinct on (s.cadena_id) s.cadena_id, sl.config
  from public.studios s
  join public.studio_layout sl on sl.studio_id = s.id
  where s.cadena_id is not null
  order by s.cadena_id, sl.actualizado_en desc nulls last, s.id
)
update public.cadenas c
set layout_config = jsonb_set(
  coalesce(b.config, '{}'::jsonb),
  '{ocultos}',
  coalesce(oc.ocultos, '[]'::jsonb),
  true
)
from base b
left join ocultos_comunes oc using (cadena_id)
where c.id = b.cadena_id
  -- Idempotente: solo consolida cadenas que aún no tienen layout propio. Si esta
  -- migración se re-aplicara después de que una dueña ya haya editado el menú de
  -- su cadena (que ya se guarda en cadenas.layout_config), NO se repisa su
  -- trabajo con una recomputación desde las filas de studio_layout ya obsoletas.
  and c.layout_config is null;

-- Nota: las filas de studio_layout de las sedes encadenadas quedan huérfanas
-- (getLayout ya no las lee para una sede con cadena) pero se conservan a
-- propósito: son diminutas, no guardan datos sensibles y desvincular una sede
-- de su cadena no es hoy un flujo soportado. No se borran para no destruir la
-- configuración previa de forma irreversible.
