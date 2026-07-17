# TENTARE DECISION OS — DOCUMENTO DE ANÁLISIS (FASE 1)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Fuentes:** Product Bible (documentos 1–5 + 2 mockups) · Codebase completo · Grafo graphify · Auditorías previas (CTO, Escalabilidad, Producto, Calendario)

> Este documento NO contiene código. Es el análisis previo exigido por la primera regla del proyecto.
> Nada de lo aquí propuesto modifica el SaaS existente: Agenda, Clientes, Pagos, Facturación, Bonos, Portal de miembros y Analytics siguen intactos.

---

## 1. QUÉ HE ENTENDIDO DEL PRODUCTO

**Tentare deja de competir en funcionalidades y crea una categoría: Decision Operating System.**

La tesis central de la Bible, en una frase: *todos los SaaS responden "¿qué está pasando?"; Tentare responde "¿qué deberías hacer ahora?"*. El producto no vende inteligencia artificial — vende **tranquilidad, tiempo y mejores decisiones**. La IA desaparece del discurso: el usuario tiene "un equipo" (Director + 6 especialistas), no "una IA".

Los contratos no negociables que he extraído:

1. **Decisiones, no datos.** Nunca un KPI sin contexto. Nunca "18.450€"; siempre "puedes ganar +640€/mes si abres una sesión los jueves, porque…".
2. **Priorizar, no listar.** De 61 recomendaciones internas, el usuario ve ≤3 críticas. El Motor de Prioridades filtra; el usuario nunca ve el volumen bruto.
3. **Explicar, no ordenar.** Toda recomendación responde 5 preguntas: qué / por qué / impacto / confianza / tiempo. Sin excepción. La IA jamás es caja negra.
4. **Una pantalla = una pregunta.** Centro de Control → "¿qué necesita mi atención hoy?" (≤5 min/día). Analytics → "¿qué está pasando?" (intacto, deja de ser la Home).
5. **El usuario supervisa; Tentare ejecuta.** 4 niveles de autonomía: informar (0) → recomendar (1) → automatización supervisada (2) → automático solo si reversible (3). Nunca automático en decisiones estratégicas ni irreversibles.
6. **Confianza honesta.** >95% automatizable · 85–95% aprobación rápida · 70–85% mostrar · <70% nunca recomendar. El sistema nunca finge certeza ni inventa datos.
7. **Aprendizaje y memoria.** Cada aprobación/rechazo/resultado alimenta al sistema. Memoria por cliente ("Ana desaparece los veranos — no contactar"). Almacenado por acción, nunca caja negra.
8. **Especialistas pequeños, nunca una IA gigante.** Cada uno con pregunta única, inputs, outputs, límites y KPI propio. El Director no analiza: **prioriza y resume** ("Mientras dormías… solo necesito tu aprobación para 2 acciones").
9. **Tono del mockup:** cercano, honesto, en primera persona ("Escribí a 2 alumnas… las dos han vuelto a reservar"), sin jerga, sin alarmismo. Nunca exagerar logros.
10. **Roadmap de la Bible:** MVP = Retención + Ingresos + Director. Después Agenda/Marketing/Finanzas → Equipo/memoria → coordinación avanzada/predicciones.

**El mockup es la especificación visual más fiable** (ver §12.1): fondo crema, acento rosa, tarjetas blancas redondeadas, tres tarjetas de especialista con punto de color, un solo CTA primario rosa. Coincide con el Design System actual de Tentare, no con los hex de los documentos 4–5.

---

## 2. CÓMO ENCAJA CON LA ARQUITECTURA ACTUAL

Encaja **excepcionalmente bien**. No es casualidad: el SaaS ya contiene un proto-Decision-OS en producción.

