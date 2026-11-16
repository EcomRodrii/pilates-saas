# Rediseño de precios — Fases 1 (auditoría) y 2 (propuesta)

Fecha: 16-nov-2026 · Rama `claude/tentare-pricing-redesign-dff9c3` · **Solo lectura**: no se ha tocado código, Stripe, BD ni copy.
Estado: **propuesta para validar por el fundador. No se avanza a la Fase 3 hasta su visto bueno.**

> Todo lo que sigue sale de leer el código de la rama (HEAD `764f2bd70`) y de dos `SELECT` agregados sobre producción (sin datos personales). Lo que no se ha podido verificar se marca como tal.

---

## 0. Resumen en 12 líneas

1. **El modelo público de hoy no es «29/59/149»**: es *Founding Studio GRATIS* (hasta 150 reservas/mes, sin tarjeta) → 29 € si te pasas, *Estudio* 59 €, *Cadena* 149 €. 41 de los 44 estudios de producción están en el plan gratis. Pasar a «BASE 29 €» obliga a decidir qué pasa con lo gratis (§2, decisión 1).
2. **Los precios viven en un solo sitio** (`PLAN_INFO` en `lib/billing/entitlements.ts`) y de ahí cuelga casi todo lo derivado. El coste real no está en el código de precios: está en **~60 frases escritas a mano** con «59 €», «149 €» o «gratis hasta 150 reservas» (comparativas, recursos, soluciones, FAQs) y en **los tests/guardias que fijan esas cifras**.
3. **Stripe: los Price ID son inmutables.** Subir a 79 € / 249 € = crear Price nuevos. `planDePriceId()` hoy mapea **un** price por plan: si no se conserva el viejo, el webhook deja de reconocer a quien ya paga (§3.2). Es el riesgo técnico nº 1.
4. **Impacto en clientes que pagan hoy: mínimo.** En producción: 1 estudio pagando Founding (29 €, régimen antiguo = lo tiene todo), 0 en Estudio, 1 cadena de 3 sedes marcada `active` **sin suscripción de Stripe** (alta manual), 41 gratis. Grandfathering barato (§4).
5. **No hay precio anual en ninguna parte** (ni Stripe vía código, ni política comercial documentada). El selector mensual/anual con «ahorro en euros real» **no se puede construir sin que el fundador fije la política**; no se inventa ningún descuento (§5.4).
6. **Con Estudio a 79 €, los complementos actuales lo canibalizan**: Base + los tres complementos hoy = 29+9+6+9 = **53 €** < 79 €. Hay que subirlos (orientativo: 22/12/16 → suma 50 → 79 €) o Estudio deja de tener sentido (§2.3).
7. **Paleta del brief ≠ tokens del repo**: el brief dice Olive `#343825`; `components/web/tokens.css` usa `--w-olive: #214E36` (verde del Figma, decisión del 12-nov) y `brand/tokens.css` otra familia (Ink `#12161B`, Cream `#F7F4EE`). Hay que elegir cuál manda antes de maquetar (§1.7).
8. **Promesas del brief que hoy NO son ciertas**: «escalabilidad y multisede» no puede decir «vista consolidada de sedes» (no existe, lo dice la propia FAQ de la home); «Veri*Factu: envío a la AEAT» no envía; Marketing (campañas) está apagado; la API pública no se activa por plan sino por estudio desde /interno (§1.6).
9. «Sin permanencia, cancelar cuando quieras, pagos seguros» **son ciertos** hoy. «En un clic» **no** lo es (cancelar y bajar de plan va por el portal de Stripe; subir a Estudio por `cambiar-plan`).
10. Orden propuesto: **4 PRs agrupados** (§5.6) para no gastar cuota de Vercel; los cambios de Stripe/env primero y sin tocar el copy hasta tener los Price nuevos.
11. Lista exacta de frases del copy comercial que quedarían falsas: §6 (sin reescribirlas, como pide `tentare-os.md`).
12. Preguntas abiertas al fundador: §7 (son 8; las tres que bloquean son 1, 4 y 6).

---

## 1. Fase 1 — Auditoría (diagnóstico)

### 1.1 Dónde está cada cosa

| Pieza | Fichero | Qué contiene |
|---|---|---|
| Precios, nombres, features por plan | `lib/billing/entitlements.ts` | `PLAN_INFO` (29/59/149), `PLAN_ENTITLEMENTS`, `ADDONS` (9/6/9), `BASE_COMPLETO`, `ENTITLEMENTS_GRATIS`, `entitlementsDe`, `tieneFeature` |
| Tabla «qué incluye cada plan» | `lib/billing/catalogo-planes.ts` | 15 categorías; **cada celda se deriva de `PLAN_ENTITLEMENTS`** (no se escribe a mano) |
| Reglas del plan gratis | `lib/billing/plan-gratis.ts` | 150 reservas/30 días, margen 30 días, cierre del panel |
| Copy de Founding/gratis | `lib/landing/founding-gratis.ts` | Constantes que alimentan home, /precios, FAQs, JSON-LD |
| Prueba local 7 días sin tarjeta | `lib/billing/trial.ts` | `subscription_status='trialing'` sin `subscription_id` |
| Página | `app/precios/page.tsx` (263 l.) + `components/planes/comparativa-planes.tsx` (215 l.) | Tres tarjetas + comparativa por categorías + FAQ |
| Planes en la home | `components/landing/data.ts` (`PLANS`), `components/home-nueva/contenido.ts` y `secciones.tsx` | Duplican precios como literales («59€», «149€») |
| Stripe | `lib/billing/billing.ts` + `app/api/billing/{checkout,cambiar-plan,addons,portal,status,webhook}` | `STRIPE_PRICE_BASE/ESTUDIO/CADENA` y `STRIPE_PRICE_ADDON_*` |
| Dentro del panel | `app/suscripcion/page.tsx`, `components/billing/*`, `components/planes/selector-plan.tsx`, alta (`app/crear-estudio`, `lib/alta/tu-plan.ts`) | Consumen el mismo catálogo |
| SEO | `lib/seo/software-application.ts`, `lib/seo/paginas.ts` | JSON-LD `Offer` con 0/59/149 y metas con las cifras |

