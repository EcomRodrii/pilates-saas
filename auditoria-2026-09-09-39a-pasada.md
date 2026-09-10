# Auditoría Tentare — 39ª pasada (9 sep 2026)

**Rama:** `audit/2026-09-09-39a` (commit `37f842db`, base `origin/main` = `b34101be`).
**Parche:** `audit-09sep-39a.patch`. **Sin subir a GitHub** (el sandbox no tiene credenciales).

## Área elegida y por qué

Las pasadas 27ª-38ª ya barrieron POS/Bizum, SEPA/dunning/nómina, gamificación,
checkout de planes/matrícula/legal, OAuth + Comunidad, reservas/penalizaciones,
Tentare Network, Decision OS, billing SaaS y ficha clínica. Quedaban tres zonas
sin foco explícito. Elegí:

1. **La familia de 8 importadores CSV** (`app/api/{socios,suscripciones,clases,
   reservas,citas,plazas-fijas,pagos-historicos,recuperaciones}/import`) + el
   **deshacer** de la Migración Mágica. Motivo: la clase de fallo dominante de
   este repo son los **gemelos divergentes**, y aquí hay ocho hermanos que hacen
   casi lo mismo — el sitio con más probabilidad de tener uno suelto. Además es
   el embudo de entrada de cada estudio nuevo: si Tentare va a ponerse delante de
   cientos de estudios, todos pasan por aquí.
2. **El servido de temas ZIP** (`lib/theme-import/**`): 366 líneas sirviendo
   ficheros de un archivo subido por un tercero.
3. **La app de la alumna** (`lib/student/**`, 189 ficheros tocados en 10 días —
   la superficie con más churn del repo).

