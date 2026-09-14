# AUDITORÍA EXTREMA DE TENTARE — 60ª pasada

**Fecha:** 14 de septiembre de 2026
**Auditado:** `origin/main` @ `dd3c520e` (no el árbol local, que va 57 commits por detrás en `claude/alumna-detalle`)
**Producción consultada:** Supabase `dwqvdycjcffqwfkzapvi` y Sentry `tentare-software`
**Entregable:** rama `audit/2026-09-14-60a` en tu repo local + `auditoria-2026-09-14-60a.patch`

---

## ESTADO REAL DE TENTARE

**Estado general.** En 48 horas han entrado 57 commits, 674 ficheros y ~34.000 líneas: la app de la instructora, el bloque RGPD entero (anonimización, retención, derechos de la alumna), 20 migraciones de permisos y el TPV vendiendo cuotas de verdad. Es la mayor superficie nueva de toda la serie, y buena parte se escribió entre la 1 y las 5 de la madrugada de hoy.

**La clase de fallo de esta pasada es nueva: la regresión por copia de una versión anterior.** No es «gemelos divergentes» (arreglar un endpoint y no su hermano), que era la clase dominante desde agosto. Es que **un arreglo nuevo se escribió partiendo de una copia vieja del fichero y deshizo, sin que nadie lo notara, algo que ya funcionaba**. Dos de los siete 🔴 son exactamente eso, y uno de ellos —el TPV sin ficha— llevaba un día entero muerto en producción con `typecheck`, `lint` y 5.000 tests en verde.

| Riesgo | Estado |
|---|---|
| Riesgo técnico | **Medio-alto.** El panel sigue escribiendo a la BD desde el navegador (`lib/studio-context.tsx`, ~4.400 líneas). Es la causa directa de 2 de los 7 🔴 de hoy. |
| Riesgo de seguridad | **Bajado de alto a medio hoy.** Se han cerrado dos fugas reales medidas en producción: el NIF/firma/Stripe de las socias legibles por cualquier instructora, y las bajas de sustitución modificables y borrables por cualquiera del estudio. |
| Riesgo de datos | **Era alto: studio-1 llevaba cinco noches sin copia de seguridad automática.** Arreglado. |
| Riesgo de negocio | **Medio.** El mostrador no podía cobrar sin ficha (la funcionalidad que más se usa: 22 de 35 ventas de producción son sin clienta), y Bizum rompía en silencio la renovación de las cuotas vendidas en mostrador. Ambos arreglados. |
| Deuda técnica | **Estable, no bajando.** Los dos focos estructurales —`studio-context.tsx` y la ausencia de un módulo único de matrícula— siguen ahí y siguen produciendo hallazgos. |
| Áreas más problemáticas | Gamificación (nunca ha funcionado de verdad en el portal), sustituciones (el motor no propone a nadie en 1.119 de 1.123 clases futuras), facturación (33 cobros sin factura, sin moverse en dos pasadas). |

---

# 🔴 CRÍTICOS — 7, todos cerrados

