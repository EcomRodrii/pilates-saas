# Tentare Brain — auditoría del código actual y plan por fases

Fecha: 2026-08-11 · Rama: `claude/tentare-brain-architecture-bf7180`
Alcance: las 5 áreas del encargo (calendario/reservas, instructoras/sustituciones,
pagos/membresías, retención/marketing, app de la alumna) + la capa central.

> **Estado: las 6 fases ENTREGADAS** (2026-08-11). Ver §"Lo entregado" al final.
> ⚠️ La Fase 3 (dinero) está construida pero **no probada con un cobro real**:
> hoy solo 1 socia de 202 tiene tarjeta guardada.

---

## 0. Conclusión de la auditoría, primero

**El "Tentare Brain" que pides ya existe y lleva meses en producción. Se llama
Decision OS y vive en `lib/decision/`** — ~8.500 líneas de lógica pura con tests,
8 especialistas, motor de memoria, coordinación de colisiones, detección de
conflictos, priorización, niveles de autonomía 0–3, medición de resultados y el
Umbral (mensaje único diario, con calibración por estudio).

La arquitectura conceptual que describes —*información → inteligencia → decisión →
ejecución*— **es literalmente el pipeline que ya corre dos veces al día**
(`lib/inngest/decision.ts`, cron `30 6,14 * * *`):

```
snapshot → especialistas → memoria → coordinación → confianza
        → cooldowns+conflictos → prioridad → director → umbral → autonomía → ejecución → outcome
```

Por tanto **la recomendación es no construir un Brain nuevo**. Construirlo sería
duplicar `lib/decision/` y romper la regla nº6 de tu propio encargo. Lo que falta
no es la capa: son **tres capacidades concretas que la capa no tiene todavía**.

### Los tres huecos reales

| # | Hueco | Por qué importa |
|---|---|---|
| **1** | **No hay predicción.** El motor tiene `Confianza` (ALTA/MEDIA/BAJA), que mide *cuánto se fía el motor de su propio diagnóstico*. No tiene ninguna **probabilidad de que algo ocurra**. Los "87% de riesgo" y "91% de aceptar" de tu encargo no existen en ningún sitio del código. | Es la diferencia entre "esto pinta mal" y "esto va a pasar". |
| **2** | **El motor mira hacia atrás, no hacia delante.** `agenda.ts` (A1/A2/A3) analiza franjas **pasadas**. Ninguna regla dice nada sobre *una clase futura concreta*. Las dos únicas piezas prospectivas del repo (`confirmacion-riesgo.ts`, `minimo-asistentes.ts`) son crons aislados, fuera del Brain. | "El martes 18:00 va a ir vacío" es imposible hoy. Solo se puede decir "los martes 18:00 han ido vacíos". |
| **3** | **El lado de la alumna describe, nunca propone.** `getHomeCardContext()` clasifica correctamente en 5 estados (incluido `INACTIVA` a 10 días), pero ningún estado propone **una clase concreta reservable**. | "Te echamos de menos" sin un botón que lleve a una clase real no cambia comportamiento. |

Todo lo demás de tu encargo está construido, y en varios puntos **por encima** de
lo que describes. El plan de abajo ataca solo esos tres huecos.

---

## 1. Arquitectura actual

### 1.1 Capa central (el Brain que ya existe)

| Fichero | Qué hace |
|---|---|
| `lib/decision/tipos.ts` | Contratos de dominio. `Candidata`, `Recomendacion`, `SnapshotEstudio`, `Confianza`, `Impacto`, 18 `TipoRecomendacion`. |
| `lib/decision/snapshot.ts` | **Única frontera de lectura.** Recorta ventanas (180d reservas/recibos, ±90d sesiones, 90d sustituciones/logs). |
| `lib/decision/motor.ts` | Orquestador puro. Sin I/O: entra snapshot, sale resultado. Cada especialista aislado en try/catch. |
| `lib/decision/senales.ts` (497 l.) | Índices y señales derivadas: frecuencia habitual, días sin venir, ausencia anómala, renovación próxima, valor mensual, franjas recurrentes, demanda insatisfecha, riesgo no-show. |
| `lib/decision/confianza.ts` (382 l.) | Un constructor de confianza por regla. Topa la autonomía máxima. |
| `lib/decision/memoria.ts` | Hechos por socia (`NO_CONTACTAR_HASTA`, `PREFIERE_WHATSAPP`, `NO_OFRECER_DESCUENTOS`). Veto y ajuste de canal. |
| `lib/decision/director.ts` | Coordina colisiones (una socia = una candidata), resumen diario, "mientras dormías". |
| `lib/decision/conflictos.ts` | Detecta pares de recomendaciones **opuestas** sobre la misma sala/instructora/tipo. No oculta: anota y deja decidir. |
| `lib/decision/prioridad.ts` | Score, cooldowns, selección de prioridades. |
| `lib/decision/autonomia.ts` | Piloto automático. Off por defecto; solo ALTA confianza + nivel ≥2; `COBRAR_RECIBOS` **vetado permanentemente**; tope diario. |
| `lib/decision/umbral.ts` | 5 puertas para el mensaje único del día + `calibrarUmbral()` por estudio con su historial (90d, mín. 5 muestras). |
| `lib/decision/outcomes.ts` | Medición del resultado real. `MEDIDO` vs `NO_MEDIBLE` — no inventa cifras. |

### 1.2 Los 8 especialistas (`lib/decision/especialistas/`)

| Especialista | Reglas | Cobertura vs. tu encargo |
|---|---|---|
| `retencion.ts` (387 l.) | R1 ausencia anómala · R2 reactivación con descuento · R3 renovación inminente + enganche cayendo · R4 no-shows · R5 dejó de renovar · R6 paga y no viene → congelar · R7 intentos de reserva fallidos | **Cubre tu área 5 casi entera.** Tu ejemplo de Laura (2,4→0,8 clases/semana, 21 días, bono activo) es exactamente R1. |
| `ingresos.ts` (305 l.) | I1 abrir sesión por demanda desbordada · I2 recuperar pagos · I3 revisar precio | Parcial |
| `agenda.ts` (280 l.) | A1 franja medio vacía · A2 ocupación baja estructural · A3 mover horario | **Solo retrospectivo** (hueco 2) |
| `finanzas.ts` (147 l.) | F1 bono casi agotado · F2 bono repetido → mensual más barata | Parcial |
| `equipo.ts` (114 l.) | E1 instructora sin clases asignadas · E2 sustitución sin resolver >3h | Parcial |
| `captacion.ts`, `marketing.ts`, `onboarding.ts` | Embudo de leads, campañas, primeros 30 días | — |

### 1.3 Automatización existente (21 funciones Inngest)

Ya hay un ecosistema de crons maduro. **Ninguno hay que rehacer:**

