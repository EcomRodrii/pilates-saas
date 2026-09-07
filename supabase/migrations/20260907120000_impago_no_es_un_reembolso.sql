-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 Auditoría 26ª pasada (7 sep 2026) — A-1.
--
-- `bloquear_reserva_impago` (migr 20260905151515) cierra el autoservicio a
-- quien tenga un recibo `FALLIDO` o `DEVUELTO`. El problema es que `DEVUELTO`
-- son DOS cosas distintas escritas en la misma casilla:
--
--   · «Devuelto por el banco» — lo escribe `marcarDevuelto` desde el panel
--     (lib/studio-context.tsx) y así lo llama la propia UI de Cobros
--     (components/cobros/panel-pendientes.tsx:150). El dinero NUNCA llegó:
--     es deuda de verdad y bloquear está bien.
--
--   · «Le hemos devuelto su dinero» — lo escribe `procesar-reembolso.ts` (botón
--     Devolver de la ficha, y `charge.refunded` desde el webhook de Stripe).
--     Aquí el dinero SALIÓ de la caja del estudio HACIA la socia. Llamar a eso
--     un impago y cerrarle la reserva es cobrarle dos veces el favor.
--
-- Medido en producción antes de este cambio: `studio-1` es el único estudio con
-- el flag encendido y tenía tres socias bloqueadas, una de ellas
-- (`rec-web-a1ePvXflC7jvEEm5B6esEc7z`, «Alta web — Bono 4 clases»,
-- `importe_devuelto = importe = 1,00 €`) por un reembolso íntegro del 11 de
-- agosto. Llevaba bloqueada desde que se desplegó el gate, el 5 de septiembre.
--
-- Y no tenía salida: el mensaje del mostrador (lib/reservas/errores-rpc.ts) le
-- dice a la propietaria «márcalo como cobrado desde Cobros», que sobre un
-- recibo reembolsado es falsear los libros — y el Veri*Factu cuelga de ahí.
--
-- El discriminante NO se inventa: `recibos.importe_devuelto` (numeric not null
-- default 0) ya lo mantiene `lib/billing/registrar-devolucion.ts`, y
-- `reembolso_stripe_id` / `reembolso_solicitado_en` los escribe
-- `procesar-reembolso.ts` en cuanto se pide el reembolso — así que un reembolso
-- EN CURSO tampoco bloquea mientras Stripe lo procesa.
--
-- Se toca solo esta función a propósito: la migración que la creó dice «un solo
-- sitio decide si alguien debe dinero, para que no haya dos respuestas
-- distintas según por dónde se pregunte», y los tres llamantes de
-- `reservar_plaza` (20260905151515, 20260905153105, 20260907030553) la usan.
-- Su gemelo en TypeScript —`/api/stripe/checkout`, el único sitio por el que la
-- socia puede PAGAR esa deuda— se arregla en el mismo cambio:
-- `lib/billing/deuda-recibo.ts`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.socio_tiene_impago(p_studio_id text, p_socio_id text)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from recibos r
     where r.studio_id = p_studio_id
       and r.socio_id = p_socio_id
       and r.estado in ('FALLIDO', 'DEVUELTO')
       -- Si le devolvimos su dinero, no nos debe nada. `importe_devuelto` es
       -- `not null default 0`, así que un recibo devuelto por el banco (donde
       -- nunca hubo cobro que devolver) sigue contando como deuda.
       and coalesce(r.importe_devuelto, 0) < r.importe
       -- Reembolso ya iniciado contra Stripe, aunque todavía no haya cuadrado
       -- el importe: no se bloquea a nadie por dinero que va de vuelta.
       and r.reembolso_stripe_id is null
       and r.reembolso_solicitado_en is null
  );
$$;

comment on function public.socio_tiene_impago(text, text) is
  'Si la socia DEBE dinero: recibo FALLIDO o DEVUELTO por el banco. PENDIENTE no cuenta (puede estar en plazo) y un recibo que se le REEMBOLSÓ tampoco (importe_devuelto >= importe, o reembolso pedido a Stripe).';
