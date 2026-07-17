# FICHA CLÍNICA OPERATIVA — DISEÑO

**Versión:** 1.0 · **Fecha:** 12 julio 2026 · **Estado:** Pendiente de aprobación
**Branch:** `claude/clinical-health-tracker`

> **Qué es y qué NO es.** Es una **ficha operativa**, no una historia clínica médica. No diagnostica, no prescribe, no sustituye a un profesional sanitario. Su único fin es que la instructora sepa, en 5 segundos y sin buscar nada, **qué adaptar en la clase de hoy**. El semáforo y el riesgo son *ayudas de atención*, no dictámenes.
>
> **Principio rector (heredado de Decision OS):** todo lo que decide el sistema es **determinista y testeable**. El semáforo, el nivel de riesgo y las alertas se **calculan** con funciones puras sobre datos estructurados. La IA (§9) no participa en ninguna decisión clínica — solo **resume y redacta** hechos ya calculados para preparar la clase.
>
> **Dato sensible por diseño.** Es información de salud. El acceso está restringido (§11): PROPIETARIO e INSTRUCTOR ven el detalle; RECEPCIÓN solo ve el color del semáforo; la socia ve su propia ficha en el portal.

---

## 0. Alcance y mapeo al spec

Las 9 piezas del spec se agrupan en 6 unidades construibles:

| Spec | Pieza | Unidad de construcción |
|------|-------|------------------------|
| 2, 5 | Restricciones inteligentes + Perfil de entrenamiento | **Modelo de datos** — tabla `condiciones_salud` (episodios) + restricciones estructuradas por zona |
| 1, 8 | Semáforo + Riesgo | **`lib/ficha-clinica.ts`** — funciones puras con test (patrón `booking-logic.ts`) |
| 3 | Línea de tiempo | Render de `condiciones_salud` en `socios/[id]` |
| 1, 4 | Semáforo + alertas en clase | Roster del detalle de sesión en `calendario` + lista de `socios` |
| 6 | Evolución post-clase | Tabla `respuestas_sesion` (mejor/igual/molestias/dolor) + tendencia |
| 7 | IA prep de clase | `app/api/ai/ficha-clinica-clase` (clona el patrón de `instructor-note`) |
| 9 | Recordatorios | `revisar_en` → cron/inngest existente → `notificaciones` |

Lo que **ya existe** y reutilizamos (no reinventar):
- `notas_progreso` ya tiene `alertas`, `progreso`, `plan_proxima_sesion`, `ejercicios_casa` → base parcial de #4 y #6.
- `socios.fecha_nacimiento`, `socios.tags` (hay un tag suelto "Lesión"/"Embarazo", que **quedará derivado** del semáforo, no como fuente de verdad).
- Patrón IA JSON con Haiku: `app/api/ai/instructor-note/route.ts`, prompt compartido en `lib/ai/*`.
- Convenciones de tabla: migración `0003_decision_os.sql` (text PK, `studio_id` FK `ON DELETE CASCADE`, CHECK enums, índices parciales).
- `notificaciones` (título/texto/tipo/enlace) para los recordatorios.

---

## 1. Modelo de datos

Dos tablas nuevas para el núcleo (perfil + restricciones + timeline) y una para la evolución. Reversibles: su `DROP` no toca ninguna tabla existente. Migración `0004_ficha_clinica.sql`.

### 1.1 `condiciones_salud` — episodios del perfil (spec #3, #5)

Cada fila es un **episodio** en la vida de la socia: una lesión, un embarazo, una condición crónica. La línea de tiempo (§6) es, literalmente, el `SELECT ... ORDER BY inicio`.

