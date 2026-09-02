# Aviso proactivo de racha en riesgo — diseño

Estado: **propuesta, sin implementar**. Este documento cierra las 7 decisiones
pedidas para que la siguiente sesión programe directamente sin volver a
investigar nada de lo de abajo.

## Lo que ya existe (no se toca en este diseño)

- `calcularRacha` (`lib/engines/streak-engine.ts`) — racha real por
  **asistencia**, no reserva. Ya calcula `enRiesgo` y `diasParaPerder`
  (cuenta hasta el domingo 23:59, ya testeado en `streak-engine.test.ts`).
- El portal ya muestra `RACHA_EN_RIESGO` como Home card
  (`lib/portal-home-logic.ts`, `components/portal/portal-home-view.tsx`) —
  pero solo si la alumna entra por su cuenta. Este diseño añade el aviso que
  la busca a ella; **no cambia la card existente**.
- Precedente de tono: `docs/…` / `lib/decision/umbral.ts` ("Solo te
  interrumpiré cuando crea que merece la pena… el resto de los días, la
  mayoría, no tendrás nada mío, y eso también es una buena señal") y
  `app/portal/[slug]/progreso/page.tsx` ("Tu constancia, en silencio.").
  Este aviso adopta el mismo principio: **silencio por defecto, una sola
  interrupción si de verdad importa**.
- Precedente de infraestructura: `lib/notificaciones/bonos-inactivas-cron.ts`
  — pg_cron "bucket A", bucle global sobre estudios dentro de la misma
  invocación, sin fan-out por estudio/alumna vía Inngest. Razón documentada
  en el propio repo: el fan-out de Inngest ya disparó el consumo del plan
  gratuito una vez (`lib/inngest/recordatorios`). Este aviso sigue el mismo
  patrón: **un cron nuevo NO** — se añade como función de barrido en ese
  mismo fichero o uno hermano, dentro del bucket A.

## ⚠️ Hallazgo previo a las 7 decisiones: la categoría `gamificacion` NO existe

El encargo de esta auditoría asumía que `CATEGORIAS_POR_ROL.SOCIA` ya incluye
una categoría `gamificacion`. Verificado en `lib/notifications/types.ts` y
`lib/notifications/catalog.ts`: `NotificationCategory` es
`'reservas' | 'clases' | 'sustituciones' | 'pagos' | 'marketing' | 'sistema' | 'decisiones' | 'red'`
y `CATEGORIAS_POR_ROL.SOCIA = ['reservas', 'clases', 'pagos', 'marketing']`.
No hay ninguna categoría de gamificación en ningún rol. La decisión 6 de
abajo resuelve esto sin inventar infraestructura nueva.

---

## Las 7 decisiones

### 1. Cuándo dispara: `diasParaPerder === 3`, una sola vez por racha en riesgo

`diasParaPerder` cuenta hacia atrás desde el domingo 23:59. El cron de
bucket A ya corre cada 15 min o menos (mismo horario que
`barrerBonosPorCaducar`); basta con comprobar el valor en su barrido diario.
Dispara quando `diasParaPerder === 3` (miércoles), no antes:

- Antes de eso (`diasParaPerder` 5-6, lunes/martes) es la ansiedad explícita
  que el encargo original prohíbe — la alumna todavía tiene casi toda la
  semana, avisar ahí es presión, no información.
  Además, en la mayoría de estudios el patrón semanal real de una alumna con
  racha ya conocida es fijo (mismo día, misma hora) — avisar el lunes de que
  "esta semana aún no has venido" es ruido sobre algo que ya sabe que hará
  el jueves.
- `diasParaPerder <= 1` (viernes/sábado/domingo) es tarde para actuar si el
  estudio no tiene clase ese mismo día o la alumna ya se ha ido de fin de
  semana — el aviso se sentiría a destiempo, no útil.
- Miércoles (`=== 3`) dsja aún jueves-domingo por delante (4 días reales
  incluyendo el propio miércoles) — tiempo real para reservar y venir, sin
  ser tan pronto que se sienta prematuro.

**Nunca en `diasParaPerder === 0`** (domingo): a esas alturas el aviso no
cambia nada, solo confirma la pérdida antes de tiempo — eso sí sería
ansiedad pura sin ninguna utilidad.

### 2. Frecuencia: una vez por racha en riesgo, `dedupKey` por semana — sin repetir aunque siga en riesgo

`dedupKey: rachaenriesgo:${socioId}:${claveSemanaActual}` (mismo campo que ya
calcula `calcularRacha`). Un único aviso por semana en riesgo, punto — no
hay reintento aunque pasen más días sin que la alumna reserve. El propio
motor de notificaciones (`publish()`) ya deduplica por `dedupKey`
(`lib/notifications/engine.ts`), así que esto no necesita lógica nueva, solo
la clave correcta.

**Si la racha lleva varias semanas seguidas en riesgo** (la perdió una
semana, volvió a empezar de 0, y a la semana siguiente ya no tiene racha que
proteger — `racha=0` implica `enRiesgo=false` según `calcularRacha`): el
propio motor cierra este caso solo. No hace falta lógica de "llevas 3
semanas fallando" porque `enRiesgo` requiere `racha > 0` de partida — una
alumna sin racha previa nunca entra en este flujo.

### 3. A quién avisar: solo a partir de racha de **3 semanas** (`semanas >= 3` antes de esta semana en riesgo)

Avisar desde la semana 1 en riesgo trata una racha que ni siquiera existe
todavía como algo valioso — sería spam funcional para cualquier alumna que
reserva de forma irregular por defecto. El umbral de 3 se apoya en el mismo
dato que ya usa `esMejor`/el Home: una racha de 1-2 semanas es ruido
estadístico normal de cualquier calendario (vacaciones, un resfriado);
llegar a 3 semanas consecutivas ya es un patrón que vale la pena proteger, y
es un número redondo fácil de razonar sin necesitar calibración por estudio
(a diferencia del Umbral de propietaria, que sí calibra por historial — aquí
no hace falta: es la MISMA regla para toda alumna de todo estudio, no una
decisión de negocio por estudio).

### 4. Canal: **solo PUSH**

Coherente con el criterio ya documentado en la cabecera de `catalog.ts`
("antes de añadir EMAIL, comprueba que el flujo no manda ya su propio
correo") y con el patrón real de eventos dirigidos a `socia-del-evento`: en
todo el catálogo actual, **ningún** evento de socia usa EMAIL, WHATSAPP o
SMS — esos tres canales están reservados a avisos críticos de propietaria
(`SISTEMA_ERROR`, `SISTEMA_STRIPE_DESCONECTADO`). Un email de "tu racha
peligra" competiría con la promesa de EMAIL como canal serio/administrativo
(recibos, confirmaciones) y sería más difícil de ignorar sin sentirse
insistente. PUSH es el canal que ya usan `RESERVA_CONFIRMADA`,
`BONO_POR_CADUCAR`, `RECORDATORIO_24H` — mismo peso, mismo registro.

Prioridad: **MEDIA** (mismo nivel que `BONO_POR_CADUCAR`) — no `ALTA`: no es
una acción con fecha límite dura como una reserva a punto de caer, es una
invitación.

### 5. Copy — 3 variantes, mismo tono que "Tu constancia, en silencio."

Sin exclamaciones, sin urgencia fabricada, sin la palabra "racha" tratada
como trofeo que se puede "perder" en el sentido de fracaso — se habla de
seguir, no de no perder.

**Variante A (genérica, cualquier semana)**
> Título: `Llevas {semanas} semanas seguidas.`
> Cuerpo: `Esta semana todavía no has venido. Quedan {diasParaPerder} días si quieres seguir.`

**Variante B (más breve, para push corto)**
> Título: `{semanas} semanas seguidas — esta semana aún no.`
> Cuerpo: `Reserva cuando puedas. Sin prisa, solo un aviso.`

**Variante C (racha larga, ≥8 semanas — se reconoce el logro sin dramatizar la pérdida)**
> Título: `{semanas} semanas es mucho tiempo.`
> Cuerpo: `Esta semana aún no has venido. Si te viene bien, ahí sigue tu sitio.`

Recomendación: usar **Variante A** como plantilla única (predecible,
mantenible), con `semanas` y `diasParaPerder` interpolados de los mismos
campos que ya calcula `calcularRacha` — no crear tres plantillas paralelas
para una primera versión. B y C quedan documentadas como alternativas si
tras medir aceptación/opt-out se quiere afinar tono por longitud de racha,
no como trabajo pendiente de esta fase.

### 6. Opt-out: **reutilizar la categoría `clases`, no crear `gamificacion`**

Como se documenta arriba, `gamificacion` no existe como categoría hoy.
Crearla como categoría nueva de una sola línea de catálogo (un evento) es
sobre-ingeniería: `CATEGORIAS_POR_ROL.SOCIA` ya incluye `'clases'`
(asistencia, reservas de clase) y este aviso es exactamente eso —una
invitación a volver a clase—, no una mecánica de puntos/insignias/niveles
separada. Usar `category: 'clases'` en la regla del catálogo evita tocar
`NotificationCategory` y el UI de preferencias (`app/(dashboard)/…`/portal
que renderiza categorías) sigue funcionando sin cambios: desactivar
notificaciones de "clases" ya desactiva esta.

**Si en el futuro se añaden más avisos de gamificación** (logros, retos) que
sí necesiten su propio interruptor independiente de "clases", ahí sí se
justifica dar de alta `gamificacion` como categoría nueva — pero no antes de
tener un segundo caso real que lo pida.

### 7. Casos límite que NO deben generar el aviso

Todos evaluables en el momento del barrido, antes de llamar a `publish()`:

- **Racha de menos de 3 semanas** — cubierto por la decisión 3.
- **Alumna con ausencia programada que cubre la semana actual**
  (`instructora_ausencias`/excepciones — pero eso es de instructoras, no de
  alumnas: revisar si existe el equivalente para socias). Si no existe hoy
  un registro de "socia de vacaciones", **esta comprobación no aplica** y no
  se debe inventar una tabla nueva solo para este aviso — se documenta como
  limitación conocida, no como bloqueante: la propia decisión 1 (miércoles,
  no lunes) ya reduce el falso positivo de "está fuera dos días" a los casos
  de ausencia de una semana o más completa.
- **Estudio en modo vacaciones / cerrado esa semana** — si el estudio cierra
  (vacaciones de verano, festivo largo) y no hay ninguna sesión programada
  esa semana, avisar de que "no has venido" cuando no había nada a lo que
  venir es el caso más claro de aviso injusto del encargo original. Filtro
  concreto: antes de publicar, comprobar que el estudio tiene **al menos una
  sesión futura programada esta semana** (`sesiones` con `inicio` en la
  semana actual, `studio_id` correspondiente) — si no hay ninguna, se salta
  el aviso para todas las alumnas de ese estudio esa semana, sin necesitar
  ningún campo nuevo de "modo vacaciones" explícito.
- **Primera semana de racha (`semanas === 1` o `2` en riesgo)** — cubierto
  por la decisión 3, mismo motivo: no ha construido nada todavía que "duela"
  perder.
- **Alumna con preferencia `clases` desactivada** — cubierto por el motor de
  notificaciones existente (`publish()` respeta preferencias por categoría
  antes de encolar el canal), sin lógica adicional en el barrido.

---

## Arquitectura técnica (resumen para implementación)

- **Cron**: nueva función `barrerRachasEnRiesgo(admin)` en
  `lib/notificaciones/bonos-inactivas-cron.ts` (o fichero hermano en el
  mismo directorio), bucket A / pg_cron — mismo patrón que
  `barrerBonosPorCaducar`: bucle sobre `idsEstudios(admin)`, sin fan-out por
  estudio ni por alumna.
- **Por estudio**: comprobar que hay ≥1 sesión futura esta semana (caso
  límite "estudio cerrado"); si la hay, para cada socia activa con
  `semanas >= 3` (antes de esta semana) y `enRiesgo && diasParaPerder === 3`
  (recalculando `calcularRacha` sobre sus reservas/sesiones, igual que hoy
  hace el portal), llamar a `publish()`.
- **Evento nuevo en el catálogo** (`lib/notifications/catalog.ts`, no
  implementado en esta tarea): `EVENTOS.RACHA_EN_RIESGO = 'racha.en_riesgo'`,
  regla `{ category: 'clases', priority: 'MEDIA', canales: ['PUSH'],
  audiencia: 'socia-del-evento' }`, más su entrada en `PLANTILLAS` con el
  copy de la Variante A (decisión 5).
- **`dedupKey`**: `` `racha-en-riesgo:${socioId}:${claveSemanaActual}` ``
  (decisión 2) — el propio `claveSemanaActual` que ya devuelve
  `calcularRacha`, ninguna clave nueva que inventar.
- **Sin migración, sin tabla nueva, sin categoría `gamificacion` nueva** —
  todo el estado que hace falta (racha, `enRiesgo`, `diasParaPerder`,
  `dedupKey` por semana, categoría `clases` para opt-out) ya existe en el
  código de hoy; esta feature es pura orquestación sobre datos ya
  calculados, igual que `bonos-inactivas-cron.ts`.
