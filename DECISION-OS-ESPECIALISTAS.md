# TENTARE DECISION OS — LOS ESPECIALISTAS (FASE 4)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Prerrequisitos:** Fases 1–3 aprobadas. Los tipos, motores y fórmulas referenciados están definidos en [DECISION-OS-NUCLEO.md](DECISION-OS-NUCLEO.md).

> El equipo digital de Tentare. Cada especialista: pregunta única, inputs, reglas de detección numeradas (umbral por umbral), impacto con fórmula, memoria, KPIs, límites y voz.
> **Retención, Ingresos y Director** están al nivel de detalle de implementación (MVP). Los otros cuatro quedan especificados para sus fases, con sus reglas principales ya diseñadas.
>
> Ley común (Fase 3 §2): solo su pregunta · candidatas completas o silencio · el texto del motor siempre es válido sin IA.

---

> El gate de datos formal para cada especialista (obligatorio/opcional, ¿existe?) está en [DECISION-OS-MODELO-DATOS.md](DECISION-OS-MODELO-DATOS.md) §0 — Retención e Ingresos (MVP) ya lo pasan al 100% de obligatorios.

## ÍNDICE DEL EQUIPO

| # | Especialista | Pregunta única | KPI (Bible) | Fase |
|---|---|---|---|---|
| 0 | **Director del Estudio** | ¿Qué necesita atención hoy? | Entender el estado en <30s | **MVP** |
| 1 | **Retención** 👥 | ¿Quién corre riesgo de abandonar? | Cancelaciones evitadas | **MVP** |
| 2 | **Ingresos** 💰 | ¿Dónde estamos dejando dinero? | Ingresos adicionales generados | **MVP** |
| 3 | **Finanzas** 💳 | ¿Qué dinero corre peligro? | Cobros recuperados | F2 |
| 4 | **Agenda** 📅 | ¿Cómo optimizo el calendario? | Ocupación media | F2 |
| 5 | **Marketing** 📣 | ¿Quién debería recibir qué mensaje? | Conversión de campañas | F2 |
| 6 | **Equipo** 👨‍🏫 | ¿Cómo está funcionando el equipo? | Ocupación + retención por instructor | F3 |

---

# 1. ESPECIALISTA EN RETENCIÓN (MVP)

**Objetivo:** reducir cancelaciones, aumentar permanencia y LTV.
**Nunca hará (Bible):** cancelar nada, dar descuentos sin aprobación, enviar spam, contactar a quien la memoria vete.

## 1.1 Inputs

Señales (Fase 3 §1): `frecuenciaHabitual`, `diasSinVenir`, `ausenciaAnomala`, `renovacionProxima`, `valorMensual`, `emailsSinRespuesta`. Tablas: socios (activos), reservas 180d, suscripciones, automation_logs 90d (contactos previos), memoria_socio.

**Elegibilidad global:** socia `activo=true`, con suscripción ACTIVA o bono con sesiones restantes, antigüedad ≥30d. Excluidas: bajas, congeladas, y las vetadas por memoria.

**Riesgo:** todas las reglas de Retención emiten `riesgo = PERDIDA` (una socia en juego siempre es pérdida potencial — gate de CRITICA, Núcleo §7.3).

## 1.2 Reglas de detección

### R1 · Ausencia anómala temprana → `RECUPERAR_SOCIA`
```
CONDICIÓN   ausenciaAnomala(socia) = true
            Y diasSinVenir < umbralCritico(socia)          // aún hay margen
            Y sin contacto (log o recomendación) en 14d
            donde umbralCritico = max(28, 2 × umbralAnomalo(socia))
ACCIÓN      CONTACTO_MANUAL (canal por memoria; default WHATSAPP con texto sugerido)
IMPACTO     valorMensual(socia) EUR_MES — formula: "cuota mensual de {nombre} ({X}€/mes) en riesgo"
URGENCIA    min(1, (diasSinVenir − umbralAnomalo) / umbralAnomalo)   // crece al alejarse del patrón
ESFUERZO    0.2 (un mensaje) · TIEMPO 2 min
AUTONOMÍA   1 (recomendar; el envío es manual)   · EXPIRA 10d · COOLDOWN 21d/socia
DATOS       {nombre, diasSinVenir, frecuenciaHabitual, ultimaClase, valorMensual}
MOTOR       "Noto a {nombre} viniendo menos de lo habitual" /
            "Venía {frec}×/semana y lleva {dias} días sin aparecer. Todavía estás a tiempo."
```

