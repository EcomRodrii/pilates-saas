-- Recibos pendientes al cancelar una cuota: la política la elige el estudio, y
-- una cuota cancelada no se cobra sola.
--
-- Auditoría de cobros (16-sep-2026): el cobro automático diario solo bloqueaba
-- cuotas PAUSADAS, así que un recibo PENDIENTE con reintento de una cuota ya
-- CANCELADA se cobraba igual (hoy 0 casos en producción, pero el camino existía).
-- Decisiones del fundador:
--   · Una cuota cancelada NO genera cobros nuevos; cada intento automático mira el
--     estado ACTUAL de la cuota (`lib/billing/cobro-permitido.ts`).
--   · El recibo que ya estaba PENDIENTE al cancelar puede ser deuda real: qué se
--     hace con él lo elige el estudio (solo PENDIENTE; FALLIDO y DEVUELTO no se
--     tocan, para no perdonar sola la deuda que provocó una cancelación por impago):
--       MANTENER_CON_REINTENTOS (por defecto, como hoy) · MANTENER_SIN_REINTENTOS · ANULAR.
--   · Si la alumna puede renovar sola desde su app una cuota cancelada también lo
--     elige el estudio (por defecto, como hoy: sí).
--
-- La decisión se ESCRIBE EN EL RECIBO al cancelar (`tras_cancelar_cuota`), con un
-- trigger sobre `suscripciones`: cubre los seis caminos que cancelan (panel,
-- cambio de plan, impago agotado, baja al vencer, supresión RGPD y devolución de
-- una venta del TPV). Así lo que prometió la ventana al cancelar sigue siendo
-- cierto aunque el estudio cambie la política después, y si la marca no llegara a
-- escribirse el cobro automático NO cobra (falla cerrado).

-- ── Ajustes del estudio ──────────────────────────────────────────────────────
alter table public.studios
  add column if not exists recibos_al_cancelar_cuota text not null default 'MANTENER_CON_REINTENTOS';
alter table public.studios drop constraint if exists studios_recibos_al_cancelar_cuota_check;
alter table public.studios add constraint studios_recibos_al_cancelar_cuota_check
  check (recibos_al_cancelar_cuota in ('MANTENER_CON_REINTENTOS', 'MANTENER_SIN_REINTENTOS', 'ANULAR'));

alter table public.studios
  add column if not exists renovar_sola_cuota_cancelada boolean not null default true;

grant update (recibos_al_cancelar_cuota, renovar_sola_cuota_cancelada) on public.studios to authenticated;

-- ── Recibo: estado ANULADO y la marca de la cancelación ──────────────────────
alter table public.recibos add column if not exists tras_cancelar_cuota text;
alter table public.recibos drop constraint if exists recibos_tras_cancelar_cuota_check;
alter table public.recibos add constraint recibos_tras_cancelar_cuota_check
  check (tras_cancelar_cuota is null or tras_cancelar_cuota in ('REINTENTAR', 'SIN_REINTENTOS', 'ANULADO'));

alter table public.recibos add column if not exists anulado_en timestamptz;

alter table public.recibos drop constraint if exists recibos_estado_check;
alter table public.recibos add constraint recibos_estado_check
  check (estado in ('PENDIENTE', 'COBRADO', 'DEVUELTO', 'EN_CURSO', 'FALLIDO', 'ANULADO'));

alter table public.recibos drop constraint if exists recibos_anulado_coherente_check;
alter table public.recibos add constraint recibos_anulado_coherente_check
  check ((estado = 'ANULADO') = (anulado_en is not null));

-- ── El trigger: al pasar una cuota a CANCELADA ───────────────────────────────
-- SECURITY INVOKER: la RLS de UPDATE de `recibos` y de `suscripciones` es el mismo
-- predicado (estudio actual + puede mover dinero), así que quien pudo cancelar la
-- cuota puede marcar sus recibos. Si esa RLS se estrechara, la marca no se
-- escribiría y el cobro automático no cobraría: falla cerrado.
create or replace function public.aplicar_politica_recibos_al_cancelar_cuota()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_politica text;
begin
  select coalesce(st.recibos_al_cancelar_cuota, 'MANTENER_CON_REINTENTOS')
    into v_politica
    from studios st where st.id = new.studio_id;

  -- Anular: solo lo que no tiene ningún pago en marcha ni factura (compare-and-set).
  if v_politica = 'ANULAR' then
    update recibos r set
      estado = 'ANULADO', anulado_en = now(), tras_cancelar_cuota = 'ANULADO', proximo_reintento = null
    where r.suscripcion_id = new.id and r.studio_id = new.studio_id
      and r.estado = 'PENDIENTE' and r.tras_cancelar_cuota is null
      and r.stripe_payment_intent_id is null and r.checkout_session_id is null and r.cobro_mostrador_pi is null
      and not exists (select 1 from facturas f where f.recibo_id = r.id);
  end if;

  -- El resto de pendientes (o los que no se pudieron anular): marcados, con o sin
  -- reintentos según la política.
  update recibos r set
    tras_cancelar_cuota = case when v_politica = 'MANTENER_CON_REINTENTOS' then 'REINTENTAR' else 'SIN_REINTENTOS' end,
    proximo_reintento   = case when v_politica = 'MANTENER_CON_REINTENTOS' then r.proximo_reintento else null end
  where r.suscripcion_id = new.id and r.studio_id = new.studio_id
    and r.estado = 'PENDIENTE' and r.tras_cancelar_cuota is null;

  return new;
end;
$function$;

revoke all on function public.aplicar_politica_recibos_al_cancelar_cuota() from public, anon, authenticated;

drop trigger if exists trg_politica_recibos_al_cancelar_cuota on public.suscripciones;
create trigger trg_politica_recibos_al_cancelar_cuota
  after update of estado on public.suscripciones
  for each row
  when (new.estado = 'CANCELADA' and old.estado is distinct from 'CANCELADA')
  execute function public.aplicar_politica_recibos_al_cancelar_cuota();
