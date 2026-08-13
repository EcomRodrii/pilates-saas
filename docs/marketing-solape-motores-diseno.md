# Fase 2 en detalle — resolver el solape AUSENCIA_DIAS / INACTIVIDAD_30D

Fecha: 2026-08-13. Profundiza el §2 de
[`marketing-integrations-arquitectura.md`](./marketing-integrations-arquitectura.md).
Solo diseño — sin código todavía.

## Qué hacen de verdad los dos motores (leído el código, no supuesto)

**`lib/engines/automation-engine.ts:126-198`** (`AUSENCIA_DIAS`, motor
clásico, tabla `automation_rules`/`automation_logs.ruleId`): secuencia de
3 pasos con dedup por EPISODIO (desde la última asistencia real de la
socia):
- día 7 → `ENVIAR_EMAIL` automático, sin aprobación.
- día 14 (`diasCheckin`) → check-in automático, sin aprobación, sin oferta.
- día 25 (`diasCritico`) → `OFRECER_DESCUENTO`, **requiere aprobación
  humana** (nunca se regala un descuento solo).

**`lib/engines/marketing-automation-engine.ts:122-124`** (`INACTIVIDAD_30D`,
motor de marketing, tabla `automatizaciones`/`automation_logs.automatizacionId`):
un único disparo, sin aprobación, cada 45 días (`DEDUP_DIAS.INACTIVIDAD_30D`),
con asunto/mensaje libres que escribe la propietaria. Dedup solo dentro
de su propia clave `automatizacionId|socioId` — **nunca mira los logs del
otro motor**, aunque comparten la misma tabla física `automation_logs`.

El único freno hoy es un tooltip informativo
(`app/(dashboard)/marketing/page.tsx:61`): *"si ya usas Automatizaciones
IA con la regla de Ausencia, esta se solapa... actívala solo si no usas
aquella"*. Es una petición a la propietaria, no una garantía del sistema
— nada impide activar ambas.

## Caso real que puede pasar hoy si ambas están activas

Socia sin asistir desde hace 45 días, con ambas automatizaciones activas:
día 7 recibe el email automático del motor clásico, día 14 el check-in,
día 25 la oferta de descuento (si se aprueba), y día 45 el mensaje de
marketing configurado por la propietaria — cuatro contactos por el mismo
motivo, el último de ellos ignorando por completo que ya hubo una
secuencia de reactivación entera 20 días antes.

## Por qué NO conviene fusionar los dos motores

Son productos distintos aunque miren la misma señal:
- `AUSENCIA_DIAS` es una secuencia con lógica de negocio fija (3 pasos,
  aprobación humana en el último) que la propietaria NO redacta — el
  copy vive en el motor.
- `INACTIVIDAD_30D` es una plantilla libre que la propietaria escribe,
  sin pasos ni aprobación — más simple a propósito, pensado para quien
  no quiere configurar una secuencia.

Fusionarlos en un motor único obligaría a que uno de los dos pierda su
característica distintiva (o la secuencia con aprobación, o la plantilla
libre). Ninguna de las dos cosas está pedida — no reabrir esa decisión.

## Diseño propuesto: tres cambios independientes, del más simple al más estructural

### 1. Extraer la señal compartida (DRY, cero cambio de comportamiento)

Ambos motores recorren `reservas` para calcular "última asistencia por
socia" con el mismo criterio (`estado === 'ASISTIDA'`, quedarse con la
más reciente por `creadoEn`):
- `automation-engine.ts:104-109` (`ultimaAsistidaCreado`)
- `marketing-automation-engine.ts:87-93` (`ultimaAsistida`, más
  `primeraAsistida` que solo usa el motor de marketing)

Extraer a `lib/engines/senales-inactividad.ts`
(`ultimaAsistidaPorSocio(reservas): Map<string, string>`), importada por
los dos. Sin efecto observable — pura eliminación de duplicación, primer
paso obligatorio antes de tocar la lógica de dedup cruzado (para no
mezclar refactor y cambio de comportamiento en el mismo commit).

### 2. Dedup cruzado real: un cerrojo de inactividad por socia, no por motor

Los dos motores YA escriben en la misma tabla física `automation_logs`
(columnas `ruleId` para el clásico, `automatizacionId` para marketing —
confirmado en `marketing-automation-engine.ts:71-77`, comentario "S-2").
Eso significa que el dedup cruzado no necesita ninguna tabla ni columna
nueva, solo una consulta que ignore de cuál de los dos motores vino el
log.

