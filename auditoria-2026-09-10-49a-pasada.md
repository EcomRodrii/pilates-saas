# Auditoría 49ª pasada — RPCs SECURITY DEFINER que la RLS no protege

Fecha: 2026-09-10
Alcance: barrido sistemático de la familia detectada en la 48ª pasada — toda
función `SECURITY DEFINER` invocable desde el navegador.

---

## Resumen ejecutivo

La 48ª pasada encontró **un** ejemplar (`crear_recuperacion`). En vez de
arreglarlo suelto, esta pasada enumeró **las 89 funciones SECURITY DEFINER de
producción** y cruzó tres datos: `prosecdef`, `has_function_privilege` para
`authenticated`, y si el cuerpo comprueba algo. Salieron **cinco ejemplares
nuevos**, todos explotables y todos verificados en vivo contra
`dwqvdycjcffqwfkzapvi` con una INSTRUCTOR real, en bloques `DO` revertidos.

**El más caro permitía acuñar créditos sin límite.** `otorgar_credito_disparador`
deduplica por `UNIQUE(studio_id, trigger, ref_id)` y el `ref_id` lo elegía quien
llamaba; solo 2 de sus 7 disparadores comprobaban que la condición existiera de
verdad. Prueba en producción (revertida): saldo **95 → 215** con tres `ref_id`
inventados. Repetible sin fin, y los créditos se canjean por clases y productos.

Lo importante no es el bug, es **por qué no se vio**. El panel se apoya
explícitamente en lo contrario, por escrito, en dos sitios:

- `lib/studio-context.tsx:4508` — se quitó un filtro local razonando que «la RPC
  ya revalida todo en servidor —regla activa, importe, **condición real (una
  reserva ASISTIDA de verdad)** e idempotencia por UNIQUE(...)».
- `lib/supabase-data.ts:3313` — «Sin esto, cualquier cuenta de personal
  autenticada podía otorgarse créditos arbitrarios».

Las dos frases son ciertas para `ASISTENCIA_CLASE` y `REFERIDO_AMIGO`, y falsas
para los otros cinco disparadores. **La clase de fallo de esta pasada es la
misma que la 48ª nombró y no cerró: el código se cree una promesa que el motor
solo cumple a medias.** Se arregló un endpoint (la RPC, frente al INSERT
directo) y se dio la familia por cerrada sin comprobar rama por rama.

### Nota incómoda sobre esta propia auditoría

El primer arreglo, aplicado a producción a las ~12:00, **rompió producción** y
**no cerró el 🔴 que decía cerrar**. Lo detectó la revisión independiente, no yo:

- **Rompí SEMANA_COMPLETA para todos los estudios españoles** durante ~2 h.
  Exigí que la clave de semana fuera lunes apoyándome en un comentario **que
  escribí yo mismo** («claveSemana() es el lunes en ISO»). No lo es:
  `streak-engine.ts` calcula la medianoche **local** del lunes y la serializa con
  `toISOString()`, que en España cae el **domingo**.
- **El agujero de créditos infinitos seguía abierto** por otra puerta: derivar el
  `ref_id` de LOGRO/RETO solo acota si el catálogo es fijo, y las cuatro tablas
  de configuración de gamificación tenían una policy `ALL` sin chequeo de rol.
  La misma instructora se fabricaba los logros **y les ponía el precio**: PoC en
  producción, `creditos_recompensa = 9999`, saldo 145 → 20.143.

Es exactamente el patrón que el método ya tenía registrado (el 20-ago, 3 de 9
arreglos estaban rotos con todos los checks en verde). Ambos están corregidos y
verificados en una segunda migración.

---

# 🔴 CRÍTICOS

### [C-1] `otorgar_credito_disparador`: créditos ilimitados

**Área:** gamificación / dinero · **Estado:** ✅ SOLUCIONADO

**Archivos:** función viva en prod; `lib/supabase-data.ts:3324`;
`lib/studio-context.tsx:4516`; `supabase/migrations/20260729150000_*.sql`

**Evidencia (producción, revertido):**
```
rol=INSTRUCTOR | saldo_inicial=95 -> saldo_final=215
otorgado1=t cred1=40 | otorgado2=t | otorgado3=t
ref_id: 'PoC-inventado-1' / '-2' / '-3'
```

