-- ═══════════════════════════════════════════════════════════════════════════
-- Siembra del estudio de demostración "Estudio Aurora" (studio-demo).
--
-- POR QUÉ EXISTE ESTE FICHERO: las dos veces anteriores que existió esta
-- demo se sembraron A MANO en el SQL editor de Supabase, sin dejar ningún
-- script versionado — así que cuando alguien borró el estudio manualmente,
-- se perdió sin dejar rastro y hubo que reinventarlo desde cero (2026-08-28).
-- Esta vez queda en el repo para que la próxima vez sea "ejecuta este
-- fichero", no "adivina qué había".
--
-- QUÉ HACE: crea un estudio 100% ficticio ("Estudio Aurora") con datos de
-- negocio creíbles — salas, tipos de clase, instructoras, socias, clases
-- futuras POR LA MAÑANA, reservas y recibos cobrados — para que:
--   1. `app/demo/page.tsx` (la puerta `/demo`) tenga un panel con contenido
--      real al iniciar sesión con demo@estudioaurora.tentare.app.
--   2. `scripts/grabar-demo.mjs` pueda grabar el vídeo de producto del hero
--      de la landing sin encontrarse pantallas vacías.
--
-- CÓMO EJECUTARLO: contra el proyecto de producción
-- (`dwqvdycjcffqwfkzapvi`), vía `execute_sql` del MCP de Supabase o pegado
-- en el SQL editor. Es IDEMPOTENTE: se puede volver a correr sin duplicar
-- filas (`ON CONFLICT (id) DO NOTHING`/`DO UPDATE` según la tabla) y, de
-- paso, las clases y los recibos se REFRESCAN a fechas relativas a "hoy"
-- cada vez que se ejecuta — así que si algún día vuelve a hacer falta
-- refrescar la demo (o si ha pasado tanto tiempo que las clases sembradas
-- quedaron en el pasado), basta con volver a correr este mismo fichero.
--
-- SUPUESTO DE PARTIDA (ya verificado, no repetir la investigación): la
-- cuenta auth demo@estudioaurora.tentare.app YA EXISTE con
-- auth_user_id = '28017f85-60ca-49f1-9e9a-15cbfdc47491'. Este script NO
-- toca auth.users — solo vincula ese id ya existente a una ficha nueva en
-- `instructores`.
--
-- NADA DE DINERO REAL: los recibos "COBRADO" son filas de datos, no pasan
-- por Stripe (sin `stripe_payment_intent_id`, sin `stripe_account_id` en el
-- estudio) — así el dashboard financiero de la demo tiene contenido y de
-- paso la tarjeta de "Primeros pasos" sigue enseñando el aviso real de
-- "todavía no has conectado Stripe" (es intencionado, lo espera
-- `grabar-demo.mjs`).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. El estudio ────────────────────────────────────────────────────────
insert into public.studios (
  id, nombre, razon_social, nif, direccion, ciudad, codigo_postal,
  email, telefono, color_primario, plan, owner_auth_user_id, slug,
  descripcion, anio_fundacion, hora_apertura, hora_cierre
) values (
  'studio-demo', 'Estudio Aurora', 'Aurora Wellness Studio S.L.', 'B00000000',
  'Calle de la Luz 12', 'Madrid', '28010',
  'hola@estudioaurora.tentare.app', '+34600000000', '#B5804A', 'ESTUDIO',
  '28017f85-60ca-49f1-9e9a-15cbfdc47491', 'estudio-aurora',
  'Estudio de pilates y yoga en el centro de Madrid. Estudio de demostración de Tentare, 100% ficticio.',
  2019, '08:00', '21:00'
)
on conflict (id) do update set
  nombre = excluded.nombre,
  slug = excluded.slug,
  owner_auth_user_id = excluded.owner_auth_user_id;

-- El trigger `trg_arrancar_prueba_gratuita` (BEFORE INSERT, migr
-- 20260819110611) ignora lo que mandemos y fija SIEMPRE
-- subscription_status='trialing' + trial_ends_at=now()+7 días para un
-- estudio sin cadena. Sin este UPDATE posterior, la demo caducaría sola a
-- los 7 días (el cron `cerrar-pruebas-vencidas` la pasaría a
-- 'trial_expirado' y `suscripcionActiva()` empezaría a bloquear features).
-- Se pisa aparte, DESPUÉS del INSERT, para que la demo no caduque nunca.
update public.studios
   set subscription_status = 'active',
       trial_ends_at = null,
       current_period_end = null
 where id = 'studio-demo';

