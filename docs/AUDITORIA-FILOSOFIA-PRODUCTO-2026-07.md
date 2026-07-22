# Auditoría: la app frente a la filosofía de producto

Fecha: 2026-07-20 · Alcance: `app/`, `components/`, `lib/`, `supabase/migrations/` · Sin cambios de código.

Criterio: el documento de filosofía de producto (9 principios de usabilidad + arquitectura modular de add-ons).
Objetivo declarado: **que una recepcionista contratada hoy sepa usar el sistema mañana sin formación.**

---

## Puntuación por principio

| # | Principio | Nota | Estado |
|---|---|---|---|
| 1 | No requiere formación | 3/10 | Consecuencia de los demás |
| 2 | Organización por tareas, no por funciones | **2/10** | Menú y configuración son catálogos de objetos |
| 3 | Reducir carga cognitiva | **3/10** | 15 pestañas / 84 ajustes en Configuración |
| 4 | Configuración guiada inicial | 5/10 | Existe checklist, pero parcial y mal posicionado |
| 5 | Ayuda contextual | **2/10** | No existe primitiva de tooltip |
| 6 | Consistencia absoluta | 3/10 | 9 cabeceras distintas, 639 botones a mano |
| 7 | Priorizar acciones frecuentes | 3/10 | El modo por defecto oculta Citas y Equipo |
| 8 | Evitar errores | 4/10 | Confirmaciones bien; mensajes de error, mal |
| 9 | Aprendizaje integrado | 3/10 | El acompañamiento se corta a los 5 minutos |
| — | Arquitectura de add-ons | 4/10 | Hay base, pero es de planes escalonados |

---

## Diagnóstico de fondo

**El problema no es ninguna pantalla concreta: es que no existe la capa que haría cumplir la filosofía.**

`components/ui/` tiene 17 primitivos y le faltan justo los que exigen los principios 5 y 6:
no hay `tooltip`, ni `table`, ni `form`/`field` con texto de ayuda, ni `accordion`/`collapsible`,
ni `PageHeader`, ni `EmptyState` en el dashboard (sí existe en el portal de socias).

Consecuencia medible: **639 `<button>` a mano frente a 23 `<Button>`**, 17 tablas artesanales,
tres mecanismos distintos de modal y 1.622 colores hex hardcodeados. Cada pantalla se reinventa
porque no hay pieza que reutilizar. La consistencia no se ha perdido: nunca se pudo imponer.

**Segundo hallazgo estratégico:** la superficie del producto (22 rutas de dashboard, 15 pestañas de
configuración, 32 destinos de navegación) ha crecido por encima de lo que "sin formación" puede
sostener. La arquitectura de add-ons no es solo un modelo de negocio — es la única vía realista
para volver a hacer el producto aprendible.

---

## P0 — Rompen la promesa hoy

### P0.1 · SQL crudo en un `alert()` del navegador
`app/(dashboard)/sustituciones/page.tsx:71,76,102,109` muestra `alert(r.error)` con el mensaje literal
de Postgres: `duplicate key value violates unique constraint "sustituciones_sesion_id_key"`.
Popup bloqueante del sistema operativo, en inglés, con jerga de base de datos. La dueña no sabe si la
sustitución se creó o no, reintenta, y se arriesga a duplicar los emails a las alumnas.

**Es sistémico, no puntual.** 22 rutas de `app/api/` devuelven el mensaje crudo en el JSON, y el
fallback amable de `lib/api-client.ts` (`data.error ?? 'No se pudo…'`) **es inalcanzable**: el backend
siempre rellena `data.error`, así que el texto en español nunca llega a mostrarse. La app parece
protegida y no lo está.

Puntos de fuga más graves: importación de socias (`app/api/socios/import/route.ts:130` → el momento de
onboarding, con toda la cartera de clientas en juego), integraciones (`JWT expired`), equipo
(`new row violates row-level security policy`), backups (errores de R2 en inglés).

El patrón correcto ya existe en el repo: `app/api/stripe/setup-sepa/route.ts:107-120` registra el
error crudo en consola y devuelve español comprensible.

### P0.2 · El menú por defecto oculta Citas y Equipo, y "Cobros" no existe
El "Modo Esencial" es el valor por defecto (`components/layout/sidebar.tsx:95`) y su whitelist
(`:88`) contiene 7 rutas que **excluyen `/citas` y `/equipo`** — dos de las seis acciones que el
principio 7 exige en primer nivel.

Peor: **no hay ningún destino llamado "Cobros" ni "Reservas"**. Cobrar está repartido entre
Transacciones, Facturas, POS y la ruta huérfana `/pagos` (que no está en el menú y solo se alcanza
desde la búsqueda global, `components/search/global-search.tsx:178`).

