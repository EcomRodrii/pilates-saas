# Tentare como sistema operativo del estudio — arquitectura operativa

Fecha: 2026-09-14 · Criterio: `tentare-arquitecto` · Estado: fase 1 implementada (ver §6).

No es una auditoría. Es la arquitectura a la que llevamos el producto y las
decisiones que la sostienen, para que cada cambio futuro empuje en la misma
dirección: **que la propietaria consiga lo mismo haciendo menos, decidiendo
menos y navegando menos.**

---

## 1. El diagnóstico, en cinco hechos estructurales

Se mapeó el sistema completo leyendo el código (reservas, cancelaciones, cobros,
dunning, sustituciones, automatizaciones, home, Centro de Control, navegación y
alta). No faltan funciones. Faltan cinco piezas de estructura:

1. **No hay dueño por hecho de negocio.** Los efectos de «reserva confirmada»
   (consumir bono + avisar) están copiados en cinco funciones de
   `lib/db/supabase-data-admin.ts`, y la reserva desde el panel ni siquiera pasa
   por el servidor: consume el bono en el navegador y no avisa a la socia
   (`lib/studio-context.tsx`, `addReserva`). «Cobro confirmado» tiene tres
   dueños (`confirmar-cobro.ts`, `entregarPlanComprado`, `confirmarCobroExitoso`)
   más `marcarCobrado` escribiendo desde el cliente.
2. **Lo que espera a la propietaria está repartido en diez pantallas** y no hay
   ningún contador que lo junte: reservas por aprobar (panel lateral del
   calendario), sustituciones (`/sustituciones`), penalizaciones, devoluciones y
   canjes (tarjetas sueltas de la home), cobros perdidos (`/cobros`),
   automatizaciones esperando (`/automatizaciones`).
3. **Los bucles no se cierran.** Una instructora avisa de que no puede venir →
   la propietaria recibe un push CRÍTICO → alguien la cubre → a la propietaria no
   le llega nada. Tentare lo resolvía y ella no se enteraba.
4. **Lo nativo y lo configurable estaban mezclados.** El recordatorio de clase
   ya lo manda Tentare a todos los estudios, y aun así el checklist de arranque
   pedía «activar» una regla (`CLASE_MANANA`) que mandaba un segundo recordatorio.
5. **La navegación agrupaba por objeto, no por pregunta.** Un grupo «Estudio» de
   once entradas mezclaba equipo, informes, cierre fiscal, ajustes y la cuota de
   Tentare; la misma pantalla se llamaba «Dashboard» o «Inicio» según el
   dispositivo; `/comunidad` duplicaba una pestaña de Mensajería.

---

## 2. Arquitectura objetivo: cuatro capas

```
            ┌──────────────────────────────────────────────────────┐
  capa 4    │ Decision OS / Centro de Control                      │  sugiere, prioriza,
            │ (lib/decision) — piloto automático opt-in            │  ejecuta lo seguro
            └──────────────────────────────────────────────────────┘
            ┌──────────────────────────────────────────────────────┐
  capa 3    │ Estado del estudio (read model)                      │  DECIDIR / EN MARCHA /
            │ lib/estado-estudio.ts + /api/estado-estudio          │  RESUELTO
            └──────────────────────────────────────────────────────┘
            ┌─────────────────────────┐ ┌──────────────────────────┐
  capa 2    │ Automático de serie     │ │ Automatizaciones         │
            │ (sin configurar nada)   │ │ personalizables (reglas) │
            └─────────────────────────┘ └──────────────────────────┘
            ┌──────────────────────────────────────────────────────┐
  capa 1    │ Dominio: UN dueño por hecho de negocio               │  idempotente,
            │ reserva · cancelación · cobro · fallo · baja · ...   │  transaccional
            └──────────────────────────────────────────────────────┘
               ▲ portal alumna   ▲ /reservar   ▲ panel   ▲ webhook   ▲ cron
```

### Capa 1 — un dueño por hecho de negocio

Cada hecho tiene **una** función de servidor que hace todos sus efectos, y
todas las puertas de entrada (portal, `/reservar`, panel, webhook, conciliador,
cron) la llaman. No es un bus de eventos nuevo ni Inngest para todo: es la
función que ya existe en el mejor de los caminos, convertida en el único camino.

| Hecho | Dueño objetivo | Hoy |
|---|---|---|
| Reserva confirmada | `trasReservaConfirmada()` (bono + aviso + gamificación + analítica) | 5 copias + panel en cliente |
| Reserva cancelada | `ejecutarCancelacionReserva` | ✓ ya es el dueño; la cancelación de serie lo esquiva a propósito |
| Cobro confirmado | una sola `confirmarCobro()` (recibo → entrega → factura → aviso) | 3 dueños + panel en cliente |
| Cobro fallido | `registrarFalloCobro` | ✓ ya es el dueño |
| Baja de instructora | `crearBaja` | ✓ ya es el dueño (todas las puertas pasan por ahí) |
| Sustitución resuelta | RPC `confirmar_sustitucion` + avisos | ✓ desde este cambio avisa a los tres implicados |

