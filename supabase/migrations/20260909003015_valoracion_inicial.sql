-- VALORACIÓN INICIAL — lo que la alumna cuenta de sí misma antes de empezar.
--
-- Qué resuelve: hoy el estudio no sabe nada de una alumna nueva hasta que la
-- tiene delante. Esto le da objetivos, experiencia, nivel y —si ella lo
-- consiente— lo que hay que tener en cuenta de su cuerpo, antes de su primera
-- clase. La rellena ELLA, desde su app.
--
-- ════════════════════════════════════════════════════════════════════════════
-- LAS TRES DECISIONES QUE EXPLICAN ESTE FICHERO
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1 · TABLA NUEVA, NO `respuestas_cuestionario_salud`
--
-- La tentación era reutilizarla: es literalmente «un cuestionario que se le
-- hace a la socia» y su RLS ya está resuelta (20260812200000 + 20260831075322).
-- No encaja, por tres motivos, en orden de gravedad:
--
--   a) Lleva `unique (socio_id, pregunta_id)` y se escribe con upsert
--      (`dbUpsertRespuestaCuestionarioSalud`): UNA fila por pregunta, que se
--      SOBRESCRIBE. Eso es incompatible con lo único que de verdad se pide
--      aquí — conservar cómo llegó. Habría que romper ese UNIQUE, que es
--      justo lo que la hace funcionar hoy.
--   b) Su plantilla la edita la propietaria, con `on delete cascade` sobre
--      `pregunta_id`. Una propietaria borrando una pregunta destruiría la
--      valoración inicial de toda su cartera. La valoración es de forma FIJA;
--      esa tabla existe porque la suya es VARIABLE. Criterios opuestos.
--   c) Su INSERT es `current_rol() in ('PROPIETARIO','INSTRUCTOR')`. Abrirlo a
--      la socia obligaría a debilitar la política de toda la tabla, incluidas
--      las preguntas clínicas que solo debe rellenar el personal.
--
-- ⚠️ Y por lo tanto: ESTO NO ES LA FASE 2 del cuestionario de salud, ni la
-- desbloquea. `respuestas_cuestionario_salud` conserva intacto su INSERT
-- solo-staff, así que la medición que decide esa fase
-- (`lib/medicion-cuestionario-salud-fase2.ts`, ventana hasta el 2026-09-23)
-- sigue siendo válida y hay que dejarla correr.
--
-- 2 · DOS TABLAS, PORQUE SON DOS PERMISOS
--
-- Objetivos, experiencia y nivel NO son dato de salud, y RECEPCIÓN los necesita
-- en mostrador. Molestias y zonas SÍ lo son (RGPD art. 9) aunque las declare
-- ella misma, y `docs/FICHA-CLINICA.md §11` dice que RECEPCIÓN no ve detalle
-- clínico. En una sola tabla habría que elegir: o recepción pierde lo que
-- legítimamente necesita, o se le sirve detalle clínico por REST — que es el
-- agujero que cerró 0095. **La RLS es por fila, no por columna**, y este repo
-- ya lo aprendió dos veces: `instructor_tarifas` se separó de `instructores`
-- por esto mismo (#562), y está el caso de `REVOKE` por columna que no restaba
-- del `GRANT` de tabla.
--
-- Efecto secundario bueno: si NO da su consentimiento de salud, la mitad de
-- salud simplemente no se escribe y la valoración se completa igual. Un
-- consentimiento que hay que dar para poder seguir no es consentimiento.
--
-- 3 · APPEND-ONLY, Y `ACTUALIZADA` NO ES UNA COLUMNA
--
-- Una fila por valoración; nada actualiza una `COMPLETADA`. La inicial es la
-- completada más antigua y la actual la más reciente — las dos se DERIVAN
-- (`repartirHistorial`, lib/valoracion-inicial.ts). Guardar `ACTUALIZADA` como
-- estado permitiría que se desincronizara de las filas que describe.
--   · `PENDIENTE` = no hay fila. No se materializa una fila vacía por socia:
--     sería una fila por cada socia de la base para algo que la mayoría no
--     empezará. Mismo criterio que «ausencia de fila = encendido» en avisos.
--   · Como mucho UN borrador abierto por socia y estudio (índice parcial).

-- ── Interruptor por estudio ────────────────────────────────────────────────
-- Opt-in. Un estudio que no ha configurado nada no debe empezar a preguntarle
-- a sus clientas por lesiones: la pregunta misma es una decisión suya.
alter table public.studios
  add column if not exists valoracion_inicial_activa boolean not null default false;

comment on column public.studios.valoracion_inicial_activa is
  'Si la app de la alumna le ofrece rellenar su valoración inicial. Opt-in: por defecto NO. La mitad de salud además exige el consentimiento de la socia (tiene_consentimiento_salud).';

-- ── El texto de consentimiento de salud que firmó ──────────────────────────
-- Espejo de `consentimiento_marketing_texto`. En este repo la VIGENCIA de un
-- consentimiento se decide comparando el TEXTO guardado con el vigente, no un
-- número de versión (mismo mecanismo que `AceptacionContrato.versionTexto`):
-- así, el día que cambie el texto, deja de estar vigente solo.
--
-- ⚠️ Al leerla desde el panel, EXCLUIRLA de `FilaSocioPanel`
-- (lib/supabase-data.ts) igual que ya se hace con la de marketing: son ~2,7 KB
-- por fila dentro de `fetchAllStudioData`, que es camino caliente.
alter table public.socios
  add column if not exists consentimiento_salud_texto text;

comment on column public.socios.consentimiento_salud_texto is
  'El texto de consentimiento de datos de salud que aceptó, completo. NO un número de versión: la vigencia se decide comparando este texto con el actual, mismo mecanismo que aceptacion_version.';

-- ── La mitad que NO es dato de salud ───────────────────────────────────────
create table if not exists public.valoraciones_iniciales (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  estado text not null default 'EN_PROGRESO'
    check (estado in ('EN_PROGRESO', 'COMPLETADA')),
  objetivos text[] not null default '{}',
  objetivo_principal text,
  experiencia text check (experiencia in ('nunca','algunas_veces','habitual','bastante')),
  nivel text check (nivel in ('principiante','basico','intermedio','avanzado','no_segura')),
  actividad_habitual text not null default '',
  frecuencia text check (frecuencia in ('nada','menos_1','una_dos','tres_cuatro','cinco_mas')),
  expectativas text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Cuándo la dio por terminada. NULL mientras sea borrador; es lo que ordena
  -- el historial, y por eso no se usa `creado_en` para eso.
  completada_en timestamptz
);

create index if not exists idx_valoraciones_iniciales_socio
  on public.valoraciones_iniciales (socio_id, completada_en);
create index if not exists idx_valoraciones_iniciales_studio
  on public.valoraciones_iniciales (studio_id, estado);

-- Como mucho un borrador abierto por socia y estudio. Sin esto, salir y volver
-- a entrar abriría uno nuevo cada vez y «retomar» no sabría cuál retomar.
create unique index if not exists uniq_valoracion_borrador_por_socia
  on public.valoraciones_iniciales (socio_id, studio_id)
  where estado = 'EN_PROGRESO';

-- ── La mitad que SÍ es dato de salud (RGPD art. 9) ─────────────────────────
create table if not exists public.valoraciones_iniciales_salud (
  valoracion_id text primary key references public.valoraciones_iniciales(id) on delete cascade,
  -- studio_id y socio_id repetidos a propósito: la política de esta tabla los
  -- necesita para decidir por sí sola, sin un join a la tabla padre (que tiene
  -- otra política, más abierta — apoyarse en ella sería heredar SU criterio).
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  tiene_molestias boolean,
  zonas text[] not null default '{}',
  detalle text not null default '',
  -- ⚠️ «¿Cómo sientes tu cuerpo?» vive AQUÍ, y no en la tabla de al lado.
  -- Parece la pregunta más inocua de la valoración —ágil, algo rígida— hasta
  -- que se mira su quinta opción: `recuperandome`, «estoy recuperándome de
  -- algo». Eso es una condición de salud declarada. Con la columna en la mitad
  -- no clínica se preguntaba ANTES de la puerta del consentimiento y se pintaba
  -- en el bloque que ve RECEPCIÓN — o sea, justo lo que partir la valoración en
  -- dos existe para impedir, colado por una sola opción de una sola pregunta.
  -- No se arregla reescribiendo la opción: esa es precisamente la señal que le
  -- sirve a quien da la clase.
  estado_cuerpo text check (estado_cuerpo in ('agil','algo_rigida','bastante_rigida','recuperandome','no_segura')),
  creado_en timestamptz not null default now()
);

create index if not exists idx_valoraciones_salud_socio
  on public.valoraciones_iniciales_salud (socio_id);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LA ALUMNA NO NECESITA NINGUNA POLÍTICA, y eso quita la mitad de la
-- superficie de ataque. `lib/db/supabase-portal.ts` es un `AuthClient` PURO —
-- sin Postgrest, sin Storage, sin Realtime, y así a propósito— así que desde la
-- app de la alumna no se puede hacer un `.from('valoraciones_iniciales')` ni
-- queriendo. Sus lecturas y escrituras van por `/api/public/valoracion` con
-- service-role, y la cerradura es `socioAutenticado(userId, studioId)` en la
-- ruta. Mismo criterio que `crearReservaPublica`.
--
-- Por eso aquí NO hay ninguna política de INSERT/UPDATE/DELETE para
-- `authenticated`: nadie escribe estas tablas desde el panel. Si algún día la
-- propietaria tiene que corregir una respuesta, se añade ENTONCES un UPDATE
-- acotado — no se deja la puerta abierta por si acaso.
--
-- ⚠️ Esta migración NO crea ninguna función, así que el gotcha de
-- `pg_default_acl` (que da EXECUTE directo a anon/authenticated en toda función
-- SECURITY DEFINER nueva, y por el que `REVOKE ... FROM PUBLIC` no basta) no
-- aplica. `tiene_consentimiento_salud(text)` ya existe y ya está endurecida
-- (20260729161000 + 20260804201830). Si alguien envuelve esto en un
-- SECURITY DEFINER más adelante, necesita los tres pasos explícitos:
-- REVOKE FROM anon, REVOKE FROM authenticated, GRANT TO service_role, y
-- verificarlo con `has_function_privilege` para los tres.

alter table public.valoraciones_iniciales enable row level security;
alter table public.valoraciones_iniciales_salud enable row level security;

-- ⚠️ `revoke all` y luego `grant select` a secas — nunca `grant all`. El
-- default ACL de este proyecto da de más, y un GRANT de tabla no se resta por
-- columnas después.
revoke all on public.valoraciones_iniciales from anon, authenticated;
revoke all on public.valoraciones_iniciales_salud from anon, authenticated;
grant select on public.valoraciones_iniciales to authenticated;
grant select on public.valoraciones_iniciales_salud to authenticated;

-- Mitad NO clínica: TODO el personal del estudio, recepción incluida. Sin
-- comprobación de rol A PROPÓSITO — saber que una alumna es principiante y
-- viene por la postura es justo lo que necesita quien la recibe en mostrador,
-- y esconderlo detrás de `puedeVerFichaClinica` sería tratar como clínico algo
-- que no lo es.
create policy valoraciones_iniciales_lectura on public.valoraciones_iniciales
  for select to authenticated
  using (studio_id = current_studio_id());

-- Mitad clínica: el MISMO gate que `condiciones_salud` (20260829235608) —
-- estudio + rol + consentimiento vigente. Los tres, no dos.
create policy valoraciones_iniciales_salud_lectura on public.valoraciones_iniciales_salud
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

comment on table public.valoraciones_iniciales is
  'Lo que la alumna declara de sí misma (objetivos, experiencia, nivel). Append-only: una fila por vuelta; la inicial es la completada más antigua y la actual la más reciente. NO es dato de salud — su mitad clínica vive en valoraciones_iniciales_salud.';
comment on table public.valoraciones_iniciales_salud is
  'La mitad de la valoración que SÍ es dato de salud (RGPD art. 9): molestias, zonas y detalle. Tabla aparte porque su permiso de lectura es otro — rol clínico + consentimiento vigente, igual que condiciones_salud.';
