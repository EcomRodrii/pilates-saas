# Auditoría de CI/CD y rendimiento — agosto 2026

Diez PRs, todos mergeados y desplegados. Todas las cifras están **medidas, no
estimadas**: el CI sale de ejecuciones reales de GitHub Actions, el bundle de
`next build`, y lo de base de datos de `get_advisors`, `EXPLAIN` y `pg_stat_*`
contra producción.

| | antes | ahora |
|---|---|---|
| CI (camino crítico) | 24m 33s | **4m 22s** |
| errores de lint | 117 | **0** |
| avisos de lint | 268 | **0** |
| tests | 1.578 | **1.722** |
| hallazgos accionables del advisor | 5 | **0** |

−1.951 / +980 líneas (neto −971) en 83 ficheros.

PRs: #684 · #681 · #689 · #688 · #701 · #708 · #714 · #717 · #726 · #731

---

## 1. El cuello de botella del CI

De los 1.473s que tardaba el pipeline, **1.308 eran la suite E2E (89 %)**. La
causa no era el número de tests sino DÓNDE corrían: el `webServer` de Playwright
arrancaba `npm run dev`, así que cada ruta se compilaba bajo demanda **dentro
del propio test** — y el build de producción que el job hacía justo antes se
tiraba a la basura sin que nadie lo usara.

Ahora el build se hace una vez, viaja como artefacto, y 12 shards lo sirven con
`next start`. Ninguna spec se rompió al cambiar de dev a producción.

Otros cambios del mismo PR:

- **`workers: 4`.** Playwright usaba 2 de los 4 núcleos — es su valor por
  defecto (la mitad). El log lo decía literal: `Running 59 tests using 2 workers`.
