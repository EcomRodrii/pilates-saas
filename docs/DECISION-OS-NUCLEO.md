# TENTARE DECISION OS — DISEÑO DEL NÚCLEO (FASE 3)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Prerrequisitos:** Análisis (Fase 1) y Arquitectura (Fase 2), aprobados.

> Diseño interno de los motores. Los bloques de pseudocódigo son especificación ejecutable para la Fase 9 — no código de producción todavía.
> Principio rector: **todo lo que aquí se decide es determinista y testeable**. La IA no participa en ninguna decisión — solo pone palabras a hechos ya calculados.

---

## 0. EL PIPELINE COMPLETO (Decision Engine)

El Decision Engine es el **orquestador puro** — una única función sin I/O que encadena los demás motores. Corresponde al flujo de la Bible (doc 2 §4): evento → normalización → reglas → especialistas → prioridades → confianza → Centro de Control.

```
ejecutarAnalisis(snapshot, memoria, pendientesActuales, resueltas90d, historicoOutcomes, now)
  │                                      // resueltas90d: recomendaciones RECHAZADA/EXPIRADA/EJECUTADA
  │                                      // recientes (con tipo, socioId y fechas) — alimentan
  │                                      // cooldowns (§6.2) y memoria-FEEDBACK (§3)
  ├─ 1. SEÑALES        senales.ts        hechos derivados del snapshot
  ├─ 2. ESPECIALISTAS  especialistas/*   cada uno emite Candidata[] (independientes)
  ├─ 3. MEMORY ENGINE  memoria.ts        veta / ajusta canal / transforma candidatas
  ├─ 4. COORDINACIÓN   (en director.ts)  resuelve colisiones entre especialistas
  ├─ 5. CONFIDENCE     confianza.ts      nivel + evidencia + autonomía máxima
  ├─ 6. COOLDOWNS      prioridad.ts      filtra re-propuestas recientes (usa resueltas90d)
  ├─ 7. PRIORITY       prioridad.ts      score → prioridad → cortes y caps
  ├─ 8. DIRECTOR       director.ts       estado general + resumen + mientras dormías
  │
  └─ → { candidatasFinales, borradoresRedaccion, resumenBorrador, expiraciones }
```

Orden inmutable. Cada paso es una función pura con test propio; el Decision Engine solo compone. Ningún motor conoce a otro — se comunican por los tipos de `tipos.ts` (contratos Fase 2).

---

## 1. SEÑALES (entrada común de los especialistas)

Funciones puras sobre `SnapshotEstudio`, precomputadas UNA vez con índices `Map` (patrón P0-19) y compartidas por todos los especialistas — nadie re-itera colecciones:

| Señal | Definición exacta |
|---|---|
| `frecuenciaHabitual(socia)` | media de asistencias/semana en las 8 semanas previas a su última asistencia (mín. 4 asistencias para ser válida; si no, `null`) |
| `diasSinVenir(socia)` | días desde última reserva ASISTIDA |
| `ausenciaAnomala(socia)` | `diasSinVenir > max(14, 3 × (7/frecuenciaHabitual))` — una socia de 3×/semana es anómala a los 14 días; una de 1×/semana, a los 21. **Relativa al patrón propio, no umbral fijo** (exigencia Bible doc 3: "¿quién lleva 30 días? eso es una regla, no inteligencia") |
| `renovacionProxima(socia)` | días hasta `suscripcion.fechaFin` de la ACTIVA (null si no hay) |
| `valorMensual(socia)` | precio del plan ACTIVO; para bonos: `precio/sesiones × frecuenciaHabitual × 4.33`; fallback: media de recibos COBRADOS últimos 90d ÷ 3 |
| `ocupacionFranja(dow,hora,tipo)` | serie de ratios de las últimas N ocurrencias de la franja (reutiliza semántica `ocupacion.ts`) |
| `demandaInsatisfecha(franja)` | media de socias en LISTA_ESPERA de las últimas 3 ocurrencias |
| `pagosEnRiesgo()` | recibos PENDIENTE vencidos, particionados por `tieneTarjeta` |
| `emailsSinRespuesta(socia)` | automation_logs EJECUTADO tipo email sobre la socia en 60d sin reserva posterior en 7d de cada uno |

