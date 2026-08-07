# Consumo de Vercel y Supabase — agosto 2026

Ocho PRs, todos mergeados. Las cifras salen de `pg_stat_statements` y `EXPLAIN`
contra producción, de la API de deployments de GitHub, y —el redimensionado de
imágenes— de ejecutar el algoritmo en un navegador real. Ninguna es una
estimación.

Continuación de `AUDITORIA-CI-RENDIMIENTO-2026-08.md`, que cerró el CI. Aquí el
objetivo es distinto: **gastar menos**, no ir más rápido.

| | antes | ahora |
|---|---|---|
| invocaciones/mes del cron más caro | 87.600 | **17.520** |
| invocaciones/mes de los 14 crons | ~139.500 | **~69.400** |
| CPU de la base de datos | — | **−58 %** |
| payload por tic del portal | ~5 MB | **unos KB** |

PRs: #740 · #746 · #749 · #751 · #752 · #753 · #756 · #758 — +656 / −45 líneas.

---

## 1. Antes de optimizar: Supabase no cuesta dinero

Conviene decirlo primero porque condiciona todo lo demás. Medido en producción:

- Base de datos: **44 MB** de los 8 GB incluidos.
- Storage: **12 MB**.
- CPU acumulado de todas las consultas en 844 h: **0,16 % de un núcleo** de media.

No hay ninguna fuga cara en Supabase. Hay cosas que **escalan mal**, y una que sí
estaba gastando de verdad (§3). Donde se consume hoy es en Vercel.

Esto es lo que justifica los descartes de §6: varias optimizaciones plausibles
habrían sido trabajo cosmético.

## 2. El hallazgo: el portal se repreguntaba el estudio entero cada 5 segundos

`REFRESCO_ACTIVO_MS` refrescaba la pantalla de clases llamando a
`cargarPublico()` → `POST /api/public/studio-data`, que devuelve **el catálogo
completo del estudio más el histórico financiero de la socia**. Doce veces por
minuto, por pantalla abierta, y sin comprobar `document.hidden`.

| histórico del estudio | payload | CPU/tic |
|---|---|---|
| 1 año | 2,4 MB | 36 ms |
| 2 años | 5,0 MB | 55 ms |
| 4 años | 10,0 MB | 139 ms |

Con gzip son **~80 ms de Active CPU cada 5 s**. Media hora con la agenda abierta
= ~20 s de CPU facturada y 360 invocaciones, por socia.

**La clave del arreglo no es el tamaño, es la caché.** El endpoint nuevo
(`GET /api/public/aforo`) devuelve solo `id, sesion_id, estado, spot_id` de las
clases de los próximos 60 días — lo mismo que ya era público. Como no lleva
ningún dato personal y es idéntico para cualquier visitante del mismo estudio,
`s-maxage=5` hace que el sondeo de N socias colapse en **una sola lectura al
origen**: el coste deja de crecer con las socias conectadas, que era el problema
de fondo.

> ⚠️ **`reservas` se construye ENTERA desde esa lista.** Un `setReservas(nuevas)`
> con una ventana de 60 días habría borrado todas las reservas pasadas de la
> socia —y con ellas Progreso, «Pasadas» y Retos— **sin ningún error**: la
> pantalla se pinta bien y se vacía sola cinco segundos después. Por eso la
> fusión no quedó en línea: vive en `fusionarAforo` (`lib/portal-aforo.ts`) con
> siete tests, uno titulado «las reservas FUERA de la ventana sobreviven
> intactas».

`sesionIds` viaja en la respuesta para poder distinguir «esta clase se quedó sin
reservas» de «esta clase está fuera de la ventana». Sin esa lista, una clase de
la que se cancela todo seguiría enseñando el aforo viejo para siempre.

## 3. Realtime era el 58 % del CPU de la base de datos

```
523.981 llamadas · 2.791.881 ms · 5,33 ms de media
SELECT wal->>$5 as type, wal->>$6 as schema, wal->>$7 as table, ...
```

`realtime.apply_rls()` decodificando WAL: **2.791.881 de 4.780.468 ms totales**.
Se paga aunque no haya ningún cliente escuchando.

