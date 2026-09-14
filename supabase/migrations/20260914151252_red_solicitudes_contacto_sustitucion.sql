-- Tentare Network — la solicitud de contacto recuerda QUÉ clase quería cubrir.
--
-- Con una sustitución agotada, la propietaria pide a una profesional de Network
-- que la cubra (#1979). Hasta ahora la solicitud no guardaba para qué clase era,
-- así que la tarjeta de la sustitución no podía distinguir «le pediste ESTA
-- clase y dijo que no» de «hace meses no aceptó un contacto desde el buscador».
--
-- Nullable a propósito: las solicitudes del buscador y de la ficha no van
-- ligadas a ninguna clase, y las anteriores a esta migración tampoco.
-- `on delete set null`: borrar la sustitución no puede llevarse por delante el
-- contacto (ni el chat ni la formalización, que cuelgan de la solicitud).
--
-- Sin políticas ni grants nuevos, revisado a propósito:
--  · SELECT de la profesional (red_solicitudes_contacto_select): puede leer su
--    propia fila entera por PostgREST, y con ella este id. Es un id opaco
--    (`sust-<uid>`): la tabla `sustituciones` solo la leen PROPIETARIO/MANAGER/
--    RECEPCION de su estudio (20260914075602), así que no le da ni la clase ni
--    el motivo. Lo que sabe de la clase sigue siendo lo que dice el mensaje:
--    tipo, día y hora. La API de la profesional (GET /api/network/contacto)
--    selecciona columnas explícitas y no lo devuelve.
--  · UPDATE de la profesional (red_solicitudes_contacto_update_propio): la
--    policy es por fila, así que técnicamente podría reescribir este campo en
--    SU solicitud. Solo cambia un texto de SU fila en la tarjeta del estudio
--    («No puede cubrirla» frente a «Pedir que la cubra»); nunca decide una
--    asignación — asignar exige ficha activa en el estudio (candidataDelEstudio
--    + confirmar_sustitucion). No compensa reescribir los grants de columna de
--    una tabla con escritura viva por esto.
--  · El servidor lo valida al escribir (POST /api/network/contacto): la
--    sustitución tiene que ser del estudio de la sesión y seguir abierta.

alter table public.red_solicitudes_contacto
  add column if not exists sustitucion_id text
    references public.sustituciones(id) on delete set null;

create index if not exists idx_red_solicitudes_contacto_sustitucion
  on public.red_solicitudes_contacto (sustitucion_id)
  where sustitucion_id is not null;

comment on column public.red_solicitudes_contacto.sustitucion_id is
  'Sustitución que el estudio quería cubrir al pedir el contacto (null = buscador/ficha). Solo informativo para la tarjeta de Sustituciones; nunca autoriza una asignación.';

-- Comprobaciones tras aplicar (sin funciones nuevas, no hay has_function_privilege):
--   select column_name, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'red_solicitudes_contacto'
--      and column_name = 'sustitucion_id';                       -- 1 fila, YES
--   select confdeltype from pg_constraint
--    where conrelid = 'public.red_solicitudes_contacto'::regclass
--      and contype = 'f' and conkey = array[(select attnum from pg_attribute
--        where attrelid = 'public.red_solicitudes_contacto'::regclass
--          and attname = 'sustitucion_id')];                     -- 'n' (set null)
--   select polname from pg_policy
--    where polrelid = 'public.red_solicitudes_contacto'::regclass; -- las 3 de siempre