De 18 items visibles, **13 son sustantivos de objeto técnico** y 5 orientados a tarea. Ninguna
etiqueta está redactada como acción.

El Cmd+K existe (`components/search/global-search.tsx`) pero **solo busca datos** — socias, clases,
pagos. No devuelve acciones ni destinos, así que no rescata al usuario perdido.

Deuda añadida: `lib/nav-config.tsx:1-2` se declara "fuente única" pero el sidebar mantiene una copia
paralela en `sidebar.tsx:24`. Toda reorganización hay que hacerla dos veces.

### P0.3 · Configuración: 15 pestañas, 84 ajustes, 13 integraciones abiertas
`app/(dashboard)/configuracion/page.tsx:187-203`. Los cuatro ejemplos que el documento de filosofía
cita como "lo que NO hay que hacer" (Planes, Tarifas, Salas, Integraciones) están literalmente ahí
como pestañas. Van en `overflow-x-auto` (`:233`): se ven ~8, las otras 7 quedan fuera de pantalla
sin indicador.

Mezcla en un mismo plano lo diario (Planes, Clases, Salas) con gamificación (Recompensas, Logros,
Niveles, Retos = 4 pestañas, 31 controles) y sistema (Backups, Campos, Emails).

Dentro, `components/configuracion/tab-estudio.tsx:108-360` vuelca **16 campos en 9 secciones**, todas
abiertas, incluida la "Zona de riesgo" (`:342`) permanentemente a la vista.

---

## P1 — Estructurales (habilitan todo lo demás)

### P1.1 · Faltan las primitivas del sistema de diseño
Construir, por orden de retorno: `PageHeader` · `Tooltip` · `Field` con texto de ayuda · `Table` ·
`EmptyState` (portar el del portal) · `Collapsible`.

Evidencia de cabeceras: **cinco tamaños de `<h1>`** (`text-[26px]`, `text-2xl`, `text-xl`,
`text-[22px]`, `text-[15px]`) y **tres pesos** entre dashboard, socios, calendario, equipo, pagos,
informes, citas, pos y configuración. Solo calendario pone icono; solo informes usa `style` inline;
solo dashboard usa `buttonVariants()`.

Evidencia de modales: `Dialog` en 5 pantallas, overlay a mano en 4 (`productos:47` con `rgba(0,0,0,0.45)`,
`facturas:408` con `0.5`, `comunidad:268` con `black/40`, drawer en `calendario:1766`) y página propia
en 2. Los artesanales no atrapan foco ni cierran con Esc: **se comportan distinto, no solo se ven distinto**.

### P1.2 · Cero ayuda justo donde el usuario no sabe nada
`components/configuracion/tab-planes.tsx:247-262` pide elegir entre **MENSUAL / BONO / PUNTUAL** sin
una sola línea de explicación — la decisión más estructural que toma una dueña de estudio.
Alta de socia: **0 de 6 campos** con ayuda. Niveles 8/2, Logros 8/2, Retos 10/3.
Global estimado: **15-20 % de los campos** llevan explicación.

Causa raíz barata: el helper `Field` (`app/(dashboard)/configuracion/page.tsx:38`) tiene la firma
`{ label, children }` — **no hay ni siquiera dónde poner el texto de ayuda**.
El tono correcto ya está inventado en `tab-estudio.tsx:230-256` ("0 = sin penalización", "recomendado").

**28 de 50 botones solo-icono (56 %) no tienen `aria-label` ni `title`** — indescifrables incluso al
pasar el ratón. Están en Pagos (`:1083`), Automatizaciones (`:286,446`) y Mensajería (`:134,302`),
donde equivocarse cuesta dinero o manda un mensaje a una socia. Los 22 etiquetados usan `title=`
nativo: medio segundo de retardo y **nulo en táctil** — y el POS y el kiosco son táctiles.

### P1.3 · El concepto central no tiene nombre
URL `/socios` · menú "Clientes" · título "Clientes" · modal interno "Nueva socia" · texto visible
"Añadir socia a la clase" · botón "Nuevo cliente".
Conteos: socio/socios **419**, cliente/clientes **77**, miembro/miembros **26**.
Recomendación: unificar en "cliente" (ya domina en menú y botones), incluido el género gramatical.

---

## P2 — Importantes

### P2.1 · El onboarding existe pero está invertido
`components/dashboard/onboarding-checklist.tsx` es sólido: 5 pasos con auto-marcado y deep links
verificados. Pero se renderiza en `dashboard/page.tsx:682`, **por debajo** de 6 tarjetas KPI en cero
(`:656-665`), un sparkline vacío (`:723-750`) y un banner que a día 1 miente
("hoy no tienes nada pendiente", `:702`).

