# Auditoría 35ª pasada — 2026-09-09

## Área elegida y por qué

**Tentare Network** (`app/api/network/**`, `app/api/interno/network/**`,
`lib/network/**`, tablas `red_*`) — el marketplace de instructoras/estudios
(perfiles, candidaturas, vacantes, contacto, mensajería, verificación de
identidad/experiencia/certificaciones, reseñas, favoritos, referencias).

No estaba en la lista de zonas ya barridas (POS/Bizum, SEPA/dunning/nómina,
gamificación, checkout/matrícula/legal, OAuth, comunidad/mensajería *de
estudio*, Veri*Factu, reservas/penalizaciones). Tiene actividad reciente real
(rediseño en 6 fases hasta #1532/#1538/#1539, más una ronda de auditoría propia
el 31-ago que cerró/documentó varios hallazgos) y superficie de seguridad
genuina: documentos de identidad (DNI/pasaporte), datos de contacto privados,
un flujo de alta de instructora a `instructores` sin pasar por el alta manual
de equipo, y un sistema de reputación pública (reseñas/verificaciones) que
alimenta directamente la confianza del marketplace.

**Metodología**: se leyó cada endpoint bajo `app/api/network/` y
`app/api/interno/network/`, cruzando contra `auditoria-2026-08-31.md` (que ya
auditó parte de esta zona) para no repetir. La inmensa mayoría del código está
muy bien defendido — casi cada archivo tiene un comentario explícito
explicando por qué el guard está donde está y qué se ha evitado a propósito
(ownership por `auth_user_id`/`studio_id` en cada query, whitelists de campos,
transacciones con RPC para evitar estados a medias, `.in('estado', [...])` en
el propio UPDATE para cerrar carreras de doble clic). Se encontró un hallazgo
real y verificable.

---

## 🟠 [N-1] Una alumna puede dejar más de una reseña al mismo estudio/instructora — el gemelo del lado alumna no hereda la protección del lado estudio

**Archivos**:
- `app/api/network/alumna/resenas/route.ts:26-76` (funciones
  `tieneClaseCompletadaEstudio`/`tieneClaseCompletadaInstructora`, sin
  `.order()`)
- Comparar con `app/api/network/resenas/route.ts:47-50` (lado estudio→
  instructora, que SÍ tiene `.order('creado_en', { ascending: false })`)
- Constraint real: `supabase/migrations/20260825004019_red_resenas_perfil_nullable_unicidad_por_relacion.sql:16-17`
  — `create unique index red_resenas_una_por_reserva on public.red_resenas (reserva_id) where reserva_id is not null;`
  (mismo patrón para `solicitud_id`).

**Qué pasa**: la reputación pública en Network (estrellas + nº de reseñas de
un perfil de instructora o de un estudio, calculada en
`lib/network/publico.ts:48-51` directamente como `SUM(puntuacion)/COUNT(*)`
sobre todas las filas de `red_resenas`) depende de que "una relación validada
da derecho a una reseña" — el comentario del propio fichero
(`alumna/resenas/route.ts:14-21`) lo afirma explícitamente. La cerradura real
que debería garantizarlo es el índice único parcial sobre `reserva_id` (no
existe un índice único sobre `(autor, studio_id)` ni `(autor, perfil_id)`).

Eso solo protege "no puedes reseñar dos veces usando LA MISMA reserva". No
protege "no puedes reseñar dos veces al MISMO estudio/instructora" cuando
tienes **más de una** reserva `CONFIRMADA` ya pasada con esa relación — que es
el caso normal de cualquier socia habitual de un estudio de Pilates (no una
excepción rara).