### 1.2 Cómo funciona hoy el reparto por plan

| Feature (`Entitlements`) | BASE (29, de pago) | ESTUDIO (59) | CADENA (149) | Gratis |
|---|---|---|---|---|
| Alumnas | ∞ | ∞ | ∞ | ∞ (límite: 150 reservas/30 d) |
| `decisiones` (Centro de Control, piloto auto., riesgo fuga/impago) | **complemento 9 €** | ✔ | ✔ | ✔ |
| `sustitucionesAutonomas` | **complemento 6 €** | ✔ | ✔ | ✔ |
| `ia` (notas de sesión, mensajes de automatizaciones) | **complemento 9 €** | ✔ | ✔ | ✔ |
| `marca` (app web con colores/logo) | ✔ | ✔ | ✔ | ✔ |
| `appPropia` (app en App Store) | ✘ | ✔ | ✔ | ✘ |
| `multiCentro` | ✘ | ✘ | ✔ | ✘ |
| `asistente` consultas/mes | 50 | 200 | 500 | 50 |
| `gamificacion`, `marketing` | ✔ (`marketing` apagado por flag) | ✔ | ✔ | ✔ |

Tres matices que condicionan la propuesta:
- **`BASE_COMPLETO`** (Founding anterior al 19-oct, prueba y gratis) lo tiene todo salvo multisede y app propia. Se decide en `entitlementsDe` con `studios.regimen_addons`. Es el mecanismo de *grandfathering* que ya existe.
- Hoy **Estudio solo se distingue por `appPropia` y 200 consultas** (para quien paga Founding con régimen nuevo, además por los 3 complementos). Con el gratis lo tiene casi todo, la escalera ya es plana.
- `catalogo-planes.ts` solo lista funcionalidades USABLES hoy (regla escrita en su cabecera). Es la fuente correcta para la tabla «Todo lo que incluye Tentare».

### 1.3 Stripe (solo lectura, sin tocar nada)

- **Checkout** (`/api/billing/checkout`): solo PROPIETARIO; un Price por plan vía `priceIdDe(plan)`; CADENA crea/usa la fila `cadenas` (una suscripción cubre todas las sedes); cerrojos, guardia de modo (`comprobarModoStripe`), checkout previo, Review Boost (cupón). **Sin `trial_period_days`** (la prueba es local).
- **`cambiar-plan`**: **solo Founding → Estudio** (`motivoNoCambioPlan` rechaza cualquier otro destino con `'destino'`), exige mismo intervalo de facturación, prorrata, borra líneas de complemento. Estudio → Cadena = checkout nuevo (cancela la individual solo cuando la de cadena se paga). Bajar de plan = portal de Stripe.
- **`addons`**: añade/quita una línea por complemento (`STRIPE_PRICE_ADDON_*`); `complementosALaVenta()` exige los tres; solo con Founding de régimen nuevo.
- **Webhook**: lee la suscripción con `lecturaSuscripcion(..., { plan: planDePriceId, addon: addonDePriceId })` y escribe `plan`, `addons`, `subscription_status`. **`planDePriceId` solo conoce UN price por plan** (`priceEnv()`); un price desconocido da `plan = null` y el webhook cae a `sub.metadata.plan`. Nota del propio `billing.ts`: cambiar una env var en Vercel exige un commit con código para desplegar (el `ignoreCommand` cancela el redeploy).
- **Intervalo**: no hay ningún soporte de facturación anual en el código (`grep` de `anual/interval` sin resultados útiles). Los Price actuales se asumen mensuales; **no verificado contra Stripe** (no se ha tocado Stripe).
- Env vars documentadas: `.env.example` solo lista `STRIPE_PRICE_BASE/ESTUDIO/CADENA`; los `ADDON_*` y los packs del asistente (pago único 9/24/69 €, `lib/asistente/packs.ts`) existen en código.

### 1.4 Interacciones con el cambio de precios

| Mecanismo | Cómo interactúa |
|---|---|
| **Founding gratis** | 150 reservas/30 d; al pasarse, 30 días de margen y luego `gratis_cerrado`. La web promete «si pasas de ahí, 29 €/mes». Si Base pasa a ser «29 € de entrada», el relato «gratis → 29 €» se mantiene; si se elimina lo gratis, hay que redefinir el alta, `convertir-a-gratis`, `uso-gratis`, el gate y ~40 pantallas. |
| **Prueba de 7 días** | Existe en código (`trial.ts`, trigger `trg_arrancar_prueba_gratuita`, cron cierre), pero **la web dice que no hay prueba** («Ya no hay prueba de 7 días», `founding-gratis.ts`, y `lib/landing/founding-gratis.test.ts` lo vigila). `alta.ts` de los emails aún tiene la rama «7 días de prueba». Dos relatos conviven. |
| **`regimen_addons`** | `true` solo para quien pagó Founding por el checkout nuevo (post 19-oct). Es lo que hace que un Founding de 29 € no tenga los tres complementos. **Hoy 0 estudios** en producción lo tienen a `true`. |
| **Sedes de cadena** | Una suscripción CADENA cubre N sedes sin tope (no hay límite de sedes en código). Una sede de cadena no se cambia de plan por su cuenta (`'cadena'` en `cambio-plan-reglas`); una cadena que deja de pagar deja solo la principal en gratis (`pasaAGratis`). A 249 € por cadena **sin tope de sedes** conviene decidir si se queda así (§7). |
| **`/interno`** | MRR/prospección usan `PLAN_INFO` (`lib/interno/prospeccion.ts:238` valida importes contra los precios vigentes: un correo que cite «59 €» pasaría a marcarse como importe no válido, que es lo deseable). `facturacion-real.ts` hay que revisarlo en Fase 3 (no confirmado que use el precio del plan en vez del cobrado). |

### 1.5 Responsive y estructura de la página actual

