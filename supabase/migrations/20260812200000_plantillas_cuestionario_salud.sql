-- Feature #6 Fase 1 (ficha Lorari-vs-Tentare): cuestionario de salud
-- configurable — la propietaria define preguntas propias por estudio, pero
-- SOLO STAFF (PROPIETARIO/INSTRUCTOR) las rellena en la ficha de la
-- clienta. Sin canal público ni de portal nuevo: mismo mecanismo de auth
-- (sesión de staff, RLS) que ya usa condiciones_salud — nada que
-- reimplementar en TS. Decisión tomada tras revisión de
-- tentare-arquitecto + tentare-seguridad + tentare-producto: la versión
-- autoservicio (la alumna responde desde el embudo público) queda
-- pospuesta a una Fase 2 explícita, si algún día hay demanda real.
--
-- Dos tablas, no una jsonb en `socios` (a diferencia de campos_extra de
-- campos_personalizados, 0015): esto es dato de categoría especial RGPD, y
-- necesita el MISMO gate de rol + consentimiento que condiciones_salud, que
-- solo se puede aplicar por fila con RLS — un jsonb compartido con campos
-- banales ("cómo nos conoció") no puede tener una política de acceso
-- distinta para "una parte del blob".
--
-- `plantillas_cuestionario_salud`: la DEFINICIÓN de cada pregunta por
-- estudio (mismo shape que campos_personalizados: etiqueta→pregunta,
-- tipo, opciones, orden, activo). Gestionarla (crear/editar/borrar
-- preguntas) es configuración sensible — solo PROPIETARIO decide qué se
-- pregunta. Leerla hace falta también para INSTRUCTOR, que es quien la
-- rellena en la ficha.
--
-- `respuestas_cuestionario_salud`: los VALORES por socia, tabla propia (no
-- jsonb) para que el UNIQUE(socio_id, pregunta_id) permita upsert limpio y
-- para no reutilizar `condiciones_salud` directamente — una respuesta de
-- cuestionario ("¿has tenido cirugía este año? sí/no") no tiene la misma
-- forma que una condición estructurada (categoría/zona/restricciones), y
-- mezclar las dos fuentes en la misma tabla habría obligado a columnas
-- nullable sin sentido en ambas direcciones.
--
-- Mismo INSERT gate que condiciones_salud: current_rol() IN
-- ('PROPIETARIO','INSTRUCTOR') + tiene_consentimiento_salud(socio_id) — la
-- función y la columna de consentimiento ya existen (0138/20260804201830),
-- no se duplican.
--
-- Sin GRANT explícito a nadie: el default ACL de este proyecto para tablas
-- nuevas ya da EXECUTE/SELECT/etc a authenticated+service_role+postgres y
-- NO a anon (verificado con pg_default_acl antes de escribir esto) — a
-- diferencia de las funciones SECURITY DEFINER, que sí heredan EXECUTE
-- directo a anon/authenticated por defecto y necesitan REVOKE explícito.
-- Esta migración no crea ninguna función nueva, así que ese gotcha no
-- aplica aquí.

create table if not exists public.plantillas_cuestionario_salud (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  pregunta text not null,
  tipo_respuesta text not null default 'texto'
    check (tipo_respuesta in ('texto', 'booleano', 'seleccion_unica', 'seleccion_multiple')),
  opciones text[] not null default '{}',
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create index if not exists idx_plantillas_cuestionario_salud_studio
  on public.plantillas_cuestionario_salud (studio_id, orden);

alter table public.plantillas_cuestionario_salud enable row level security;

create policy plantillas_cuestionario_salud_lectura on public.plantillas_cuestionario_salud
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

create policy plantillas_cuestionario_salud_insert on public.plantillas_cuestionario_salud
  for insert to authenticated
  with check (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

create policy plantillas_cuestionario_salud_update on public.plantillas_cuestionario_salud
  for update to authenticated
  using      (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO')
  with check (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

create policy plantillas_cuestionario_salud_delete on public.plantillas_cuestionario_salud
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

create table if not exists public.respuestas_cuestionario_salud (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  pregunta_id text not null references public.plantillas_cuestionario_salud(id) on delete cascade,
  respuesta text,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (socio_id, pregunta_id)
);

create index if not exists idx_respuestas_cuestionario_salud_socio
  on public.respuestas_cuestionario_salud (socio_id);

alter table public.respuestas_cuestionario_salud enable row level security;

create policy respuestas_cuestionario_salud_lectura on public.respuestas_cuestionario_salud
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

create policy respuestas_cuestionario_salud_insert on public.respuestas_cuestionario_salud
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy respuestas_cuestionario_salud_update on public.respuestas_cuestionario_salud
  for update to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

create policy respuestas_cuestionario_salud_delete on public.respuestas_cuestionario_salud
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));
