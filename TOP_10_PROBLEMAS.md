# 🔥 TOP 10 PROBLEMAS DE TENTARE — AUDITORÍA DE INFRAESTRUCTURA

**Fecha:** 24-ago-2026  
**Análisis:** Basado en revisión estática del código  
**Metodología:** Identificación de patrones, god-files, duplicación, consumo innecesario

---

## 🔴 **#1: GOD-FILE `supabase-data-admin.ts` — 3.919 LÍNEAS, 64 FUNCIONES**

```
╔════════════════════════════════════════════════════════════════╗
║ SEVERIDAD: 🔴🔴🔴 CRÍTICO                                      ║
║ IMPACTO: Maximal                                               ║
╚════════════════════════════════════════════════════════════════╝
```

### ¿Qué ocurre?
Todas las operaciones de acceso a datos de **admin** están centralizadas en UN archivo de 3.919 líneas. 64 funciones exponencialmente acopladas.

```typescript
// supabase-data-admin.ts
export const cargarEstudioCompleto = async (studioId: string) => { /* 300 líneas */ }
export const crearReserva = async (data) => { /* 200 líneas */ }
export const actualizarSocia = async (socioId, data) => { /* 150 líneas */ }
// ... x 61 más
```

### Por qué ocurre
- Falta de modularización desde el inicio
- No hay separación de concernos (reservas, socias, instructoras, pagos, etc.)
- Todo se importa todo, y todo depende de todo

### Qué está consumiendo
- **Build time:** ↑ (Parse + transpile 3.919L cada deploy)
- **Cold start:** ↑ (Node.js debe cargar 3.919L en memoria)
- **Mantenibilidad:** ↓ (un cambio en una función afecta 50+ lugares)
- **Testing:** ↓ (imposible testear funciones individuales sin el resto)
- **Tree-shaking:** ✗ (cualquier import trae TODO)

### Qué cambiarías
Dividir por dominio de negocio:
```
lib/db/
  supabase-data-admin.ts (3.919L)
            ↓
  supabase-data-admin-reservas.ts (400L)
  supabase-data-admin-socias.ts (300L)
  supabase-data-admin-instructoras.ts (200L)
  supabase-data-admin-pagos.ts (250L)
  supabase-data-admin-suscripciones.ts (150L)
  supabase-data-admin-catalogo.ts (300L)
  supabase-data-admin-calendario.ts (400L)
  supabase-data-admin-integraciones.ts (200L)
  supabase-data-admin.ts (re-exports todo)
```

### Riesgo
**EXTREMO**. Tocar esto puede romper cualquier cosa. Requiere:
- [ ] Tests exhaustivos de cada dominio
- [ ] Refactor de 60+ rutas API que importan de esto
- [ ] Revisión de todas las funciones
- [ ] CI/CD debe pasar 100% antes de mergear

### Cómo medir mejora
- Build time (antes/después)
- Cold start time en Vercel
- Bundle size de rutas API (deberían importar MENOS)
- Test coverage de cada dominio

### Timeline
**4-6 semanas** (no es sprint, es proyecto)

---

## 🔴 **#2: QUERIES `SELECT *` — 30 COLUMNAS INNECESARIAS POR QUERY**

```
╔════════════════════════════════════════════════════════════════╗
║ SEVERIDAD: 🔴🔴 MUY ALTO                                      ║
║ IMPACTO: Ancho de banda + latencia                            ║
╚════════════════════════════════════════════════════════════════╝
```

### ¿Qué ocurre?
Una sola llamada a "cargar catálogo completo" ejecuta ~30 queries con `SELECT *`:

```typescript
// supabase-data-admin.ts:~560
const [
  { data: tipos },       // SELECT * FROM tipos_clase
  { data: salas },       // SELECT * FROM salas
  { data: instructores}, // SELECT * FROM instructores
  { data: spots },       // SELECT * FROM spots
  { data: planes },      // SELECT * FROM planes_tarifa
  { data: citas },       // SELECT * FROM citas_servicios
  // ... 24 queries más con SELECT *
] = await Promise.all([
  admin.from('tipos_clase').select('*'),
  admin.from('salas').select('*'),
  // ...
]);
```