### R2 · Riesgo crítico con renovación cerca → `ENVIAR_REACTIVACION`
```
CONDICIÓN   diasSinVenir ≥ umbralCritico(socia)
            Y renovacionProxima ∈ (0, 21d]
            Y emailsSinRespuesta(socia) < 3                 // si no, memoria ya lo convierte en contacto manual
            Y sin oferta previa en 30d
ACCIÓN      ENVIAR_EMAIL plantilla REACTIVACION, descuentoPct de la regla del estudio (default 15)
IMPACTO     valorMensual EUR_MES — formula: "renovación de {nombre} ({X}€/mes) vence en {d} días"
URGENCIA    1 − renovacionProxima/21
ESFUERZO    0.1 · TIEMPO 1 min (solo aprobar)
AUTONOMÍA   2 (efecto directo tras aprobación) · EXPIRA min(10d, renovación) · COOLDOWN 30d/socia
MOTOR       "¿Le ofrecemos una vuelta con descuento a {nombre}?" /
            "Lleva {dias} días sin venir y su renovación vence en {d} días. Puedo enviarle
             una oferta del {pct}% — la apruebas tú."
```

### R3 · Renovación inminente con enganche cayendo → `RECUPERAR_SOCIA` (urgente)
```
CONDICIÓN   renovacionProxima ∈ (0, 7d]
            Y frecuencia últimas 4 semanas < 0.5 × frecuenciaHabitual
            Y frecuenciaHabitual válida
ACCIÓN      CONTACTO_MANUAL canal LLAMADA (una renovación en duda se salva hablando)
IMPACTO     valorMensual EUR_MES — formula: "renovación de {nombre} en {d} días"
URGENCIA    1.0 · ESFUERZO 0.4 · TIEMPO 5 min
AUTONOMÍA   1 · EXPIRA en la fecha de renovación · COOLDOWN 21d/socia
RIESGO      PERDIDA (como todas las de Retención) → candidata natural a CRITICA
MOTOR       "Llamaría hoy a {nombre}" /
            "Renueva en {d} días y este mes ha venido la mitad de lo habitual.
             Una llamada a tiempo suele marcar la diferencia."
```

### R4 · Desenganche por no-shows → `RECUPERAR_SOCIA`
```
CONDICIÓN   ≥3 reservas NO_ASISTIO en 30d Y ratio noShow30d ≥ 40% de sus reservas
ACCIÓN      CONTACTO_MANUAL (pregunta abierta: horario, lesión, motivación)
IMPACTO     valorMensual EUR_MES — formula: "cuota de {nombre}; reserva pero no viene"
URGENCIA    0.6 · ESFUERZO 0.2 · TIEMPO 2 min · AUTONOMÍA 1 · EXPIRA 10d · COOLDOWN 21d
MOTOR       "{nombre} reserva pero no está viniendo" /
            "Ha faltado a {n} de sus últimas {m} reservas. Algo pasa — yo le preguntaría."
```

### R5 · Alternativa a la pérdida → `CONGELAR_MEMBRESIA` — **FASE E**
*(La señal estacional exige ≥13 meses de reservas y la ventana del snapshot MVP es 180d — Núcleo §1. Se activa en Fase E con ventana extendida solo para esta señal.)*
```
CONDICIÓN   R2 aplicable Y antigüedad ≥ 180d Y patrón estacional detectado
            (ausencia similar mismo mes año anterior — requiere ventana 13 meses)
            O memoria NO_OFRECER_DESCUENTOS
ACCIÓN      CONTACTO_MANUAL con propuesta de pausa (la congelación se ejecuta en /socios como hoy)
IMPACTO     0.5 × valorMensual EUR_MES — formula: "congelar retiene el 50% del valor frente a perderla"
URGENCIA    como R2 · ESFUERZO 0.3 · AUTONOMÍA 1 · COOLDOWN 30d
MEMORIA     escribe patrón estacional: NO_CONTACTAR_HASTA fin de temporada (origen REGLA,
            evidencia "veranos 2025 y 2026 sin actividad — vuelve sola en septiembre")
```

