-- Aforo por defecto del TIPO de clase.
--
-- Hasta ahora el aforo solo existía en `sesiones.aforo_maximo`, y al programar
-- una clase en la agenda se rellenaba con la capacidad de la SALA
-- (app/(dashboard)/calendario/page.tsx). Eso obliga a corregirlo a mano cada
-- vez que un tipo de clase usa menos plazas de las que caben: un Reformer de 8
-- en una sala de 12, o una clase de embarazadas que se limita a 6.
--
-- Mismo patrón de override que el resto de reglas de `tipos_clase`
-- (ventana_cancelacion_horas, minimo_asistentes_por_clase…): NULL = hereda, y
-- aquí "hereda" significa la capacidad de la sala, que es el comportamiento de
-- siempre. Ningún tipo de clase existente cambia de comportamiento.
--
-- Puramente aditiva: sin RLS nueva (la política de tabla ya cubre columnas
-- nuevas), sin cambio de firma de ninguna RPC, sin backfill.
alter table public.tipos_clase
  add column if not exists aforo_por_defecto integer;

comment on column public.tipos_clase.aforo_por_defecto is
  'Plazas por defecto al programar una sesión de este tipo. NULL = usa la capacidad de la sala (comportamiento clásico).';

alter table public.tipos_clase
  drop constraint if exists tipos_clase_aforo_por_defecto_valido;
alter table public.tipos_clase
  add constraint tipos_clase_aforo_por_defecto_valido
  check (aforo_por_defecto is null or (aforo_por_defecto >= 1 and aforo_por_defecto <= 300));