- `app/precios/page.tsx` tiene su propio `<style>`: `.pre-grid` 3 columnas → 1 columna ≤900 px (máx. 440 px); `.pre-links` 3→2→1. Estilos en línea con tokens `--w-*`.
- La tabla (`ComparativaPlanes`) ya scrollea en horizontal en móvil, cabecera pegajosa, columnas `minmax(76px,96px)` en móvil. Funciona; no es el problema.
- Lo que **no** cumple el brief: no hay selector mensual/anual, no hay tarjeta Estudio con «MÁS ELEGIDO» (se retiró el 23-sep «sin datos que lo respalden» y `PARA_QUIEN` lo recuerda), Cadena es un `mailto:` y no hay ancla visual de precio. Estudio ya es la tarjeta oscura destacada (`destacado = p === 'ESTUDIO'`).
- ⚠️ «MÁS ELEGIDO»: hoy **0 estudios están en Estudio**. Rotularlo así contradice la regla vigente («Nada de “el más elegido” sin datos»). Propuesta: usar **«Recomendado»** (opinión, no estadística) o decidir expresamente que se asume (§7).

### 1.6 Funcionalidades prometidas por el brief que NO están (o están a medias)

| Promesa posible | Estado verificado en código | Consecuencia para el copy |
|---|---|---|
| Marketing (campañas, segmentación) | `MARKETING_MODULE_ENABLED = false` desde 19-ago; `/marketing` redirige | No entra en ninguna tabla ni plan |
| Vista consolidada de sedes / informes de cadena | **No existe** («Todavía no hay una vista que sume todas las sedes a la vez», FAQ de la home) | «Escalabilidad multisede» = panel multisede + una suscripción + menú por cadena + instructora multi-sede. **No** «informes de cadena» |
| Veri*Factu «envío a la AEAT» | **0 de 26 facturas transmitidas** (nota en `catalogo-planes.ts`), viene desactivado | Se queda como «va aparte» |
| API pública / Zapier | Existe (`app/api/v1`), pero se **activa por estudio desde /interno**, solo PROPIETARIO, `scopesDelPlan()` **no recorta** | Puede venderse como «Cadena» solo si se implementa el gate por plan (hoy no hay) |
| App propia en App Store | Código y pedido existen (`pedirApp`), `APP_PROPIA_PEDIR` es un interruptor **por estudio** que enciende el fundador; app Tentare 1.0 enviada a Apple el 15-oct | «Tu app en la App Store» solo si el pedido está operativo de extremo a extremo |
| WhatsApp, Google Calendar | Conexión propia del estudio, no se cobra | No son diferenciador de plan |
| Plataformas ClassPass/Wellhub/USC | Apagadas «sin contrato» | No mencionar |
| «Cambiar de plan en un clic» | Subir a Estudio: sí (un botón). Bajar/cancelar: portal de Stripe | No prometer «un clic» |
| «Sin permanencia», «cancelar cuando quieras», «pagos seguros (Stripe)» | **Ciertos** (FAQ de /precios ya lo dice; `STRIPE` + guardia de modo) | Se pueden usar |

### 1.7 Brand OS: el brief y el repo no coinciden

- Brief: Olive `#343825`, Sand `#D9C29E`, Cream `#F6F4EF`, Ink `#22261F`.
- `components/web/tokens.css` (la web comercial): `--w-olive: #214E36` («el verde del diseño», decisión del fundador del 12-nov: fidelidad al Figma).
- `brand/tokens.css` (Brand System, panel): Ink `#12161B…`, Cream `#F7F4EE`, Sand `#D8CDBB`.
- Las tres familias son distintas. **No se hardcodea nada**; la implementación usará los tokens `--w-*` de la web comercial. Si el fundador quiere la paleta del brief, es un cambio de tokens aparte y global (no un detalle de /precios). Pendiente de §7.
- Sin degradados: la página actual ya no los usa. Un único badge («Recomendado») es coherente con «sin badges por todas partes».

---

## 2. Fase 2 — Propuesta

### 2.1 Planes y precios (decisión del fundador)

| Plan | Precio | Papel | Para quién (frase bajo el nombre) |
|---|---|---|---|
| **Base** | 29 €/mes | Gestión esencial | «Un estudio con una sala y una o dos instructoras que quiere reservas, cobros y facturas sin hojas de cálculo.» |
| **Estudio** | 79 €/mes | Protagonista · automatización y control | «Un estudio en marcha, con equipo y horario lleno, que quiere que el negocio se vigile y se resuelva solo.» |
| **Cadena** | 249 €/mes | Ancla de valor · escalabilidad y multisede | «Dos o más centros bajo la misma marca, con un solo acceso y una sola suscripción.» |

(Precios IVA incluido, como hoy. Los nombres de plan: ver §7, decisión 3.)

### 2.2 Distribución recomendada de funcionalidades

Principio: **no quitar a nadie lo que ya usa y no crear límites comerciales que no existen** (regla vigente de `scopesDelPlan`). Por eso la diferencia entre planes se apoya en lo que **ya tiene puerta de plan en código** (`decisiones`, `sustitucionesAutonomas`, `ia`, `appPropia`, `multiCentro`, consultas del asistente) y no en funciones hoy abiertas a todos.

| Categoría del brief | BASE 29 € | ESTUDIO 79 € | CADENA 249 € |
|---|---|---|---|
| **Gestión y reservas** | Reservas online, widget, lista de espera, reglas por tipo de clase, cancelación/no-show, plazas fijas, calendario, series, salas, citas, check-in | = Base | = Estudio |
| **Alumnas y clientes** | Fichas, salud y notas, campos/etiquetas, cuestionario y consentimientos, importación | + Notas de sesión y preparación de clase con IA (`ia`) | = Estudio |
| **Pagos y facturación** | Stripe (sin comisión de Tentare), remesa SEPA, cobro guardado, recobro de impagos, devoluciones, bonos y cuotas, facturas con numeración legal, cierre de año, exportación | = Base | = Estudio |
| **Equipo e instructoras** | Roles, app del equipo, tarifa y liquidación, sustituciones **asistidas** (tú das el visto bueno) | + Sustituciones **autónomas** y modo Vacaciones | + Una instructora en varias sedes |
| **Automatización** | Recordatorios, avisos de bono/ausencia, automatizaciones con tus reglas | + Piloto automático | = Estudio |
| **Marketing** | — (módulo apagado) | — | — |
| **Control del negocio** | Informes de ocupación e ingresos | + Centro de Control (un aviso al día), riesgo de fuga e impago | = Estudio |
| **Aplicación y marca** | Portal de la alumna instalable, dirección propia, **app con tu marca** (colores/logo) | + **App propia en la App Store** (cuando el pedido esté operativo) | = Estudio |
| **Asistente «Pregúntale a Tentare»** | 50 consultas/mes | 200 | 500 |
| **Gestión multisede** | — | — | Varias sedes en un panel, una sola suscripción, menú y configuración por cadena. *Sin vista consolidada de sedes.* |

