-- M-4 (auditoría 22-sep): `/api/billing/webhook` aplicaba `customer.subscription.*`
-- sin comparar `event.created` — Stripe NO garantiza orden de entrega. Un
-- `.updated` (active) que llega DESPUÉS de un `.deleted` (canceled) devolvía el
-- estudio a `active`. La idempotencia por `event.id` (M10) no protege de esto:
-- son eventos DISTINTOS, cada uno se reclama y procesa una sola vez, solo que
-- en el orden equivocado.
--
-- Columna nueva en las DOS tablas que `actualizarSuscripcion` puede escribir
-- (`studios` para un estudio individual, `cadenas` para el billing de una
-- cadena — planDeCadena, migr 0066): el timestamp del evento de Stripe que
-- efectivamente escribió el estado por última vez. Aditiva, sin default: las
-- filas existentes empiezan en NULL, así que el primer webhook que llegue tras
-- desplegar esto se aplica igual que siempre (NULL se trata como "sin evento
-- previo que proteger").
--
-- El guard vive en el WHERE del UPDATE en TypeScript
-- (app/api/billing/webhook/route.ts), no en una RPC: este webhook ya escribe
-- con el cliente admin (service_role) directo sobre la tabla, sin RPC de por
-- medio, así que no aplica el patrón "SECURITY DEFINER + gate en la RPC" que
-- usa el resto del repo — el gate de aquí es la propia condición SQL del
-- UPDATE, atómica por construcción (no hay carrera check-then-act: dos
-- entregas concurrentes del mismo studio nunca pueden las dos pasar el WHERE
-- con un evento más antiguo que el que la otra acaba de escribir).
alter table public.studios add column if not exists subscription_evento_en timestamptz;
alter table public.cadenas add column if not exists subscription_evento_en timestamptz;

comment on column public.studios.subscription_evento_en is
  'created_at (event.created) del último evento de Stripe que escribió subscription_status/plan aquí. NULL = nunca protegido por este guard. M-4.';
comment on column public.cadenas.subscription_evento_en is
  'created_at (event.created) del último evento de Stripe que escribió subscription_status/plan aquí. NULL = nunca protegido por este guard. M-4.';