Reglas que no se negocian (vienen de los errores ya pagados en este repo):
- **Dinero:** confirmación real antes de anunciar nada, compare-and-set,
  idempotencia por intento. Nunca un efecto financiero que pueda correr dos veces.
- **Transacción en Postgres** para lo que sea todo-o-nada (patrón
  `reservar_plaza`, `confirmar_sustitucion`).
- **La regla de negocio vive en la función, no en el reloj:** el cron solo
  avisa antes; si no corre, la regla sigue siendo correcta.

### Capa 2 — automático de serie frente a personalizable

**De serie** = comportamiento del producto. Corre para todos los estudios sin
configurar nada y no aparece como «regla»:
recordatorio de clase, confirmación al reservar, plaza libre → lista de espera,
bono agotado / por caducar, reintento de cobros, valoración tras la clase,
búsqueda de sustituta cuando alguien avisa.

**Personalizable** = decisiones que dependen de cómo trabaja cada estudio:
a quién escribir cuando deja de venir, cómo perseguir un pago sin tarjeta,
cuándo proponer un plan, qué hacer con una alumna nueva que no reserva.

Criterio para decidir en qué lado va algo nuevo: *¿hay algún estudio razonable
que NO lo querría?* Si no, es de serie. Si sí, y la diferencia es de política
(penalizaciones, aprobación manual), es un ajuste del estudio. Solo si la
diferencia es de mensaje o de secuencia es una automatización.

La pantalla `/automatizaciones` enseña las dos capas separadas («Esto ya lo hace
Tentare, sin que configures nada» encima de las reglas).

### Capa 3 — el estado del estudio

Un read model, no un motor: recuentos de estados que ya escriben los flujos.

- **Decidir** — no avanza sin ti: clases sin cubrir, reservas por aprobar,
  cobros que Tentare no ha conseguido cobrar, penalizaciones, devoluciones,
  automatizaciones esperando, recompensas por entregar.
- **Tentare lo está haciendo** — buscando sustituta, plazas ofrecidas a la lista
  de espera, cobros en reintento.
- **Resuelto por Tentare** — clases cubiertas, acciones autónomas, mensajes
  automáticos enviados.

Vive en la home (sección fija detrás de «Hoy en el estudio») y su cifra
«por decidir» va sobre Inicio en el menú y en la barra de móvil. Acotado por rol
en el servidor. Sin plan de por medio: es operación, no Decision OS.