| Pieza del Decision OS (Bible) | Lo que ya existe hoy | Estado |
|---|---|---|
| Detección determinista de situaciones | `lib/automation-engine.ts` — `computeAutomationCandidatos()`: función **pura**, indexada, testeada, con 4 triggers | ✅ Molde exacto |
| Cola durable + fan-out por tenant | Inngest: `automatizacionesDispatcher` (cron 07:00) → 1 evento/estudio, `step.run()` idempotente por candidato, retries 3, concurrency 5 | ✅ Patrón a clonar |
| Aprobación humana de un toque | `automation_logs.resultado = 'PENDIENTE_ADMIN'` + `aprobarCobroAutonomo` — jamás se cobra ni descuenta sin aprobar | ✅ Nivel 1–2 de autonomía ya implementado |
| IA explicable con fallo suave | `lib/ai/recomendacion-prompt.ts` + Haiku 4.5, JSON estricto, fallback al texto del motor si la IA falla | ✅ Filosofía correcta |
| "Mientras Dormías" | `automation_logs` (EJECUTADO) + `actividad_reciente` (feed con tipos) | 🟡 Datos sí; síntesis no |
| Insight de negocio (no sobre una socia) | Trigger `CLASE_LLENA_RECURRENTE` → "valora abrir otra sesión" | ✅ Precedente directo del Especialista Ingresos |
| Señales/KPIs de entrada | `dashboard-chart-engine.ts`, `ocupacion.ts` (semántica única de ocupación), MRR/retención/cohortes en `informes` — todo funciones puras | 🟡 Puras y reutilizables, pero viven en cliente |
| Multi-tenant + roles + gating por plan | `studio_id` en 48 tablas + RLS · `Rol` (PROPIETARIO/INSTRUCTOR/RECEPCION) · `entitlements` (BASE/ESTUDIO/CADENA, feature `ia`) | ✅ El Decision OS se gatea como feature |
| Navegación | `navSections` en `components/layout/sidebar.tsx` — añadir item = añadir un objeto | ✅ Un solo punto de cambio |

**Conclusión de encaje:** el Decision OS no se construye *contra* la arquitectura, se construye *extrayendo y generalizando* el patrón que ya funciona: `motor puro → candidatos explicables → cola durable → aprobación humana → ejecución idempotente`. Lo que falta es la capa que la Bible añade encima: **priorización, confianza, memoria, feedback y síntesis del Director**.

---

## 3. QUÉ PARTES DEL SAAS SE REUTILIZAN

**Se reutilizan tal cual (sin tocar):**
- Cola Inngest (`lib/inngest/client.ts`), patrón dispatcher→fan-out→steps idempotentes.
- `fetchAllStudioData` / mappers / `db-types.ts` como capa de lectura (con la reserva de escala de §11.4).
- Envío de email (Resend + plantillas react-email + Idempotency-Key).
- Cobro con aprobación (`COBRAR_RECIBO` → Stripe off-session ya cableado).
- Sistema de permisos (`puedeVer`) y entitlements (`tieneFeature`).
- Design System completo: tokens de `globals.css` (crema `#EEEEE8`, brand rosa `#FFC8E2`, Plus Jakarta Sans, radius 1rem), primitivos `components/ui/` (Button, Card, Badge, Dialog, Tabs…), dark mode del panel (`panel-theme`).
- Feed `actividad_reciente` y `notificaciones` como fuentes de "qué ha pasado".
- Fórmulas puras de KPIs (MRR, retención, ocupación, cohortes) — se extraen a módulo compartido sin cambiar su comportamiento en Analytics.

**Se generaliza (sin romper lo existente):**
- `automation-engine.ts` → los 4 triggers actuales se convierten en las primeras *señales* de los especialistas Retención (AUSENCIA_DIAS), Finanzas (PAGO_PENDIENTE_DIAS), Agenda (CLASE_MANANA) e Ingresos (CLASE_LLENA_RECURRENTE). El motor actual **sigue funcionando idéntico** para la página `/automatizaciones`; el Decision OS lo consume, no lo sustituye.
- `lib/ai/recomendacion-prompt.ts` → patrón "situación estructurada → redacción" se extiende por especialista.

**No se toca:** Analytics/informes, Agenda, Clientes, Pagos, Facturación (Veri*Factu), Bonos, Portal de miembros, POS, Terminal, gamificación, navegación existente.

---

## 4. QUÉ INFORMACIÓN YA EXISTE (mapeada por especialista)