---

## 2. AI SPECIALISTS (contrato de comportamiento)

Cada especialista implementa `detectar(snapshot, memoria, now): Candidata[]` y obedece 4 leyes:

1. **Solo su pregunta.** Retención jamás mira ocupación de franjas; Ingresos jamás mira renovaciones individuales. La coordinación es del Director (§4), no de ellos.
2. **Toda candidata sale completa:** `datosUsados` (hechos exactos), `impacto` con `formula` legible, `urgencia` y `esfuerzo` declarados. Si no puede calcular impacto honesto → no emite.
3. **Silencio antes que ruido.** Datos insuficientes (§9) → lista vacía, nunca candidatas especulativas.
4. **Texto del motor siempre válido.** `tituloMotor/motivoMotor` legibles por sí mismos — son el fallback si la IA cae.

Las reglas concretas de Retención e Ingresos (MVP) se especifican en Fase 4. KPI por especialista (Bible doc 3) = query sobre sus outcomes: `POSITIVO / (POSITIVO+NEGATIVO)` + impacto acumulado de EJECUTADAS positivas.

---

## 3. MEMORY ENGINE (`memoria.ts`)

Aplica `memoria_socio` a las candidatas. Tres semánticas, en este orden:

**VETO** — suprime la candidata (y registra por qué, para el log de análisis):
- `NO_CONTACTAR_HASTA {fecha}` con fecha > now → suprime toda candidata de contacto (`CONTACTO_MANUAL`, `ENVIAR_EMAIL`) sobre esa socia.
- `NO_OFRECER_DESCUENTOS` → suprime `ENVIAR_REACTIVACION` con descuento; la degrada a `RECUPERAR_SOCIA` (contacto sin oferta).

**AJUSTE DE CANAL** — transforma la acción sin cambiar el diagnóstico:
- `PREFIERE_WHATSAPP` / `PREFIERE_LLAMADA` → `CONTACTO_MANUAL.canal` correspondiente.
- `NUNCA_RESPONDE_EMAIL` → convierte `ENVIAR_EMAIL` en `CONTACTO_MANUAL` (evidencia visible: "los últimos N emails no obtuvieron respuesta").

**ESCRITURA AUTOMÁTICA** (origen `REGLA` y `FEEDBACK` — deterministas, con `evidencia` textual):
- `emailsSinRespuesta(socia) ≥ 3` → upsert `NUNCA_RESPONDE_EMAIL` (REGLA).
- 2 rechazos del propietario a contactos sobre la misma socia en 90d (consultados en `resueltas90d`) → `NO_CONTACTAR_HASTA now+60d` (FEEDBACK, evidencia: "rechazaste contactarla el {f1} y el {f2}").
- Origen `MANUAL` (UI de edición de memoria): fase posterior; la tabla ya lo soporta.

La memoria **nunca sube** prioridad ni confianza — solo veta o ajusta. Un hecho de memoria siempre es visible y borrable (Bible: la memoria no es caja negra).

---

## 4. COORDINACIÓN ENTRE ESPECIALISTAS (en `director.ts`, paso 4)

Regla de colisión — **una socia, una recomendación visible**:
- Si ≥2 candidatas comparten `socioId`, gana la de mayor score preliminar; las demás se **fusionan como contexto** en `datosUsados.contextoAdicional` (ej.: Retención detecta riesgo + Finanzas detecta pago pendiente → una sola tarjeta "Recuperar a Laura" cuyo motivo menciona ambos hechos). Es la versión determinista de la "comunicación entre especialistas" de la Bible (doc 3): coordinación por síntesis, no por mensajería entre módulos.
- Colisión de recursos (misma franja/sesión en Ingresos vs Agenda, fase 2+): misma regla por `sesionId`/franja.

---

## 5. CONFIDENCE ENGINE (`confianza.ts`)

### 5.1 MVP — nivel por evidencia (determinista)

Cada tipo define **criterios de evidencia** puntuables; el nivel sale del recuento:

| Tipo | Criterios (cada uno aporta evidencia textual) | ALTA | MEDIA | BAJA |
|---|---|---|---|---|
| `RECUPERAR_SOCIA` | (a) `ausenciaAnomala` con frecuencia habitual válida · (b) `renovacionProxima ≤ 14d` · (c) antigüedad ≥ 90d · (d) sin contacto previo en 30d | a+b+d | a+d | solo a |
| `ENVIAR_REACTIVACION` | (a) ausencia ≥ umbral crítico · (b) histórico de respuesta a emails · (c) sin `NO_OFRECER_DESCUENTOS` | a+b+c | a+c | solo a |
| `ABRIR_SESION` | (a) franja ≥95% en ≥3 ocurrencias seguidas · (b) `demandaInsatisfecha ≥ 2` · (c) patrón ≥ 5 semanas | a+b+c | a+b | a |
| `RECUPERAR_PAGOS` | (a) tarjeta guardada válida · (b) recibo < 30d vencido · (c) socia activa | a+b+c | a+b | a |

Reglas duras: **suelo de emisión** — si ni siquiera se cumple la columna BAJA (la condición mínima de detección de la regla; nivel interno `NULA`), la candidata **no se emite**. BAJA sí se emite pero **solo informa**: autonomía 0 y prioridad capada a MEDIA — nunca entra en el bloque Prioridades. Es la traducción honesta del "menos de 70% nunca recomendar" de la Bible. `confianza.evidencia` = los criterios cumplidos, en lenguaje humano — es lo que ve el usuario ("Confianza alta — basada en: …").

### 5.2 Autonomía máxima derivada

`ALTA → 2` (efecto directo tras aprobación: email/cobro) · `MEDIA → 1` (recomendación con aprobación) · `BAJA → 0` (solo informar). **Regla de resolución:** `nivelAutonomia = min(autonomíaDeclaradaPorLaRegla, confianza.autonomiaMaxima)` — una regla que declara autonomía 2 pero sale con confianza MEDIA ejecuta como 1. **El MVP nunca emite nivel 3** — el nivel 3 (automático sin aprobación) queda estructuralmente preparado pero desactivado hasta tener calibración real (§5.3) + opt-in explícito del propietario por tipo de acción, como exige la Bible (doc 2 §13: solo acciones reversibles, solo si el usuario lo permite).

### 5.3 Camino de calibración (fase futura, diseñado hoy)

Cuando un `(tipo, nivel)` acumule **≥30 outcomes medidos** (global multi-tenant primero; por estudio cuando haya masa), **agrupados dentro de la misma versión MAYOR de `algorithm_version`** ([DECISION-OS-MODELO-DATOS.md](DECISION-OS-MODELO-DATOS.md) §2.12 — un cambio de `PESOS` en el dogfooding de la Fase D invalida la comparabilidad con outcomes previos, así que la muestra nunca mezcla versiones incompatibles):
`pctReal = (positivos + 1) / (total + 2)` (suavizado de Laplace). Se muestra el porcentaje solo si el intervalo de Wilson al 90% tiene anchura < 20 puntos. Hasta entonces, niveles. Así el "91%" del futuro estará **medido, no inventado** (resuelve la contradicción señalada en Análisis §12.2).

---

## 6. COOLDOWNS Y CICLO DE VIDA (`prioridad.ts` + pipeline)

### 6.1 Ciclo de vida de una recomendación

```
(motor detecta) → PENDIENTE ──aprobar──→ APROBADA ──ejecutor──→ EJECUTADA ──T+N──→ outcome
       │              │                                              └─fallo→ FALLIDA
       │              └──rechazar──→ RECHAZADA (cooldown + señal FEEDBACK)
       └── expira_en vencido ──→ EXPIRADA (evento IGNORADA · outcome NEUTRO · cooldown reducido)
```

