-- Paquetes: «eliminar» un paquete con historial (suscripciones, ventas de caja)
-- no puede borrar la fila (FK RESTRICT, y es histórico financiero). Antes se
-- degradaba a `activo = false` y el paquete seguía pintado en el panel como
-- «Inactivo»: la propietaria lo leía como «no se ha eliminado».
-- `archivado_en` separa los tres conceptos: desactivar (`activo = false`, sigue
-- en el panel para reactivarlo), archivar (`archivado_en`, desaparece del panel
-- y del catálogo, conserva el historial) y eliminar (DELETE, solo sin historial).
alter table public.planes_tarifa add column if not exists archivado_en timestamptz;
comment on column public.planes_tarifa.archivado_en is
  'Paquete retirado con historial: no se ve en el panel ni se vende; las suscripciones y ventas que lo usan siguen intactas.';
