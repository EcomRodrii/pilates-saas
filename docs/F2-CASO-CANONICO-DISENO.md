# F2 · Caso canónico — Diseño (el foso)

> **Estado:** propuesta de diseño para revisión. **Cero código todavía.**
> Este documento aterriza §7 y §12 del informe del comité sobre el modelo de datos **real** (verificado en prod `dwqvdycjcffqwfkzapvi`, 2026-07-23), señala las decisiones de producto que solo tú puedes tomar, y propone una secuencia de fases. Nada se implementa hasta que lo revises.

---

## 0. Por qué esto es el foso (y no otra feature)

El modelo comercial dominante del Pilates español —**plaza fija semanal con recuperaciones caducables**— no cabe en el modelo de datos ni en el pricing de ningún incumbente sin que canibalice su propia facturación (Eversports cobra por volumen de reservas: 120 socias fijas ≈ 9 reservas/mes revientan su tier). Cada recuperación viva con su caducidad en la BD es **coste de cambio real**: migrar a un rival que no la modela es volver a la libreta.

El error de activación más caro del plan anterior, y el que este diseño corrige de raíz:

> **Si la recuperación solo nace en la app, el sistema se vacía en dos semanas.**

La socia escribe *«¡Hola guapa! el martes no puedo»* por WhatsApp. El estudio cobra por Bizum, recibo del banco y efectivo. Por tanto **el diseño es dueña-first y por-fechas, no app-first ni webhook-first.**

---

## 1. El modelo actual (lo que YA hay — punto de partida)

Verificado contra el esquema real. Todo lo de F2 se construye **encima** de esto, sin romperlo.

### Tablas núcleo
| Tabla | Campos relevantes | Rol |
|---|---|---|
| `planes_tarifa` | `tipo` (MENSUAL/BONO/PUNTUAL), `precio`, `sesiones` (int, sólo bonos), `activo` | Catálogo de tarifas |
| `suscripciones` | `plan_id`, `estado` (ACTIVA/CANCELADA), `fecha_inicio`, `fecha_fin`, `sesiones_restantes`, `stripe_subscription_id` | **Instancia** de un plan comprada por una socia |
| `reservas` | `sesion_id`, `socio_id`, `estado`, `spot_id`, `posicion_espera`, `check_in_en` | Reserva de una socia en una sesión concreta |
| `sesiones` | `tipo_clase_id`, `sala_id`, `instructor_id`, `inicio`, `fin`, `aforo_maximo`, `cancelada`, **`serie_id`** | Instancia de clase en el calendario |
| `salas` | `capacidad`, `color` | Sala física |
| `spots` | `sala_id`, `numero`, `nombre`, `fila`, `columna`, `tipo`, `activo` | Posición física (reformer) dentro de una sala |
| `tipos_clase` | `nombre`, `duracion_minutos`, `nivel` | Tipo de clase |

**Estados reales en uso** (de datos de prod): `reservas.estado` ∈ {CONFIRMADA, LISTA_ESPERA, ASISTIDA, NO_ASISTIO, CANCELADA}; `suscripciones.estado` ∈ {ACTIVA, CANCELADA}; `planes_tarifa.tipo` ∈ {MENSUAL, BONO, PUNTUAL}.

### Lógica de reserva y bono (lo que hace hoy)
- **`reservar_plaza(studio, sesion, socio, reserva_id)`** — RPC `SECURITY DEFINER`. Bloquea la sesión con `FOR UPDATE`, comprueba doble-reserva, cuenta ocupadas contra `aforo_maximo`, inserta la reserva como `CONFIRMADA` o `LISTA_ESPERA`. **No mira suscripciones ni bonos.**
- **`consumir_sesion_bono(suscripcion, studio)`** — RPC aparte: `sesiones_restantes = sesiones_restantes - 1` con guardia `> 0`.
- **`lib/bono-logic.ts`** — lógica pura (única fuente de verdad en el contexto) para decidir sobre qué suscripción se descuenta/devuelve y si el bono queda agotado. `tieneEntitlementActivo()` decide si la socia puede reservar (MENSUAL vigente por `fecha_fin`, o BONO/PUNTUAL con `sesiones_restantes > 0`).
- **Exclusiones GiST ya existentes** (extensión `btree_gist` activa): `sesiones_instructor_sin_solape` y `sesiones_sala_sin_solape` impiden solapar instructor/sala en el tiempo. **Precedente probado** de que la anti-colisión por rango temporal ya vive en este esquema.