| Especialista | Datos disponibles hoy | Calidad |
|---|---|---|
| **Retención** | `socios` (fecha_alta, activo, tags, lead_stage), `reservas` (ASISTIDA/CANCELADA/NO_ASISTIO con timestamps), `suscripciones` (estado, fecha_fin, sesiones_restantes), `preferencias_socio` (instructor/clase favorita), `notas_internas`, historial de `automation_logs` (a quién ya se contactó) | 🟢 Completa para MVP |
| **Ingresos** | `recibos`, `ventas_pos`, `planes_tarifa`, `sesiones` + `reservas` (ocupación real por franja), `codigos_descuento`, lista de espera (`LISTA_ESPERA` + `posicion_espera`) | 🟢 Completa para MVP |
| **Finanzas** | `recibos` (PENDIENTE/COBRADO/DEVUELTO + intentos_reintento), `facturas`, tarjeta guardada por socia (stripe_payment_method_id), `suscripciones` por vencer | 🟢 Completa |
| **Agenda** | `sesiones`, `salas`, `spots`, `tipos_clase`, aforo, cancelaciones, series recurrentes, Google Calendar sync | 🟢 Completa (salvo festivos, §5) |
| **Marketing** | `campanas` (con métricas abiertos/clics), segmentos vía tags/lead_stage, asistente IA de campañas ya operativo | 🟡 Sin resultados de conversión atribuibles |
| **Equipo** | `instructores`, sesiones impartidas, `mensajes_equipo`, `notas_progreso` | 🟡 Sin valoraciones ni horas contratadas |
| **Director** | Todo lo anterior + `actividad_reciente` + `automation_logs` | 🟢 Suficiente para sintetizar |

---

## 5. QUÉ INFORMACIÓN FALTA

**Faltan datos que la Bible da por existentes** (declararlo evita construir sobre humo):

1. **Reseñas/valoraciones** — la Bible cita "Nueva reseña" como evento y "valoraciones" para el Especialista Equipo. **No existe ninguna tabla de reseñas.** → Fuera del MVP; si se quiere, es un mini-proyecto aparte (o integración Google Reviews).
2. **WhatsApp real** — los ejemplos de la Bible envían WhatsApps. Hoy solo existe la constante `ENVIAR_WHATSAPP` y el canal en campañas; **no hay integración de envío** (ni Twilio ni WhatsApp Business API). → MVP: el especialista recomienda "llamar" o "enviar WhatsApp" con el texto redactado **para copiar/enviar manualmente**, y envía emails automáticamente (infra existente). La integración WhatsApp es un proyecto independiente.
3. **Festivos** — el Especialista Agenda de la Bible los analiza. No existen. → Fase 2+, tabla simple o API de festivos ES.
4. **Horas contratadas / coste por instructor** — sin esto, el Especialista Equipo no puede razonar sobre cargas. → Fase 3.
5. **Resultado atribuible de acciones** — hoy un email enviado no registra si la socia volvió *por ese email*. Es **el dato más importante que falta**, porque sin él no hay aprendizaje ni confianza calibrada (§12.2). → Se crea con el Decision OS desde el día 1: toda recomendación aprobada registra su outcome observable (¿reservó en 14 días? ¿pagó? ¿renovó?).
6. **Memoria estructurada por cliente** — `preferencias_socio` y `notas_internas` existen, pero no hay "hechos aprendidos" ("no contactar en verano"). → Tabla nueva (§6).
7. **Encuestas, lesiones, conversaciones** — citados como "Futuro" en la propia Bible. Fuera de alcance.

---

## 6. QUÉ MODELOS (TABLAS) HABRÁ QUE CREAR

Todas multi-tenant (`studio_id text NOT NULL` + RLS con `current_studio_id()`), IDs `text` con `uid()` — mismas convenciones que las 48 tablas actuales. **Ninguna tabla existente se altera.**

