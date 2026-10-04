-- ─────────────────────────────────────────────────────────────────────────────
-- El alta de un estudio tampoco trae un SumUp Solo puesto.
--
-- `authenticated` puede hacer INSERT de tabla en `studios` (la propietaria crea su
-- estudio), y `studios_cuenta_cobro_solo_servidor` vacía al darlo de alta todo lo
-- que solo pone el servidor: la cuenta de Stripe, el SEPA y el datáfono de Stripe.
-- Faltaba el datáfono de SumUp (`sumup_reader_id`, migr 20261004125559): con un
-- valor puesto a mano, los cobros con datáfono de ESE estudio irían a SumUp y
-- fallarían. El comentario de aquella migración decía que pasaba «igual que hoy
-- `stripe_terminal_reader_id`», y no: esa sí se vaciaba.
--
-- En un UPDATE no hace falta nada: el navegador no tiene UPDATE sobre la columna
-- (lo comprobó aquella migración). Misma firma y mismo cuerpo, más una línea.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.studios_cuenta_cobro_solo_servidor()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if public.es_llamada_servicio() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.stripe_account_id              := null;
    new.stripe_account_id_anterior     := null;
    new.stripe_account_desconectado_en := null;
    new.sepa_iban                      := null;
    new.sepa_acreedor_id               := null;
    new.sepa_titular                   := null;
    new.stripe_customer_id             := null;
    new.stripe_terminal_location_id    := null;
    new.stripe_terminal_reader_id      := null;
    new.sumup_reader_id                := null;
    return new;
  end if;

  if new.stripe_account_id              is distinct from old.stripe_account_id
  or new.stripe_account_id_anterior     is distinct from old.stripe_account_id_anterior
  or new.stripe_account_desconectado_en is distinct from old.stripe_account_desconectado_en
  or new.sepa_iban                      is distinct from old.sepa_iban
  or new.sepa_acreedor_id               is distinct from old.sepa_acreedor_id
  or new.sepa_titular                   is distinct from old.sepa_titular then
    raise exception 'studios_cuenta_cobro_solo_servidor: la cuenta de cobro se cambia desde Configuración'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
