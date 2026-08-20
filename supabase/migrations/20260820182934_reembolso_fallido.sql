-- D-8 (auditoría 20-ago): el reembolso que FALLA días después de crearse.
--
-- Un refund puede fallar mucho después de `charge.refunded` (SEPA sobre todo):
-- Stripe devuelve el dinero al estudio y decrementa `amount_refunded`, pero
-- Tentare ya había marcado el recibo DEVUELTO, anotado la fila de
-- `devoluciones` y quizá la propietaria ya había pulsado REVERTIDA — la
-- clienta pagó Y perdió lo entregado, y nadie se enteraba (los eventos
-- `refund.failed`/`charge.refund.updated` no se manejaban).
--
-- Piezas de esquema, todas aditivas (diseño validado por tentare-arquitecto):
--
--  · `recibos.reembolso_fallido_en` / `reembolso_fallo_motivo`: la marca que
--    enciende la fase FALLIDA del panel (lib/billing/estado-reembolso.ts) y
--    re-habilita el botón de reintentar. NO se resetea `reembolso_solicitado_en`
--    a NULL (la clave de idempotencia del endpoint devolvería la respuesta
--    cacheada del refund fallido durante 24 h): el reintento varía la clave
--    con el refund anterior.
--  · `devoluciones.fallo_en` / `fallo_motivo`: anotación del fallo sobre la
--    fila del hecho original.
--  · `devoluciones.estado` gana 'ANULADA_REEMBOLSO_FALLIDO': una fila en
--    PENDIENTE_REVISION cuyo reembolso falló NO puede seguir ofreciendo
--    «revertir la entrega» por dinero que nunca salió — se cierra con este
--    terminal. REVERTIDA no se toca (es historia verdadera: la reversión sí
--    se aplicó; el aviso al mostrador lleva ese dato para deshacerla a mano).
--    Único consumidor por estado en la app: el filtro PENDIENTE_REVISION de
--    lib/supabase-data.ts — verificado antes de ampliar el CHECK.

alter table public.recibos
  add column if not exists reembolso_fallido_en timestamptz,
  add column if not exists reembolso_fallo_motivo text;

alter table public.devoluciones
  add column if not exists fallo_en timestamptz,
  add column if not exists fallo_motivo text;

alter table public.devoluciones drop constraint devoluciones_estado_check;
alter table public.devoluciones add constraint devoluciones_estado_check check (estado in (
  'PENDIENTE_REVISION',
  'REVERTIDA',
  'DESCARTADA',
  'OMITIDA_SIN_ENTREGA',
  'OMITIDA_SIN_INSTRUMENTAR',
  'OMITIDA_ESTADO_CAMBIADO',
  'ANULADA_REEMBOLSO_FALLIDO'
));