| Cron | Frecuencia | Qué hace |
|---|---|---|
| `decision-dispatcher` | `30 6,14 * * *` | El Brain entero, fan-out por estudio |
| `sustituciones` | evento | Motor de sustituciones con escalado |
| `dunning-dispatcher` | `30 8 * * *` | Reintentos de cobro |
| `conciliar-cobros` | `*/5` | Red de seguridad de cobros perdidos |
| `penalizaciones-procesar` | `*/10` | Penalización por cancelación tardía/no-show |
| `confirmacion-riesgo-*` | `45 6,18` + `*/30` | Riesgo de plantón (ASK + CORTE) |
| `minimo-asistentes-cancelar` | `*/15` | Cancela clase que no llega al mínimo |
| `lista-espera-ofertas-expirar` | `*/5` | Caducidad de ofertas de lista de espera |
| `reservas-pendientes-expirar` | `*/5` | Aprobación manual de reserva |
| `renovaciones`, `recordatorios`, `valoraciones`, `revisiones-salud`, `notif-*`, `backups`, `cierre-gestoria`, `checkin-automatico`, `automatizaciones`, `resumen-semanal` | varias | — |

⚠️ **Restricción de infraestructura a respetar en todo el plan**: Inngest va al
~84 % del límite del plan free ([[inngest-limite-recordatorios-fan-out]]). **Ningún
cron nuevo con fan-out por estudio.** Todo lo que se añada va como *paso* dentro de
`decision.ts` (que ya hace fan-out) o como query global sin fan-out.

### 1.4 Sustituciones — el flujo de 7 pasos de tu encargo

