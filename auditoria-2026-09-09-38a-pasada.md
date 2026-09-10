# Auditoría Tentare — 38ª pasada (9 sep 2026)

**Área elegida: Ficha Clínica / datos de salud (RGPD art. 9)** — `condiciones_salud`,
`respuestas_sesion`, `respuestas_cuestionario_salud`, `notas_progreso`,
`lib/ficha-clinica.ts`, `components/socios/ficha-salud.tsx`, `app/api/socios/eliminar`.

**Por qué esta área y no otra.** Las 37 pasadas previas ya cubrieron de forma exhaustiva
POS/Bizum, SEPA/dunning/liquidaciones, gamificación por créditos, checkout de
planes/matrícula/consentimiento legal, OAuth 2.0 + Comunidad, Veri*Factu, reservas/
cancelaciones/penalizaciones (Fases 1-3, 8+ pasadas), Tentare Network y Decision OS —
todas cerradas o confirmadas exhaustivas en `.claude/tentare-os.md`. La ficha clínica
nunca ha sido el foco explícito de una pasada completa, y `git log` sobre las tablas de
salud muestra actividad muy reciente y densa: tres migraciones en agosto
(`20260812200000`, `20260829235608`, `20260831075322`) endureciendo exactamente el mismo
patrón de bug que este repo ya lleva documentado varias veces —"se cierra una tabla
gemela y se deja la otra"— lo que sugería (acertadamente) que quedaba algún gemelo suelto.
Es además dato de categoría especial (art. 9 RGPD), la clase de hallazgo con más coste
legal por fila si está mal, no solo por volumen.

**Método.** Lectura de las 12 migraciones de salud (`0004`, `0030`, `0095`, `0138`,
`0140`, `20260729161000`, `20260729170000`, `20260730108000`, `20260804201830`,
`20260812200000`, `20260829235608`, `20260831075322`), cruce con `lib/supabase-data.ts`,
`components/socios/ficha-salud.tsx`, `app/(dashboard)/calendario/page.tsx`,
`lib/permisos-reglas.ts`, `app/api/socios/eliminar/route.ts` y los dos endpoints de IA
clínica. Sin acceso a Supabase MCP en esta sesión (agente sin esas herramientas
declaradas) — todo verificado por lectura de código y migraciones aplicadas, no contra
producción en vivo; donde no pude confirmar en vivo lo digo explícitamente.

**Lo bueno primero, para no repetirlo como si fuera nuevo.** El patrón "gemelo sin
cerrar" para `condiciones_salud` (C-3, 29-ago) y `respuestas_cuestionario_salud` (31-ago)
está genuinamente cerrado: las cuatro operaciones (SELECT/INSERT/UPDATE/DELETE) de ambas
tablas comprueban rol + `tiene_consentimiento_salud(socio_id)`; el `SECURITY DEFINER`
`semaforo_salud_estudio` también lo comprueba (no solo la RLS, que él se salta); el cron
de recordatorios (`generarRecordatoriosRevision`) filtra explícitamente por consentimiento
porque usa service-role y se saltaría la RLS si no lo hiciera; `tiene_consentimiento_salud`
tiene el `REVOKE FROM anon, PUBLIC` que este repo tantas veces ha olvidado en otras
funciones `SECURITY DEFINER`; y `/api/socios/eliminar` borra las tres tablas sensibles
más `documentos_socio` (con su objeto en Storage) antes de anonimizar, en el orden
correcto. Es trabajo real y no hacía falta repetirlo.

---

## 🟠 IMPORTANTES

### [S-1] `respuestas_sesion` es el tercer gemelo — nunca recibió el gate de consentimiento que sí tienen sus dos hermanas

**Severidad:** 🟠 · **Área:** RGPD / datos de salud · **Estado:** ⏳ pendiente

**Archivos:** `supabase/migrations/0095_rls_salud_por_rol.sql:25-27` (RLS actual, sin
tocar desde entonces) · `lib/supabase-data.ts:3893-3901` (`dbInsertRespuestaSesion`/
`dbUpdateRespuestaSesion`) · `app/(dashboard)/calendario/page.tsx:2851-2872` (UI de
escritura) · `lib/ficha-clinica.ts:148-173` (`nivelRiesgo`, consume la tabla) ·
`docs/FICHA-CLINICA.md:24` (la incluye expresamente en el mismo conjunto de datos que
`condiciones_salud`).

