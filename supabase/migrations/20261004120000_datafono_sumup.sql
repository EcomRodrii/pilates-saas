-- ─────────────────────────────────────────────────────────────────────────────
-- Datáfono SumUp Solo en la Caja (decisión del fundador, 4-oct-2026): dónde vive
-- su lector y el cargo final de un recibo que cobró SumUp. Aditiva.
--
-- 1. `studios.sumup_reader_id`: el Solo emparejado de la sede. Un datáfono por
--    sede, el de Stripe O el de SumUp: lo fija un CHECK, no la pantalla.
--
-- 2. `recibos.sumup_transaction_id`: el cargo de SumUp que cerró el recibo. No va
--    en `stripe_payment_intent_id`: esa columna decide que un cobro «entró por
--    Stripe» (devoluciones, API pública, reembolsos) y mandaría a Stripe un id
--    ajeno. Único: un cargo no paga dos recibos.
--
--    El cobro EN VUELO no usa columna nueva: va en `recibos.cobro_mostrador_pi` y
--    `ventas_pos.stripe_payment_intent_id` con el prefijo `sumup:` (lib/pos/sumup.ts),
--    para que las guardas de «hay un cobro en marcha» lo vean sin repetirlas.
--
-- Sin permisos de escritura para el navegador: `studios` y `recibos` dan UPDATE
-- por columnas a `authenticated`, así que una columna nueva nace NO actualizable
-- desde el panel (lo comprueba el bloque de abajo). Solo las escribe el servidor.
-- ⚠️ `studios` sí admite INSERT de tabla (la propietaria crea su estudio), así que
-- al darlo de alta se podría poner un valor, igual que hoy `stripe_terminal_reader_id`.
-- No da nada: el servidor solo usa el lector con el token de SumUp del PROPIO
-- estudio, y SumUp rechaza un lector que no sea de esa cuenta.
-- Sin función nueva: nada de EXECUTE que revocar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios add column if not exists sumup_reader_id text;

alter table public.studios drop constraint if exists studios_un_solo_datafono;
alter table public.studios add constraint studios_un_solo_datafono
  check (num_nonnulls(stripe_terminal_reader_id, sumup_reader_id) <= 1);

alter table public.recibos add column if not exists sumup_transaction_id text;

create unique index if not exists recibos_sumup_transaction_id_unico
  on public.recibos (sumup_transaction_id)
  where sumup_transaction_id is not null;

comment on column public.studios.sumup_reader_id is
  'Lector SumUp Solo emparejado (Cloud API). Un datáfono por sede: Stripe o SumUp (CHECK studios_un_solo_datafono). Solo servidor.';
comment on column public.recibos.sumup_transaction_id is
  'Transacción de SumUp que cobró el recibo en el mostrador. El cobro en vuelo va en cobro_mostrador_pi con prefijo sumup:. Solo servidor.';

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'public.studios', 'sumup_reader_id', 'UPDATE') then
      raise exception 'studios.sumup_reader_id no puede ser actualizable por %', r;
    end if;
    if has_column_privilege(r, 'public.recibos', 'sumup_transaction_id', 'UPDATE')
       or has_column_privilege(r, 'public.recibos', 'sumup_transaction_id', 'INSERT') then
      raise exception 'recibos.sumup_transaction_id no puede ser escribible por %', r;
    end if;
  end loop;
end $$;