**Prioridad interna si varias reglas aplican a la misma socia:** R3 > R2 > R5 > R1 > R4 (una sola candidata por socia sale del especialista; el resto, contexto). MVP = R1–R4; R5 se incorpora al orden desde Fase E.

## 1.3 Memoria — lee: todas las claves de contacto. Escribe: `NO_CONTACTAR_HASTA` (estacional, R5), `NUNCA_RESPONDE_EMAIL` (vía regla global de señales).

## 1.4 KPI (tarjeta y detalle)
- **Cancelaciones evitadas** = socias con recomendación EJECUTADA outcome POSITIVO (señal RESERVO/RENOVO) que estaban en riesgo — con su € acumulado.
- Tarjeta Home: "{n} socias necesitan atención · +{X}€/mes en juego · [Revisar]".

---

# 2. ESPECIALISTA EN INGRESOS (MVP)

**Objetivo:** encontrar dinero oculto. No genera informes — genera oportunidades.
**Nunca hará:** subir precios por su cuenta, prometer ingresos no derivables de datos, contar dos veces el mismo euro (los pagos pendientes de socias en riesgo de retención se coordinan vía Director §4 F3).

**Riesgo por regla:** I1 emite `riesgo = OPORTUNIDAD` (nada se pierde si no se actúa hoy); I2 emite `riesgo = PERDIDA` (dinero ya devengado en juego).

## 2.1 Inputs
`ocupacionFranja`, `demandaInsatisfecha`, `pagosEnRiesgo`, `valorMensual` agregado; sesiones ±90d, reservas 180d, recibos, planes_tarifa, tipos_clase, salas (aforo).

## 2.2 Reglas de detección

### I1 · Demanda desbordada → `ABRIR_SESION`
```
CONDICIÓN   franja recurrente (dow+hora+tipo) con ocupación ≥95% en ≥3 ocurrencias seguidas
            Y (demandaInsatisfecha ≥ 2 O ocupación media 5 sem = 100%)
            Y existe capacidad física (sala libre en franja adyacente ±1h O hueco de instructor)
IMPACTO     EUR_MES = plazasEstimadas × precioMedioSesion × 4.33
            · plazasEstimadas = min(demandaInsatisfecha media, aforo del tipo)
            · precioMedioSesion = media ponderada por socias activas:
                MENSUAL → precio / (frecuenciaHabitual × 4.33) · BONO → precio/sesiones · PUNTUAL → precio
            · formula: "{p} plazas × {€}/sesión × 4.33 semanas (lista de espera de {n} las últimas {s} semanas)"
ACCIÓN      MARCAR_GESTIONADO (nivel 0/1: la creación de la clase se hace en /calendario, un clic desde la tarjeta)
URGENCIA    0.5 + 0.1 × semanasConsecutivas (cap 0.9) · ESFUERZO 0.5 · TIEMPO 10 min
AUTONOMÍA   1 · EXPIRA 21d · COOLDOWN 14d/franja
MOTOR       "Tu clase del {dia} a las {hora} se llena sola" /
            "Llevas {s} semanas con gente en lista de espera. Si abrimos una segunda
             sesión, creo que también se llenaría. Serían unos +{X}€/mes."
```
*(El texto motor de I1 es literalmente el del mockup — es la referencia de tono.)*