**Qué es la tabla.** `respuestas_sesion` guarda, por socia y por clase, si tras la
sesión estuvo MEJOR/IGUAL/con MOLESTIAS/con DOLOR (§8 de FICHA-CLINICA.md, "Evolución
post-clase"). Es dato de salud tan sensible como una condición estructurada — de hecho
es la señal que más rápido delata un problema real ("dolor" tras tres clases seguidas) —
y `nivelRiesgo()` la usa directamente para calcular el score de riesgo que ven
PROPIETARIO/INSTRUCTOR en la ficha.

**El gemelo que sí se cerró, dos veces.** Esta misma pasada de auditorías cerró
exactamente este bug para sus dos tablas hermanas:

- `condiciones_salud`: 4 policies con `tiene_consentimiento_salud(socio_id)` (C-3,
  29-ago-2026, migración `20260829235608`).
- `respuestas_cuestionario_salud`: mismo arreglo, mismo día casi (31-ago-2026,
  migración `20260831075322`), con el comentario propio de la migración diciendo
  literalmente *"Es el fallo de gemelos de siempre: se cerró una tabla y no la
  hermana"*.

`respuestas_sesion` es la TERCERA tabla con la misma forma (misma RLS original en
`0095_rls_salud_por_rol.sql`, mismas cuatro operaciones, mismo criterio de rol
PROPIETARIO/INSTRUCTOR) y **nunca recibió el `and tiene_consentimiento_salud(socio_id)`**
en ninguna de las dos rondas de endurecimiento. La propia `0095` la creó con la RLS
gemela de `condiciones_salud` y `notas_progreso` en la misma migración, y desde entonces
nadie ha vuelto a tocarla.

**Cómo se explota / cuándo ocurre.** Sin ninguna acción maliciosa: es el camino normal
del producto. En el roster de `/calendario`, para cualquier sesión ya `ASISTIDA`, el
`INSTRUCTOR` (o PROPIETARIO) ve cuatro botones (MEJOR/IGUAL/MOLESTIAS/DOLOR,
`app/(dashboard)/calendario/page.tsx:2851-2872`) y puede marcar la respuesta de
cualquier socia con un solo clic — **sin que exista, en ningún punto del camino, una
comprobación de si esa socia ha dado consentimiento de tratamiento de datos de salud**:

- La RLS de la tabla (`salud_respuestas_sesion`, `for all`) solo mira
  `studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR')`.
- `dbInsertRespuestaSesion`/`dbUpdateRespuestaSesion` (`lib/supabase-data.ts:3893-3901`)
  no comprueban nada en TS tampoco.
- La UI no muestra el diálogo de consentimiento (`ConsentimientoSaludDialog`) antes de
  estos botones — a diferencia del cuestionario de salud (misma pantalla de ficha,
  `ficha-salud.tsx:657-663`) y de "Añadir condición" (`ficha-salud.tsx:495-502`), que sí
  lo piden.

El resultado: una socia que **nunca ha dado consentimiento art. 9** (o a la que se le
revocó, `consentimiento_salud_revocado_en`) puede acumular un histórico completo de
"dolor"/"molestias" tras cada clase, tratado sin base legal registrada — exactamente el
mismo hallazgo que C-3 documentó como "Alto" para `condiciones_salud`, aquí sin cerrar.
Y ese histórico **sigue alimentando el score de riesgo** (`nivelRiesgo`,
`lib/ficha-clinica.ts:166`) que ve el staff con acceso a la ficha, con datos que — si la
socia nunca consintió — no deberían ni estar ahí.

**Por qué no lo arreglo yo directamente (igual que C-3).** Añadir el gate de
consentimiento a las 4 policies de `respuestas_sesion` cambia comportamiento visible: si
hoy hay filas reales de socias sin consentimiento (no lo he podido comprobar sin acceso
a Supabase en esta sesión — recomiendo la misma consulta que usó C-3, cruzando
`respuestas_sesion` con `socios.consentimiento_salud_fecha`), ese histórico dejaría de
verse hasta que se registre el consentimiento. Es una decisión de negocio con
implicación legal, igual que C-3 lo fue.

**Arreglo propuesto** (mismo patrón que las dos migraciones ya mergeadas, para que las
tres tablas queden con el mismo criterio):

```sql
drop policy if exists salud_respuestas_sesion on public.respuestas_sesion;

create policy salud_respuestas_sesion_lectura on public.respuestas_sesion
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR')
         and tiene_consentimiento_salud(socio_id));

create policy salud_respuestas_sesion_insert on public.respuestas_sesion
  for insert to authenticated
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR')
              and tiene_consentimiento_salud(socio_id));

create policy salud_respuestas_sesion_update on public.respuestas_sesion
  for update to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR')
              and tiene_consentimiento_salud(socio_id))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR')
              and tiene_consentimiento_salud(socio_id));

create policy salud_respuestas_sesion_delete on public.respuestas_sesion
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR')
         and tiene_consentimiento_salud(socio_id));
```

Y en la UI, ocultar/deshabilitar los cuatro botones de evolución cuando
`!socio?.consentimientoSalud`, con el mismo `ConsentimientoSaludDialog` que ya usan
`abrirNueva()` y el cuestionario, para no dejar un botón que la RLS va a rechazar en
silencio (mismo criterio que el resto del repo: "un botón que la base de datos va a
rechazar es justo lo que esta lista existe para evitar").

---

## 🟡 MENORES

### [S-2] `MANAGER` no ve ni el color del semáforo de salud, pese a poder gestionar y editar la ficha completa de cualquier clienta

**Severidad:** 🟡 · **Área:** consistencia de permisos · **Estado:** para confirmar con
producto, no está claro que sea un descuido y no una decisión

**Archivos:** `lib/permisos-reglas.ts:89-100` (`puedeVerFichaClinica`/
`puedeVerSemaforo`) · `lib/permisos-reglas.ts:145-146` (`puedeGestionarClientas`,
incluye MANAGER) · `lib/permisos-reglas.ts:128-129` (`puedeGestionarCalendario`,
incluye MANAGER).

**Qué ocurre.** `puedeVerFichaClinica` y `puedeVerSemaforo` solo devuelven `true` para
`PROPIETARIO`/`INSTRUCTOR` (y `RECEPCION` en el caso del semáforo). `MANAGER` está
excluido de las dos — ni siquiera ve el punto de color. Pero `MANAGER` **sí** puede:
gestionar clientas por completo (`puedeGestionarClientas`, editar/dar de baja/asignar
plan a cualquier socia), gestionar el calendario (`puedeGestionarCalendario`, ver y
mover cualquier clase, con acceso al roster de asistentes), y gestionar el equipo. Es
decir: un rol con más autoridad operativa que RECEPCIÓN sobre la ficha de la clienta
tiene MENOS visibilidad de seguridad (ni el color) que RECEPCIÓN, que sí lo ve desde el
30-jul-2026 (`e1d66301`, "RECEPCIÓN no veía el semáforo de salud pese a que la política
dice que debería").

**Por qué lo marco como duda y no como bug cerrado.** El propio `FICHA-CLINICA.md` (§11,
escrito antes de que `MANAGER` tuviera el reparto de permisos actual) solo enumera
PROPIETARIO/INSTRUCTOR/RECEPCIÓN — nunca menciona MANAGER, ni para incluirlo ni para
excluirlo explícitamente. El commit que arregló el hueco de RECEPCIÓN (`e1d66301`) tampoco
menciona a MANAGER. No hay ninguna decisión documentada que diga "MANAGER queda fuera a
propósito" (a diferencia de otras exclusiones de MANAGER en este mismo fichero, que sí
llevan comentario explicando el motivo). Es consistente en las dos capas (UI y RLS
excluyen a MANAGER por igual, no hay fuga), así que no es un agujero de seguridad — es una
inconsistencia de producto que vale la pena confirmar: si un `MANAGER` de sede necesita
saber que una clienta está embarazada o lesionada antes de moverla a una clase de
impacto alto (lo mismo que ya se decidió que RECEPCIÓN necesita), falta una línea en las
dos funciones; si es intencionado (MANAGER no trata con clínica en ninguna sede, solo
opera el calendario/equipo), merece un comentario que lo diga, como ya llevan las demás
exclusiones de MANAGER en este fichero.

**Arreglo propuesto (si se confirma que es un descuido):**

```ts
export function puedeVerSemaforo(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'INSTRUCTOR' || rol === 'RECEPCION' || rol === 'MANAGER';
}
```

(y la RLS de `semaforo_salud_estudio`, que ya comprueba el rol dentro de la función,
necesitaría el mismo añadido si se decide que sí).

---

## Lo que miré y NO es un hallazgo nuevo

- **`condiciones_salud`/`respuestas_cuestionario_salud`**: las cuatro operaciones de
  ambas ya comprueban consentimiento (C-3 y su cierre del 31-ago). Confirmado leyendo
  las migraciones `20260829235608` y `20260831075322` completas, no solo el commit.
- **`tiene_consentimiento_salud`**: `REVOKE FROM anon, PUBLIC` ya aplicado
  (`20260729161000`), así que no es enumerable por un cliente sin sesión.
- **`generarRecordatoriosRevision`** (cron de revisión): ya filtra por consentimiento a
  mano porque corre con service-role y se saltaría la RLS — arreglado también en la
  ronda C-3, con comentario propio explicando por qué hace falta duplicarlo ahí.
- **`app/api/socios/eliminar`**: borra las tres tablas sensibles (incluida
  `respuestas_sesion`, curiosamente sí incluida aquí aunque no en el gate de lectura) más
  `documentos_socio` + su objeto en Storage, en el orden correcto, y revoca el
  consentimiento al anonimizar. Ya cerrado por I-14 (29-ago).
- **`app/(dashboard)/clientas/[id]/page.tsx` / `clientas/page.tsx`**: el gating de
  `verFichaClinica`/`verSemaforo` para RECEPCIÓN (color sí, motivo no) está bien
  implementado y consistente con la RPC `semaforo_salud_estudio`.
- **"Valorar a la alumna" / `notas_progreso` visible a RECEPCIÓN**: ya cerrado (#561,
  documentado en `.claude/tentare-os.md`), confirmado que sigue detrás de
  `verFichaClinica` en la página actual.
- **Endpoints de IA clínica** (`/api/ai/ficha-clinica-clase`, `/api/ai/ficha-clinica-socio`):
  comprueban rol y billing-gate; reciben datos ya filtrados por RLS+consentimiento desde
  el cliente y no persisten nada — no encontré una vía de lectura no autorizada a través
  de ellos.
- **`registrarRespuestaSesion`** (dedupe UPDATE vs INSERT por socioId+sesionId): el bug
  de #1375 (buscaba en una lista siempre vacía y duplicaba filas) está genuinamente
  arreglado — la carga (`cargarFichaClienta`) se dispara al montar la ficha y el
  contexto local se actualiza tras cada escritura.
- **`notas_progreso`** (nota narrativa libre de la instructora): no lleva gate de
  consentimiento, pero es una decisión de diseño anterior a la ficha clínica (tabla
  reutilizada, campo de texto libre, nunca pensada como "categoría especial
  estructurada") — lo documento como observación, no como bug: si algún día se quiere
  tratar como dato de salud con el mismo rigor, es una decisión de producto a pedir
  expresamente, no algo que se coló por descuido como sí ocurre con `respuestas_sesion`
  (que SÍ es la misma clase de dato que sus hermanas ya arregladas).

## Limitaciones de esta pasada

Sin acceso a las herramientas de Supabase MCP en esta sesión (agente sin
`execute_sql`/`get_advisors` declarados): S-1 está verificado por lectura de migraciones
aplicadas y código, no confirmado con una consulta en vivo contra producción (a
diferencia de como C-3 sí lo hizo). Antes de escribir la migración de arreglo,
recomiendo repetir la consulta de C-3 pero sobre `respuestas_sesion`, para saber cuántas
filas reales quedarían ocultas y decidir si hace falta un flujo de "pedir consentimiento
retroactivo" antes de activar el gate.
