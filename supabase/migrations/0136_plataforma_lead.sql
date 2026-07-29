-- ─────────────────────────────────────────────────────────────────────────────
-- Los leads de Tentare (no los de un estudio: esos son `socios.lead_stage`).
--
-- Hasta ahora el único canal de entrada real —el concierge de migración de la
-- landing— mandaba un correo a soporte@tentare.app y no guardaba nada. Dos
-- consecuencias:
--
--   · si `RESEND_API_KEY` no está puesta, la ruta devolvía `{ok:true}` y el
--     lead **se perdía en silencio** mientras la visitante leía "Recibido, te
--     escribimos en menos de 24h";
--   · aun funcionando, el lead vivía en una bandeja de correo. No hay estado,
--     no hay siguiente paso, y no se puede responder a "¿cuántos entraron este
--     mes y cuántos se convirtieron?".
--
-- Esta tabla es el sitio donde caen. `estado` y `origen` son CHECK y no tablas
-- de catálogo a propósito: son media docena de valores que cambian una vez al
-- año, y una FK aquí solo añadiría un join a cada consulta.
--
-- RLS activa y CERO políticas, igual que `plataforma_admin` (migr
-- 20260725170000): deny by default. Solo el service-role entra, y solo después
-- de que `exigirPermiso` haya validado el permiso en el servidor. Un lead lleva
-- el email y el teléfono de una persona que todavía no es clienta — no tiene
-- por qué ser legible desde ningún tenant.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plataforma_lead (
  id               text primary key,
  email            text not null,
  nombre           text,
  -- El nombre del negocio, que casi nunca coincide con el de la persona.
  estudio          text,
  telefono         text,
  ciudad           text,
  -- De qué software viene. Es la pregunta que más dice del lead: quien viene de
  -- Momence tiene un export y prisa; quien viene de un Excel, ninguna de las dos.
  software_actual  text,
  mensaje          text,
  origen           text not null default 'MANUAL'
                     check (origen in ('CONCIERGE', 'ALTA', 'SOPORTE', 'MANUAL', 'REFERIDO')),
  estado           text not null default 'NUEVO'
                     check (estado in ('NUEVO', 'CONTACTADO', 'DEMO', 'PRUEBA', 'CLIENTE', 'PERDIDO')),
  -- Solo se rellena al marcar PERDIDO. Sin esto, el embudo dice cuántos se
  -- caen pero no por qué, que es lo único accionable.
  motivo_perdida   text,
  proximo_paso     text,
  proxima_fecha    date,
  -- Cuando el lead se convierte en estudio. `on delete set null`: borrar un
  -- estudio no debe borrar la historia de cómo llegó.
  studio_id        text references public.studios(id) on delete set null,
  notas            text,
  -- Quién lo lleva. Sin FK a plataforma_admin: si esa persona se va del equipo,
  -- el lead no se puede quedar huérfano ni bloquear su baja.
  responsable      uuid,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- Un email es un lead, no varios. El concierge es público: sin esto, recargar
-- el formulario tres veces crea tres leads y la bandeja deja de servir.
--
-- Sobre la columna tal cual, NO sobre `lower(email)`: el concierge hace un
-- upsert con `ON CONFLICT (email)`, y Postgres solo casa eso con un índice
-- sobre la propia columna — con uno de expresión, el upsert falla en tiempo de
-- ejecución. Las mayúsculas se resuelven en el otro lado: todo lo que escribe
-- en esta tabla normaliza a minúsculas antes de guardar.
create unique index if not exists uq_plataforma_lead_email
  on public.plataforma_lead (email);

-- La consulta de la pantalla: los que están vivos, por fecha.
create index if not exists idx_plataforma_lead_estado
  on public.plataforma_lead (estado, creado_en desc);

alter table public.plataforma_lead enable row level security;
revoke all on public.plataforma_lead from public, anon, authenticated;

comment on table public.plataforma_lead is
  'Leads de Tentare (empresa). RLS sin políticas: solo service-role tras validar permiso en el servidor.';