### ⚠️ Hallazgo de arquitectura que condiciona F2
**Reservar y consumir entitlement NO son atómicos hoy.** `reservar_plaza` inserta la reserva; el descuento del bono ocurre en un **segundo** RPC (`consumir_sesion_bono`) orquestado por el contexto de la app. Con reservas concurrentes o un fallo entre pasos, el saldo y la reserva pueden divergir. F2 necesita **canje transaccional** (recuperación/bono se consumen en la MISMA transacción que la reserva). → **Decisión central D10** más abajo: mover el consumo de entitlement dentro de `reservar_plaza`.

---

## 2. El gap — lo que el modelo NO sabe expresar hoy

1. **Plaza fija semanal.** Una socia "tiene el martes 10:00, reformer 3, todas las semanas". Hoy sólo hay reservas sueltas por sesión; no existe el compromiso recurrente ni su materialización.
2. **Recuperación caducable.** Cuando una socia con plaza fija no puede venir, nace un crédito de recuperación con fecha de caducidad, canjeable en otra clase. No existe.
3. **Bono con validez / límite semanal / congelación.** Hoy el bono tiene `sesiones_restantes` y un `fecha_fin` que **nadie rellena al comprar**. Falta: validez automática desde la compra, tope de sesiones por semana, y congelar el reloj (vacaciones, lesión).
4. **Máquina como recurso.** El aforo es un `int` fijo (`aforo_maximo`). No hay avería que baje el aforo real, ni `aforo_efectivo()` como fuente única.
5. **Cobro sin pasarela de primera clase.** Existe `recibos.metodo_cobro` (Bizum/efectivo/SEPA) pero la suscripción sigue atada mentalmente a Stripe. Falta que la suscripción **viva por fechas** y la remesa **cuaderno 19.14** para el banco.
6. **Excepción por persona.** "A Carmen jamás [le mandes recordatorio]" leído por todas las automatizaciones. No existe.

---

## 3. Diseño propuesto

Notación: 🆕 tabla/columna nueva · ♻️ cambio en algo existente · ⚙️ job/cron · 🔒 constraint.

### 3.1 · Bonos con validez, límite semanal y congelación (B2.1 + B2.8)

**Caducidad por instancia comprada, no por plan.** El plan define la *política*; la suscripción materializa las *fechas*.

> **✅ IMPLEMENTADO — Paso 1 (migración `0075`).** Lo de abajo es lo que hay en el PR.

```
♻️ planes_tarifa
   + validez_dias        int  null   -- BONO/PUNTUAL: caduca a los N días de la compra (null = sin caducidad)
   + limite_semanal      int  null   -- máx. sesiones/semana ISO (null = sin tope)

-- Congelación NO añade columna a suscripciones: reutiliza estado='PAUSADA' (I7).
🆕 congelaciones
   id, studio_id, suscripcion_id → suscripciones
   desde date, hasta date null      -- hasta null = congelación abierta
   dias_aplicados int null          -- se fija al descongelar; empuja fecha_fin
   motivo text, creada_en timestamptz

🆕 congelar_suscripcion(id, sus, studio, motivo)      -- inserta ventana + PAUSADA (atómico)
🆕 descongelar_suscripcion(sus, studio) → date        -- cierra ventana + empuja fecha_fin + ACTIVA
```