**Método.** Árbol limpio de `origin/main` (el local iba 1 commit por detrás y 2
por delante). Tres auditores en paralelo + lectura propia de los 8 importadores.
Todo lo de base de datos verificado **contra producción** vía `execute_sql`, con
control positivo y negativo. Dos revisores independientes sobre el diff final,
que encontraron un fallo **bloqueante en mi propio arreglo** (§ "Lo que cazó la
revisión").

---

# 🔴 CRÍTICO

## [D-1] El «deshacer» de la Migración Mágica borraba en cascada todo lo que la socia hizo DESPUÉS de migrar

**Estado:** ✅ SOLUCIONADO · **Área:** migración / pérdida de datos

**Archivos:** `lib/migracion/batches.ts:78-144` (`deshacerBatch`) ·
`app/(dashboard)/migracion/page.tsx:469, 771, 781` (el texto que lo promete) ·
`supabase/migrations/0000_base.sql` (las FK).

**Evidencia.** La pantalla lo promete tres veces, literalmente:

> «Puedes deshacer cualquiera con un clic: se borra exactamente lo que creó, y nada más.»
> «Se borrará exactamente lo que ha creado esta importación (y nada más). Tus datos anteriores a la migración no se tocan.»

Y el código lo repite (`batches.ts:5-6`, `:80-84`), diciendo que si una FK
bloquea «se PARA con un mensaje claro».

Consultado **contra producción**, `confdeltype` de las FK que apuntan a `socios`
y `sesiones`:

| Padre | FK `CASCADE` | FK `NO ACTION` |
| --- | --- | --- |
| `socios` | **39** | 7 |
| `sesiones` | 4 | 0 |

Las 39 incluyen `recibos`, `member_credits`, `credit_transactions`,
`condiciones_salud`, `notas_progreso`, `respuestas_cuestionario_salud`,
`documentos_socio`, `valoraciones_iniciales(_salud)`, `suscripciones`, `citas`.

**Qué ocurría.** `ORDEN_DESHACER` borra `sesiones` (puesto 7) y `socios` (9).
Postgres arrastraba las 43 tablas hijas **en silencio**: `delete` devuelve éxito,
no hay 23503, el guardarraíl de `:116-125` no dispara nunca (solo lo hace para
las 7 FK NO ACTION) y `deshacerBatch` devolvía `ok: true`.

**Impacto medido.** Ejecuté el conteo sobre una socia real cualquiera de
producción: **17 tablas hijas, 128 filas — incluidas 12 recibos, 41 reservas, 9
suscripciones y 7 movimientos de crédito**. Por *una* socia. Una propietaria que
migra el lunes, opera tres días y el jueves pulsa «deshacer» porque algo no le
cuadra, pierde la facturación, los créditos y la ficha clínica de esas tres
jornadas, sin un solo aviso y con la pantalla diciéndole que no se tocaba nada.

**Por qué no ha explotado todavía.** `select count(*) from migracion_batches` =
**0** en producción: la Migración Mágica nunca se ha usado con datos reales. Es
un botón vivo, cargado y sin estrenar.

**Arreglo.** Migración `20260909072800_migracion_dependencias_bloqueantes.sql` +
`lib/migracion/batches.ts`. Un preflight que, antes de borrar cada entidad,
cuenta lo que la cascada destruiría:

- **Deriva los hijos de `pg_constraint`**, no de una lista. Una tabla hija nueva
  queda cubierta sola — que es justo lo que evita repetir el fallo de gemelos.
- **Ignora el rastro del sistema** (ver D-1-bis).
- **Descuenta los ids que creó el propio lote.**
- **Falla cerrado**: si el preflight no se puede ejecutar, no se borra.
- `SECURITY DEFINER` con `revoke ... from public, anon, authenticated` y grant
  solo a `service_role` (verificado con `has_function_privilege` en ambas
  direcciones).

Con esto, la frase de la pantalla pasa a ser **cierta** en vez de haber que
cambiarla.

**Verificación (producción, control positivo y negativo):** 17 tablas hijas sin
filtros → 14 ignorando el rastro; `reservas` 41 → 0 al excluir los ids del lote;
id inexistente → 0 filas; `anon` sin EXECUTE, `service_role` con él; una sola
firma viva tras el `DROP` de la v1. Test guardián nuevo (`lib/migracion/
deshacer-cascada.test.ts`, 4 casos) que **falla 3 de 4 al revertir el arreglo**.

**Riesgo residual.** El preflight bloquea en vez de borrar. Si una tabla hija
legítima se llena por un camino que no previmos, la propietaria verá «contacta
con soporte» en lugar de poder deshacer. Es la dirección segura del error, pero
conviene mirar Sentry (`area: migracion`) la primera vez que un estudio real
use el deshacer.

---

# 🟠 IMPORTANTES

## [D-1-bis] Mi primer arreglo de D-1 habría bloqueado el deshacer para siempre

**Estado:** ✅ SOLUCIONADO (v2 de la migración) · Lo cazó la revisión independiente.

La v1 se apoyaba en: «cuando toca borrar `socios`, `ORDEN_DESHACER` ya ha
borrado las reservas del propio lote, así que lo que quede colgando es ajeno».
Falso para las tablas que llena **el propio producto**: `recordatorio_envios`
cuelga de `sesiones` y de `socios` con CASCADE y el cron escribe ahí por cada
recordatorio enviado; `comunicaciones_socio` registra cualquier email. **A las
pocas horas de migrar, todo lote habría quedado bloqueado con un mensaje
incomprensible.** Un guardarraíl que nunca deja pasar es tan inútil como el que
nunca frena — y es exactamente la clase de fallo del 7-sep («se arregla lo que
prohíbe y no lo que da salida»), cometida dentro del arreglo que la combatía.

## [I-1] `clases/import` no paginaba: reimportar duplicaba el horario entero

**Estado:** ✅ SOLUCIONADO · `app/api/clases/import/route.ts:106-110, 197-201`

Era el único de los ocho que leía los catálogos (`tipos_clase`, `instructores`,
`salas`) y el índice del dedup (`sesiones`) con un `select` suelto, sin
`catalogo()`. `lib/migracion/catalogo.ts:6-8` explica que PostgREST corta en
1000 filas **en silencio**. La ventana del dedup abarca hasta 12 semanas: un
estudio con 10 clases al día pasa de 1000 sesiones, el dedup deja de ver el
resto y **reimportar le duplica el horario** — justo lo que ese bloque existe
para impedir. Envueltas las cuatro consultas, y un fallo del dedup ahora aborta
(sin dedup fiable, no importar es mejor que duplicar).

## [I-2] Los 22 catálogos paginaban sin `ORDER BY`

**Estado:** ✅ SOLUCIONADO · los 8 importadores · lo señaló la revisión

`leerCatalogoCompleto` pagina con `.range()`, pero sin `ORDER BY` Postgres **no
garantiza** que `LIMIT/OFFSET` devuelva páginas disjuntas: una fila puede salir
dos veces y otra ninguna. Una fila perdida aquí es exactamente el fallo que el
módulo existe para evitar (catálogo corto → reimportar duplica), solo que
dependiente del plan de ejecución. Añadido `.order('id')` a las 22 llamadas y
documentado el requisito en `catalogo.ts`.

## [I-3] `pagos-historicos` era el gemelo divergente: sin revalidación y sin dedup

**Estado:** ✅ SOLUCIONADO · `app/api/pagos-historicos/import/route.ts`

Único de los ocho que **(a)** no revalidaba nada en servidor —`f.fecha` y
`f.importe` iban crudos al INSERT, mientras sus hermanos usan `parsearFecha`,
`emailValido`, `RE_HORA`, `Number.isFinite`— y **(b)** no tenía ningún dedup.
La tabla tiene `fecha date not null` y `check (importe >= 0)`, así que una fecha
vacía (22007) o un importe negativo (23514) tumbaban el **lote de 500 entero**, y
el mensaje culpaba a «las socias que faltan», que no tenía nada que ver. Y ese
mismo mensaje dice «vuelve a subirlo» — sin dedup, reimportar **duplicaba todo el
histórico de facturación** de cada socia. Añadidas ambas cosas; el dedup cuenta
ocurrencias (multiset) en vez de usar un `Set`, para no tragarse dos clases
sueltas legítimas de 10 € el mismo día.

## [I-4] `reservas` y `citas` solo deduplicaban los estados activos

**Estado:** ✅ SOLUCIONADO · `reservas/import:147-149` · `citas/import:131`

El índice único `uq_reserva_activa_socio_sesion` es **parcial** sobre los
estados activos, así que la BD no frenaba `NO_ASISTIO` ni `CANCELADA` — y las
respuestas afirmaban `// ya estaban: reimportar no duplica`. Reimportar (lo que
pide el mensaje de fallo a medias) **duplicaba los plantones**, que alimentan el
riesgo de plantón de la socia, y las citas `COMPLETADA` **con su `precio` y su
`pagada`**. Clave de dedup ampliada con el estado, conservando la colisión entre
activas.

## [I-5] `citas/import` escribía importes con permiso de agenda

**Estado:** ⚠️ PARCIALMENTE SOLUCIONADO · `app/api/citas/import/route.ts:54`

Exigía `puedeGestionarClientas` pero inserta `precio` y `pagada`. Sus gemelos
que tocan importes piden más (`suscripciones` → `puedeMoverDinero`;
`pagos-historicos` → `puedeVerFinanzas`). Añadido un gate de `puedeVerFinanzas`
**solo si el archivo trae precios**, para no romper la importación de agenda sin
dinero, y colocado *después* de validar la forma (leer `.some()` sobre un `rows`
no-array daba un 500 en vez de un 400).

**Lo que queda:** la revisión señaló, con razón, que `puedeVerFinanzas` es
`PROPIETARIO || RECEPCION`, así que **el arreglo no frena a recepción** — el rol
que queda fuera es MANAGER. Cerrar también recepción es una **decisión de
producto** (hoy recepción cobra en el TPV), no algo que deba decidir una
auditoría. Anotado en el código y pendiente de tu criterio.

## [T-1] El HTML, CSS y SVG de un ZIP subido se servían en el origen del panel, sin CSP

**Estado:** ✅ SOLUCIONADO · `lib/theme-import/servir.ts` · `preview-en-vivo.ts` ·
nuevo `lib/theme-import/cabeceras.ts`

`manifest.ts:48-50` afirma «sin ejecutar JS del propio ZIP», pero
`incompatibilidadesDe` solo rechaza `.tsx/.jsx`, next/vite y deps de npm: un
`.js` suelto pasa y se sirve como `text/javascript`, y los `<script>` inline ni
se miran. El comentario del route decía que el aislamiento lo daba el iframe sin
`allow-same-origin` — pero **ese atributo lo pone el cliente**, y la URL
`.../api/theme/importado/<id>/index.html?t=<token>` es navegable directamente. El
JWT de staff vive en `localStorage` (`api-client.ts:36-39`). Es cruzado entre
estudios: quien importa el ZIP acuña un token válido para su propio tema y manda
el enlace a staff de otro.

Añadido `Content-Security-Policy: sandbox ...` (lo aplica el **servidor**, así
que da origen opaco también en navegación directa) + `nosniff` + `noindex` en un
único módulo. Cubre las **tres** ramas de `servirFicheroTema`, incluida la de
assets: la revisión encontró que dejé el `.svg` fuera, y un SVG abierto como
documento ejecuta sus `<script>`.

Refutado por el revisor y verificado: `sandbox` **no** rompe la web pública del
estudio (`enlazar-datos.ts` no inyecta formularios ni widget de reserva).
**Residual 🟡:** un tema con banner de cookies o analítica propia dejará de
funcionar (origen opaco ⇒ `localStorage`/`cookie` lanzan). No hay ningún ZIP en
producción para comprobarlo.

## [A-1] La foto de perfil se rechazaba antes del redimensionado que existe para evitarlo

**Estado:** ✅ SOLUCIONADO · `lib/student/foto-perfil.ts:27` ·
`components/student/domain/FotoPerfil.tsx:36` · `lib/foto-perfil-regla.ts`

Se cortaba a 5 MB sobre el fichero **original**, antes de `redimensionarImagen`,
cuyo comentario dice que existe «para que el byte gordo no llegue a viajar». Una
foto de móvil actual pesa 6-15 MB: la alumna leía «La imagen no puede superar
5 MB» y **no tenía salida dentro de la app**. Ahora se comprueba solo el formato
antes de reducir; el tamaño se revalida sobre el fichero real que se sube, en el
servidor y en el bucket (tres capas, verificadas por el revisor).

## [A-2] «Escribir al estudio» abría una pantalla en blanco

**Estado:** ✅ SOLUCIONADO · `app/portal/[slug]/mensajes/[id]/page.tsx:60, 124`

`useAsync(cargar, () => false)`: el predicado de vacío devuelve **siempre**
`false`, así que `estado` nunca vale `'empty'` y el único texto de conversación
nueva (`Este es el comienzo de tu conversación`) no se pintaba jamás — justo en
el camino principal de la funcionalidad recién desplegada (#1789). La alumna veía
cabecera, hueco y compositor. Ahora se deriva de los mensajes.

## [A-3] Los dos avisos de «renueva tu bono» perdían el enlace

**Estado:** ✅ SOLUCIONADO · `lib/student/deep-links.ts:28`

`BONO_POR_CADUCAR` y `BONO_AGOTADO` emiten `/portal/<slug>/comprar`, que no
estaba en la alternancia y ninguna regla posterior reconocía
(`resto.startsWith('compras')` no casa con `comprar`). `NotificationItem` pinta
un `<div>` sin enlace cuando no hay ruta: **los dos únicos avisos cuyo objetivo
es que la alumna vuelva a comprar no llevaban a ninguna parte.** Verificado que
`app/portal/[slug]/comprar/page.tsx` existe y que no se crea bucle 308.

## [I-6] Fallos a medias que mienten sobre lo que entró

**Estado:** ✅ SOLUCIONADO · `citas/import` · `clases/import` · `deshacer`

`citas` decía «No se pudieron guardar las citas» cuando podía llevar 4.500
dentro; `clases` iba a decir «no se ha importado nada» cuando los tipos de clase
ya estaban insertados. Ambos alineados con sus gemelos y pasados por
`errorInterno` (Sentry). Y `clases` se tragaba el `false` de `registrarIdsBatch`
para `tipos_clase`, dejándolos fuera del deshacer sin avisar, contra su propio
contrato. Añadido `maxDuration = 60` al endpoint de deshacer, que ahora hace
hasta 9 preflights.

---

# 🟡 MEJORAS (documentadas, no aplicadas)

- **Zip bomb** (`zip-parser.ts:36-65`): se mide el tamaño **comprimido** y se
  llama a `unzipSync` **antes** del límite de ficheros. 25 MB de ceros ≈ 25 GB →
  OOM del lambda. P-7, abierto desde el 21-ago. No aplicado: requiere confirmar
  la firma de `UnzipFileInfo` en la versión fijada de `fflate`.
- **Inyección de atributo ZIP → `studios.foto_url`** (`extraer-tema.ts:203`): el
  `test(/^https?:\/\//i)` está anclado solo al principio; `enlazar-datos.ts:133`
  lo inserta sin escapar en `src="${url}"`.
- **Techo duro antes de decodificar la imagen** de perfil: ahora un fichero de
  300 MB llega a `createImageBitmap` sin puerta previa y puede colgar la pestaña.
- **Preferencias de aviso sin `mensajeria`** (`lib/student/perfil-y-avisos.ts:104`):
  desde que existe el chat, la alumna recibe push por cada mensaje y digests por
  email que **no puede apagar** desde su app. El gemelo `tipo-aviso.ts:26` sí se
  actualizó; la pantalla de preferencias no. No aplicado: es una pantalla nueva,
  decisión de producto.
- **`batchId` lo elige el cliente** y `migracion_batches.id` es PK global: dos
  estudios que colisionen dejan al segundo sin deshacer (sin fuga cruzada).
- **MANAGER fuera de la mitad clínica de la valoración inicial**
  (`20260909003015:199`) el mismo día que otra migración concluyó lo contrario
  para el semáforo. Decidir, no heredar.
- **`reservas/import` acepta reservas en sesiones canceladas** (`route.ts:76`).
- **Sin rate limit** en `theme/importar-zip`.

---

# LO QUE CAZÓ LA REVISIÓN INDEPENDIENTE (6ª pasada seguida en que paga)

Dos revisores en paralelo sobre el diff, con focos distintos. Encontraron **7
problemas en mis 13 arreglos**, con typecheck, lint y 4.300 tests en verde:

| # | Qué | Gravedad |
| --- | --- | --- |
| 1 | El preflight bloqueaba el deshacer **para siempre** (rastro del cron) | Bloqueante |
| 2 | El gate de `citas` leía `.some()` antes de `Array.isArray` → 500 | Roto |
| 3 | El gate de `citas` **no frena a recepción**, solo a MANAGER | El comentario mentía |
| 4 | Mi dedup de `citas` abría un hueco: activa contra COMPLETADA existente | Regresión |
| 5 | Mi dedup de `pagos` con `Set` **perdía pagos legítimos** repetidos | Regresión |
| 6 | El SVG del ZIP se quedó sin cabeceras (tercera puerta) | Incompleto |
| 7 | `catalogo()` pagina sin `ORDER BY` | Preexistente, real |

Los siete, corregidos. Además refutaron un miedo mío (que `sandbox` rompiera la
web pública del estudio) y demostraron que dos de las cuatro salidas de cabeceras
son no-op por `srcDoc` — corregido el docstring para que no presuma de una
defensa que ahí no existe.

---

# VERIFICACIÓN

| Check | Resultado |
| --- | --- |
| **Tests** | ✅ PASS — **4.301** (4.300 antes + 1 fichero nuevo con 4 casos) |
| **Test nuevo revertido** | ✅ falla 3 de 4 → es guardián real, no decorativo |
| **Typecheck** | ✅ PASS (`lib` + `app/api`, y `lib` + `portal` + componentes; el proyecto entero no cabe en el tope de 178 s del sandbox) |
| **Lint** | ✅ PASS sobre los 22 ficheros tocados |
| **Build** | ⛔ **NO VERIFICADO** — `next build` no corre aquí: falta el SWC de linux-arm64 y no hay red al registry |
| **E2E** | ⛔ NO VERIFICADO (requiere navegador y servidor) |
| **BD** | ✅ migración aplicada en prod y verificada con control positivo **y** negativo |

## Estado real y nivel de confianza

**Alto** en el diagnóstico de D-1: no es inferencia, es un conteo ejecutado
contra producción. **Alto** en los arreglos de importadores y app de la alumna:
tests, typecheck y lint en verde, y dos revisores que ya me tumbaron 7 cosas.
**Medio** en las cabeceras del ZIP: la funcionalidad no tiene ningún tema en
producción con el que comprobar que `sandbox` no rompe nada real; el análisis
dice que no, pero no lo he visto funcionar. **Nulo** sobre el build.

**Lo que NO he verificado y conviene mirar:** que la vista previa del editor de
temas siga viéndose en un navegador de verdad (30 segundos de comprobación
manual); y el primer uso real del deshacer, mirando Sentry con `area: migracion`.

**Lo incómodo.** La Migración Mágica está entera —ocho importadores, análisis
por IA, acta, deshacer— y **nunca se ha ejecutado con datos reales** (0 filas en
`pagos_historicos`, 0 en `migracion_batches`). Es la puerta de entrada de todo
estudio que venga de otra plataforma y ninguno la ha cruzado. Antes de ponerla
delante de cientos de estudios, el paso que falta no es más auditoría: es
migrar un estudio de prueba de punta a punta —importar, operar dos días,
deshacer— y ver qué pasa. Ninguna cantidad de lectura de código sustituye eso.

---

## Recuento

- 🔴 Críticos encontrados: **1** → 1 solucionado
- 🟠 Importantes: **10** → 9 solucionados, 1 parcial (I-5)
- 🟡 Mejoras: **8** → documentadas, no aplicadas
- Fallos en mis propios arreglos, cazados por la revisión: **7** → 7 corregidos
- Ficheros modificados: **22** (+2 nuevos: `cabeceras.ts`, el test guardián)
- Tests nuevos: **1 fichero, 4 casos**
- Migraciones aplicadas en producción: **1** (dos versiones; la v1 quedó rota y
  se corrigió en la misma sesión)
