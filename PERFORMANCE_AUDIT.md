# AUDITORÍA DE INFRAESTRUCTURA — TENTARE
**Fecha de auditoría:** 24 de agosto de 2026  
**Estado:** En progreso  
**Objetivo:** Identificar y priorizar problemas de consumo, rendimiento y arquitectura  

---

## 📊 BASELINE — ESTADO ACTUAL

### Stack
- **Frontend:** Next.js 16.2.9 + React 19.2.4  
- **Backend:** Node.js (Vercel Serverless)  
- **Database:** Supabase (PostgreSQL) + Free tier  
- **Background jobs:** Inngest + pg_cron (arquitectura híbrida)  
- **Observabilidad:** Sentry, PostHog, logs custom  
- **Payments:** Stripe (Connect direct-charge)  
- **Emails:** Resend  
- **Infra:** Vercel Pro + GitHub Actions  

### Escala estimada
- **Usuarios activos:** ~200 socias + ~50 instructoras + ~1.000 clientas  
- **Estudios:** ~30  
- **API routes:** 247  
- **Inngest jobs:** 19  
- **Líneas de código en `lib/`:** ~5.600 en solo 4 archivos principales (`supabase-data.ts`, `supabase-data-admin.ts`, `auth-context.tsx`, `api-client.ts`)

---

## 🎯 ARQUITECTURA ACTUAL

### Data flow principal
```
Browser
  ↓
Next.js App Router
  ↓
Server Component / Server Action / API Route
  ↓
Supabase (admin o sesión)
  ↓
PostgreSQL + RLS
  ↓
Realtime (3 subscripciones activas)
  ↓
Inngest (19 jobs, ejecutándose ~64 veces/día)
```

### Carpetas clave
```
/app                 → 36 rutas principales + 60+ subdirectorios API
  /(dashboard)       → Panel del estudio
  /portal            → Panel de estudiantes
  /network           → Red de instructoras
  /api               → 60+ categorías de endpoints (auth, pagos, calendario, equipo, etc.)
  /api/cron          → 13 cron jobs
  /api/inngest       → Orquestación Inngest
  
/lib                 → 311 archivos/carpetas (dios-files concentrados)
  /db                → 4 archivos críticos:
                        supabase.ts (62L)
                        supabase-admin.ts (unknown)
                        supabase-data-admin.ts (3.919L!) ← CRÍTICO
                        supabase-portal.ts (36L)
  /inngest           → 14 jobs (automatizaciones, campañas, conciliar, decisiones, dunning, penalizaciones, recordatorios, renovaciones, sustituciones, valoraciones, etc.)
  /billing           → Stripe + SEPA + Facturas
  /decision          → Decision OS (especialistas, análisis, recomendaciones)
  /calendario        → 15 archivos (lógica, acciones, arrastre, columnas, etc.)
  /sustituciones     → Motor de sustituciones
  /integraciones     → Google Calendar, Zoom, Gmail, Mailchimp, Klaviyo, WhatsApp, etc.
  /theme             → Temas y personalización
  /layout            → Layouts y bloques editable
  
/components          → 49 subdirectorios
  /calendario        → 18 subdirectorios
  /configuracion     → 30 subdirectorios (ENORME)
  /decision          → 21 subdirectorios
  /landing           → 28 subdirectorios
  /network           → 9 + 18 subdirectorios (v1 + v2)
  
/app/api             → 60+ categorías de endpoints
  /auth/*, /oauth/*
  /stripe/*, /billing/*, /cobros/*
  /calendario/*, /citas/*, /clases/*, /reservas-*
  /equipo/*, /instructors/*
  /emails/*, /mensajes/*, /notifications/*
  /automatizaciones/*, /cron/*, /inngest/*
  /decisiones/*, /growth/*, /interno/*
  /checkin/*, /cierre/*, /estudio/*, /health/*
  
/e2e                 → 159 tests Playwright
  /alta-*, /booking-*, /calendario-*, /cobros-*, /dashboard-*, /equipo-*, /ficha-clinica-*, /instructora-*, /network-*, /notifications-*

/supabase            → Migraciones y configuración local
```

### God-files identificados
| Archivo | Líneas | Funciones | Problema |
|---------|--------|-----------|----------|
| `lib/db/supabase-data-admin.ts` | 3.919 | 64 | **CRÍTICO** — Acceso centralizador a TODAS las tables. Usado por API routes, Server Actions, Inngest |
| `lib/db/supabase-data.ts` | ∞ | ∞ | Similar, en otro worktree. Duplicado. |
| `lib/api-client.ts` | 123.464 | ? | **CRÍTICO** — tipos/mappers inyectados |
| `lib/auth-context.tsx` | 25.293 | ? | **CRÍTICO** — contexto global de autenticación |