Notas:
- **Redacción con IA** (`ia`) sale de Base y pasa a Estudio+ como en el catálogo actual (hoy es complemento 9 €, no se toca el gate).
- La fila «Automatizaciones con tus reglas» y «gamificación» **se quedan en todos** (hoy `TODOS`/true). Moverlas a Estudio sería quitar a los 41 estudios gratis algo que usan; solo se haría con decisión expresa (§7).
- Veri*Factu queda **fuera de la comparativa de planes** («va aparte, desactivado»), como hoy.
- La frase de diferenciación del brief se cumple así: **Base = gestión esencial; Estudio = automatización y control; Cadena = escalabilidad y multisede**.

### 2.3 Complementos (solo aplican a Base: Estudio y Cadena los incluyen)

Problema aritmético: a 79 €, Estudio solo se justifica si **Base + los tres complementos ≥ 79 €**. Hoy suman 53 €.

| Complemento | Hoy | Precio orientativo | Qué debe llevar para valer más (⚠️ requiere desarrollo; no se promete hasta existir) |
|---|---|---|---|
| Centro de Control | 9 € | **22 €** | Hoy: aviso diario, piloto automático, riesgo de fuga/impago, previsión de ocupación. Candidatos ya diseñados en el motor: predicciones con base visible (`Prediccion`), A4/A5 de Agenda, reglas de dinero F1–F4. |
| Sustituciones automáticas | 6 € | **12 €** | Hoy: modos autónomo y Vacaciones. Candidato: historial de sustituciones y probabilidad de aceptación por candidata (ya existe en `encaje.ts`). |
| Redacción con IA | 9 € | **16 €** | Hoy: notas de sesión y mensajes de automatizaciones. Candidato: preparación de clase y ficha resumida (ya en catálogo de `ia`). |
| **Suma** | 24 € | **50 €** → Base + 3 = **79 €** | |

Reglas de diseño propuestas:
- **Estudio nunca debe costar más que Base + los tres**; con 22/12/16 coinciden en 79 € y Estudio añade app propia y 4× consultas, así que el salto es obvio.
- Los **packs de consultas del asistente** (9/24/69 €, pago único) se quedan; es la forma natural de «complemento» para Base sin crear otro.
- Los precios son **orientativos**: la decisión es del fundador. Si prefiere subirlos menos (p. ej. 19/12/15 = 46 → Base+3 = 75 €), Estudio sigue siendo la compra racional por la app propia.
- ⚠️ «Más funcionales, más valiosos»: **ningún complemento puede enseñar una función que hoy no existe**. Si la mejora depende de código nuevo, el precio sube cuando la función esté desplegada, no antes.

### 2.4 Consecuencias para estudios existentes (estado real de producción, 16-nov)

| Grupo | Nº | Qué pasa con 29/79/249 | Propuesta |
|---|---|---|---|
| Gratis (`gratis`) | 41 | Nada: no pagan. Cuando se pasen de 150 reservas pasan a **Base de pago**, que con régimen de complementos **no incluye** Centro de Control/sustituciones autónomas/IA (ya ocurre hoy desde el 20-oct). | Sin cambios. Avisar en el aviso de «te acercas al límite» de lo que incluye Base y de los complementos (el copy lo actualiza la Fase 3). |
| Founding de pago, régimen antiguo (`BASE` + Stripe, `regimen_addons=false`) | 1 | Conserva **29 € y todo incluido** (`BASE_COMPLETO`), tal como se le prometió. | **Grandfathering indefinido por defecto**. Hay que decidir si se le pone fecha (§7) y comunicarlo antes de cualquier cambio. |
| Cadena `active` sin suscripción de Stripe (3 sedes, alta manual) | 1 cadena | No paga vía Stripe: el nuevo precio no le llega solo. | Decisión humana: ¿precio de lista, cortesía o contrato? **No tocar sin hablar con la propietaria.** |
| Cadena con cliente Stripe sin suscripción, 1 sede gratis | 1 | Sin efecto económico. | Ninguna. |
| Estudio a 59 € | **0** | No hay nadie a quien subir. | — |

Consecuencia clave: **el cambio de precio no toca ingresos recurrentes de Tentare hoy** (1 suscripción de 29 €). El riesgo es de *código y copy*, no de clientes.

Mecánica de grandfathering en Stripe: los Price viejos **no se archivan** y las suscripciones existentes **no se migran**. Se crean Price nuevos (79/249 y, si se decide, los de complementos) y los viejos se mantienen mapeados a su plan (§3.2).

### 2.5 Conflictos con el sistema actual

1. **Un solo Price por plan en `priceEnv()`** → hay que aceptar varios (nuevo + heredados). Sin esto, el webhook pone `plan = null` a quien conserve el Price viejo y `cambiar-plan` (que busca `planDePriceId(...) === 'BASE'`) deja de reconocer la línea.
2. **`cambiar-plan` solo sube Founding → Estudio** y exige mismo intervalo. Con precio anual (si se hace) no se podría pasar de Base mensual a Estudio anual sin reescribir la regla.
3. **`PARA_QUIEN` y el catálogo derivado**: la tabla seguirá cuadrando sola con `PLAN_ENTITLEMENTS` (decisión: precios en `PLAN_INFO`, cifras de features sin tocar). Es lo que evita promesas divergentes.
4. **Guardias de copy** (`lib/web-sin-promesas-falsas.test.ts`, `lib/landing/founding-gratis.test.ts`, `ronda-3.test.ts`) **fijan literalmente** «29 € solo con “si pasas de ahí”», «precioMesWeb ESTUDIO = 59», «CADENA = 149» y regexes contra «desde 29 €» / «2 planes». Cambiar precios las hace fallar por diseño: hay que reescribirlas **junto con** el copy aprobado, no antes.
5. **JSON-LD / SEO**: `softwareApplicationLd()` publica ofertas 0/59/149 y las metas de `/precios` y comparativas repiten las cifras. Google exige que coincidan con lo visible: cambiar todo en el mismo despliegue.
6. **Relato «gratis»**: si el brief quiere tres planes de pago con «mensajes de confianza sin tarjeta», el plan gratis y la prueba de 7 días (código vivo, web que dice «no hay prueba») deben quedar **explícitos**; hoy se contradicen entre `trial.ts`/emails y la web.
7. **«MÁS ELEGIDO»**: contradice la regla vigente (0 estudios en Estudio).
8. **Paleta**: brief ≠ tokens (§1.7).
9. **Cadena a 249 € con sedes ilimitadas**: no hay tope de sedes; no es un conflicto técnico pero sí comercial.
10. **Stripe test vs live**: los Price IDs difieren por modo; el guardia `modo-stripe.ts` ya impide mezclarlos. Los nuevos se crean en ambos.

