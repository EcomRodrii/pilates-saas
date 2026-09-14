# Auditoría 58ª pasada — 12 de septiembre de 2026

Rama entregada: **`audit/2026-09-12`** (1 commit, `d1d0f3be`, sobre `origin/main` `77a42727`).
Base auditada: `origin/main` `c7b7a743` (la rama se rebasó sobre los 4 commits que entraron durante la pasada; ninguno tocaba mis ficheros).

## Área elegida y por qué

**Todo lo que se desplegó en las últimas 48 h y ningún ojo había auditado**, más los errores
que están ocurriendo ahora mismo en producción. Motivo: las 57 pasadas anteriores han barrido
en profundidad las áreas maduras (Network, /interno, notificaciones, VeriFactu, cadena, RLS,
integraciones…), y el histórico dice que los 🔴 viven en el código recién desplegado — el
19-ago el checkout embebido, con 3 días en producción, acumuló 4 de los 6 🔴 de la pasada.

Entre el 10 y el 11 de septiembre entraron **132 commits**: la app/PWA de la alumna reescrita,
Bizum abierto en dos sitios nuevos, matrícula con cupo y fecha, changelog/Actualizaciones y
rebotes de correo. Se auditaron esas cinco superficies en paralelo (5 auditores) + los 6
errores abiertos en Sentry, todo verificado contra la base de datos de producción
(`dwqvdycjcffqwfkzapvi`) con SQL, y los arreglos pasaron por **dos revisores independientes**
que encontraron un fallo **bloqueante mío** (ver «Lo que cazó la revisión»).

---

# ESTADO REAL DE TENTARE

- **Estado general:** el producto cobra, entrega y reserva; lo que falla no es el camino
  feliz, sino **las puertas nuevas que se abren sin copiar las guardas de las viejas**.
- **Riesgo técnico:** medio. La arquitectura aguanta; el problema es la velocidad de entrega
  (132 commits en 48 h) contra la ausencia de guardas automáticas para las clases de fallo ya
  conocidas.
- **Riesgo de seguridad:** bajo-medio. No he encontrado en esta pasada ninguna fuga
  cross-tenant nueva; el aislamiento de la app de la alumna se probó **en vivo** con el JWT de
  una socia real (0 filas en `studios`, `socios`, `reservas`, `instructores`; control positivo
  con la propietaria: 32 socias). Sí hay exposición innecesaria de datos propios del estudio
  a clientes anónimos (I-11, I-12).
- **Riesgo de datos:** **ALTO y actual**. `studio-1` (el estudio con más datos reales) lleva
  desde el **9-sep sin copia de seguridad diaria** y nadie se enteró porque el cron devolvía
  200. Y la paginación del backup no ordenaba: con >1000 filas pierde filas en silencio
  (`sesiones` de un estudio ya va por 936).
- **Riesgo de negocio:** una funcionalidad estrella (**Bizum en «pagar y reservar sin login»**)
  llevaba ~36 h en producción **sin haber cobrado ni una vez**, y otra (**matrícula con cupo**)
  se habría agotado sin una sola venta el día que alguien la configurase.
- **Deuda técnica:** concentrada en 3 sitios: los 27 llamantes de `fetchAllRows` que tiran el
  error, las 44 funciones `emitir*` que se tragan los fallos de entrega, y la ausencia total de
  registro de ejecuciones de cron.
- **Áreas más problemáticas:** backups (datos), consentimiento legal en el cobro (jurídico),
  rebotes de correo (nunca se ha ejercitado en producción).

---

# 🔴 CRÍTICOS

### [C-1] «Pagar con Bizum» cobraba sin la casilla legal — y el recibo certificaba lo contrario ✅ SOLUCIONADO

**Área:** cobro / consentimiento · **Archivos:** `components/checkout-widget/checkout-embebido.tsx:575` vs `:603`

**Evidencia:** el botón de tarjeta llevaba `disabled={… || (!!textosLegales && !acepta)}`; el de
Bizum, añadido por #1864/#1865, solo `disabled={enviando}`. `HojaCompra` es el único llamante
que pasa `textosLegales` **y** `onBizum`.

