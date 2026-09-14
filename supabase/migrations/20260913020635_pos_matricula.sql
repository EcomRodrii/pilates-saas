-- ─────────────────────────────────────────────────────────────────────────────
-- M-8 (58ª auditoría): el TPV era un QUINTO camino de venta de planes y no
-- sabía nada de la matrícula. La cabecera de `20260911013944_matricula_cupo_y_fecha`
-- decía «hay CUATRO sitios que cobran matrícula» (los dos checkouts online y
-- las dos vías de mostrador de `studio-context.tsx`) — el TPV nunca fue de la
-- partida: un plan con cuota de alta se vendía por su precio de catálogo tal
-- cual, sin cobrarla y sin gastar el cupo de "gratis para las N primeras".
--
-- La app (app/api/pos/venta/route.ts) ya cobra la matrícula aparte, como línea
-- LIBRE, con el mismo `reservar_matricula(plan_id, studio_id)` que usan los
-- otros cuatro caminos. Lo que falta AQUÍ es cerrar el mismo hueco que ya se
-- cerró para el checkout online (#1893): si la promoción cubre la matrícula
-- (gratis, cupo consumido) y el cobro asíncrono del TPV (datáfono/Bizum)
-- termina fallando o caducando, esa plaza tiene que volver — si no, cada venta
-- abandonada en el mostrador con la promo activa se comería una plaza que
-- nadie llegó a usar.
--
-- Esta columna es lo que permite reconstruir esa plaza al fallar: la app
-- anota aquí el plan cuya matrícula quedó gratis (cupo ya gastado) al crear la
-- venta; `fallar_pago_venta_pos` la lee y libera el cupo en la MISMA
-- transacción que anula la venta — mismo criterio que el resto del repo ("la
-- BD decide una vez"), y ya idempotente por construcción: solo actúa sobre una
-- venta que siga en PENDIENTE_PAGO, así que un segundo aviso del mismo fallo
-- (el sondeo del TPV Y el webhook pueden llegar los dos) no libera dos veces.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ventas_pos
  add column if not exists matricula_cupo_plan_id text references public.planes_tarifa(id);

comment on column public.ventas_pos.matricula_cupo_plan_id is
  'Si la matrícula de esta venta salió gratis por promoción (cupo ya gastado en reservar_matricula), el plan al que hay que devolver la plaza si el cobro asíncrono falla. NULL en el resto de ventas.';

create or replace function public.fallar_pago_venta_pos(
  p_venta_id  text,
  p_studio_id text,
  p_pago_estado text,       -- RECHAZADO | CANCELADO | EXPIRADO | ERROR
  p_motivo    text
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_afectadas integer;
  v_plan_matricula text;
begin
  if p_pago_estado not in ('RECHAZADO','CANCELADO','EXPIRADO','ERROR') then
    raise exception 'PAGO_ESTADO_INVALIDO:%', p_pago_estado;
  end if;

  update public.ventas_pos v
     set estado = 'ANULADA', pago_estado = p_pago_estado,
         pago_actualizado_en = now(), pago_error = left(coalesce(p_motivo, ''), 300),
         anulada_en = now(), anulada_motivo = 'Pago no completado'
   where v.id = p_venta_id
     and v.studio_id = p_studio_id
     and v.estado = 'PENDIENTE_PAGO'
  returning v.matricula_cupo_plan_id into v_plan_matricula;
  get diagnostics v_afectadas = row_count;
  if v_afectadas = 0 then return false; end if;

  update public.productos_pos p
     set stock = p.stock + l.cantidad
    from public.ventas_pos_lineas l
   where l.venta_id = p_venta_id
     and l.tipo = 'PRODUCTO'
     and p.id = l.referencia_id
     and p.studio_id = p_studio_id
     and p.stock is not null;

  if v_plan_matricula is not null then
    perform public.liberar_cupo_matricula(v_plan_matricula, p_studio_id);
  end if;

  return true;
end;
$$;

comment on function public.fallar_pago_venta_pos(text,text,text,text) is
  'POS: el pago no salió. Anula la venta, DEVUELVE el stock reservado y, si la matrícula de esta venta había salido gratis por promoción, libera esa plaza (M-8, 58ª pasada).';

-- Sin GRANT nuevo: la firma no cambia (mismos 4 parámetros de siempre), así
-- que no aplica el gotcha de «CREATE OR REPLACE con firma nueva resetea los
-- grants» — verificado abajo que los tres roles quedan exactamente igual que
-- antes de esta migración.
