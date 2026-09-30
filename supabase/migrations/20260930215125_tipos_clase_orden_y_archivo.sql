-- Tipos de clase: archivar y ordenar (Fase 2 · D).
--
-- Dos columnas nuevas en `tipos_clase`, las dos NULL por defecto = lo de hoy:
--
--   · `orden`: la posición en que la alumna ve los tipos (menor primero). NULL
--     es «sin colocar»: va detrás, por nombre. Sin backfill a propósito — el
--     panel se queda igual hasta que alguien arrastre el primero, y un tipo
--     nuevo, duplicado, del catálogo de cadena o del onboarding cae solo al final.
--   · `archivado_en`: NULL = activo. Con fecha, archivado — el sitio al que va
--     un tipo que ya no se da y no se puede borrar porque tiene historial (la FK
--     `sesiones.tipo_clase_id` lo impide, y es correcto que lo impida).
--
-- Permisos: `tipos_clase` tiene GRANT de tabla a `authenticated` (0000_base),
-- así que las columnas nuevas quedan cubiertas sin tocar nada; QUIÉN puede
-- escribirlas lo decide la política `tipos_clase_update` que ya existe
-- (`puede_gestionar_sede()`: propietaria y gerencia, 20260915224739). El
-- trigger de dinero (`tipos_clase_dinero_solo_propietaria`) solo mira sus tres
-- columnas: estas dos no le afectan.
--
-- ── La regla: un tipo archivado no programa clases nuevas ────────────────────
-- Hay al menos siete vías que crean clases (Nueva clase y su serie, duplicar,
-- clase fija, la app de la instructora, la importación, `renovar_serie`,
-- `editar_serie_desde`). Filtrar el selector en cada pantalla no cierra
-- ninguna: una pestaña abierta desde antes de archivar, o una serie que se
-- renueva sola, seguirían creándolas. La regla vive en la base de datos, una
-- vez, como trigger en `sesiones`:
--   · solo mira clases FUTURAS: importar historial de un tipo archivado pasa;
--   · un UPDATE que no cambia el tipo pasa (mover o editar una clase ya
--     programada de un tipo archivado sigue siendo posible);
--   · lanza `TIPO_ARCHIVADO`, que el panel traduce (`mensajeDeFalloAlGuardar`)
--     y la renovación de series también (`mensajeErrorRenovar`).
-- `renovar_serie` (20260915172901) solo captura exclusion_violation, así que el
-- error sale entero de la RPC, también al simular.
--
-- SECURITY INVOKER y search_path vacío, mismo molde que
-- `tipos_clase_dinero_solo_propietaria`. Límite aceptado: al ser invoker, si la
-- RLS le ocultara el tipo a quien escribe, dejaría pasar. No es una frontera de
-- seguridad (quien programa ya ve los tipos de su estudio): es una regla de
-- negocio para que ninguna vía se la salte sin querer.
--
-- ⚠️ Orden de despliegue: el código que filtra por `archivado_en` en servidor
-- (app de la instructora, importación, avisos de series) necesita la columna.
-- Esta migración es aditiva y compatible con el código anterior: se APLICA en
-- producción ANTES de mergear el código que la usa.

alter table public.tipos_clase add column if not exists orden integer;
alter table public.tipos_clase add column if not exists archivado_en timestamptz;

alter table public.tipos_clase drop constraint if exists tipos_clase_orden_rango;
alter table public.tipos_clase
  add constraint tipos_clase_orden_rango check (orden is null or (orden >= 0 and orden <= 10000));

comment on column public.tipos_clase.orden is
  'Posición en que la alumna ve los tipos (menor primero). NULL = sin colocar: detrás, por nombre.';
comment on column public.tipos_clase.archivado_en is
  'NULL = activo. Con fecha: archivado. No se programan clases nuevas suyas (trg_sesiones_no_programa_tipo_archivado) ni sale en los catálogos para programar. Su historial y sus clases ya programadas se quedan. Se recupera poniéndolo a NULL.';

create or replace function public.sesiones_no_programa_tipo_archivado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.tipo_clase_id is null or new.inicio <= now() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.tipo_clase_id is not distinct from old.tipo_clase_id then
    return new;
  end if;
  if exists (
    select 1 from public.tipos_clase t
     where t.id = new.tipo_clase_id and t.archivado_en is not null
  ) then
    raise exception 'TIPO_ARCHIVADO';
  end if;
  return new;
end;
$$;

comment on function public.sesiones_no_programa_tipo_archivado() is
  'Una clase FUTURA no puede ser de un tipo archivado (TIPO_ARCHIVADO). Las pasadas, y editar una ya programada sin cambiarle el tipo, pasan.';

-- Solo el trigger la ejecuta: el permiso se comprueba al CREAR el trigger, no al
-- dispararse. Y `pg_default_acl` da EXECUTE directo a anon/authenticated en este
-- proyecto, así que revocar PUBLIC no bastaría: se revocan los tres.
revoke all on function public.sesiones_no_programa_tipo_archivado() from public, anon, authenticated;
grant execute on function public.sesiones_no_programa_tipo_archivado() to service_role;

drop trigger if exists trg_sesiones_no_programa_tipo_archivado on public.sesiones;
create trigger trg_sesiones_no_programa_tipo_archivado
  before insert or update of tipo_clase_id on public.sesiones
  for each row execute function public.sesiones_no_programa_tipo_archivado();

do $verificacion$
begin
  if not has_column_privilege('authenticated', 'public.tipos_clase', 'archivado_en', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.tipos_clase', 'orden', 'UPDATE') then
    raise exception 'tipos_clase: orden/archivado_en no se podrían guardar desde el panel';
  end if;
  if has_function_privilege('anon', 'public.sesiones_no_programa_tipo_archivado()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sesiones_no_programa_tipo_archivado()', 'EXECUTE') then
    raise exception 'sesiones_no_programa_tipo_archivado: anon/authenticated no deben tener EXECUTE';
  end if;
end
$verificacion$;