⚠️ Nunca afirma «todo bien»: solo «nada espera tu visto bueno». El ActionCenter
del Decision OS, justo debajo, puede estar contando sugerencias (lección de #1401).

### Capa 4 — Decision OS

Sin cambios de rol: detecta, prioriza, propone y ejecuta lo seguro con el piloto
automático (opt-in, nunca cobra solo). La diferencia con la capa 3 es de
naturaleza: **sugerencias** frente a **cosas que bloquean la operación**. No se
mezclan en el mismo contador.

---

## 3. Flujos objetivo y lo que falta en cada uno

**Reserva** → comprobar plan/bono → consumir crédito → ocupar plaza (o lista de
espera / pendiente de aprobación) → confirmar a la alumna → recordatorios de serie
→ métricas/gamificación. *Falta:* que el panel pase por el mismo dueño (hoy la
reserva de mostrador no avisa a la alumna y consume el bono en el cliente).
Antes de «arreglarlo», confirmar con producto si una reserva hecha en el
mostrador debe avisar (la alumna suele estar delante).

**Cancelación** → política → devolver crédito → liberar plaza → promover u
ofrecer a la siguiente → avisar. *Ya funciona así* desde `ejecutarCancelacionReserva`.

**Baja de instructora** → ranking de candidatas → (asistido: espera visto bueno
| autónomo: contacta sola y escala) → alguien acepta → la clase cambia de
instructora en la misma transacción → avisan a la sustituta, a las alumnas (si el
estudio lo quiere) y **a la propietaria** («Clase cubierta. No tienes que hacer
nada»). Si no hay a quién preguntar → `agotada` + aviso, nunca silencio.
*Falta (P1):* escalar a Tentare Network cuando se agota el ranking interno
(hoy las candidatas de Network solo se enseñan como enlaces).

**Cobro** → recibo cobrado → entrega (bono/suscripción) → factura sellada →
recibo por email → aviso al mostrador. *Falta:* un solo dueño (ver capa 1) y que
`marcarCobrado` del panel deje de escribir desde el cliente.

**Cobro fallido** → reintentos +1/+3/+7 días (en marcha, visible en la bandeja)
→ al agotarse, `FALLIDO` en «Decidir». *Ya funciona así*; la bandeja lo hace visible
sin interrumpir antes de tiempo.

---

## 4. Navegación

```
Inicio · Centro de Control · Automatizaciones
OPERACIÓN   Calendario · Citas · Clientas · Mensajería
EQUIPO      Equipo · Sustituciones · Tentare Network
NEGOCIO     Cobros · Caja · Paquetes · Informes · Cierre de año
ESTUDIO     Configuración · Traer mis datos · Libreta · Actualizaciones · Suscripción
```

Ninguna ruta, permiso ni pantalla cambia: solo el sitio en el menú. Comunidad
sale del menú (era la misma pantalla que la pestaña de Mensajería) y se
encuentra desde ⌘K. Mensajería entra en el modo por defecto porque es la única
entrada con contador de no leídos. **No se crean menús nuevos**: una función
nueva vive dentro de un módulo existente o no se construye.

---

## 5. Priorización

**P0 — fundamental (fase 1, hecho en este cambio)**
- Bandeja única «lo que espera tu visto bueno» + contador en Inicio.
- Sustituciones cierran el bucle: la propietaria se entera de que está cubierta;
  la sustituta asignada desde el panel recibe su aviso; sin candidatas → `agotada`
  con aviso en vez de silencio; el Decision OS deja de prometer que «busca sola».
- Nativo frente a personalizable: el checklist ya no pide activar un segundo
  recordatorio; `/automatizaciones` separa las dos capas.
- Menú por pregunta, «Inicio» con un solo nombre, Comunidad sin duplicar,
  Mensajería visible por defecto; el checklist esencial ya no exige invitar a
  alguien a quien trabaja sola.

**P1 — alto impacto (siguiente, con diseño propio y `tentare-stripe`/`tentare-supabase`)**
- `trasReservaConfirmada()`: extraer las cinco copias a un único dueño.
- Reserva de mostrador por servidor, reutilizando el núcleo de `crearReservaPublica`.
- Un único dueño de «cobro confirmado», incluido el cobro manual del panel.
- Network como escalado automático cuando el ranking interno se agota.
- Plegar las tarjetas sueltas de aprobación de la home dentro de la bandeja
  (acción en línea), para que haya un solo sitio donde decidir.

**P2 — consistencia**
- Un solo sistema de recordatorios (hoy: email/WhatsApp + push + la regla antigua).
- Feed «Resuelto por Tentare» con detalle, escrito en servidor (hoy
  `actividad_reciente` lo escribe sobre todo el navegador).
- «Ofrecer plaza», «avisar a alumnas» y «devolver bono» como defaults con
  explicación en vez de interruptores sueltos en Configuración.
- Recuentos de la bandeja en una sola RPC si el volumen lo pide (medir antes).

**P3 — futuro**
- Calibración de umbrales por cadena; vistas agregadas de cadena.
- Motor de reglas único (hoy dos motores con solape documentado en
  `docs/marketing-solape-motores-diseno.md`; fusionarlos está descartado mientras
  cada uno tenga su característica distintiva).

---

## 6. Qué NO se ha hecho, a propósito

- **No se desactivó `CLASE_MANANA` en el motor.** Solo deja de ofrecerse. Hay 0
  reglas activas en producción (14-sep), pero apagarla en el motor cambiaría el
  canal (WhatsApp → email) de quien la tuviera sin avisar.
- **No se trocearon god files ni se tocó `fetchAllStudioData`** (decisiones cerradas).
- **Las recomendaciones del Decision OS no cuentan en el contador:** son
  sugerencias, no bloqueos. Mezclarlas volvería a crear dos cifras contradictorias.
- **No se añadió «cobros recuperados» a «Resuelto»:** no hay columna fiable que lo
  respalde, y una cifra sin respaldo en pantalla está prohibida en este repo.

---

## 7. Checklist para cualquier cambio futuro

1. ¿Hay ya un dueño para este hecho? Úsalo; si hay copias, el cambio va en el dueño.
2. ¿Es de serie o personalizable? (§2, capa 2). Nada básico se convierte en regla.
3. Si genera trabajo para la propietaria, ¿aparece en la bandeja? Si lo resuelve
   Tentare, ¿se ve en «Resuelto»?
4. Si hubo un aviso de problema, ¿hay aviso de resolución?
5. ¿Cabe en un módulo existente? No se añaden entradas de menú.
6. ¿Pregunta algo que se puede inferir o dejar con un buen valor por defecto?
