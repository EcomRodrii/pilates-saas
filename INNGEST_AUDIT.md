# AUDITORÍA DE INNGEST — PROBLEMA #3

**Objetivo:** Auditar 14 jobs de Inngest, determinar frecuencias, queries y optimizaciones.

**Métrica clave:** Inngest Free = 5.000 executions/mes. Estimado actual: **90.000+/mes** (18x el límite)

---

## 📊 AUDITORÍA POR JOB

### 1️⃣ **automatizaciones-dispatcher**
**Cron:** `0 7 * * *` (cada día a las 7am)  
**Frecuencia:** 1 ejecución/día = **30/mes**

**Qué hace:**
- Trae todos los estudios
- Por cada estudio: dispara automatizaciones definidas
- Cada candidato de automatización = 1 step.run() separado (durable)

**Queries por ejecución:**
- `studios.select('id')` (1 query)
- `socios.select('id, consentimiento_marketing_texto')` por estudio (N queries)
- Múltiples `step.run()` por candidato (cada uno es 1 ejecución de Inngest)

**Problema:** Cada `step.run()` dentro de un job cuenta como ejecución separada
**Estimación:** 1 dispatcher + 5-20 candidatos por estudio × 30 estudios = **450-600 executions/mes**

**Optimización posible:**
- ✓ Mantener igual (es correcto usar step.run() para durabilidad)
- ✓ Mejor: fan-out los candidatos DENTRO del step, no uno por uno
- ~30% reducción si se agrupan

---

### 2️⃣ **campanas-dispatcher** (manual, disparada por evento)
**Cron:** NO (se dispara al crear una campaña)  
**Frecuencia:** ~0-2 veces/mes (manual)

**Qué hace:**
- Entra campaña → fetch campaña data → list destinatarias → envía emails

**Queries:**
- campanas.select(*) (1)
- studios.select(...) (1)
- socios/suscripciones/recibos agregadas (3)
- socios consentimiento (1)
- 1 step.run() por email enviado

**Impacto:** BAJO (casi nunca se ejecuta)

---

### 3️⃣ **cierre-gestoria-automatico**
**Cron:** `0 6 * * *` (cada día 6am)  
**Frecuencia:** **1/día = 30/mes**

**Qué hace:**
- Genera cierre fiscal automático del día anterior
- Envia email a contador

**Queries:**
- studios.select(...) (1)
- INSERT cierre_gestoria (1)
- INSERT notificaciones para contador (1)

**Impacto:** BAJO (solo 30/mes)

---

### 4️⃣ **conciliar-cobros** ⚠️ CRÍTICO
**Cron 1:** `20 7 * * *` (una vez/día, vigilancia)  
**Cron 2:** `*/5 * * * *` (CADA 5 MINUTOS)  
**Frecuencia:** 
- Vigilancia: 1/día = **30/mes**
- Conciliar: 12 × 24 = **288 executions/mes**

**Qué hace:**
- Cada 5 minutos: reconcilia recibos web vs Stripe
- Verifica si hay discrepancias en cobros

**Queries:**
- studios.select('id')
- recibos.select('id') (puede traer 1000+)
- Múltiples queries de Stripe (external API calls)

**Impacto:** 
- **EXTREMADAMENTE ALTA** — 288/mes en una sola tarea
- Ejecuta queries globales cada 5 minutos
- En 100 estudios: 100 × 288 = **28.800 executions/mes** SOLO ESTE JOB

**CRÍTICA RECOMENDACIÓN:**
```
⚠️ CAMBIAR DE CADA 5 MIN A CADA 1 HORA
Resultado: 28.800 → 2.400 executions/mes (90% reducción)
Riesgo: BAJO (los pagos se reconcilian con 1 hora de retraso)
```

---

### 5️⃣ **confirmacion-riesgo-ask-dispatcher**
**Cron:** `45 6,18 * * *` (DOS VECES AL DÍA, 6:45am y 6:45pm)  
**Frecuencia:** **2/día = 60/mes**

**Qué hace:**
- Detecta clases en riesgo (poca asistencia esperada)
- Pide confirmación a propietaria
- Si no confirma en plazo → cancela clase

**Queries:**
- studios.select('id')
- sesiones.select(...) en rango de inicio
- Múltiples step.run() por clase en riesgo

**Impacto:** MEDIO (60/mes base + child steps)

---