```sql
CREATE TABLE public.condiciones_salud (
    id           text PRIMARY KEY,
    studio_id    text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    socio_id     text NOT NULL REFERENCES public.socios(id)  ON DELETE CASCADE,
    categoria    text NOT NULL CHECK (categoria IN
                   ('LESION','EMBARAZO','POSTPARTO','CRONICA','PROTESIS','OTRO')),
    etiqueta     text NOT NULL,                 -- "Tendinitis hombro dcho", "Escoliosis", ...
    zona         text CHECK (zona IN            -- NULL cuando no aplica (p.ej. hipertensión)
                   ('RODILLA','COLUMNA','HOMBRO','CADERA','CUELLO','MUNECA','TOBILLO','GENERAL')),
    restricciones text[] NOT NULL DEFAULT '{}', -- códigos de §2 (no texto libre)
    severidad    text NOT NULL DEFAULT 'MEDIA' CHECK (severidad IN ('LEVE','MEDIA','ALTA')),
    estado       text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','RESUELTA')),
    inicio       date NOT NULL,
    fin          date,                          -- alta médica / resolución; NULL = en curso
    revisar_en   date,                          -- para recordatorios (§10)
    notas        text,                          -- contexto libre, opcional
    creado_por   text,                          -- instructor_id que la registró
    creado_en    timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);
CREATE INDEX condiciones_socio      ON public.condiciones_salud (socio_id, inicio DESC);
CREATE INDEX condiciones_activas    ON public.condiciones_salud (studio_id, estado) WHERE estado = 'ACTIVA';
CREATE INDEX condiciones_revision   ON public.condiciones_salud (studio_id, revisar_en) WHERE revisar_en IS NOT NULL AND estado = 'ACTIVA';
```

**Decisión — restricciones como `text[]` de códigos, no tabla normalizada.** Para el MVP, un array de códigos validados en el catálogo (§2) sobre la condición es suficiente y evita un JOIN por socia en el roster (patrón anti-N+1 de la casa). Si post-MVP necesitamos filtrar "todas las socias con NO_SALTOS" a escala, se normaliza. La validación del código vive en `lib/ficha-clinica.ts`, no en la BD (igual que los enums de negocio de la casa).

### 1.2 `respuestas_sesion` — evolución post-clase (spec #6)

```sql
CREATE TABLE public.respuestas_sesion (
    id          text PRIMARY KEY,
    studio_id   text NOT NULL REFERENCES public.studios(id)  ON DELETE CASCADE,
    socio_id    text NOT NULL REFERENCES public.socios(id)   ON DELETE CASCADE,
    sesion_id   text REFERENCES public.sesiones(id) ON DELETE SET NULL,
    respuesta   text NOT NULL CHECK (respuesta IN ('MEJOR','IGUAL','MOLESTIAS','DOLOR')),
    nota        text,
    creado_por  text,                           -- instructor_id
    creado_en   timestamptz DEFAULT now()
);
CREATE INDEX respuestas_socio ON public.respuestas_sesion (socio_id, creado_en DESC);
```

> **Por qué tabla propia y no un campo en `notas_progreso`.** `notas_progreso` es la nota narrativa de la instructora (una por sesión, texto libre). La respuesta es un dato **categórico de 1 clic** cuyo valor está en la **serie temporal** (la tendencia MEJOR→IGUAL→MOLESTIAS es la señal). Separarla mantiene ambas limpias y hace trivial la gráfica de evolución.

### 1.3 Tipos (`lib/types.ts`)

```ts
export type CategoriaCondicion = 'LESION'|'EMBARAZO'|'POSTPARTO'|'CRONICA'|'PROTESIS'|'OTRO';
export type ZonaCorporal = 'RODILLA'|'COLUMNA'|'HOMBRO'|'CADERA'|'CUELLO'|'MUNECA'|'TOBILLO'|'GENERAL';
export type SeveridadCondicion = 'LEVE'|'MEDIA'|'ALTA';
export type EstadoCondicion = 'ACTIVA'|'RESUELTA';
export type RespuestaSesion = 'MEJOR'|'IGUAL'|'MOLESTIAS'|'DOLOR';
export type NivelSemaforo = 'VERDE'|'AMBAR'|'ROJO';
export type NivelRiesgo = 'BAJO'|'MEDIO'|'ALTO';

export interface CondicionSalud { /* espejo de la tabla, camelCase */ }
export interface RespuestaSesionRow { /* idem */ }
```

---

## 2. Restricciones inteligentes (spec #2)

En vez de texto libre, un **catálogo cerrado de códigos por zona**. Esto es lo que hace posible generar alertas automáticas (§7) — el sistema *entiende* la restricción.