- **Validez:** al crear la suscripción de un bono, `fecha_fin := fecha_inicio + validez_dias` (helper puro `calcularFechaFinBono`, en ambos puntos de alta). `tieneEntitlementActivo()` ya respetaba `fecha_fin` para MENSUAL; **extendido a BONO/PUNTUAL** (antes el bono sólo miraba saldo). Legado seguro: `fecha_fin = null` → sin caducidad.
- **Límite semanal:** decisión pura `superaLimiteSemanal()` lista y testeada; su **enforcement** en el canje (§3.6) es del **Paso 3** (reservar_plaza cuenta las reservas de la semana ISO). En el Paso 1 sólo entra el dato + la lógica.
- **Congelación v1 = PAUSADA enriquecida.** No es un concepto nuevo: `pausarSuscripcion` ya ponía `PAUSADA` (I7) y `tieneEntitlementActivo` ya bloquea reservar si no está ACTIVA. Lo único que añade F2: (a) registrar la **ventana** (`congelaciones`) y (b) al reanudar, **empujar `fecha_fin` por los días congelados** para que no consuman la validez del bono. Ambas RPC son atómicas y server-side; la app repinta la nueva `fecha_fin` al volver.

### 3.2 · Plaza fija semanal (B2.2)

```
🆕 plazas_fijas
   id, studio_id, socio_id → socios
   -- ancla por SLOT (ver D1): día de la semana + hora + sala (+ tipo opcional)
   dia_semana   smallint      -- 0=domingo … 6=sábado (dow local del estudio)
   hora_inicio  time          -- hora local de la clase recurrente
   sala_id      text          -- sala física
   tipo_clase_id text null    -- opcional: acota a un tipo de clase
   spot_id      text null     -- "tu reformer de siempre" (null = cualquiera del aforo)
   vigencia_desde date, vigencia_hasta date null   -- hasta null = indefinida
   estado text default 'ACTIVA'   -- ACTIVA / PAUSADA / BAJA
   creada_en timestamptz

🔒 plazas_fijas_spot_sin_solape  EXCLUDE USING gist
     (spot_id WITH =, dia_semana WITH =, hora_inicio WITH =,
      daterange(vigencia_desde, vigencia_hasta) WITH &&)
     WHERE (spot_id IS NOT NULL AND estado = 'ACTIVA')
   -- dos personas no pueden tener el MISMO spot en el MISMO slot semanal con vigencias solapadas
   -- (usa btree_gist, ya activo; mismo patrón que sesiones_sala_sin_solape)
```

**Anclaje = SLOT `(dia_semana, hora_inicio, sala_id)`** — **D1 revisada.** Comprobado en prod: **0 de 56 sesiones tienen `serie_id`** poblado; las recurrentes NO se crean como serie hoy. Anclar a `serie_id` se apoyaría en un campo vacío. El slot es robusto a cómo se crean las clases de verdad (a mano, sin serie) y la materialización empareja sesiones futuras por `(dow local, hora local, sala)`. `serie_id` queda como acelerador opcional cuando exista. **Ojo timezone:** el emparejamiento usa la hora **local** del estudio (`inicio at time zone tz`), no UTC.

**⚙️ Materialización (`pg_cron` nocturno, idempotente):**
1. Para cada `plaza_fija` ACTIVA, tomar las sesiones futuras de su `serie_id` dentro del horizonte (p. ej. 6 semanas → **D4**).
2. Crear una `reserva` CONFIRMADA para la socia en cada una (con su `spot_id` si lo tiene), **saltando**: sesiones ya reservadas (idempotencia), fechas con `socio_excepciones`, congelación activa, plaza PAUSADA/BAJA.
3. Respetar `aforo_efectivo` (§3.4); si no cabe, es una decisión de la bandeja (§3.7), nunca auto-cancelar.

> Reutiliza toda la maquinaria de `reservas` (check-in, valoración, sustituciones, recordatorios). Una plaza fija **es** un generador de reservas normales — no un camino paralelo.

### 3.3 · Recuperaciones con caducidad (B2.3)

