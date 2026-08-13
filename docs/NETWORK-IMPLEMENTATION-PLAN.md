# Tentare Network — Plan de implementación

Depende de `docs/NETWORK-AUDIT.md`. No implementar sin aprobación explícita
del fundador sobre este documento.

---

## 0. Principio rector

Cada pieza nueva se justifica frente a la pregunta: *¿podemos hacerlo con lo
que ya existe?* Cuando la respuesta ha sido sí, no aparece aquí como tabla
nueva (ver auditoría §2). Lo que sigue es solo lo que de verdad no existe.

## 1. Identidad: `red_perfiles`

Un perfil = una persona real, independiente de a cuántos estudios
pertenezca.

```sql
create table red_perfiles (
  id text primary key,                      -- generado en TS, igual que el resto del repo
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombre text not null,
  foto_url text,
  ciudad text,
  zona text,                                 -- ej. "Gràcia" — barrio/distrito, texto libre
  radio_km integer,                          -- null = sin especificar
  descripcion text,
  especialidades text[] not null default '{}', -- catálogo fijo, ver §2
  anios_experiencia integer,
  tarifa_rango text,                         -- '20-25' | '25-30' | '30-35' | 'a_negociar' | null
  disponibilidad_estado text not null default 'no_disponible',
    -- 'disponible' | 'disponible_sustituciones' | 'buscando_trabajo' | 'no_disponible'
  disponibilidad_horarios text[] not null default '{}', -- subset de 'mananas'|'tardes'|'noches'|'fines_semana'
  tipo_trabajo text[] not null default '{}',  -- subset de 'jornada_completa'|'media_jornada'|'freelance'|'sustituciones'|'clases_puntuales'
  email_contacto text,                        -- PRIVADO — solo se revela tras aceptar una solicitud de contacto (§6)
  telefono_contacto text,                     -- PRIVADO — idem
  estado text not null default 'draft',      -- 'draft' | 'published' | 'hidden' | 'suspended'
  identidad_verificada_en timestamptz,        -- reservado Badge 5, siempre null en V1
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_acceso_en timestamptz                -- para el badge "activa recientemente", actualizado al editar/publicar
);
create index on red_perfiles (ciudad) where estado = 'published';
create index on red_perfiles (disponibilidad_estado) where estado = 'published';
```

**Por qué no reutilizar `instructores.bio`/`foto_url`**: `instructores` no
tiene identidad propia fuera de una sede (auditoría §1); una persona sin
ningún estudio Tentare no tiene NINGUNA fila en `instructores` a la que
enganchar un perfil. Y una persona con varias filas (multi-sede) tendría
bio/foto potencialmente distintas por sede — Network necesita UNA verdad,
no N. Se acepta la divergencia (el perfil de Network puede tener una foto
distinta a la de `instructores` en tal o cual estudio) por el mismo
principio que ya cerró P2-14 para nombre/avatar entre sedes.