```ts
// lib/ficha-clinica.ts
export const RESTRICCIONES: Record<ZonaCorporal, { codigo: string; etiqueta: string }[]> = {
  RODILLA:  [{ codigo:'NO_SALTOS', etiqueta:'No saltos' },
             { codigo:'NO_FLEXION_PROFUNDA', etiqueta:'No flexión profunda' },
             { codigo:'NO_ARRODILLARSE', etiqueta:'No arrodillarse' }],
  COLUMNA:  [{ codigo:'EVITAR_FLEXION', etiqueta:'Evitar flexión' },
             { codigo:'EVITAR_EXTENSION', etiqueta:'Evitar extensión' },
             { codigo:'EVITAR_ROTACION', etiqueta:'Evitar rotación' }],
  HOMBRO:   [{ codigo:'NO_ELEVACION_90', etiqueta:'No elevación por encima de 90°' },
             { codigo:'EVITAR_CARGA', etiqueta:'Evitar carga' }],
  // CADERA, CUELLO, MUNECA, TOBILLO, GENERAL: se completan en Fase 1 con
  // la lista que valide la propietaria (es contenido, no arquitectura).
};
```

La UI de restricciones es un selector de chips por zona, no un `<textarea>`. El campo `notas` de la condición queda para el matiz que no cabe en un código.

---

## 3. Perfil de entrenamiento (spec #5)

No solo lesiones. El catálogo `categoria` + `etiqueta` cubre lo que el spec pide: **embarazo, postparto, osteoporosis, hipertensión, prótesis, hernia, escoliosis, diástasis, vértigos**. Todo lo que influye en la clase es una `condicion_salud`; las que no tienen zona corporal (hipertensión, vértigos) llevan `zona = NULL` y `categoria = 'CRONICA'`.

El embarazo es un caso con semántica propia (§4, §5): `categoria = 'EMBARAZO'`, y si la instructora anota semanas en `notas`/`etiqueta`, la alerta lo muestra ("embarazo de 22 semanas").

---

## 4. Semáforo de salud (spec #1) — **función pura, testeable**

Lo primero que ve la instructora en la lista de alumnas. Se **deriva**, no se guarda:

```ts
// lib/ficha-clinica.ts
export function semaforo(condiciones: CondicionSalud[], hoy: Date): NivelSemaforo {
  const activas = condiciones.filter(c => c.estado === 'ACTIVA');
  if (activas.length === 0) return 'VERDE';
  // ROJO: hay al menos una restricción "dura" activa o severidad ALTA
  //       → "no realizar determinados movimientos"
  if (activas.some(c => c.severidad === 'ALTA' || tieneRestriccionDura(c))) return 'ROJO';
  // ÁMBAR: hay condiciones activas pero solo requieren adaptar
  return 'AMBAR';
}
```

- 🟢 **VERDE** — sin condiciones activas → sin restricciones.
- 🟡 **ÁMBAR** — condiciones activas que piden *adaptar* algunos ejercicios (severidad LEVE/MEDIA, restricciones "evitar…").
- 🔴 **ROJO** — severidad ALTA **o** alguna restricción dura (`NO_*`) → *no realizar* determinados movimientos.

Con un clic, la instructora ve el **motivo** (las condiciones activas y sus restricciones). El tag suelto "Lesión"/"Embarazo" de `socios.tags` pasa a **derivarse** de aquí (o se retira), para que no haya dos fuentes de verdad.

---

## 5. Riesgo (spec #8) — **función pura, testeable**

Un indicador de *cuánta atención* prestar, no un diagnóstico. Barra de 0–10 → BAJO / MEDIO / ALTO.

```ts
export function nivelRiesgo(condiciones, respuestasRecientes, hoy): { nivel: NivelRiesgo; score: number } {
  // Suma acotada de señales objetivas:
  //  + severidad de cada condición activa (ALTA=3, MEDIA=2, LEVE=1)
  //  + nº de restricciones duras activas
  //  + tendencia de respuestas recientes (DOLOR/MOLESTIAS repetidos suben)
  //  + condición sin revisar hace > N días (revisar_en vencido)
  // score → BAJO (0-3) / MEDIO (4-6) / ALTO (7-10)
}
```