| Paso | Estado | Dónde |
|---|---|---|
| 1 · DETECTAR | ✅ Completo | `lib/sustituciones/baja.ts`, botón "No puedo asistir" (#545) |
| 2 · ANALIZAR | ⚠️ Parcial | `rankear_candidatas` (migr `0038`): disponibilidad semanal, excepciones, conflicto de horario, veces que dio ese tipo, horas del mes vs. media, semanas sin sustituir |
| 3 · **PREDECIR** | ❌ **No existe** | El scoring es una heurística fija: `100 +10/-40 +20 +5`. No hay probabilidad |
| 4 · CONTACTAR | ✅ Completo | `contacto.ts`: email → WhatsApp → SMS, token firmado de un solo uso |
| 5 · GESTIONAR RESPUESTAS | ✅ Completo | Escalado por candidata, ventana 45 min, avance automático |
| 6 · ACTUALIZAR TODO | ✅ Completo | `confirmar_sustitucion` (RPC transaccional, compare-and-set) |
| 7 · **APRENDER** | ❌ **No existe** | Los datos **sí se guardan** (`sustitucion_contactos.estado` ∈ `aceptado/rechazado/expirado`, `respondido_en`) — pero **nadie los lee nunca de vuelta** |

**Este es el hueco más concreto y de mayor valor de todo el encargo**: el dato de
entrenamiento ya está en producción, escribiéndose desde hace meses, y no se usa.

### 1.5 Pagos

| Pieza | Estado |
|---|---|
| Cobro directo (Connect direct-charge), webhooks, idempotencia, disputas, devoluciones, SEPA, Veri*Factu | ✅ Maduro |
| Dunning con reintentos escalonados y backstop de reconciliación SEPA | ✅ Maduro |
| Penalizaciones por cancelación tardía/no-show (Fase 3, con consentimiento legal versionado) | ✅ Completo |
| **Predicción de fallo antes de que ocurra** | ❌ No existe |
| **Caducidad de tarjeta** | ❌ `exp_month`/`exp_year` **nunca se guardan** — verificado: no aparecen en el repo |
| **Bono que caduca por FECHA con sesiones sin usar** | ❌ F1 solo mira `sesionesRestantes ≤ 1`. Un bono con 8 sesiones que caduca el viernes es invisible para la propietaria (la alumna sí recibe aviso vía `notif-bonos-dispatcher`) |

### 1.6 App de la alumna

`lib/portal-home-logic.ts` → `getHomeCardContext()` devuelve 5 estados:
`PROXIMA_CLASE` · `ULTIMA_SESION` · `RACHA_EN_RIESGO` · `INACTIVA` (≥10 días) · `SIN_CLASES`.

Bien construido y ya personalizado. **Lo que falta es el segundo miembro de cada
frase de tu encargo**: detecta "llevas 20 días sin venir" pero no sabe decir "hay
Reformer mañana a las 18:00" — no existe ninguna función que cruce el hábito de la
alumna con las sesiones futuras con hueco.

Lo más cercano es `candidatasParaHueco()` (`lib/booking-logic.ts`), que es **el
sentido inverso** (dado un hueco, ¿a quién aviso?) y **binario**: ha asistido antes
a ese tipo + tiene bono válido. Sin ranking, sin franja horaria habitual, sin
probabilidad. Además vive como tarjeta manual del dashboard, desconectada del Brain.

---

## 2. Modelos de datos reutilizables

Ya persistidos y con RLS: `recomendaciones`, `recomendacion_outcomes`,
`decision_sessions`, `decision_mensajes_dia`, `decision_feature_flags`,
`memoria_hechos`, `resumen_diario`, `sustituciones`, **`sustitucion_contactos`**,
`instructora_disponibilidad` (+ excepciones), `instructor_tarifas`,
`intentos_reserva_fallidos`, `penalizaciones`, `recibos`, `suscripciones`,
`ausencias`.

**Dato clave: no hace falta ninguna tabla nueva para las Fases 0–2.** Todo lo que
necesita la predicción ya se está escribiendo.

---

## 3. Problemas encontrados

### P1 · Las recomendaciones de Agenda dicen la hora equivocada (real, visible)
`lib/decision/senales.ts:407` agrupa franjas por `getUTCDay()`/`getUTCHours()`, y
`agenda.ts:30` etiqueta con `timeZone: 'UTC'`. Las clases son `timestamptz`. En
horario de verano español (CEST, UTC+2) una clase de **20:00 Madrid** se le
presenta a la propietaria como **"tu clase de las 18:00"**.

Peor: una clase de **00:30 del martes** se agrupa como **lunes 22:30 UTC**, así que
la franja recurrente se parte en dos días distintos y puede no alcanzar nunca las
3 ocurrencias mínimas.

El resto del repo ya usa `TZ_ESTUDIO`/`Europe/Madrid` (`motor.ts:43` lo corrigió
para el saludo, con este mismo razonamiento). Agenda se quedó sin corregir.

### P2 · `construirIndices()` se ejecuta 8 veces por análisis
Cada especialista llama a `construirIndices(s)` por su cuenta, y `motor.ts:152` una
novena vez. Sobre un snapshot de 180 días de reservas es trabajo repetido íntegro.
Rendimiento, no corrección — pero es la palanca más barata antes de añadir reglas.

### P3 · El Brain vive en una pantalla que la propietaria puede no abrir
`/centro-de-control` tiene el Veredicto del Día, el Umbral y el Seguimiento.
`/dashboard` (1.340 líneas) es la pantalla de métricas clásica y **no menciona el
Decision OS en ningún sitio**. Son dos "homes" compitiendo. Tu regla principal de
UX ("Tentare debe llevar el problema hasta ella") falla por esto, no por falta de
inteligencia.

### P4 · No es un problema (verificado, se documenta para que no se reabra)
`rankear_candidatas` tiene `GRANT EXECUTE ... TO anon`, lo que parece una fuga de
nombres de instructoras. **No lo es**: la función es `SECURITY INVOKER`
(`prosecdef = false`, verificado en prod) y todas las políticas RLS de
`instructores`/`instructora_disponibilidad` son para `{authenticated}`. Un `anon`
recibe siempre `[]`. Es higiene cosmética, no un agujero — no gastar una migración
en esto salvo que se toque la función por otro motivo.

---

## 4. Qué se reutiliza tal cual (no tocar)

- El pipeline completo de `motor.ts` — la arquitectura de capa reutilizable que
  pides **es esta**.
- `Confianza` y `NivelAutonomia` — los 4 modos que describes (MANUAL/ASISTIDO/
  AUTÓNOMO/PREDICTIVO) ya son `NivelAutonomia 0|1|2|3` + `AutonomiaConfig`.
- `memoria.ts`, `conflictos.ts`, `prioridad.ts`, `outcomes.ts`, `umbral.ts`.
- Todo el motor de sustituciones salvo el scoring.
- Todo el stack de cobros.
- Los 5 estados de `getHomeCardContext()`.

## 5. Decisiones ya cerradas que este plan NO reabre

No trocear los god files · feature-freeze de Kiosko/POS/VOD/Comunidad · no split
`app/manager`/`app/core` · "valorar a la alumna" (descartado, duplica
`notas_progreso`) · sin plantillas reutilizables de reglas de reserva · `COBRAR_RECIBOS`
nunca autónomo · sin especialista `CADENA` ni dashboard agregado de cadena.

---

# PLAN DE IMPLEMENTACIÓN POR FASES

Principio: **cada fase es mergeable sola, no rompe nada, y aporta valor sin la
siguiente.** Ninguna fase añade un cron con fan-out (límite de Inngest).

---

## Fase 0 · Cimientos del Brain — *sin UI nueva*

Habilita las tres fases siguientes. Invisible para la propietaria.

**0.1 · `lib/decision/prediccion.ts` (nuevo, puro)**
El concepto que falta. Distinto de `Confianza`, que se queda como está.

```ts
export interface Prediccion {
  probabilidad: number;   // 0..1
  base: string;           // "aceptó 10 de sus últimas 11 peticiones"
  nMuestras: number;
}
```

Regla de oro heredada del repo (`ConfianzaMedicion: MEDIDO | NO_MEDIBLE`):
**por debajo de la muestra mínima devuelve `null`, nunca un número inventado.**
Estimación bayesiana con prior del grupo — con 2 datos no se publica un 91 %.
Campo `prediccion?: Prediccion` opcional en `Candidata` (aditivo, no rompe nada).

**0.2 · Ampliar `SnapshotEstudio`**
Añadir `contactosSustitucion` (90d), `disponibilidadInstructoras`, `ausencias`,
`metodosPago`. ⚠️ **Arrays, nunca `Map`** — el snapshot cruza un `step.run` de
Inngest y un `Map` se serializa a `{}` en el replay (gotcha ya documentado). Los
índices se construyen siempre fuera del step.

**0.3 · `construirIndices()` una sola vez** (P2)
Se calcula en `motor.ts` y se pasa a `detectar()`. Cambia la firma de
`Especialista` → los 8 especialistas y sus tests. Mecánico y con red de tests.

**0.4 · Arreglar el bug de zona horaria de Agenda** (P1)
`TZ_ESTUDIO` en `claveFranjaDe`, `agruparFranjasRecurrentes` y `etiquetaFranja`.
Test de regresión con una clase de 20:00 Madrid en verano y otra de 00:30.

**Verificación**: `npx tsc --noEmit` + `node --test` (>1170 tests en verde).
Sin migración.

---

## Fase 1 · Instructor Autopilot — pasos 3 y 7

El hueco más concreto: los datos ya están, solo falta leerlos.

**1.1 · `probabilidad_aceptacion` en `rankear_candidatas`**
Nueva migración que amplía la CTE con el historial real de
`sustitucion_contactos` por instructora: aceptadas / (aceptadas + rechazadas +
expiradas), con prior del estudio y suavizado por muestra. Se devuelve **junto al
score actual, sin sustituirlo** — el orden sigue siendo explicable.

⚠️ **Gotcha de grants, cuarta vez en este repo**: si cambia la firma, Postgres crea
una función nueva con `EXECUTE` por defecto a `PUBLIC`. `REVOKE ... FROM PUBLIC` +
`GRANT` explícito + verificar con `has_function_privilege`. **Aprovechar para
quitar `anon`** (ver P4: inofensivo hoy, pero si algún día la función pasara a
`SECURITY DEFINER` sí sería un agujero).

**1.2 · Paso 7 · APRENDER**
Cerrar el bucle: cada aceptación/rechazo ya escrito realimenta el ranking siguiente.
Sin tabla nueva, sin cron nuevo.

**1.3 · La propietaria ve el porqué, no el número**
El panel de sustituciones muestra `María · 91 %` **siempre acompañado de su base**
("ha aceptado 10 de sus últimas 11"). Si `nMuestras` es insuficiente, se muestra el
scoring actual sin porcentaje — coherente con "la propietaria nunca ve un número"
del diseño original (`0038`).

**Verificación**: `execute_sql` + `ROLLBACK` contra prod antes de abrir PR (el
patrón que ya cazó tres bugs de ambigüedad en Fase 2b y el falso `p_socio_id` de
Fase 3). Revisión con `tentare-seguridad` y `tentare-supabase`.

---

## Fase 2 · Calendar Autopilot — girar el motor hacia delante

La más ambiciosa. Convierte Agenda de retrospectiva en prospectiva.

**2.1 · Regla A4 · Pronóstico de llenado por sesión futura concreta**
Para cada sesión de los próximos 14 días: comparar sus reservas actuales contra la
**curva de reserva histórica de su franja** (cuántas reservas solía tener esa franja
a *N* días vista). Sale exactamente tu ejemplo:

> ⚠️ Martes 18:00 — 3 reservas / 12 plazas.
> A 5 días vista esta franja suele llevar 8. Probabilidad de llenado: baja.

Requiere `Reserva.creadoEn` (ya está en el snapshot, ventana 180d) y respetar el
`heredaOverride()` de las reglas por tipo de clase. Sin muestra suficiente de la
franja → **no se emite candidata** (no se inventa un pronóstico).

**2.2 · Riesgo de instructora en una clase futura**
Con `disponibilidadInstructoras` y `ausencias` (Fase 0.2): clase futura cuya
instructora tiene ausencia programada que la pisa, o disponibilidad no confirmada,
o conflicto con otra clase. Alimenta tu ejemplo del jueves 19:00 — y la probabilidad
sale de Fase 1, no de un número a ojo.

**2.3 · Acción `LLENAR_PLAZAS` — conectar el radar existente al Brain**
`candidatasParaHueco()` ya existe y ya funciona. Se le añade **ranking por
afinidad** (¿asiste habitualmente a esa franja horaria? ¿con esa instructora?
¿cuánto hace que no viene?) y se expone como acción de una candidata de A4, en vez
de como tarjeta manual suelta.

> 🟢 Hay 7 plazas libres mañana. 27 alumnas compatibles, 9 con alta afinidad.

⚠️ Esta acción **envía mensajes a socias**. Entra en `TIPOS_AUTONOMIA_PERMITIDOS`
solo con tope diario propio y confianza ALTA. Por defecto: asistido.

---

## Fase 3 · Revenue Autopilot — predecir antes del fallo

**3.1 · Guardar caducidad de tarjeta** — `exp_month`/`exp_year` al guardar el método
de pago (hoy no se guardan). Migración aditiva + regla: *"la tarjeta de N socias
caduca antes de su próxima renovación"*. Es la causa de impago más predecible y
más fácil de evitar que existe.

**3.2 · Probabilidad de fallo de cobro por socia** — historial de `recibos` de esa
socia + método (SEPA/tarjeta) + antigüedad. Agregado a nivel estudio:

> ⚠️ 23 renovaciones con alta probabilidad de fallar este mes · 1.240 € afectados.

**3.3 · Bono que caduca por fecha con sesiones sin usar** — hueco de F1, que solo
mira sesiones restantes.

**3.4 · Barandilla que no se toca**: `COBRAR_RECIBOS` sigue **permanentemente fuera**
de la autonomía. Todo esto **detecta y propone**; el cargo lo aprueba una persona
con `puedeMoverDinero`. Es exactamente el criterio de Fase 3 de penalizaciones.

⚠️ Por Stripe no ha pasado dinero real en producción todavía
([[revision-pagos-clientas-2026-08]]) — probar en el estudio de pruebas antes de
activar nada de esta fase para clientes reales.

---

## Fase 4 · Personal Pilates Assistant — que el portal proponga

**4.1 · `sugerirClase()` (puro, `lib/portal-sugerencias.ts`)**
Cruza el hábito real de la alumna (día y franja horaria de sus asistencias) con las
sesiones futuras que tienen hueco **y** que su bono/plan cubre
(`tieneEntitlementActivo`, ya existe). Devuelve la clase y **el motivo**:
"sueles entrenar martes y jueves por la tarde".

**Regla no negociable de tu encargo**: si no hay una justificación real en los
datos, **no se sugiere nada**. Nada de recomendaciones aleatorias.

**4.2 · Enganchar a los 5 estados existentes** — no se rehace `getHomeCardContext()`,
se le añade una sugerencia opcional. `INACTIVA` deja de ser "llevas 20 días sin
venir" y pasa a ser "…y hay Reformer mañana a las 18:00" con botón de reserva.

**4.3 · Cancelar → recuperar** — al cancelar, 3 opciones compatibles en vez de una
pantalla de confirmación vacía.

⚠️ Fuera de alcance: `/portal/[slug]` es marca blanca. Sin marca Tentare.

---

## Fase 5 · Action Center — el puente (P3)

**5.1** Llevar el Veredicto del Día y el bloque "necesita atención" a `/dashboard`,
que es donde la propietaria entra de verdad. No se borra nada de
`/centro-de-control`.

**5.2** Agrupación por urgencia con cifras reales (nunca inventadas: el motor ya
distingue `MEDIDO` de `NO_MEDIBLE`), con las acciones divididas en *"esto lo puede
hacer Tentare solo"* vs *"esto necesita tu visto bueno"* — que es información que
`nivelAutonomia` **ya calcula y la UI nunca muestra**.

---

## Sobre el "modo PREDICTIVO"

No es un cuarto modo que haya que construir: `NivelAutonomia 0|1|2|3` +
`AutonomiaConfig` ya cubren MANUAL/ASISTIDO/AUTÓNOMO, y son reutilizables por área
tal cual. Lo que falta para que exista el modo PREDICTIVO **es tener algo que
predecir** — es decir, la Fase 0.1. Al terminar la Fase 3, los cuatro modos son
reales sin tocar `autonomia.ts`.

---

## Orden recomendado y por qué

1. **Fase 0** — nada funciona sin ella, y arregla un bug visible en producción.
2. **Fase 1** — máximo valor por línea escrita: los datos ya existen sin usar,
   y es donde bsport sí tiene una funcionalidad comparable que superar.
3. **Fase 2** — la que más cambia la percepción del producto ("anticipa" vs "informa").
4. **Fase 4** — visible para cientos de alumnas, sin tocar dinero.
5. **Fase 3** — la última: mueve dinero real y Stripe aún no está probado en prod.
6. **Fase 5** — cierra el círculo cuando ya hay algo que enseñar.

Fase 4 puede adelantarse y correr en paralelo a la 2 (no comparten ficheros).

## Loop de calidad por fase

Diseño (`tentare-arquitecto`) → implementación → seguridad (`tentare-seguridad`,
obligatorio en 1 y 3) → `tentare-supabase` en toda migración → QA (`tentare-qa`) →
UX en navegador real (`tentare-ux`, obligatorio en 4 y 5) → `npx tsc --noEmit` +
`node --test` → verificación en vivo con `execute_sql` + `ROLLBACK` en 1, 2 y 3.

---

# LO ENTREGADO — Fases 0 y 1 (2026-08-11)

## Fase 0 · Cimientos

**0.1 · `lib/decision/prediccion.ts`** (nuevo, puro, 12 tests).
`Prediccion { probabilidad, base, nMuestras }` — el concepto que faltaba, distinto
de `Confianza`. Estimación suavizada hacia el prior del grupo (Beta-Binomial con
pseudo-cuentas, `MUESTRA_MINIMA = 5`, `FUERZA_PRIOR = 5`). **Devuelve `null` con
muestra insuficiente**, nunca un número. Campo `prediccion?` añadido a `Candidata`
(aditivo; ningún especialista lo emite todavía).

**0.3 · `construirIndices()` una sola vez.** Se resolvió con un `WeakMap` por
identidad de snapshot dentro de `senales.ts` — un fichero tocado en vez de diez, sin
cambiar la firma de `Especialista.detectar()` ni sus tests.

> **Medido antes de tocar nada** (no asumido): sobre un snapshot realista de cadena
> de 2 sedes (850 socias, 2.500 sesiones, 30.000 reservas), las 9 construcciones
> repetidas costaban **389 ms por análisis y estudio**; con la caché, **35 ms**.

⚠️ **Invariante que lo sostiene: nadie muta un `SnapshotEstudio` después de
construirlo.** Si alguna vez hiciera falta, hay que clonar, no modificar en sitio —
si no, los índices quedan viejos en silencio.

**0.4 · Bug de zona horaria de Agenda (P1), arreglado.**
`claveFranjaDe` es ahora la única fuente del formato y agrupa en hora local del
estudio vía `franjaLocalDe()` (`Intl`, `hourCycle: 'h23'`). Tres tests de regresión:
la clase de 00:30 del martes ya no cae en lunes, y una clase semanal a caballo del
cambio de hora (24 y 31 de marzo de 2026) vuelve a ser **una sola franja**.

**0.2 · DIFERIDA a Fase 2, a propósito.** Ampliar el snapshot con
`contactosSustitucion`/`disponibilidadInstructoras`/`ausencias` solo tiene consumidor
en el especialista de agenda prospectiva. Añadirlo ahora serían 3 consultas más por
estudio y por pasada del cron, dos veces al día, que nadie leería.

## Fase 1 · Instructor Autopilot — pasos 3 (PREDECIR) y 7 (APRENDER)

**Migración `20260810231458_rankear_candidatas_probabilidad_aceptacion.sql`**,
aplicada y verificada en producción. Misma firma → sin gotcha de firma nueva.

Dos decisiones de diseño que salieron de mirar los datos reales, no del plan:

1. **Una oferta = un par (candidata, sustitución)**, no una fila de contacto. A una
   candidata se le avisa por email y luego por WhatsApp: contar filas inflaría el
   denominador justo de quien peor responde.
2. **El silencio cuenta.** Nadie escribe nunca el estado `'expirado'` — verificado en
   el código: solo `app/api/public/aceptar-sustitucion/route.ts` escribe, y solo
   `'aceptado'`/`'rechazado'`. Con el denominador ingenuo, quien contesta 1 de cada 10
   veces y esa vez dice que sí saldría **al 100 %**. Ahora cuenta como observación el
   no contestar, pero solo si la sustitución se cerró ≥45 min después de avisarla
   (`VENTANA_MAX`) — por debajo de eso otra persona aceptó antes de que le diera
   tiempo a mirar el móvil.

**Verificado en vivo** (`execute_sql` + `ROLLBACK`, siembra sintética, 4 casos):

| Caso | Historial sembrado | Resultado |
|---|---|---|
| María | 10 ofertas, 9 sí, + nudge de WhatsApp extra | `0.817`, `prob_ofertas: 10` (**no** 11 → el nudge no duplica) |
| Julia | 4 ofertas, 4 sí (100 %) | `null` — bajo el mínimo, no se inventa |
| Meri | 6 ofertas, nunca contestó | `0.295` + motivo "ha dicho que sí 0 de las últimas 6 veces" |
| Aritmética | prior del estudio 13/20 = 0.65 | `(9 + 5·0.65)/15 = 0.817` ✔ |

**Grants re-endurecidos**: `anon` tenía `EXECUTE` heredado de `0038`. Era inofensivo
(la función es `SECURITY INVOKER` y toda la RLS de `instructores` es para
`authenticated`, así que `anon` recibía `[]`) pero dejaba una mina para el día que
alguien la pasara a `SECURITY DEFINER`. `REVOKE ... FROM PUBLIC` + `GRANT` explícito.
Verificado: `anon: false`, `authenticated: true`, `service_role: true`.

**UI (`lib/sustituciones/encaje.ts`, 7 tests).** La card enseñaba
**"Compatibilidad 87 %"**, y ese número era `LEAST(99, GREATEST(55, score))` sobre la
heurística fija: no medía nada, y dos candidatas con historiales opuestos salían las
dos al 99 %. Ahora hay dos cosas con nombres distintos:

- **Encaje** — barra sin cifra (el score de siempre).
- **Probabilidad** — real, del historial, **solo cuando existe**, y siempre con su
  respaldo al lado ("Suele aceptar · 82 % · ha dicho que sí 9 de las últimas 10 veces").

⚠️ Ausencia de probabilidad **nunca** se pinta como 0 %: un 0 es "casi nunca acepta"
y difamaría a una instructora de la que no se sabe nada todavía. Hay un test
dedicado solo a eso.

## Estado real del dato (importante para expectativas)

En producción hoy hay **7 filas en `sustitucion_contactos` y 0 sustituciones
resueltas**. O sea: el mecanismo está entregado y correcto, pero **no habrá ningún
porcentaje visible hasta que se acumulen ≥5 ofertas cerradas por instructora**. Hasta
entonces la card enseña encaje y motivos, sin cifras — que es exactamente el
comportamiento buscado, y ya es mejor que el 99 % inventado de antes.

## Verificación

- `npx tsc --noEmit`: 0 errores propios (los de `.next/dev/types/` son ficheros
  generados obsoletos, previos a este cambio).
- `npm test`: **2117/2117** en verde.
- `npx eslint --max-warnings 0` sobre los ficheros tocados: limpio.
- **Navegador real** (Chromium, `e2e/sustituciones-probabilidad.spec.ts`, 3/3): con
  historial se ven etiqueta + porcentaje + respaldo y **desaparece "Compatibilidad"**;
  sin historial suficiente **no aparece ningún porcentaje**; un ranking guardado antes
  de la migración no rompe la card.
- La migración se verificó con `execute_sql` + `ROLLBACK` **antes** de aplicarse.

⚠️ Sin verificar: la card con datos de producción reales, porque hoy no hay ninguna
baja activa y crear una manda emails de verdad a las instructoras.

---

# LO ENTREGADO — Fase 2 (2026-08-11)

**El motor deja de ser solo forense.** Hasta aquí, las 3 reglas de Agenda (A1/A2/A3)
hablaban de franjas que YA fueron mal: cuando el motor lo detectaba, la clase de la
que aprendió ya se había dado medio vacía. Fase 2 añade las dos primeras reglas que
hablan de clases que **todavía no han pasado**.

## A4 · Pronóstico de llenado por sesión futura

La idea: una reserva no aparece de golpe el día de la clase, llega siguiendo una
curva bastante estable por franja. Si el martes 20:00 suele llevar 6 reservas a
3 días vista y este martes lleva 1, no hace falta esperar al martes.

`pronosticarFranja()` (`senales.ts`) compara la sesión futura contra las ocurrencias
pasadas de su franja **en el mismo punto de la curva** (mismos días vista), y estima
cuántas reservas suelen entrar en los días que quedan. Mediana, no media: un puente
o una promoción puntual no debe arrastrar la referencia de toda la franja.

Sale exactamente el ejemplo del encargo:

> ⚠️ Tu clase del martes a las 20:00 va floja de reservas.
> Lleva 1 de 8 plazas a 3 días vista, cuando a estas alturas suele llevar 6. Al
> ritmo normal acabaría sobre 3, así que se quedarían 5 plazas sin vender.
> Probabilidad de que se llene: baja (esta franja se llenó 1 de las últimas 8 veces).
> Tengo 9 alumnas compatibles a las que ofrecérsela — la primera, Marta, suele venir
> los martes a esta hora (7 de sus últimas 9 clases).

Tope de 3 clases por pasada: sin él, un estudio con 40 clases semanales generaría
decenas de candidatas del mismo tipo y ahogaría todo lo demás en el Centro de Control.

⚠️ **Dato real que condicionó el diseño**: en producción hay reservas creadas
*después* del inicio de su clase (altas de mostrador apuntadas a posteriori — 9 de
159 filas). No se descartan: cuentan como llegada tardía, que es lo que fueron. Solo
hacen el pronóstico algo más optimista, nunca disparan una alarma de más.

## A5 · Clase futura sin quien la dé

**El hueco que cierra**: cuando una instructora graba vacaciones o una baja, sus
clases YA PROGRAMADAS siguen asignadas a ella y nadie se entera. Verificado con
grep: los 6 sitios que hoy miran ausencias (`ausenciaEnFecha`) lo hacen todos al
ASIGNAR — desplegables, filtros, diálogo de cobertura. Ninguno revisa el horario ya
programado contra un bloqueo grabado después.

⚠️ **No reabre la decisión de producto de #558** ("confirmar una ausencia no dispara
ninguna sustitución automática sobre sus clases ya programadas"). No dispara nada:
se lo cuenta a la propietaria para que decida ella, que es justo lo que faltaba.

Cubre también el doble reparto (la misma instructora en dos clases que se pisan).
Único caso de todo el motor con confianza ALTA por un hecho *comprobable* y no
estadístico: o hay choque en el calendario, o no lo hay.

⚠️ **Descartado a propósito**: usar "no ha declarado disponibilidad para esa franja"
como señal. En un estudio donde el equipo no ha rellenado la rejilla —que son la
mayoría al empezar— marcaría en riesgo TODAS las clases del horario. Ese hueco ya lo
cuenta `avisoEquipoIncompleto` una sola vez, que es donde corresponde.

## Afinidad: de "27 compatibles" a "9 que tienen sentido"

`candidatasParaHueco` (booking-logic) responde a *¿quién podría venir?* y es binaria:
asistió antes + tiene bono. `candidatasPorAfinidad` (nuevo, `senales.ts`) responde a
*¿a quién merece la pena avisar?* — lo que más pesa es la **costumbre horaria**,
porque es lo único que de verdad predice que a alguien le venga bien un martes a las
20:00. Sin eso, avisar a 27 personas es spam.

## El bucle se cierra: A4 es medible

`LLENAR_PLAZAS` es la **primera recomendación del motor cuyo desenlace no depende de
una persona sino de una clase**, y la primera cuyo pronóstico se puede contrastar con
lo que acabó pasando: ¿se llenó? Se añadieron dos señales de sesión a `SenalMedicion`
y su rama en `construirSenalMedicion`, con ventana de 16 días (A4 nunca pasa de 14
días vista, así que la medición cae siempre por detrás de la clase).

⚠️ Mide QUÉ pasó, no que la recomendación fuera la causa — y el impacto en € queda
**NO_MEDIBLE** a propósito: multiplicar plazas por un precio medio sería una
proyección, justo lo que el Pilar 3 pide evitar.

## Snapshot: la Fase 0.2 diferida, ahora con consumidor

`bloqueosAgenda` (ventana futura +90d, array JSON-safe). Una sola tabla:
`instructora_disponibilidad_excepciones` con `tipo='bloqueo'`, porque las vacaciones
y bajas de `instructora_ausencias` **ya se materializan ahí** como bloqueos diarios
(migr 0101) — mirando solo eso se cubren los dos casos sin cruzar dos tablas.

## Conflictos

`LLENAR_PLAZAS` choca con `FUSIONAR_SESIONES`/`MOVER_HORARIO` y se anota como tal:
"rescata la clase del martes que viene" vs "la franja del martes lleva semanas medio
vacía, quítala". Las dos pueden ser ciertas, pero la propietaria tiene que verlas
juntas para decidir si merece la pena llenar una franja que va a quitar.

## Verificación

- `npm test`: **2138/2138** en verde (24 tests nuevos entre A4, A5, afinidad y
  medición de outcome).
- Test de regresión del bug de UTC dentro de A5: una clase de las 00:30 del martes
  (= lunes 22:30 UTC) y un bloqueo grabado el martes — con la fecha en UTC se habría
  buscado el lunes y el aviso no habría salido.
- Sin migración: toda la señal ya existía en tablas previas.
- Sin cron nuevo: A4 y A5 corren dentro del análisis que ya hace fan-out.

## Fuera de Fase 2, a propósito

- **Envío masivo a las candidatas compatibles.** A4 dice a cuántas y a quiénes, y el
  panel ya deja contactar de una en una. Avisar de golpe a 20 socias es una acción
  con cara visible hacia fuera y no se activa sin pedirlo expresamente: por eso la
  acción es `MARCAR_GESTIONADO` y `confianzaLlenarPlazas` **nunca llega a ALTA**
  (techo MEDIA), que es el nivel que el piloto automático exige para ejecutar solo.
- **UI dedicada.** Ambas reglas salen por el camino que ya existe
  (`RecommendationCard`, Veredicto del Día). No se verificaron en navegador
  autenticado — misma limitación de credenciales de siempre.

---

# LO ENTREGADO — Fase 4 (2026-08-11)

**El portal deja de describir y propone.** `getHomeCardContext` clasificaba muy
bien en qué momento está la socia —tiene clase, se le acaba el bono, va a perder
la racha, lleva 10 días sin venir, nunca ha reservado— pero ninguno de esos cinco
estados proponía NADA concreto: los cuatro que no son "tienes clase" acababan
mandándola a la lista entera con un texto genérico. "Te echamos de menos" sin un
botón que lleve a una clase real no cambia el comportamiento de nadie.

## `lib/portal-sugerencias.ts` (nuevo, puro, 16 tests)

`sugerirClase()` cruza su **costumbre real** (día de la semana y hora de sus
asistencias, ventana de 90 días) con las sesiones futuras que tienen hueco **y**
que su plan cubre. El día y la hora pesan el doble que la disciplina: quien viene
los martes por la tarde puede probar otra clase a su hora, pero no cambiar de
vida para venir un domingo a las 9.

Devuelve `null` —y eso importa tanto como el resto— cuando no hay hueco, cuando
su plan no cubre ninguna, o cuando no hay nada futuro. **Proponerle una clase que
no puede reservar es peor que no proponerle ninguna**: gasta su confianza y la
manda a un callejón. Con `null`, la tarjeta se queda exactamente como estaba.

Con menos de 3 asistencias **no se inventa una costumbre**: se ofrece la más
próxima que su plan cubre y el motivo lo dice tal cual ("es la próxima con hueco
que te cubre tu plan"). Es un hecho, no una recomendación fabricada.

⚠️ **El motivo va SIEMPRE con la propuesta.** Sin él sería una sugerencia
aleatoria, que es justo lo que el encargo prohíbe. Hay un test dedicado a que
nunca vaya vacío.

## La tarjeta

Los cuatro estados ganan la clase concreta debajo del titular. El tono lo sigue
escribiendo la propietaria (`txt(...)`) y se respeta — lo que cambia es que
debajo aparece una clase de verdad y su porqué:

> **RACHA DE 7 SEMANAS**
> **No la pierdas ahora**
> Te quedan 6 días · Reformer Flow · el viernes a las 09:00
> sueles entrenar los viernes por la mañana

`PROXIMA_CLASE` queda fuera a propósito: ya tiene una clase concreta y proponerle
otra encima sería ruido.

## Cancelar → recuperar

Cancelar terminaba en un toast ("Reserva cancelada.") y un callejón. Ahora, si
hay alternativas reales, se abre una hoja con hasta 3, priorizando el **mismo
tipo de clase** (quien cancela un Reformer quiere recuperar ese Reformer, no
descubrir Mat). Cada opción lleva su motivo y las plazas que quedan, y al
pulsarla se entra por el camino de reserva de siempre (`HojaReserva`) — nada de
una vía paralela. Sin alternativas no se abre nada: una hoja vacía es peor que
ninguna hoja.

## `franjaLocalDe` movida a `lib/utils.ts`

La comparten dos lados que no deberían importarse entre sí: el motor
(`lib/decision/senales.ts`, que la reexporta para no tocar los especialistas) y
el portal. Vive junto a `TZ_ESTUDIO`, que es de donde saca la zona.

## Verificación

- `npm test`: **2154/2154** en verde (16 tests nuevos).
- `npx tsc --noEmit`: **0 errores**. Cazó cuatro roturas que los tests no ven,
  incluida una de verdad: `app/(dashboard)/informes/page.tsx` construye un
  `SnapshotEstudio` a mano y se quedó sin el campo que añadió la Fase 2.
- **Navegador real** (Chromium, `e2e/portal-sugerencia.spec.ts`, 4/4): se ve la
  clase y su motivo; **nunca** una que su plan no cubra; sin plan activo no
  aparece ninguna propuesta y se respeta el texto de siempre; con clase
  reservada la tarjeta sigue igual.
- Regresión sobre el mock compartido (`portal-mock.ts` gana un flag opcional):
  29 tests de otros 3 specs del portal, en verde en ejecución serie. En paralelo
  dieron 3 rojos que son contención local conocida — comprobado ejecutándolos
  con y sin estos cambios.

## Fuera de Fase 4, a propósito

- **Enlace directo a la clase propuesta.** El CTA sigue llevando a la lista: la
  vista de clases no tiene hoy deep-link (`semana` + `diaElegido` son estado
  interno) y añadirlo toca su máquina de estados. La tarjeta ya dice día y hora,
  así que la socia sabe qué buscar.
- **Notificación push proactiva** con la sugerencia. Aquí solo se ve al abrir.

---

# LO ENTREGADO — Fase 5 (2026-08-11)

**El problema no era de inteligencia, era de sitio.** Todo el Decision OS vivía
en `/centro-de-control`: el Veredicto del Día, las prioridades, el seguimiento.
Y `/dashboard` —1.300 líneas de métricas, la pantalla que se abre al entrar— no
lo mencionaba en ningún lado. Dos "inicios" compitiendo, y ganaba el que no sabe
nada. La regla de UX del encargo ("Tentare debe llevar el problema hasta ella")
fallaba por esto, no por falta de motor.

## `lib/decision/action-center.ts` (puro, 10 tests)

`resumirAcciones()` agrupa lo que `/api/decisiones` **ya devuelve** — mismo
endpoint y mismo hook que el Centro de Control, cero lógica nueva de negocio —
en lo que cabe en cinco líneas arriba del dashboard:

> **2 cosas necesitan tu atención** · 89 €/mes y 236 € en juego
> 🔥 4 pagos fallidos
> ⚠️ Laura lleva 21 días sin venir
> Una oportunidad **+340 €**
> ⚡ 2 las hago yo con un toque — **Ver y decidir →**

Tres decisiones que importan:

- **Los euros no se suman entre unidades.** 89 €/mes de una cuota y 236 € de unos
  recibos son cosas distintas; juntarlos en una cifra sería inventar un número.
  Se cuentan por separado y se enseñan por separado.
- **El tope de 3 acota lo que se PINTA, no lo que se cuenta.** Los totales y los
  recuentos salen de la lista entera.
- **"Lo hago yo con un toque" sale del ejecutor real** (F3, `lib/inngest/decision.ts`):
  al aprobar, todo tipo de acción dispara algo de verdad EXCEPTO
  `MARCAR_GESTIONADO`, que es informativo. Es la diferencia entre una bandeja y
  una lista de deberes — y era información que `accion.tipo` ya tenía y la UI
  nunca decía.

## Dónde se coloca, y por qué eso no era trivial

`'accion'` entra en `HOME_SECCIONES` **y en `HOME_FIJAS_PRIMERO`**. Lo segundo no
es cosmética: `aplicarLayout` mete los ids nuevos al FINAL del orden guardado, así
que sin ser "fija" un estudio con la home ya personalizada se habría encontrado el
Action Center abajo del todo — justo lo contrario de su razón de ser. Es el mismo
motivo por el que `onboarding` ya estaba en esa lista.

Se pinta **solo si hay algo pendiente**. Un bloque que dice "todo en orden" cada
mañana entrena a no mirarlo.

## Rol

Gateado con `puedeVer(rolActual, '/centro-de-control')`, que es solo-PROPIETARIO
(`BLOQUEADO_RECEPCION` lo incluye). Sin eso, recepción e instructoras verían una
tarjeta que lleva a una pantalla que su guardia de ruta les vacía — el mismo
patrón que el dashboard ya aplica a `/automatizaciones`. Hay un e2e por rol.

## ⚠️ Un bug mío, cazado por un e2e ajeno

La primera versión hacía `[...data.prioridades]` a secas. Con un `{}` por
respuesta —lo que da un plan sin el módulo, un error servido con 200 o un
despliegue a medias— eso lanza, y **aquí no rompe su propia tarjeta: rompe la
pantalla principal del negocio**. Lo destapó `dashboard-ocupacion-domingo.spec.ts`,
que mockea `/api/**` como `{}`. Arreglado con `Array.isArray` y con un test de
regresión propio.

`severidad.ts` se movió de `components/decision/` a `lib/decision/` (reexportado
desde la ruta vieja) porque `npm test` solo corre `lib/**/*.test.ts` y la lógica
nueva la necesita.

## Verificación

- `npm test`: **2164/2164** · `npx tsc --noEmit`: **0 errores**.
- **Navegador real** (Chromium, `e2e/dashboard-action-center.spec.ts`, 5/5): se ve
  con su importe y su orden por gravedad; dice cuántas resuelve sola; **no se
  pinta** sin nada pendiente; **recepción no lo ve**; y una respuesta inesperada
  de la API no tumba el dashboard.
- Regresión: 24 tests de editor de inicio, dashboard y centro de control en verde.

## Fuera de Fase 5, a propósito

- **Aprobar desde el dashboard.** La tarjeta lleva al Centro de Control, donde
  está el contexto completo (motivo, evidencia, conflictos). Un botón de "aprobar"
  sobre un título de una línea invita a decidir sin leer.
- **Rediseñar el Centro de Control.** Sigue igual: esto es un puente, no un
  reemplazo.

---

# LO ENTREGADO — Fase 3 (2026-08-11)

La última, y la única que toca dinero. El dunning de hoy es **100 % reactivo**:
reintenta DESPUÉS de que un cobro haya fallado. Estas tres reglas miran hacia
delante.

## F4 · La tarjeta caduca antes del próximo cobro

La causa de impago más predecible que existe, y la más barata de evitar — un
mensaje una semana antes. Era **estructuralmente invisible**: solo se guardaba
`stripe_payment_method_id`, y cuándo caduca esa tarjeta no estaba en ninguna
parte.

- Migración `20260811090114`: `tarjeta_exp_mes/anio/marca/ultimos4` en `socios`.
  Solo datos que Stripe entrega **para mostrar** — nada de PAN ni CVC.
- La marca y los últimos 4 no son decoración: *"tu Visa ···4242 caduca este mes"*
  es accionable y *"tu tarjeta caduca"* no, porque la socia no sabe cuál de las
  suyas tiene guardada aquí.
- `lib/billing/caducidad-tarjeta.ts`: un solo sitio que sabe leerla de Stripe,
  usado por los dos caminos que la escriben. **Best-effort siempre** — si Stripe
  no responde no pasa nada; lo que no puede hacer nunca es tumbar el webhook que
  confirma un pago.

⚠️ **El error clásico, con test propio**: una tarjeta 09/2026 vale hasta el
**último** día de septiembre, no hasta el primero. Equivocarse ahí es avisar a la
socia un mes antes de tiempo, o peor, tarde.

**Relleno de las que ya estaban guardadas**: por goteo dentro del cron de dunning
(25 por pasada), que ya corre solo para estudios con Stripe conectado y ya tiene
el `stripeAccount` a mano. **Sin cron nuevo** — Inngest sigue al ~84 % del límite
free. El índice parcial hace que la consulta no cueste nada cuando ya no queda
ninguna.

## F5 · El cobro que tiene pinta de fallar

Estimación con `estimarProbabilidad` (Fase 0) sobre el historial real de cobros
de la socia, suavizado hacia la tasa del propio estudio.

⚠️ **El umbral es RELATIVO al estudio, no un número absoluto.** La primera versión
usaba 0.35 fijo y no saltaba nunca: con 7 observaciones el suavizado empuja a
todo el mundo hacia la media del estudio. Además "cobra mal" significa cosas
distintas donde entra el 98 % y donde entra el 70 %. Ahora se señala a quien se
desvía de SU estudio — mismo criterio que `calibrarUmbral`.

- Una **DEVOLUCIÓN cuenta como no cobrado** aunque en su día entrara: para lo que
  se quiere predecir, es igual de mala que un impago.
- Los **PENDIENTE no cuentan**: todavía no son ni un sí ni un no.
- Sin muestra suficiente **no se avisa**. Acusar a alguien de que va a dejar de
  pagar con dos datos es exactamente lo que no se hace aquí.

## F3 · El bono que caduca con sesiones sin usar

El punto ciego de F1, que mira el bono casi AGOTADO. El caso contrario —8
sesiones que caducan el viernes— no lo veía nadie, y es como se pierde a una
socia sin que se queje nunca: pagó por algo que no llegó a usar.

⚠️ **La ventana de aviso no es fija, depende de su ritmo real.** Comprobado
contra producción: con la ventana fija de 14 días que puse primero, los **dos
únicos bonos reales** que caducan con sesiones sin usar (Carmen, 4 sesiones a 21
días; Isabel, 8 a 35) **no se habrían avisado a tiempo ninguno de los dos**. Ahora
se compara lo que tardaría en gastarlas a su frecuencia real contra lo que le
queda. Sin ritmo fiable, se cae al suelo de 14 días.

## La barandilla, verificada

- **Ninguna regla nueva emite `COBRAR_RECIBOS`.** Todas avisan; el cargo lo
  aprueba una persona.
- `TIPOS_AUTONOMIA_PERMITIDOS` sigue siendo `['ENVIAR_EMAIL', 'CONTACTO_MANUAL']`.
- F5 **nunca puede llegar a ALTA** (`evaluarNivel(..., esAlta: false, ...)`), que
  es justo lo que el piloto automático exige para ejecutar solo. Una estimación
  no mueve dinero.

## Verificación

- `npm test`: **2192/2192** · `npx tsc --noEmit`: **0 errores**.
- 20 tests nuevos de las tres reglas + 8 de la caducidad de tarjeta.
- Migración aplicada y comprobada en producción; `lib/db-types.ts` regenerado y
  el diff revisado a mano (aditivo; de paso recuperó `RowPagosHistoricos`, que
  faltaba de una migración anterior sin regenerar).
- Las consultas de F3 se contrastaron **contra los datos reales de producción**,
  y eso es lo que destapó que la ventana fija no servía.

## ⚠️ Lo que NO se ha podido probar, y es lo más importante de esta fase

**Por Stripe no ha pasado un euro real en producción.** Hoy hay **1 socia de 202
con tarjeta guardada y 0 con SEPA**. Eso significa:

- **F4 no detectará nada** hasta que las socias empiecen a guardar tarjeta. El
  mecanismo está y es correcto, pero está esperando datos.
- **F5 tiene 43 recibos** en total en la base (38 cobrados, 4 pendientes, 1
  devuelto) — suficiente para que la aritmética sea real, no para calibrar nada.
- La captura de caducidad en el webhook **no se ha visto correr con un pago de
  verdad**, solo con tests unitarios sobre la forma del objeto de Stripe.

**Recomendación**: probar el primer cobro con tarjeta en un estudio de pruebas y
comprobar que `tarjeta_exp_mes/anio` se rellenan, antes de fiarse de F4 para
avisar a clientas reales.