-- Un estudio recién insertado tiene onboarding_descartado_en/
-- bienvenida_vista_en a NULL, así que /dashboard le antepone el asistente de
-- alta de 13 pasos ("¿Cuántos centros tienes?") en vez del panel real —
-- correcto para un estudio nuevo de verdad, pero inservible para grabar
-- capturas. Se marca como ya completado, igual que un estudio establecido.
update public.studios
   set onboarding_descartado_en = now(),
       bienvenida_vista_en = now()
 where id = 'studio-demo';

-- ── 2. Salas ─────────────────────────────────────────────────────────────
insert into public.salas (id, studio_id, nombre, capacidad, color) values
  ('sala-demo-reformer', 'studio-demo', 'Sala Reformer', 8, '#B5804A'),
  ('sala-demo-mat',      'studio-demo', 'Sala Mat',      12, '#6B8F71')
on conflict (id) do nothing;

-- ── 3. Tipos de clase ────────────────────────────────────────────────────
insert into public.tipos_clase (id, studio_id, nombre, color, duracion_minutos, descripcion, nivel) values
  ('tipo-demo-reformer', 'studio-demo', 'Reformer', '#B5804A', 50, 'Pilates con máquina reformer, grupos reducidos.', 'TODOS'),
  ('tipo-demo-mat',      'studio-demo', 'Mat Pilates', '#6B8F71', 55, 'Pilates en colchoneta, todos los niveles.', 'TODOS')
on conflict (id) do nothing;

-- ── 4. Instructoras ──────────────────────────────────────────────────────
-- La propietaria: vincula la cuenta auth ya existente de la demo. Rol
-- PROPIETARIO para que el panel se vea completo (Tentare Manager, sin
-- restricciones de permisos-reglas.ts).
insert into public.instructores (id, studio_id, nombre, email, rol, activo, auth_user_id, color) values
  ('instr-demo-propietaria', 'studio-demo', 'Aurora Reyes', 'demo@estudioaurora.tentare.app', 'PROPIETARIO', true, '28017f85-60ca-49f1-9e9a-15cbfdc47491', '#B5804A')
on conflict (id) do nothing;

-- Instructoras ficticias adicionales, sin cuenta auth real (solo ficha) —
-- para que las pantallas de equipo/sustituciones/calendario tengan reparto.
insert into public.instructores (id, studio_id, nombre, email, rol, activo, color) values
  ('instr-demo-nuria', 'studio-demo', 'Nuria Vidal', 'nuria.vidal@ejemplo-aurora.test', 'INSTRUCTOR', true, '#6B8F71'),
  ('instr-demo-laura', 'studio-demo', 'Laura Prieto', 'laura.prieto@ejemplo-aurora.test', 'INSTRUCTOR', true, '#8E6FA8')
on conflict (id) do nothing;

-- ── 5. Planes de tarifa ──────────────────────────────────────────────────
insert into public.planes_tarifa (id, studio_id, nombre, descripcion, precio, tipo, sesiones, activo, validez_dias) values
  ('plan-demo-mensual', 'studio-demo', 'Mensual Ilimitado', 'Clases ilimitadas al mes.', 59.00, 'MENSUAL', null, true, 30),
  ('plan-demo-bono10',  'studio-demo', 'Bono 10 sesiones', '10 clases a elegir, sin caducidad de cupo semanal.', 120.00, 'BONO', 10, true, 90)
on conflict (id) do nothing;

-- ── 6. Socias ficticias ──────────────────────────────────────────────────
-- Dominio @ejemplo-aurora.test a propósito: nunca datos reales de personas.
insert into public.socios (id, studio_id, nombre, apellidos, email, telefono, activo, fecha_alta) values
  ('socio-demo-1', 'studio-demo', 'Marta',  'Iglesias', 'marta.iglesias@ejemplo-aurora.test', '+34611000001', true, now() - interval '200 days'),
  ('socio-demo-2', 'studio-demo', 'Elena',  'Campos',   'elena.campos@ejemplo-aurora.test',   '+34611000002', true, now() - interval '160 days'),
  ('socio-demo-3', 'studio-demo', 'Sara',   'Bonet',    'sara.bonet@ejemplo-aurora.test',     '+34611000003', true, now() - interval '120 days'),
  ('socio-demo-4', 'studio-demo', 'Carla',  'Vidal',    'carla.vidal@ejemplo-aurora.test',    '+34611000004', true, now() - interval '90 days'),
  ('socio-demo-5', 'studio-demo', 'Nerea',  'Soto',     'nerea.soto@ejemplo-aurora.test',     '+34611000005', true, now() - interval '60 days'),
  ('socio-demo-6', 'studio-demo', 'Paula',  'Rico',     'paula.rico@ejemplo-aurora.test',     '+34611000006', true, now() - interval '30 days')
