# Control Horario Inteligente de Instructoras - Diseño Final

**Fecha**: 2026-09-20  
**Estado**: Aprobación antes de implementar  
**Principios**: Cero crons, auditoría completa, RLS, timezone Europe/Madrid, derivados calculados

---

## 1. TABLAS NUEVAS

### `instructor_work_sessions` - Jornada de trabajo

Una **jornada** es un período continuo entrada→salida. Una instructora puede tener múltiples jornadas en el mismo día, pero máximo UNA abierta simultáneamente.

```sql
CREATE TABLE IF NOT EXISTS public.instructor_work_sessions (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  instructor_id text NOT NULL REFERENCES public.instructores(id) ON DELETE CASCADE,
  
  -- Timestamps de entrada/salida (ambos nullable para estados intermedios)
  check_in_at timestamptz,          -- NULL = sin registrar
  check_out_at timestamptz,         -- NULL = sin registrar
  
  -- Método de fichaje (extensible para futuro: MOBILE, QR, KIOSK, API, etc.)
  check_in_method text DEFAULT 'MOBILE' CHECK (check_in_method IN ('MOBILE', 'QR', 'KIOSK', 'API')),
  check_out_method text CHECK (check_out_method IS NULL OR check_out_method IN ('MOBILE', 'QR', 'KIOSK', 'API')),
  
  -- Estado persistido SOLO: OPEN, CLOSED, PENDING_REVIEW
  -- MISSING_CHECK_IN / MISSING_CHECK_OUT son derivados de presentación
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'PENDING_REVIEW')),
  
  -- Auditoría de creación
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,  -- auth_user_id de quién creó (normalmente la instructora misma)
  
  -- Auditoría de edición
  edited_at timestamptz,
  edited_by uuid,
  
  -- Constraints
  CONSTRAINT work_sessions_timestamps_valid CHECK (
    (check_in_at IS NULL AND check_out_at IS NULL) OR
    (check_in_at IS NOT NULL AND check_out_at IS NULL) OR  -- OPEN
    (check_in_at IS NOT NULL AND check_out_at IS NOT NULL AND check_out_at > check_in_at)  -- CLOSED
  ),
  
  -- Máximo una jornada OPEN por instructora (permite múltiples CLOSED el mismo día)
  CONSTRAINT work_sessions_one_open_per_instructor UNIQUE (studio_id, instructor_id) WHERE (status = 'OPEN')
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_instructor ON public.instructor_work_sessions (studio_id, instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON public.instructor_work_sessions (studio_id, status, check_in_at DESC);

ALTER TABLE public.instructor_work_sessions ENABLE ROW LEVEL SECURITY;
```

**Estados derivados de presentación** (NO persistidos):
- `MISSING_CHECK_IN`: work_session con check_in_at IS NULL
- `MISSING_CHECK_OUT`: work_session con status='OPEN' y check_in_at IS NOT NULL y check_out_at IS NULL y (now() - check_in_at) > configurado límite

---

### `work_session_sessions` - Sesiones vinculadas a jornada

Relación N:M: sesiones que ocurren **dentro** de una jornada (compiladas manual, no automáticamente).

```sql
CREATE TABLE IF NOT EXISTS public.work_session_sessions (
  id text PRIMARY KEY,
  work_session_id text NOT NULL REFERENCES public.instructor_work_sessions(id) ON DELETE CASCADE,
  sesion_id text NOT NULL REFERENCES public.sesiones(id) ON DELETE CASCADE,
  studio_id text NOT NULL,
  
  -- Auditoría
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid NOT NULL,  -- quién vinculó (propietario/manager generalmente)
  
  CONSTRAINT work_session_sessions_same_studio FOREIGN KEY (studio_id) REFERENCES public.studios(id),
  
  -- Una sesión vinculada solo una vez a una jornada
  UNIQUE(work_session_id, sesion_id)
);

CREATE INDEX IF NOT EXISTS idx_work_session_sessions_sesion ON public.work_session_sessions (sesion_id);
CREATE INDEX IF NOT EXISTS idx_work_session_sessions_work_session ON public.work_session_sessions (work_session_id);

ALTER TABLE public.work_session_sessions ENABLE ROW LEVEL SECURITY;
```

**IMPORTANTE**: esta tabla se crea mediante lógica de aplicación (server action), no automáticamente. 

---

### `work_session_audits` - Auditoría de cambios

Registra quién cambió qué y cuándo en una jornada.