Faltan 3 de los 7 pasos del criterio: configurar el estudio, activar métodos de pago, abrir reservas.
El progreso vive en `localStorage` (`:9,36`) — no hay tabla en BD, no se puede medir activación.
Estados vacíos sin CTA en Calendario (`:1158`) y Pagos (`:966`), justo donde llega el checklist.

Bug menor: `app/crear-estudio/page.tsx:47,53` pide `tipo` de estudio y `nombreCompleto` y **los descarta**.

### P2.2 · El 36 % de los colores ignora el tema
1.622 hex hardcodeados + 287 clases de paleta cruda, frente a 3.363 tokens.
El panel de apariencia no los controla: **en modo oscuro esas zonas quedarán en blanco.**
Peor caso: `socios/page.tsx:618` usa `bg-[#FAFAFA]` en cabecera de tabla.
El mismo semáforo verde/ámbar/rojo está escrito de tres formas distintas
(`pagos:560,576,592` con hex; `dashboard:761` con `style` inline; otras con `text-emerald-600`).

### P2.3 · Add-ons: hay base, pero el modelo es el contrario
**Lo que ya existe y sirve:** `lib/billing/entitlements.ts` con `tieneFeature()`, `bloqueoPorFeature()`
en `billing-guard.ts`, Stripe Billing completo con price IDs en env, y — la joya —
`supabase/migrations/0003_decision_os.sql:113-123`, tabla `decision_feature_flags (studio_id, flag, activo…)`
que es literalmente un prototipo de tabla de add-ons por estudio.
Precedente arquitectónico perfecto en `lib/permisos.ts`: ruta → permiso → filtro de menú + guarda de
layout + RLS. Ese patrón es el que hay que replicar.

**El desajuste:** los planes son **escalonados y acumulativos** (BASE ⊂ ESTUDIO ⊂ CADENA), no
combinables. Un estudio no puede tener "BASE + comunidad" sin pagar ESTUDIO entero — lo contrario de
la filosofía. Además `BILLING_ENFORCED` está apagado, las features `gamificacion` y `multiCentro` no
se comprueban en ningún sitio, y **no existe el estado "Disponible como add-on"** (0 resultados de
`add-on|addon|upgrade` en toda la UI).

Piezas mínimas: tabla `studio_addons` · catálogo `lib/billing/addons.ts` con mapa ruta→add-on ·
hook `useAddons()` · estado atenuado en sidebar + pantalla de bloqueo suave · enforcement en servidor
y webhook de subscription items.

Reparto propuesto: **NÚCLEO** (11) dashboard, configuración, calendario, citas, socios, transacciones,
facturas, pagos, productos, notificaciones, equipo. **ADD-ON** (11) pos, informes avanzados,
automatizaciones, marketing, contenido, ondemand, comunidad, mensajería, chat, centro-de-control,
sustituciones.

---

## Dos tensiones que requieren decisión

1. **"Visible como add-on" contra el principio 3.** Mostrar 11 módulos no contratados con insignia
   añade exactamente el ruido que el principio 3 quiere eliminar. Recomendación: no listarlos en el
   menú; agruparlos en una pantalla "Amplía tu estudio" y dejar que aparezcan de forma contextual
   solo cuando el usuario tropieza con la necesidad.

2. **El menú personalizable choca con "consistencia absoluta".** `lib/layout-schema.ts` permite a cada
   estudio reordenar y ocultar items. Eso significa que dos recepcionistas de dos estudios ven apps
   distintas, y que ninguna documentación ni captura sirve para las dos.

---

## Lo que ya está bien (no tocar)

- **Confirmaciones**: `components/ui/confirm-dialog.tsx` desplegado, cero `confirm()` nativos.
- **Doble cobro**: `app/(dashboard)/pos/page.tsx:401-446` es ejemplar — guarda de reentrada y
  mensaje de timeout que explica el riesgo y qué hacer.
- **Estados vacíos**: `socios/page.tsx:581-610` distingue vacío-real de vacío-por-filtro. Es el patrón.
- **Wizard de alta de socia** (2 pasos) y **modo Esencial/Todo** del sidebar: los dos únicos sitios
  donde el principio 3 está realmente aplicado. Replicar en Configuración y en los diálogos de clase,
  cita y campaña.
- **Copys de importación CSV**: "Sube un archivo .csv. Si tienes Excel, expórtalo como CSV primero."
- **16 FAQs de `help-widget.tsx`**: bien escritas y específicas del negocio. El problema es que están
  escondidas tras el avatar y son ciegas al contexto, no su calidad.
