-- 20260930020000 · TENTARE — Veri*Factu por estudio: alta, y evidencia del poder IZ860
--
-- Vía decidida (30-sep-2026): cada estudio otorga, en la sede de la AEAT y con
-- SU certificado o Cl@ve, un poder «IZ860 · Remisión y consulta de registros de
-- facturación por servicio web» al NIF de una persona física (el apoderado),
-- que remite con su propio certificado cualificado. Fuentes:
--   · Descripción del servicio web VERI*FACTU v1.0.3, §4.1: «La remisión … podrá
--     ser efectuada por el obligado tributario, un apoderado suyo a este trámite
--     o un colaborador social».
--   · FAQ «Cuestiones generales: cumplimiento y delegación»: el apoderamiento
--     «debe estar inscrito en el registro de apoderamientos: ya bien sea con un
--     poder general o un poder específico para enviar los registros de VERI*FACTU».
--   · Relación de trámites apoderables de la AEAT: IZ860.
--
-- ⚠️ EL PODER REAL ESTÁ EN LA AEAT, NO AQUÍ. Tentare no lo concede ni puede
-- concederlo: no pide ni guarda credenciales del estudio. Estas tablas guardan
-- la EVIDENCIA de que existe (el CSV que da la sede al otorgarlo, fechas,
-- trámite, quién lo otorgó) y la verificación que hace el apoderado en «Consulta
-- de apoderamientos recibidos». Sin representación VERIFICADA y vigente, el
-- estudio no transmite (lib/verifactu/habilitacion.ts).
--
-- ⚠️ Los modelos normalizados de la Resolución de 18-dic-2024 (BOE-A-2024-27600)
-- NO sirven para esta vía: exigen que el representante sea «firmante o adherido
-- al Acuerdo de colaboración». El mandato privado que acepta la propietaria es
-- evidencia ADICIONAL, no la autorización.

-- ── verifactu_estudios: el estado Veri*Factu de cada estudio ────────────────
create table if not exists public.verifactu_estudios (
  studio_id text primary key references public.studios(id) on delete restrict,
  -- El NIF para el que se configura y se otorga el poder. Si el estudio cambia
  -- su NIF después, este deja de coincidir y el envío se bloquea: el poder es
  -- de un NIF concreto.
  nif text not null check (length(nif) = 9),
  -- Nombre o razón social EXACTOS del obligado, confirmados por la propietaria.
  nombre_fiscal text not null check (length(btrim(nombre_fiscal)) between 1 and 120),
  tipo_emisor text not null check (tipo_emisor in ('persona_fisica', 'sociedad', 'otra')),
  -- Se fija la primera vez (lib/verifactu/sif.ts) y no cambia: es parte de la
  -- identidad del SIF ante la AEAT.
  numero_instalacion text not null,
  estado text not null default 'PENDIENTE_AUTORIZACION' check (estado in (
    'SIN_CONFIGURAR', 'PENDIENTE_AUTORIZACION', 'AUTORIZACION_EN_REVISION',
    'VERIFICADO', 'PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT'
  )),
  estado_motivo text,
  activado_produccion_en timestamptz,
  activado_por uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint verifactu_estudios_instalacion_unica unique (nif, numero_instalacion)
);

comment on table public.verifactu_estudios is
  'Estado Veri*Factu por estudio (alta, autorización, producción, pausa). PRODUCCION solo lo activa Tentare, con el poder IZ860 verificado.';