Determinista y explicable: la barra siempre puede desglosar *por qué* está donde está. Nunca se presenta como dictamen médico — copy explícito: *"ayuda a prestar más atención"*.

---

## 6. Línea de tiempo (spec #3)

En `socios/[id]`, nueva pestaña **"Salud"**. Render vertical de `condiciones_salud ORDER BY inicio`:

```
2025
├── Tendinitis hombro        ACTIVA · 2 meses      🔴
├── Alta médica              (fin de la anterior)
├── Embarazo                 ACTIVA · 22 sem        🟡
└── Recuperación postparto   …
```

Cada hito abre el editor de la condición (restricciones, severidad, `revisar_en`, alta). El "alta médica" es simplemente poner `fin` y `estado = RESUELTA`.

---

## 7. Alertas antes de la clase (spec #4)

Cuando la instructora abre una sesión en `calendario`, el roster muestra, junto a cada alumna con condiciones activas, un aviso derivado — **sin buscar nada**:

```
⚠️ Ana — Lesión lumbar. Evitar flexión. Revisar el 20 ago.
```

Se construye con una función pura `alertaPreClase(socio, condiciones, hoy)` que compone: nombre + etiqueta de la condición de mayor severidad + sus restricciones legibles + fecha de revisión si está próxima/vencida. Cero coste de IA; es formateo de datos ya estructurados.

---

## 8. Evolución post-clase (spec #6)

Tras una sesión, junto a cada alumna asistida, 4 botones de 1 clic: **Mejor · Igual · Molestias · Dolor** → inserta en `respuestas_sesion`. En `socios/[id]` se ve la **tendencia** (sparkline / lista) y alimenta el riesgo (§5). La instructora también puede añadir una nota corta.

---

## 9. IA — prep de clase (spec #7) — el "wow"

Nuevo endpoint `app/api/ai/ficha-clinica-clase/route.ts`, clonando el patrón exacto de `instructor-note` (Anthropic Haiku, respuesta JSON estricta, `verificarSesionStaff`). Prompt compartido en `lib/ai/ficha-clinica-clase-prompt.ts` (patrón `recomendacion-prompt.ts`).

**Entrada — hechos ya calculados en el servidor, no datos crudos:** el resumen agregado del roster (nº de alumnas, condiciones activas por zona/categoría, semanas de embarazo, semáforos). La IA **no accede a la BD ni decide nada clínico** — recibe el agregado y produce:

```json
{ "resumen": "Hoy tienes 10 alumnas: 2 con problemas lumbares, 1 embarazo de 22 semanas, 1 recuperación de hombro.",
  "evitar": ["flexión profunda de columna", "carga en hombro derecho"],
  "variantes": ["Para lumbares: … ", "Para embarazo 22 sem: …"] }
```

Salvaguardas: copy "sugerencia, revísala"; nunca nombres de socias hacia fuera; el agregado se calcula con las funciones puras de §4–§7 (la IA solo pone palabras).

---

## 10. Recordatorios automáticos (spec #9)

`condiciones_salud.revisar_en` vencido (o condición activa sin revisión > N días) genera un aviso en `notificaciones` (*"Esta lesión de Ana lleva 90 días sin revisión — solicitar actualización"*), reutilizando el **cron/inngest existente** (`app/api/cron/*`, patrón de `barrerNoShows` / `enviarRecordatoriosClasesProximas` en `supabase-data.ts`). Regla pura y testeable `recordatoriosRevision(condiciones, hoy)`; el cron solo la ejecuta y persiste.

---

## 11. Privacidad y control de accesos (decisión aprobada)

Dato de salud → acceso restringido. **PROPIETARIO + INSTRUCTOR** ven el detalle clínico; **RECEPCIÓN** ve solo el **color del semáforo** (no el motivo ni las condiciones); la **socia ve su propia ficha** en el portal.

