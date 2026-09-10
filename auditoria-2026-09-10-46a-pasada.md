# Auditoria 46a pasada - White-label/Theming: SUBIDA y PROCESADO del ZIP de un tema

Fecha: 2026-09-10
Alcance: `lib/theme-import/zip-parser.ts`, `lib/theme-import/manifest.ts`,
`lib/theme-import/content-type.ts`, `lib/ruta-segura.ts`,
`app/api/theme/importar-zip/route.ts`. NO se repite el SERVIDO de un tema ya
importado (`servir.ts`/`preview-en-vivo.ts`, cerrado en la 39a pasada) - se
cruza contra el solo para confirmar que sus cabeceras cubren lo que este paso
puede haber escrito.

## Resumen ejecutivo

El unico endpoint real de subida es `POST /api/theme/importar-zip`
(`app/api/theme/importar-zip/route.ts`). Esta bien construido en varios
frentes que en otras areas de este repo han sido el bug real: comprueba el
rol server-side (`sesion.rol !== 'PROPIETARIO'`), el aislamiento multi-tenant
del prefijo de R2 usa `sesion.studioId` (del lado servidor) + un `randomUUID()`
(nunca un dato controlado por el cliente), y el Zip Slip clasico (path
traversal escribiendo fuera del prefijo del estudio) ya esta cerrado desde
la auditoria 21/22-ago (`lib/ruta-segura.ts`, `rutaConTravesia`) - verificado
en el codigo actual, sigue vigente y se aplica a cada entrada del ZIP antes de
subir nada.

El hallazgo real de esta pasada es uno solo, pero es concreto: no hay
ningun limite sobre el tamano TOTAL descomprimido de un ZIP (zip bomb). El
unico guardia es el tamano del fichero COMPRIMIDO (25 MB) y el NUMERO de
ficheros (500) - y ambos se comprueban despues de que `fflate.unzipSync`
ya haya descomprimido el ZIP entero en memoria. Un ZIP de 25 MB con ratio de
compresion patologico (datos repetitivos) puede expandirse a varios GB antes
de que cualquier limite se evalue.

No se encontro un endpoint de "subida directa a filesystem" (nada escribe a
disco local; todo va a R2 via `subirObjetoR2`), asi que no hay riesgo de
simlinks maliciosos del ZIP siguiendose en un filesystem real - `fflate`
produce un `Record<string, Uint8Array>` en memoria, no crea symlinks. La
lista blanca de tipos de fichero tampoco existe (se acepta cualquier
extension dentro del ZIP), pero el riesgo de XSS al servir ese contenido ya
esta mitigado por las cabeceras `Content-Security-Policy: sandbox` de
`servir.ts` (39a pasada) - confirmado que se aplican a las tres ramas de
respuesta (HTML, CSS, y "el resto", incluido `.svg`), no solo al entry point.

## Hallazgos

### NARANJA H1 - Sin limite de tamano descomprimido: zip bomb agota memoria antes de que se compruebe cualquier limite

**Archivo:** `lib/theme-import/zip-parser.ts:35-70`

```
export function descomprimirTema(buffer: Uint8Array): ZipDescomprimido {
  if (buffer.byteLength > LIMITE_ZIP_BYTES) { ... }   // solo tamano COMPRIMIDO

  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(buffer);                      // descomprime TODO, sin filtro ni tope
  } catch { ... }

  const rutas = Object.keys(entradas)...
  if (rutas.length > LIMITE_FICHEROS) { ... }           // se comprueba DESPUES de descomprimir
```

`LIMITE_ZIP_BYTES` (25 MB) limita el fichero comprimido subido en el
`multipart/form-data`. `LIMITE_FICHEROS` (500) limita el numero de entradas,
pero se evalua sobre `Object.keys(entradas)`, es decir, despues de que
`unzipSync(buffer)` ya haya materializado en memoria el contenido
descomprimido de cada entrada. `fflate.unzipSync` no recibe ningun `opts`
(no hay `filter` que compare `originalSize` de cada entrada del directorio
central contra un tope antes de inflar los bytes) - se llama a pelo:
`unzipSync(buffer)`.