Propuesta: cada log relacionado con inactividad se marca con un prefijo
común reconocible en `detalle` — mismo patrón que ya usa este archivo
para dedup fino (`l.detalle.includes('¿Todo bien por el estudio?')` en
`automation-engine.ts:169`). Por ejemplo `[INACTIVIDAD]` al principio de
`detalle` en las 4 emisiones relevantes (día 7, día 14, día 25 de
`AUSENCIA_DIAS`, y el disparo de `INACTIVIDAD_30D`).

Antes de que CUALQUIERA de los dos motores emita un candidato de
inactividad, comprobar en `logsDe(_, socioId)` (ya indexado por socio en
ambos motores) si existe un log `[INACTIVIDAD]` de CUALQUIER regla/
automatización en una ventana de gracia corta (proponer 72h — no una
ventana larga, porque el objetivo es solo evitar que ambos crons
disparen el mismo día o el día siguiente por una coincidencia de
umbrales, no impedir que ambas secuencias convivan a lo largo del tiempo
si la propietaria de verdad quiere las dos).

Esto resuelve el caso de colisión inmediata (mismo día/48h) sin decidir
por la propietaria si puede tener ambas activas a la vez — decisión de
producto que sigue en el punto 3.

### 3. Convertir el aviso en una regla de negocio real, no un tooltip

El texto de `marketing/page.tsx:61` ya expresa la decisión de producto
correcta ("actívala solo si no usas aquella") — falta que el sistema la
haga cumplir. Dos niveles posibles, de menor a mayor fricción para la
propietaria:

- **Nivel A (recomendado, mínima fricción)**: al activar una de las dos
  automatizaciones (`PATCH`/`PUT` del endpoint correspondiente — hay que
  localizar cuál gestiona `automatizaciones.activa` y cuál
  `automation_rules.activa`), si la otra YA está activa para el mismo
  `studio_id`, la respuesta sigue siendo 200 pero devuelve un aviso
  explícito en el payload (`advertencia: 'Ya tienes activa la
  automatización de Ausencia — puede solaparse con esta'`) para que la UI
  lo muestre como confirmación, no como bloqueo duro. Coherente con que
  esto sigue siendo una decisión legítima de la propietaria (podría
  querer las dos con umbrales distintos), no un error.
- **Nivel B (bloqueo duro)**: rechazar la activación con 409 si la otra
  ya está activa, obligando a desactivar una antes de activar la otra.
  Más simple de implementar pero le quita a la propietaria un caso de uso
  que hoy es legítimo (secuencia larga + recordatorio ocasional más allá
  de ella, tal como ya explica el comentario de
  `marketing-automation-engine.ts:31-36`).

**Recomendación**: Nivel A. El comentario del propio motor de marketing ya
argumenta un caso de uso válido para tener ambas ("recordatorio ocasional
más allá de la secuencia") — bloquear del todo (Nivel B) contradice esa
intención documentada en el propio código. El dedup cruzado del punto 2
ya cubre el riesgo real (colisión el mismo día); el aviso solo necesita
dejar de ser un tooltip que nadie lee al activar, y convertirse en una
confirmación explícita en el momento de activar.

## Orden de implementación (si se decide seguir adelante)

1. Extraer `ultimaAsistidaPorSocio` compartida (punto 1) — refactor puro,
   test de regresión trivial (mismo resultado antes/después).
2. Añadir el prefijo `[INACTIVIDAD]` a las 4 emisiones y el chequeo
   cruzado de 72h (punto 2) — cambio de comportamiento real, necesita
   test nuevo: "con AUSENCIA_DIAS y INACTIVIDAD_30D activas a la vez,
   una socia no recibe dos comunicaciones el mismo día".
3. Aviso de confirmación al activar (punto 3, Nivel A) — cambio de UI +
   endpoint, el último porque depende de que 1-2 ya estén verificados
   (si no, el aviso pediría confirmar algo que en la práctica ya no
   puede colisionar).

## Qué NO decide este documento

- Si además de `AUSENCIA_DIAS`/`INACTIVIDAD_30D` hay otros pares de
  triggers con el mismo tipo de solape (candidato a revisar aparte:
  `CITA_RECORDATORIO` del motor de marketing vs recordatorios de citas
  ya existentes en otro sitio del repo — no verificado en esta pasada).
- Si el prefijo `[INACTIVIDAD]` en `detalle` es la convención definitiva
  o si merece una columna propia (`categoria`) en `automation_logs` —
  la opción de columna es más limpia pero es una migración; la de
  prefijo es cero-migración y sigue el patrón ya usado en este mismo
  archivo, se propone empezar por ahí.