-- ── verifactu_representaciones: la evidencia de cada poder ──────────────────
create table if not exists public.verifactu_representaciones (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete restrict,
  nif_representado text not null check (length(nif_representado) = 9),
  nombre_representado text not null,
  -- Quién otorgó el poder en la sede (la titular; en una sociedad, su representante legal).
  otorgante_nombre text not null,
  otorgante_nif text not null check (length(otorgante_nif) = 9),
  otorgante_cargo text not null check (otorgante_cargo in ('titular', 'representante_legal', 'apoderado_con_poder_suficiente')),
  -- A quién (el apoderado que remite).
  apoderado_nombre text not null,
  apoderado_nif text not null check (length(apoderado_nif) = 9),
  -- Alcance: el trámite IZ860 (específico) o el poder general del art. 46.2 LGT.
  tramite text not null check (tramite in ('IZ860', 'GENERAL_46_2')),
  via_aeat text not null default 'internet' check (via_aeat in ('internet', 'comparecencia', 'documento')),
  -- El CSV que da la sede de la AEAT al otorgar el poder (cotejable en la sede).
  csv_aeat text not null check (csv_aeat ~ '^[A-Za-z0-9]{8,40}$'),
  otorgado_en date not null,
  -- Máximo 5 años (Registro de apoderamientos: «periodo máximo de vigencia de cinco años»).
  vigente_hasta date not null,
  -- El mandato privado aceptado (evidencia adicional).
  mandato_version text not null,
  mandato_sha256 text not null check (mandato_sha256 ~ '^[0-9a-f]{64}$'),
  aceptado_por uuid not null,
  aceptado_en timestamptz not null default now(),
  aceptado_ip text,
  aceptado_user_agent text,
  -- La verificación del apoderado en la sede.
  referencia_aeat text,
  csv_cotejado boolean not null default false,
  verificado_por uuid,
  verificado_en timestamptz,
  estado text not null default 'EN_REVISION' check (estado in (
    'EN_REVISION', 'VERIFICADA', 'RECHAZADA_REVISION', 'REVOCADA', 'CADUCADA', 'RENUNCIADA', 'SIN_PODER_AEAT'
  )),
  estado_motivo text,
  revocada_en timestamptz,
  aviso_caducidad_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint verifactu_repr_fechas check (vigente_hasta > otorgado_en and vigente_hasta <= otorgado_en + interval '5 years'),
  constraint verifactu_repr_verificada check (estado <> 'VERIFICADA' or (verificado_por is not null and verificado_en is not null and csv_cotejado and referencia_aeat is not null))
);

-- Una sola representación viva (en revisión o verificada) por estudio.
create unique index if not exists uq_verifactu_repr_viva
  on public.verifactu_representaciones (studio_id) where estado in ('EN_REVISION', 'VERIFICADA');
create index if not exists idx_verifactu_repr_estudio on public.verifactu_representaciones (studio_id, creado_en desc);
create index if not exists idx_verifactu_repr_vigencia on public.verifactu_representaciones (vigente_hasta) where estado = 'VERIFICADA';

comment on table public.verifactu_representaciones is
  'Evidencia del poder IZ860 que cada estudio otorga en la sede de la AEAT (CSV, fechas, otorgante, apoderado) y su verificación. El poder real lo custodia la AEAT.';

-- ── verifactu_representacion_eventos: la traza, solo añadir ─────────────────
create table if not exists public.verifactu_representacion_eventos (
  id bigint generated always as identity primary key,
  studio_id text not null references public.studios(id) on delete restrict,
  representacion_id uuid references public.verifactu_representaciones(id) on delete restrict,
  evento text not null,
  actor_user_id uuid,
  actor_tipo text not null check (actor_tipo in ('propietaria', 'tentare', 'sistema')),
  ip text,
  user_agent text,
  datos jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_verifactu_repr_eventos on public.verifactu_representacion_eventos (studio_id, creado_en desc);

-- Solo añadir (la función `verifactu_solo_anadir` es de 20260930013000).
drop trigger if exists trg_verifactu_repr_eventos_solo_anadir on public.verifactu_representacion_eventos;
create trigger trg_verifactu_repr_eventos_solo_anadir
  before update or delete on public.verifactu_representacion_eventos
  for each row execute function public.verifactu_solo_anadir();

-- Una representación no se borra nunca (es evidencia); cambia de estado.
drop trigger if exists trg_verifactu_repr_sin_borrar on public.verifactu_representaciones;
create trigger trg_verifactu_repr_sin_borrar
  before delete on public.verifactu_representaciones
  for each row execute function public.verifactu_solo_anadir();

-- ── RLS y grants ────────────────────────────────────────────────────────────
-- Escritura SOLO con service_role, desde las rutas que comprueban el rol
-- (propietaria: /api/verifactu/estudio/*; Tentare: /api/interno/verifactu/*).
-- Lectura directa desde el cliente: ninguna en esta fase (todo va por API).
-- La PR 4 abre SELECT a la propietaria de SU estudio.
alter table public.verifactu_estudios enable row level security;
alter table public.verifactu_representaciones enable row level security;
alter table public.verifactu_representacion_eventos enable row level security;
revoke all on public.verifactu_estudios from public, anon, authenticated;
revoke all on public.verifactu_representaciones from public, anon, authenticated;
revoke all on public.verifactu_representacion_eventos from public, anon, authenticated;
grant select, insert, update on public.verifactu_estudios to service_role;
grant select, insert, update on public.verifactu_representaciones to service_role;
grant select, insert on public.verifactu_representacion_eventos to service_role;
revoke delete, truncate on public.verifactu_estudios from service_role;
revoke delete, truncate on public.verifactu_representaciones from service_role;
revoke update, delete, truncate on public.verifactu_representacion_eventos from service_role;