De las tres tablas publicadas, `mensajes_equipo` pertenece a `/chat`, que está en
`RUTAS_CONGELADAS`. Verificado antes de tocar nada: su único consumidor es
`app/(dashboard)/chat/page.frozen.tsx` —y **Next no enruta `page.frozen.tsx`**—
y además `puedeVerRuta()` devuelve `false` para toda ruta congelada. Se pagaba
WAL por una función inalcanzable.

> ⚠️ **El riesgo era el olvido, no el cambio.** Si se descongela `/chat` sin
> volver a publicar la tabla, el chat **no da ningún error**: los mensajes
> simplemente no llegan en vivo. Por eso el paso se añadió a la lista de
> reactivación de `lib/frozen-features.ts`, junto a los tres que ya había.

Las otras dos se quedan. `instructores` (`studio-context.tsx:743`) tiene filtro
por `studio_id`, `removeChannel` en el cleanup y renovación de JWT: es el ejemplo
de cómo se hace bien, no una fuga.

## 4. El cron que se llevaba el 70 % de las invocaciones

`lib/inngest/reservas-pendientes.ts` corría **cada minuto**. Contando el
`step.run` de Inngest como invocación propia, eran ~87.600 invocaciones/mes — el
70 % de las de los catorce crons juntos, para una query global sobre una tabla
en la que casi siempre no hay nada que expirar.

Es seguro bajarlo porque la guardia —*ninguna reserva se aprueba una vez empezada
su clase*— vive **dentro de la RPC** `resolver_reserva_pendiente`, no en el cron.
Si este se retrasa o se salta un tic, la regla se sigue cumpliendo; solo el aviso
llega tarde. Es la nota de «regla de negocio, no de reloj» que ya documentaba
`tentare-os.md`.

**El precio, explícito:** el aviso puede llegar hasta 4 minutos más tarde.
Decisión de producto, no ajuste técnico.

> De paso se corrigieron **tres referencias cruzadas que se quedaban mintiendo**:
> `lista-espera-ofertas.ts` y `minimo-asistentes.ts` justificaban SU cadencia por
> contraste con «el minuto a minuto de reservas-pendientes». Son justo los
> comentarios que alguien leerá para decidir la cadencia del siguiente cron.

## 5. Lo demás

