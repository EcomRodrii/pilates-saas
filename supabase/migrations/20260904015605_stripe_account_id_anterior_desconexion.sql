-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría 22ª pasada (3-sep-2026), D-4. Cuando `account.application.deauthorized`
-- pone `stripe_account_id` a NULL, el id de la cuenta desconectada se perdía sin
-- guardar en ninguna parte. Un webhook legítimo que llegara TARDE (reintento de
-- Stripe, evento retrasado) sobre un pago que sí ocurrió ANTES de la desconexión
-- ya no podía resolver el estudio (`studioDeCuentaConnect` busca por
-- `stripe_account_id` en vivo) y caía en un 403 — el registro de un cobro/
-- reembolso/disputa real se perdía en silencio en vez de escribirse.
--
-- Esto NO reabre el cobro: una vez desautorizada, Stripe revoca el acceso de la
-- plataforma a esa cuenta conectada — ninguna llamada nueva a la API de Stripe
-- con `stripeAccount: <id>` puede funcionar ya, así que los conciliadores (que sí
-- llaman a Stripe) no pueden ni deben intentarlo sobre una cuenta desconectada.
-- Lo único que se recupera es la capacidad de ATRIBUIR correctamente un webhook
-- tardío sobre algo que YA pasó, para no perder el registro en nuestra BD.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios
  add column if not exists stripe_account_id_anterior text,
  add column if not exists stripe_account_desconectado_en timestamptz;

comment on column public.studios.stripe_account_id_anterior is
  'Último stripe_account_id conocido antes de una desconexión (account.application.deauthorized). Permite atribuir webhooks tardíos sobre pagos ya ocurridos; nunca se usa para llamar de nuevo a la API de Stripe (el acceso está revocado).';
comment on column public.studios.stripe_account_desconectado_en is
  'Cuándo se desvinculó stripe_account_id por última vez. NULL si nunca se ha desconectado una cuenta ya conectada.';