1. **`recomendaciones`** — el modelo central.
   `id, studio_id, especialista (RETENCION|INGRESOS|AGENDA|MARKETING|FINANZAS|EQUIPO|DIRECTOR), tipo (catálogo cerrado: RECUPERAR_SOCIA, ABRIR_SESION, RECUPERAR_PAGOS, …), titulo, motivo (texto humano), datos_usados jsonb (los hechos exactos: días sin venir, franja, importes — trazabilidad), impacto jsonb ({valor, unidad: EUR_MES|EUR|PCT_OCUPACION, formula}), confianza (ALTA|MEDIA|BAJA en MVP — ver §12.2), score numeric (interno del Priority Engine, nunca se muestra), prioridad (CRITICA|ALTA|MEDIA|BAJA), nivel_autonomia (0|1|2|3), accion jsonb ({tipo, payload} — ejecutable al aprobar), socio_id?, sesion_id?, recibo_id?, dedupe_key (unique por studio — evita duplicados entre ejecuciones), estado (PENDIENTE|APROBADA|RECHAZADA|EXPIRADA|EJECUTADA|FALLIDA), tiempo_estimado_min, expira_en, creado_en, resuelto_en, resuelto_por`
2. **`recomendacion_outcomes`** — el feedback loop (aprendizaje).
   `id, studio_id, recomendacion_id, evento (APROBADA|RECHAZADA|IGNORADA|EJECUTADA), outcome (POSITIVO|NEGATIVO|NEUTRO|PENDIENTE), señal_observada (RESERVO|PAGO|RENOVO|CANCELO|SIN_RESPUESTA), medido_en, ventana_dias`
3. **`memoria_socio`** — memoria por cliente, explicable.
   `id, studio_id, socio_id, clave (NO_CONTACTAR_HASTA|PREFIERE_WHATSAPP|NUNCA_RESPONDE_EMAIL|… catálogo cerrado — las notas de texto libre siguen en notas_internas), valor jsonb, origen (REGLA|FEEDBACK|MANUAL), evidencia texto, activa boolean, creado_en, actualizado_en`
4. **`resumen_diario`** — snapshot del Director por estudio/día (evita recomputar en cada visita y da historial).
   `id, studio_id, fecha (unique con studio), estado_general (EXCELENTE|ATENCION|ACCION_INMEDIATA), saludo texto, mientras_dormias jsonb (hechos verificados con conteos), n_decisiones, tiempo_estimado_min, impacto_total jsonb, generado_en`

No se crean tablas para "eventos" (se reutiliza `actividad_reciente` + eventos Inngest) ni para KPIs de especialistas (derivables de `recomendaciones` + `recomendacion_outcomes`).

---

## 7. QUÉ SERVICIOS NUEVOS SERÁN NECESARIOS

Todo bajo **`lib/decision/`** — núcleo TypeScript **puro, determinista y testeable** (mismo estándar que `automation-engine.ts` y `verifactu.ts`, que ya tienen tests unitarios). Cero dependencias de React/Supabase en el núcleo: entra un snapshot de datos, salen recomendaciones.

```
lib/decision/
├── senales.ts            · Signal collectors: hechos derivados del snapshot
│                           (díasSinVenir, franjaLlena, riesgoRenovación, pagoEnPeligro…)
├── especialistas/
│   ├── contrato.ts       · Contrato Especialista: (Snapshot, Memoria, Config) → Candidata[]
│   ├── retencion.ts      · MVP
│   ├── ingresos.ts       · MVP
│   ├── finanzas.ts       · Fase 2
│   ├── agenda.ts         · Fase 2
│   ├── marketing.ts      · Fase 2
│   └── equipo.ts         · Fase 3
├── prioridad.ts          · Priority Engine: score = f(impacto€, urgencia, esfuerzo,
│                           confianza) → corta a ≤3 críticas visibles (regla Bible)
├── confianza.ts          · Confidence Engine: nivel por evidencia + histórico de outcomes
├── memoria.ts            · Memory Engine: aplica memoria_socio como VETO/ajuste
│                           (p.ej. NO_CONTACTAR_HASTA suprime la recomendación)
├── director.ts           · Sintetiza: estado general, resumen ejecutivo, "mientras
│                           dormías" (solo hechos verificados de logs), agrupa por especialista
├── redaccion.ts          · Única frontera con IA: prompts por especialista, tono del
│                           mockup, fallo suave al texto del motor (patrón actual)
└── outcomes.ts           · Medición diferida: ¿la acción aprobada produjo señal positiva?
```

**Regla arquitectónica clave (anti-alucinación):** los números (impacto, días, importes) los calcula **siempre el motor determinista** con fórmulas declaradas en `datos_usados`. La IA **solo redacta** el texto humano sobre hechos ya calculados — exactamente como hoy hace `redactarConIA`. Si la IA cae, el sistema sigue funcionando con la redacción del motor.

