-- Fase 2c (tercera y última pieza de "Fase 2" tras aprobación manual y plazo
-- de lista de espera): mínimo de asistentes para que una clase se mantenga.
-- Si a 2h del inicio no se alcanza el mínimo, se cancela automáticamente (sin
-- fase de aviso previo, decisión de producto) y SÍ se devuelve el bono a las
-- CONFIRMADA — a diferencia de dbCancelarReservasPorSesiones (cancelación
-- manual de la propietaria), que hoy no devuelve bono: aquí no es culpa de
-- la socia, es el sistema el que rompe el compromiso.
--
-- Mismo patrón "hereda" que reserva_ventana_minima_minutos/
-- lista_espera_plazo_aceptacion_minutos: studios.<campo> NOT NULL DEFAULT +
-- tipos_clase.<campo> nullable. El override se resuelve en TS con
-- heredaOverride() (lib/booking-logic.ts), no en SQL directo: el chequeo solo
-- ocurre server-side dentro del cron, nunca en una RPC invocable por
-- `authenticated`.
alter table studios add column if not exists minimo_asistentes_por_clase integer not null default 0;
-- 0 = sin mínimo (comportamiento actual).

alter table tipos_clase add column if not exists minimo_asistentes_por_clase integer; -- null = hereda

comment on column studios.minimo_asistentes_por_clase is
  'Nº mínimo de reservas CONFIRMADA para que la clase se mantenga. Si a 2h del inicio no se alcanza, se cancela automáticamente y se devuelve el bono. 0 = sin mínimo.';
comment on column tipos_clase.minimo_asistentes_por_clase is
  'NULL = hereda studios.minimo_asistentes_por_clase.';

-- Distingue en el histórico "cancelada por la propietaria" (NULL, de siempre)
-- de "cancelada por el sistema al no alcanzar el mínimo". Aditivo: ningún
-- camino existente la toca.
alter table sesiones add column if not exists cancelada_motivo text;
comment on column sesiones.cancelada_motivo is
  'NULL = cancelada manualmente. ''minimo_no_alcanzado'' = cancelada automáticamente (Fase 2c).';