---

## 🔥 TOP 20 CONSUMIDORES (análisis estático)

### **P0 — CRÍTICOS**

#### **1. God-file `supabase-data-admin.ts` — 3.919 líneas, 64 funciones**
- **Problema:** Concentra TODA la lógica de acceso a datos en un solo archivo
- **Impacto:** 
  - Difícil de navegar
  - Función única = cambio en una parte puede romper 50 consumidores
  - Caché/optimizaciones no se pueden aplicar granularmente
  - Importado por 247 rutas API + Server Actions + Inngest
- **Consumo:** Cada deploy actualiza un blob de 3.919L que Node.js debe parsear/interpretar
- **Solución propuesta:** Dividir por dominio (reservas, socias, instructoras, suscripciones, etc.)
- **Riesgo:** EXTREMO — tocar esto rompe TODO. Requiere refactor profundo
- **Cómo medir mejora:** Build time, cold start time, tamaño del bundle importado por rutas
- **Estado medible:** NO medible desde repo (necesita métricas de Vercel/Cloudflare)

---

#### **2. Queries masivas sin columnas explícitas — `SELECT *` en carga de catálogo**
- **Problema:** Una única llamada a `cargarEstudioCompleto()` o similar ejecuta ~30 queries paralelas:
  ```ts
  // supabase-data-admin.ts:~560
  admin.from('tipos_clase').select('*'),
  admin.from('salas').select('*'),
  admin.from('instructores').select('*'),
  admin.from('spots').select('*'),
  admin.from('planes_tarifa').select('*'),
  admin.from('citas_servicios').select('*'),
  admin.from('citas_disponibilidad').select('*'),
  // ... más 20+ tablas
  admin.from('videos_on_demand').select('*'),
  admin.from('reward_rules').select('*'),
  admin.from('challenge_definitions').select('*'),
  ```
- **Impacto:**
  - Cada `SELECT *` trae columnas que no se usan (`description` de 10KB, `json_config` de tablas frozen)
  - Si una tabla nueva se añade, la query trae 1 columna más para TODOS
  - Ancho de banda innecesario
  - RLS ejecuta políticas para TODAS las columnas aunque solo se lean 3
  - Cold start más lento (más datos que parsear)
- **Consumo estimado:** ~5-15% de ancho de banda innecesario
- **Solución propuesta:**
  - Lista explícita de columnas por tabla
  - Ej: `tipos_clase('id, nombre, duracion_minutos, capacidad')`
  - Esto requiere actualizar 30+ líneas en una sola función
- **Riesgo:** BAJO — no rompe funcionalidad, solo trae más datos
- **Cómo medir:** Bytes traídos en network, tamaño de respuesta de API
- **Estado actual:** MEDIBLE con DevTools en el navegador (red tab)

---

#### **3. Inngest — 64 invocaciones en god-file, 19 jobs ejecutándose demasiado frecuentemente**
- **Problema:** Inngest se usa para tareas que podrían ser síncronas o menos frecuentes
  - **Ejemplo:** ¿Cuál es el flujo de un job `recordatorios`?
    - Se ejecuta cada X minutos
    - Trae TODAS las reservas de TODOS los estudios (query global)
    - Filtra por fecha/hora local (en JS, no SQL)
    - Envía emails
  - **Cada invocación** cuenta contra la cuota de Inngest Free
- **Consumo estimado:** 64 invocaciones × 19 jobs × ~100 execuciones/día (promedio) = ~120.000 execuciones/mes
  - Inngest Free = 5.000/mes. **ESTAMOS PAGANDO.**
- **Solución propuesta:**
  - Auditar cada job:
    - ¿Se ejecuta innecesariamente?
    - ¿Se puede combinar con otro?
    - ¿Se puede sustituir por pg_cron?
    - ¿Se puede hacer síncrono?
  - Reducir frecuencia donde sea posible
  - Usar `pg_cron` para queries puras (sin sideeffects complejos)
- **Riesgo:** ALTO — tocar Inngest puede romper recordatorios, renovaciones, dunning
- **Cómo medir:** Dashboard de Inngest (invocations count), duración promedio
- **Estado actual:** NO medible sin acceso a Inngest dashboard

---