**Completitud (`% perfil`)**: se calcula en TS, no se persiste (evita
desincronización). Pesos: datos básicos 20 · foto 10 · especialidades 15 ·
experiencia 20 · disponibilidad 15 · tarifa 10 · preferencias(tipo_trabajo)
10. Expuesto en la propia pantalla de edición, nunca junto a los badges de
verificación (riesgo #3 de la auditoría).

## 2. Especialidades — catálogo fijo, sin tabla nueva

```ts
// lib/network/especialidades.ts
export const ESPECIALIDADES_NETWORK = [
  'reformer', 'mat', 'maquina', 'yoga', 'hiit', 'otro',
] as const
```
Mismo patrón que `ROLES_VALIDOS`/`tipos_clase.nivel`: constante TS validada
en el endpoint, sin migración para añadir una disciplina. Si en el futuro
hace falta gestionarlo desde el admin, se convierte en tabla — no antes.

## 3. Experiencia laboral: `red_experiencias`

```sql
create table red_experiencias (
  id text primary key,
  perfil_id text not null references red_perfiles(id) on delete cascade,
  studio_id text references studios(id) on delete set null,  -- si es un estudio Tentare real
  nombre_estudio text not null,               -- siempre se guarda en texto, incluso si studio_id existe (histórico estable si el estudio se borra)
  fecha_inicio date not null,
  fecha_fin date,                             -- null = actualidad
  especialidades text[] not null default '{}',
  descripcion text,
  estado_verificacion text not null default 'sin_solicitar',
    -- 'sin_solicitar' | 'pendiente' | 'confirmada' | 'rechazada'
  creado_en timestamptz not null default now()
);
create index on red_experiencias (perfil_id);
```

`studio_id` es nullable a propósito: una experiencia en un estudio que
nunca ha usado Tentare debe poder registrarse igual, solo que no será
verificable en V1 (no hay a quién pedir confirmación sin cuenta destino) —
el botón "Verificar experiencia" se deshabilita si `studio_id is null`, con
copy explicativo. Documentado como límite conocido, no como bug.

## 4. Verificación de experiencia: `red_verificaciones_experiencia`

```sql
create table red_verificaciones_experiencia (
  id text primary key,
  experiencia_id text not null references red_experiencias(id) on delete cascade,
  studio_id text not null references studios(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id), -- auth_user_id del perfil
  solicitado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users(id),            -- staff del estudio que confirmó/rechazó
  estado text not null default 'pendiente',                -- 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada'
  unique (experiencia_id)  -- una experiencia solo tiene una solicitud viva a la vez
);
```

Auditable por diseño (pedido explícito): `solicitado_en/resuelto_en/
resuelto_por` bastan, sin tabla de eventos aparte — mismo nivel de detalle
que `sustituciones.aprobada_por/aprobada_at`.

Flujo: la profesional pulsa "Verificar experiencia" → si `studio_id` es un
estudio Tentare real, se crea la fila y se emite el evento
`RED_VERIFICACION_SOLICITADA` (audiencia: PROPIETARIO/MANAGER de ese
estudio, mismo resolver que ya usa `recipients.ts` para `propietaria()` +
`RECEPCION` excluida a propósito — verificar experiencia es una decisión de
gerencia, no de mostrador). El estudio confirma/rechaza desde una pantalla
nueva en su panel (`/equipo/verificaciones-network` o una card en
`/equipo`) — **no** necesita cuenta de la profesional del lado del
verificador, ya tiene sesión de staff.

## 5. Referencias profesionales: `red_referencias`

Mismo patrón que `red_verificaciones_experiencia`, pero el "confirmador" no
tiene por qué ser un estudio Tentare — puede ser cualquier persona con
email. Aquí SÍ hace falta el patrón de token firmado ya usado en
`sustitucion_contactos` (confirmar sin cuenta):

```sql
create table red_referencias (
  id text primary key,
  perfil_id text not null references red_perfiles(id) on delete cascade,
  nombre_referente text not null,
  email_referente text not null,
  relacion text,                              -- ej. "Directora de estudio", texto libre corto
  token text not null unique,                 -- firmado, un solo uso, mismo mecanismo que sustitucion_contactos
  token_expira_en timestamptz not null,
  solicitado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  estado text not null default 'pendiente'    -- 'pendiente' | 'confirmada' | 'rechazada' | 'expirada'
);
```

Sin estrellas, sin comentario libre visible públicamente del referente —
solo el hecho binario "confirmado" (pedido explícito: nada de reputación
tóxica). El email al referente reutiliza plantilla React Email nueva bajo
`emails/red-referencia-solicitud.tsx`, mismo remitente vía
`remitentePorMarca('network')`.

## 6. Contacto: `red_solicitudes_contacto`

```sql
create table red_solicitudes_contacto (
  id text primary key,
  perfil_id text not null references red_perfiles(id) on delete cascade,
  studio_id text not null references studios(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id), -- staff que contacta
  mensaje text,
  estado text not null default 'pendiente',    -- 'pendiente' | 'aceptada' | 'rechazada'
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);
create unique index on red_solicitudes_contacto (perfil_id, studio_id) where estado = 'pendiente';
```

Al aceptar: se emite `RED_CONTACTO_ACEPTADO` con audiencia el `studio_id`
solicitante, y el email/plantilla incluye `email_contacto`/
`telefono_contacto` del perfil **solo en ese envío** — no se expone nunca
por API a listados ni al detalle público del perfil. No se construye un
sistema de mensajería propio (fuera de alcance V1, pedido implícito por
"sin depender de servicios externos" + KISS): el contacto real ocurre por
email/teléfono una vez aceptada la solicitud, igual que hoy ocurre con
`sustitucion_contactos`.

## 7. Reportes y moderación: `red_reportes`

```sql
create table red_reportes (
  id text primary key,
  perfil_id text not null references red_perfiles(id) on delete cascade,
  reportado_por uuid references auth.users(id),  -- null si el reporte es anónimo desde el portal público (no lo es: requiere sesión, ver RLS)
  motivo text not null,  -- 'informacion_falsa'|'suplantacion'|'spam'|'comportamiento'|'fraude'|'otro'
  detalle text,
  estado text not null default 'pendiente',  -- 'pendiente' | 'revisado' | 'resuelto'
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users(id)  -- admin de app/interno
);
```

Moderación en `app/interno/network/` (nueva sección, mismo patrón de tabla +
acciones que `app/interno/equipo`): listar perfiles, ocultar/suspender/
restaurar, ver verificaciones pendientes/confirmadas/rechazadas, ver
reportes pendientes/revisados/resueltos. Reutiliza el layout y los
componentes de tabla ya existentes en `app/interno`.

## 8. Ranking de búsqueda — determinista, documentado, sin IA

Orden de prioridad pedido: disponibilidad → especialidad → ubicación →
experiencia → verificaciones → actividad. Se implementa como **comparador
por tuplas** (no como score único ponderado) para que el criterio sea
literal y auditable, evolucionable a un score ponderado más adelante sin
romper el contrato de la función:

```ts
// lib/network/ranking.ts
function clavesOrden(p: PerfilNetwork, filtro: FiltroBusqueda) {
  return [
    -prioridadDisponibilidad(p.disponibilidadEstado),      // disponible > sustituciones > buscando > no_disponible
    -coincidenciaEspecialidad(p.especialidades, filtro.especialidad), // 1 si coincide, 0 si no
    distanciaAproximada(p.ciudad, p.zona, filtro.ciudad),  // más cerca primero (por ciudad/zona, sin lat/lng en V1)
    -p.aniosExperiencia,
    -contarBadgesVerificacion(p),
    -actividadRecienteScore(p.ultimoAccesoEn),
  ]
}
```

`distanciaAproximada` en V1 es una comparación de texto (`ciudad` exacta
primero, luego resto) — **no** geocodificación real (cero coste, cero
proveedor externo). Documentado como límite conocido; el `radio_km` se
guarda desde ya para cuando exista lat/lng.

## 9. RLS — dos ámbitos conviviendo, nunca ambiguos

| Tabla | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `red_perfiles` | dueño (`auth_user_id = auth.uid()`) siempre; `estado = 'published'` visible a cualquier `authenticated` (staff logueado, no `anon` — evita indexación, auditoría riesgo #4) | solo dueño |
| `red_experiencias` | igual que el perfil padre | solo dueño del perfil |
| `red_verificaciones_experiencia` | dueño del perfil O staff del `studio_id` con `puede_gestionar_equipo()` | INSERT: dueño del perfil. UPDATE (resolver): staff del `studio_id` con `puede_gestionar_equipo()` — mismo criterio ya usado en `instructor_tarifas` |
| `red_referencias` | dueño del perfil (el referente resuelve por token firmado, vía función `SECURITY DEFINER`, no por RLS de usuario) | INSERT: dueño del perfil. UPDATE: solo la función de resolución de token |
| `red_solicitudes_contacto` | dueño del perfil O staff del `studio_id` solicitante | INSERT: staff del `studio_id` con sesión activa. UPDATE (aceptar/rechazar): solo dueño del perfil |
| `red_reportes` | solo admin interno (`app/interno`, service-role) | INSERT: cualquier `authenticated` (staff logueado); nunca `anon` |

Ninguna política nueva reutiliza `current_studio_id()` como ámbito del
perfil — se introduce el equivalente `auth_user_id = auth.uid()` de forma
explícita en cada policy, siguiendo la advertencia de la auditoría (riesgo
#1). `puede_gestionar_equipo()` ya existe (`20260731110000_instructor_tarifas.sql`)
y se reutiliza tal cual para decidir qué staff puede resolver
verificaciones de SU estudio.

⚠️ Aplica el gotcha ya documentado en memoria: cualquier función
`SECURITY DEFINER` nueva (resolución de token de referencia, por ejemplo)
necesita `REVOKE ... FROM PUBLIC` + `GRANT` explícito a los roles que
correspondan, verificado con `has_function_privilege` antes de mergear.

## 10. Notificaciones — eventos nuevos

Añadidos a `lib/notifications/catalog.ts`, siguiendo el patrón existente
(categoría, canales, audiencia, plantilla por rol):

| Evento | Audiencia | Canal |
|---|---|---|
| `RED_VERIFICACION_SOLICITADA` | PROPIETARIO/MANAGER del `studio_id` | PUSH + EMAIL |
| `RED_EXPERIENCIA_CONFIRMADA` | dueño del perfil (`auth_user_id`) | PUSH + EMAIL |
| `RED_EXPERIENCIA_RECHAZADA` | dueño del perfil | PUSH |
| `RED_REFERENCIA_CONFIRMADA` | dueño del perfil | PUSH + EMAIL |
| `RED_CONTACTO_SOLICITADO` | dueño del perfil | PUSH + EMAIL |
| `RED_CONTACTO_ACEPTADO` | staff del `studio_id` solicitante | PUSH + EMAIL (incluye contacto) |

Todos tienen `studioId` resoluble (el del estudio implicado en cada acción),
así que no hace falta tocar `NotificationEvent.studioId` obligatorio (riesgo
#2 de la auditoría resuelto sin cambios al motor). Para eventos dirigidos al
`auth_user_id` de la profesional (no a un rol de estudio), se añade un
resolver nuevo en `recipients.ts`: `porAuthUserId(authUserId)` — pequeño,
no rompe el contrato existente.

## 11. Rutas y componentes

```
app/network/                          -- área pública/semi-pública, requiere sesión de staff (authenticated)
  page.tsx                            -- buscador (Server Component, filtros en searchParams)
  [perfilId]/page.tsx                 -- perfil público de una profesional
  mi-perfil/page.tsx                  -- edición del propio perfil (requiere auth_user_id, cualquier sesión de staff)
  mi-perfil/experiencia/page.tsx      -- gestión de experiencias
  solicitudes/page.tsx                -- solicitudes de contacto recibidas (para la profesional)

app/(dashboard)/equipo/verificaciones-network/page.tsx  -- cola de verificaciones para el estudio
app/interno/network/page.tsx          -- moderación (perfiles, verificaciones, reportes)

app/api/network/
  perfil/route.ts                     -- GET/PUT del propio perfil
  buscar/route.ts                     -- GET resultados de búsqueda (filtros)
  experiencia/route.ts                -- POST/DELETE experiencias
  experiencia/verificar/route.ts      -- POST solicitar verificación
  verificaciones/resolver/route.ts    -- POST confirmar/rechazar (staff del estudio)
  referencia/route.ts                 -- POST solicitar
  referencia/resolver/route.ts        -- POST confirmar por token (sin sesión, como sustituciones)
  contacto/route.ts                   -- POST solicitar / PUT aceptar-rechazar
  reportes/route.ts                   -- POST crear reporte

components/network/
  perfil-publico.tsx | tarjeta-resultado.tsx | filtros-busqueda.tsx (drawer en móvil)
  badge-verificacion.tsx | barra-completitud.tsx | formulario-experiencia.tsx
```

Server Components para listar/leer (buscador, perfil público); Client
Components solo donde hay interacción (filtros, formularios, botones de
contacto/verificar). Mismo patrón ya usado en `/portal`.

## 12. Storage

Reutiliza el bucket `avatars` existente. Se añade un prefijo nuevo de path,
`network-<perfilId>-<timestamp>.<ext>`, y se extiende
`avatars_path_autorizado()` para reconocerlo, autorizado si
`auth.uid() = (select auth_user_id from red_perfiles where id = <perfilId>)`.
Misma validación de MIME/tamaño (`lib/portal-storage.ts`) y mismo resize
client-side (`lib/imagen-cliente.ts`, 512px WebP) — cero código nuevo de
procesado de imagen.

## 13. Mobile

- Buscador: filtros en `drawer` (mismo componente ya usado en el catálogo
  público de clases), resultados en `cards` apiladas.
- Perfil público: orden de información — foto+nombre+disponibilidad arriba,
  CTA "Contactar" fijo/sticky en la parte inferior en ≤430px (mismo patrón
  que el CTA de reserva en `/reservar`).
- Formularios de experiencia/perfil: un campo por pantalla lógica, mismo
  criterio que `mi-perfil` actual.

## 14. Privacidad — resumen operativo

**Público** (con sesión de staff, no con `anon`): nombre, foto, ciudad/zona,
especialidades, años de experiencia, disponibilidad, tarifa (si se decide
mostrar), badges, actividad reciente (sin hora exacta — solo el punto
🟢/gris).

**Privado siempre**: email/teléfono de contacto (solo se libera al aceptar
una solicitud, y solo al solicitante), dirección exacta (nunca se pide),
`auth_user_id`, cualquier reporte recibido, historial de solicitudes
rechazadas.

**Control de la profesional**: `estado` (`draft`/`published`/`hidden`/
`suspended` — este último solo lo pone moderación) + borrado de su propio
perfil (DELETE en cascada de experiencias/verificaciones/referencias
propias; las solicitudes de contacto ya resueltas se conservan anonimizadas
para auditoría de moderación, mismo criterio que otros borrados blandos del
repo).

## 15. Tests

- Unitarios (`node --test --experimental-strip-types`) en `lib/network/*.test.ts`:
  completitud de perfil, ranking determinista (casos límite: sin
  especialidades, sin ubicación, empates), catálogo de especialidades.
- E2E (Playwright, `page.route` mockeado): flujo profesional publica
  perfil → estudio busca y filtra → estudio contacta → profesional acepta →
  estudio recibe contacto. Incluir un test de camino de fallo (4xx) CON
  contador de intentos (`expect(intentos).toBeGreaterThan(0)`, reutilizando
  el andamiaje de `e2e/socia-lista.ts` donde aplique un patrón similar).
  `/network` es pantalla de staff autenticado, no pública — **no** entra en
  el proyecto `webkit-publico` salvo que en el futuro se decida abrir un
  perfil público sin sesión (fuera de V1).

## 16. Riesgos de este plan (más allá de los ya listados en la auditoría)

- **Unicidad de perfil por persona**: `red_perfiles.auth_user_id unique`
  impide que alguien tenga dos perfiles — correcto, pero si una persona
  pierde acceso a su cuenta de Auth (email cambiado, etc.) pierde su
  perfil. Mismo riesgo que ya asume el resto del repo con `auth_user_id`,
  no es nuevo de Network.
- **Verificación de experiencia en estudios no-Tentare queda coja en V1**
  (documentado en §3) — aceptado explícitamente para mantener coste 0€.
- **Sin geolocalización real**: el filtro de "radio_km" se guarda pero no
  se usa para calcular distancia real hasta que exista lat/lng — se
  documenta para no generar expectativa de precisión que no existe.

## 17. Fases de implementación (orden sugerido, cada una cerrable y verificable)

1. Arquitectura y BD — este documento + migraciones de las 6 tablas + RLS.
2. Perfil profesional — CRUD `red_perfiles`, completitud, foto.
3. Publicación — estados draft/published/hidden + validación mínima para publicar.
4. Buscador — `/network`, listado con filtros básicos.
5. Filtros — especialidad/ubicación/disponibilidad/horario/tipo/experiencia/verificación.
6. Experiencia — CRUD `red_experiencias`.
7. Verificación por estudios — `red_verificaciones_experiencia` + pantalla en `/equipo`.
8. Badges — cálculo y render (email/perfil completo/experiencia/referencia/actividad).
9. Contacto — `red_solicitudes_contacto` + notificaciones.
10. Reportes y moderación — `red_reportes` + `app/interno/network`.
11. Preparación para sustituciones — documentado en
    `docs/NETWORK-SUSTITUCIONES-EXTENSION.md`: punto de extensión en
    `crearBaja()`/`lib/sustituciones/baja.ts` (nunca en `rankear_candidatas`
    en sí), el gap real de mapeo `tipos_clase` ↔ `red_perfiles.especialidades`
    que hay que resolver antes de construirlo, y por qué los pools interno y
    de Network se mantienen separados en vez de fusionar un único ranking.
    Sin tocar código de sustituciones — solo el documento.

Cada fase se cierra con: `tsc --noEmit`, `node --test`, verificación en
navegador real (móvil + escritorio) antes de pasar a la siguiente — mismo
loop de calidad que el resto del repo (`.claude/tentare-os.md`).

---

**STOP.** No implementar sin revisión y aprobación explícita de este plan.
