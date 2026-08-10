# Auditoría de eventos y calidad del Umbral — 6 ago 2026

> **Alcance:** solo lectura. No se ha modificado una línea de código ni una fila de la base de datos.
> **Método:** consultas sobre la base de producción (`dwqvdycjcffqwfkzapvi`) + lectura del repo en `HEAD` (`5aa386f5`, 4 ago).
> **Objetivo:** responder a dos preguntas antes de construir nada encima — (1) ¿el Decision OS está funcionando de verdad? (2) ¿qué conocimiento estamos perdiendo cada día?
>
> **Rev. 2 (6 ago):** §3 reescrito con la lista cerrada de eventos premium y la corrección sobre el `await`. §5 nuevo: reglas de trabajo.

---

## Resumen ejecutivo

Tres hallazgos, en orden de gravedad:

1. **La métrica que define "MVP lanzado" es hoy incomputable.** `dbMarcarVista` está escrita y exportada, y **no la llama nadie**. Las 41 recomendaciones tienen `vista_en = NULL`. El criterio de salida de la Fase D (">80% de recomendaciones revisadas") no se puede evaluar ni hoy ni retroactivamente.
2. **El motor acierta 3 de cada 18 veces, y los 3 aciertos son de reglas deterministas, no de IA.** Los únicos outcomes `POSITIVO` son `COBRAR_PENDIENTE` → señal `PAGO`. Retención, que es la apuesta grande, lleva **cero positivos**.
3. **El log de eventos —el cimiento de la Intelligence Network— pierde hechos en silencio, y hay 9 tablas fantasma en producción.**

---

## 1 · ¿Está funcionando el Umbral?

### 1.1 Los números

41 recomendaciones sobre 9 estudios, del **13 jul** al **6 ago** (24 días).

| Estado | n | Con `vista_en` |
|---|---|---|
| EJECUTADA | 19 | **0** |
| PENDIENTE | 13 | **0** |
| EXPIRADA | 8 | **0** |
| RECHAZADA | 1 | **0** |

Aprobación aparente: **19 de 20 resueltas (95%)**.

**Ese 95% no es una señal de producto.** 18 de las 20 las resolvió el mismo `resuelto_por` (`480ef964…`) y 1 otro usuario. Es dogfooding, con n=20. No dice que las recomendaciones sean buenas; dice que quien las aprueba es quien las construyó.

### 1.2 🔴 `vista_en` nunca se escribe — código muerto

```
lib/decision/db.ts:202   export async function dbMarcarVista(id, vistaEn): Promise<void>
```

La función existe, hace lo correcto (`.is('vista_en', null)` para no pisar la primera vista) y **no tiene un solo llamador**. No hay ruta API que la exponga: en `app/api/decisiones/` están `aprobar`, `rechazar`, `posponer`, `analizar`, `autonomia`, `confirmacion-riesgo` — ninguna marca vista.

Consecuencias:

- La métrica de éxito de la Fase D es **incomputable**. No se puede decir si el MVP está listo para lanzar.
- No se distingue **"la vio y pasó"** de **"nunca la vio"**. Son diagnósticos opuestos: el primero significa que la recomendación es mala; el segundo, que el producto no la está enseñando. Hoy los 13 PENDIENTE y los 8 EXPIRADA son indistinguibles entre esas dos causas.
- **No es backfilleable.** Cada día sin esto es un día de señal perdida.

### 1.3 🔴 Lo que de verdad funciona son las reglas, no la IA

De los 21 outcomes registrados, 18 están medidos y 3 siguen `PENDIENTE`:

| Outcome | n | Señal observada |
|---|---|---|
| POSITIVO | **3** | `PAGO` (ventana 3 d) — los tres |
| NEGATIVO | 4 | `CANCELO` ×2, `SIN_RESPUESTA` ×2 |
| NEUTRO | 9 | `SIN_RESPUESTA` ×5, sin señal ×4 |
| PENDIENTE de medir | 3 | — |

**Tasa positiva real: 3/18 ≈ 17%.**

Y el reparto por especialista es el hallazgo importante:

- **`INGRESOS / COBRAR_PENDIENTE`** — es la única familia con positivos. Es una **regla determinista**: hay un recibo pendiente, se reclama, se cobra o no en 3 días. Señal binaria y verificable.
- **`RETENCION / RECUPERAR_SOCIA`** (14 recomendaciones, la familia más numerosa) — **cero positivos**. Sus señales son `SIN_RESPUESTA` y `CANCELO`. Es donde vive la redacción por LLM.

