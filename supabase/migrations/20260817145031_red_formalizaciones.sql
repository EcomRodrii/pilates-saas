-- Tentare Network — formalizar la contratación (siguiente fase tras #1069).
--
-- El chat (red_mensajes, 20260813183513) sirve para negociar clases,
-- horario y tarifa, pero no había forma de que ese acuerdo se convirtiera en
-- una ficha real de equipo. Pedido explícito del fundador: "en cuanto
-- consigan tener un chat y acorden [...] se crea la instructora en equipo".
--
-- Doble confirmación a propósito ("las 2 aceptan", cita literal) — una fila
-- por solicitud, con una marca de tiempo por cada parte. `red_solicitudes_
-- contacto.estado='aceptada'` ya significa "aceptó hablar", no "aceptó
-- trabajar": mezclar los dos habría roto la condición que ya usa la
-- mensajería para decidir si el hilo sigue abierto.
create table public.red_formalizaciones (
  id text primary key,
  solicitud_id text not null unique references public.red_solicitudes_contacto(id) on delete cascade,
  propuesto_por uuid not null references auth.users(id),
  tipo_contrato text not null check (tipo_contrato in ('temporal', 'indefinido')),
  estudio_confirmado_en timestamptz,
  instructora_confirmada_en timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'cancelada')),
  instructor_id text references public.instructores(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_red_formalizaciones_solicitud on public.red_formalizaciones (solicitud_id);

alter table public.red_formalizaciones enable row level security;

-- Mismo patrón de participante que red_mensajes: staff del estudio de la
-- solicitud, o la dueña del perfil — y solo mientras la solicitud siga
-- aceptada (si se cancela después, no tiene sentido seguir formalizando).
create policy red_formalizaciones_select on public.red_formalizaciones
  for select to authenticated
  using (
    exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_formalizaciones.solicitud_id
        and sc.estado = 'aceptada'
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = auth.uid())
        )
    )
  );

comment on table public.red_formalizaciones is
  'Tentare Network. Doble confirmación (estudio + instructora) para convertir un contacto aceptado en una ficha real de equipo. Sin política de INSERT/UPDATE para authenticated a propósito: la escritura (incluida la validación de qué lado confirma y el alta resultante en instructores) vive en app/api/network/formalizacion, con service-role — mismo criterio que red_resenas.';

-- ---------------------------------------------------------------------------

-- Tipo de contrato (temporal/indefinido) — hueco que no existía en
-- `instructores`. Nullable y sin default: las altas que no pasan por Network
-- (manuales, self-claim, cross-sede de P2-14) no tienen por qué rellenarlo.
alter table public.instructores
  add column tipo_contrato text check (tipo_contrato in ('temporal', 'indefinido'));