### I2 · Dinero parado con tarjeta guardada → `RECUPERAR_PAGOS`
```
CONDICIÓN   ≥1 recibo PENDIENTE vencido ≤30d de socias activas CON tarjeta guardada
            (los >30d o sin tarjeta son de Finanzas en F2; en MVP entran aquí degradados a email)
LOTE        una sola candidata agregada — nunca N tarjetas de pagos (regla anti-ruido)
IMPACTO     EUR one-off = Σ importes — formula: "{n} recibos pendientes: {desglose}"
ACCIÓN      COBRAR_RECIBOS {reciboIds} (off-session existente)
URGENCIA    min(1, 0.4 + 0.05 × diasMedioVencido) · ESFUERZO 0.05 · TIEMPO 1 min
AUTONOMÍA   2 · EXPIRA 7d · COOLDOWN 3d
RIESGO      PERDIDA
MOTOR       "Se quedaron {n} pagos sin completar" /
            "Nada raro, cosas de tarjetas. Los tengo listos para reintentar —
             son {X}€ que deberían estar en tu cuenta."
```

### I3 · Bonos agotándose sin recompra (F2) → `PROPONER_RENOVACION_BONO`
Bono con ≤2 sesiones restantes + frecuencia estable → email de renovación con un clic (`ENVIAR_EMAIL` plantilla `RENOVACION_BONO`). Impacto = precio del bono. Autonomía 2. *(Este tipo y los siguientes se añaden al catálogo único de Arquitectura §3.)*

### I4 · Precio fuera de mercado interno (F2, evidencia exigente) → `REVISAR_PRECIO`
Tipo de clase con ocupación ≥90% sostenida 8 semanas + lista de espera + precio < percentil 25 del propio estudio → *sugiere revisar* (nivel 0, informativo; nunca "sube el precio" — decisión estratégica del propietario con contexto).

## 2.3 KPI — **Ingresos adicionales**: Σ € de EJECUTADAS con outcome POSITIVO (pagos cobrados reales + estimación declarada de sesiones abiertas). Tarjeta: "{n} oportunidades · +{X}€/mes · [Revisar]".

---

# 3. ESPECIALISTA FINANCIERO (F2)

**Pregunta:** ¿qué dinero corre peligro? **KPI:** cobros recuperados. **Nunca:** cobrar sin autorización cuando ley o método no lo permitan.

Reglas diseñadas: **F1** devoluciones (`recibos DEVUELTO` → contacto + reintento con aprobación) · **F2** deuda envejecida >30d (plan de contacto escalonado: email→llamada; nunca amenazante) · **F3** renovación próxima sin método de pago guardado → pedir tarjeta antes del vencimiento (previene el pago fallido en vez de perseguirlo) · **F4** resumen de caja en peligro para el Director (nivel 0): Σ pendiente + Σ en riesgo 30d. Al activarse Finanzas, I2 le transfiere los casos >30d/sin tarjeta (frontera declarada en §2.2).

# 4. ESPECIALISTA EN AGENDA (F2)

**Pregunta:** ¿cómo optimizo el calendario? **KPI:** ocupación media. **Nunca:** cambiar horarios automáticamente (siempre nivel ≤1).

Reglas diseñadas: **A1** franja fría (ocupación <40% en ≥4 ocurrencias → `MOVER_HORARIO` con franja candidata basada en demanda observada, o `FUSIONAR_SESIONES` si hay franja hermana <60%) · **A2** hueco de oro (lista de espera recurrente en franja X + sala/instructor libres ±1h → propuesta concreta con impacto) · **A3** cancelaciones de última hora concentradas (franja con >25% cancelaciones <24h → proponer recordatorio extra o cambio) · **A4** cobertura (instructor con sesión y ausencia registrada → proponer sustituto por historial de esa clase). Coordinación: colisiones de franja con Ingresos se resuelven por Director (Fase 3 §4).

# 5. ESPECIALISTA EN MARKETING (F2)

**Pregunta:** ¿quién debería recibir qué mensaje? **KPI:** conversión. **Nunca:** enviar nada automáticamente; campañas masivas indiscriminadas.

Reglas diseñadas: **M1** inactivas recuperables (30–90d sin venir, SIN riesgo de retención activo — frontera con Retención: si hay candidata de Retención viva sobre la socia, Marketing la excluye) → `PREPARAR_CAMPANA` con audiencia + borrador (reutiliza el asistente IA de campañas existente; queda en `/marketing` como borrador, autonomía 1) · **M2** leads fríos (`lead_stage` estancado ≥14d → secuencia de bienvenida) · **M3** repetir lo que funciona (campaña previa con conversión >X% sobre segmento renovado → proponer reedición). Impacto: audiencia × tasa de conversión histórica del estudio × valorMensual medio — siempre con formula visible.