**Qué ocurre:** la alumna paga sin marcar «He leído y acepto las condiciones», y el servidor
sella igualmente `metadata.terminosHash`/`terminosAceptadosEn` (`sellarCondicionesVigentes`
devuelve el sello **sin prueba de aceptación**), que `entregarPlanComprado` escribe en
`recibos.terminos_hash`. El recibo queda como prueba de un consentimiento que no se dio.

**Agravante de método:** el test que lo vigilaba (`e2e/checkout-casilla-legal.spec.ts`,
literalmente «hasta marcarla no se puede pagar») se **estrechó** en #1865 para desambiguar dos
botones… quitando justo el botón nuevo que rompía la garantía.

**Arreglo:** un único `bloqueado` compartido por las dos puertas, reflejado también en cursor y
opacidad; el test e2e ahora exige que el botón de Bizum **exista** (`toHaveCount(1)`) y
comprueba los dos en los tres estados.

**Riesgo residual:** ⚠️ la causa raíz sigue abierta — ver [P-2].

---

### [C-2] El Bizum de «pagar y reservar sin login previo» nunca ha cobrado, y el botón es mudo ✅ SOLUCIONADO

**Área:** cobro · **Archivos:** `app/api/stripe/checkout/route.ts:214-226`, `components/reserva/pantalla-reserva.tsx:413/667`

**Evidencia:** #1864 copió de su gemelo la validación de clase («RÉPLICA EXACTA», comentario del
propio fichero) pero **no la excepción** que hace posible el flujo:
`/api/public/checkout-embebido` dice `if (!socioId && !body.sesionId)`; `/api/stripe/checkout`
decía `if (!socioId)`. `handleBizumSinLogin` nunca manda `socioId`. Verificado en producción:
**los 13 estudios están en `EXIGIR_REGISTRO`**, incluidos los dos únicos con Stripe conectado.

**Qué ocurre:** el 100 % de los clics devuelve 409 — y encima **sin decir nada**: `datosError`
solo se pintaba en la fase de datos, no en la de pago. La visitante pulsa «Pagar con Bizum» y
no pasa absolutamente nada, en la pantalla donde más se abandona.

**Arreglo:** misma excepción que el gemelo (el `sesionId` se valida después: clase del estudio,
no cancelada, no empezada, cubierta por el plan) + el error se pinta en la fase de pago.

---

### [C-3] `studio-1` lleva tres noches sin copia de seguridad, y el cron decía que todo iba bien ⚠️ PARCIALMENTE SOLUCIONADO

**Área:** datos · **Archivos:** `app/api/cron/backups/route.ts:25`, `lib/engines/backup-engine.ts:87`

**Evidencia (SQL en producción):**

| estudio | último backup DIARIO |
|---|---|
| **studio-1** | **2026-09-09 03:00:25** |
| los otros 12 | 2026-09-11 03:00 |

**Por qué nadie se enteró:** `ejecutarCopiaDiariaDeTodos` cuenta `fallidos` y sigue; la ruta
devolvía **HTTP 200** con `{fallidos: 1}`. pg_cron/pg_net ve un 200, descarta el cuerpo y **no
reintenta** (verificado: `cron.job` id 6, `net.http_post` sin reintento). Es el único cron sin
red: corre una vez al día. Y el error que llegaba a Sentry era literalmente
**«Error leyendo planes_tarifa: [object Object]»** — el error de PostgREST no es un `Error`, y
`String(error)` lo destruye.

**Arreglo:** mensaje legible (código + detalle) y 500 cuando `fallidos > 0` + test guardián.

**Pendiente:** ⏳ **lanzar un backup manual de `studio-1` hoy** y diagnosticar el 504
intermitente de Supabase (ver [P-6]). El arreglo hace el fallo VISIBLE; no lo cura.

---

### [C-4] El backup paginaba sin `ORDER BY`: pérdida de datos silenciosa por encima de 1000 filas ✅ SOLUCIONADO

**Área:** datos · **Archivo:** `lib/engines/backup-engine.ts:85`

**Evidencia:** `leerCatalogoCompleto` documenta su contrato en mayúsculas
(«`construir` **DEBE** incluir un `.order(...)` por una columna única… una fila puede repetirse
en dos páginas y otra no salir en ninguna») y `crearSnapshot` era el único llamante que no lo
cumplía. `restaurarSnapshot` borra y reinserta el snapshot tal cual: una fila que no sale del
backup se da por borrada al restaurar. `sesiones` de `studio-1kyper8y7doga` ya tiene **936**
filas, a 64 del umbral.