- **Refresh, no duplicado:** si el motor re-detecta una PENDIENTE viva (misma `dedupe_key`), actualiza `datos_usados`, score y expiración — no crea otra (índice único parcial, Fase 2 §4).
- **Auto-obsolescencia:** si el hecho desaparece (la socia reservó, el recibo se pagó) antes de decidir, el análisis siguiente la pasa a EXPIRADA (evento IGNORADA, outcome `NEUTRO`, nota "se resolvió sola") — candidata a "Mientras Dormías" del día siguiente.

### 6.2 Cooldowns por tipo (tras RECHAZADA; EXPIRADA = mitad)

| Tipo | Cooldown | Racional |
|---|---|---|
| `RECUPERAR_SOCIA` | 21 días por socia | no insistir sobre la misma persona |
| `ENVIAR_REACTIVACION` | 30 días por socia | una oferta rechazada no se repite en semanas |
| `CONGELAR_MEMBRESIA` | 30 días por socia | decisión sensible |
| `ABRIR_SESION` | 14 días por franja | la señal de demanda cambia despacio |
| `RECUPERAR_PAGOS` | 3 días por lote | el dinero pendiente sí se re-propone rápido |

(Los cooldowns se evalúan sobre `resueltas90d`, entrada del pipeline — §0.)

Además, **aprendizaje determinista suave:** cada RECHAZADA del mismo `tipo` en el estudio resta un 10% al score de futuras candidatas de ese tipo (piso 0.7×, se restaura con una APROBADA). El sistema se adapta al gusto del propietario sin ML y de forma explicable.

### 6.3 Expiraciones por defecto (`expiraEnDias`)

`RECUPERAR_PAGOS` 7d · `RECUPERAR_SOCIA` / `ENVIAR_REACTIVACION` 10d · `ABRIR_SESION` 21d · `CONGELAR_MEMBRESIA` 14d.

---

## 7. PRIORITY ENGINE (`prioridad.ts`)

### 7.1 Normalización de impacto a €/mes

`EUR_MES` → tal cual · `EUR` (one-off) → `valor / 3` (horizonte de 3 meses, constante declarada) · `PCT_OCUPACION` → se traduce a €/mes en la propia candidata (el especialista calcula plazas × precio medio; si no puede, emite `impacto = undefined` y compite solo por urgencia con `impactoNorm = PESOS.impactoSinDato = 0.25`).

### 7.2 Fórmula del score (0–100, multiplicativa)

```
impactoNorm     = min(1, log10(1 + eurMes) / log10(1 + 500))   // 500€/mes satura la escala
                  // sin impacto € declarado → PESOS.impactoSinDato (0.25)
confianzaFactor = ALTA 1.0 · MEDIA 0.7 · BAJA 0.4
urgenciaFactor  = 0.5 + 0.5 × urgencia          // sin urgencia no mata un gran impacto
esfuerzoFactor  = 1 − 0.3 × esfuerzo            // penalización acotada
ajusteFeedback  = 0.7 … 1.0                      // §6.2

score = 100 × impactoNorm × confianzaFactor × urgenciaFactor × esfuerzoFactor × ajusteFeedback
```

Multiplicativa a propósito: una candidata floja en *cualquier* eje no puede colarse arriba a base de otro eje. Constantes en un objeto `PESOS` exportado — un solo sitio para ajustar, tests fijan su comportamiento.

### 7.3 Prioridad y cortes (reglas Bible, innegociables)

```
CRITICA  score ≥ 70  Y  riesgo = PERDIDA (campo obligatorio de la candidata — dinero o socia en juego)
ALTA     score ≥ 45
MEDIA    score ≥ 25   (también techo para confianza BAJA, §5.1)
BAJA     resto (se persiste, no se muestra en Home)
```
- **Cap global: ≤3 CRITICA** — el excedente se degrada a ALTA (orden por score). *"Nunca más de tres prioridades críticas"* (doc 4).
- **Cap por especialista: ≤2 en el bloque Prioridades** — ningún especialista monopoliza la Home.
- **Sección Prioridades de la Home: exactamente las CRITICA + mejores ALTA hasta 3 tarjetas.** El resto vive en la tarjeta de su especialista ("4 pendientes · +320€/mes").
- Desempate estable: score desc → prioridad de riesgo sobre oportunidad → `creadoEn` asc. Determinista: mismo snapshot, mismo orden (testeable).