# 6. ESPECIALISTA EN EQUIPO (F3)

**Pregunta:** ¿cómo está funcionando el equipo? **KPI proxy** (sin valoraciones — gap declarado en Análisis §5): ocupación media de sus clases + retención de sus alumnas habituales. **Nunca:** tocar contratos ni comparar públicamente instructores.

Reglas diseñadas: **E1** desequilibrio de carga (instructor >45% de las sesiones semanales → riesgo de dependencia/burnout, nivel 0) · **E2** imán de retención (las alumnas habituales de X renuevan +N% sobre la media → reconocimiento + más franjas suyas, nivel 0) · **E3** sustituciones repetidas (≥3 en 30d del mismo instructor → conversación, nivel 0). Requiere: horas contratadas (dato faltante, se pedirá en configuración al activar F3).

---

# 7. EL DIRECTOR DEL ESTUDIO (MVP)

No detecta: **prioriza, coordina y resume** (algoritmos en Fase 3 §4 y §8). Aquí, su voz.

## 7.1 Plantillas deterministas del saludo (fallback sin IA)

Por `(momentoDía × estadoGeneral)`, parametrizadas con `{nombre, nDecisiones, tiempoEstimadoMin}`:

| Estado | Plantilla (mañana) |
|---|---|
| EXCELENTE, 0 decisiones | "Buenos días, {nombre}. Todo está en orden — hoy no necesito nada de ti." |
| EXCELENTE, n>0 | "Buenos días, {nombre}. Hoy está todo bastante tranquilo. Solo hay {n} cosas en las que quiero tu opinión." |
| ATENCION | "Buenos días, {nombre}. Hay {n} cosas que me gustaría que vieras hoy — te llevará unos {min} minutos." |
| ACCION_INMEDIATA | "Buenos días, {nombre}. Hay algo que no puede esperar: empieza por la primera tarjeta." |

(Variantes tarde/noche solo cambian el saludo inicial. Prohibido: "¡Genial!", "¡Perfecto!", alarmismo, emojis fuera del 👋 del header.)

## 7.2 "Mientras dormías" — plantillas por fuente (Fase 3 §8.3)

- Pagos: "Reintenté {n} pagos que se habían quedado a medias — cosas de tarjetas. Cobrados: {X}€."
- Contactos: "Escribí a {n} alumnas que llevaban unos días dudando." (+ " {m} han vuelto a reservar." solo con vínculo temporal verificado)
- Lista de espera *(Fase E — ver Núcleo §8.3: hoy la promoción no deja rastro consultable)*: "Se liberó una plaza en {clase} y avisé a la primera de la lista. Ya está dentro."
- Cierre: "Con eso, el día ya está encaminado. Solo necesito que decidas {n} cosas — te llevará unos minutos."

---

# 8. REDACCIÓN — PROMPTS FINALES (`redaccion.ts`)

## 8.1 System prompt (compartido, definitivo)

```
Eres el equipo de especialistas de Tentare que trabaja para {nombrePropietario}, propietaria/o
del estudio {nombreEstudio}. Cada elemento que recibes fue detectado por un especialista
(RETENCION, INGRESOS, FINANZAS, AGENDA, MARKETING, EQUIPO) a partir de datos reales del negocio.

Tu único trabajo es REDACTAR en español de España el título y el motivo de cada recomendación,
y el saludo del día. Los hechos ya están calculados — tú solo les pones palabras.

VOZ: primera persona del especialista, como un empleado de confianza que lleva años en el
estudio. Cercano y profesional. Frases cortas. Directo pero cálido. Nunca infantil, nunca
alarmista, nunca comercial. Ejemplos del tono correcto:
- "Noto a Laura a punto de irse. Yo le escribiría hoy — todavía estás a tiempo."
- "Tu clase del martes a las 19h se llena sola. Si abrimos una segunda sesión, creo que
   también se llenaría."
- "Se quedaron 2 pagos sin completar esta mañana. Nada raro, cosas de tarjetas."

REGLAS ABSOLUTAS:
1. PROHIBIDO escribir números, fechas, importes o porcentajes que no estén en datosUsados.
2. PROHIBIDO prometer resultados ("volverá", "se llenará seguro"). Usa "creo que", "suele".
3. PROHIBIDO exagerar logros o dramatizar problemas.
4. Título ≤ 80 caracteres, sin punto final. Motivo ≤ 240 caracteres, 1–3 frases.
5. Sin emojis, sin mayúsculas de énfasis, sin jerga técnica ni anglicismos.
6. Trata a las socias por su nombre de pila. Habla del negocio como "tu estudio".

Responde SOLO con JSON válido:
{"saludo": "string", "items": [{"id": "string", "titulo": "string", "motivo": "string"}]}
```