### 2.6 Cambios necesarios (inventario, sin implementar)

**Código**
- `lib/billing/entitlements.ts`: `PLAN_INFO` 79/249 (+ textos `resumen`), `ADDONS` precios y `resumen`, `PARA_QUIEN` en `catalogo-planes.ts`.
- `lib/billing/billing.ts`: `priceEnv()` → plan nuevo + lista de heredados (`STRIPE_PRICE_ESTUDIO_LEGACY`, `…_CADENA_LEGACY`, separados por comas); `planDePriceId` y los tests del webhook los contemplan.
- `app/precios/page.tsx` + `components/planes/comparativa-planes.tsx`: rediseño (tarjetas, para quién, tabla por las 9 categorías del brief). La tabla sale de `catalogo-planes.ts` (reordenar categorías, no reescribir celdas).
- Constantes de copy: `lib/landing/founding-gratis.ts`, `components/landing/data.ts`, `components/home-nueva/contenido.ts` (literales «59 €/149 €») → derivar de `PLAN_INFO` en vez de literales.
- JSON-LD `lib/seo/software-application.ts` y `lib/seo/paginas.ts`.
- Si hay precio anual: nuevo parámetro de intervalo en `checkout`, `cambiar-plan` (mismo intervalo), `status`, `suscripcion`.
- Pantallas dentro del panel (`/suscripcion`, alta, `components/billing/*`) leen `PLAN_INFO`: se actualizan solas salvo textos fijos.

**Stripe (lo hará el fundador o con su permiso expreso; no se ha tocado)**
- Price mensuales nuevos Estudio 79 €, Cadena 249 € (test y live) y, si se suben, los 3 de complementos.
- Conservar los Price viejos activos (no archivar). Anotar sus IDs en las env `*_LEGACY`.
- Si hay anual: Price anuales por plan.

**BD**: ninguna migración obligatoria. `studios.plan`/`addons` no cambian. Opcional: columna para marcar «precio heredado» solo si el fundador quiere control en /interno (no necesaria: el Price de la suscripción ya lo dice).

**Tests que fijan precios / copy (se reescriben en Fase 3, junto al copy aprobado)**
- Unitarios: `lib/landing/founding-gratis.test.ts` (59/149 y regexes), `lib/landing/ronda-3.test.ts`, `lib/billing/addons.test.ts` (29+…), `lib/web-sin-promesas-falsas.test.ts`, `lib/alta/tu-plan.test.ts`, `lib/alta/tu-estudio.test.ts`, `lib/billing/catalogo-planes.test.ts`, `lib/billing/entitlements.test.ts`, `lib/billing/plan-gratis.test.ts`.
- E2E: `e2e/precios-founding-gratis.spec.ts` (59/149 en JSON-LD y página), `e2e/plan-gratis.spec.ts`, `e2e/suscripcion-complementos.spec.ts`, `e2e/suscripcion-sede-de-cadena.spec.ts`, `e2e/suscripcion-factura.spec.ts`, `e2e/prueba-gratuita-panel.spec.ts`.
- ⚠️ Los tests de camino de fallo de Stripe necesitan contador de peticiones (`expect(intentos).toBeGreaterThan(0)`) y el andamiaje existente; no rehacerlo.

### 2.7 Riesgos

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| Webhook no reconoce Price heredado → `plan = null` | **Alta** (dinero) | `*_LEGACY` + test que cruza todos los Price conocidos; revisar con `tentare-stripe` antes de tocar |
| Copy comercial desplegado con cifras mezcladas (SEO, comparativas con «59 €») | Alta (reputación/Google) | Un único PR de copy, tras visto bueno; `grep` final de «59 €/149 €» como criterio de cierre |
| Subir Price a clientes existentes por error | Alta | No migrar suscripciones; solo Price nuevos para altas nuevas |
| Complementos baratos canibalizan Estudio | Media | Regla Base+3 ≥ Estudio (§2.3) |
| Prometer app propia/cadena sin lo que sostiene | Media | Solo «cuando X esté operativo» y copy marcado como pendiente |
| «Sin tarjeta» vs 7 días vs gratis: mensajes contradictorios | Media | Decidir el relato de entrada antes (§7.1) |
| Agotar cuota de Vercel (100 deployments/día) | Media | 4 PRs, push único por PR, **nunca commit vacío** |
| Sin precio anual real: selector inventa ahorro | Alta (credibilidad) | No construirlo hasta tener política (§5.4/§7.4) |

---

## 3. Detalle técnico de Stripe

### 3.1 Qué cambia en variables de entorno
Hoy: `STRIPE_PRICE_BASE`, `STRIPE_PRICE_ESTUDIO`, `STRIPE_PRICE_CADENA`, `STRIPE_PRICE_ADDON_{DECISIONES,SUSTITUCIONES,IA}`.
Propuesta: mantener esos nombres para los Price **nuevos** y añadir `STRIPE_PRICE_ESTUDIO_LEGACY` y `STRIPE_PRICE_CADENA_LEGACY` (y `…_ADDON_*_LEGACY` si los complementos suben). Un price de Base a 29 € no cambia: no hay legacy de Base.