on conflict (id) do nothing;

-- ── 7. Suscripciones activas ─────────────────────────────────────────────
insert into public.suscripciones (id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes) values
  ('suscripcion-demo-1', 'studio-demo', 'socio-demo-1', 'plan-demo-mensual', 'ACTIVA', current_date - 10, current_date + 20, null),
  ('suscripcion-demo-2', 'studio-demo', 'socio-demo-2', 'plan-demo-mensual', 'ACTIVA', current_date - 5,  current_date + 25, null),
  ('suscripcion-demo-3', 'studio-demo', 'socio-demo-3', 'plan-demo-mensual', 'ACTIVA', current_date - 15, current_date + 15, null),
  ('suscripcion-demo-4', 'studio-demo', 'socio-demo-4', 'plan-demo-mensual', 'ACTIVA', current_date - 2,  current_date + 28, null),
  ('suscripcion-demo-5', 'studio-demo', 'socio-demo-5', 'plan-demo-bono10',  'ACTIVA', current_date - 20, current_date + 70, 6),
  ('suscripcion-demo-6', 'studio-demo', 'socio-demo-6', 'plan-demo-bono10',  'ACTIVA', current_date - 8,  current_date + 82, 8)
on conflict (id) do nothing;

-- ── 8. Sesiones futuras, por la mañana ───────────────────────────────────
-- Fechas RELATIVAS a hoy (current_date + N), en hora local de Madrid, para
-- que "clases futuras por la mañana" siga siendo cierto sin importar cuándo
-- se ejecute este script. ON CONFLICT DO UPDATE refresca inicio/fin en cada
-- pasada — así una demo vieja con clases ya pasadas se pone al día sola.
insert into public.sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, notas) values
  ('sesion-demo-1', 'studio-demo', 'tipo-demo-reformer', 'sala-demo-reformer', 'instr-demo-propietaria',
    ((current_date + 1) + time '08:00') at time zone 'Europe/Madrid', ((current_date + 1) + time '08:50') at time zone 'Europe/Madrid', 8, null),
  ('sesion-demo-2', 'studio-demo', 'tipo-demo-mat', 'sala-demo-mat', 'instr-demo-nuria',
    ((current_date + 1) + time '09:15') at time zone 'Europe/Madrid', ((current_date + 1) + time '10:10') at time zone 'Europe/Madrid', 12, null),
  ('sesion-demo-3', 'studio-demo', 'tipo-demo-reformer', 'sala-demo-reformer', 'instr-demo-laura',
    ((current_date + 2) + time '08:00') at time zone 'Europe/Madrid', ((current_date + 2) + time '08:50') at time zone 'Europe/Madrid', 8, null),
  ('sesion-demo-4', 'studio-demo', 'tipo-demo-mat', 'sala-demo-mat', 'instr-demo-propietaria',
    ((current_date + 2) + time '10:00') at time zone 'Europe/Madrid', ((current_date + 2) + time '10:55') at time zone 'Europe/Madrid', 12, null),
  ('sesion-demo-5', 'studio-demo', 'tipo-demo-reformer', 'sala-demo-reformer', 'instr-demo-nuria',
    ((current_date + 3) + time '08:00') at time zone 'Europe/Madrid', ((current_date + 3) + time '08:50') at time zone 'Europe/Madrid', 8, null),
  ('sesion-demo-6', 'studio-demo', 'tipo-demo-mat', 'sala-demo-mat', 'instr-demo-laura',
    ((current_date + 3) + time '09:15') at time zone 'Europe/Madrid', ((current_date + 3) + time '10:10') at time zone 'Europe/Madrid', 12, null),
  ('sesion-demo-7', 'studio-demo', 'tipo-demo-reformer', 'sala-demo-reformer', 'instr-demo-propietaria',
    ((current_date + 4) + time '08:00') at time zone 'Europe/Madrid', ((current_date + 4) + time '08:50') at time zone 'Europe/Madrid', 8, null),
  ('sesion-demo-8', 'studio-demo', 'tipo-demo-mat', 'sala-demo-mat', 'instr-demo-nuria',
    ((current_date + 4) + time '10:00') at time zone 'Europe/Madrid', ((current_date + 4) + time '10:55') at time zone 'Europe/Madrid', 12, null)
