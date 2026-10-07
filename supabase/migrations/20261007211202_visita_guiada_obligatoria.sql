-- La visita guiada por capítulos, obligatoria para los estudios NUEVOS
-- (decisión del fundador, 7-oct-2026): al crearse el estudio, el propio software
-- recorre con la propietaria TODO el producto, capítulo a capítulo, y no se puede
-- omitir (sin X ni «saltar»; sí se puede parar al acabar un capítulo y seguir otro día).
--
-- Tres columnas en `studios`, mismo patrón que `bienvenida_vista_en`:
--   · tour_obligatorio    — a quién se le impone. Nace false en TODAS las filas
--                           existentes: ningún estudio actual se entera. Solo la
--                           pone a true el trigger de abajo, al nacer el estudio.
--   · tour_progreso       — por dónde va (capítulo, paso, pasos hechos y aplazados).
--   · tour_completado_en  — cuándo lo terminó. NULL mientras le quede algo.
--
-- ⚠️ La obligación la fija un TRIGGER, nunca el cliente: `dbCreateStudio` hace un
-- INSERT directo con la sesión de la propietaria, así que un payload no puede
-- decidir si se le impone o no (mismo criterio que `trg_arrancar_prueba_gratuita`).
-- `tour_obligatorio` NO se concede a `authenticated`: la propietaria no puede
-- quitárselo. No es un límite de seguridad (es un tour de producto), pero no hay
-- motivo para que el cliente lo decida.
--
-- Fuera de la obligación, a propósito: las sedes de una cadena (nacen con
-- `cadena_id`), los estudios de demo y cualquier cuenta que no sea de estudio.

alter table public.studios
  add column if not exists tour_obligatorio boolean not null default false,
  add column if not exists tour_progreso jsonb not null default '{}'::jsonb,
  add column if not exists tour_completado_en timestamptz;

-- El progreso es pequeño (~1 KB). El tope evita que la columna sirva de cajón.
alter table public.studios
  add constraint studios_tour_progreso_forma
  check (jsonb_typeof(tour_progreso) = 'object' and octet_length(tour_progreso::text) <= 8192);

create or replace function public.marcar_tour_obligatorio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tour_obligatorio := new.cadena_id is null
    and not coalesce(new.es_demo, false)
    and coalesce(new.tipo_cuenta, 'ESTUDIO') = 'ESTUDIO';
  new.tour_progreso := '{}'::jsonb;
  new.tour_completado_en := null;
  return new;
end
$$;

-- Función de trigger: nadie la llama a mano. Los tres REVOKE explícitos (el
-- default_acl da EXECUTE directo a anon/authenticated, `from public` no basta).
revoke execute on function public.marcar_tour_obligatorio() from public;
revoke execute on function public.marcar_tour_obligatorio() from anon;
revoke execute on function public.marcar_tour_obligatorio() from authenticated;
grant execute on function public.marcar_tour_obligatorio() to service_role;

drop trigger if exists trg_marcar_tour_obligatorio on public.studios;
create trigger trg_marcar_tour_obligatorio
  before insert on public.studios
  for each row execute function public.marcar_tour_obligatorio();

-- `authenticated` no tiene UPDATE de tabla sobre `studios` (20260910171150): cada
-- columna que escribe el panel se concede aparte. Aditivo.
grant update (tour_progreso, tour_completado_en) on public.studios to authenticated;
