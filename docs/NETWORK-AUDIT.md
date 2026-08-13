# Tentare Network — Auditoría previa (FASE 0)

Fecha: 2026-08-13. Este documento responde a una única pregunta antes de tocar
código: **¿qué de lo que ya existe en Tentare podemos reutilizar para
construir una red profesional de instructoras de Pilates, y qué es
genuinamente nuevo?**

No se ha creado ninguna tabla, RLS, endpoint ni componente todavía. Este
documento es el resultado de auditar el código real (migraciones, RLS,
funciones, componentes) — no es un diseño desde cero.

---

## 1. El hecho central que condiciona todo el diseño

`instructores` **no es la identidad global de una persona** — es una fila
por persona **por sede**. La constraint `UNIQUE(auth_user_id, studio_id)`
(`20260731003736_instructores_unique_auth_studio.sql`) lo dice explícito en
su propio comentario: una misma instructora tiene tantas filas en
`instructores` como sedes donde trabaja, cada una con su propio rol, tarifa
(`instructor_tarifas`) y disponibilidad.

Consecuencia directa: **Network no puede ser "una vista sobre `instructores`"**.
Una profesional en Network puede:
- no pertenecer a ningún estudio de Tentare todavía (freelance que nunca ha
  usado el panel),
- pertenecer a uno o varios estudios de Tentare (con una fila `instructores`
  por cada uno),
- querer un perfil visible a estudios *distintos* de aquellos donde ya
  trabaja.

La identidad de Network tiene que anclarse en **`auth_user_id`** (una persona
real, autenticada con Supabase Auth), no en `studio_id`. Esto es coherente
con cómo ya se lee `mis_estudios()` (ver §2) pero es una pieza nueva: hoy no
existe ningún objeto en el schema cuya clave natural sea "una persona,
independiente de la sede".

## 2. Lo que SÍ se reutiliza tal cual

| Necesidad | Infraestructura existente | Evidencia |
|---|---|---|
| Identidad/autenticación | Supabase Auth (`auth.users`), mismo proyecto, mismo JWT que usa el panel | `lib/auth-server.ts` |
| "Todas las sedes de una persona" | RPC `mis_estudios()`, ya devuelve `(id, nombre, slug, ciudad, rol)` por `auth.uid()` | `20260731004517_mis_estudios_incluye_rol.sql` |
| Foto de perfil | Bucket `avatars` (público, con política de path por propietario ya endurecida: `avatars_path_autorizado()` ya permite subir por `auth.uid()`, no solo por `studio_id` actual) | `20260730140022_avatars_valida_path_por_estudio.sql` |
| Validación/optimización de imagen | `lib/portal-storage.ts` (MIME whitelist, 5MB) + `lib/imagen-cliente.ts` (resize 512px, WebP 0.85, respeta EXIF) | ya usado por avatar de instructora y de socia |
| Notificaciones | Motor event-driven `lib/notifications/` (`catalog.ts`/`emit.ts`/`engine.ts`/`recipients.ts`), añadir un evento es mecánico | `docs/NOTIFICATION-ENGINE.md` |
| Emails | React Email + Resend, `remitentePorMarca()` ya soporta un nombre de producto nuevo sin tocar dominio | `lib/emails/remitente.ts` |
| Confirmación externa sin cuenta | Patrón de **token firmado de un solo uso** ya construido para `sustitucion_contactos` (una persona confirma/rechaza sin login) | `lib/sustituciones/` |
| Panel de moderación interna | `app/interno/` (backoffice de Tentare-empresa) ya tiene secciones equivalentes (`estudios`, `equipo`, `auditoria`) — mismo patrón de tabla+acciones | `app/interno/` |
| Precedente de "perfil público" | `instructores.bio` + `foto_url` ya se exponen hoy vía `mapInstructorPublico()`, que filtra por sustracción (quita `email`/`telefono`/`authUserId`) | `lib/db/supabase-data-admin.ts:234` |
| Patrón RLS | `studio_id = current_studio_id()` + `current_rol() in (...)`, consistente en decenas de migraciones — Network necesita el equivalente en `auth_user_id = auth.uid()` | ver §4 |

**Ranking de candidatas (precedente directo para el buscador de Network):**
`rankear_candidatas()` (SQL, `0038_sustituciones_scoring.sql`) ya puntúa
instructoras por afinidad de tipo de clase, carga de horas y frescura —
mismo espíritu que el ranking determinista pedido para Network (§8 del
plan), aunque hoy está acoplado 1:1 a `studio_id` y no sirve tal cual.

## 3. Lo que NO existe (confirmado por grep amplio, no por ausencia de búsqueda)

- Ningún directorio, marketplace o "red" de instructoras — solo hay activos
  de marca sin código (`docs/marca/productos/network/*.svg`).
- Ninguna tabla ni concepto de "especialidad de instructora" — `tipos_clase`
  es el catálogo de clases que imparte el ESTUDIO, no una taxonomía de
  disciplinas de una persona. No hay tampoco un catálogo global de
  especialidades (Reformer/Mat/Yoga/HIIT) en ningún sitio del código.