on conflict (id) do update set
  inicio = excluded.inicio,
  fin = excluded.fin,
  aforo_maximo = excluded.aforo_maximo;

-- ── 9. Reservas sobre esas sesiones ──────────────────────────────────────
insert into public.reservas (id, studio_id, sesion_id, socio_id, estado) values
  ('reserva-demo-1',  'studio-demo', 'sesion-demo-1', 'socio-demo-1', 'CONFIRMADA'),
  ('reserva-demo-2',  'studio-demo', 'sesion-demo-1', 'socio-demo-2', 'CONFIRMADA'),
  ('reserva-demo-3',  'studio-demo', 'sesion-demo-1', 'socio-demo-3', 'CONFIRMADA'),
  ('reserva-demo-4',  'studio-demo', 'sesion-demo-2', 'socio-demo-4', 'CONFIRMADA'),
  ('reserva-demo-5',  'studio-demo', 'sesion-demo-2', 'socio-demo-5', 'CONFIRMADA'),
  ('reserva-demo-6',  'studio-demo', 'sesion-demo-3', 'socio-demo-1', 'CONFIRMADA'),
  ('reserva-demo-7',  'studio-demo', 'sesion-demo-3', 'socio-demo-6', 'CONFIRMADA'),
  ('reserva-demo-8',  'studio-demo', 'sesion-demo-4', 'socio-demo-2', 'CONFIRMADA'),
  ('reserva-demo-9',  'studio-demo', 'sesion-demo-4', 'socio-demo-3', 'CONFIRMADA'),
  ('reserva-demo-10', 'studio-demo', 'sesion-demo-5', 'socio-demo-4', 'CONFIRMADA'),
  ('reserva-demo-11', 'studio-demo', 'sesion-demo-6', 'socio-demo-5', 'CONFIRMADA'),
  ('reserva-demo-12', 'studio-demo', 'sesion-demo-6', 'socio-demo-6', 'CONFIRMADA'),
  ('reserva-demo-13', 'studio-demo', 'sesion-demo-7', 'socio-demo-1', 'CONFIRMADA'),
  ('reserva-demo-14', 'studio-demo', 'sesion-demo-8', 'socio-demo-2', 'CONFIRMADA')
on conflict (id) do nothing;

-- ── 10. Recibos cobrados (sin Stripe real) ───────────────────────────────
-- Fechas relativas a hoy, refrescadas en cada pasada para que el dashboard
-- financiero de la demo enseñe siempre cobros "recientes".
insert into public.recibos (id, studio_id, socio_id, suscripcion_id, concepto, importe, estado, fecha_vencimiento, fecha_cobro, metodo_cobro, entrega_tipo) values
  ('recibo-demo-1', 'studio-demo', 'socio-demo-1', 'suscripcion-demo-1', 'Cuota mensual — Mensual Ilimitado', 59.00, 'COBRADO', current_date - 3, current_date - 3, 'TARJETA', 'MENSUAL'),
  ('recibo-demo-2', 'studio-demo', 'socio-demo-2', 'suscripcion-demo-2', 'Cuota mensual — Mensual Ilimitado', 59.00, 'COBRADO', current_date - 6, current_date - 6, 'TARJETA', 'MENSUAL'),
  ('recibo-demo-3', 'studio-demo', 'socio-demo-3', 'suscripcion-demo-3', 'Cuota mensual — Mensual Ilimitado', 59.00, 'COBRADO', current_date - 1, current_date - 1, 'SEPA', 'MENSUAL'),
  ('recibo-demo-4', 'studio-demo', 'socio-demo-4', 'suscripcion-demo-4', 'Cuota mensual — Mensual Ilimitado', 59.00, 'COBRADO', current_date - 9, current_date - 9, 'TARJETA', 'MENSUAL'),
  ('recibo-demo-5', 'studio-demo', 'socio-demo-5', 'suscripcion-demo-5', 'Bono 10 sesiones', 120.00, 'COBRADO', current_date - 20, current_date - 20, 'TARJETA', 'BONO'),
  ('recibo-demo-6', 'studio-demo', 'socio-demo-6', 'suscripcion-demo-6', 'Bono 10 sesiones', 120.00, 'COBRADO', current_date - 8, current_date - 8, 'TARJETA', 'BONO')
on conflict (id) do update set
  fecha_vencimiento = excluded.fecha_vencimiento,
  fecha_cobro = excluded.fecha_cobro;

commit;