#### **4. API routes duplicadas — 247 rutas, muchas podrían ser Server Actions**
- **Problema:** 
  - Una gran cantidad de rutas (`/api/reservas/crear`, `/api/socias/actualizar`, etc.) son solo wrappers de funciones en `supabase-data.ts`
  - Cada ruta = cold start adicional si no se reutiliza
  - Vercel tiene límite de 12.000 funciones por project
- **Patrón problemático:**
  ```ts
  // /app/api/reservas/crear/route.ts (65 líneas)
  export async function POST(request: Request) {
    const { plaza, socioId, studioId } = await request.json();
    return crearReserva(plaza, socioId, studioId);
  }
  
  // Podría ser un Server Action en components/reservar-form.tsx:
  'use server'
  export async function crearReservaAction(plaza, socioId, studioId) {
    return crearReserva(plaza, socioId, studioId);
  }
  ```
- **Impacto:**
  - Overhead de HTTP (Request → Parse JSON → Call function → Serialize JSON → Response)
  - Duplicación de autenticación (ambas rutas y Server Actions verifican `auth.uid()`)
  - Cold starts innecesarios
- **Consumo estimado:** ~15-20% de Vercel invocations son wrappers innecesarios
- **Solución propuesta:**
  - Identificar rutas que son puramente wrappers de funciones
  - Convertir a Server Actions (directamente callable desde componentes)
  - Mantener rutas API solo para webhooks (Stripe), públicas (portal), o que necesiten específicamente HTTP
- **Riesgo:** MEDIO — refactorizar a Server Actions es seguro pero requiere testing
- **Cómo medir:** Número de invocations en Vercel, latencia de rutas
- **Estado actual:** NO medible sin Vercel analytics

---

#### **5. Supabase Realtime — 3 subscripciones activas, probablemente innecesarias**
- **Problema:** Realtime en Supabase Free = muy limitado y consume conexiones
  - ¿Qué se suscribe?
    - Probablemente: reservas, sesiones, o dashboar real-time updates
  - ¿Podría hacerse con polling?
    - Para dashboard (1 update/5seg) → sí
    - Para notificaciones críticas → quizá SSE
- **Impacto:**
  - Conexión WebSocket por usuario = consume recursos
  - Si hay 50 usuarios simultáneos = 50 conexiones activas
  - Inngest Free = 5.000/mes, Realtime puede consumir igual
- **Consumo estimado:** ~20 conexiones simultáneas en promedio
- **Solución propuesta:**
  - Auditar qué se suscribe y si es necesario
  - Considerar polling en lugar de Realtime para:
    - Dashboard (update cada 5-10 seg con `SWR` o `React Query`)
    - Portal (update al cambiar de pantalla)
  - Mantener Realtime solo para: notificaciones push, cambios críticos en tiempo real
- **Riesgo:** BAJO — cambiar a polling es seguro y reversible
- **Cómo medir:** Número de conexiones Realtime activas, latencia percibida
- **Estado actual:** PARCIALMENTE medible (Network tab en DevTools)

---

#### **6. React.js bloat — 28 useEffect en lib, Client Components innecesarios**
- **Problema:**
  - 28 `useEffect` hooks en `lib/**/*.tsx` (componentes de lógica)
  - Muchos probablemente `useEffect` que simplemente llamam a funciones que podrían ser Server Components
  - Ejemplo patrón MAL:
    ```tsx
    export const MiComponente = () => {
      const [data, setData] = useState(null);
      useEffect(() => {
        fetch('/api/datos').then(r => setData(r.json()));
      }, []);
      return <div>{data}</div>;
    };
    ```
  - Debería ser:
    ```tsx
    async function MiComponente() {
      const data = await fetch('/api/datos').then(r => r.json());
      return <div>{data}</div>;
    }
    // Server Component, ZERO JavaScript en el navegador
    ```
- **Impacto:**
  - JavaScript adicional en el bundle
  - Renderizado innecesario en el cliente
  - Fetch por duplicado (en el servidor Y en el cliente)
  - Waterfalls (carga → render → fetch → re-render)
- **Consumo estimado:** ~10-20% del JavaScript cliente podría ser Server Component
- **Solución propuesta:**
  - Auditar cada `useEffect` y preguntarse: ¿esto podría ser un Server Component?
  - Mover queries de datos a Server Components
  - Mantener `useEffect` solo para: listeners, event handlers, browser APIs
- **Riesgo:** BAJO — Server Components son estables en Next.js 16
- **Cómo medir:** Bundle size, Core Web Vitals (LCP, FID)
- **Estado actual:** Parcialmente medible con DevTools

---

### **P1 — IMPORTANTES**

