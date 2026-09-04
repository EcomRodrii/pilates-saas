-- F-34 (auditoría 20ª pasada) — nota de procedencia: recuperada verbatim
-- desde `schema_migrations.statements` (mismo timestamp/nombre aplicado en
-- producción por otra sesión de trabajo en paralelo, fichero nunca llegó al
-- repo — detectada mientras se investigaba F-22/F-18). Ver
-- 20260821130703_cupo_semanal_ignora_clases_canceladas.sql para el método.
--
-- Corrige un bug real del propio constraint introducido en
-- 20260902001721_facturas_venta_pos_id.sql (mismo día, unas horas antes):
-- exigía EXACTAMENTE una de recibo_id/venta_pos_id (XOR estricto), pero una
-- factura RECTIFICATIVA no cuelga de ningún cobro directo — rectifica a OTRA
-- factura (columna `rectifica_a`), así que las dos pueden ir NULL a la vez.
-- `num_nonnulls(...) <= 1` (a lo sumo una, nunca "exactamente una") es la
-- regla correcta.

alter table public.facturas drop constraint facturas_entidad_unica;

alter table public.facturas
  add constraint facturas_entidad_unica
  check (num_nonnulls(recibo_id, venta_pos_id) <= 1);

comment on constraint facturas_entidad_unica on public.facturas is
  'Una factura cuelga como mucho de UNA entidad. Las dos a la vez no tiene sentido; ninguna si lo tiene: es el caso de la RECTIFICATIVA, que rectifica a otra factura (rectifica_a) y no a un cobro.';
