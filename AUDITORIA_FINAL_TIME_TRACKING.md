# AUDITORÍA FINAL - Control Horario Inteligente

**Estado**: 🔍 A ejecutar  
**Criterios**: Seguridad | Concurrencia | Timezone | Backward Compatibility | Regresiones  
**Validación**: Antes de merge a main

---

## 1. SEGURIDAD - RLS

### 1.1 Instructora SOLO ve/edita sus jornadas

```sql
-- Verificar policy SELECT
SELECT * FROM instructor_work_sessions
WHERE instructor_id = 'OTRA_INSTRUCTORA_ID'
-- Resultado esperado: ERROR 'Operación no permitida' (42501)

-- Verificar policy UPDATE
UPDATE instructor_work_sessions
SET check_out_at = now()
WHERE id = 'JORNADA_DE_OTRA'
-- Resultado esperado: ERROR (sin actualización)
```

**Criterio**: ✅ PASS si retorna error 42501  
**Riesgo**: 🔴 FAIL si instructora ve/edita jornadas ajenas

---

### 1.2 PROPIETARIO/MANAGER ve todas las jornadas del estudio

```sql
-- Como PROPIETARIO:
SELECT COUNT(*) FROM instructor_work_sessions
WHERE studio_id = 'ESTUDIO_ID'
-- Resultado esperado: N jornadas (todas)

-- Como INSTRUCTOR:
SELECT COUNT(*) FROM instructor_work_sessions
WHERE studio_id = 'ESTUDIO_ID'
-- Resultado esperado: 0 (solo si son suyas con instructor_id check)
```

**Criterio**: ✅ PASS si PROPIETARIO ve todas, INSTRUCTOR solo suyas  
**Riesgo**: 🔴 FAIL si hay data leak entre instructoras

---

### 1.3 Anon NO accede a jornadas

```sql
-- Como anon (sin autenticación):
SELECT * FROM instructor_work_sessions
-- Resultado esperado: ERROR (no hay policy para anon)
```

**Criterio**: ✅ PASS si error 42501  
**Riesgo**: 🔴 FAIL si anon ve datos públicos

---

### 1.4 RLS de instructor_tarifas NO se rompió

```sql
-- Instructora lee su tarifa
SELECT tarifa_hora FROM instructor_tarifas
WHERE instructor_id = current_instructor_id()
-- Resultado esperado: su tarifa

-- Instructora intenta leer tarifa de otra
SELECT tarifa_hora FROM instructor_tarifas
WHERE instructor_id != current_instructor_id()
-- Resultado esperado: ERROR o lista vacía
```

**Criterio**: ✅ PASS si no hay información leak  
**Riesgo**: 🔴 FAIL si cobranza se vuelve pública

---

## 2. CONCURRENCIA - Idempotencia

### 2.1 Doble clic en registrar entrada

```javascript
// Simular dos peticiones simultáneas
const [result1, result2] = await Promise.all([
  registrarEntrada('MOBILE'),
  registrarEntrada('MOBILE'),
]);

// Validación:
// - Ambas deben retornar success: true
// - Una debe tener workSessionId (nueva)
// - La otra debe tener existingWorkSessionId (recuperada)
// - Ambas deben tener el MISMO ID de jornada
// - BD debe tener EXACTAMENTE 1 fila OPEN (no 2)

assert(result1.workSessionId === result2.existingWorkSessionId 
  || result1.existingWorkSessionId === result2.workSessionId);
```

**Criterio**: ✅ PASS si solo 1 jornada OPEN en BD  
**Riesgo**: 🔴 FAIL si aparecen 2 jornadas OPEN (duplicado)

---

### 2.2 Cerrar jornada mientras se abre otra

```javascript
// Instructora A abre jornada
// Instructora B abre jornada simultáneamente
const a = await registrarEntrada('MOBILE'); // instructora A
const b = await registrarEntrada('MOBILE'); // instructora B

// Validación: Ambas deben tener su propia jornada OPEN
assert(a.workSessionId !== b.workSessionId);
assert(a.success === true && b.success === true);
```

**Criterio**: ✅ PASS si cada instructora tiene su jornada  
**Riesgo**: 🔴 FAIL si se asignan jornadas cruzadas

---

### 2.3 UNIQUE constraint no permite insertar duplicados

```sql
-- Intentar INSERT manual (como si hubiera bug en aplicación):
INSERT INTO instructor_work_sessions (...) VALUES (...)
WHERE instructor_id = 'ID_A' AND studio_id = 'ESTUDIO_X' AND status = 'OPEN';

INSERT INTO instructor_work_sessions (...) VALUES (...)
WHERE instructor_id = 'ID_A' AND studio_id = 'ESTUDIO_X' AND status = 'OPEN';

-- Resultado esperado: UNIQUE constraint violated (code 23505)
```

**Criterio**: ✅ PASS si constraint rechaza 2ª inserción  
**Riesgo**: 🔴 FAIL si BD permite múltiples OPEN

---

## 3. TIMEZONE - Correctitud

