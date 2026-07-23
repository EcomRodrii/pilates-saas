# F2 · Paso 4 — Plaza fija semanal (el corazón del foso)

> **Estado:** este PR entrega el **diseño + la tabla + la capa de datos** (4a). La materialización (pg_cron) y la UI van en PRs siguientes (4b, 4c). Grounded en el esquema real de prod.

---

## 1. Qué es y por qué

**Plaza fija semanal** = una socia tiene reservado un hueco recurrente ("María, martes 10:00, Reformer, sitio 3, todas las semanas"). Es **el modelo comercial dominante del Pilates español** y lo que ningún incumbente modela sin canibalizar su pricing. Cada plaza fija es coste de cambio real.

Hoy las reservas son sueltas (una por sesión). La plaza fija es una **capa por encima**: se declara una vez y un job **materializa** reservas normales para las próximas sesiones que encajan. Reutiliza toda la maquinaria de `reservas` (check-in, valoración, sustituciones, avisos) — no es un camino paralelo.

---

## 2. Anclaje por SLOT (no por serie) — D1

Verificado en prod: **0/56 sesiones tienen `serie_id`** — las recurrentes NO se crean como serie. Por eso la plaza fija se ancla a un **slot**: `(dia_semana, hora_inicio, sala)` + filtro opcional de tipo de clase. La materialización empareja las sesiones futuras por **hora local del estudio** (`inicio at time zone tz`), no UTC.

---

## 3. Modelo de datos (ESTE PR — migración `0078`)

```
🆕 plazas_fijas
   id            text pk
   studio_id     text  → studios
   socio_id      text  → socios
   dia_semana    smallint      -- 0=domingo … 6=sábado (dow local; = extract(dow))
   hora_inicio   time          -- hora local de la clase recurrente
   sala_id       text  → salas
   tipo_clase_id text null → tipos_clase   -- opcional: acota a un tipo
   spot_id       text null → spots         -- "tu reformer de siempre" (D6: opcional)
   vigencia_desde date, vigencia_hasta date null   -- hasta null = indefinida
   estado        text default 'ACTIVA'     -- ACTIVA / PAUSADA / BAJA
   creada_en     timestamptz

🔒 plazas_fijas_spot_sin_solape  EXCLUDE USING gist (
     spot_id WITH =, dia_semana WITH =, hora_inicio WITH =,
     daterange(vigencia_desde, vigencia_hasta) WITH &&
   ) WHERE (spot_id IS NOT NULL AND estado = 'ACTIVA')
   -- dos socias no pueden tener el MISMO sitio en el MISMO slot con vigencias solapadas.
   -- Usa btree_gist (ya activo); mismo patrón que sesiones_sala_sin_solape.
```

RLS: `admin_plazas_fijas` (authenticated, `studio_id = current_studio_id()`), igual que suscripciones/congelaciones/bloqueos.

**Índice** para la materialización: `(studio_id, estado, dia_semana)`.

---

## 4. Materialización — pg_cron (PR 4b, siguiente)

Job nocturno idempotente. Por cada `plaza_fija` ACTIVA, para las sesiones futuras dentro del **horizonte (6 semanas, D4)** cuyo `(dow local, hora local, sala)` encaja (y `tipo_clase_id` si está):
1. Crear una `reserva` CONFIRMADA para la socia (con su `spot_id` si lo tiene), **saltando**: sesión ya reservada por ella (idempotencia, `WHERE NOT EXISTS`), fechas con `socio_excepciones` (Paso 7), suscripción congelada/PAUSADA (Paso 1), plaza PAUSADA/BAJA.
2. Respetar `aforo_efectivo` (Paso 2). Si no cabe → decisión a la bandeja (Paso 7), **nunca** auto-cancelar.
3. Consumo de bono: la plaza fija normalmente va con MENSUAL (no consume). Si la socia es de bono, la materialización consume igual que una reserva confirmada (reutiliza el flujo del Paso 1/consumo).

> Idempotencia o nada: un cron que duplique reservas es peor que no tenerlo. Clave natural `(socio_id, sesion_id)` + `WHERE NOT EXISTS`.

## 5. Baja puntual → recuperación (enlaza con Paso 5/6)

Cuando la socia no puede venir a una sesión de su plaza fija, la **dueña** (dueña-first, Paso 6) da de baja esa reserva y nace una **recuperación** caducable (Paso 5). La plaza fija sigue viva; solo esa semana no.

## 6. UI (PR 4c) — asignar plaza fija

En la ficha de la socia (o Equipo/Horario): "Plaza fija" → elegir día, hora, sala, (tipo), (sitio), vigencia. Lista de plazas fijas activas del estudio. La exclusión GiST da el error si el sitio ya está pillado en ese slot.

---

## 7. Plan por PRs

| PR | Contenido | Estado |
|---|---|---|
| **4a** | Diseño + tabla `plazas_fijas` + GiST + tipos + capa de datos (CRUD) | **ESTE** |
| **4b** | Materialización pg_cron (idempotente, respeta aforo/excepciones/congelación) | siguiente |
| **4c** | UI de asignación + baja puntual (nace recuperación cuando exista el Paso 5) | después |

Decisiones ya fijadas (del diseño F2): **D1** slot · **D4** horizonte 6 semanas · **D6** spot opcional. Sin nuevas decisiones de producto para 4a.