---

## 8. QUÉ APIs HARÁN FALTA

Mínimas — el patrón actual (context + rutas server) se respeta:

| Ruta | Método | Propósito |
|---|---|---|
| `/api/decisiones` | GET | Recomendaciones pendientes + resumen diario del estudio (para el Centro de Control) |
| `/api/decisiones/[id]/aprobar` | POST | Aprueba → encola ejecución en Inngest (idempotente) → devuelve estado |
| `/api/decisiones/[id]/rechazar` | POST | Rechaza con motivo opcional → alimenta `recomendacion_outcomes` |
| `/api/decisiones/analizar` | POST | "Ejecutar ahora" manual (equivalente al botón actual de automatizaciones), protegido por rol |
| `/api/inngest` | — | Ya existe; solo se registran las funciones nuevas |

Protección: `verificarSesionStaff` + rol (**MVP: solo PROPIETARIO** — coherente con las políticas RLS owner-only de `automation_*`; la apertura parcial a RECEPCION se decidirá post-MVP) + `tieneFeature(studio, 'decisiones')`.

---

## 9. QUÉ EVENTOS DEBERÁN EXISTIR

**Inngest (nuevos, siguiendo la convención `dominio/recurso.accion` existente):**

| Evento | Emisor | Consumidor |
|---|---|---|
| `decision/studio.analyze` | Dispatcher cron (2×/día: 06:30 y 14:30) + botón manual + eventos reactivos | Pipeline de análisis por estudio (fan-out, concurrency, steps idempotentes — clon del patrón actual) |
| `decision/recommendation.approved` | Ruta aprobar | Ejecutor de acciones (email/cobro/campaña) — reutiliza `procesarCandidato` generalizado |
| `decision/outcome.measure` | Programado T+3…T+21 según tipo (`step.sleepUntil`; tabla de ventanas en Fase 3) | Medidor de outcomes → `recomendacion_outcomes` |

**Reactivos de alto valor (fase 2, puntos de emisión quirúrgicos, sin bus global):** `PaymentFailed` (desde webhook Stripe ya existente), `ReservationCancelled` (desde la RPC de cancelación), `WaitlistJoined`. Cada uno dispara `decision/studio.analyze` con debounce, para que un pago fallido aparezca en el Centro de Control en minutos, no al día siguiente. **No se implementa event-sourcing completo** — justificación en §12.3.

---

## 10. RIESGOS

1. **Coste LLM a escala.** Análisis 2×/día × N estudios × 7 especialistas podría disparar tokens. Mitigación: detección 100% determinista (coste cero), IA solo redacta las ~≤10 recomendaciones que superan el corte de prioridad, con Haiku (barato) y redacción cacheada por `dedupe_key`.
2. **Plan free de Inngest** (concurrency 5, ya al límite). Añadir un segundo pipeline con fan-out duplica presión. Mitigación: colas con `concurrency` propia y horarios desplazados de las automatizaciones; evaluar upgrade de plan al crecer.
3. **`fetchAllStudioData` sin límites** (~40 tablas completas; `automation_logs` ilimitado, ya señalado en P0). El pipeline de decisiones lo heredaría. Mitigación: snapshot acotado por ventana temporal (90–180 días) para el análisis; no bloquea el MVP pero se declara deuda.
4. **`studio-context.tsx` (115 KB) es ya el punto caliente del cliente.** Meter el Decision OS ahí lo agravaría. Decisión: el Centro de Control se alimenta de `/api/decisiones` (server) con su propio hook ligero, **no** engorda el context global.
5. **Confianza percibida.** Si las primeras recomendaciones son malas u obvias, el usuario pierde fe en "su equipo" y no vuelve. Mitigación: MVP solo con los 2 especialistas de señal más fuerte (Retención, Ingresos), umbral conservador, y "Mientras Dormías" solo con hechos verificados (nunca inflar logros — regla explícita de la Bible).
6. **Doble vía de ejecución** (cron + botón manual) puede divergir — ya pasó con automatizaciones y se resolvió compartiendo el motor. Se aplica la misma disciplina desde el día 1.
7. **Multi-estudio (plan CADENA).** El fix reciente de multi-estudio funciona por `studio_id` activo; el Decision OS hereda ese aislamiento sin trabajo extra, pero el resumen "de cadena" (agregado) queda explícitamente fuera del MVP.
8. **Regresiones.** Riesgo bajo por diseño: módulo nuevo (`lib/decision/`), tablas nuevas, página nueva, cero modificaciones a motores existentes. El único punto compartido (sidebar + redirect de Home) es de una línea y reversible.

