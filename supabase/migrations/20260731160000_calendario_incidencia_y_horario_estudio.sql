-- Rediseño del Calendario — dos columnas aditivas que el rediseño necesita y
-- que hoy no existen.
--
-- 1) sesiones.incidencia_texto: texto libre, sin categorías ni histórico
--    propio (decisión de producto confirmada 2026-07-31, MVP deliberado —
--    igual que cancelacion_motivo en su momento). NULL = sin incidencia
--    abierta. "Resolver" en el panel simplemente la pone a NULL.
alter table sesiones add column if not exists incidencia_texto text;

-- 2) studios.hora_apertura/hora_cierre: el rediseño usa esto para el eje de
--    horas del calendario (antes hardcodeado 08:00–22:00 en el prototipo).
--    Default = lo que ya asumía el código hardcodeado, así que ningún
--    estudio existente cambia de comportamiento al aplicar esto.
alter table studios add column if not exists hora_apertura time not null default '08:00';
alter table studios add column if not exists hora_cierre time not null default '22:00';