### 3.2 `planDePriceId` con heredados
Debe devolver el mismo `Plan` para el Price nuevo y para cualquiera de los heredados; `addonDePriceId` igual. Ni `cambiar-plan` ni `addons` cambian de contrato. Hay que cubrirlo con un test que arme una suscripción con el Price heredado y compruebe `lecturaSuscripcion` (plan, addons, estado).

### 3.3 Qué NO hay que hacer
- No editar el `unit_amount` de un Price (Stripe no lo permite) ni archivar los viejos.
- No forzar un redeploy con commit vacío: la env var nueva solo entra con el siguiente merge de **código** (aprendido el 31-ago y el 20-oct).

---

## 4. Grandfathering: recomendación

1. **Founding antiguo (1 estudio)**: se queda en 29 € con todo incluido mientras la suscripción siga viva (`BASE_COMPLETO` ya lo garantiza). Si el fundador quiere ponerle fecha, un aviso con ≥ 60 días y confirmación expresa. Nunca un cambio silencioso.
2. **Gratis**: no cambia nada.
3. **Cadena manual (3 sedes)**: tratarla como acuerdo personal; **no** forzar el precio de lista hasta hablar con la propietaria.
4. **Altas nuevas**: precio de lista nuevo.
5. **Política general**: «precio mantenido mientras no cambie de plan» solo se promete si el fundador la quiere publicar; hoy basta no tocarlas.

---

## 5. Orden de implementación (Fase 3, **no ejecutar sin visto bueno**)

Cuatro PRs, cada uno con un solo push al final (cuota de Vercel).

**PR-A — Cimientos de Stripe (sin copy ni UI)**
- `billing.ts`: mapeo de Price múltiple + `*_LEGACY`; tests del webhook y de `lecturaSuscripcion`.
- `PLAN_INFO`/`ADDONS` se actualizan **detrás** de un interruptor o en el mismo PR que los Price (si se mergea el cambio de `PLAN_INFO` sin Price nuevos, el checkout seguiría cobrando 59 € con la página diciendo 79 €).
- Revisión de `tentare-stripe` + `tentare-seguridad` antes de abrir.

**PR-B — Catálogo y tabla (fuente única)**
- `catalogo-planes.ts`: reordenar a las 9 categorías del brief, `PARA_QUIEN`, textos de complementos.
- Tests: catálogo, entitlements, addons, alta/tu-plan.

**PR-C — Página /precios + selector**
- Nuevo `/precios` (tarjetas, «para quién», tabla, confianza, FAQ). Selector mensual/anual **solo si ya hay política y Price anuales**.
- Copy marcado como propuesta hasta el visto bueno; e2e de /precios y JSON-LD.

**PR-D — Copy derivado en el resto de la web + guardias**
- Sustituir los literales por constantes derivadas (home, comparativas, recursos, soluciones, FAQs), reescribir las guardias y los e2e que fijan cifras. **Con las frases aprobadas por el fundador, no antes.**

Verificación mínima de cada PR: `npx tsc --noEmit`, `node --test` de `lib/**`, Playwright del proyecto afectado, y revisión en navegador móvil y escritorio. Mergeado ≠ desplegado: comprobar por ancestría.

### 5.4 Selector mensual/anual: lo que falta
No hay Price anuales, ni política de descuento documentada, ni soporte de intervalo en `cambiar-plan`. «Ahorro en euros calculado desde la política comercial real» exige que el fundador diga cuál es: p. ej. «2 meses gratis» (→ ahorro = 2 × precio) o un porcentaje. Hasta entonces, **PR-C no incluye el selector** o lo incluye apagado.

---

## 6. Frases del copy comercial actual que quedarían falsas o desfasadas

> Se listan **tal cual están hoy**, sin reescribirlas (regla de `tentare-os.md`: el copy público se propone, no se cambia). «Falsa» = dejaría de ser cierta con 79 €/249 €, con Base como plan de pago de entrada, o con los complementos reordenados. Las cifras de la competencia (Bonsai, Eversports…) no se tocan. Las referencias son fichero:línea al HEAD de esta rama.

### 6.1 /precios — `app/precios/page.tsx`
- «`Tres planes, publicados. Sin «solicita una demo para saber el precio», sin comisión sobre tus cobros y sin contrato anual.`» — «sin contrato anual» choca con ofrecer facturación anual.
- «`Empieza gratis · Sin tarjeta de crédito`» — depende de la decisión 1.
- Precio de la tarjeta Base: «`Gratis`» + «`Hasta 150 reservas al mes · si pasas de ahí, 29 €/mes, con Centro de Control, sustituciones automáticas y redacción con IA aparte`» (`TOPE_GRATIS` + `SI_PASAS_CON_COMPLEMENTOS`).
- Estudio «`59€`/mes» y Cadena «`149€`/mes» (`PLAN_INFO`), «`Más consultas al asistente`», «`Dos o más centros bajo la misma marca.`» sigue cierta.
- Texto de respuesta directa: «`cuesta 59 € al mes en el plan Estudio, que los incluye, y 149 € en el plan Cadena`» (el literal se construye con `PLAN_INFO`; el contenido cambia solo).
- FAQ: «`¿Qué pasa si supero las 150 reservas al mes del plan Founding Studio?`» y su respuesta («`Sigues en Founding Studio por 29 € al mes… con ese plan, el Centro de Control… van aparte, como complementos`»).
- «`Lo esencial —reservas, cobros, facturación y fichas— está en los tres. Lo que cambia son las alumnas, las reservas al mes y las sedes`» — con el nuevo reparto lo que cambia es automatización/control y sedes, no «las alumnas» (ya son ilimitadas en todos).
- Metas: `lib/seo/paginas.ts:367` «`Sin permanencia: Founding Studio gratis hasta 150 reservas al mes (si pasas, 29 €/mes), Estudio 59 € y Cadena 149 €. Empieza gratis.`»; `:370` «`Tres planes, precio público, sin permanencia y Founding Studio gratis.`».