> Esto valida empíricamente la regla de producto: *"no metas IA en el flujo crítico si una regla clásica resuelve el 95% del problema"*. Lo que produce dinero medible hoy es `WHERE recibo.estado = 'PENDIENTE'`. Lo que no produce nada medible es el mensaje redactado.
>
> **Matiz obligatorio:** n=18. Esto es una señal temprana, **no una conclusión**. Con 18 outcomes no se puede afirmar que la retención no funciona — se puede afirmar que **todavía no hay ni una sola prueba de que funcione**, y que seguir construyendo encima sin esa prueba es la definición de deuda.

### 1.4 🟠 Ocho recomendaciones de dinero caducaron sin que nadie las tocara

Las 8 `EXPIRADA` tienen `resuelto_por = NULL`. **Seis son `COBRAR_PENDIENTE`** — es decir, justo la familia que sí convierte. Score medio 22,6.

O nunca se enseñaron (ver §1.2), o se enseñaron y se ignoraron. **No podemos saber cuál**, y esa es exactamente la información que `vista_en` daría.

---

## 2 · Estado del registro de hechos

### 2.1 🔴 El log de eventos se escribe fire-and-forget

```
lib/studio-context.tsx:3035
    setActividadReciente(prev => [nueva, ...prev]);
    dbInsertActividadReciente(nueva);        // ← sin await, sin comprobar resultado
```

`dbInsertActividadReciente` (`lib/supabase-data.ts:2395`) sí reporta a Sentry, pero el llamador no espera ni reintenta. **Si el insert falla, el hecho aparece en la pantalla de la propietaria y no existe en la base de datos.** Nadie se entera.

El problema **no es que no bloquee la UI** — hace bien en no bloquearla (ver §3.2). El problema es que **el fallo es invisible e irrecuperable**. Un bug de UI se ve y se arregla; un evento perdido no vuelve nunca.

### 2.2 🟠 El log registra administración, no negocio

20 tipos de evento en producción. Los cinco más frecuentes:

| Tipo | n |
|---|---|
| `EQUIPO_EDITADO` | 23 |
| `SOCIA_EDITADA` | 14 |
| `NUEVA_SOCIA` | 13 |
| `DECISION_GESTIONADA` | 11 |
| `SOCIA_ELIMINADA` | 11 |

Frente a eso, los hechos de negocio están casi vacíos: **`NUEVA_RESERVA` = 2** (con **153 reservas** en la tabla), `CANCELACION` = 1, `PAGO_COBRADO` = 2, `NUEVA_SUSCRIPCION` = 1.

El log no refleja la operación. Refleja quién tocó qué en el panel. Para una Intelligence Network eso es casi inútil: *"qué horarios convierten"* o *"qué clases llenan más"* se responde con reservas y cancelaciones, no con ediciones de ficha.

### 2.3 🔴 Nueve tablas viven en producción sin migración ni código

Verificado por doble vía (`CREATE TABLE` y mención libre en todo `supabase/`):

| Tabla | Filas en prod | En `supabase/migrations` | Usada por el código |
|---|---|---|---|
| `comunicaciones_socio` | 1 | ✗ | ✗ |
| `intentos_reserva_fallidos` | 0 | ✗ | ✗ |
| `instructor_bajas_seguimiento` | 0 | ✗ | ✗ |
| `liquidaciones_instructoras` | 1 | ✗ | ✗ |
| `reto_participaciones` | 0 | ✗ | ✗ |
| `devoluciones` | 0 | ✗ | ✗ |
| `studio_horario` | **63** | ✗ | ✗ |
| `changelog_versiones` | 6 | ✗ | ✗ |
| `changelog_cambios` | 31 | ✗ | ✗ |

Se crearon fuera del flujo de migraciones (panel de Supabase o `apply_migration` directo contra producción). Tres problemas:

1. **`npx supabase start` —el camino que el README marca como "el bueno"— produce una base que no es la de producción.** Cualquiera que desarrolle en local trabaja contra otro esquema.
2. **`studio_horario` tiene 63 filas de datos muertos.** Fue un diseño anterior que sustituyó la migración `20260731160000`, que en su lugar añadió `hora_apertura`/`hora_cierre` a `studios`. Nadie lo lee ni lo borró.
3. **Dos de las nueve son eventos premium de §3.1.** Sus comentarios en la base son excelentes y citan "el informe estratégico" (filas 11, 14, 18). Están **diseñadas y sin cablear**.

