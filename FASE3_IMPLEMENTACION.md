# FASE 3: IMPLEMENTACIÓN - Control Horario Inteligente

**Estado**: ✅ Completada  
**Fecha**: 2026-09-20  
**Componentes**: Migraciones SQL + Server Actions + UX + Tests

---

## 📦 ARTEFACTOS CREADOS

### 1. Migraciones SQL (3 archivos)

#### `20260920120000_instructor_work_sessions.sql`
- ✅ Tabla `instructor_work_sessions` (jornadas)
- ✅ Tabla `work_session_sessions` (sesiones vinculadas)
- ✅ Tabla `work_session_audits` (auditoría)
- ✅ Tabla `studio_config_tiempo` (configuración)
- ✅ RLS policies completas
- ✅ Índices optimizados
- ✅ UNIQUE constraint parcial: `(studio_id, instructor_id) WHERE status = 'OPEN'`

#### `20260920120100_instructor_tarifas_vigencia.sql`
- ✅ Agregar `vigente_desde` a `instructor_tarifas` (backward compatible)
- ✅ Agregar `vigente_hasta` (nullable)
- ✅ RPC `get_instructor_tarifa_vigente()` para consultas históricas
- ✅ Índices para consultas rápidas
- ✅ NO cambia PK existente (backward compatible)

#### `20260920120200_work_session_helpers.sql`
- ✅ RPC `get_compatible_sessions()` - sesiones vinculables a jornada
- ✅ RPC `get_instructor_open_session()` - jornada abierta actual
- ✅ RPC `calculate_work_session_metrics()` - duraciones, clases, coste

### 2. Server Actions

#### `lib/instructor-time-entries.ts`
- ✅ `registrarEntrada()` - Crea jornada OPEN (IDEMPOTENTE)
  - Maneja doble clic: retorna existingWorkSessionId si ya existe
  - Protege concurrencia con UNIQUE constraint en BD
  - Audita CHECK_IN automáticamente
  
- ✅ `registrarSalida()` - Cierra jornada (status CLOSED)
  - Verifica RLS (instructora solo cierra suya)
  - Calcula duración transcurrida
  - Audita CHECK_OUT automáticamente

- ✅ `editarRegistroHorario()` - Edición manual (PROPIETARIO/MANAGER)
  - Audita ANTES y DESPUÉS
  - Permite razón de cambio
  - Protege contra edición no autorizada

- ✅ `vincularSesion()` - Vincula sesión a jornada
  - Solo PROPIETARIO/MANAGER
  - Verifica jornada existe
  - Audita vinculación

### 3. Componente UX

#### `app/portal/[slug]/tiempo-trabajado/page.tsx`
- ✅ **Si NO estás fichada**: botón grande "🟢 Registrar Entrada"
- ✅ **Si estás OPEN**: timer en vivo + botón "🔴 Registrar Salida"
- ✅ **Próxima sesión**: muestra clase próxima + minutos hasta inicio
- ✅ **Hint**: aviso si estás dentro de la ventana de fichaje
- ✅ **Avisos**: si jornada excede límite de horas (requiere_revision)
- ✅ **Manejo de errores**: muestra error claro si falla registro
- ✅ **Polling**: actualiza estado cada 10 segundos

### 4. Tests Lógicos

#### `lib/instructor-time-entries.test.ts`
- ✅ Tests de idempotencia (doble clic)
- ✅ Tests de concurrencia (UNIQUE constraint)
- ✅ Tests de RLS y seguridad
- ✅ Tests de cálculos derivados (duración, no-clase, coste)
- ✅ Tests de tarifa histórica (vigencia)
- ✅ Tests de auditoría
- ✅ Tests de estados derivados

---

## 🔐 GARANTÍAS IMPLEMENTADAS

| Garantía | Mecanismo | Validación |
|----------|-----------|-----------|
| Máximo 1 jornada OPEN | `UNIQUE(studio_id, instructor_id) WHERE status='OPEN'` | ✅ Constraint BD |
| Idempotencia (doble clic) | RPC verifica existencia, retorna existente | ✅ Lógica + test |
| Concurrencia (race condition) | UNIQUE constraint + RLS | ✅ Constraint + test |
| RLS | Policies por rol + instructor_id | ✅ SQL policies |
| Auditoría | work_session_audits para cada cambio | ✅ Tablas + triggers |
| Timestamp con zona | `timestamptz` en todas las columnas | ✅ Schema SQL |
| Tarifa histórica | RPC con DATE(check_in_at) para vigencia | ✅ Función SQL |
| Cálculos derivados | NO persistidos, calculados on-demand | ✅ RPCs stateless |
| Backward compatibility | NO cambio PK de instructor_tarifas | ✅ Migración aditiva |

---

## 🚀 PRÓXIMOS PASOS (FASE 4: VALIDACIÓN)

### A. Aplicar migraciones SQL

```bash
# En local con Supabase
supabase migration list
supabase db push

# Verificar en prod (después de tests)
supabase migration deploy --linked
```

### B. Pruebas E2E con Supabase local