### 6.2 Home
- `components/landing/data.ts:39` `price: 'Gratis'`, `:50` `price: '59€'`, `:61` `price: '149€'`; `:99` «`Founding Studio es gratis hasta 150 reservas al mes… si pasas de ahí, cuesta 29 € al mes con IVA, sin tope…`».
- `components/home-nueva/contenido.ts:129` «`Todo lo esencial, gratis hasta 150 reservas al mes.`», `:133` «`59 €`» / «`Más herramientas para un estudio que crece.`» / lista «`Sin límite de alumnas ni de reservas`, `Centro de Control`, `Redacción con IA`, `Más consultas al asistente`», `:137` «`149 €`».
- `components/home-nueva/secciones.tsx:34` `GARANTIA = [GRATIS_CON_LIMITES, 'Sin tarjeta', 'Sin permanencia']` y `:312` «`Gratis hasta 150 reservas al mes, sin permanencia`»; `components/web/home/Heroe.tsx:71` «`Sin tarjeta · Sin permanencia · {GRATIS_CON_LIMITES}`»; `CierreHome.tsx:25` «`Empieza gratis, sin tarjeta…`»; `app/page.tsx:31` «`…Empieza gratis, sin tarjeta.`». (Dependen de la decisión 1.)

### 6.3 /comparativa (índice y 13 comparativas)
- `app/comparativa/page.tsx:90` y la fila «Precio público» de cada comparativa: «`Gratis hasta 150 reservas al mes; si pasas de ahí, 29 €/mes con IVA`» (Viday, Glofox, Bonsai, Timp, DeporWeb, Eversports, Mindbody, Bsport, Momence…).
- «`Sí: Founding Studio es gratis hasta 150 reservas al mes, sin pedir tarjeta`» (Viday, Glofox, Bonsai, Lorari, Eversports, Gesyoga, Bookyway, Mindbody, Bsport, Momence).
- Con cifras de Estudio/Cadena: DeporWeb `:47` y `:68` («`Estudio 59 €/mes y Cadena 149 €/mes, IVA incluido`»), Bsport `:82` («`Estudio a 59 €/mes y Cadena a 149 €/mes… con la app con tu marca`»), Momence `:44` y `:69`, Glofox `:46`/`:76`, Bookyway `:45`, Mindbody `:45`, Gesyoga `:46`, Lorari `:46`/`:58`/`:67`, Timp `:52`/`:81`, Eversports `:62`/`:70`–`:72` («`…paga en Tentare 29 €/mes con IVA; con 150 reservas al mes o menos, no pagaría nada`»), Flowstark `:47`, Viday `:50`/`:71`, Bonsai `:46`/`:72`.
- Eversports `:81`: «`…Puede hacerlo sola, sin esperar a que lo apruebes, en el plan gratis, en Estudio y en Cadena; en Founding Studio de pago, c…`».

### 6.4 /soluciones
- `programa-de-gestion-para-estudio-de-pilates` `:52`, `:97` («`Gratis` / `Tentare Founding Studio, hasta 150 reservas al mes`»), `:105`, `:153` («`Sustituciones con tu visto bueno, o solas en el plan gratis, Estudio y Cadena`»), `:170` («`Gratis hasta 150 reservas al mes; si pasas de ahí, 29 €/mes con IVA. Sin permanencia`»), `:181`.
- `estudio-de-pilates-reformer` `:110`, `:116`, `:215`, `:224`; `estudio-de-yoga` `:62`, `:70`, `:102`, `:107`, `:166`, `:196` («`En todos los planes, también en el gratuito`»); `abrir-un-estudio` `:69` («`Nada: Founding Studio es gratis hasta 150 reservas al mes… de 29 €/mes.`»), `:94`, `:113`, `:120`, `:153`, `:199`; `app/soluciones/page.tsx:108`; `components/soluciones/LandingSolucion.tsx:304` («`Todo lo de Founding Studio con Centro de Control, sustituciones automáticas y redacción con IA incluidos, y más consultas al asistente.`»); OG de yoga: «`Gratis hasta 150 reservas al mes.`».

### 6.5 /funcionalidades
- `reservas-online/page.tsx:26` «`Tentare es gratis hasta 150 reservas al mes, y sin permanencia. Las reservas y los cobros están en los tres planes…`» y `:121`.
- `app-para-alumnas/page.tsx:30` «`…con un editor propio (en todos los planes)…`» y `:38` «`…La app de marca está incluida en todos los plan[es]…`» — **cierta hoy**, pero hay que revisarla si «app con tu marca» (web) y «app propia en la App Store» se separan en la tabla: no confundirlas.
- `multi-centro/page.tsx:33` «`No: el plan Cadena cubre varios centros bajo la misma suscripción. Puedes ver el precio en la página de precios…`» (sigue cierta, el precio cambia) y `:101` «`Un plan Cadena en lugar de una cuota por centro.`».
- `components/funcionalidades/visuales/sustituciones.tsx` (descripción de qué plan incluye las autónomas).

### 6.6 /recursos
- `software-pilates-gratis.ts:46`, `:187`, `:241` (todo el artículo se apoya en «gratis hasta 150 reservas»).
- `cuanto-cuesta-abrir-un-estudio-de-pilates.ts:45`, `:142`, `:174` («`Software: Founding Studio, si pasas de lo gratis, 12 meses` / `348,00 €` / `12 × 29 € con IVA`»), `:218`.
- `alternativas-a-timp.ts:71`, `:95`, `:116`, `:188`, `:196`; `mejor-software-para-estudios-de-pilates.ts` (tabla de precios); `checklist-elegir-software-estudio/page.tsx:62` y `:204` («`Planes y precios, con Founding Studio gratis`»); `franquicia-de-pilates.ts:202`; `como-abrir-un-estudio-de-yoga.ts:223`; `bsport-vs-timp.ts`, `alternativas-a-bsport.ts` (cifras de Tentare si las citan: **sin verificar línea a línea**, comprobar con `grep` en PR-D).
- `lib/recursos/articulos/validar.ts:36–40` (guardia de «autónomas en todos los planes»).

### 6.7 /glosario
- No se encontraron frases de precio de Tentare en `app/glosario` en la búsqueda hecha (solo términos). **Sin verificar al 100 %**: confirmar en PR-D con `grep` de «gratis/29/59/149/plan».