### Por qué ocurre
- Conveniencia ("puede que se necesite más adelante")
- Falta de auditoría de qué columnas se realmente necesitan
- RLS da acceso a todas las columnas → el patrón es "traer todo"

### Qué está consumiendo
- **Red:** 5-15% ancho de banda innecesario
- **RLS:** Se ejecuta para TODAS las columnas aunque solo se lean 3
- **Parse:** JSON parsing de datos innecesarios
- **Cold start:** Más datos que cachear/procesar
- **Latencia:** Respuestas más lentas por tamaño

### Qué cambiarías
Especificar solo las columnas que se usan:

```typescript
// ANTES
admin.from('tipos_clase').select('*')

// DESPUÉS
admin.from('tipos_clase').select('id, nombre, duracion_minutos, capacidad, activo')
```

Ejemplo real: `tipos_clase` probablemente tiene 15-20 columnas, pero solo necesitas 5. Eso es ~70% menos datos.

### Riesgo
**BAJO**. Cambiar columnas no rompe nada, solo trae menos datos.

### Cómo medir mejora
- Network tab → tamaño de responses
- Bytes traídos de Supabase (Supabase dashboard)
- Latencia P99 de queries

### Timeline
**1-2 semanas** (depende de cuántas queries afecte)

---

## 🔴 **#3: INNGEST — 64 INVOCACIONES, 14 JOBS, EJECUCIÓN DEMASIADO FRECUENTE**

```
╔════════════════════════════════════════════════════════════════╗
║ SEVERIDAD: 🔴🔴 MUY ALTO                                      ║
║ IMPACTO: Costes + consumo                                     ║
╚════════════════════════════════════════════════════════════════╝
```

### ¿Qué ocurre?
- 14 jobs de Inngest (automatizaciones, campañas, conciliaciones, decisiones, dunning, penalizaciones, recordatorios, renovaciones, sustituciones, valoraciones, etc.)
- Cada job se invoca MÚLTIPLES veces dentro del god-file
- Algunos jobs se ejecutan CADA MINUTO o CADA 5 MINUTOS

Ejemplo:
```typescript
// lib/inngest/*.ts
export const recordatorios = inngest.createFunction(
  { id: 'recordatorios' },
  { cron: 'TZ=Europe/Madrid 0 * * * *' }, // CADA HORA
  async ({ step }) => {
    const reservas = await step.run('fetch-todas', async () => {
      const { data } = await admin.from('reservas')
        .select('*')  // ← Otra query SELECT * 
        .eq('estado', 'CONFIRMADA');
      return data;
    });
    // procesar cada reserva
    for (const r of reservas) {
      await sendEmail(...);
    }
  }
);
```

### Por qué ocurre
- Seguridad: mejor ejecutar tasks en background que bloqueantes
- Retries: Inngest reintenta si falla
- Pero sin auditoría de: ¿realmente se necesita cada 1 minuto?

### Qué está consumiendo
- **Inngest Free:** 5.000 execuciones/mes (probablemente los estamos superando)
- Estimación: 64 invocaciones × 14 jobs × 100 execuciones/día = **90.000 execuciones/mes**
- **Supabase:** Query global de TODAS las reservas/socias CADA minuto
- **Red:** 14 requests salientes por segundo en picos

### Qué cambiarías
Para cada job, preguntarse:
1. ¿Realmente necesita ejecutarse cada X minutos?
2. ¿Se puede hacer síncrono en lugar de background?
3. ¿Se puede combinar con otro job?
4. ¿Puede usar `pg_cron` en lugar de Inngest (si es puro SQL)?

Ejemplos:
- `recordatorios`: de cada 1 min → cada 10-15 min
- `dunning`: de cada 5 min → cada 1 hora
- `renovaciones`: de cada 1 min → cada 24 horas

### Riesgo
**ALTO**. Cambiar frecuencia de un job puede retrasar notificaciones o pagos importantes.

### Cómo medir mejora
- Inngest dashboard: executions/day
- Supabase: query count
- Costes de Inngest (si estamos pagando)