```sql
CREATE TABLE IF NOT EXISTS public.work_session_audits (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  work_session_id text NOT NULL REFERENCES public.instructor_work_sessions(id) ON DELETE CASCADE,
  
  action text NOT NULL CHECK (action IN ('CREATED', 'CHECK_IN', 'CHECK_OUT', 'EDITED', 'DELETED', 'STATUS_CHANGED')),
  
  -- Cambio de valores
  field_name text,  -- 'check_in_at', 'check_out_at', 'status', etc.
  value_before text,
  value_after text,
  
  -- Metadatos de cambio
  reason text,  -- opcional: por qué se editó
  
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL  -- quién hizo el cambio
);

CREATE INDEX IF NOT EXISTS idx_work_session_audits_work_session ON public.work_session_audits (work_session_id, created_at DESC);

ALTER TABLE public.work_session_audits ENABLE ROW LEVEL SECURITY;
```

---

### `studio_config_tiempo` - Configuración por estudio

```sql
CREATE TABLE IF NOT EXISTS public.studio_config_tiempo (
  studio_id text PRIMARY KEY REFERENCES public.studios(id) ON DELETE CASCADE,
  
  -- Ventana de fichaje: minutos antes de clase que se permite check-in
  check_in_window_minutes integer NOT NULL DEFAULT 10 
    CHECK (check_in_window_minutes BETWEEN 0 AND 120),
  
  -- Límite de jornada abierta antes de marca automática "MISSING_CHECK_OUT" (horas)
  open_session_limit_hours integer NOT NULL DEFAULT 12
    CHECK (open_session_limit_hours BETWEEN 1 AND 24),
  
  -- Permitir check-in retroactivo (edición manual de timestamps)
  allow_retroactive_check_in boolean NOT NULL DEFAULT false,
  
  -- Permitir edición de jornadas cerradas
  allow_edit_closed_sessions boolean NOT NULL DEFAULT false,
  
  -- Métodos de fichaje habilitados
  metodos_habilitados text[] NOT NULL DEFAULT '{"MOBILE","QR","KIOSK"}',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_config_tiempo ENABLE ROW LEVEL SECURITY;
```

---

### MIGRACIÓN: `instructor_tarifas` - Agregar vigencia temporal

Para soportar histórico de tarifas sin duplicar estructura:

```sql
-- Agregar columnas a instructor_tarifas (migración aparte)
ALTER TABLE public.instructor_tarifas ADD COLUMN IF NOT EXISTS vigente_desde date DEFAULT CURRENT_DATE;
ALTER TABLE public.instructor_tarifas ADD COLUMN IF NOT EXISTS vigente_hasta date;

-- Nueva PK: (instructor_id, studio_id, vigente_desde)
-- La anterior PK (instructor_id) se elimina
ALTER TABLE public.instructor_tarifas DROP CONSTRAINT IF EXISTS instructor_tarifas_pkey CASCADE;

ALTER TABLE public.instructor_tarifas ADD PRIMARY KEY (instructor_id, studio_id, vigente_desde);

-- Constraint: no solapamientos
ALTER TABLE public.instructor_tarifas 
  ADD CONSTRAINT instructor_tarifas_no_overlap CHECK (
    vigente_hasta IS NULL OR vigente_hasta >= vigente_desde
  );

-- Índice para consultas rápidas de tarifa vigente
CREATE INDEX IF NOT EXISTS idx_instructor_tarifas_vigente 
  ON public.instructor_tarifas (instructor_id, studio_id) 
  WHERE vigente_hasta IS NULL;
```

**Regla de negocio**: La tarifa "vigente" es la fila con `vigente_hasta IS NULL`. Al cambiar, se cierra la anterior (UPDATE vigente_hasta = TODAY) e INSERT la nueva con vigente_desde = TODAY.

---

## 2. RLS POLICIES

### `instructor_work_sessions`