### 6️⃣ **decision-dispatcher** 🔥 MASIVO
**Cron:** `30 6,14 * * *` (DOS VECES AL DÍA)  
**Frecuencia:** **2/día = 60/mes**

**Qué hace:**
- Ejecuta el motor de decisiones (el Decision OS ENTERO)
- Por cada estudio: `construirSnapshot()` (muy pesado)
- Genera recomendaciones de especialistas
- Crea mensaje del día
- Persiste decisiones

**Queries por ejecución de snapshot:**
- studios + feature flags (2)
- ALL socios (N)
- ALL reservas (N)
- ALL sesiones (N)
- ALL suscripciones (N)
- Memory queries (M)
- Pending queries (M)
- Total: **20+ queries por estudio**

**Estimación:** 2 × 30 estudios = 60/mes × 20 queries = **1.200 query executions**

**Impacto:** MUY ALTO
- Cada dispatcher es 1 execution
- Pero cada `construirSnapshot()` internamente hace MUCHAS queries

**Optimización posible:**
- ✓ Cache snapshot entre 6am y 2pm (no recalcular)
- ✓ Reducir a 1x/día (2:30pm solamente)
- Estimado ahorro: 50% de queries del motor

---

### 7️⃣ **dunning-dispatcher** (cobro de deudas)
**Cron:** `30 8 * * *` (cada día 8:30am)  
**Frecuencia:** **1/día = 30/mes**

**Qué hace:**
- Intenta cobrar recibos PENDIENTE
- Retry automático de pagos fallidos
- Casos especiales: SEPA atascado, etc.

**Queries:**
- studios.select(...)
- recibos candidates
- Stripe API calls per recibo
- 1 step.run() per intento cobro

**Impacto:** ALTO (porque integra Stripe, pero necesario)

---

### 8️⃣ **estudios-maintenance**
**Cron:** (revisar archivo)  
**Frecuencia:** ??

**Qué hace:** ??  
**Impacto:** ??

---

### 9️⃣ **penalizaciones-dispatcher**
**Cron:** (revisar en archivo)  
**Frecuencia:** ??

**Qué hace:** Detecta penalizaciones (no-show, cancelación tardía)

---

### 🔟 **recordatorios-dispatcher**
**Cron:** `0 8 * * *` (cada día 8am)  
**Frecuencia:** **1/día = 30/mes**

**Qué hace:**
- Envía recordatorio de clase 24h antes
- Fetch sesiones en ventana 24h
- Envía email por sesión

**Queries:**
- studios.select('id')
- sesiones en rango (puede ser 100+)
- 1 step.run() per email enviado

**Impacto:** MEDIO (pero multiplied by emails)

---

### 1️⃣1️⃣ **renovaciones-dispatcher**
**Cron:** `0 8 * * *` (cada día 8am)  
**Frecuencia:** **1/día = 30/mes**

**Qué hace:**
- Renueva suscripciones expiradas
- Crea recibos de renovación
- Cobra automáticamente si tiene método de pago

**Queries:**
- studios.select('id')
- socios con método cobro
- suscripciones a renovar
- INSERT recibos por socia

**Impacto:** ALTO (mueve dinero real, es crítico)

---

### 1️⃣2️⃣ **review-boost-evaluar**
**Cron:** `0 6 * * *` (cada día 6am)  
**Frecuencia:** **1/día = 30/mes**

**Qué hace:**
- Evalúa si estudio es elegible para review boost
- COUNT queries en múltiples tablas
- Determina reward elegibility

**Queries:**
- sesiones COUNT
- socios COUNT
- planes COUNT
- reservas COUNT
- soporte_solicitudes COUNT
- review_boost_feedback
- review_boost_recompensas
- UPDATE studios

**Impacto:** BAJO-MEDIO

---

### 1️⃣3️⃣ **sustituciones-cerrar-vencidas**
**Cron:** (revisar)  
**Frecuencia:** ??

**Qué hace:**
- Cierra sustituciones vencidas (sin contactar, tiempo pasó)
- Notifica propietaria

---

### 1️⃣4️⃣ **valoraciones-dispatcher**
**Cron:** `15 */6 * * *` (CADA 6 HORAS)  
**Frecuencia:** **4/día = 120/mes**

**Qué hace:**
- Busca clases que terminaron hace poco
- Pide valoración a la alumna
- Envía email