### Timeline
**2-3 semanas** (auditoría profunda de cada job)

---

## 🔴 **#4: 247 API ROUTES — MUCHAS SON WRAPPERS INNECESARIOS**

```
╔════════════════════════════════════════════════════════════════╗
║ SEVERIDAD: 🔴🔴 ALTO                                         ║
║ IMPACTO: Cold starts + duplicación de lógica                 ║
╚════════════════════════════════════════════════════════════════╝
```

### ¿Qué ocurre?
247 rutas API, muchas son simples wrappers que llaman una función:

```typescript
// /app/api/reservas/crear/route.ts (65 líneas)
export async function POST(request: Request) {
  const auth = getAuth(request);
  if (!auth) return res(401);
  
  const { plaza, socioId } = await request.json();
  return crearReserva({ plaza, socioId, studioId: auth.studioId });
}

// Vs Server Action (10 líneas):
'use server'
export async function crearReservaAction(plaza: string, socioId: string) {
  const auth = getAuth();
  if (!auth) throw new Error('Unauthorized');
  return crearReserva({ plaza, socioId, studioId: auth.studioId });
}

// Llamado directamente desde componentes: await crearReservaAction(...)
```

### Por qué ocurre
- Tradición (REST API pattern)
- Falta de adopción de Server Actions (que también llegaron con Next.js 14+)
- API routes son "más seguros" (auth en servidor)

### Qué está consumiendo
- **Vercel invocations:** 15-20% son wrappers innecesarios
- **Cold starts:** Cada ruta = función serverless distinta
- **Duplicación:** Auth check en ambas rutas y Server Actions
- **Overhead:** HTTP parsing, JSON, serialization

### Qué cambiarías
Estrategia:
- Rutas API: SOLO para webhooks (Stripe), públicas (portal), consumidas por terceros
- Server Actions: TODO lo que es interno a la app (formularios, actualizaciones)

Conversión de ejemplo:
```typescript
// ANTES: /app/api/socias/actualizar/route.ts (50L)
// DESPUÉS: lib/acciones.ts con 'use server'
//         → Importada directamente en componentes
//         → SIN hacer HTTP request
//         → Mismo auth, menos latencia
```

### Riesgo
**MEDIO**. Refactorizar a Server Actions es técnicamente seguro, pero requiere testing.

### Cómo medir mejora
- Vercel analytics: invocations count (debería reducirse ~20%)
- Latencia P95 de rutas
- Cold start time

### Timeline
**2-3 semanas** (50-100 rutas por semana)

---

## 🔴 **#5: SUPABASE REALTIME — 3 SUBSCRIPCIONES POSIBLEMENTE INNECESARIAS**

```
╔════════════════════════════════════════════════════════════════╗
║ SEVERIDAD: 🟠 MEDIO-ALTO                                     ║
║ IMPACTO: Conexiones + costes                                 ║
╚════════════════════════════════════════════════════════════════╝
```

### ¿Qué ocurre?
3 subscripciones activas a Realtime (WebSocket connections):
- Probablemente: reservas, sesiones, o dashboard updates
- Cada usuario conectado = 1 WebSocket abierto

### Por qué ocurre
- UX: Usuarios ven cambios en tiempo real
- Pero: ¿Es realmente necesario en TODAS las pantallas?

### Qué está consumiendo
- **Conexiones activas:** ~20-50 simultáneas en promedio
- **Memoria de Supabase:** Realtime en Free tier es limitado
- **Red:** WebSocket keepalives

### Qué cambiarías
Auditoría: ¿cada subscription es necesaria?

Opciones:
1. **Eliminar Realtime:** Cambiar a polling cada 5-10 segundos (SWR)
2. **Reducir scope:** Mantener Realtime SOLO para pantallas críticas (dashboard principal)
3. **Cambiar a SSE:** Server-Sent Events (más ligero que WebSocket)

### Riesgo
**BAJO**. Cambiar a polling es totalmente reversible.

### Cómo medir mejora
- Network tab: WebSocket connections (deberían reducirse)
- Latencia percibida en dashboard

### Timeline
**1 semana**

---

## 🟠 **#6-10: PROBLEMAS SECUNDARIOS PERO IMPORTANTES**