Con DEFLATE, un ratio de compresion de ~1000:1 es alcanzable con datos
sinteticos (bloques repetitivos/todo-ceros dentro de una entrada del ZIP, sin
necesidad de anidar ZIPs - no hace falta el ataque "42.zip" de ZIPs anidados,
porque aqui solo se descomprime un nivel, pero ese nivel ya es suficiente).
Un ZIP de 25 MB (el maximo permitido) construido asi puede expandirse a
decenas de GB en el `Record<string, Uint8Array>` que `unzipSync` devuelve de
una sola vez, sincronamente, en el mismo proceso Node de la funcion
serverless (`runtime = 'nodejs'`, `maxDuration = 60`).

**Escenario de explotacion concreto:** una propietaria de un estudio (rol
PROPIETARIO real, con plan que incluya la feature `marca` - no hace falta ser
atacante externo, solo una cuenta de pago o de prueba/trial local de 7 dias
sin tarjeta, que en este momento cualquiera puede abrir via `/crear-estudio`)
sube un `.zip` de 25 MB construido con una entrada de compresion extrema.
`unzipSync` intenta materializar el resultado completo en memoria antes de
que el codigo llegue a comprobar `rutas.length > LIMITE_FICHEROS` - el
proceso Node de la funcion agota memoria y cae con OOM (o Vercel la mata por
exceder el limite de memoria de la funcion), devolviendo un 500 a la propia
llamada. Repetido varias veces, es un DoS barato: 25 MB de subida por
intento, coste de CPU en descomprimir en cada invocacion, y consumo de
cuota/coste de ejecucion de Vercel (aunque `maxDuration=60` acota el tiempo,
no la memoria consumida antes de que el runtime aborte).

**Impacto real, verificado con cautela** (siguiendo el criterio del propio
proyecto de no sobrestimar severidad): el endpoint exige sesion de staff +
rol PROPIETARIO + feature de plan, asi que no es explotable sin
autenticacion y el radio de explosion por invocacion se limita al propio
proceso de esa funcion (los runtimes serverless de Node en Vercel no
comparten memoria entre invocaciones concurrentes de distintos tenants de
forma que una caiga la de otro tenant al mismo tiempo, salvo que reutilicen
la misma instancia caliente bajo carga - no verificado en este entorno). Aun
asi, es un fallo real y barato de explotar por cualquier propietaria
(incluida una cuenta de prueba de 7 dias recien creada, sin coste), y encaja
en la categoria que el propio encargo pedia comprobar explicitamente
("ratio de compresion extremo agotando disco/memoria"). Por eso se califica
NARANJA y no ROJO: requiere una cuenta autenticada con rol y plan, y el dano
observable es la caida de la propia funcion, no una fuga de datos de otro
estudio ni una escalada de privilegios.

**Propuesta de fix:** pasar un `filter` a `unzipSync` (soportado por
`fflate` desde v0.7+) que reciba el objeto de cada entrada ANTES de
descomprimirla y rechace la entrada si su `originalSize` (tamano sin
comprimir, leido del directorio central del ZIP, disponible sin inflar el
contenido) supera un tope razonable por fichero (p. ej. 10 MB, coherente con
"un tema estatico no deberia pesar mas" ya dicho en el comentario de
`LIMITE_ZIP_BYTES`), y acumular un total corriendo de bytes descomprimidos
que aborte (lanzando `ZipInvalidoError`) en cuanto supere un tope global (p.
ej. 100 MB - deliberadamente bajo, ya que el propio limite de fichero
comprimido es 25 MB y un tema estatico legitimo de Claude Design no deberia
necesitar mas ratio que ~4:1 en la practica). Alternativa mas simple si la
API de `filter` no cubre el caso: usar la variante streaming de `fflate`
(`Unzip`/`AsyncUnzipInflate`) que entrega cada entrada por partes y permite
cortar en cuanto se supera el tope, en vez de `unzipSync` que no da esa
oportunidad.

---

## Lo que se comprobo y NO es un hallazgo (para no repetir trabajo de proximas pasadas)

- **Zip Slip / path traversal**: cerrado desde la 21/22-ago
  (`lib/ruta-segura.ts:16-18`, `rutaConTravesia`), aplicado en
  `zip-parser.ts:81-83` a CADA ruta relativa antes de anadirla a
  `contenidos`/subir a R2. El ZIP entero se rechaza (no solo la entrada) si
  cualquier segmento es `'..'` o vacio - comportamiento correcto y
  verificado en el codigo vigente.