### 6.8 Otros textos públicos con las cifras
- `public/llms.txt` y `lib/ai/prospeccion-email-prompt.ts` (vigilados por `web-sin-promesas-falsas.test.ts`): no leídos completos; comprobar.
- JSON-LD: `lib/seo/software-application.ts` (`precioMesWeb`: 0/59/149).
- Emails del alta: `lib/emails/tentare/alta.ts:50–51` (rama «7 días de prueba» frente a «gratis hasta 150 reservas»).

---

## 7. Preguntas para el fundador (necesito respuesta antes de la Fase 3)

1. ✅ **DECIDIDO por el fundador (16-nov-2026): lo gratis se mantiene como entrada** (gratis hasta 150 reservas/mes, luego Base de pago a 29 €). La web sigue con «Empezar gratis». Texto original de la pregunta: **¿Sobrevive lo gratis?** Recomendación: **sí**, como puerta de entrada («Base: gratis hasta 150 reservas/mes, luego 29 €»), porque es una decisión suya del 15-oct/13-nov, 41 de 44 estudios están ahí y el CTA de toda la web es «Empezar gratis». Si se elimina, hay que decidir si vuelve la prueba de 7 días (el código existe) y rehacer el alta.
2. **«MÁS ELEGIDO»**: hoy 0 estudios en Estudio. ¿«Recomendado» (sugerencia) o asume el rótulo con el riesgo de que sea falso?
3. **Nombre del plan de entrada**: ¿se llama «Base», se queda «Founding Studio» (con su estilo propio en `NombrePlan`) o «Founding» pasa a ser solo el grupo histórico?
4. **Facturación anual**: ¿hay política (p. ej. «2 meses gratis», un %)? Sin ella no se construye el selector y no se inventa ahorro.
5. **Complementos**: ¿se aceptan 22/12/16 (suma 50 → Base+3 = 79 €) o se prefiere otra escala? ¿Se retiran los «packs de consultas» o se mantienen?
6. **Grandfathering**: ¿el Founding de 29 € con todo incluido se queda sin fecha de caducidad? ¿Y qué hacer con la cadena de 3 sedes dada de alta a mano (precio de lista, cortesía o contrato)?
7. **Cadena**: ¿249 € cubre sedes ilimitadas? ¿Se sustituye `mailto:` por checkout directo (existe `plan: 'CADENA'`)?
8. **Paleta**: ¿manda la del brief (Olive `#343825`, etc.) o los tokens vigentes de la web (`--w-olive: #214E36`)? Si es la del brief, es un cambio global aparte.

Bloquean la Fase 3: 1, 4 y 6.

---

## 8. Qué se ha verificado y qué no

**Verificado en código:** estructura de planes, entitlements, ADDONS, catálogo derivado, rutas de checkout/cambiar-plan/addons, mapeo de Price (uno por plan), ausencia de facturación anual, trial y gratis, guardias y tests que fijan cifras, frases con precios de la web comercial.
**Verificado en producción (solo `SELECT` agregado):** 44 estudios (41 gratis, 1 Founding de pago régimen antiguo, 3 sedes de una cadena `active` sin suscripción, 0 Estudio) y 2 cadenas.
**No verificado:** los Price reales de Stripe (nombres, intervalos, si hay anuales), las variables de entorno de Vercel, `facturacion-real.ts`/MRR de `/interno`, el contenido completo de `llms.txt` y de los prompts de prospección, el estado operativo de «Pedir mi app» de extremo a extremo.
**No hecho (por diseño):** ningún cambio de código, commit, push, Stripe, BD ni copy.

---

## 9. Decisiones tomadas y estado de la implementación (16-nov-2026)

El fundador delegó las preguntas abiertas en la recomendación del equipo y autorizó tocar Stripe y mergear. Resultado:

| # | Decisión | Estado |
|---|---|---|
| 1 | Lo gratis se mantiene como entrada (150 reservas/mes, luego 29 €) | Decidido por el fundador |
| 2 | Rótulo del plan central: «Recomendado» (no «Más elegido»: hay 0 estudios en Estudio) | Hecho |
| 3 | Nombre del plan de entrada: se queda «Founding Studio» (id interno `BASE`), para no tocar ~60 frases ni `studios.plan` | Hecho (sin cambios) |
| 4 | Facturación anual: **no se construye todavía**. No hay Price anuales ni política; «cambiar-plan» y «addons» solo conocen mensual. Política recomendada para cuando se haga: «2 meses gratis» (Estudio 790 €/año, ahorro 158 €; Cadena 2.490 €/año, ahorro 498 €), con su PR propio | Pendiente, fuera de esta entrega |
| 5 | Complementos 22 / 12 / 16 € (Base + los tres = 79 € = Estudio) | Hecho |
| 6 | Grandfathering: Founding antiguo con todo incluido se queda sin fecha; cadena manual no se toca | Sin cambios de código |
| 7 | Cadena: sedes sin tope y CTA «Hablar con nosotros» (mailto) | Sin cambios |
| 8 | Paleta: manda la de la web vigente (`--w-*`), no la del brief | Hecho |

**Stripe (live, creado el 16-nov):** Price mensuales nuevos sobre los productos existentes (Estudio 79 €, Cadena 249 €, Centro de Control 22 €, Sustituciones 12 €, Redacción con IA 16 €). Los Price viejos siguen activos, sin tocar las suscripciones existentes. En Vercel (solo Production) se sustituyeron `STRIPE_PRICE_ESTUDIO/CADENA/ADDON_*` por los nuevos y se añadieron `STRIPE_PRICE_*_LEGACY` con los viejos; solo se reconocen, nunca se venden (`planDePriceId`/`addonDePriceId`).

**Código:** `PLAN_INFO` 79/249, `ADDONS` 22/12/16, mapeo de Price heredados, tarjetas nuevas en `/precios` (Estudio elevado con «Recomendado», «para quién» bajo el precio, lo que añade cada plan derivado del catálogo, mensajes de confianza ciertos), literales de precio de la web comercial y de `llms.txt`, y los tests que fijaban cifras.

**No hecho:** selector mensual/anual (decisión 4); reagrupar el catálogo en las 9 categorías del brief (hoy son 15, plegables; afecta también a `/suscripcion` y al alta); soporte prioritario y «white-label avanzado» de Cadena (no verificados en código, no se anuncian).