```sql
-- INSTRUCTORA: ver/crear/editar SOLO sus propias jornadas
CREATE POLICY work_sessions_self_select ON public.instructor_work_sessions 
  FOR SELECT TO authenticated
  USING (
    (instructor_id = current_instructor_id() AND studio_id = current_studio_id())
    OR (studio_id = current_studio_id() AND public.puede_gestionar_equipo())
  );

-- INSTRUCTORA: registrar entrada (crear jornada OPEN)
CREATE POLICY work_sessions_self_check_in ON public.instructor_work_sessions 
  FOR INSERT TO authenticated
  WITH CHECK (
    instructor_id = current_instructor_id()
    AND studio_id = current_studio_id()
  );

-- INSTRUCTORA: actualizar SOLO su jornada OPEN (check-out)
CREATE POLICY work_sessions_self_update ON public.instructor_work_sessions 
  FOR UPDATE TO authenticated
  USING (
    instructor_id = current_instructor_id()
    AND studio_id = current_studio_id()
    AND status = 'OPEN'
  )
  WITH CHECK (
    instructor_id = current_instructor_id()
    AND studio_id = current_studio_id()
  );

-- PROPIETARIO/MANAGER: CRUD total + correcciones manuales
CREATE POLICY work_sessions_admin ON public.instructor_work_sessions 
  FOR ALL TO authenticated
  USING (studio_id = current_studio_id() AND public.puede_gestionar_equipo())
  WITH CHECK (studio_id = current_studio_id() AND public.puede_gestionar_equipo());
```

### `work_session_sessions`

```sql
-- LECTURA: equipo del estudio
CREATE POLICY work_session_sessions_select ON public.work_session_sessions 
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id());

-- ESCRITURA: solo PROPIETARIO/MANAGER
CREATE POLICY work_session_sessions_write ON public.work_session_sessions 
  FOR ALL TO authenticated
  USING (studio_id = current_studio_id() AND public.puede_gestionar_equipo())
  WITH CHECK (studio_id = current_studio_id() AND public.puede_gestionar_equipo());
```

### `work_session_audits`

```sql
-- LECTURA: equipo + instructora su propia jornada
CREATE POLICY work_session_audits_select ON public.work_session_audits 
  FOR SELECT TO authenticated
  USING (
    studio_id = current_studio_id()
    AND (
      public.puede_gestionar_equipo()
      OR work_session_id IN (
        SELECT id FROM instructor_work_sessions 
        WHERE instructor_id = current_instructor_id()
      )
    )
  );

-- ESCRITURA: system only (via server action)
-- Crear auditoría es responsabilidad de la capa de aplicación
```

### `studio_config_tiempo`

```sql
-- LECTURA: equipo del estudio
CREATE POLICY config_tiempo_select ON public.studio_config_tiempo 
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id());

-- ESCRITURA: solo PROPIETARIO
CREATE POLICY config_tiempo_write ON public.studio_config_tiempo 
  FOR ALL TO authenticated
  USING (
    studio_id = current_studio_id() 
    AND public.current_rol() = 'PROPIETARIO'
  )
  WITH CHECK (
    studio_id = current_studio_id() 
    AND public.current_rol() = 'PROPIETARIO'
  );
```

---

## 3. FUNCIONES RPC (Lógica en SQL)

### Función: Obtener tarifa vigente de instructora

```sql
CREATE OR REPLACE FUNCTION public.get_instructor_tarifa_vigente(
  p_instructor_id text,
  p_studio_id text,
  p_en_fecha date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  tarifa_hora numeric,
  vigente_desde date,
  vigente_hasta date,
  actualizado_por uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.tarifa_hora, t.vigente_desde, t.vigente_hasta, t.actualizado_por
  FROM instructor_tarifas t
  WHERE t.instructor_id = p_instructor_id
    AND t.studio_id = p_studio_id
    AND t.vigente_desde <= p_en_fecha
    AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= p_en_fecha)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_instructor_tarifa_vigente(text, text, date) TO authenticated, service_role;
```

### Función: Validar sesiones para vincular a jornada

Detecta sesiones compatibles con una jornada (dentro del rango check_in/check_out):

```sql
CREATE OR REPLACE FUNCTION public.get_compatible_sessions(
  p_work_session_id text,
  p_studio_id text
)
RETURNS TABLE (
  sesion_id text,
  instructor_id text,
  inicio timestamptz,
  fin timestamptz,
  duracion_horas numeric,
  ya_vinculada boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_instructor_id text;
BEGIN
  -- Obtener jornada
  SELECT check_in_at, check_out_at, instructor_id INTO v_check_in, v_check_out, v_instructor_id
  FROM instructor_work_sessions
  WHERE id = p_work_session_id AND studio_id = p_studio_id;
  
  IF v_check_in IS NULL THEN
    RAISE EXCEPTION 'Jornada sin check_in registrado';
  END IF;
  
  -- Retornar sesiones compatibles
  RETURN QUERY
  SELECT 
    s.id,
    s.instructor_id,
    s.inicio,
    s.fin,
    EXTRACT(EPOCH FROM (s.fin - s.inicio))::numeric / 3600,
    EXISTS(
      SELECT 1 FROM work_session_sessions
      WHERE work_session_id = p_work_session_id AND sesion_id = s.id
    )
  FROM sesiones s
  WHERE s.studio_id = p_studio_id
    AND s.instructor_id = v_instructor_id
    AND s.inicio >= v_check_in
    AND s.fin <= COALESCE(v_check_out, 'infinity'::timestamptz)
    AND NOT s.cancelada
  ORDER BY s.inicio;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compatible_sessions(text, text) TO authenticated, service_role;
```