### 3.1 Timestamps almacenados como timestamptz

```sql
-- Verificar tipo columna
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name IN ('instructor_work_sessions', 'work_session_audits')
AND column_name LIKE '%at%';

-- Resultado esperado: 
-- check_in_at        | timestamp with time zone
-- check_out_at       | timestamp with time zone
-- created_at         | timestamp with time zone
```

**Criterio**: ✅ PASS si ALL son `timestamptz`  
**Riesgo**: 🔴 FAIL si hay `timestamp` sin zone

---

### 3.2 Europe/Madrid usado solo para presentación

```javascript
// Cálculo de duración:
const checkIn = new Date('2026-09-20T10:00:00Z'); // UTC
const checkOut = new Date('2026-09-20T14:00:00Z'); // UTC
const duracion = (checkOut - checkIn) / 3600000; // 4 horas

// Presentación usa TZ_ESTUDIO:
const texto = checkIn.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' });
// Resultado: "12:00:00" (si +02:00 offset)

// Almacenamiento:
// Siempre en timestamptz (UTC interno, offset implícito)
```

**Criterio**: ✅ PASS si TZ_ESTUDIO = presentación, timestamptz = almacenaje  
**Riesgo**: 🔴 FAIL si hay conversión manual o doubtz

---

### 3.3 Cambio de hora verano/invierno no rompe cálculos

```javascript
// Jornada cruzando cambio de hora
// 2026-03-29 01:59:59 CET (UTC+1)
//            → 03:00:00 CEST (UTC+2) [-1 hora clock, +0 tiempo real]

const checkIn = new Date('2026-03-29T00:59:59Z'); // UTC
const checkOut = new Date('2026-03-29T01:59:59Z'); // UTC
const duracion = (checkOut - checkIn) / 3600000; // 1 hora (correcto)

// Presentación local:
console.log(checkIn.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }));
// → "01:59:59" (CET)
console.log(checkOut.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }));
// → "03:59:59" (CEST) - visually 2 horas, pero realmente 1h real
```

**Criterio**: ✅ PASS si duración calculada en UTC es siempre correcta  
**Riesgo**: 🔴 FAIL si cambia offset y se pierde una hora

---

## 4. BACKWARD COMPATIBILITY - instructor_tarifas

### 4.1 Queries existentes siguen funcionando

```sql
-- Antigua query (panel equipo):
SELECT instructor_id, tarifa_hora FROM instructor_tarifas
WHERE studio_id = 'ESTUDIO_ID'

-- Resultado esperado: Sigue retornando datos sin cambio
```

**Criterio**: ✅ PASS si panel equipo carga sin errores  
**Riesgo**: 🔴 FAIL si tarifa es NULL o duplicada

---

### 4.2 Liquidaciones calculan tarifa correctamente

```javascript
// Liquidación calcula coste:
const costeTotal = duracionHoras * tarifaHora;

// Con histórico:
// Si jornada está en 2026-09-20, debe usar tarifa vigente EN ESA FECHA
// No puede usar la de hoy
```

**Criterio**: ✅ PASS si coste = duración × tarifa_vigente_en_fecha  
**Riesgo**: 🔴 FAIL si usa tarifa actual para periodos históricos

---

### 4.3 No hay duplicados de instructora en nuevo índice

```sql
-- Verificar:
SELECT instructor_id, COUNT(*) FROM instructor_tarifas
GROUP BY instructor_id
HAVING COUNT(*) > 1;

-- Resultado esperado: ningún resultado (no hay duplicados)
```

**Criterio**: ✅ PASS si cada instructora tiene 1 fila vigente  
**Riesgo**: 🔴 FAIL si hay duplicados por vigencia descontrolada

---

## 5. PERFORMANCE - Índices

### 5.1 Indices presentes y usados

```sql
-- Verificar índices:
\di+ instructor_work_sessions
-- Resultado esperado:
-- - idx_work_sessions_instructor
-- - idx_work_sessions_status
-- - idx_work_sessions_range

-- Verificar que SELECT usa índice:
EXPLAIN SELECT * FROM instructor_work_sessions
WHERE studio_id = 'X' AND instructor_id = 'Y' AND created_at > now() - INTERVAL '7 days';
-- Resultado esperado: "Index Scan" (no "Seq Scan")
```

**Criterio**: ✅ PASS si EXPLAIN muestra Index Scan  
**Riesgo**: 🔴 FAIL si hay Seq Scan (lentitud)

---

### 5.2 No hay queries N+1

```javascript
// Cargar jornadas + sesiones vinculadas:
const jornadas = await getWorkSessions(...);
// Debe hacer:
// 1. SELECT jornadas
// 2. SELECT sesiones (JOIN, no loop por jornada)
```

**Criterio**: ✅ PASS si max 2 queries  
**Riesgo**: 🔴 FAIL si hay 1 + N queries

---

## 6. REGRESIONES - Funcionalidad existente

### 6.1 App instructora carga sin errores

```javascript
// Cargar app instructora:
// GET /portal/[slug]/tiempo-trabajado

// Validación:
// - Status 200
// - UI renderiza sin errores
// - Componentes cargan (botones, timer)
```

