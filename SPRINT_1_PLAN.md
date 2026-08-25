# SPRINT 1 — SUPABASE SELECT * OPTIMIZATION

**Objetivo:** Reducir ancho de banda en queries SELECT * críticas  
**Impacto esperado:** 5-15% reducción en latencia/BW  
**Esfuerzo:** 1-2 semanas  
**Riesgo:** BAJO

---

## 📍 UBICACIONES CRÍTICAS

### 1. `cargarEstudioCompleto()` — lib/supabase-data.ts:4503-4570

**Llamadas frecuentes:** Cada vez que el usuario abre el dashboard  
**Consultas:** ~30 tablas en paralelo

**Tablas con SELECT * (sin optimizar):**
```
- studios (4503)
- studio_horario (4504)
- usuarios (4505)
- planes_tarifa (4513)
- salas (4515)
- spots (4516)
- tipos_clase (4517)
- instructores (4518)
- productos_pos (4527)
- campanas (4529)
- automatizaciones (4530)
- automation_rules (4531)
- automation_logs (4536)
- codigos_descuento (4537)
- actividad_reciente (4540)
- notificaciones (4541)
- videos_on_demand (4542)
- posts_comunidad (4543)
- notas_internas (4544)
- condiciones_salud (4545)
- respuestas_sesion (4546)
- mensajes_equipo (4558)
- reward_rules (4559)
- reward_actions (4560)
- member_credits (4561)
- reward_catalog (4562)
- reward_redemptions (4563)
- achievement_definitions (4564)
- achievement_progress (4565)
- level_definitions (4566)
- challenge_definitions (4567)
- challenge_progress (4568)
- dashboard_charts (4569)
```

**Ya optimizadas (columnas explícitas):**
- socios (4512) ✅
- suscripciones (4514) ✅
- sesiones (4519) ✅
- reservas (4520) ✅
- recibos (4521) ✅
- facturas (4522) ✅
- citas (4526) 🟡 Revisar
- integraciones (4551) ✅

---

## 🎯 PLAN DE ACCIÓN

### Fase 1: Auditar columnas necesarias (1-2 días)

Para cada tabla con SELECT *, determinar:
1. ¿Qué columnas se usan en la UI?
2. ¿Qué columnas se pasan a mappers?
3. ¿Qué columnas NO se usan nunca?

Ejemplo (`studios`):
```typescript
// ACTUALMENTE (todas las columnas):
- id, nombre, razon_social, nif, direccion, ciudad, codigo_postal, email,
- cancelacion_ventana_horas, penalizacion_importe_eur, penalizacion_cobro_automatico,
- stripe_account_id, suspendido_en, politica_privacidad, terminos_servicio,
- ... (30+ columnas)

// PROBABLEMENTE NECESARIAS:
- id, nombre, color_primario, logo_url, stripe_account_id,
- suspendido_en, pedir_confirmacion_riesgo, ...

// NO NECESARIAS EN ARRANQUE:
- token_whatsapp (solo en /integraciones/config)
- clave_kisi (solo en /integraciones/config)
- politica_privacidad, terminos_servicio (grandes blobs, en demanda)
```

### Fase 2: Cambios conservadores (1 semana)

**Empezar SOLO con tablas donde es obvio:**

1. **`studios`** → cambiar a columnas específicas
   - ❌ Quitar: tokens, claves, textos legales grandes
   
2. **`tipos_clase`** → cambiar a columnas específicas
   - ✅ Mantener: id, nombre, duracion_minutos, capacidad, color, etc.
   
3. **`salas`** → cambiar a columnas específicas
   - ✅ Mantener: id, nombre, capacidad, etc.
   
4. **`instructores`** → cambiar a columnas específicas
   - ✅ Mantener: id, nombre, avatar, activo, etc.

5. **Tablas de reward/achievement/challenge** → revisar si se usan en arranque
   - 🟡 Posiblemente quitar (lazy-load desde demanda)

### Fase 3: Testing & Verificación (3-5 días)

1. **Tests unitarios:**
   - Correr suite de tests existentes
   - Verificar que mappers reciben datos esperados

2. **E2E:**
   - Cargar dashboard (arranque panel)
   - Navegar por secciones principales
   - Verificar no hay errores en consola

3. **Performance:**
   - Medir antes/después con DevTools
   - Comparar tamaño de respuesta JSON
   - Verificar latencia de `cargarEstudioCompleto()`

---

## ⚠️ DECISIONES PENDIENTES

### 1. ¿Cambiar TODAS las tablas o SOLO las más críticas?

**Opción A (Conservadora):** Solo top 5 tablas críticas
- Riesgo: BAJO
- Impacto: 30-40% del potencial
- Tiempo: 1 semana

**Opción B (Agresiva):** Todas las SELECT *
- Riesgo: MEDIO (más cambios = más pruebas)
- Impacto: 100% del potencial
- Tiempo: 2 semanas

**Recomendación:** Empezar con Opción A (top 5), luego escalar a B si va bien.

### 2. ¿Lazy-load algunas secciones?

Tablas que podrían cargarse bajo demanda (no en arranque):
- reward_* (4559-4563)
- achievement_* (4564-4565)
- challenge_* (4566-4568)
- dashboard_charts (4569)
- videos_on_demand (4542)
- posts_comunidad (4543)

**Impacto:** -15-20% tiempo de arranque  
**Esfuerzo:** +3-5 días adicionales

---

## 📊 MÉTRICAS A MEDIR

**Antes:**
- [ ] Tamaño respuesta `cargarEstudioCompleto()` (KB)
- [ ] Latencia P95 (ms)
- [ ] Tiempo dashboard load completo (s)

**Después:**
- [ ] Tamaño respuesta (target: -30% a -50%)
- [ ] Latencia P95 (target: -10% a -20%)
- [ ] Tiempo dashboard load (target: -5% a -15%)

---

## ✅ CHECKLIST

- [ ] Auditar columnas necesarias por tabla
- [ ] Crear cambios fase 1 (top 5 tablas)
- [ ] Correr tests locales
- [ ] Verificar E2E en navegador
- [ ] Medir antes/después
- [ ] Crear PR con benchmark
- [ ] Code review
- [ ] Merge a `main`
- [ ] Monitor en producción por 24h
- [ ] Evaluar lazy-loading (fase 2)

---

## 🔄 NEXT STEPS

1. **Revisar este plan** — ¿Opción A o B?
2. **Listar columnas reales** — Necesito ayuda del usuario (o auditar el schema)
3. **Hacer cambios piloto** — Top 5 tablas
4. **Testing** — Verificar en local
5. **PR & Deploy**

