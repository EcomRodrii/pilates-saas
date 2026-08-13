# Tentare Network → Sustituciones — puntos de extensión (Fase 11)

Fase 11 del plan (`docs/NETWORK-IMPLEMENTATION-PLAN.md §17`): documentar dónde
y cómo se conectaría Network con el motor de sustituciones ya existente, **sin
tocar código de sustituciones**. Nada de lo de abajo está implementado — es el
mapa para cuando se decida construirlo.

## 1. Qué hay hoy, y por qué no es trivial enchufar Network encima

`rankear_candidatas(p_sesion_id, p_tz)` (`supabase/migrations/0038_sustituciones_scoring.sql`)
es el RPC que puntúa a quién ofrecer una clase sin instructora. Su pool es, por
diseño, **estrictamente interno**:

```sql
select i.* from instructores i
where i.studio_id = (select studio_id from sesiones where id = p_sesion_id)
  and i.id <> p_instructor_original_id
  and i.activo = true
  -- + disponibilidad semanal/excepciones, + scoring por tipo_clase_id ya impartido
```

Auditado en la Fase 0 (`docs/NETWORK-AUDIT.md §3`): hoy es **imposible** que
una persona ajena al estudio aparezca aquí, y el motivo no es un descuido — el
scoring depende de señales que solo existen para alguien que YA es
`instructores` de esa sede (`tipo_clase_id` ya impartido, horas del mes vs
media del grupo, días desde la última sustitución). Una persona de Network sin
historial en ese estudio no tiene ninguna de esas tres señales: puntuarla con
la misma fórmula la dejaría siempre en el peor lugar posible, no por ser mala
candidata sino por no tener historial que premiar — un sesgo, no una medida.

**Decisión de diseño para cuando se construya**: dos pools separados, nunca
fusionados en un único número. Un RPC no puede (ni debe) mentir asignando una
puntuación de "afinidad de estudio" a alguien que nunca ha pisado ese estudio.

## 2. El punto de extensión real: `lib/sustituciones/baja.ts` → `crearBaja()`

`crearBaja()` es la única puerta de entrada del motor (`docs/NETWORK-AUDIT.md
§2`, ya usada por `app/api/sustituciones` y `app/api/public/baja`). Hoy:

```
crearBaja(sesión)
  → rankear_candidatas(sesión)   [SQL, pool interno, puntuado]
  → inserta `sustituciones` con el ranking interno
  → si autónomo: contactarDesde() la primera candidata
```

La extensión NO toca `rankear_candidatas` ni su SQL. Añade un paso paralelo,
en TS, después:

```
crearBaja(sesión)
  → rankear_candidatas(sesión)              [sin cambios]
  → candidatosNetworkParaHueco(sesión)      [NUEVO, lib/network/candidatos-sustitucion.ts]
  → inserta `sustituciones` con el ranking interno   [sin cambios]
  → adjunta los candidatos de Network como sugerencia APARTE, sin puntuar
```

`candidatosNetworkParaHueco()` consultaría `red_perfiles` con:

```sql
select * from red_perfiles
where estado = 'published'
  and disponibilidad_estado in ('disponible', 'disponible_sustituciones')
  and especialidades && :especialidad_del_tipo_clase   -- ver §3, gap real
  and (ciudad = :ciudad_del_estudio or ciudad is null)  -- mismo texto plano, sin geocodificar
  and disponibilidad_horarios && :franja_de_la_clase    -- mañanas/tardes/noches/fines_semana
```

Sin `unique(experiencia_id)` ni scoring: se muestran en una sección aparte de
la UI ("Profesionales de Tentare Network", no en la lista puntuada de
sustitutas internas), con lenguaje que dice "podría encajar", nunca un
porcentaje — mismo principio que ya cerró el bug de "Compatibilidad 87 %"
fabricada (memoria `porcentaje-sin-respaldo-en-pantalla`).

