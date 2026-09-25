-- D-5: el libro de intentos de cobro (`cobros_intentos`) se borraba en cascada con el
-- recibo. Justo el escenario «me habéis cobrado dos veces» sobre un recibo que
-- alguien borró no se podía reconstruir. El cargo es un hecho de Stripe, no del
-- recibo: el libro ya guarda `importe_centimos`, `studio_id` y el PaymentIntent,
-- así que sobrevive con `recibo_id` a NULL.
alter table public.cobros_intentos alter column recibo_id drop not null;
alter table public.cobros_intentos drop constraint if exists cobros_intentos_recibo_id_fkey;
alter table public.cobros_intentos
  add constraint cobros_intentos_recibo_id_fkey
  foreign key (recibo_id) references public.recibos(id) on delete set null;
comment on column public.cobros_intentos.recibo_id is
  'Recibo al que se aplicó el cargo. NULL si el recibo se borró después: el cargo (payment_intent_id, importe_centimos, studio_id) se conserva.';