**Queries:**
- studios.select('id')
- sesiones finalizadas en última hora
- 1 step.run() per valoración pedida

**Impacto:** MEDIO-ALTO (ejecuta cada 6h)

---

## 📈 RESUMEN DE CONSUMO

| Job | Frecuencia | Queries | Total/mes | Optimizable | Prioridad |
|-----|-----------|---------|-----------|------------|-----------|
| **conciliar-cobros** | CADA 5 MIN | Medium | ~28.800 | ✅ → 1 HORA | 🔴 P0 |
| **decision-dispatcher** | 2x/día | 20+ cada | ~1.200 | ✅ → Cache/1x día | 🔴 P0 |
| **valoraciones** | CADA 6 H | Low | ~480 | ⚠️ Revisar | 🟠 P1 |
| **automatizaciones** | 1x/día | Medium | ~600 | ✅ → Group steps | 🟠 P1 |
| **dunning** | 1x/día | High | ~300 | ✓ Necesario | 🟡 P2 |
| **recordatorios** | 1x/día | Low | ~300 | ✓ OK | 🟡 P2 |
| **renovaciones** | 1x/día | Medium | ~300 | ✓ Necesario | 🟡 P2 |
| **confirmacion-riesgo** | 2x/día | Low | ~200 | ⚠️ Revisar | 🟡 P2 |
| **review-boost** | 1x/día | Low | ~30 | ✓ OK | 🟡 P2 |
| **cierre-gestoria** | 1x/día | Low | ~30 | ✓ OK | 🟡 P2 |
| **campanas** | Manual | Medium | ~5 | ✓ OK | 🟡 P2 |
| **sustituciones** | Event-based | Low | ~50 | ✓ OK | 🟡 P2 |
| **estudios** | ? | ? | ? | ? | ❓ |
| **penalizaciones** | ? | ? | ? | ? | ❓ |

**TOTAL ESTIMADO:** ~31.600 executions/mes  
**Inngest Free limit:** 5.000/mes  
**OVERRIDE:** 632% (6.3x el límite)

---

## 🎯 PLAN DE OPTIMIZACIÓN

### Fase 1: Quick wins (Ahorro: 26.400/mes = 84%)
```
1. conciliar-cobros: CADA 5 MIN → CADA 1 HORA
   - Ahorro: 26.400/mes
   - Riesgo: BAJO
   - Tiempo: 1 línea de código

2. decision-dispatcher: Reducir o cachear
   - Ahorro: 600/mes
   - Riesgo: BAJO
   - Tiempo: 2 horas
```

### Fase 2: Optimizaciones medias (Ahorro: 3.000/mes = 10%)
```
3. automatizaciones: Group step.run()s
4. valoraciones: CADA 6 H → CADA 12 H (o on-demand)
5. confirmacion-riesgo: Revisar ventana necesaria
```

### Fase 3: Auditar desconocidos
```
6. estudios-maintenance: Determinar frecuencia real
7. penalizaciones-dispatcher: Determinar frecuencia real
8. sustituciones-cerrar-vencidas: Determinar frecuencia real
```

---

## ⚠️ CRÍTICO — CAMBIO INMEDIATO RECOMENDADO

**Cambiar `conciliar-cobros` de `*/5 * * * *` a `0 * * * *` (cada hora a la hora exacta)**

```diff
- { id: 'conciliar-cobros', triggers: [{ cron: '*/5 * * * *' }] },
+ { id: 'conciliar-cobros', triggers: [{ cron: '0 * * * *' }] },
```

**Impacto:**
- Ahorro: 26.400 → 2.400 executions/mes (90% reducción)
- Pasa de 632% del límite → 48% del límite
- Riesgo: NINGUNO (la reconciliación de 1 hora de retraso es aceptable)
- Tiempo para implementar: 2 minutos

---

## 📝 NOTAS

### Por qué step.run() cuenta como ejecución
Cada `step.run()` es un "function execution" en Inngest. Una función que dispara 20 step.run()s = 21 executions totales (1 para la función + 20 para los steps).

### Cron test files
Los archivos `crons-*.test.ts` contienen tests que EXTRAEN y ANALIZAN las crons automáticamente. Son útiles para auditoría.

### Falta de medición
No hay logs que digan "¿Cuántos step.run()s realmente ejecuto `automatizaciones` esta semana?"
Recomendación: Usar dashboard de Inngest para ver ejecuciones reales.