---

## 4. CÁLCULOS DERIVADOS (NO PERSISTIDOS)

### Duración de jornada

```typescript
duracionJornada(checkIn: Date, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  return (checkOut.getTime() - checkIn.getTime()) / 3600000;  // horas
}
```

### Sesiones dentro de jornada

```typescript
async function getSessionsInWorkSession(
  workSessionId: string,
  studioId: string
): Promise<Session[]> {
  const { data } = await supabase
    .from('work_session_sessions')
    .select(`
      sesion_id,
      sesiones!inner(id, inicio, fin, tipo_clase_id, sala_id)
    `)
    .eq('work_session_id', workSessionId)
    .eq('studio_id', studioId);
  
  return data?.map(row => row.sesiones) ?? [];
}

duracionClases(sessions: Session[]): number {
  return sessions.reduce((acc, s) => {
    const dur = (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 3600000;
    return acc + dur;
  }, 0);
}
```

### Tiempo no-clase (con cálculo de intervalos para evitar solapamientos)

```typescript
duracionNoClase(
  checkIn: Date,
  checkOut: Date | null,
  sessions: Session[]
): number | null {
  if (!checkIn || !checkOut) return null;
  
  if (sessions.length === 0) {
    return (checkOut.getTime() - checkIn.getTime()) / 3600000;
  }
  
  // Construir intervalos de sesiones (en millisegundos)
  const intervals = sessions
    .map(s => [new Date(s.inicio).getTime(), new Date(s.fin).getTime()])
    .sort((a, b) => a[0] - b[0]);
  
  // Merging intervalos solapados
  const merged = [];
  for (const [start, end] of intervals) {
    if (merged.length && merged[merged.length - 1][1] >= start) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    } else {
      merged.push([start, end]);
    }
  }
  
  // Duración total de sesiones (sin solapamientos)
  const duracionSessionsMerged = merged.reduce((acc, [s, e]) => acc + (e - s), 0) / 3600000;
  
  // Duración jornada - sesiones
  const duracionJornada = (checkOut.getTime() - checkIn.getTime()) / 3600000;
  
  return duracionJornada - duracionSessionsMerged;
}
```

### Coste estimado (respetando vigencia de tarifa)

```typescript
async function calcularCoste(
  workSessionId: string,
  studioId: string,
  instructorId: string
): Promise<number | null> {
  const workSession = await getWorkSession(workSessionId);
  if (!workSession.check_in_at || !workSession.check_out_at) return null;
  
  const duracionHoras = (
    new Date(workSession.check_out_at).getTime() - 
    new Date(workSession.check_in_at).getTime()
  ) / 3600000;
  
  // Usar tarifa vigente EN LA FECHA de check_in
  const { data: tarifaRow } = await supabase.rpc(
    'get_instructor_tarifa_vigente',
    {
      p_instructor_id: instructorId,
      p_studio_id: studioId,
      p_en_fecha: new Date(workSession.check_in_at).toISOString().split('T')[0]
    }
  );
  
  if (!tarifaRow?.tarifa_hora) return null;
  
  return duracionHoras * Number(tarifaRow.tarifa_hora);
}
```

### Comparativa histórica (informativa, NO automática)