---

## 8. DIRECTOR (`director.ts`)

### 8.1 Estado general (exactamente uno, doc 4)

```
ACCION_INMEDIATA  ∃ CRITICA (toda CRITICA implica riesgo = PERDIDA por definición, §7.3)
ATENCION          sin CRITICA, pero ∃ ALTA con riesgo = PERDIDA
EXCELENTE         resto — puede haber ALTAs de oportunidad ("tranquilo; hay {n} cosas
                  en las que quiero tu opinión", el estado del mockup)
```

### 8.2 Resumen ejecutivo (números, todos derivados)

`nDecisiones` = tarjetas del bloque Prioridades · `tiempoEstimadoMin` = suma de sus `tiempo_estimado_min` · `impactoTotal` = suma de impactos normalizados €/mes con `formula` = desglose ("89 + 620 + 180/3"). Nunca se muestra un agregado cuya suma no cuadre con las tarjetas visibles.

### 8.3 "Mientras Dormías" — solo hechos verificados

Ventana: desde las 21:00 del día anterior hasta `generadoEn`. Las fuentes llegan al Director **como entradas del pipeline** (resueltas recientes + `automationLogs` del snapshot) — el núcleo no consulta DB. Cada ítem lleva `verificadoPor` con tabla+conteo (auditabilidad):

| Hecho | Fuente de verdad |
|---|---|
| "Reintenté N pagos — cobrados X€" | `recomendaciones` EJECUTADA tipo RECUPERAR_PAGOS con `resuelto_en` en ventana (importes desde `datos_usados`) + `automation_logs` de COBRAR_RECIBO ejecutados (`ejecutado_en` es timestamptz — permite acotar la ventana; `recibos.fecha_cobro` es `date` sin hora y no distingue el origen del cobro, no sirve como fuente) |
| "Escribí a N alumnas" | `automation_logs` EJECUTADO (email) en ventana |
| "N alumnas volvieron a reservar" | reservas nuevas en ventana de socias con log de contacto previo ≤7d — **solo si existe el vínculo temporal; si no, se dice "N reservas nuevas", sin atribuirse el mérito** (regla anti-exageración doc 4) |
| "Se liberó una plaza y avisé a la lista de espera" | **Fase E** — hoy la promoción (RPC `cancelar_reserva_plaza`) no deja rastro consultable: requiere registrar un `TipoActividad` nuevo (`LISTA_ESPERA_PROMOVIDA`) en `actividad_reciente` al promover — punto de contacto que se declarará en esa fase. Fuera del MVP |
| "Recordatorios enviados" | `automation_logs` CLASE_MANANA en ventana |

Si la ventana está vacía: la sección se omite (nunca "no hice nada" ni relleno).

### 8.4 Saludo

El motor genera la versión determinista a partir de plantillas parametrizadas (momento del día, nombre, estado general, nDecisiones) — p. ej. *"Buenos días, Marco. Hoy está todo bastante tranquilo. Solo hay 2 cosas en las que quiero tu opinión."* La IA puede re-redactarla (variación de tono mockup); si cae, la plantilla ya es correcta.

---

## 9. CASOS BORDE (contratos de comportamiento, todos con test)

| Caso | Comportamiento |
|---|---|
| Estudio nuevo (<10 socias activas o <30 días de histórico) | **Modo aprendizaje:** cero recomendaciones; `resumen_diario` con estado EXCELENTE y saludo honesto ("Aún estoy conociendo tu estudio — necesito unas semanas de datos"); Home muestra empty state con acciones de arranque (doc 5 §20) |
| `frecuenciaHabitual = null` (pocas asistencias) | Retención usa umbral absoluto conservador (21d) con confianza BAJA → normalmente no supera el corte: silencio |
| Sin Stripe conectado | `RECUPERAR_PAGOS` degrada a recordatorio email (`ENVIAR_EMAIL` plantilla `RECORDATORIO_PAGO`), evidencia lo explica |
| Socia sin email ni teléfono | Solo `CONTACTO_MANUAL canal LLAMADA`; si tampoco hay teléfono → no se emite (acción imposible = tarjeta prohibida, doc 4 "si no existe una acción, la tarjeta sobra") |
| Todos los motores en silencio | Estado EXCELENTE + "Mientras Dormías" (si hay) + accesos rápidos. **El silencio es un resultado válido y deseable** |
| IA caída / JSON inválido | Ítem a ítem: texto del motor (ya validado). Jamás se bloquea el análisis |
| Doble análisis simultáneo (cron+manual) | `dedupe_key` + upsert idempotente → convergen al mismo estado; el rate-limit de la ruta minimiza el caso |
| Aprobación de una expirada | 409 en API (transición condicional en SQL, Fase 2 §7) |
| Cambio de plan a BASE (pierde feature) | Home vuelve a `/dashboard` (redirect condicional); pendientes quedan congeladas, sin ejecutar nada |