### [C-1] El TPV volvió a prohibir cobrar sin ficha: funcionalidad muerta desde el 13-sep
**Área:** TPV / mostrador · **Archivos:** `supabase/migrations/20260913021304`, `20260913210232`
**Evidencia (producción, con rollback):** cobrar un «Bono 4 clases» sin clienta → `P0001 PLAN_SIN_CLIENTA`.
**Qué ocurría.** `20260907170322_pos_venta_sin_ficha` quitó ese veto a petición expresa tuya («el punto de venta debe ser también libre… alguien que viene a una clase de prueba sin necesidad de tener ficha»). Las dos migraciones de matrícula del 13-sep se escribieron partiendo de la versión **anterior** a ese arreglo y, con `CREATE OR REPLACE`, lo reinstalaron. El código de la app ya daba ese error por muerto: `lib/pos/tipos.ts` lo dice por escrito.
**Impacto.** 22 de las 35 ventas del TPV de producción son sin clienta. La única salida que quedaba era teclear el concepto a mano como importe LIBRE — el incidente que la migración del 7-sep documenta (20 € que entraron bien y no constan como clase en ninguna parte).
**✅ Solucionado.** Migración `20260914081520`, aplicada a producción partiendo de la definición **viva** (no del fichero) con tres cambios comprobados uno a uno. El veto queda solo para las cuotas, que es la decisión vigente (#1957). Verificado en prod, con rollback: BONO sin ficha → OK (64,00 €); CUOTA sin ficha → `CUOTA_SIN_CLIENTA`. Test guardián nuevo que **deriva del SQL**, no de la intención: `lib/pos/venta-sin-ficha.test.ts`.

### [C-2] Bizum seguía abierto para cuotas en las tres puertas del mostrador
**Área:** Cobros · **Archivos:** `app/api/pos/venta`, `app/api/pos/recibo`, `components/pos/*`
**Qué ocurría.** #1954 cerró Bizum en las cuatro puertas de internet el mismo día en que #1956 convirtió al mostrador en la quinta que vende cuotas de verdad. El TPV no llamaba a `bizumPermitidoPara` en ningún sitio.
**Impacto.** Bizum no guarda método de pago → `socios.stripe_payment_method_id` sigue NULL → el recibo de la renovación nace PENDIENTE y **ni siquiera entra en el dunning**. Una cuota de 85 €/mes deja de facturarse desde el ciclo 2, en silencio.
**✅ Solucionado.** Las tres puertas usan ya el módulo único, más las dos pantallas (con el motivo correcto: «No vale para una cuota», no «Conecta Stripe»). La resolución del tipo de plan de un recibo se extrajo a `lib/billing/tipo-plan-de-recibo.ts` para que el checkout online y el mostrador no puedan divergir.

### [C-3] studio-1 llevaba cinco noches sin copia de seguridad automática
**Área:** Infraestructura · **Archivo:** `lib/migracion/catalogo.ts:52`
**Evidencia (producción):** última copia DIARIA de studio-1, **9-sep 03:00**. Los otros 13 estudios, todas. Sentry `JAVASCRIPT-NEXTJS-2P`, «Error leyendo sesiones: Gateway Timeout».
**Por qué.** El arreglo del reintento de #1936 se hizo en `fetchAllRows` y no llegó a su gemelo `leerCatalogoCompleto`, que es el paginador que usa la copia diaria. Un solo 504 en cualquiera de sus ~80 tablas tiraba el snapshot entero. No es volumen: studio-1 tiene 140 sesiones y 222 reservas.
**✅ Solucionado.** El paginador reintenta ante error transitorio, igual que su gemelo. Y el cron emite ahora un aviso explícito a Sentry cuando algún estudio se queda sin copia: el comentario anterior afirmaba que «un 5xx deja rastro en pg_net y en cualquier monitor», y eso **es falso** — pg_cron marcó «succeeded» las 2.184 ejecuciones de 48 h.

### [C-4] El NIF, la firma del contrato y el Stripe de las socias, legibles por cualquier instructora
**Área:** RLS / RGPD · **Migración:** `20260914080445`
**Evidencia (producción, impersonando una instructora real de studio-1):** 32 socias con email legible, 16 con teléfono, 7 con NIF, 11 con la firma del contrato, 4 con `stripe_customer_id`.
**Por qué.** `20260914025903` se declara «Paso 1 de 3» y anuncia una migración de cierre que **no existía en el repo**. El paso 2 (que el panel lea lo público de la tabla y lo privado por RPC) sí estaba hecho y desplegado. Faltaba el paso 3, y la migración se daba por buena.
**✅ Solucionado.** `revoke select on socios` + `grant select` de las 29 columnas que el panel pide de verdad. Verificado con control positivo Y negativo: instructora → 22 filas públicas legibles, NIF/firma/Stripe/texto de salud → **42501**; propietaria → 22 públicas + 22 privadas por la RPC.

### [C-5] Una instructora podía borrar y adjudicarse las bajas de sus compañeras
**Área:** RLS · **Migración:** `20260914075602`
**Evidencia (producción, con rollback):** `UPDATE sustituciones AJENAS = 6 filas`, `DELETE AJENAS = 6 filas`, y por REST leía el `ranking` completo con nombres y motivos de sus compañeras — justo lo que `/api/portal/instructora/baja` le oculta a propósito.
**Lo incómodo.** La 40ª pasada (9-sep) **nombró esta política por su nombre** como la causa de un fallo y arregló solo la RPC. La puerta que nombró siguió abierta cinco días, y #1958/#1960 acaban de darle a cada instructora una app que la lleva ahí.
**✅ Solucionado.** Política partida por rol. Cerrado también su gemelo `instructora_disponibilidad_excepciones` (donde una instructora podía borrar los bloqueos de vacaciones de otra) y revocado el `EXECUTE` de `rankear_candidatas` a `authenticated`.

### [C-6] Al pasar lista, la instructora desbloqueaba logros que no existían
**Área:** Gamificación · **Archivo:** `lib/studio-context.tsx`
**Evidencia (producción):** con una instructora real, `insert completado=false` → pasa la RLS (control positivo); `completado=true` → **42501**; e `insert achievement_history` → **OK**.
**Qué ocurría.** El panel pintaba el logro conseguido, insertaba la fila de historial y pedía los créditos; la escritura del progreso fallaba en silencio (`fire-and-forget`). La socia veía el logro y no recibía los créditos, y **cada vez que alguien volvía a pasar lista se insertaba otra fila de historial**. Hay 5 filas duplicadas en producción que lo prueban.
**✅ Solucionado.** Completar un logro deja de ser optimista: se espera a la base y, si no se guardó, se deshace el estado local y no se anuncia nada. Arreglado también el gemelo de los retos.

### [C-7] En el portal, ningún logro se ha completado jamás — interbloqueo determinista
**Área:** Gamificación (servidor) · **Archivo:** `lib/db/supabase-data-admin.ts`
**Lo encontró la revisión independiente al preguntar por el gemelo de C-6.** `evaluarLogrosServidor` pedía el crédito **antes** de escribir el progreso; la RPC `otorgar_credito_disparador` exige el progreso completado **en la base**, así que respondía `CONDICION_NO_CUMPLIDA`, el `return` salía antes del upsert, y la siguiente evaluación repetía lo mismo para siempre. Con las **24 de 24** definiciones activas de producción llevando créditos, el camino del portal no ha completado un logro nunca. El filtro de Sentry silenciaba justo el error que lo delataba.
**Huella en datos:** una socia real de studio-1 con 2 clases asistidas tiene su «Primera clase» (umbral 1) en `progreso_actual = 0`.
**✅ Solucionado.** Orden invertido, con reversión del completado si el crédito falla por un error real — que es la intención original de la 31ª pasada, esta vez alcanzable.

---

# 🟠 IMPORTANTES

**Cerrados en esta pasada (9):**

| ID | Problema | Evidencia | Arreglo |
|---|---|---|---|
| I-1 | La vigilancia de facturas era **ciega al efectivo**: el cron nunca podía avisar de un cobro en efectivo sin factura | 33 recibos COBRADO sin factura (1.610,05 €), **3 en efectivo invisibles**; cifras idénticas a las del 13-sep | Se separan las dos preguntas («¿cobrado y sin factura?» ≠ «¿le falta la automática?») y el aviso lleva las dos cifras |
| I-2 | El correo de retención prometía un borrado en una fecha concreta que **ese día no ocurre** (la purga está desarmada por variable de entorno) | 6 estudios en `trial_expirado`; **el primer correo sale el 25-sep a una propietaria real** | El asunto y el cuerpo dependen ahora de si la purga está armada, y dicen lo que se borra de verdad (las clientas y el equipo; no la cuenta de la propietaria ni las facturas) |
| I-3 | El aviso de rescate de una sustitución **no entregaba en 10 de 14 estudios**: usaba `studios.email`, vacío en la mayoría | Los 10 tienen email de cuenta válido | Usa `emailDeLaPropietaria`, el helper que ya resolvió esto para el motor de notificaciones el 8-sep y que nunca llegó al módulo cuya única razón de existir es este aviso |
| I-4 | `instructora.baja` salía solo por PUSH, y 9 de 10 propietarias no tienen push | La única de la historia: `PUSH → SKIPPED` | Pasa a CRITICA (el push deja de depender de la preferencia). **El EMAIL no se añadió**: la revisión demostró que habría mandado dos correos por la misma baja |
| I-5 | Quien aceptaba una sustitución desde el email cuando la lista se había agotado leía **«Ya está cubierta»**, siendo falso | La RPC sí acepta ese estado (verificado en prod) | `'agotada'` entra en la lista de estados en juego |
| I-6 | Crons que se tragan el error de lectura y devuelven **200 con cero trabajo hecho** | Sentry: **128 «Gateway Timeout»** en `/api/cron/lista-espera-ofertas-expirar`, todas en la primera página | Módulo `lib/exigir-lectura.ts` aplicado a 4 sitios, incluido el aforo del portal público (donde un 504 pintaba **todas las clases como libres**) |
| I-7 | El cron de lista de espera devolvía 200 con fallos | — | 500, mismo criterio que backups |
| I-8 | El gemelo del trigger `auth_user_id` de instructores seguía con la guardia vieja | El barrido del 13-sep lo buscaba por regex y **su bloque de verificación usaba el mismo regex**: validaba su propio punto ciego | Convertido a `es_llamada_servicio()`, con los tres controles verificados en prod |
| I-9 | La matrícula se cobraba a quien compra sin ficha (escalón siguiente de C-1) | Medido: BONO con matrícula 30 € sin ficha → 94,00 € | `AND p_socio_id IS NOT NULL`. Hoy estaba dormido: ningún plan de producción tiene matrícula > 0 |

**Pendientes (no se tocan: piden decisión tuya o exceden el límite de una pasada):**

- **[P-1] El motor de sustituciones no propone a nadie en 1.119 de 1.123 clases futuras.** `rankear_candidatas` exige filas en `instructora_disponibilidad`, y solo studio-1 las tiene (6/6 instructoras); el resto de estudios, 0 o 1. El SQL no distingue «no ha contestado» de «no puede», y lo primero es el caso del 100 % de los estudios reales. La hoja promete «buscamos quién la cubra» antes de saber si hay alguien. **Decisión de producto:** ¿dejar pasar con penalización a quien no ha dicho cuándo puede, o cambiar la promesa de la pantalla?
- **[P-2] En modo asistido (12 de 14 estudios) nada caduca ni escala.** El único barrido dispara **cuando la clase ya empezó**. Hay dos sustituciones vivas en producción así ahora mismo. La clase se queda sin instructora en silencio y las alumnas se presentan.
- **[P-3] 33 recibos COBRADO sin factura (1.610,05 €), sin moverse en dos pasadas.** Decisión tuya + asesor fiscal. La numeración no impide emitir retroactivo. Ojo: la salida manual sigue siendo una trampa — `crearFacturaDirecta` crea un **recibo nuevo** en vez de colgar del existente (doble contabilización), y #1940 le acaba de poner un botón rojo al lado.
- **[P-4] 85,50 € cobrados y sin entregar desde el 10-sep** (venta nº31 del TPV, sin clienta). El aviso anti-duplicado de #1959 se puso en «asignar plan» y no en «dar de alta», que es el camino del incidente real. Si das de alta a esa persona desde el panel, paga dos veces.
- **[P-5] El puente de sesión del widget entrega los tokens de la socia al dominio que el propio estudio se autoconcede**, sin ninguna validación de propiedad. Hoy, en producción, studio-1 tiene `https://elchefreal.com` en esa lista. La sesión del portal es global a todo el proyecto Supabase.
- **[P-6] `anonimizar_socio` revoca el consentimiento de salud y borra su prueba sin dejar el evento**, en contra de lo que declara la migración que lo creó cuatro horas antes. 6 socias en producción ya con esa huella.
- **[P-7] Quedan 5 módulos más** desestructurando `fetchAllRows` sin mirar el error (los conciliadores de cobros y reembolsos, entre ellos: una lectura parcial de `facturas` haría **avisar de una cadena Veri*Factu rota que no lo está**).
- **[P-8] `achievement_history` no tiene índice único.** Quedan 5 filas duplicadas en producción; el arreglo de C-6 evita las nuevas por la vía del fallo de escritura, no por la estructura.
- **[P-9] El UPDATE de las columnas privadas de `socios` sigue concedido** a `authenticated` (el formulario de la propietaria las escribe desde el navegador). El cierre completo pide mover esa escritura al servidor.

---

# 🟡 MEJORAS (documentadas, no aplicadas)

`valoraciones_iniciales` (la tabla madre) sin el gate de rol que sí tiene su gemela de salud · `valoraciones` deja a una instructora leer las reseñas de sus compañeras · el comentario de `realtime_topics_con_prefijo` afirma de `aforo_*` algo que es falso · el canal `feed:` que la política protege no lo escucha nadie · `notification_delivery` se purga a 12 meses y su madre vive 24 · 39 de 44 socias sin fecha de nacimiento reciben `FALTA_FECHA_NACIMIENTO` al dar su consentimiento desde el portal · el CHECK de minimización de Network puede dejar una verificación imposible de reabrir · `ventas_pos.matricula_cupo_plan_id` es una FK NO ACTION que `deletePlan` no conoce.

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | `studio-context.tsx` (4.400 líneas) escribe a la BD desde el navegador | Alto | **1** — causa directa de C-6 y de buena parte de las pasadas previas |
| Frontend | Correcto en lo nuevo; la app de la instructora está bien acotada | Bajo | 4 |
| Backend | Rutas con guardia de rol explícita y consistente | Bajo | 4 |
| Base de datos | Alineada con el repo (40/40 migraciones del 13-14 sep) | Bajo | — |
| RLS | Dos fugas reales cerradas hoy; el modelo es sólido pero se comprueba poco | Medio | 2 |
| Auth | Sin hallazgos nuevos | Bajo | — |
| Pagos | 5 caminos sin módulo común de matrícula; facturación con 33 huecos | Medio-alto | **2** |
| Reservas | Correcto | Bajo | — |
| Calendario | Correcto | Bajo | — |
| Automatizaciones | Sustituciones: el motor no propone a nadie en el 99,6 % de las clases | Alto | **1** |
| UX | Tres promesas de pantalla que el motor no sostiene (dos arregladas hoy) | Medio | 3 |
| Rendimiento | La separación del bundle de la alumna es real y está verificada | Bajo | — |
| Seguridad | Mejorada hoy; queda el dominio del widget sin validar | Medio | 2 |
| Tests | 5.070, y los guardianes estructurales **funcionan**: dos de mis migraciones y una de mis policies fueron cazadas por ellos | Bajo | — |
| Infraestructura | Copias de seguridad arregladas; `net._http_response` no es un monitor | Medio | 3 |

---

# PLAN DE LIMPIEZA

**Fase 1 — crítico (hecho).** Los 7 🔴 de arriba.
**Fase 2 — estabilización (siguiente).** P-1 y P-2 (las sustituciones no rescatan nada en 12 de 14 estudios) · P-4 (85,50 € vivos) · P-5 (dominios del widget).
**Fase 3 — refactorización.** Partir `lib/studio-context.tsx` y crear un módulo único de matrícula que atraviesen los 5 caminos. Es la misma recomendación que la 59ª pasada, y hoy ha vuelto a pagar dos 🔴.
**Fase 4 — calidad.** P-7 (los 5 módulos restantes con el error tragado) · P-8 (índice único del historial) · P-3 con tu asesor fiscal.
**Fase 5 — mejoras.** La lista 🟡.

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 7 · 🟠 18 · 🟡 12 (más los refutados)

**Solucionados y verificados:** **19** (7 críticos + 9 importantes + 3 hallados por la revisión sobre mis propios arreglos)
**Parcialmente solucionados:** 2 (la vigilancia de facturas ve ya el efectivo, pero los 33 recibos siguen ahí · `exigirLectura` cubre 4 de 9 módulos)
**Pendientes:** 9 (P-1 a P-9, todos con el motivo escrito)
**No verificados:** el `next build` y los endpoints de la app de la instructora por HTTP con dos JWT reales.

**Archivos modificados:** 37 (33 de código + 5 migraciones nuevas, todas aplicadas y verificadas en producción)
**Tests:** 5.070 ejecutados · **1 fallo**, `lib/repo-publico-guardia.test.ts`, que **ya fallaba en el commit base** (necesita un repo git y el árbol de auditoría no lo es) · **4 tests nuevos**
**Typecheck:** ✅ PASS (`lib/**`, `app/**`, `components/pos`, `components/cobros`, `emails/**`)
**Lint:** ✅ PASS (los 28 ficheros tocados)
**Build:** ⚠️ **NO VERIFICADO** — `next build` no arranca en el entorno de auditoría (el `node_modules` viene de macOS por symlink y el binario de esbuild para darwin no corre en Linux; falla en `build:widget`, antes de Next).
**E2E:** no ejecutados.

### Lo que la revisión independiente cazó de mis propios arreglos (9ª pasada seguida en que paga)

Dos revisores en paralelo, con focos distintos, encontraron **11 problemas sobre 14 arreglos**, dos de ellos bloqueantes. El más grave era mío y ya estaba en producción: **el `revoke select on socios` rompió dos políticas de `realtime.messages` que subconsultan `socios.auth_user_id`**, y con ellas el aforo en vivo y los créditos en vivo de la app de la alumna — en silencio, porque una suscripción que no se autoriza no da error visible. El `OR` de la política no salva: el privilegio de columna se comprueba al planificar. Arreglado metiendo la subconsulta en una función `security definer` y verificado con una socia real.

**Lección de método nueva, para la próxima:** antes de revocar el SELECT de una tabla, buscar quién la subconsulta **desde otro esquema** (`realtime`, `storage`), no solo los `.from()` del repo.

### Nivel de confianza

Alto en lo que se ha medido contra producción —cada 🔴 lleva su consulta y su salida, y cada arreglo su control positivo **y** negativo—; y bajo, deliberadamente, en cualquier afirmación de que «no hay más». Esta pasada encontró siete críticos en código escrito en las 48 horas anteriores por el mismo proceso que ya había pasado 59 auditorías: **el ritmo de despliegue de las últimas 48 h va por delante de la capacidad de verificarlo**. Antes de poner Tentare delante de cientos de estudios, lo que yo arreglaría no es un bug: es que las sustituciones no rescatan una clase en 12 de los 14 estudios, y que el panel escriba a la base desde el navegador.