```bash
# 1. Botar Supabase local
supabase start

# 2. Ejecutar tests
npm test -- lib/instructor-time-entries.test.ts

# 3. Prueba manual
# - Crear usuario instructora
# - Crear estudio
# - Abrir app en localhost
# - Registrar entrada → salida → verificar auditoría
```

### C. Auditoría de seguridad final

- [ ] RLS: una instructora no puede ver/editar jornadas ajenas
- [ ] Concurrencia: dos peticiones simultáneas de entrada → solo 1 jornada
- [ ] Timezone: todos los timestamps en timestamptz
- [ ] Tarifa: histórico respeta vigencia, no usa tarifa actual para pasado
- [ ] Idempotencia: registrarEntrada() doble clic → same session ID
- [ ] Auditoría: cada cambio manual registra antes/después
- [ ] RLS de instructor_tarifas: no rompe liquidaciones existentes

### D. Validación de regresiones

- [ ] App instructora carga sin errores
- [ ] Panel equipo sigue cargando tarifas correctamente
- [ ] Liquidaciones calculan con tarifa correcta
- [ ] No hay queries lentas nuevas (verificar índices)

---

## 📊 CHECKLIST DE COMPLETITUD

### SQL
- ✅ 4 tablas nuevas
- ✅ RLS para todas
- ✅ 3 RPCs auxiliares
- ✅ Índices optimizados
- ✅ UNIQUE constraint idempotencia
- ✅ Backward compatible

### Server Actions
- ✅ registrarEntrada() idempotente
- ✅ registrarSalida() segura
- ✅ editarRegistroHorario() auditada
- ✅ vincularSesion() protegida
- ✅ Todas con error handling

### UX
- ✅ Pantalla instructora (tiempo-trabajado)
- ✅ Botones claros (entrada/salida)
- ✅ Timer en vivo
- ✅ Avisos (próxima clase, límite horas)
- ✅ Polling actualización estado

### Tests
- ✅ Idempotencia
- ✅ Concurrencia
- ✅ RLS
- ✅ Cálculos
- ✅ Auditoría
- ✅ Tarifa histórica

---

## ⚠️ NO IMPLEMENTADO (por diseño, V1)

- ❌ GPS/ubicación automática
- ❌ QR/Kiosko/NFC
- ❌ Notificaciones push/email
- ❌ Decision OS especialista de horas
- ❌ Exportación CSV
- ❌ Integración Stripe recibos

Estos son casos **planificados para V2+**.

---

## 🧪 CÓMO PROBAR EN LOCAL

### 1. Verificar migraciones

```bash
cd supabase
ls migrations/2026092012* # Deben estar los 3 archivos SQL
```

### 2. Aplicar a BD local

```bash
supabase start
# Esperar que suba

# En otra terminal
supabase db push
# Esperar "Applied X migrations"

# Verificar tablas
supabase db diff # No debe haber cambios pendientes
```

### 3. Prueba manual

```bash
# 1. Terminal: dev server
npm run dev

# 2. Browser: http://localhost:3000/portal/[studio-slug]/tiempo-trabajado

# 3. Acciones:
#    a) Click "Registrar Entrada" → check_in_at se guarda
#    b) Esperar 10 segundos → timer avanza
#    c) Doble click entrada → mismo session ID retornado
#    d) Click "Registrar Salida" → check_out_at se guarda, status CLOSED

# 4. Verificar en Supabase Dashboard:
#    a) instructor_work_sessions: 1 fila status=CLOSED
#    b) work_session_audits: 2 filas (CHECK_IN + CHECK_OUT)
```

### 4. Test de RLS

```bash
# Como instructora A: ver solo sus jornadas
# Como instructora B: error si intenta ver jornadas de A

# Como PROPIETARIO: ver todas del estudio
```

---

## 📝 CHECKLIST ANTES DE MERGE

- [ ] Migraciones revisadas (schema correcto)
- [ ] Server Actions: sin secrets hardcodeados
- [ ] RLS: verificar todos los policies
- [ ] Tests: `npm test` pasan
- [ ] E2E: probado en Supabase local
- [ ] No hay breaking changes en instructor_tarifas
- [ ] Backward compatible (verificar liquidaciones)
- [ ] Documentación: DISEÑO_TIME_TRACKING.md + FASE3_IMPLEMENTACION.md

---

## 🔗 REFERENCIAS

- **Diseño**: `DISEÑO_TIME_TRACKING.md`
- **Reglas de negocio**: `DISEÑO_TIME_TRACKING.md` § 6
- **SQL**: `supabase/migrations/2026092012*`
- **Código**: `lib/instructor-time-entries.ts`
- **UX**: `app/portal/[slug]/tiempo-trabajado/page.tsx`
- **Tests**: `lib/instructor-time-entries.test.ts`

---

## PRÓXIMA FASE: AUDITORÍA FINAL (FASE 5)

Ver `AUDITORIA_FINAL_TIME_TRACKING.md` (por crear)

Puntos a validar:
1. Seguridad RLS
2. Concurrencia y deadlocks
3. Performance (índices)
4. Timezone correctitud
5. Backward compatibility
6. Regresiones