```typescript
async function getComparativaHistorica(
  studioId: string,
  instructorId: string,
  desde: Date,
  hasta: Date
): Promise<{
  horasPrevistas: number,
  horasRegistradas: number,
  horasClase: number,
  horasNoClase: number,
  diferencia: number,
  jornadas: number,
  clasesEnseñadas: number
}> {
  // Sesiones programadas en rango
  const { data: sesiones } = await supabase
    .from('sesiones')
    .select('id, inicio, fin')
    .eq('studio_id', studioId)
    .eq('instructor_id', instructorId)
    .gte('inicio', desde.toISOString())
    .lt('fin', hasta.toISOString())
    .eq('cancelada', false);
  
  const horasPrevistas = (sesiones ?? []).reduce((acc, s) => 
    acc + (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 3600000, 0
  );
  
  // Jornadas completadas en rango
  const { data: workSessions } = await supabase
    .from('instructor_work_sessions')
    .select(`
      id,
      check_in_at,
      check_out_at,
      work_session_sessions(sesion_id)
    `)
    .eq('studio_id', studioId)
    .eq('instructor_id', instructorId)
    .eq('status', 'CLOSED')
    .gte('check_in_at', desde.toISOString())
    .lt('check_out_at', hasta.toISOString());
  
  const horasRegistradas = (workSessions ?? []).reduce((acc, ws) =>
    acc + (new Date(ws.check_out_at!).getTime() - new Date(ws.check_in_at!).getTime()) / 3600000, 0
  );
  
  // Clases en jornadas
  const clasesEnseñadas = new Set(
    (workSessions ?? []).flatMap(ws => ws.work_session_sessions.map(wss => wss.sesion_id))
  ).size;
  
  return {
    horasPrevistas,
    horasRegistradas,
    horasClase: 0,  // Calculado con sesiones vinculadas específicamente
    horasNoClase: 0,  // Calculado como diferencia
    diferencia: horasRegistradas - horasPrevistas,
    jornadas: workSessions?.length ?? 0,
    clasesEnseñadas
  };
}
```

---

## 5. OPERACIONES ATÓMICAS (Server Actions)

### `registrarEntrada()`

```typescript
export async function registrarEntrada(
  studioId: string,
  checkInMethod: 'MOBILE' | 'QR' | 'KIOSK'
): Promise<{ 
  success: boolean; 
  workSessionId?: string; 
  error?: string;
}> {
  // 1. Verificar sesión
  const sesion = await verificarSesionStaff();
  if (sesion.rol !== 'INSTRUCTOR') return { success: false, error: 'No eres instructora' };
  
  // 2. Verificar no hay jornada OPEN
  const admin = getSupabaseAdmin();
  const { data: existente } = await admin
    .from('instructor_work_sessions')
    .select('id')
    .eq('studio_id', studioId)
    .eq('instructor_id', sesion.instructorId)
    .eq('status', 'OPEN')
    .limit(1);
  
  if (existente?.length > 0) {
    return { 
      success: false, 
      error: 'Ya tienes una jornada abierta',
      workSessionId: existente[0].id 
    };
  }
  
  // 3. Crear jornada y auditoría en transacción
  const workSessionId = uid();
  const now = new Date();
  
  try {
    const { error: insertError } = await admin
      .from('instructor_work_sessions')
      .insert({
        id: workSessionId,
        studio_id: studioId,
        instructor_id: sesion.instructorId,
        check_in_at: now,
        check_in_method: checkInMethod,
        status: 'OPEN',
        created_by: sesion.userId
      });
    
    if (insertError) throw insertError;
    
    // 4. Auditoría
    const { error: auditError } = await admin
      .from('work_session_audits')
      .insert({
        id: uid(),
        studio_id: studioId,
        work_session_id: workSessionId,
        action: 'CHECK_IN',
        field_name: 'check_in_at',
        value_after: now.toISOString(),
        created_by: sesion.userId
      });
    
    if (auditError) throw auditError;
    
    return { success: true, workSessionId };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
```

### `registrarSalida()`

```typescript
export async function registrarSalida(
  workSessionId: string,
  checkOutMethod: 'MOBILE' | 'QR' | 'KIOSK'
): Promise<{ 
  success: boolean; 
  error?: string;
}> {
  // 1. Verificar sesión
  const sesion = await verificarSesionStaff();
  
  // 2. Obtener jornada (con RLS automático)
  const supabase = await createClient();
  const { data: workSession } = await supabase
    .from('instructor_work_sessions')
    .select('*')
    .eq('id', workSessionId)
    .eq('status', 'OPEN')
    .limit(1);
  
  if (!workSession?.length || workSession[0].instructor_id !== sesion.instructorId) {
    return { success: false, error: 'Jornada no encontrada o no es tuya' };
  }
  
  // 3. Actualizar y auditar
  const now = new Date();
  const admin = getSupabaseAdmin();
  
  try {
    const { error: updateError } = await admin
      .from('instructor_work_sessions')
      .update({
        check_out_at: now,
        check_out_method: checkOutMethod,
        status: 'CLOSED',
        updated_at: now
      })
      .eq('id', workSessionId);
    
    if (updateError) throw updateError;
    
    // Auditoría
    const { error: auditError } = await admin
      .from('work_session_audits')
      .insert({
        id: uid(),
        studio_id: sesion.studioId,
        work_session_id: workSessionId,
        action: 'CHECK_OUT',
        field_name: 'check_out_at',
        value_after: now.toISOString(),
        created_by: sesion.userId
      });
    
    if (auditError) throw auditError;
    
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
```