```
🆕 recuperaciones
   id, studio_id, socio_id → socios
   origen_reserva_id text null   -- la reserva de plaza fija que se perdió y la generó
   motivo text
   caduca_el date                -- calculada por política del estudio
   estado text default 'DISPONIBLE'   -- DISPONIBLE / USADA / CADUCADA / ANULADA
   usada_en_reserva_id text null
   creada_en timestamptz

♻️ (config estudio) recuperacion_caducidad_tipo  text  -- 'DIAS' | 'FIN_MES' | 'FIN_MES_SIGUIENTE'
♻️ (config estudio) recuperacion_caducidad_dias  int null   -- si tipo='DIAS'
```

- **Nace dueña-first** (§3.5): cuando el estudio da de baja una sesión de plaza fija de una socia, se inserta una recuperación con `caduca_el` según política.
- **Caducidad** (D2): `DIAS` (N días desde creación) · `FIN_MES` (fin del mes en curso) · `FIN_MES_SIGUIENTE`. ⚙️ barrido diario marca `CADUCADA` las vencidas.
- **Canje:** dentro de `reservar_plaza` (§3.6), atómico.

### 3.4 · Máquina como recurso + `aforo_efectivo()` (B2.7)

```
♻️ spots
   + tipo_equipo text null       -- 'REFORMER' | 'CADILLAC' | 'TORRE' | ...  (o reutilizar spots.tipo)
🆕 bloqueos_maquina
   id, studio_id, spot_id → spots
   desde timestamptz, hasta timestamptz null, motivo text   -- avería / mantenimiento

🆕 función aforo_efectivo(p_sesion_id) RETURNS int
   = min(sesiones.aforo_maximo,
         nº de spots activos de la sala de la sesión SIN bloqueo solapando [inicio,fin])
```

- **`reservar_plaza` pasa a usar `aforo_efectivo(sesion)`** en vez de leer `aforo_maximo` directo → fuente única de verdad de capacidad.
- Avería que deja el aforo por debajo de las reservas confirmadas → **overflow a la bandeja** (a quién recolocar), nunca cancelación automática.

### 3.5 · Flujo dueña-first + vía socia mínima (B2.4 + B2.5)

**El corazón de la activación.** La recuperación y la baja puntual nacen **desde la dueña**, no sólo desde la app de la socia.

- **Dueña-first:** en la sesión / en la ficha de la socia, botón *"No puede venir"* → da de baja esa reserva de plaza fija + genera la recuperación + (opcional) abre `wa.me` con mensaje plantilla *«¡Hecho! Te guardo la recuperación hasta el {fecha}»*. `wa.me` = deep-link, **sin** WhatsApp Business API (cero coste/infra).
- **Vía socia mínima:** en el portal, la socia puede cancelar su plaza fija del día y recibir la recuperación. Secundaria, no la vía principal.
- Ambas rutas convergen en **una** RPC transaccional (`baja_plaza_fija`): marca reserva CANCELADA + inserta recuperación, atómico.

### 3.6 · `reservar_plaza` transaccional — el canje (núcleo)

`reservar_plaza` pasa de "insertar reserva" a **resolver entitlement + consumir + reservar en una sola transacción** (todo bajo el `FOR UPDATE` de la sesión que ya tiene):

```
1. Lock sesión (FOR UPDATE) — ya lo hace
2. aforo := aforo_efectivo(sesion)        -- §3.4
3. Resolver derecho a plaza, por orden de preferencia (D9):
     plaza fija materializada → recuperación DISPONIBLE → bono con saldo+validez+límite → mensual vigente
4. Comprobaciones: no doble-reserva (ya), congelación (§3.1), límite semanal (§3.1), excepción (§3.8)
5. Consumir el entitlement elegido EN LA MISMA TX:
     recuperación → estado=USADA, usada_en_reserva_id
     bono         → sesiones_restantes -= 1  (absorbe consumir_sesion_bono)
     mensual/plaza fija → nada
6. Insertar reserva (CONFIRMADA / LISTA_ESPERA)
```