- **Caché de `node_modules`** (#731): restaurar tarda 4s frente a los 19s de
  `npm ci`. 27s menos en el camino crítico.
- **`cancel-in-progress` solo en PRs.** Cancelaba también en `main`: 5 de los 15
  últimos runs de main quedaron `cancelled`, o sea commits en producción sin CI
  verde.
- **El lint entra en CI** (no corría nunca) y hoy bloquea errores y avisos.

## 2. Tres fallos de producto encontrados sin buscarlos

### 2.1 Pérdida de datos en los backups (#684)

`crearSnapshot` leía con `select('*')` sin paginar. PostgREST corta en
`max_rows` (1.000) **en silencio**: sin error y sin señal de que faltan filas.

Aquí eso no era un informe incompleto: `restaurarSnapshot` borra y reinserta el
snapshot tal cual, así que **un estudio con más de 1.000 reservas restauraba
habiendo perdido todo lo que no cupo**.

El repo ya conocía este fallo y lo tenía resuelto en `fetchAllRows` (panel) y
`leerCatalogoCompleto` (importadores). A los backups nunca llegó.

> ⚠️ Al buscar este patrón, buscar **también la falta de `ORDER BY`**. En
> `barrerNoShows` las dos cosas juntas invertían el resultado: sin orden, las
> 1.000 filas que llegan son arbitrarias (orden físico, típicamente las más
> antiguas), así que las sesiones recientes —las únicas que hay que barrer— eran
> justo las que se quedaban fuera.

### 2.2 El tour guiado se relanzaba en cada visita (#726)

`20260805120000_studios_tour_visto.sql` estaba **mergeado pero nunca aplicado**.
El código escribía `tour_visto_en` en un UPDATE sobre una columna inexistente →
PostgREST devolvía 400. Como la escritura no cuajaba, `tourVistoEn` seguía en
`null` para siempre.

Es el patrón que ya avisa `tentare-os.md`: **mergear un PR no aplica su
migración**. Verificar por EFECTO (¿existe la columna?), no por nombre.

### 2.3 «Nueva clienta» no hacía nada en carga fría

El rol arranca en `INSTRUCTOR` (fail-closed, A-2) hasta que resuelve el
contexto. Con dependencias `[]`, el efecto que lee `?nuevo=1` corría una sola
vez —cuando todavía no había permiso— y el enlace se perdía. Hay **cuatro**
sitios que enlazan ahí: dashboard (×2), cobros y acciones rápidas.

## 3. Cinco «optimizaciones obvias» que eran falsas

Todas comprobadas ANTES de aplicarlas. Cuatro habrían sido trabajo inútil; una
habría roto el build.

| creencia | realidad |
|---|---|
| `optimizePackageImports` para `lucide-react`/`date-fns` | Next 16 ya los optimiza por defecto |
| Cachear `.next/cache` | No-op con Turbopack: 0 MB guardados, medido |
| Borrar `shadcn` (0 imports) | Entra por `@import` de CSS; rompe el build |
| Meter `hidratarTiposDePlanes` en el `Promise.all` | Sí depende de su resultado; lo paralelizable era solo su consulta |
| «409 `current_studio_id()` sin envolver» | Falso: `Index Cond`, evaluado UNA vez |

Sobre la última, porque se repitió mucho durante la auditoría: ese conteo salía
de grepear ficheros de migración, y el grep no sabe lo que hace el planificador.

```
explain (costs off) select id from reservas where studio_id = current_studio_id();
→  Index Scan using idx_reservas_studio_socio on reservas
     Index Cond: (studio_id = current_studio_id())
```

La función es `STABLE` y sin argumentos, así que Postgres la iza. *(El advisor
tampoco lo habría dicho: solo mira `auth.*()`, no funciones propias.)*

## 4. Dos trampas para quien toque esto después

### 4.1 El wall clock del CI no sirve para comparar cambios

Con 12 shards el pipeline pide **14 runners**, y el tiempo de encolado va de
**10 a 257 segundos** entre ejecuciones. Un run de `main` marcó 531s de reloj
con solo 274s de trabajo real.

Al medir si la caché de `node_modules` compensaba, la primera comparación dio
295s vs 302s y la conclusión fue «sale peor». Era ruido: todos los jobs habían
mejorado.

**Cómo medir bien**: aislar el trabajo del camino crítico —
`duración(build) + duración(shard más lento)`— e ignorar el total. Eso es
estable (262s, 263s en dos muestras) mientras el wall clock oscila 280–530s.

### 4.2 Los 77 índices «sin usar» del advisor NO se deben borrar

Son el 79 % del informe del advisor. Las tablas con más escaneo secuencial son
diminutas — `studios` 9 filas, `instructores` 10, `salas` 6 — así que el
planificador elige *seq scan* porque caben en una página, no porque los índices
sobren. «Sin usar» aquí significa «la base de datos todavía es pequeña».

Borrarlos optimizaría para nueve estudios a costa de justo cuando haya
novecientos. Está documentado también en la propia migración.

> Nota de método: `create index if not exists` compara por **NOMBRE, no por
> definición**. Una de las cuatro sentencias de esa migración fue un NO-OP
> silencioso porque ya existía un índice con ese nombre sobre otras columnas.
> Se detectó volviendo a pasar el advisor DESPUÉS de aplicar, no antes.

## 5. Lo que queda abierto

### 5.1 El arranque del panel trae el histórico completo

`fetchCriticalStudioData` lanza 52 consultas `select('*')` desde el navegador.
Medido contra producción (22 socias): **1.806–4.710 ms y 283 KB**. Proyectado
para un estudio real de 300 socias y 3 años: **más de 12 MB** en cada carga dura,
con ~35 viajes secuenciales de paginación.

Se entregó la fase segura (#688). Acotar `sesiones`/`reservas` por fecha cambia
QUÉ datos ve la interfaz y necesita verificación pantalla por pantalla.

### 5.2 Menos de 3 minutos de CI no es alcanzable

El camino crítico son **262s** con solo dos componentes: build (~90s) y shard
más lento (~170s, de los que ~50 son preparación fija por shard). Faltan 82s.

Las dos únicas vías:

- La caché experimental de Turbopack (`turbopackFileSystemCacheForBuild`), que
  haría que el build de CI dejara de ser el que ejecuta Vercel. Un CI verde
  sirviendo salida obsoleta es peor que un CI lento.
- Recortar cobertura de E2E en los PR.

**Recomendación: quedarse en 4m 22s.** De 24 minutos a esto ya son 5,6x.

### 5.3 Del advisor, descartado a propósito

- **20 `multiple_permissive_policies`** — fusionar políticas permisivas cambia la
  superficie de seguridad. Pasa por `tentare-seguridad`, no por un arreglo de
  rendimiento al paso.
- **1 `auth_rls_initplan`** — es un `with_check` de INSERT sobre el chat del
  equipo, donde entra un mensaje cada vez. El «at scale» no aplica.

## 6. Verificación

- **CI**: tres rondas medidas (1.473s → 660s → 379s → 295s), todas en verde.
- **Pantallas**: nueve verificadas en navegador con sesión simulada sobre build
  de producción — dashboard, calendario, clientas, centro de control, informes,
  equipo, configuración, suscripción y el buscador ⌘K.
- **Base de datos**: `BEGIN/ROLLBACK` antes de aplicar, `get_advisors` después.
  La unicidad legal del número de factura se probó **insertando un duplicado
  real**, no contando índices.
- **Tests**: 1.722 en verde. Cuatro nuevos de regresión sobre `crearSnapshot`
  con un doble que simula el corte de PostgREST.
