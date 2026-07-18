# TENTARE — Contrato de integración (wedge de sustituciones sobre el Tentare existente)

*Este documento cierra el eslabón que faltaba entre el Documento de Arquitectura y la base de datos real en producción. El doc de arquitectura estaba escrito contra tablas (`clases`, `instructoras`, `alumnas_apuntadas`) que **no existen con ese nombre ni esa forma**. Aquí queda el mapeo real. Quien codee el módulo, codea contra esto — no contra el doc de arquitectura literal.*

**Verificado contra:** `origin/main`, migraciones `0000`–`0036` consolidadas. Migración del módulo: `0037_sustituciones_wedge.sql`.

---

## 1. Convenciones del repo (obligatorio respetarlas)

- **PK = `text`**, generada por la app (no hay `DEFAULT` en la BD). Al insertar, la app aporta el `id`.
- **Multi-tenant** = columna `studio_id text NOT NULL REFERENCES studios(id) ON DELETE CASCADE` en toda tabla de negocio.
- **RLS** = `CREATE POLICY ... TO authenticated USING (studio_id = current_studio_id()) WITH CHECK (...)`.
- **Grants** = `anon, authenticated, service_role`.
- El flujo servidor (cron, endpoints de token) corre con **service-role** → salta RLS. El panel lee con la sesión del estudio → RLS aplica.
- `current_studio_id()` resuelve el estudio del usuario autenticado (`supabase/schema.sql:918`).

---

## 2. Mapa doc de arquitectura → producción

| El doc asume | En producción es | Acción |
|---|---|---|
| `clases (fecha date, hora time, estado enum)` | **`sesiones`** — `instructor_id`, `tipo_clase_id`, `inicio`/`fin` **timestamptz**, `aforo_maximo`, `cancelada bool` (no hay enum de estado) | **Reutilizar** (read + un `UPDATE instructor_id` al confirmar) |
| `instructoras (especialidades, tarifa, horas_contratadas)` | **`instructores`** — `nombre, email, telefono, activo, rol, auth_user_id`. **Sin** especialidades, tarifa ni horas | Reutilizar; los tres campos se **derivan**, no se añaden (§4) |
| `alumnas_apuntadas int` | **`socios`** + **`reservas`** (`socio_id`+`sesion_id`, estado `CONFIRMADA/LISTA_ESPERA/ASISTIDA/CANCELADA/NO_ASISTIO`) | **Reutilizar** vía `alumnas_apuntadas(sesion_id)` |
| `historial_imparticion` (tabla) | No existe → derivar de `sesiones.instructor_id` | **No construir** |
| `horas_consumidas_mes` (columna mutable) | No existe → `instructor_horas_mes()` sobre `sesiones` | **No construir** |
| `disponibilidad` + excepciones | **No existe nada** de disponibilidad de staff | **Construir** (0037) |
| `studios`, `studio_id`, RLS | Igual | Seguir el patrón |

**Regalo:** `sesiones.inicio/fin` son **`timestamptz`** → el problema de DST/timezone que temía el doc **desaparece** para el solape de clases (comparación directa de `tstzrange`). Solo la disponibilidad *semanal* (día+hora local) necesita interpretarse en la zona del estudio.

---

## 3. La interfaz que el módulo consume del sistema existente (el adaptador)

Tres funciones SQL creadas en `0037` — son **todo** lo que el módulo lee del Tentare existente. Si mañana cambian los nombres de tabla, se tocan aquí y nada más:

```sql
alumnas_apuntadas(sesion_id)          -- → (socio_id, nombre, email, telefono)
                                      --   JOIN reservas→socios, estado='CONFIRMADA', no borradas
instructor_horas_mes(instructor_id)   -- → numeric: horas ya impartidas este mes (deriva de sesiones)
instructor_tiene_conflicto(instructor_id, inicio, fin, excluir_sesion?)
                                      -- → boolean: ¿ya tiene clase que solape? (anti-doble-reserva)
```

Reasignar la clase al confirmar (en la MISMA transacción que la aceptación atómica):
```sql
UPDATE sesiones SET instructor_id = :sustituta WHERE id = :sesion_id;
```
No existe un estado `'sustituida'` en `sesiones` (solo `cancelada bool`): "fue sustituida" vive en `sustituciones`, no en la sesión.

---

## 4. Las dos decisiones de scoring (resueltas: derivar de datos reales)

El scoring del §5 del doc de producto usa dos datos que **no existen** en `instructores`. Resueltas **sin columnas nuevas ni formularios que la dueña rellene**:

- **"−40 si no tiene la especialidad"** → cualificada para un tipo de clase = **ya ha impartido ≥1 sesión de ese `tipo_clase_id`** (histórico real de `sesiones`). Colapsa además con el "+10 ya conoce esta clase".
- **"+20 si lleva pocas horas este mes"** → ranking **relativo**: quien menos horas lleva este mes (`instructor_horas_mes`) se lleva el bonus. "Reparto justo" = "a quien menos ha trabajado", mejor que vs-contrato.

> Si en el futuro se quiere precisión (una instructora cualificada que aún no ha dado ese tipo aquí, o horas contratadas reales), se añaden columnas a `instructores`. **No se arranca con campos vacíos que nadie rellena.**

---

## 5. Tablas nuevas (migración 0037)

- `instructora_disponibilidad` — ventanas semanales (`dia_semana`, `hora_inicio/fin`).
- `instructora_disponibilidad_excepciones` — `bloqueo`/`extra` de fecha concreta.
- `sustituciones` — máquina de estados `buscando→pendiente_aprobacion→contactando→confirmada / sin_sustituta / resuelta_fuera / cancelada`. **Índice único parcial** sobre `sesion_id` (estados activos) = idempotencia: un doble-tap devuelve la existente.
- `sustitucion_contactos` — cada intento + `token` (deep link firmado, single-use, spec §3.1 del doc).

**Elegibilidad de candidata (§3.3 del doc), las tres comprobaciones:**
1. Ventana semanal cubre la franja (`instructora_disponibilidad`).
2. Sin `bloqueo` para esa fecha/franja (y un `extra` puede añadirla aunque la semanal no cubra).
3. `instructor_tiene_conflicto()` = false — no está ya dando otra clase.

**Aceptación atómica (§3.2):** un único `UPDATE ... WHERE estado='contactando'` (gana quien llega primero); 0 filas → "ya está cubierta". Reasignación de `sesiones` en la misma transacción. Vive en el endpoint, no en la migración.

---

## 6. Estado y siguiente paso

- [x] Esquema real verificado contra `origin/main` (0000–0036).
- [x] Migración `0037_sustituciones_wedge.sql` escrita (4 tablas + 3 funciones + RLS + grants; reversible).
- [ ] **Aplicar `0037`** a producción (Supabase) — paso irreversible, requiere OK explícito.
- [ ] Endpoint de baja (idempotente) + scoring con las 3 comprobaciones de elegibilidad.
- [ ] Onboarding mínimo: instructoras rellenan `instructora_disponibilidad` por deep link (sin esto no hay scoring).
- [ ] Flujo de una baja en **modo Asistido**, canal **email/Resend**, con aceptación atómica.

Fuera del primer slice (después): WhatsApp/SMS, modo autónomo/vacaciones, cron de recordatorios (min 10/25/30), TTS.