**La trampa que casi me como:** ordenar todo por `id` habría **roto el backup entero** de dos
tablas — `member_credits` y `preferencias_socio` **no tienen columna `id`** (PK = `socio_id`,
verificado en `pg_constraint`). El mapa de columnas es exhaustivo y **el tipo obliga a
declararla** al añadir una tabla nueva (`Record`, no `Partial<Record>`): la tabla 45 no compila
hasta que alguien decida por dónde se ordena.

---

### [C-5] La app de la alumna se cayó para los 13 estudios durante 40 minutos, y el mecanismo seguía intacto ✅ SOLUCIONADO

**Área:** app de la alumna · **Archivo:** `lib/studio-seo.ts:153-190`

**Evidencia:** el propio fichero lleva escrito el riesgo — *«un despliegue que llegara antes que
la migración dejaría a `data` en null y la página pública de TODOS los estudios diría "no
encontrado". Es la peor avería posible de esta función»* — y describe una defensa (pedir las
columnas nuevas aparte) **que no se aplicaba a seis columnas jóvenes**. El 8-sep pasó:
`creditos_nombre` entró en el `select` a las 09:43 UTC, su migración se selló a las 10:43:05, y
entre medias **17 eventos `STUDENT_ESTUDIO_NO_DISPONIBLE`** en Sentry con socias reales sin
poder entrar (Sentry `JAVASCRIPT-NEXTJS-2C`, todos entre 10:32 y 10:37).

**Arreglo:** si PostgREST responde «columna inexistente», se reintenta con las columnas
estables — el peor caso pasa a ser la home sin lema durante unos minutos — **con aviso a
Sentry**, para no cambiar una caída ruidosa por una avería muda (lo señaló la revisión).

---

# 🟠 IMPORTANTES