---

## 11. PROBLEMAS TÉCNICOS DETECTADOS

1. **No existe bus de eventos de dominio.** La Bible exige "todo por eventos, nunca procesos nocturnos" — hoy hay exactamente lo contrario (crons + feed `actividad_reciente`). Resolución en §12.3.
2. **Los KPIs viven en el cliente** (useMemos de informes, chart-engine). El Decision OS necesita esas mismas fórmulas en servidor. Al ser funciones puras, se **extraen a módulo compartido** sin cambiar Analytics (que seguirá renderizando idéntico).
3. **No hay patrón repositorio** — `supabase-data.ts` es un módulo plano de 3.084 líneas. No lo refactorizo (regla: cero refactors gigantes): el Decision OS define su propio puerto de lectura (`SnapshotEstudio`) que internamente llama a los fetchers existentes.
4. **`automation_logs` como cola de aprobación no escala semánticamente**: mezcla logs de ejecución con recomendaciones pendientes. Por eso `recomendaciones` es tabla propia; los logs siguen siendo logs.
5. **Sin atribución de resultados** (§5.5): imposible calibrar confianza numérica hoy. Determina el diseño del Confidence Engine (§12.2).
6. **`usuarios` es tabla legacy** paralela a `instructores` — el Decision OS solo usará `instructores`, evitando propagar la duplicidad.

---

## 12. QUÉ CAMBIARÍA DEL DISEÑO PROPUESTO (con justificación objetiva)

Cuestiono 6 puntos de la Bible. En cada uno: qué dice, por qué no lo seguiría literalmente, qué propongo.

### 12.1 Los colores/tipografía de los documentos 4–5 contradicen el Design System real (y el propio mockup)
- **Dice:** fondo `#FAFAFA`/`#F8F9FB`, texto `#111111`/`#121212`, tipografía Inter o Geist (los dos documentos ni siquiera coinciden entre sí).
- **Realidad:** Tentare usa crema `#EEEEE8`, texto `#1A1A1A`, brand rosa `#FFC8E2`, Plus Jakarta Sans, radius 1rem. **El mockup adjunto usa el DS real** (crema + rosa), no los hex de los documentos.
- **Propuesta:** el mockup y tu regla ("mantener identidad visual") ganan. Los documentos 4–5 se interpretan como *dirección* (calma, aire, jerarquía), no como valores literales. Cero tokens nuevos.

### 12.2 Porcentajes de confianza ("91%") sin datos que los respalden violan la propia Bible
- **Dice:** cada recomendación muestra confianza numérica (91%, 89%…) y el umbral >95% permite automatizar.
- **Problema objetivo:** la Bible también dice "nunca inventará datos" y "la IA nunca puede fingir certeza". Sin historial de outcomes (§5.5), un "91%" sería exactamente eso: un número inventado — caja negra disfrazada de precisión. Es la contradicción interna más seria de los documentos.
- **Propuesta:** MVP muestra confianza como **nivel con evidencia** ("Confianza alta — basada en 21 días sin venir + renovación en 5 días"), mapeada a los umbrales de la Bible: ALTA≈>85 (ejecutable con aprobación), MEDIA≈70–85 (recomendar), BAJA = solo informa (autonomía 0, nunca entra en Prioridades — el equivalente honesto del "<70% nunca recomendar"); por debajo del suelo de emisión de cada tipo, la candidata directamente no se genera. Cuando `recomendacion_outcomes` acumule muestra suficiente por tipo de recomendación (≥30 casos), se activan porcentajes **calibrados con datos reales del estudio**. Así el "91%" del futuro será verdad.