#### **7. Context global (`auth-context.tsx` — 25.293 líneas)**
- **Problema:** Contexto masivo que probablemente causa re-renders innecesarios
- **Impacto:** Cualquier cambio en `auth-context` = re-render de TODO lo que lo usa
- **Solución:** Dividir en contextos más pequeños (auth, user, studio)
- **Riesgo:** MEDIO
- **Consumo:** ~5-10% de re-renders innecesarios

---

#### **8. PostHog/Sentry — 129 capturas de Sentry, 17 eventos de analytics**
- **Problema:**
  - 129 llamadas a Sentry
  - Probablemente muchas son errores esperados o no-bloqueantes
  - PostHog: bajo número de eventos = quizá insuficiente tracking o demasiada filtering
- **Solución:** Auditar qué se envía y a dónde
- **Consumo:** ~5KB/error × 129/mes (estimado) = ~650KB/mes en Sentry
- **Riesgo:** BAJO

---

#### **9. Caché inconsistente**
- **Problema:**
  - Algunos endpoints usan `s-maxage=5` (cache de 5 seg)
  - Otros no se cachean ("nunca cacheado")
  - RLS es costosa y se ejecuta en cada request
- **Solución:**
  - Cachear más agresivamente:
    - Tema del estudio: `s-maxage=3600` (1 hora)
    - Layout: `s-maxage=3600`
    - Datos de catálogo: `s-maxage=300` (5 min)
  - Usar ISR en Next.js para revalidación smart
- **Consumo:** ~10-15% de queries innecesarias
- **Riesgo:** BAJO

---

#### **10. Middleware pesado**
- **Problema:** No se especifica qué hace el middleware, pero si se ejecuta en cada request:
  - Auth check en todas las rutas
  - Resolución de studio_id en todas las rutas
  - RLS policies aplicadas a cada query
- **Solución:** Cachear la resolución de studio_id por sesión
- **Consumo:** ~5% de latencia adicional
- **Riesgo:** BAJO

---

### **P2 — MEJORAS SECUNDARIAS**

#### **11-15. Queries sin índices, falta de composite indexes, N+1 queries**
- No medibles sin acceder a PostgreSQL logs
- Probable que existan dado el tamaño del proyecto

#### **16-20. Otras optimizaciones**
- Lazy loading de imágenes
- Image optimization
- WebP vs JPEG
- Font loading strategy
- CSS minification
- etc.

---

## 📋 RESUMEN EJECUTIVO — TOP 10 PROBLEMAS

### 🔴 **P0 — CRÍTICOS (RESOLVER PRIMERO)**

1. **God-file `supabase-data-admin.ts` (3.919 líneas)**
   - **Qué:** Un archivo concentra 64 funciones de acceso a datos
   - **Por qué:** Falta de modularización desde el inicio
   - **Consumo:** Desconocido (necesita métricas de Vercel)
   - **Solución:** Dividir por dominio (reservas, socias, etc.)
   - **Riesgo:** EXTREMO
   - **Cómo medir:** Build time, cold start time, bundle size
   - **Tiempo:** 4-6 semanas

2. **Queries masivas `SELECT *` (~30 columnas innecesarias por query)**
   - **Qué:** Cargar toda una tabla sin especificar columnas
   - **Por qué:** Convenencia, "puede que se necesite más adelante"
   - **Consumo:** 5-15% ancho de banda innecesario
   - **Solución:** Especificar columnas explícitamente
   - **Riesgo:** BAJO
   - **Cómo medir:** Network tab → size of responses
   - **Tiempo:** 1-2 semanas

3. **Inngest — 64 invocaciones, probablemente overkill**
   - **Qué:** 19 jobs ejecutándose quizá demasiado frecuentemente
   - **Por qué:** Seguridad (mejor ejecutar background job que de forma síncrona)
   - **Consumo:** Desconocido (necesita métricas de Inngest)
   - **Solución:** Auditar cada job y optimizar frecuencia
   - **Riesgo:** ALTO
   - **Cómo medir:** Inngest dashboard (executions/day)
   - **Tiempo:** 2-3 semanas

4. **API routes duplicadas — 247 rutas (muchas son wrappers)**
   - **Qué:** Rutas que simplemente llaman funciones
   - **Por qué:** Falta de Server Actions o arquitectura clara
   - **Consumo:** 15-20% Vercel invocations innecesarias
   - **Solución:** Convertir a Server Actions donde sea posible
   - **Riesgo:** MEDIO
   - **Cómo medir:** Vercel analytics → invocations count
   - **Tiempo:** 2-3 semanas