| id | hallazgo | estado |
|---|---|---|
| I-1 | **La promoción de matrícula no se puede apagar.** La pantalla promete «si dejas las dos casillas vacías, no hay promoción y se cobra siempre»; `formularioAPlan` omitía los campos y `dbUpdatePlanTarifa` se salta lo `undefined`. Decía «Plan actualizado» y seguía regalando la matrícula. Es el bug de `oferta_hasta` once líneas más abajo del comentario que lo documenta. | ✅ |
| I-2 | **El cupo de matrícula gratis se gastaba en seis salidas tempranas** (clase llena/cancelada/empezada, plan que no la cubre, sin email, Stripe sin conectar) y solo una de ellas lo devolvía. La reserva se mueve al último punto en que la compra aún puede fallar. | ✅ |
| I-3 | **Todo Bizum de compra de plan se contabilizaba como TARJETA** (`metodo_cobro: 'TARJETA'` a pelo). El arqueo cuadra en total y miente en el desglose. Punto único nuevo (`lib/billing/metodo-real-sesion.ts`) usado por las 2 ramas del webhook **y las 2 del conciliador** — que es el camino real en 4 de cada 6 cobros. | ✅ |
| I-4 | **Tras pagar un bono con Bizum desde la app, la alumna aterrizaba en el escaparate público** (`/reservar/<slug>`) en vez de en «Mis bonos»: faltaba `origen: 'portal'`. | ✅ |
| I-5 | **La pantalla de error de la alumna estaba escrita para un caso que nunca se ve.** `error.message === 'STUDENT_ESTUDIO_NO_DISPONIBLE'` es SIEMPRE falso en producción (Next borra el mensaje; confirmado en Sentry `JAVASCRIPT-NEXTJS-2D`, mismos sellos de tiempo). Copia única y neutra: el boundary cubre las 29 pantallas del segmento. | ✅ |
| I-6 | **iOS seguía haciendo zoom al tocar el buscador.** La regla de 16 px existía pero la mitad de los campos llevan el tamaño en `style` en línea, que gana. Ahora `!important` acotado a `pointer: coarse`, y el test lo exige como `CSSMediaRule` real. | ✅ |
| I-7 | **La foto de instructora entraba cruda en un `url(...)` de CSS.** Validada con `esUrlImagenValida` (como «Descubre») y escapada. Verificado que las 7 fotos de producción son https → sin regresión. | ✅ |
| I-8 | **Un buzón marcado como rebotado no se puede desmarcar nunca.** La única salida es `email.delivered`, que para una dirección suprimida por Resend **no puede llegar**. Cruzan con **9 socias reales de 2 estudios**, excluidas para siempre del aviso de hueco. Cero UI, cero endpoint. | ⏳ |
| I-9 | **Una queja de spam en un estudio silencia el correo en TODOS** (`email_rebotes` no tiene `studio_id`). Cierto para un rebote —es un hecho del buzón—, falso para una queja: es consentimiento frente a un estudio concreto. Hoy contenido (0 quejas), e irreversible en cuanto entre la primera. | ⏳ |
| I-10 | **El webhook de rebotes lleva 35 h sin procesar un solo evento** (0 filas `resend:%` en `webhook_events`; las 30 de `email_rebotes` son un backfill manual anterior al alta del webhook). Si `RESEND_WEBHOOK_SECRET` no está en Vercel, devuelve 503 a cada evento en silencio. | ⏳ |
| I-11 | **La tabla de reservas entera del estudio viaja a cualquier anónimo** (`/api/public/studio-data`: id, sesión, estado y **spot** de todas las reservas históricas), antes del `if (!member)`. | ⏳ |
| I-12 | **La clasificación interna de CRM viaja al navegador de la propia socia** (`leadStage`, `tags`, `origenLead`, `referidoPor`, ids de Stripe/SEPA). Ninguna pantalla la pinta. | ⏳ |
| I-13 | **30 recibos COBRADO sin factura, 1.355,05 €, el más antiguo del 9-jul** (medido en producción). El conciliador los detecta bien y **no** es un placebo —decide no sellar porque cambiar de trimestre fiscal es decisión de una persona—, pero el aviso salta cada día sin forma de cerrarlo: se acabará ignorando. | ⏳ |
| I-14 | **27 llamantes de `fetchAllRows` tiran el `error`** y tratan «falló la lectura» igual que «no había nada que hacer» (6 en caminos de dinero). Hoy enmascarado por la cadencia de los crones; muerde en los que corren una vez al día — y ahí ya mordió ([C-3]). | ⏳ |
| I-15 | **El «Realtime» que /interno promete no existe:** `changelog_versiones` está en la publicación (pagando WAL) y **ningún componente se suscribe** — #1862 borró al único suscriptor y tres comentarios lo siguen citando. | ⏳ |

---

# 🟡 MEJORAS

- **M-1 ✅** La home decía «Hay 3 clases hoy con plaza libre» habiendo 8: el contador usaba la
  lista recortada a 3.
- **M-2 ⏳** El gate de «página oculta» está declarado en `lib/student/estudio.ts` («que el
  layout tiene que respetar igual que /reservar») y **no lo lee nadie** en `app/portal/**`. Hoy
  inocuo (0 estudios ocultos).
- **M-3 ⏳** `suspendido_en` lo miran 10+ crones y **ninguna ruta pública**: los 2 estudios
  suspendidos tienen 0 socias, así que hoy no hace daño.
- **M-4 ⏳** La subida de imagen del changelog valida el `Content-Type` que manda el cliente, no
  los bytes (mitigado: exige admin interno, el bucket tiene mimes restringidos y el nombre de
  fichero lo pone el servidor).
- **M-5 ⏳** «Descubre» (lado panel) guarda cada pulsación sin validar el enlace ni limitar la
  longitud en servidor; los campos nuevos del estudio (lema, frase manuscrita…) no tienen CHECK.
- **M-6 ⏳** Zonas táctiles por debajo de 44 px en 4 sitios (avatar de la cabecera, asa de la
  hoja, los dos enlaces del login).