- **Servidor (fuente de verdad):** los endpoints/queries de ficha clínica verifican rol vía `verificarSesionStaff` y **excluyen el detalle para RECEPCIÓN** — no basta con ocultarlo en el cliente. La query pública del portal (`fetchPublicStudioData` / rutas `app/api/public/*`) devuelve **solo la ficha de la socia autenticada**.
- **Cliente:** `lib/permisos.ts` gana un helper `puedeVerFichaClinica(rol)` (`true` para PROPIETARIO/INSTRUCTOR). RECEPCIÓN ve el punto de color, sin panel de detalle.
- **Auditoría:** registrar en `notas_internas` (tipo `SISTEMA`) o `actividad_reciente` quién crea/edita una condición, por trazabilidad de dato sensible.
- **Consentimiento:** el copy deja claro que es una ficha operativa del estudio, no una historia clínica; la socia puede ver/solicitar corrección de sus datos desde el portal.

---

## 12. Roadmap por fases (aprobación entre fases)

| Fase | Contenido | Entregable | Spec |
|------|-----------|-----------|------|
| **1 — Núcleo "wow"** | Migración `0004` (`condiciones_salud`) · tipos · data layer · `lib/ficha-clinica.ts` (semáforo, riesgo, restricciones, alertas) **con tests** · pestaña Salud en `socios/[id]` (perfil + restricciones + timeline) · semáforo en lista de socios · semáforo + alertas en roster de `calendario` · gating de RECEPCIÓN | Instructora abre la clase y ve en 5 s qué adaptar | 1,2,3,4,5,8,11 |
| **2 — Evolución** ✅ | Tabla `respuestas_sesion` · botones 1 clic post-clase en el roster de `calendario` (solo ASISTIDA) · tendencia (emojis) en la pestaña Salud · realimenta el riesgo (últimas 3 respuestas) | Seguimiento en el tiempo | 6 |
| **3 — IA prep** ✅ | `resumenSaludClase()` (agregado anónimo, puro+test) · `lib/ai/ficha-clinica-clase-prompt.ts` · `app/api/ai/ficha-clinica-clase` (Haiku) · botón "Preparar clase con IA" en el roster. Requiere `ANTHROPIC_API_KEY`. | El efecto "wow" | 7 |
| **4 — Recordatorios** | `recordatoriosRevision` (pura + test) · enganche al cron existente · avisos en `notificaciones` | El sistema recuerda hacer seguimiento | 9 |

Cada fase: PR propio, tests verdes, revisión antes de la siguiente. **Fase 1 es la que convierte el SaaS en herramienta de trabajo diaria** — el resto amplifica.

---

## 13. Superficie de archivos (Fase 1)

**Nuevos**
- `supabase/migrations/0004_ficha_clinica.sql`
- `lib/ficha-clinica.ts` + `lib/ficha-clinica.test.ts`

**Modificados**
- `lib/types.ts` — tipos §1.3
- `lib/supabase-data.ts` — `dbInsert/Update/DeleteCondicion`, carga en `fetchCriticalStudioData` (o deferred), map camelCase
- `lib/db-types.ts` — filas nuevas
- `lib/permisos.ts` — `puedeVerFichaClinica(rol)`
- `app/(dashboard)/socios/[id]/page.tsx` — pestaña "Salud" (timeline + editor)
- `app/(dashboard)/socios/page.tsx` — punto de semáforo en la lista
- `app/(dashboard)/calendario/page.tsx` — semáforo + alertas en el roster de la sesión

> ⚠️ **Recordatorio del repo (AGENTS.md):** este Next.js (16.2.9) tiene cambios de ruptura. Antes de tocar rutas/API/estructura de archivos en implementación, leer la guía correspondiente en `node_modules/next/dist/docs/`.

---

## 14. Preguntas abiertas para la propietaria

1. **Catálogo de restricciones** por zona (§2) — ¿la lista de arriba es la buena, o hay movimientos propios del reformer que añadir? (Es contenido, se ajusta sin tocar arquitectura.)
2. **Umbral de "sin revisión"** (§10) — ¿90 días como en el spec, configurable por estudio?
3. **Diástasis / suelo pélvico** — ¿categoría propia o dentro de POSTPARTO/CRONICA?
4. **Retención del dato** cuando una socia se da de baja — ¿se conserva el historial o se anonimiza pasado X tiempo? (RGPD, dato de salud.)
```