- Ningún sistema de "confirmar experiencia laboral" ni "referencia
  profesional" (grep de "verificar experiencia", "referencia profesional",
  "work history" → cero resultados).
- Ningún sistema de reportes/denuncias genérico.
- Ninguna columna de geolocalización en `studios` (solo `direccion`,
  `ciudad`, `codigo_postal`, texto libre, sin lat/lng).
- Ninguna sesión de staff "flotante" sin `studio_id` — `current_studio_id()`
  es la base de ~73 políticas RLS y no tiene hoy ningún tercer camino de
  resolución.
- Ninguna forma de que una instructora ajena a un estudio aparezca como
  candidata en `rankear_candidatas()` — el pool está filtrado por
  `studio_id` en SQL, no en TS.

## 4. Riesgos identificados

1. **Romper el patrón RLS dominante.** Todo el repo asume `studio_id` como
   el ámbito de aislamiento. Network introduce un segundo ámbito
   (`auth_user_id` del dueño del perfil) que convive con el primero
   (`studio_id` del estudio que busca/contacta/verifica). Mitigación: cada
   tabla nueva de Network declara explícitamente CUÁL de los dos ámbitos
   manda por operación (ver plan, §RLS) — nunca ambigüedad.
2. **Notificaciones sin estudio.** `NotificationEvent.studioId` es
   obligatorio hoy. Un evento dirigido a una profesional sin estudio activo
   (p. ej. "un estudio quiere contactarte") necesita o bien el `studio_id`
   del estudio que contacta (existe siempre, porque quien contacta es
   staff con sesión), o una extensión menor del motor si se quiere avisar a
   la profesional en su ausencia de sesión activa de staff. **No es un
   bloqueante**: en la mayoría de eventos de Network SIEMPRE hay un
   `studio_id` disponible (el del estudio implicado en la acción).
3. **Confundir "perfil completo" con "verificado".** Ya viene explícito en
   el encargo — se refuerza aquí como riesgo de diseño de UI, no de datos:
   badges y % de completitud deben ser conceptos visualmente distintos.
4. **SEO/indexación accidental.** Si las rutas públicas de perfil quedan
   accesibles sin sesión (`anon`), Google las indexa por defecto salvo
   `robots`. Mitigación en el plan: SELECT de perfiles `published` limitado
   a `authenticated` (cualquier sesión de staff de Tentare), no a `anon` —
   decisión de producto explícita de la Fase 0, revisable más adelante.
5. **Coste de Resend/Inngest.** Los eventos de notificación de Network
   (solicitud de verificación, solicitud de contacto, aceptación) se
   integran en el motor ya existente — no añaden infraestructura, pero sí
   volumen de emails/push. Bajo, comparable a `equipo`/`sustituciones`.
6. **Duplicar identidad si una persona ya es `instructores` en un estudio
   Tentare.** El perfil de Network se ancla a `auth_user_id`, no importa el
   estudio activo — una persona que ya tiene sesión de staff en cualquier
   estudio ya tiene `auth.uid()` resoluble y puede crear su perfil de
   Network sin fricción adicional. No hay sincronización automática de
   nombre/foto/bio entre `instructores` y el perfil de Network (mismo
   principio ya aplicado en P2-14: "sincronizar nombre/avatar entre filas de
   la misma persona contradice permisos distintos por sede" — aquí aplica
   igual, son dos contextos distintos con datos que pueden divergir
   legítimamente).

## 5. Entidades nuevas realmente necesarias (adelanto — desarrollado en el plan)

Ninguna de las siguientes existe ya en ninguna forma:

- `red_perfiles` — identidad profesional pública, 1 fila por `auth_user_id`.
- `red_experiencias` — historial laboral declarado.
- `red_verificaciones_experiencia` — solicitud/confirmación de una experiencia.
- `red_referencias` — solicitud/confirmación de una referencia profesional.
- `red_solicitudes_contacto` — un estudio contacta a una profesional.
- `red_reportes` — moderación.

Especialidades: **no se crea tabla nueva** — catálogo fijo en TypeScript
(mismo patrón que `ROLES_VALIDOS` en `app/api/equipo/route.ts` o
`tipos_clase.nivel`), evolucionable sin migración.

## 6. Coste incremental estimado

- **Infraestructura**: 0 €. Todo vive en el mismo proyecto Supabase, mismo
  bucket de Storage, mismo Resend, mismo Inngest/pg_cron ya contratados.
- **Volumen**: 6 tablas nuevas, ~4-6 migraciones, sin servicio externo.
- **Verificación de identidad (Badge 5)**: deliberadamente NO se construye
  en V1. Se reserva una columna (`identidad_verificada_en timestamptz`,
  siempre `null`) para no tener que migrar el schema el día que se decida
  abordarlo — sin comprometerse a ningún proveedor.

Ver `docs/NETWORK-IMPLEMENTATION-PLAN.md` para el diseño completo.
