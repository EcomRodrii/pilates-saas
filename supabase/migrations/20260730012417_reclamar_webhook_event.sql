-- ═══════════════════════════════════════════════════════════════════════════
-- Reclamación atómica de webhook_events (cierra la carrera SELECT-then-INSERT
-- de webhookYaProcesado/marcarWebhookProcesado, 0032/M10).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO: dos entregas concurrentes REALES del mismo event.id (Stripe puede
-- reentregar en paralelo en casos borde, no solo en reintentos secuenciales)
-- podían pasar ambas el SELECT de "¿ya procesado?" en false antes de que
-- ninguna hubiera insertado, y procesar el mismo evento dos veces. Cada
-- escritura de dinero en los webhooks ya tiene su propio guard idempotente
-- (recibos .in('estado',...), PK 23505 en reconciliaciones_pos...), así que el
-- impacto real era bajo — pero la carrera en la propia capa de dedup seguía
-- abierta.
--
-- POR QUÉ NO "reclamar antes + liberar en cada return de fallo": los webhooks
-- de Stripe (app/api/stripe/webhook/route.ts) tienen ~15 puntos de retorno
-- dispersos, varios de ellos éxitos parciales legítimos que HOY tampoco
-- marcan como procesados (retornan antes del marcado final a propósito).
-- Añadir una liberación explícita en cada uno arriesgaba justo lo que este
-- diseño evita: olvidar UNO solo convierte un fallo transitorio en "procesado
-- para siempre" — un pago perdido, peor que la carrera original.
--
-- DISEÑO: reclamación con EXPIRACIÓN, sin liberación explícita. `estado` pasa
-- a 'procesando' al reclamar y a 'completado' en el ÚNICO punto de éxito de
-- cada webhook. Si el handler falla o retorna antes de marcar completado, la
-- fila se queda en 'procesando' y expira sola pasados p_expira_segundos,
-- quedando reclamable de nuevo por el siguiente reintento de Stripe — no hay
-- ningún camino de código que pueda "olvidar" liberarla.
--
-- El UPSERT es atómico en una sola sentencia: bajo dos INSERT...ON CONFLICT
-- concurrentes con la misma PK, Postgres serializa por el lock de fila del
-- índice único — la segunda espera el commit de la primera y REEVALÚA el
-- WHERE después, así que si la condición da falso no actualiza esa fila y no
-- la incluye en RETURNING. No hace falta pg_advisory_xact_lock: check+write
-- ya son la misma sentencia (a diferencia del bug que motivó
-- 20260729173000_crear_recuperacion_lock_cubre_ya_existe.sql, donde el lock
-- se pedía DESPUÉS de comprobar "ya existe" en sentencias separadas).
--
-- p_expira_segundos = 120 por defecto: por encima del peor caso realista de
-- procesamiento (incluida una llamada a Fiskaly lenta en el sellado de
-- factura del ciclo SEPA) pero muy por debajo del primer reintento real de
-- Stripe (minutos, con backoff exponencial hasta ~3 días) — así una entrega
-- concurrente genuina se bloquea solo durante la ventana de carrera real
-- (segundos), y un fallo real queda reclamable mucho antes de que llegue el
-- siguiente reintento.
--
-- Efecto colateral aceptado y documentado (no un olvido): si Stripe reentrega
-- el MISMO evento dentro de la ventana de 120s tras un return de "éxito
-- parcial" que hoy tampoco marca completado (p. ej. checkout.session.completed
-- con planId y entrega.motivo==='sin-socia', que responde 200 sin entregar),
-- la segunda entrega ahora recibe duplicate:true en vez de reintentar esa
-- rama de inmediato — antes sí se reintentaba. Impacto bajo (demora de ~2 min
-- como mucho, no es dinero perdido) y limitado a esas ramas de éxito parcial.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.webhook_events
  add column if not exists estado text not null default 'completado',
  add column if not exists reclamado_en timestamptz not null default now();

-- Las filas existentes son de eventos ya procesados con el diseño anterior
-- (solo se insertaban al terminar OK) — 'completado' es el valor correcto
-- para el histórico, el default de la columna nueva ya las cubre.

create or replace function public.reclamar_webhook_event(
  p_event_id text,
  p_tipo text,
  p_expira_segundos int default 120
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reclamado boolean;
begin
  insert into public.webhook_events (id, tipo, estado, reclamado_en)
    values (p_event_id, p_tipo, 'procesando', now())
  on conflict (id) do update
    set reclamado_en = now(), tipo = excluded.tipo, estado = 'procesando'
    where webhook_events.estado = 'procesando'
      and webhook_events.reclamado_en < now() - (p_expira_segundos || ' seconds')::interval
  returning true into v_reclamado;

  return coalesce(v_reclamado, false);
end;
$function$;

revoke all on function public.reclamar_webhook_event(text, text, int) from public, anon, authenticated;

-- Marca la reclamación como completada. Solo tiene efecto si la fila sigue en
-- 'procesando' (no pisa un 'completado' ya escrito por otra llamada, ni
-- reescribe una fila que expiró y fue reclamada por otra entrega).
create or replace function public.completar_webhook_event(p_event_id text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.webhook_events
     set estado = 'completado'
   where id = p_event_id and estado = 'procesando';
$function$;

revoke all on function public.completar_webhook_event(text) from public, anon, authenticated;