- **Simlinks maliciosos**: no aplica - `fflate.unzipSync` no sigue ni crea
  symlinks; produce un mapa en memoria, y el destino final es R2 (objetos
  planos), no un filesystem donde un symlink pudiera apuntar fuera del
  prefijo.
- **Aislamiento multi-tenant**: el prefijo de R2
  (`temas-importados/${sesion.studioId}/${id}/`,
  `app/api/theme/importar-zip/route.ts:63`) se construye con
  `sesion.studioId` (de la sesion verificada server-side,
  `verificarSesionStaff`) y un `randomUUID()` - ningun componente del path
  viene del cliente ni del contenido del ZIP. Combinado con el rechazo de
  travesia sobre las rutas relativas, no hay forma de que un ZIP adversarial
  escriba fuera de su propio prefijo. La politica RLS de `theme_imports`
  (`read_theme_imports`/`write_theme_imports`) tambien filtra correctamente
  por `studio_id = current_studio_id()` y exige `current_rol() =
  'PROPIETARIO'` para escritura - verificado en vivo contra
  `dwqvdycjcffqwfkzapvi` (aunque el INSERT real del endpoint pasa por
  `getSupabaseAdmin()` con service-role, que bypasea RLS por diseno; la
  autorizacion real de ese INSERT la da el chequeo de rol en el propio route
  handler, no la politica - coherente con el patron ya documentado en este
  repo para RPCs via admin client).
- **Autorizacion**: comprobada server-side, no solo ocultando el boton en la
  UI - `sesion.rol !== 'PROPIETARIO'` (linea 31) y
  `featureDeEstudio(sesion.studioId, 'marca')` (linea 33), ambos antes de
  tocar el ZIP.
- **Tipos MIME falseados / lista blanca de extensiones**: no existe una
  lista blanca (`clasificarFichero` en `manifest.ts` clasifica por
  extension, cualquier extension no reconocida cae en `'otro'` sin
  bloquearse, y `contentTypeDe` cae a `application/octet-stream` para
  extensiones desconocidas). Esto en si no es un hallazgo nuevo porque el
  riesgo que habilitaria (servir un `.html` renombrado o JS arbitrario que
  luego ejecute en el navegador de una visitante) ya esta mitigado por las
  cabeceras `CABECERAS_CONTENIDO_AJENO` de `servir.ts` - confirmado que se
  aplican en las TRES ramas de `servirFicheroTema` (HTML, CSS, y el resto de
  assets incluido `.svg`, con el comentario explicito en el propio codigo
  sobre por que un `.svg` tambien necesita el sandbox). Es decir: la
  proteccion de la 39a pasada SI cubre todo lo que este paso puede haber
  escrito, no solo el `entry_html` esperado.
- **Ficheros de configuracion (`package.json`)**: se parsea con
  `JSON.parse` dentro de un `try/catch` que descarta el resultado en
  silencio si falla (`zip-parser.ts:112-119`) - sin `eval`, sin YAML con
  tipos custom, solo lectura de `dependencies`/`devDependencies` como
  strings para mostrarlas en el manifest. Sin riesgo de inyeccion.
- **RLS/advisors generales**: `get_advisors` (seguridad) sobre
  `dwqvdycjcffqwfkzapvi` no senala nada nuevo relacionado con
  `theme_imports` o esta area; los hallazgos que si devuelve (funciones
  `SECURITY DEFINER` ejecutables por `anon`/`authenticated`, tablas con RLS
  sin politica) son los mismos ya investigados y cerrados/documentados como
  intencionales en auditorias anteriores (ver `.claude/tentare-os.md`,
  seccion de grants) - no se re-abren aqui.

## Conclusion

Una sola vulnerabilidad real y accionable en esta pasada: H1 (NARANJA, zip
bomb / sin limite de descompresion). El resto del flujo de subida -
autorizacion server-side, aislamiento multi-tenant del storage, Zip Slip- ya
estaba bien construido o ya se habia cerrado en pasadas anteriores.