## 8.2 Few-shots (2 por especialista MVP, en el user prompt)

```
[RETENCION · RECUPERAR_SOCIA · {nombre:"Laura", diasSinVenir:18, frecuenciaHabitual:3, valorMensual:89}]
→ {"titulo": "Noto a Laura a punto de irse — yo le escribiría hoy",
   "motivo": "Venía 3 veces por semana y lleva 18 días sin aparecer. Todavía estás a tiempo."}

[INGRESOS · RECUPERAR_PAGOS · {n:2, total:180, diasMedio:3}]
→ {"titulo": "Se quedaron 2 pagos sin completar",
   "motivo": "Nada raro, cosas de tarjetas. Los tengo listos para reintentar — son 180 €
              que deberían estar en tu cuenta."}
```

(El set completo — 2 por tipo MVP + 4 saludos — se congela en fixtures de test: cambiar un prompt exige actualizar el fixture, así el tono queda bajo control de versiones.)

## 8.3 Presupuesto

≤10 items × ~120 tokens + saludo → ~1.6k in / 0.8k out por análisis. Haiku: <0,01 €/estudio/día. Sin cambios en `datos_usados` → cache, 0 tokens (Fase 3 §10).

---

# 9. RESUMEN DE FRONTERAS (quién NO hace qué)

| Colisión potencial | Regla de frontera |
|---|---|
| Socia inactiva: ¿Retención o Marketing? | Riesgo individual activo → Retención. Segmento 30–90d sin riesgo → Marketing (M1 excluye candidatas vivas de Retención) |
| Pago pendiente: ¿Ingresos o Finanzas? | MVP: todo en Ingresos (I2). Con Finanzas activa: ≤30d+tarjeta → Ingresos; resto → Finanzas |
| Franja llena: ¿Ingresos o Agenda? | Abrir/monetizar → Ingresos. Mover/fusionar/cubrir → Agenda. Colisión de franja → Director fusiona |
| Misma socia, 2 especialistas | Director: mayor score gana, resto = contexto (Fase 3 §4) |

# 10. TESTS ESPECÍFICOS DE ESTA FASE (se añaden al mapa de Fase 3 §11)

- Cada regla R1–R5, I1–I2: caso que dispara, caso frontera que NO dispara, y datosUsados exactos.
- Prioridad interna de Retención (R3>R2>R5>R1>R4) con socia que cumple varias.
- I2 agrega en UNA candidata (nunca N tarjetas).
- Fronteras §9 (fixtures con colisiones).
- Fixture "mockup": snapshot que reproduce la captura (Laura+Marta, martes 19h, 2 pagos 180€) → tras caps, Prioridades = las 3 de mayor score (Laura · abrir sesión · pagos); Marta contada en la tarjeta de Retención. Títulos/motivos del motor equivalentes a los de la imagen (una tarjeta por socia — el motor nunca agrupa dos socias en una recomendación).
- Golden tests de prompts: few-shots congelados.

---

**Siguiente paso (Fase 7):** inventario funcional completo — existente vs nuevo, qué se reutiliza/amplía, dependencias y migraciones. (La Fase 6 — Analytics intocable — quedó garantizada por construcción: nada del Decision OS escribe ni modifica ese módulo; Analytics consumirá las métricas nuevas leyendo `recomendaciones`/`recomendacion_outcomes` cuando exista masa de datos.)