**Cancelación** (RPC espejo): devuelve el entitlement — recuperación DISPONIBLE (si no caducada), bono +1 (tope `plan.sesiones`, ya en `calcularDevolucionBono`).

→ Esto resuelve el hallazgo de §1. `bono-logic.ts` pasa a **derivar/mostrar**; la verdad transaccional vive en la RPC. Ver **D10**.

### 3.7 · Bandeja diaria única + excepciones (B2.9)

```
🆕 socio_excepciones
   id, studio_id, socio_id, tipo text, valor text null, motivo text null, creada_en
   -- tipo p.ej. 'SIN_RECORDATORIO_COBRO', 'SIN_AVISO_HUECO', 'NUNCA_LISTA_ESPERA'...
```

- **Bandeja:** una lista diaria de **≤5** decisiones (recuperaciones por vencer, huecos de plaza fija, overflow por avería, cobros pendientes). **Penalizaciones apagadas.** No es un panel nuevo pesado: es un widget que **lee** de las tablas de arriba.
- **Excepción universal "porque lo digo yo":** botón en cada regla, **log discreto, sin formulario**. Todas las automatizaciones (recordatorios, avisos de hueco, dunning) consultan `socio_excepciones` antes de actuar.

### 3.8 · Cobros sin pasarela + cuaderno 19.14 (B2.6 + B2.10)

- **La suscripción vive por fechas, no por webhook.** Ya existe `recibos.metodo_cobro` (Bizum/efectivo/transferencia/SEPA). F2: crear suscripción + recibo cobrado **sin Stripe** como camino de primera clase; `BILLING_ENFORCED` no debe exigir `stripe_subscription_id` a estos tenants (**D8**).
- **Cuaderno 19.14** (adeudo SEPA B2C, estándar bancario español): generar el fichero de remesa (XML/TXT) desde los recibos pendientes con mandato. Requiere datos de mandato (IBAN, ref, fecha firma) por socia → 🆕 `mandatos_sepa` (**D7**). B2.10, ~3 días.

### 3.9 · Rescate desde Excel + PDF libreta (B2.11)

- **Rescate:** importador que trae socias + plazas fijas + saldos de bono + recuperaciones desde la hoja de cálculo del estudio (extiende el importador CSV que ya existe). Es lo que hace que un estudio en Excel **arranque con datos reales**, no vacío.
- **PDF libreta "Tu estudio en Tentare"** (garantía de salida): PDF mensual, cada socia con plan / sesiones restantes / recuperaciones / plaza fija. *«Si cerráis, me quedo con mi libreta, en mejor.»* Es a la vez feature de confianza y **anti-lock-in honesto** que baja la barrera de entrada.

---

## 4. Decisiones de producto — ACORDADAS ("lo que me recomiendes", 2026-07-23)

Todas fijadas con mi recomendación. D1 revisada tras verificar prod.

| # | Decisión | Acordado |
|---|---|---|
| **D1** | Anclaje de la plaza fija | **SLOT `(dia_semana, hora, sala)`** (revisada: `serie_id`=0/56 en prod). `serie_id` como acelerador opcional. |
| **D2** | Caducidad de recuperación por defecto | **FIN_MES_SIGUIENTE**, configurable por estudio. |
| **D3** | Tope de recuperaciones vivas por socia | **Sí, 4** (configurable). |
| **D4** | Horizonte de materialización | **6 semanas** rodante. |
| **D5** | Congelación | **Reusa PAUSADA** (bloquea reservar gratis) + empuje de `fecha_fin`; tope configurable (~60 d/año) más adelante. |
| **D6** | `spot_id` en plaza fija | **Opcional.** |
| **D7** | Mandatos SEPA | **No existen** → `mandatos_sepa` nueva; Q19.14 en el Paso 8. |
| **D8** | Cobro manual vs `BILLING_ENFORCED` | **Suscripción por fechas sin Stripe** = primera clase. |
| **D9** | Orden de consumo | plaza fija → **recuperación (caduca antes)** → bono → mensual. |
| **D10** | Consumo de entitlement dentro de `reservar_plaza` | **Sí** (Paso 3, refactor atómico con verificación en prod). |