**Qué ocurre:** `SEMANA_COMPLETA`, `PRIMERA_RESERVA`, `RENOVACION_PLAN`,
`OBJETIVO_MENSUAL`, `LOGRO` y `RETO` leían la regla activa y concedían. El único
freno era el `UNIQUE`, y el `ref_id` es un `text` libre del payload.

**Por qué:** es `SECURITY DEFINER`, así que la RLS de `member_credits` no se le
aplica; y el chequeo de condición se escribió solo para los dos disparadores que
motivaron la migración original.

**Impacto:** cualquier cuenta de personal (INSTRUCTOR incluida, que ni gestiona
clientas ni mueve dinero) acuña créditos canjeables para sí o para cualquier
socia de su estudio. Pérdida de dinero real y silenciosa.

**Solución:** el `ref_id` deja de ser libre. Por rama: `RENOVACION_PLAN` exige un
recibo de renovación real; `PRIMERA_RESERVA`, `ref_id = socio_id` + reserva
existente; `SEMANA_COMPLETA`, clave derivada + asistencia real esa semana;
`LOGRO`/`RETO`, `ref_id = '<socio>:<config_id>'`; `OBJETIVO_MENSUAL` no se
concede. **No se gateó por rol**: el pase de lista lo hace también la instructora
de la clase (#1819/#1828) y un `puede_gestionar_clientas()` lo habría roto.

**Verificación:** ataques bloqueados (`CONDICION_NO_CUMPLIDA` /
`REF_ID_NO_DERIVADO`), caminos legítimos concediendo (renovación real +40,
semana real +30, primera reserva +20, logro derivado OK).

---

### [C-2] Catálogo de gamificación escribible por cualquiera

**Área:** RLS / dinero · **Estado:** ✅ SOLUCIONADO (2ª migración)

**Evidencia (producción, revertido):** la INSTRUCTOR insertó dos
`achievement_definitions` con `creditos_recompensa = 9999` y cobró **19.998
créditos**. Las cuatro tablas (`achievement_definitions`,
`challenge_definitions`, `reward_rules`, `reward_catalog`) tenían una sola
policy `ALL` con `studio_id = current_studio_id()` y ningún chequeo de rol.

**Qué invalida:** mi propia frase «el importe lo pone la regla del estudio, nunca
quien llama». Lo ponía quien llamaba, dando un rodeo por el catálogo.

**Solución:** separar lectura de escritura. Lectura igual que antes (el panel
pinta logros en la ficha de la socia); escritura exige `PROPIETARIO`, que es
exactamente quien puede abrir `/configuracion` — la única pantalla que escribe
esas tablas (`lib/permisos-reglas.ts:41-70`).

**Verificación:** INSTRUCTOR bloqueada al insertar logro y al cambiar el importe
de una regla (0 filas); sigue **leyendo** el catálogo (12 filas); PROPIETARIA
crea/edita/borra regla, logro y premio sin problema.

---

### [C-3] `congelar_suscripcion` / `descongelar_suscripcion`: parar el cobro

**Área:** pagos · **Estado:** ✅ SOLUCIONADO

**Evidencia (producción, revertido):** INSTRUCTOR pasó `sus-web-3U6…` de ACTIVA
a **PAUSADA**; el mismo `UPDATE` por la vía normal, en la misma sesión, afectó a
**0 filas** (la policy `suscripciones_escritura_update` exige
`puede_mover_dinero()`). Descongelar además regaló días: `fecha_fin`
2026-09-15 → 2026-09-25, y en bucle empuja la caducidad a voluntad.

**Impacto:** `lib/inngest/renovaciones.ts:143` emite los recibos filtrando
`estado='ACTIVA'` → una suscripción pausada **deja de facturarse en silencio**,
sin aviso y sin ningún cron que lo revierta; `lib/billing/stripe-cobros.ts:107`
rechaza con 409 los recibos ya emitidos.

**Lo que lo hace un caso de manual:** la puerta estaba cerrada en la UI
(`puedeCobrar`, `clientas/[id]/page.tsx:211`) **y** en la tabla (RLS), y abierta
en la RPC. Dos de tres cierres no cierran nada.

**Solución:** `if auth.uid() is not null and not public.puede_mover_dinero() then
raise 'NO_AUTORIZADO'` en ambas — mismo predicado que la RLS y que la UI, cero
roturas. No un REVOKE: el camino legítimo lo llama el navegador de la
propietaria sin ruta de servidor que medie.

**Verificación:** INSTRUCTOR → `NO_AUTORIZADO` en las dos; PROPIETARIA →
ACTIVA→PAUSADA→ACTIVA correctamente.

---

### [C-4] `reservar_cita`: citas confirmadas a 0 €

**Área:** citas / dinero · **Estado:** ✅ SOLUCIONADO

**Evidencia (producción, revertido):** `retorno=CONFIRMADA precio=0.00 pagada=f`
desde una cuenta INSTRUCTOR. `p_servicio_id` tampoco se valida (pasó `NULL`).
La RLS `citas_escritura_insert` exige `puede_gestionar_clientas()`.

**Solución:** REVOKE de PUBLIC/anon/authenticated, GRANT a `service_role`. Aquí
sí toca revoke y no chequeo de rol: el único llamante del árbol es
`lib/db/supabase-data-admin.ts:3509` (`crearCitaPublica`, service role) y el uso
legítimo es la **autorreserva de la socia**, que no tiene rol — un `puede_*()` la
habría bloqueado.

**Verificación:** `permission denied for function reservar_cita` para
authenticated; `service_role` conserva el EXECUTE.

---

### [C-5] Rompí SEMANA_COMPLETA en producción (defecto de esta auditoría)

**Área:** gamificación · **Estado:** ✅ SOLUCIONADO (2ª migración)

Mi primer arreglo exigía `extract(isodow from clave) = 1`. El panel manda el
**domingo** en España (`lunesDe()` es medianoche local, `claveSemana()` la pasa a
UTC con `toISOString()`). Verificado: el panel manda `2026-09-06`, yo exigía
`2026-09-07`. Toda concesión de racha rechazada, y encima ruidosamente (
`supabase-data.ts:3331` solo silencia `CONDICION_NO_CUMPLIDA` y
`SIN_REGLA_ACTIVA`, así que cada intento iba a Sentry).

**Solución:** aceptar lunes **y** domingo — es la lista completa: la medianoche
local del lunes solo puede caer, en UTC, en ese lunes (husos ≤ UTC) o en el
domingo anterior (husos > UTC).

**Verificación:** con la clave real que manda el panel en Madrid (`2026-08-09`,
isodow 7) → `otorgado=true cred=30`; con la del kiosko en UTC → también;
miércoles → `REF_ID_NO_DERIVADO`.

---

# 🟠 IMPORTANTES

### [I-1] `OBJETIVO_MENSUAL`: la UI lo cobra y nada lo concede — ⏳ PENDIENTE (producto)

`components/configuracion/tab-recompensas.tsx:22` lo ofrece y lo tarifa a 50
créditos. **No hay un solo llamante en todo el árbol.** Una propietaria puede
activarlo, prometérselo a sus socias y no otorgarlo nunca. La rama SQL ahora
rechaza siempre (era una vía de acuñación: `'<socio>:1500-06'` pasaba). Lo que
queda —implementarlo o retirarlo de la pantalla— es una decisión de producto.

### [I-2] `tiene_consentimiento_salud`: fuga de 1 bit entre estudios — ✅ SOLUCIONADO

Sin filtro de estudio: cualquier `authenticated` (incluida una socia de otro
tenant) podía preguntar por un `socio_id` ajeno. Verificado contra
`studio-1rzd713z2s4x5` desde `studio-1`. **Impacto acotado y honesto:** 1 bit,
exige conocer el id exacto (no enumerable) y no expone ningún dato de salud —
las 4 tablas de salud siguen exigiendo `studio_id` en sus políticas.
Arreglo: filtro de tenant dentro. **No un REVOKE**: la función se evalúa dentro
de **13 policies** y revocarla dejaría toda la sección de salud en 42501
(comprobado). Verificado que las 4 tablas siguen legibles tras el cambio.

### [I-3] El check-in de kiosko no pasa por ninguna de las guardas nuevas — ⏳ PENDIENTE

`otorgarCreditosServidor` (`lib/db/supabase-data-admin.ts:4270`) **no llama a la
RPC**: escribe a pelo con service role (`admin.from('reward_actions').insert` +
`admin.rpc('ajustar_creditos')`) y no comprueba ninguna condición. Es decir,
`ASISTENCIA_CLASE`, `REFERIDO_AMIGO` y `SEMANA_COMPLETA` tienen **dos motores
distintos** con reglas distintas. No es explotable desde el navegador (va tras
un token de kiosko), pero es la misma familia de «gemelos divergentes» y es la
razón de que un comentario mío afirmara haber verificado llamantes que no
existen. **Por qué no lo arreglo:** unificar los dos caminos es un cambio de
arquitectura, no un parche, y toca el camino del dinero del kiosko.

### [I-4] Panel y kiosko usan claves de semana DISTINTAS — ⏳ PENDIENTE (preexistente)

El panel corre en el navegador (Madrid → clave domingo) y el kiosko en Vercel
(`TZ=UTC` → clave lunes). El `UNIQUE(studio,trigger,ref_id)` **nunca ha
deduplicado entre los dos caminos**: la misma semana puede pagarse dos veces. Es
anterior a esta auditoría. La cura es que `claveSemana()` deje de pasar por UTC,
lo que cambia los `ref_id` ya emitidos — no se hace dentro de una auditoría.

### [I-5] `RENOVACION_PLAN` la satisface quien opera el mostrador — ⚠️ PARCIAL

La guarda exige un recibo real de renovación, pero `recibos_escritura_insert`
permite a RECEPCIÓN/PROPIETARIA emitir recibos «Renovación …» sin límite → 40
créditos por recibo. Queda **fuera del atacante declarado** (INSTRUCTOR no puede
insertar recibos) y dentro de lo que esos roles ya pueden hacer con el dinero.
Comprobado que la guarda **no rompe nada real**: 14/14 recibos de renovación de
producción la pasan.

---

# 🟡 MEJORAS

### [M-1] «ALL + solo tenant» es el patrón por defecto de muchas tablas de configuración

`salas`, `tipos_clase` y otras tienen la misma policy que tenían las cuatro de
gamificación: una INSTRUCTORA puede editar tipos de clase o salas. **No se toca
aquí**: cambiarlas en bloque es un cambio de alcance que esta pasada no puede
verificar. Se limitó a las cuatro que convierten configuración en dinero.
Recomendación: una pasada dedicada que decida el predicado por tabla.

### [M-2] `RewardTrigger` no representa la realidad

`lib/types.ts:1604` declara `COMPRA` (que la RPC rechaza con
`TRIGGER_DESCONOCIDO`, tiene su propia función) y **no** declara `LOGRO` ni
`RETO`, que sí se usan. El tipo permite estados imposibles y oculta los reales.

### [M-3] Residual aceptado: la clase de domingo cuenta para dos semanas

Con la clave-domingo, la ventana de asistencia de dos claves consecutivas se
solapa un día: quien **solo** entrena en domingo puede cobrar la racha dos veces.
Acotado (exige asistencia real, el `UNIQUE` sigue actuando) y preferible a
estrechar la ventana, que volvería a costarle el crédito a una socia real.
Desaparece cuando se arregle I-4.

---

## Mapa de deuda técnica (solo lo verificado en esta pasada)

| Área | Estado | Riesgo | Prioridad |
| --- | --- | --- | --- |
| RPCs SECURITY DEFINER | 5 ejemplares cerrados; método de barrido ya escrito | Medio — la familia reaparece cada ~10 días | Alta |
| RLS (gamificación) | Cerrada (lectura/escritura separadas) | Bajo | — |
| RLS (resto de configuración) | `ALL + tenant` sin rol, sin auditar | Medio | Alta (M-1) |
| Gamificación (motores) | Dos caminos divergentes (panel / kiosko) | Medio | Media (I-3, I-4) |
| Pagos (congelaciones) | Cerrado | Bajo | — |
| Citas | Cerrado (server-only) | Bajo | — |
| Salud (consentimiento) | Cerrado | Bajo | — |
| Tipos / contratos | `RewardTrigger` no refleja la BD | Bajo | Media (M-2) |

---

## REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Solución | Verificación | Estado |
| --- | --- | --- | --- | --- | --- |
| C-1 | Créditos ilimitados por `ref_id` libre | `20260910120000` + `20260910140000` | `ref_id` derivado + condición real por rama | Ataques bloqueados; 5 caminos legítimos concediendo | ✅ |
| C-2 | Catálogo de gamificación escribible por instructora | `20260910140000` | Lectura/escritura separadas; escritura solo PROPIETARIO | INSTRUCTOR bloqueada, lee OK; PROPIETARIA escribe OK | ✅ |
| C-3 | Congelar/descongelar sin rol | `20260910120000` | `puede_mover_dinero()` en ambas | INSTRUCTOR `NO_AUTORIZADO`; PROPIETARIA OK | ✅ |
| C-4 | `reservar_cita` a 0 € | `20260910120000` | REVOKE; solo `service_role` | `permission denied`; service_role conserva | ✅ |
| C-5 | (mío) SEMANA_COMPLETA rechazaba todo en España | `20260910140000` | Aceptar lunes y domingo | Clave real del panel concede 30 créditos | ✅ |
| I-2 | Consentimiento de salud cross-tenant | `20260910120000` | Filtro de tenant dentro | Otro estudio → NULL; 4 tablas de salud legibles | ✅ |
| — | Sin red contra la regresión | `lib/rpcs-definer-sin-chequeo-de-rol.test.ts` | 7 tests, uno deriva la clave del motor real | 5/5 fallan en el árbol previo; 7/7 pasan ahora | ✅ |

## PROBLEMAS PENDIENTES

| ID | Problema | Severidad | Por qué no se arregló | Próximo paso |
| --- | --- | --- | --- | --- |
| I-1 | `OBJETIVO_MENSUAL` prometido y nunca concedido | 🟠 | Decisión de producto | Implementarlo o quitarlo de la pantalla |
| I-3 | Kiosko concede créditos por fuera de las guardas | 🟠 | Cambio de arquitectura sobre el camino del dinero | Unificar en la RPC, con test |
| I-4 | Panel y kiosko usan claves de semana distintas | 🟠 | Cambia `ref_id` ya emitidos | Arreglar `claveSemana()` + plan de migración |
| I-5 | `RENOVACION_PLAN` acotada solo por recibos reales | 🟠 (parcial) | Está dentro de lo que RECEPCIÓN ya puede con el dinero | Revisar si el crédito debe atarse al cobro y no al recibo |
| M-1 | `ALL + tenant` en el resto de configuración | 🟡 | Alcance no verificable en esta pasada | Pasada dedicada por tabla |
| M-2 | `RewardTrigger` no refleja la BD | 🟡 | — | Derivar el tipo del SQL |

---

## RESUMEN FINAL

**Encontrados:** 🔴 5 · 🟠 5 · 🟡 3
**Solucionados:** 6 (C-1…C-5, I-2) · **Parciales:** 1 (I-5) · **Pendientes:** 6

**Archivos modificados:** 3 (2 migraciones nuevas + 1 test nuevo). Ninguno de
código de aplicación: los cinco fallos vivían en la base de datos.

**Migraciones aplicadas a producción:** 2, registradas en el ledger
(`20260910072912` y `20260910075416`) con el mismo nombre normalizado que los
ficheros del repo — sin deriva.

**Tests:** 4.408 ejecutados, **4.408 pasan, 0 fallan**. 7 nuevos.
**Typecheck:** ✅ PASS (`tsc --noEmit`, limpio).
**Lint:** ✅ PASS sobre el fichero nuevo (`eslint`, salida vacía).
🔎 **NO VERIFICADO** el lint del repo entero: excede el límite de tiempo de la
herramienta (~178 s). No es una regresión de esta pasada.
**Build / E2E:** 🔎 NO VERIFICADOS (mismo límite de tiempo).

### Estado real post-auditoría

Cinco puertas de escalada de privilegios que llevaban abiertas desde el origen
de cada función están cerradas y comprobadas contra producción, atacando y
verificando el camino legítimo por separado. La familia ya no depende de que
alguien se acuerde: hay un test que la vigila y que **falla de verdad** contra el
árbol anterior.

**Lo que NO puedo afirmar.** No he auditado el resto de la superficie (frontend,
rendimiento, UX, cache, temas, automatizaciones): esta pasada fue deliberadamente
vertical sobre una familia. No he ejecutado build ni E2E. Y el dato más
incómodo: **de mis 6 arreglos iniciales, 2 estaban mal** (uno rompía producción,
otro no cerraba lo que decía cerrar), y no los detecté yo sino la revisión
independiente. La conclusión de método es que la revisión independiente **no es
opcional**: es la única razón por la que este informe no dice «cerrado» sobre
algo que seguía abierto.

**Antes de poner Tentare delante de cientos de estudios**, en esta área: cerrar
I-3 e I-4 (dos motores que conceden dinero con reglas distintas) y decidir M-1
(qué roles pueden tocar cada tabla de configuración; hoy, casi cualquiera).