- **M-7 ⏳** `Sheet` no bloquea el scroll del fondo.
- **M-8 ⏳** El TPV es un **quinto** camino de venta y no sabe nada de la matrícula (la cabecera
  de la migración dice que son cuatro).

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Sólida donde hay punto único; se rompe al abrir puertas nuevas (C-1, C-2, I-3) | Medio | 2 |
| Frontend (app alumna) | Recién reescrito, con promesas sin respaldo (M-1, I-5, I-6) | Medio | 2 |
| Backend / API | Gemelos que divergen al añadir una función (C-2, I-2) | Medio | 1 |
| Base de datos | Esquema sano; el peligro es el ORDEN despliegue↔migración (C-5) | Medio | 2 |
| RLS | Probada en vivo con JWT real, sin fuga nueva | Bajo | 4 |
| Auth | No auditada en esta pasada | ? | — |
| Pagos | Importes siempre del servidor; falla el CONSENTIMIENTO y el desglose (C-1, I-3) | Alto | 1 |
| Reservas | Idempotencia correcta (ids derivados de Stripe), aforo respetado | Bajo | 4 |
| Calendario | No auditado en esta pasada | ? | — |
| Automatizaciones | Crones sin registro de ejecución; errores tragados (I-14) | Medio | 3 |
| UX | Botones mudos, copias que no se ven (C-2, I-5) | Medio | 2 |
| Rendimiento | Sin regresión medida (EXPLAIN del backup: 0,37 ms) | Bajo | 5 |
| Seguridad | Sin fuga cross-tenant nueva; exposición innecesaria (I-11, I-12) | Bajo-medio | 3 |
| Tests | 4.510 en verde, pero varios guardianes eran decorativos (C-1, I-6) | Medio | 2 |
| Infraestructura | **Backups sin vigilancia + 504 intermitente sin diagnosticar** | **Alto** | **1** |

---

# PLAN

**FASE 1 — hoy**
1. Lanzar un backup manual de `studio-1` (3 noches sin copia).
2. Comprobar si `RESEND_WEBHOOK_SECRET` está puesta en Vercel (I-10): 2 minutos, y decide si
   todo #1868 funciona o no funciona nada.
3. Fusionar `audit/2026-09-12`.

**FASE 2 — estabilización**
4. Diagnosticar el 504 intermitente de Supabase (explica C-3 y 3 errores más de Sentry).
5. Liberar el cupo de matrícula al expirar/cancelar el checkout, con idempotencia por sesión
   ([P-1]).
6. Exigir prueba de aceptación en el servidor antes de sellar `terminos_hash` ([P-2]).

**FASE 3 — refactorización**
7. Tratar el `error` de `fetchAllRows` en los 6 caminos de dinero y en los crones diarios.
8. Salida para los rebotes (I-8) y separar la queja por estudio (I-9).

**FASE 4 — calidad**
9. Tabla de ejecuciones de cron (hoy no se puede reconstruir «no me llegó el aviso»).
10. Recortar lo que viaja al cliente en `/api/public/studio-data` (I-11, I-12).

**FASE 5 — mejoras**
11. M-2 a M-8.

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Verificación | Estado |
|---|---|---|---|---|
| C-1 | Bizum sin casilla legal | `checkout-embebido.tsx`, `e2e/checkout-casilla-legal.spec.ts` | Un solo `bloqueado` para las dos puertas; revisado el comportamiento de los 3 llamantes | ✅ |
| C-2 | Bizum sin login → 409 + mudo | `api/stripe/checkout/route.ts`, `pantalla-reserva.tsx` | Comparado línea a línea con el gemelo; `compra_publica_modo` de los 13 estudios leído en producción | ✅ |
| C-3 | Backups mudos e ilegibles | `api/cron/backups/route.ts`, `backup-engine.ts` | Test nuevo del mensaje legible; `cron.job` revisado (pg_net no reintenta) | ⚠️ |
| C-4 | Backup sin ORDER BY | `backup-engine.ts`, `backup-engine.test.ts` | Las 44 tablas comprobadas en `information_schema`+`pg_constraint`; el test falla si se quita el `.order()` (probado) | ✅ |
| C-5 | `select` frágil de `studios` | `lib/studio-seo.ts` | Cronología reconstruida con Sentry + `schema_migrations`; aviso a Sentry al degradar | ✅ |
| I-1 | Promoción que no se apaga | `lib/planes/formulario.ts` + test | El test que IMPONÍA el bug reescrito; ida y vuelta del plan verde | ✅ |
| I-2 | Cupo gastado en 6 salidas | los 2 endpoints de checkout | Listados todos los `return` entre la reserva y el cobro (revisor: sin fugas) | ✅ |
| I-3 | Bizum contado como tarjeta | `metodo-real-sesion.ts`, webhook, conciliador, `entregar-plan-comprado.ts` | `CHECK` de `recibos.metodo_cobro` leído en producción (admite BIZUM); lectores revisados | ✅ |
| I-4 | Retorno al escaparate | `lib/student/comprar.ts` | `parsearOrigenPago` + ruta `/portal/[slug]/bonos` comprobadas | ✅ |
| I-5 | Copia muerta en error.tsx | `app/portal/[slug]/error.tsx` | Confirmado en Sentry que el mensaje llega borrado | ✅ |
| I-6 | Zoom de iOS | `student.css`, `e2e/student-iphone.spec.ts` | **Parseado con postcss y css-tree**: 1 media `coarse`, regla presente, 0 selectores basura | ✅ |
| I-7 | URL de foto en CSS | `InstructorCard.tsx` | 31 instructoras en producción: 7 con foto, las 7 https → sin regresión | ✅ |
| M-1 | Contador de huecos | `app/portal/[slug]/page.tsx` | `ProximaClaseVacia` revisado con 0, 1 y N | ✅ |