## 3. El gap real que hay que resolver ANTES de construir esto: no hay columna común

`tipos_clase.nombre` es texto libre por estudio ("Reformer Intensivo",
"Mat Suave", "Power Pilates"...). `red_perfiles.especialidades` es el catálogo
fijo de Network (`reformer | mat | maquina | yoga | hiit | otro`,
`lib/network/catalogo.ts`). **No existe hoy ninguna columna que traduzca de
uno a otro** — cruzarlos por coincidencia de texto sería frágil y daría falsos
negativos constantes (un tipo de clase llamado "Reformer Intensivo" no
coincide con el string `'reformer'` sin normalizar).

Antes de implementar `candidatosNetworkParaHueco()`, hace falta UNA de estas
dos piezas (decisión de producto, no técnica — no tomarla aquí):

- Añadir `tipos_clase.especialidad_network` (nullable, del mismo enum que
  `red_perfiles.especialidades`) para que cada estudio mapee sus tipos de
  clase reales al catálogo de Network una vez, al crearlos/editarlos.
- O aceptar un matching aproximado (normalizar y buscar substring) como
  primera versión, documentando explícitamente su tasa de error — no
  recomendado como solución permanente.

## 4. Disponibilidad: señal orientativa, nunca una promesa de hueco libre

`red_perfiles.disponibilidad_horarios` son 4 franjas anchas (mañanas / tardes
/ noches / fines de semana). `instructora_disponibilidad` (el motor interno)
guarda rangos reales por día de la semana. Cruzar ambas solo puede responder
"esta persona dice que en general está disponible por la tarde", nunca
"está libre el martes a las 18:00" — la franja de Network no sustituye una
comprobación real. Cualquier UI que muestre candidatos de Network para un
hueco concreto tiene que dejar esto explícito (p. ej. "disponibilidad
orientativa, confírmalo con ella"), y el contacto real sigue pasando por
`red_solicitudes_contacto` (Fase 9, ya construido) — nunca una reserva
automática.

## 5. Cómo se contactaría, y por qué no reutiliza el flujo interno de sustituciones

`sustitucion_contactos` (el flujo de token firmado que ya usa
`contactarDesde()`) asume que la candidata YA es una fila `instructores` de
ese estudio — necesita su `instructor_id`. Una persona de Network no lo tiene.
La vía de contacto natural es la que ya existe desde la Fase 9:
`red_solicitudes_contacto` (mensaje + aceptar/rechazar + revelar contacto solo
al aceptar). Si acepta y el estudio decide contratarla de verdad para cubrir
la clase, eso es un alta de equipo normal (`POST /api/equipo`, con o sin el
flujo de invitación) — un paso manual, deliberadamente fuera de esta
extensión: automatizar "aceptó el contacto → ya es instructora del hueco" se
saltaría el criterio humano que el propio encargo original pide mantener
("no es un motor de contratación automática").

## 6. `candidatasPorAfinidad` no es parte de esto

Confirmado en la auditoría de la Fase 0 y repetido aquí para que no se
confunda en el futuro: `candidatasPorAfinidad`/`candidatasParaHueco`
(`lib/booking-logic.ts`) rankean **socias** para ofrecerles un hueco en una
clase con poca ocupación — dominio totalmente distinto al de sustitutas. Nada
de esta extensión los toca.

## 7. Resumen de lo que NO se construye en esta fase

- Ningún cambio en `rankear_candidatas` ni en cualquier RPC de sustituciones.
- Ningún merge de candidatos internos y de Network en una sola lista puntuada.
- Ninguna columna nueva (`tipos_clase.especialidad_network` incluida) — es una
  decisión de producto a tomar explícitamente antes de construir el resto.
- Ningún contacto/reserva automática con un perfil de Network.

Esto cierra la Fase 11 y, con ella, las 11 fases originales de
`docs/NETWORK-IMPLEMENTATION-PLAN.md`.