**Fotos sin redimensionar (#753).** Cuatro PNG de 3,1 / 2,9 / 2,3 y 2,0 MB eran
10,3 de los 12 MB de Storage. No había ningún `resize`/`sharp` en **ningún**
camino de subida: la foto salía del móvil a 12 Mpx para pintarse recortada en un
círculo de 40 px. Medido en navegador real, la salida queda acotada por el lado
de 512 px, no por la entrada:

```
degradado suave (mejor caso): 2,47 MB -> 6 KB
ruido puro      (peor caso): 40,00 MB -> 89 KB
```

Se aplica a las cinco funciones de foto. **NO** a logo ni favicon:
`validarImagenMarca` admite SVG e ICO, y pasar un SVG por canvas lo rasteriza.

**Los previews se comían la cuota de producción (#749).** 28 deployments de
preview frente a 25 de producción en un día, y a las 13:40 se creó otro preview
**con producción ya bloqueada**. Aquí el preview no aporta verificación: desde
#681 el CI construye producción y corre los 12 shards de e2e contra ese build.
Lo que se pierde es la URL compartible, no cobertura.

**Sondeos en segundo plano (#751).** Tres intervalos seguían pidiendo con la
pestaña oculta. Pausarlos es gratis en producto porque al volver a primer plano
ya re-sincroniza el listener de `visibilitychange` que existía desde antes.

## 6. Investigado y descartado

| candidato | por qué no |
|---|---|
| Cachear `/api/public/studio-data` en CDN | Con socia autenticada la respuesta lleva sus datos personales |
| Cachear `/api/theme` | Devuelve el tema **por estudio**: filtraría el de uno a otro |
| Índice en `reservas.estado` | 153 filas; la planificación (266 buffers) ya cuesta más que la ejecución (4) |
| `REINDEX` para recuperar 17 de 44 MB | 44 MB sobre 8 GB no es un problema. Cosmético |
| Acotar `sesiones` del portal por fecha | Riesgo de Fase C: `portal-reservas-view` mapea las reservas pasadas a través de `base.sesiones` |

No hay `middleware.ts` —el vector más caro de Vercel no aplica— y las imágenes
son cinco ficheros locales sin `remotePatterns`: tampoco es un coste.

## 7. Trampas de método (las cuatro se pisaron)

**La fecha de un deployment no dice qué hay dentro.** Producción avanzó a un
commit más reciente y parecía que el bloqueo se había levantado. Comprobado por
**ancestría** (`git merge-base --is-ancestor`) en vez de por fecha: ninguno de
los seis commits estaba dentro. Antes ya se había afirmado lo contrario mirando
un deploy correcto de diez minutos antes de que se agotara la cuota.

**`gh pr checks --watch` puede devolver el resultado de la ejecución anterior.**
Tras un rebase dio `test=pass` de la corrida vieja y el merge rebotó con «base
branch policy prohibits the merge». Hay que esperar contra el SHA concreto:

```bash
gh api repos/<owner>/<repo>/commits/$SHA/check-runs \
  --jq '[.check_runs[] | select(.name=="test")] | .[0] | "\(.status)/\(.conclusion)"'
```

**Un e2e puede pasar sin probar nada.** El primer test del historial navegaba a
Progreso con `page.goto`, que **remonta la app y recarga todo** — habría pasado
igual con la fusión rota. Ese riesgo acabó cubierto como función pura.

**Un microbenchmark sin calentar el JIT es ruido.** Un primer «−36 % de CPU»
(6 ms vs 8 ms, 50 iteraciones) resultó ser −9 % al rehacerlo con 20.000
iteraciones y siete rondas intercaladas. Seis microsegundos por invocación: se
hizo igualmente porque es gratis y escala, no porque se note.

## 8. Lo que queda abierto

**El cron diario lee 55 conjuntos de datos y usa 11.**
`lib/inngest/automatizaciones.ts` llama a `fetchAllStudioData` —el arranque
completo del panel— y consume 11 de los ~55 campos. Encima va dentro de un
`step.run`, así que se serializa entero como estado de Inngest. La
infraestructura para arreglarlo ya existe (`fetchCriticalStudioData` /
`fetchDeferredStudioData`): es añadir un selector, no trocear el god file.

**Ninguna tabla de log tiene retención.** Solo `backups` purga. No lo hacen
`automation_logs`, `actividad_reciente`, `notification`, `notification_delivery`,
`decision_sessions`, `plataforma_auditoria` ni `rate_limits` (la que más rápido
crece por diseño). Volumen irrelevante hoy, almacenamiento pagado a perpetuidad
mañana.

**N+1 en la entrega de notificaciones.** `lib/notifications/process.ts:77-108`
hace 2-3 consultas secuenciales por notificación; se arregla con `.in()`.

**Sin verificar contra un servidor real:** que `/api/public/aforo` devuelva de
verdad `Cache-Control: public, s-maxage=5` y que Vercel lo cachee en vez de
tratarlo como dinámico. De esa caché compartida depende que el ahorro escale con
las socias conectadas.

## 9. Verificación

- **1.813 tests** en verde; `tsc --noEmit` y `eslint --max-warnings 0` limpios.
- **Base de datos**: `BEGIN`/`ROLLBACK` antes de aplicar; la migración de
  Realtime verificada **por efecto** (`pg_publication_tables`) y no solo por
  nombre, y sellada con la versión del fichero para no crear divergencia de
  timestamps.
- **Portal**: 17 e2e (clases, progreso, detalle, cancelación) contra build de
  producción, más uno nuevo que espera dos periodos completos del tic y comprueba
  que pide el endpoint ligero y no vuelve a pedir el catálogo.
- **Redimensionado**: ejecutado en un navegador real sobre una imagen de
  4032×3024, en los dos extremos de compresibilidad.