`tieneClaseCompletadaEstudio`/`tieneClaseCompletadaInstructora` hacen
`.limit(1)` **sin `.order()`** sobre `reservas` filtrando solo por
socio/estudio/instructor + `CONFIRMADA` + sesión pasada. El `POST` de este
mismo fichero (líneas 149-174 y 176-203) **no comprueba en ningún momento si
la alumna ya tiene una reseña para ese estudio/instructora** antes de
insertar — se apoya única y exclusivamente en que la query de arriba siga
devolviendo la misma `reserva_id` ya usada para que el índice único la
bloquee con un 409. Sin `ORDER BY`, Postgres no garantiza qué fila devuelve un
`LIMIT 1` cuando hay más de una que cumple el filtro (documentado así por el
propio Postgres), y en la práctica esa garantía se rompe en cuanto la alumna
acumula una reserva `CONFIRMADA` y pasada **nueva** con la misma
instructora/estudio después de la primera reseña: la segunda llamada a
`POST /api/network/alumna/resenas` puede perfectamente resolver a esa reserva
nueva (`reserva_id` distinto → no colisiona con el índice único) e insertar
una **segunda reseña** — con otra puntuación y otro comentario — para el
mismo estudio o la misma instructora.

El `GET` del mismo endpoint (usado por la UI para decidir si pintar el
formulario) sí hace la comprobación correcta —
`.eq('studio_id', studioId).eq('autor', sesion.userId).is('perfil_id', null)`
sin restringir por `reserva_id` concreto— así que en el flujo normal por
pantalla la alumna vería "ya reseñado" y no se le ofrecería el formulario. Pero
eso es exactamente el patrón que este mismo repo tiene como regla explícita en
`.claude/tentare-os.md` ("la RLS es la cerradura real, la UI nunca es el
límite de seguridad") trasladado un nivel más arriba: aquí la única cerradura
real que hay es un índice único que protege un invariante distinto del que el
producto necesita, y el servidor nunca repite la comprobación que sí hace el
`GET`. Cualquier llamada directa a la API (DevTools, un cliente HTTP, o
simplemente una carrera entre dos pestañas) que repita el `POST` tras
completar una clase nueva la deja pasar.

**Por qué es el gemelo, no un caso nuevo**: el endpoint hermano de este mismo
archivo, `app/api/network/resenas/route.ts` (estudio → instructora), hace la
consulta equivalente **con** `.order('creado_en', { ascending: false })`
(línea 49), lo que la hace determinista: una segunda llamada encuentra
siempre la misma `solicitud_id` ya usada y el índice único la bloquea de
verdad. La versión del lado alumna (construida después, "última pieza de F3"
según su propio comentario) es una copia del mismo patrón que perdió esa
única línea — exactamente el tipo de "se arregló un camino y el gemelo no" que
ya documentan varias auditorías anteriores de este repo.

**Impacto de negocio**: cualquier socia con más de una clase confirmada y
pasada con la misma instructora, o en el mismo estudio, puede inflar (varias
reseñas de 5 estrellas) o dañar (varias de 1 estrella) el promedio público que
ve cualquier estudio/instructora que navegue Tentare Network — el propio dato
de confianza que el marketplace vende como diferencial.

**Arreglo propuesto**: antes del `INSERT` en ambas ramas del `POST` (`tipo ===
'estudio'` y `tipo === 'instructora'`), repetir exactamente la comprobación
que ya hace el `GET` (`red_resenas` con `autor` + `studio_id`/`perfil_id`,
ignorando `reserva_id`) y devolver 409 si ya existe — igual que
`resenas/route.ts` hace confiando en su `.order()`. Alternativa más robusta a
nivel de esquema: añadir un índice único parcial real sobre
`(autor, studio_id) where perfil_id is null` y `(autor, perfil_id) where
perfil_id is not null`, que es el invariante que el producto realmente quiere
("una reseña por relación", no "una reseña por clase concreta") — dejando el
índice sobre `reserva_id` como estaba, si se quiere conservar por otro motivo.

---

## 🟡 [N-2] Tope de 3 mensajes en solicitud "pendiente" tiene una ventana de carrera (TOCTOU)

**Archivo**: `app/api/network/mensajes/route.ts:107-116`

El tope (`TOPE_MENSAJES_PENDIENTE = 3`) se aplica contando filas existentes
(`count`) y comparando contra el tope **antes** de insertar, sin ninguna
restricción a nivel de base de datos (el comentario de la cabecera lo dice
explícitamente: "contar filas en una policy es frágil"). Dos `POST`
simultáneos del mismo remitente (doble clic, doble pestaña, reintento de red)
pueden leer ambos `count < 3` y los dos insertar, dejando 4 o más mensajes
antes de que la solicitud pase a `aceptada`. Impacto bajo (es un límite de
spam/ruido, no de seguridad ni de dinero) y la ventana es estrecha, pero es el
mismo patrón de "TOCTOU sin lock" que este repo normalmente cierra con un
`UNIQUE`/constraint o un `SELECT ... FOR UPDATE`. No se propone arreglo
detallado por ser de severidad menor — mencionar por si se agrupa con otros
arreglos de idempotencia.

---

## Zonas revisadas sin hallazgos nuevos (para no repetir en próximas pasadas)

- **Perfil propio, identidad, portfolio, experiencia, formalización,
  contacto/resolver, verificaciones de identidad/certificaciones/
  experiencia, vacantes (CRUD + candidaturas), favoritos (estudio y
  alumna), mensajería (hilos + mensajes), moderación interna
  (`/api/interno/network/*`), backfill de geocodificación**: revisados
  archivo por archivo. Ownership por `auth_user_id`/`studio_id` comprobado en
  cada query de lectura/escritura, campos sensibles (`identidad_verificada_en`,
  `destacado`, `email_verificado_en`, estados `published`/`suspended`) nunca
  aceptados desde el body del propio dueño, transacciones RPC donde hace
  falta atomicidad (`red_resolver_verificacion_experiencia`), documentos de
  identidad servidos solo vía URL firmada de 5 minutos y permiso
  `network.moderate`. Sin hallazgos nuevos.
- **`GET /api/network/vacantes` sin gate de `puedeGestionarEquipo`**: real,
  pero ya identificado, documentado en el propio código
  (`vacantes/[id]/candidaturas/route.ts:26-31`) y en
  `auditoria-2026-08-31.md` (hallazgo B-1) como decisión de producto
  pendiente, no un olvido de seguridad — no se repite aquí.
- **Slug de `red_perfiles` con carrera de generación** (dos aprobaciones de
  moderación simultáneas con el mismo nombre/ciudad podrían competir por el
  mismo slug candidato): protegido por `slug text unique` a nivel de columna
  (`20260813164631`); el peor caso es un 500 en una de las dos peticiones,
  reintentable, no una fuga ni una escritura incorrecta. No se reporta como
  hallazgo.
- **Referencias profesionales por token** (`app/api/network/referencias`):
  token `crypto.randomUUID()`, caducidad de 7 días, sin hallazgos.
- **Bucket compartido `red-documentos-identidad`** (DNI + fotos de portfolio
  + certificaciones en el mismo bucket privado): revisado por el riesgo de
  mezclar documentos sensibles con contenido de perfil público — toda lectura
  pasa por `createSignedUrl`/`createSignedUrls` generadas server-side sobre un
  `path` que la fila de la tabla ya controla (nunca un path arbitrario del
  cliente en la ruta de lectura), sin hallazgo.

## Conclusión

Un hallazgo sustancial (🟠) y uno menor (🟡). Tentare Network resultó ser una
de las zonas del repo con más comentarios explicando decisiones de seguridad
ya tomadas — la mayoría de los "primeros sospechosos" habituales (tenant
scoping, whitelist de columnas, IDOR en endpoints con `[id]`) ya estaban
cerrados con guardas explícitas y probados contra el propio patrón que los
rompería. El hallazgo real que quedó es precisamente del tipo que este mismo
repo ya sabe que es su patrón de bug más repetido en otras áreas: un camino
se arregló bien (reseñas estudio→instructora, con `.order()` determinista) y
su gemelo, construido después y copiando la forma pero no el detalle
(reseñas alumna→estudio/instructora), se quedó sin la misma protección.