---

## 3 · Contrato de eventos

### 3.1 La lista cerrada: 12 eventos premium

Regla de entrada: **si un evento no puede ayudar a ganar dinero, ahorrar tiempo o mejorar el producto en el futuro, no se guarda.** No se registra todo. No hay 400 tipos. Esta lista es cerrada: añadir uno nuevo exige justificar cuál de las tres cosas produce.

| # | Evento | Destino | Estado hoy | ¿Se toca ahora? |
|---|---|---|---|---|
| 1 | `RecommendationViewed` | `recomendaciones.vista_en` | Función escrita (`lib/decision/db.ts:202`), **sin llamador** | ✅ **Sí** — pieza diseñada y desconectada |
| 2 | `RecommendationAccepted` | `recomendaciones.estado/resuelto_en/resuelto_por` + `actividad_reciente.DECISION_GESTIONADA` | **Ya funciona** (19 filas, 11 actividades) | ⛔ Nada que hacer |
| 3 | `RecommendationRejected` | ídem | **Ya funciona** (1 fila) | ⛔ Nada que hacer |
| 4 | `ReservationCreated` | `actividad_reciente.NUEVA_RESERVA` | Tipo existe; **2 eventos con 153 reservas** — la vía principal no emite | ✅ **Sí** — conectar la emisión donde ya se crea la reserva |
| 5 | `ReservationCancelled` | `actividad_reciente.CANCELACION` | Tipo existe; **1 evento** | ✅ **Sí** — mismo caso |
| 6 | `SubstitutionAccepted` | `sustitucion_contactos` | Tabla + código de escritura en 3 ficheros; **0 filas con 7 sustituciones** | ⚠️ **Verificar primero** por qué no dispara — no tocar hasta saberlo |
| 7 | `SubstitutionRejected` | ídem | ídem | ⚠️ ídem |
| 8 | `CommunicationSent` | `comunicaciones_socio` | **Tabla fantasma**: sin migración, sin código | 🔴 **Informe, no implementación** — exige migración + emisión en varias áreas |
| 9 | `CommunicationOutcome` | `comunicaciones_socio` | ídem | 🔴 ídem |
| 10 | `LeadCreated` | — | **No existe entidad de lead de estudio.** `plataforma_lead` son leads de Tentare-empresa | ⛔ **Fuera de alcance** — es funcionalidad nueva |
| 11 | `LeadConverted` | — | ídem | ⛔ ídem |
| 12 | `PaymentRecovered` | `recomendacion_outcomes` (señal `PAGO`) + `actividad_reciente.PAGO_COBRADO` | Parcial: 3 outcomes con señal `PAGO`, pero solo 2 `PAGO_COBRADO` | ⚠️ **Verificar** si la señal del Decision OS basta antes de duplicar |

**Lectura de la tabla:** de los 12, **2 ya funcionan** y no hay que tocarlos, **3 son pieza diseñada y desconectada** (1, 4, 5) y entran ahora, **3 exigen verificar antes de tocar** (6, 7, 12), **2 son un informe** (8, 9) y **2 quedan fuera** porque serían funcionalidad nueva (10, 11).

`LeadCreated` / `LeadConverted` son los eventos más valiosos de la lista a medio plazo — sin ellos no hay Agente de Captación — pero hoy no tienen dónde caer. Construir la entidad de lead es una decisión de producto aparte, no una pieza pendiente de conectar.

### 3.2 Corrección: `await` en el flujo de UI era mala recomendación

En la revisión anterior propuse *"poner `await` y reintento en el log de eventos"*. **Retiro esa recomendación.** Bloquear la interfaz para escribir un evento de telemetría es exactamente el intercambio equivocado: la propietaria paga latencia por un dato que no le sirve a ella.

El objetivo correcto es: **la UI responde inmediatamente y el evento no se pierde.** Eso son dos cosas independientes, y hoy solo se cumple la primera.

Ahora bien, antes de construir una cola hay una pregunta previa: **¿por qué emitimos estos eventos desde el cliente?** De los 12 eventos premium, la mayoría son hechos que ya ocurren **en el servidor**:

| Origen del hecho | Patrón correcto | Coste |
|---|---|---|
| **Hecho de negocio con RPC de servidor** (reserva creada/cancelada, pago recuperado, sustitución aceptada) | Emitir el evento **dentro de la misma transacción que el hecho**. Atómico: si la reserva existe, el evento existe. No hay UI que bloquear, no hay cola, no hay reintento posible ni necesario | El más barato y el más fiable |
| **Hecho de UI puro** (recomendación vista) | Petición no bloqueante desde el cliente (`void fetch(...)` con `.catch()`), disparada al renderizar. Si falla, un reintento en memoria. Nunca en el camino de un botón | ~10 líneas, sin infraestructura |
| **Desenlace diferido** (`CommunicationOutcome`, medido a los N días) | Inngest, que ya está en el stack y ya lo hace para `recomendacion_outcomes` | Cero — la infraestructura ya existe |

Es decir: **la cola con worker y reintento que propones ya existe en el stack (Inngest), y para la mayoría de eventos ni siquiera hace falta**, porque emitir junto al hecho en el servidor es más fuerte que cualquier cola — una cola puede perder el mensaje entre la acción y el encolado; una transacción no.

Mi recomendación, por tanto, **no** es construir un subsistema de eventos. Es mover la emisión al lado del hecho. Y eso además cumple la regla de "pequeño, verificable y reversible", cosa que un bus de eventos nuevo no cumpliría.

**Donde sí discrepo con no hacer nada:** el `dbInsertActividadReciente` de `lib/studio-context.tsx:3035` debe al menos dejar de tragarse el fallo en silencio. No con `await` — con un `.catch()` que reintente una vez y, si falla, lo reporte. Sigue sin bloquear la UI, y deja de perder hechos sin ruido.

---

## 4 · Qué significa esto para el plan

**«No metas IA si una regla clásica resuelve el 95%.»** Los 3 únicos aciertos medidos salen de una regla determinista. La familia con LLM lleva 14 intentos y 0 positivos. Consecuencia práctica: **el Agente de Captación y Retención debe nacer como motor de reglas con outcomes medidos**, y el LLM entrar solo en la redacción del mensaje — y solo cuando haya evidencia de que la redacción cambia la tasa de respuesta. Hoy no la hay, porque no se está midiendo.

**«Si un evento no ayuda a ganar dinero, ahorrar tiempo o mejorar el producto, no se guarda.»** La lista de §3.1 es esa regla aplicada: 12 eventos, ni uno más. De esos 12, cinco están hoy sin recoger y **tres se pueden conectar sin construir nada nuevo**.

---

## 5 · Reglas de trabajo a partir de aquí

Vigentes hasta nueva orden:

- **No se construye funcionalidad nueva.** Solo se completan piezas ya diseñadas y desconectadas.
- **No se refactoriza el producto ni se optimiza el rendimiento.** Los god-files y los O(n²) del calendario quedan documentados en la auditoría semanal y no se tocan.
- **Cada cambio: pequeño, verificable y reversible.**
- **Límite duro:** si una tarea supera ~100-150 líneas modificadas o toca varias áreas del sistema, **se detiene y se entrega un informe** en lugar de implementarla.

### Cola de trabajo, filtrada por esas reglas

| # | Tarea | Tamaño estimado | Veredicto |
|---|---|---|---|
| 1 | **Cablear `dbMarcarVista`**: ruta API + llamada no bloqueante desde el centro de control | ~40-60 líneas, 2 ficheros nuevos + 1 tocado | ✅ Se hace |
| 2 | **`.catch()` + reintento único en `dbInsertActividadReciente`** | ~10 líneas, 1 fichero | ✅ Se hace |
| 3 | **Verificar por qué `sustitucion_contactos` tiene 0 filas** | solo lectura | ✅ Se hace (diagnóstico) |
| 4 | **Emitir `ReservationCreated` / `ReservationCancelled` donde se crea el hecho** | depende del punto de emisión — si es la RPC de Postgres, es migración + una línea; si hay varias vías, son varias áreas | ⚠️ Se diagnostica primero y se decide |
| 5 | **Cerrar la deriva de esquema** (9 tablas) | 9 migraciones + decidir qué se borra | 🔴 Informe — toca producción, no es reversible sin cuidado |
| 6 | **`comunicaciones_socio`** (eventos 8 y 9) | migración + emisión en email/WhatsApp/campañas | 🔴 Informe — varias áreas |
| 7 | **`lib/metricas/` y bajada de agregaciones a Postgres** | 151 consultas | 🔴 Informe — fuera de alcance con estas reglas |

---

*Auditoría de solo lectura. Cada cifra procede de una consulta a producción o de una línea concreta del repo en `5aa386f5`; ninguna es estimada. Las filas marcadas ⚠️ están explícitamente sin verificar y se señalan como tales.*