**Criterio**: ✅ PASS si UI funciona  
**Riesgo**: 🔴 FAIL si hay error 500 o layout roto

---

### 6.2 Panel equipo → sección Tarifas sigue funcionando

```javascript
// GET /dashboard/equipo/tarifas
// Validación:
// - Carga lista de instructoras
// - Puede editar tarifa
// - Cambios se guardan
```

**Criterio**: ✅ PASS si CRUD tarifas funciona  
**Riesgo**: 🔴 FAIL si no carga tarifas

---

### 6.3 Cálculo de liquidaciones correcto

```javascript
// Generar liquidación (endpointexistente):
// GET /api/equipo/liquidaciones?instructora_id=X&mes=2026-09

// Validación:
// - Coste = horas_reales × tarifa_vigente_en_fecha
// - Recargo sustitución aplicado si aplica
// - No hay duplicados de horas
```

**Criterio**: ✅ PASS si liquidación = coste real  
**Riesgo**: 🔴 FAIL si monto es incorrecto

---

## 7. AUDITORÍA - Registro de cambios

### 7.1 Auditoría registra CHECK_IN

```sql
SELECT * FROM work_session_audits
WHERE action = 'CHECK_IN' AND work_session_id = 'TEST_ID';

-- Resultado esperado:
-- action: 'CHECK_IN'
-- field_name: 'check_in_at'
-- value_before: NULL
-- value_after: '2026-09-20T...'
-- created_by: UUID de instructora
```

**Criterio**: ✅ PASS si audit registra todos los campos  
**Riesgo**: 🔴 FAIL si falta field o created_by

---

### 7.2 Auditoría registra EDITED con antes/después

```sql
SELECT * FROM work_session_audits
WHERE action = 'EDITED' AND field_name = 'check_in_at';

-- Resultado esperado:
-- value_before: '2026-09-20T09:00:00Z'
-- value_after: '2026-09-20T08:55:00Z'
-- reason: 'Corrección por error'
-- created_by: UUID propietario
```

**Criterio**: ✅ PASS si guarda antes/después y razón  
**Riesgo**: 🔴 FAIL si falta historia de cambios

---

## 8. CHECKLIST FINAL

| Punto | Test | Estado | Validador |
|-------|------|--------|-----------|
| RLS instructora | SELECT otra instructora | ⏳ TODO | QA |
| RLS propietario | SELECT todas | ⏳ TODO | QA |
| RLS anon | SELECT sin auth | ⏳ TODO | QA |
| Concurrencia | Doble clic entrada | ⏳ TODO | Dev |
| Concurrencia | UNIQUE constraint | ⏳ TODO | QA |
| Timezone | timestamptz type | ⏳ TODO | Code Review |
| Timezone | Europe/Madrid presentación | ⏳ TODO | Dev |
| Backward compat | Queries instructor_tarifas | ⏳ TODO | QA |
| Backward compat | Liquidaciones | ⏳ TODO | Finance |
| Performance | Índices usados | ⏳ TODO | DB Admin |
| Regresiones | App instructora carga | ⏳ TODO | QA |
| Regresiones | Panel tarifas | ⏳ TODO | QA |
| Regresiones | Liquidaciones calcula | ⏳ TODO | Finance |
| Auditoría | CHECK_IN registrado | ⏳ TODO | Audit |
| Auditoría | EDITED con antes/después | ⏳ TODO | Audit |

---

## 9. VALIDACIÓN EN SUPABASE LOCAL

```bash
# 1. Subir migraciones
supabase db push

# 2. Verificar tablas existen
supabase db execute -f - <<EOF
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'work_session%'
OR table_name LIKE 'studio_config%';
EOF

# 3. Verificar RLS activado
supabase db execute -f - <<EOF
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'work_session%'
OR tablename LIKE 'studio_config%';
EOF

# 4. Ejecutar tests
npm test -- lib/instructor-time-entries.test.ts
```

---

## 10. SIGN-OFF

| Rol | Aprobación | Firma | Fecha |
|-----|-----------|-------|-------|
| Code Review | ⏳ Pendiente | — | — |
| QA | ⏳ Pendiente | — | — |
| DB Admin | ⏳ Pendiente | — | — |
| Finance | ⏳ Pendiente | — | — |

---

## 11. SÍNTESIS: RIESGOS RESIDUALES

### 🔴 Críticos (bloquea merge)
- RLS broken (instructora ve jornadas ajenas)
- Duplicados OPEN (no respeta UNIQUE)
- Timestamps sin zone (timezone drift)
- Liquidaciones usan tarifa incorrecta

### 🟠 Mayores (requiere fix antes de deploy)
- Performance: queries N+1
- Backward compat: instructor_tarifas queries rotas
- Regresiones: UI no carga

### 🟡 Menores (documentar, arreglar en V1.1)
- Auditoría incompleta
- Índices no óptimos

---

**Estado final**: 🟢 LISTO PARA VALIDAR
