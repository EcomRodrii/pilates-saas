-- Fase 11 de Network↔Sustituciones (docs/NETWORK-SUSTITUCIONES-EXTENSION.md
-- §2-3): antes de poder sugerir candidatos de Tentare Network para un hueco
-- sin instructora, hace falta traducir el tipo de clase del estudio (texto
-- libre, "Reformer Intensivo") al catálogo fijo de especialidades de Network
-- (lib/network/catalogo.ts) — no existe ninguna columna que los cruce hoy.
--
-- Nullable, sin default: cada estudio lo rellena una vez al crear/editar su
-- tipo de clase (mismo patrón "hereda/opcional" que ventana_cancelacion_horas
-- y el resto de columnas de tipos_clase). Sin mapear, ese tipo de clase
-- simplemente no genera sugerencias de Network — nunca un matching
-- aproximado por texto (decisión de producto explícita: el propio documento
-- de diseño advierte que dar falsos negativos silenciosos es peor que no
-- sugerir nada).
--
-- CHECK con la misma lista que ESPECIALIDADES_NETWORK (lib/network/
-- catalogo.ts) — mismo patrón que tipos_clase_nivel_check (0000_base.sql).
-- red_perfiles.especialidades es text[] sin CHECK porque es multi-valor; aquí
-- es un único valor por tipo de clase, así que sí se puede acotar en BD.
alter table public.tipos_clase
  add column if not exists especialidad_network text
  check (especialidad_network in ('reformer', 'mat', 'maquina', 'yoga', 'hiit', 'otro'));

comment on column public.tipos_clase.especialidad_network is
  'Traducción de este tipo de clase al catálogo de Tentare Network. NULL = sin mapear, no genera sugerencias de sustitutas de Network para este tipo de clase.';

-- Sugerencia de candidatos de Tentare Network para una baja, calculada en TS
-- (candidatosNetworkParaHueco, lib/network/candidatos-sustitucion.ts) y
-- adjuntada APARTE del ranking interno puntuado (columna `ranking`, ya
-- existente) — nunca fusionados en una sola lista. Snapshot en el momento de
-- crear la baja, no una vista en vivo: mismo criterio que `ranking`, que
-- tampoco se recalcula después. Sin puntuación (jsonb con los datos crudos
-- del perfil) porque puntuar a alguien sin historial en este estudio con la
-- fórmula interna sería un sesgo, no una medida (ver §1 del documento).
alter table public.sustituciones
  add column if not exists candidatos_network jsonb;

comment on column public.sustituciones.candidatos_network is
  'Snapshot de perfiles de Tentare Network que podrían encajar (sin puntuar, sección aparte del ranking interno). NULL = no se buscó o no había tipo de clase mapeado.';