---

## 10. REDACCIÓN IA (`redaccion.ts`) — especificación del adaptador

- **Una llamada por análisis** (Haiku, JSON estricto): entra `{estudio, saludoBase, items:[{id, especialista, tipo, datosUsados, tituloMotor, motivoMotor}]}` (≤10 items), sale `{saludo, items:[{id, titulo, motivo}]}`.
- **System prompt (rasgos fijados aquí; texto final en Fase 4):** voz en primera persona del especialista ("Noto a Laura y Marta a punto de irse. Yo les escribiría hoy"); español de España; cercano y profesional, nunca infantil ni alarmista; frases cortas; **prohibido introducir números, fechas o promesas que no estén en `datosUsados`**; prohibido exagerar ("nunca digas que recuperaste a alguien si solo enviaste un mensaje").
- **Validación de salida:** JSON parseable, ids completos, longitudes máximas (título ≤80, motivo ≤240). Cualquier fallo → fallback por ítem al texto del motor. Como el prompt prohíbe números nuevos y los hechos van en la tarjeta desde `datos_usados` (fuente motor), una alucinación numérica no puede llegar a la UI como dato: los importes/fechas que ve el usuario se renderizan **siempre** desde `impacto` y `datosUsados`, nunca del texto libre.
- **Cache:** si una PENDIENTE se refresca sin cambios en `datos_usados`, conserva su redacción (cero tokens).

---

## 11. MAPA DE TESTS DEL NÚCLEO (definición de "hecho" para Fase 9)

| Módulo | Tests mínimos |
|---|---|
| `señales` | frecuencia habitual (válida/insuficiente), ausencia anómala relativa, valor mensual por plan/bono/fallback |
| `memoria` | cada veto, cada ajuste de canal, escritura por regla (3 emails sin respuesta), escritura por feedback (2 rechazos) |
| `confianza` | tabla de criterios por tipo → nivel esperado; `<BAJA` no emite; autonomía derivada |
| `prioridad` | fórmula con casos tabulados; caps ≤3 críticas y ≤2 por especialista; desempate estable; cooldowns; ajusteFeedback |
| `director` | estados generales; suma de resumen cuadra con tarjetas; "mientras dormías" desde fixtures de logs (incluye caso "sin atribución de mérito") |
| `coordinación` | colisión por socia → fusión de contexto |
| casos borde §9 | uno por fila de la tabla |
| pipeline completo | snapshot sintético "estudio del mockup" → tras aplicar caps, el bloque Prioridades contiene las 3 tarjetas de mayor score (Laura · abrir sesión martes 19h · pagos 180€); Marta queda contada en la tarjeta del especialista Retención ("2 socias necesitan atención") |

---

## DECISIONES QUE FIJARÁ LA FASE 4

1. Reglas de detección completas de **Retención** e **Ingresos** (umbral por umbral) + specs de los 4 especialistas restantes para fases posteriores.
2. Textos finales de prompts (system + few-shots por especialista) y plantillas deterministas de saludo/motor.
3. KPIs visibles por especialista en su tarjeta de la Home.

**Siguiente paso (Fase 4):** especificación de los 7 especialistas — inputs, outputs, reglas, contexto, memoria, recomendaciones y KPIs de cada uno.
