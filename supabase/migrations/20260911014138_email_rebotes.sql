-- ─────────────────────────────────────────────────────────────────────────────
-- Qué pasó DESPUÉS de mandar el correo.
--
-- Hasta ahora, «enviado» en Tentare significaba «Resend aceptó la llamada».
-- No es lo mismo. Un correo aceptado con 200 puede no salir nunca:
--
--   · REBOTE (bounce): el buzón no existe. Medido el 11-sep-2026 en el aviso
--     de hueco a `fashionbeatriz553@email.com` — la propietaria quiso escribir
--     `@gmail.com`. Resend devolvió 200 y un id; el panel dijo «1 aviso
--     enviado»; el correo rebotó dos segundos después.
--   · SUPRIMIDO: tras un rebote, Resend añade la dirección a una lista de
--     supresión de la CUENTA y descarta los envíos siguientes en silencio,
--     también con 200. El mismo día, el aviso a `meri@gmail.com` salió así.
--
-- Ninguna de las dos cosas llegaba a Tentare: la cuenta tenía 30 direcciones
-- suprimidas y CERO webhooks configurados. Nadie en el producto podía saberlo,
-- ni la propietaria ni nosotros — y afecta a TODOS los correos (recordatorios,
-- facturas, accesos), no solo a los avisos de hueco.
--
-- Esta tabla es lo que el webhook (`/api/webhooks/resend`) apunta para que el
-- resto del producto pueda dejar de escribir a un buzón roto.
--
-- ⚠️ Va por DIRECCIÓN y es GLOBAL, no por socia ni por estudio, a propósito.
-- No es «esta persona»: es «este buzón rechaza el correo», que es un hecho del
-- buzón y vale igual para su ficha de socia, su ficha de instructora y el
-- estudio de al lado. Esto NO reabre «el email no es clave de relación»: las
-- relaciones siguen yendo por id; aquí la dirección ES el sujeto.
--
-- Y por eso mismo NO la puede leer el cliente: saber si una dirección
-- cualquiera rebota es información de la dirección, no del estudio que
-- pregunta. Se consulta desde servidor, acotada a las socias del estudio.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.email_rebotes (
  email        text primary key,
  -- REBOTE: el buzón no existe o lo rechaza de forma permanente.
  -- QUEJA: la persona lo marcó como spam — no volver a escribirle nunca.
  -- SUPRIMIDO: Resend lo descartó por su propia lista, sin intentarlo.
  tipo         text not null check (tipo in ('REBOTE', 'QUEJA', 'SUPRIMIDO')),
  -- El texto que da el proveedor, tal cual, para poder distinguir un buzón
  -- lleno de uno inexistente cuando haga falta mirarlo de verdad.
  motivo       text,
  -- El envío concreto que lo destapó, por si hay que ir a verlo a Resend.
  email_id     text,
  detectado_en timestamptz not null default now()
);

comment on table public.email_rebotes is
  'Direcciones de correo que el proveedor ha rechazado. Por DIRECCIÓN y global: '
  'es un hecho del buzón, no de una socia ni de un estudio. La escribe el webhook '
  'de Resend; solo service_role.';

alter table public.email_rebotes enable row level security;
-- Sin políticas: con RLS activada y los grants revocados, solo llega
-- service_role (que se salta RLS). `authenticated` va nombrado explícitamente
-- porque revocar de `public` NO le quita un grant que tenga directo.
revoke all on table public.email_rebotes from anon, authenticated, public;

create index if not exists email_rebotes_detectado_en on public.email_rebotes (detectado_en desc);