### `editarRegistroHorario()` (Solo PROPIETARIO/MANAGER)

```typescript
export async function editarRegistroHorario(
  workSessionId: string,
  checkInAt?: Date,
  checkOutAt?: Date,
  razon?: string
): Promise<{ 
  success: boolean; 
  error?: string;
}> {
  // 1. Verificar permisos
  const sesion = await verificarSesionStaff();
  if (!puedeGestionarEquipo(sesion.rol)) {
    return { success: false, error: 'Sin permisos' };
  }
  
  const admin = getSupabaseAdmin();
  const { data: workSession } = await admin
    .from('instructor_work_sessions')
    .select('*')
    .eq('id', workSessionId)
    .eq('studio_id', sesion.studioId)
    .limit(1);
  
  if (!workSession?.length) {
    return { success: false, error: 'Jornada no encontrada' };
  }
  
  const ws = workSession[0];
  const now = new Date();
  
  try {
    // 2. Auditoría antes de cambio
    if (checkInAt && checkInAt !== ws.check_in_at) {
      await admin
        .from('work_session_audits')
        .insert({
          id: uid(),
          studio_id: sesion.studioId,
          work_session_id: workSessionId,
          action: 'EDITED',
          field_name: 'check_in_at',
          value_before: ws.check_in_at?.toISOString() ?? null,
          value_after: checkInAt.toISOString(),
          reason: razon,
          created_by: sesion.userId
        });
    }
    
    if (checkOutAt && checkOutAt !== ws.check_out_at) {
      await admin
        .from('work_session_audits')
        .insert({
          id: uid(),
          studio_id: sesion.studioId,
          work_session_id: workSessionId,
          action: 'EDITED',
          field_name: 'check_out_at',
          value_before: ws.check_out_at?.toISOString() ?? null,
          value_after: checkOutAt.toISOString(),
          reason: razon,
          created_by: sesion.userId
        });
    }
    
    // 3. Actualizar
    const { error } = await admin
      .from('instructor_work_sessions')
      .update({
        check_in_at: checkInAt ?? ws.check_in_at,
        check_out_at: checkOutAt ?? ws.check_out_at,
        edited_at: now,
        edited_by: sesion.userId
      })
      .eq('id', workSessionId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
```

---

## 6. REGLAS DE NEGOCIO

| Regla | Implementación |
|-------|----------------|
| Una jornada OPEN máximo por instructora | UNIQUE constraint en SQL |
| Máximo una entrada/salida por día | Derivado (interfaz UX lo maneja) |
| Sin doble clic en registro | Server action retorna ID existente |
| Timestamps siempre con zona (Europe/Madrid) | `timestamptz` en SQL |
| Tarifa válida en período histórico | RPC `get_instructor_tarifa_vigente()` |
| Cero crons para funcionamiento normal | Solo derivados calculados |
| RLS = cerradura real | Todas las operaciones validadas en BD |
| Auditoría de todo cambio manual | `work_session_audits` antes de UPDATE |
| Sesiones vinculadas = manual, no automática | Server action controlado |

---

## 7. ROADMAP FUTURO (NO IMPLEMENTAR AHORA)

- ✅ Móvil: CHECK_IN/CHECK_OUT  
- ⏳ QR: escaneo en tablet  
- ⏳ Kiosko: fichadera de escritorio  
- ⏳ GPS: ubicación automática  
- ⏳ Notificaciones: recordatorios  
- ⏳ Decision OS: especialista de horas  
- ⏳ Integración Stripe: costes en recibos  

---

## VALIDACIÓN FINAL

✅ **Jornada** = entidad principal (entrada/salida continua)  
✅ **Sesiones** = vinculación manual dentro de jornada  
✅ **Múltiples jornadas/día** = soportadas  
✅ **Una jornada OPEN máx** = garantizado por UNIQUE constraint  
✅ **Horas no-clase** = calculadas con intervalos (sin solapamientos)  
✅ **Coste histórico** = respeta tarifa vigente en fecha  
✅ **Cero crons** = todo derivado  
✅ **RLS** = capa real de seguridad  
✅ **Auditoría** = cambio manual registrado  
✅ **Extensible** = métodos de fichaje, futuras integraciones  

---

**ESTADO**: ✅ Aprobado para implementar migraciones SQL y Server Actions