## PROBLEMAS PENDIENTES (y por qué no se han tocado)

| ID | Problema | Sev | Por qué no | Próximo paso |
|---|---|---|---|---|
| P-1 | El cupo de matrícula no vuelve si se abandona el checkout (el caso más común con Bizum) | 🟠 | El arreglo exige liberar desde el webhook (`checkout.session.expired`, `payment_intent.payment_failed`) y **hacerlo idempotente**: los dos manejadores pueden dispararse para el mismo pago y liberar dos veces regalaría una plaza. No se improvisa en el camino del dinero | Marcar `metadata.cupoMatricula` + liberación con clave por sesión |
| P-2 | El servidor sella `terminos_hash` sin ninguna prueba de aceptación | 🟠 | Es decisión de producto/jurídica: hoy solo 1 de 13 estudios pinta casilla, y exigirla en el servidor dejaría de cobrar a los otros 12 | Que el cliente mande la aceptación y el servidor la exija cuando haya textos |
| P-3 | `RESEND_WEBHOOK_SECRET` sin verificar | 🟠 | No tengo acceso al entorno de Vercel ni salida de red | Enviar un correo y mirar `webhook_events` |
| P-4 | I-8 / I-9 (rebotes irreversibles, queja global) | 🟠 | Requiere UI nueva + llamada a `remove-suppression` de Resend, y decidir el ámbito de la queja | Endpoint en /interno + filtro por tipo en `hueco/avisar` |
| P-5 | I-13 (1.355,05 € cobrados sin factura desde julio) | 🟠 | Decisión fiscal, no técnica | Hablarlo con el asesor + lista de exención nominal |
| P-6 | La causa del 504 intermitente de Supabase | 🟠 | Sin acceso a los logs del pooler. **Refutado** que sea la consulta: la de `notif-trial` tarda 0,13 ms sobre 13 filas | Revisar plan/conexiones del proyecto |
| P-7 | I-14 (27 llamantes que tiran el error) | 🟠 | Tocar 27 sitios a ciegas en una pasada es exactamente lo que esta auditoría no debe hacer | Empezar por los 6 de dinero |
| P-8 | `lib/theme-import/servir.ts` repite el patrón de C-5 sin red | 🟡 | Fuera del alcance revisado; merece su propia comprobación | Misma partición de columnas |
| P-9 | I-11 / I-12 (datos de más al cliente) | 🟠 | Cambiar el payload público toca el widget y la app; hace falta medir quién consume qué | Agregar en servidor para el camino anónimo |
| P-10 | I-15, M-2 a M-8 | 🟡 | Sin impacto medido hoy | Backlog |

---

# Lo que cazó la revisión independiente (y por qué se hace)

Dos revisores en paralelo, focos distintos (dinero / app+backups), con el diff **y** el árbol
final. Encontraron **1 bloqueante mío y 6 mejoras reales**, con los 4.510 tests, el typecheck y
el lint en verde:

1. 🔴 **Mi comentario de `student.css` cerraba dos veces (`*/`) y el navegador se tragaba el
   `@media (pointer: coarse)` ENTERO**: el arreglo de los 16 px no es que no ganara, es que
   había desaparecido — peor que antes del parche. Lo detectó parseando el CSS con postcss y
   css-tree. Arreglado y verificado con las dos herramientas.
2. El botón de Bizum quedaba `disabled` pero se pintaba a opacidad 1 con cursor de mano: otro
   botón mudo, reintroducido a tres ficheros del que yo acababa de arreglar.
3. `metodoRealDeSesion` se quedaba dentro del fichero de la ruta, así que **el conciliador
   —que es el camino real en 4 de cada 6 cobros— seguía escribiendo TARJETA**. Mi propio
   comentario justificaba que «el conciliador no lo sabe», y era falso: tiene la sesión en el
   ámbito. Movido a `lib/billing/` y usado en las dos ramas del conciliador.
4. `encodeURI` habría roto cualquier foto con `%` ya codificado (`%20` → `%2520`).
5. El test del ORDER BY habría dado verde para una tabla 45 con PK distinta de `id` → el tipo
   ahora es exhaustivo y no compila sin declararla.
6. El test e2e nuevo con `if (await bizum.count())` podía quedar verde sin comprobar nada.
7. Degradar en `studio-seo` sin avisar cambiaba una caída ruidosa por una avería muda.

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 5 · 🟠 15 · 🟡 8 (28)

- **Solucionados y verificados:** 12 (5 críticos —uno parcial— y 7 importantes/mejoras)
- **Parcialmente solucionados:** 1 (C-3: el fallo ya es visible; la causa sigue)
- **Pendientes:** 15, todos con motivo escrito arriba
- **Refutados durante la pasada:** varios, entre ellos que `menu_posicion` siga roto (fue una
  deriva transitoria de 14 min el 7-sep, ya cerrada), que el conciliador de facturas sea un
  «placebo» (no lo es), que falten índices en el cron de trials (0,13 ms medidos), y que el
  `logout` de la alumna deje viva la sesión local (auth-js sí la borra)

**Archivos modificados:** 21 (20 tocados + 1 nuevo) · **Tests nuevos:** 3 (+2 reforzados)

- **Tests:** 4.510 ejecutados, **4.510 PASS**, 0 fallos
- **Typecheck:** **PASS** sobre `lib/**`, `app/api/**`, `app/portal/**`, `app/reservar/**` y los
  componentes tocados (64 s). El proyecto entero no cabe en el límite de tiempo del sandbox
- **Lint:** **PASS** sobre los 21 ficheros
- **Build:** **NO VERIFICADO** — `next build` no corre aquí (el `node_modules` del entorno no
  trae el SWC de linux-arm64 y no hay salida de red)
- **E2E:** **NO EJECUTADOS** (no hay Playwright en el sandbox). Los dos specs tocados se han
  revisado a mano; el de la casilla legal **fallará** si alguien quita el botón de Bizum, que es
  justo lo que se quiere

### Estado real post-auditoría

Tentare está **mejor que al empezar** en tres frentes medibles: ya no se puede pagar sin
aceptar las condiciones por la puerta de Bizum, el Bizum sin login puede cobrar por primera vez
desde que se desplegó, y los backups han dejado de mentir. Lo que **sigue abierto y es urgente**
no es código: es que `studio-1` necesita una copia manual hoy y que alguien mire por qué
Supabase devuelve 504 intermitentes.

Nivel de confianza: **medio-alto en lo tocado** (verificado contra producción y revisado por dos
pares), **bajo en lo no mirado**. No he auditado en esta pasada: calendario/recurrencias,
auth/onboarding, mensajería, comunidad, logros ni el motor de sustituciones. Y no puedo afirmar
que el build pase ni que los E2E pasen: no los he ejecutado.

**Lo que haría antes de poner esto delante de cientos de estudios:** un monitor de backups
(hoy la única señal es que alguien mire Sentry), una prueba de que el webhook de rebotes
procesa un evento real, y cerrar el sellado de consentimiento en el servidor. Las tres son
pequeñas; las tres son de las que se notan cuando ya es tarde.
