-- «Profe, ¿puedo recuperar la clase del martes?», cincuenta veces al mes.
--
-- Hoy esa pregunta acaba SIEMPRE en la propietaria: una recuperación solo nace
-- automáticamente al cancelar una plaza fija o al perder una oferta de lista de
-- espera. Para todo lo demás hay que crearla a mano desde el panel.
--
-- ═══ LO QUE YA FUNCIONABA, Y NO SE TOCA ═══
-- Gastarla ya es self-service: `reservar_plaza` consume una recuperación sola
-- cuando la socia se topa con su límite semanal. La mitad que faltaba es
-- GANARLA.
--
-- ═══ POR QUÉ NO SE REGALA AL CANCELAR ═══
-- ⚠️ Al contar las clases de la semana, `reservar_plaza` solo cuenta CONFIRMADA
-- y ASISTIDA: una cancelada NO cuenta. O sea que cancelar el martes YA libera
-- el hueco de esa semana y la socia puede coger el jueves ella sola. Dar además
-- una recuperación en ese momento sería regalarle una clase por cada
-- cancelación (hasta 4, el tope de recuperaciones vivas).
--
-- Lo que de verdad pierde es la semana que cancela y ya no le cabe otra. Por eso
-- la recuperación se otorga AL CERRAR LA SEMANA y solo por los huecos que se
-- quedaron sin usar — el barrido vive en lib/recuperaciones/otorgar-semanales.ts.
--
-- Aquí abajo va lo único que la BD necesita saber para que ese barrido pueda
-- decidir: si cada cancelación fue a tiempo.

alter table public.reservas
  add column if not exists cancelada_tardia boolean;

comment on column public.reservas.cancelada_tardia is
  'Si la cancelación fue fuera de la ventana del estudio. NULL = la reserva no se ha cancelado (o se canceló antes de existir esta columna). Lo escribe un trigger, nunca el cliente.';

-- ⚠️ Trigger y no un campo más en `cancelar_reserva_plaza`, por dos motivos.
--
-- 1. Hay más de un camino que deja una reserva en CANCELADA: la RPC (portal y
--    mostrador), `dbCancelarReservasPorSesiones` y el cierre del centro hacen
--    UPDATE directo. Escribirlo en la RPC dejaría los otros sin marcar. Mismo
--    principio —y mismo mecanismo— que la detección de no-show de Fase 3.
-- 2. `cancelar_reserva_plaza` tiene columnas de `RETURNS TABLE` que chocan con
--    nombres de columna reales, y su propio comentario avisa de que un
--    `create or replace` con una ambigüedad NO falla al aplicarse: se aplica en
--    verde y deja el producto sin poder cancelar nada. Reescribir 6 KB de
--    PL/pgSQL para añadir una asignación no compensa ese riesgo.
create or replace function public.marcar_cancelacion_tardia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
begin
  -- Solo en la TRANSICIÓN a cancelada: si ya estaba cancelada, el veredicto de
  -- entonces se conserva (re-cancelar no la vuelve tardía por el paso del tiempo).
  if new.estado is distinct from 'CANCELADA' or old.estado is not distinct from 'CANCELADA' then
    return new;
  end if;

  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = new.sesion_id;
  if v_inicio is null then
    return new;
  end if;

  -- MISMA resolución que `cancelar_reserva_plaza`: el tipo de clase pisa el
  -- default del estudio (migr 0116). Si las dos divergen, la socia vería un
  -- veredicto distinto del que decidió si se le devolvía el bono.
  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas)
    into v_ventana
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = st.id
   where st.id = new.studio_id;

  -- ⚠️ El `> 0` no sobra: con la ventana a 0 el estudio ha dicho «se puede
  -- cancelar hasta el último minuto», así que NADA es tardío. Copiado literal
  -- de la RPC; sin él, un estudio sin ventana marcaría todo como tardío y sus
  -- socias no recuperarían nunca.
  new.cancelada_tardia := coalesce(v_ventana, 0) > 0
                          and now() >= v_inicio - make_interval(hours => v_ventana);
  return new;
end;
$$;

drop trigger if exists trg_marcar_cancelacion_tardia on public.reservas;
create trigger trg_marcar_cancelacion_tardia
  before update on public.reservas
  for each row execute function public.marcar_cancelacion_tardia();

-- Opt-in. Encenderlo de golpe repartiría recuperaciones en estudios que hoy las
-- dan a mano y con criterio propio.
alter table public.studios
  add column if not exists recuperacion_auto_semanal boolean not null default false;

comment on column public.studios.recuperacion_auto_semanal is
  'Si al cerrar la semana se otorgan recuperaciones por las clases que la socia canceló a tiempo y no llegó a recuperar. Solo afecta a planes con límite semanal.';

-- El barrido pregunta por socia y semana. Parcial: las canceladas son una
-- minoría de las reservas y las demás no se miran nunca.
create index if not exists idx_reservas_canceladas_a_tiempo
  on public.reservas (studio_id, socio_id, sesion_id)
  where estado = 'CANCELADA' and cancelada_tardia = false;

-- Los lunes a las 04:15 (hora del servidor). Semanal y no diario a propósito:
-- la unidad de la regla es la semana, y correrlo a diario solo repetiría un
-- barrido que ya es idempotente sin otorgar nada nuevo.
--
-- Mismo patrón que el resto del bucket A (ver 20260811133000): pg_cron + pg_net
-- contra la ruta de Next, autenticado con el secreto de Vault.
select cron.schedule(
  'recuperaciones-semanales',
  '15 4 * * 1',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/recuperaciones-semanales',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