### 12.3 "Todo por eventos, nunca procesos programados" es técnicamente imposible para la mitad de las señales
- **Dice:** arquitectura event-driven pura, "no mediante procesos nocturnos".
- **Problema objetivo:** las señales más valiosas del producto son **ausencias de eventos**: "lleva 24 días sin venir", "franja llena 3 semanas seguidas", "renovación vence en 9 días". Ningún evento se emite cuando alguien *no* hace algo — detectar ausencias exige un reloj. Un event-sourcing completo además implicaría reescribir medio SaaS (prohibido por tus reglas).
- **Propuesta híbrida:** análisis programado 2×/día (patrón Inngest ya probado) para patrones temporales + **eventos reactivos quirúrgicos** para lo urgente (PaymentFailed, ReservationCancelled, WaitlistJoined) que disparan re-análisis inmediato del estudio. El usuario percibe tiempo real donde importa; el sistema sigue siendo simple y durable.

### 12.4 El sidebar propuesto en el Doc 5 reorganiza la navegación — prohibido por tus propias reglas
- **Dice (Doc 5 §16):** sidebar con 7 items (Centro de Control, Mi Equipo, Agenda, Clientes, Facturación, Analytics, Configuración).
- **Problema:** el SaaS tiene hoy ~20 rutas funcionando (POS, citas, ondemand, comunidad, mensajería…) organizadas en secciones, y tu instrucción es NO tocar navegación ni layout.
- **Propuesta:** se añade **un único item "Centro de Control"** al principio de `navSections` (+ `ESSENTIAL_HREFS` + barra móvil), y el redirect de `/` apunta al Centro de Control para propietarios con la feature activa (con fallback a `/dashboard` intacto). Nada más se mueve. "Mi Equipo" (especialistas) vive **dentro** del Centro de Control como sección, no como ruta — evita además la colisión de nombre con la página existente `/equipo` (staff real). Si más adelante quieres ruta propia, es una decisión de producto separada.

### 12.5 Eventos y capacidades que la Bible asume y no existen (reseñas, WhatsApp, festivos)
- **Dice:** "Nueva reseña" como evento, WhatsApps enviados por especialistas, festivos en Agenda.
- **Problema:** nada de eso existe en el SaaS (verificado en esquema y código, §5).
- **Propuesta:** MVP honesto — email automático + textos listos para copiar a WhatsApp + recomendación de llamada. Reseñas y WhatsApp Business API se tratan como integraciones futuras con su propio análisis. Nunca se simula un canal que no existe (la Bible misma lo exige: "nunca inventará datos").

### 12.6 "El Director genera el resumen cada mañana" — mejor materializado que en vivo
- **Dice:** el Director consulta a los especialistas cuando el usuario entra.
- **Problema objetivo:** generar el resumen on-demand acopla la latencia de la Home al pipeline completo (y a Anthropic). La Home debe abrir en <1s para cumplir el objetivo de "entender el estado en 30 segundos".
- **Propuesta:** el resumen se **materializa** en `resumen_diario` al terminar cada análisis; el Centro de Control lo lee de tabla (instantáneo) y muestra hora de generación ("actualizado a las 06:31"). El botón de re-análisis manual existe para quien quiera frescura inmediata.

---

## RESUMEN EJECUTIVO PARA MARCO

- El SaaS ya contiene el 40% del Decision OS en producción (motor determinista, cola durable, aprobación humana, IA explicable). No partimos de cero: **generalizamos un patrón probado**.
- El MVP correcto es el de la propia Bible: **Retención + Ingresos + Director + Centro de Control**, con email como único canal automático.
- Los dos cambios que propongo con más convicción: **confianza por niveles con evidencia hasta poder calibrar porcentajes reales** (12.2) y **arquitectura híbrida programado+reactivo en vez de event-driven puro** (12.3).
- Riesgo de regresión: mínimo por construcción — módulo nuevo, tablas nuevas, una página nueva, un item de menú.

**Siguiente paso (Fase 2):** diseño de arquitectura detallado — contratos TypeScript de cada motor, esquema SQL definitivo, pipeline Inngest, y especificación pantalla a pantalla del Centro de Control. No se escribe código de producción hasta que apruebes este análisis.