---

## 5. Plan por fases (secuencia sugerida, ~36 d del informe)

Cada fase = 1+ migración numerada (`0075_…` en adelante), aplicada **una a una con verificación en prod** (proceso habitual), + su capa de app. Regla de deslizamiento del informe: si una fase se desliza >3 d se recorta de su propio extremo (congelación→manual, bandeja→lista simple), **jamás del gate**.

| Orden | Bloque | Entrega |
|---|---|---|
| **1 ✅** | **Bonos validez/límite/congelación** (B2.1/B2.8) | **HECHO** (migr. `0075` + lógica + UI + tests). Aislado; no toca reservas. |
| **2** | **`aforo_efectivo()` + máquina/avería** (B2.7) | Prepara la capacidad real que necesita la plaza fija. |
| **3** | **`reservar_plaza` transaccional** (D10) | Refactor núcleo: aforo_efectivo + consumo atómico de bono. Sin cambio de comportamiento visible → verificable con la suite E2E. |
| **4** | **Plazas fijas + materialización** (B2.2) | Tabla + GiST + cron idempotente. |
| **5** | **Recuperaciones + canje** (B2.3) enchufado al `reservar_plaza` del paso 3 | El crédito caducable, ya con canje transaccional. |
| **6** | **Flujo dueña-first + vía socia** (B2.4/B2.5) | La ruta de activación (`baja_plaza_fija` + wa.me). |
| **7** | **Excepciones + bandeja diaria** (B2.9) | Widget que lee lo anterior. |
| **8** | **Cobro sin pasarela + cuaderno 19.14** (B2.6/B2.10) | Suscripción por fechas + remesa. |
| **9** | **Rescate Excel + PDF libreta** (B2.11) | Onboarding real + garantía de salida. |

**Gate H3 (semana 8):** caso canónico vivo con un estudio real por las **dos** vías (dueña y socia), en un tenant **100% Bizum/efectivo, 0 mandatos SEPA**, + uso continuado: **≥80% de las faltas registradas en Tentare 3–4 semanas seguidas, sin acompañamiento.** No se capta a escala hasta pasar el gate.

---

## 6. Riesgos y no-objetivos

- **Riesgo nº1 — activación:** si la recuperación no nace dueña-first, el sistema se vacía. Por eso el paso 6 (dueña-first) no se puede recortar; lo recortable es la vía socia.
- **`reservar_plaza` es sección crítica** (concurrencia + dinero). El paso 3 va con la suite E2E como red y verificación en prod.
- **No tocar** las exclusiones GiST existentes de `sesiones` ni `btree_gist` a la ligera (los usamos, no los movemos). Las nuevas exclusiones son **aditivas**.
- **Materialización idempotente o nada:** un cron que duplique reservas es peor que no tenerlo. Diseño con `WHERE NOT EXISTS` + clave natural.
- **No-objetivo F2:** no se publica la spec de recuperaciones fuera hasta tenerla viva en 3+ estudios (sería escribirle el ticket a Eversports).
- **No-objetivo F2:** retirar Plan Cadena (B0.5) sigue **aparcado** ("todavía no").

---

## 7. Estado y siguiente paso

- **Decisiones D1–D10:** acordadas (§4).
- **Paso 1:** implementado (migr. `0075`, lógica pura + tests, RPCs de congelación, UI del plan). `tsc` limpio, 710/710 tests. **Falta aplicar `0075` a prod y verificar** (mismo proceso de siempre) antes de mergear.
- **Siguiente (Paso 2):** `aforo_efectivo()` + máquina/avería, para preparar la capacidad real que necesitan plaza fija y recuperaciones.
