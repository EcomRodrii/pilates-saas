-- Recuperación de impagos del SaaS (Fase 2 de Billing & Revenue, 17-nov-2026).
--
-- Sobre `billing_incidentes_pago` (migr 20261116224610): lo que falta para avisar al
-- estudio SIN duplicar los reintentos de Stripe y sin mandar dos veces el mismo aviso
-- aunque el webhook y el cron coincidan.
--
--   · billing_registrar_aviso   reclama un hito (día 0, 2, 5, 7…) antes de mandarlo.
--   · billing_liberar_aviso     lo devuelve si el envío falla, para que el siguiente tic lo reintente.
--   · billing_escalar_incidente ABIERTO → ESCALADO (lo ve /interno; nunca suspende nada solo).
--   · billing_fijar_motivo      el motivo que dio el banco (decline_code), leído de Stripe.
--
-- Todas solo service_role: los tres pasos de grants, como `billing_registrar_factura`.

-- Reclama el hito `p_dia` del incidente. `true` = es tuyo, mándalo; `false` = ya estaba
-- reclamado (otra entrega del webhook, o el cron). Una sola sentencia: dos llamadas a la
-- vez no pueden ganar las dos.
create or replace function public.billing_registrar_aviso(p_stripe_invoice_id text, p_dia integer, p_tipo text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update public.billing_incidentes_pago
     set avisos = avisos || jsonb_build_array(jsonb_build_object('dia', p_dia, 'tipo', p_tipo, 'en', now()))
   where stripe_invoice_id = p_stripe_invoice_id
     and estado in ('ABIERTO', 'ESCALADO')
     and not exists (select 1 from jsonb_array_elements(avisos) a where (a->>'dia')::integer = p_dia);
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

create or replace function public.billing_liberar_aviso(p_stripe_invoice_id text, p_dia integer)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update public.billing_incidentes_pago
     set avisos = coalesce((select jsonb_agg(a) from jsonb_array_elements(avisos) a where (a->>'dia')::integer <> p_dia), '[]'::jsonb)
   where stripe_invoice_id = p_stripe_invoice_id;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

create or replace function public.billing_escalar_incidente(p_stripe_invoice_id text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update public.billing_incidentes_pago set estado = 'ESCALADO'
   where stripe_invoice_id = p_stripe_invoice_id and estado = 'ABIERTO';
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

create or replace function public.billing_fijar_motivo(p_stripe_invoice_id text, p_codigo text, p_texto text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update public.billing_incidentes_pago
     set motivo_codigo = left(p_codigo, 80), motivo_texto = left(p_texto, 300)
   where stripe_invoice_id = p_stripe_invoice_id and estado in ('ABIERTO', 'ESCALADO');
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

-- ⚠️ pg_default_acl da EXECUTE a anon/authenticated DIRECTO: los tres pasos.
revoke execute on function public.billing_registrar_aviso(text, integer, text) from public, anon, authenticated;
revoke execute on function public.billing_liberar_aviso(text, integer) from public, anon, authenticated;
revoke execute on function public.billing_escalar_incidente(text) from public, anon, authenticated;
revoke execute on function public.billing_fijar_motivo(text, text, text) from public, anon, authenticated;
grant execute on function public.billing_registrar_aviso(text, integer, text) to service_role;
grant execute on function public.billing_liberar_aviso(text, integer) to service_role;
grant execute on function public.billing_escalar_incidente(text) to service_role;
grant execute on function public.billing_fijar_motivo(text, text, text) to service_role;