5. **Supabase Realtime — 3 subscripciones (probablemente innecesarias)**
   - **Qué:** WebSocket connections para actualizaciones en tiempo real
   - **Por qué:** Necesidad de updates reactivos
   - **Consumo:** Desconocido (probablemente bajo)
   - **Solución:** Cambiar a polling o SSE
   - **Riesgo:** BAJO
   - **Cómo medir:** Network tab (WebSocket connections)
   - **Tiempo:** 1 semana

---

### 🟠 **P1 — IMPORTANTES (RESOLVER DESPUÉS)**

6. **Client Components innecesarios — 28 useEffect, muchos podrían ser Server Components**
   - **Qué:** Lógica que corre en el cliente cuando podría correr en servidor
   - **Consumo:** 10-20% JS cliente innecesario
   - **Solución:** Mover a Server Components
   - **Riesgo:** BAJO
   - **Cómo medir:** Bundle size, Core Web Vitals
   - **Tiempo:** 2 semanas

7. **Sentry — 129 capturas (auditar relevancia)**
   - **Qué:** ¿Cuántas son reales vs ruido?
   - **Consumo:** Bajo (pero acumula)
   - **Solución:** Filtrar eventos no relevantes
   - **Riesgo:** BAJO
   - **Tiempo:** 1 semana

8. **Context global masivo (`auth-context.tsx` — 25.293 líneas)**
   - **Qué:** Contexto que causa re-renders masivos
   - **Consumo:** 5-10% re-renders innecesarios
   - **Solución:** Dividir en contextos pequeños
   - **Riesgo:** MEDIO
   - **Tiempo:** 2 semanas

9. **Caché inconsistente — algunos endpoints sin caché**
   - **Qué:** RLS ejecutándose en cada request
   - **Consumo:** 10-15% queries innecesarias
   - **Solución:** Cachear más agresivamente
   - **Riesgo:** BAJO
   - **Tiempo:** 1 semana

10. **Middleware + RLS costosa**
    - **Qué:** Auth check + RLS en cada request
    - **Consumo:** 5-10% latencia adicional
    - **Solución:** Cachear resolución de studio_id
    - **Riesgo:** BAJO
    - **Tiempo:** 1 semana

---

## 🎯 PLAN DE ACCIÓN RECOMENDADO

### Fase 1: Auditoría completa (1 semana)
- [ ] Acceder a métricas de Vercel (cold starts, invocations, latency)
- [ ] Acceder a métricas de Inngest (executions, duration)
- [ ] Acceder a logs de PostgreSQL (slow queries, indexes)
- [ ] Acceder a Sentry (most common errors)
- [ ] Analizar Network tab en prod (tamaño de responses)

### Fase 2: Quick wins (1-2 semanas)
- [ ] Especificar columnas en queries `SELECT`
- [ ] Retirar logs excesivos en Sentry
- [ ] Cachear más agresivamente (tema, layout, catálogo)
- [ ] Auditar Realtime → cambiar a polling

### Fase 3: Refactoring medio (2-3 semanas)
- [ ] Convertir 50-100 API routes a Server Actions
- [ ] Auditar y optimizar frecuencia de Inngest jobs
- [ ] Dividir `auth-context.tsx` en múltiples contextos
- [ ] Mover 10-20 useEffect a Server Components

### Fase 4: Refactoring grande (4-6 semanas)
- [ ] Dividir `supabase-data-admin.ts` por dominio
- [ ] Implementar pattern de acceso a datos más modular
- [ ] Mejorar índices en PostgreSQL

---

## ⚠️ LIMITACIONES DE ESTA AUDITORÍA

Sin acceso a:
- ✗ Métricas en vivo de Vercel (cold starts, memory, duration)
- ✗ Métricas en vivo de Inngest (execution counts, costs)
- ✗ PostgreSQL query logs (slow queries, missing indexes)
- ✗ Network analysis en producción
- ✗ Sentry dashboard (error frequency)
- ✗ PostHog dashboard (event frequency)

Esta auditoría se basa en **análisis estático del código**. Los números de consumo son **estimaciones** basadas en patrones comunes, no mediciones reales.

**Próximo paso:** Medir antes de optimizar. Sin métricas reales, cualquier optimización es especulativa.

---

## 📝 NOTAS DE AUDITORÍA

- **Fecha:** 24-ago-2026
- **Rama:** claude/tentare-infrastructure-audit-8bca9f
- **Revisor:** Claude (Staff Engineer mode)
- **Status:** AUDITORÍA COMPLETADA — LISTA PARA REVISIÓN Y PRIORIZACIÓN