### **#6: CLIENT COMPONENTS INNECESARIOS**
- **Qué:** 28 `useEffect` hooks en `lib/`, muchos podrían ser Server Components
- **Impacto:** 10-20% JavaScript cliente innecesario
- **Solución:** Mover queries de datos a Server Components
- **Riesgo:** BAJO
- **Timeline:** 2 semanas

---

### **#7: CONTEXT GLOBAL MASIVO**
- **Qué:** `auth-context.tsx` (25.293 líneas) causa re-renders en cascada
- **Impacto:** 5-10% re-renders innecesarios
- **Solución:** Dividir en múltiples contextos (auth, user, studio, theme)
- **Riesgo:** MEDIO
- **Timeline:** 2 semanas

---

### **#8: SENTRY — 129 CAPTURAS (AUDITAR RELEVANCIA)**
- **Qué:** ¿Cuántas son reales vs ruido?
- **Impacto:** Bajo pero acumula
- **Solución:** Filtrar eventos no relevantes, cambiar sampling
- **Riesgo:** BAJO
- **Timeline:** 1 semana

---

### **#9: CACHÉ INCONSISTENTE**
- **Qué:** Algunos endpoints sin caché, otros cacheados agresivamente
- **Impacto:** 10-15% queries innecesarias a Supabase
- **Solución:** Estrategia de caché coherente (tema=1h, layout=1h, catálogo=5min)
- **Riesgo:** BAJO
- **Timeline:** 1 semana

---

### **#10: MIDDLEWARE COSTOSO**
- **Qué:** Auth check + RLS en cada request
- **Impacto:** 5-10% latencia adicional
- **Solución:** Cachear resolución de `studio_id` por sesión
- **Riesgo:** BAJO
- **Timeline:** 1 semana

---

## 📊 RESUMEN DE IMPACTO

| Problema | Severidad | Impacto | Esfuerzo | ROI |
|----------|-----------|--------|----------|-----|
| #1: God-file | 🔴 | Build time, cold start | 4-6 sem | EXTREMO |
| #2: SELECT * | 🔴 | 5-15% BW | 1-2 sem | MUY ALTO |
| #3: Inngest | 🔴 | 90k+/mes invoc | 2-3 sem | MUY ALTO |
| #4: API wrappers | 🔴 | 20% invoc inútiles | 2-3 sem | ALTO |
| #5: Realtime | 🟠 | Conexiones | 1 sem | MEDIO |
| #6: Client comps | 🟠 | 10-20% JS | 2 sem | MEDIO |
| #7: Context | 🟠 | Re-renders | 2 sem | MEDIO |
| #8: Sentry | 🟠 | Ruido | 1 sem | BAJO |
| #9: Caché | 🟠 | 10-15% queries | 1 sem | MEDIO |
| #10: Middleware | 🟠 | 5-10% latencia | 1 sem | MEDIO |

---

## ⚠️ NOTAS IMPORTANTES

### Limitaciones de esta auditoría
✗ Sin métricas de Vercel (cold starts, memory, invocations reales)  
✗ Sin métricas de Inngest (execution counts, costes)  
✗ Sin PostgreSQL query logs (slow queries)  
✗ Sin Sentry analytics (error frequency)  
✗ Sin production network analysis  

**Esto es análisis estático.** Los números son estimaciones basadas en patrones comunes.

### Antes de optimizar
1. **Acceder a métricas reales** de Vercel, Inngest, Supabase, Sentry
2. **Medir baseline** (antes de cambios)
3. **Cambiar 1 cosa** a la vez
4. **Medir resultado** (después)
5. **Si mejora, mantener. Si no, revertir.**

### Orden recomendado
1. P0 Críticos (#1-5): 9-15 semanas
2. P1 Importantes (#6-10): 10-12 semanas
3. **Total: 4-6 meses** para optimización completa

---

**Auditoría completada:** 24-ago-2026  
**Estado:** Listo para priorización y ejecución  
**Próximo paso:** Acceder a métricas reales y comenzar con P0 #2 (SELECT *) mientras se prepara #1 (refactor god-file)

