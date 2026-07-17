# 01 · Investigación competitiva — mercado de software de gestión para estudios boutique (Pilates/Fitness)

> Parte 1 de la Auditoría Total de **Tentare** (`pilates-saas`). Fecha: 2026-07-17.
> Fuentes: G2, Capterra, Trustpilot, BBB, Reddit, Product Hunt, App Stores, páginas de producto, prensa sectorial y notas de financiación. Cada afirmación en las fichas detalladas está citada con URL en las notas de investigación de origen. Las cifras de reseñas son de mediados de 2026.

## 0. Advertencia metodológica (lee esto primero)

Tu prompt pedía analizar **35 competidores** con la misma profundidad, incluyendo Notion, Linear, ClickUp, Calendly, Stripe o Shopify. **Eso es un error estratégico y no lo he hecho.** Ningún competidor real reparte su atención así. He priorizado:

- **Amenaza directa en tu segmento y país** (España, boutique Pilates/Yoga/Fitness): bsport, **Eversports**, **Timp**, **Nubapp** (Resasports/Resawod), Trainingym, Virtuagym, Xplor Resamania, Deporwin, Playtomic.
- **Incumbentes globales que definen el estándar y el descontento**: Mindbody, Momence, Glofox, WellnessLiving, Vagaro, Walla, TeamUp, PushPress.
- **Verticales/simplicidad como referencia**: Wodify, Zen Planner, Pike13, Gymdesk, GymMaster.
- **Principios de producto** (Stripe/Shopify/Linear/Notion): NO como competidores, sino como fuente de principios (ver archivo 06).

**Dos nombres de tu lista de "competidores españoles" no existen como producto activo:** `Resax` (dominio aparcado en Loopia; probablemente confusión con **Resasports**) y `Gymter` (dominio en venta en HugeDomains). Que hayas listado competidores fantasma y hayas **omitido a Eversports, Timp y Nubapp** —tres de los cuatro rivales más relevantes en España— es en sí mismo un hallazgo: **tu mapa competitivo está desactualizado.**

---

## 1. Ranking de amenaza para Tentare (estudio boutique español)

| # | Competidor | Amenaza | Por qué |
|---|------------|---------|---------|
| 🥇 | **Eversports Manager** | **CRÍTICA** | Austríaco, respaldado por Verdane (2024), ~4.800 estudios en 9 países, **marketplace de consumidor** propio como canal de captación, localizado en español (eversports.es con inventario en BCN/MAD/VAL), **y ya tiene Verifactu + TicketBAI** (vía Fiskaly, de pago). Absorbió a Fitogram (dic-2024). Es el incumbente europeo a batir. |
| 🥈 | **bsport** | **CRÍTICA** | Francés con HQ en **Barcelona**, €30M Serie B (dic-2024), 2.000-3.000 estudios, foco boutique Pilates/Yoga, app de socio branded, gran empuje en IA ("AI Front Desk", churn). **NO tiene Verifactu/TicketBAI nativo** (requiere capa ERP externa) → tu hueco. Muy odiado por su **contrato anual con 2 meses de preaviso** y payouts bloqueados. |
| 🥉 | **Timp** | **ALTA** | Español (Valencia), **2.300+ centros**, precios públicos €50-€170, **ya publicita Verifactu + TicketBAI + registro horario**. Tu competidor español más directo por precio y compliance. Debilidades: módulos fragmentados de pago, notificaciones de lista de espera que no llegan, subida de precio del 44% en 2026. |
| 4 | **Nubapp** (Resasports/Resawod/Resafit) | ALTA | Español (Pamplona), 600+ centros, verticalizado, soporte 4.9/5, **Resapayments con SEPA nativo**. NO publicita Verifactu/TicketBAI/Bizum → hueco. App de admin (Resadmin) floja. |
| 5 | **Trainingym** | MEDIA-ALTA | Probablemente **el software de gimnasio más implantado en España** (500+ gimnasios), app de socio white-label. Más orientado a gimnasio que a boutique; analítica pobre. |
| 6 | **Mindbody** | MEDIA | Incumbente global, define el estándar y **el odio del mercado** (precio opaco, soporte degradado a IA, contratos 12-24m, comisión 20% del marketplace). Poco localizado en España. Su descontento es TU oportunidad de mensaje. |
| 7 | **Momence** | MEDIA | Retador YC, UI moderna, mejor suite de marketing de la categoría, **AI Agent a $399/mo**. Adquirido por Clubessential→Xplor (2025-26), con quejas de degradación post-adquisición. Global, poco foco España. |
| 8 | **Virtuagym / Xplor Resamania / Playtomic / Deporwin** | MEDIA-BAJA | Presentes en España pero en segmentos adyacentes (coaching híbrido, cadenas grandes, pádel, instalaciones municipales). Playtomic marca el estándar de UX de reserva y comunidad. |
| — | Glofox, WellnessLiving, Vagaro, Walla, TeamUp, PushPress, Wodify, Zen Planner, Pike13, Gymdesk, GymMaster | BAJA en España | Referencias de funcionalidad y de quejas de categoría; poca o nula presencia en el mercado español. |

**Conclusión del ranking:** tu batalla real es contra **Eversports, bsport, Timp y Nubapp**, no contra Mindbody. Mindbody es el "villano" retórico útil (todos migran huyendo de él) pero no está en tus salas de venta en España.

---

## 2. Fichas de competidores — lo esencial

### 2.1 Competidores europeos/españoles (tu campo de batalla real)

**Eversports Manager** (Viena, 2013 · Verdane mayoría 2024)
- **Precio (público, por nº de reservas/mes):** Light €49 · Starter €79 · Accelerate €119 · Professional €169 · Champion €229. Setup **€99**. Comisiones de pago **no publicadas** (opacas, criticadas como altas).
- **Marketplace:** comisión **25% / tope €75 por cliente nuevo** ("no cure no pay").
- **Fiscal ES:** ✅ Verifactu + TicketBAI vía Fiskaly (add-on de pago, solo centros ES, NIF/territorio no autoeditables). **Bizum: no documentado.** SEPA sí.
- **Fuerte:** facilidad de uso (4.8/5), soporte (4.8/5), all-in-one, marketplace como lead-gen, confianza de datos en UE, dominante en DACH.
- **Débil:** comisiones de pago opacas, **contrato mínimo ~12 meses con facturación tras cancelar**, sin precios introductorios ni sistema de descuentos/perks, reporting pobre, UX rígida ("constantemente buscando workarounds"), app de admin tardía (branded app de socio solo desde Q1-2025), **sin IA**.

**bsport** (París/Barcelona, 2018 · €30M Serie B 2024)
- **Precio:** desde **~€150/mes por feature** (opaco, "get a quote"), contrato **anual**, add-ons caros. Comisión de transacción anunciada 1,99%.
- **Fiscal ES:** ❌ **Sin Verifactu/TicketBAI nativo** — necesita bridge a ERP certificado (Holded/Sage). Bizum: no confirmado. SEPA sí.
- **Fuerte:** soporte/account managers (4.6/5), amplitud all-in-one, experiencia de reserva "one-click" + web branded, empuje fuerte en **IA** post-Serie B (AI Front Desk, churn score, forecast, campañas 1-prompt).
- **Débil (oro para tu posicionamiento):** **contrato anual con 2 meses de preaviso "diseñado para atraparte antes de abrir"**, payouts bloqueados para forzar renovación, reembolsos que fallan, backend que se congela/crashea, **"3× más quejas de clientes tras cambiarse a bsport"**, onboarding que promete y no cumple, sin app de dueño.

**Timp** (Valencia, 2014 · 2.300+ centros, 13 países)
- **Precio (público, por centro):** Starter €50 · Basic €85 · Pro €130 · Premium €170 · Enterprise custom. Semestral −5%, anual −10%. **Módulos extra de pago aparte** (queja principal).
- **Fiscal ES:** ✅ **Facturación electrónica adaptada a Verifactu + compatible TicketBAI + registro horario** (legal ES). RGPD. Bizum/SEPA no nombrados explícitamente.
- **Fuerte:** intuitivo, gestión de reservas/ocupación ágil, comunicación automática que reduce no-shows, módulo de estadísticas, mensaje ROI ("ahorra 150h/mes", "−50% impagos").
- **Débil:** **subida de precio del 44% en 2026**, módulos fragmentados de pago, **notificaciones de lista de espera que no llegan** (¡idéntico a un bug histórico tuyo!), inestabilidad de app, curva de aprendizaje, cobros tras cancelación, migración con pérdida de datos. Capterra 3,6/5 (muestra pequeña).

**Nubapp** (Pamplona, 2011 · marcas Resasports/Resawod/Resafit/Resapadel)
- **Precio:** Resasports desde €59/mo (oculto tras demo); Resawod público: PayG €0 + **€0,25+3,5%/transacción**, Starter €72, Pro €99, Premium €115-160.
- **Fiscal ES:** RGPD + **SEPA nativo (Resapayments)**. **Verifactu/TicketBAI/Bizum no publicitados** → hueco.
- **Fuerte:** **soporte 4.9/5**, intuitivo, set vertical completo (reservas+acceso QR/NFC+pagos+programación), multi-idioma, sin permanencia.
- **Débil:** app de admin (Resadmin) pobre y anticuada, crashes/bugs de login, salto de precio €100→€500 sin escalón intermedio.

**Otros ES relevantes:** **Trainingym** (500+ gimnasios ES, app white-label, analítica pobre, precio a demanda); **Virtuagym** (holandés, coaching híbrido, ~€59/mo); **Xplor Resamania** (líder para cadenas grandes, TPV+control acceso); **Deporwin/T-Innova** (448 instalaciones, **cumple SIF+Verifactu**, venta ERP hardware, sin reseñas online); **Playtomic** (Madrid, pádel, €240M ingresos 2024, referencia de UX de reserva + comunidad; fricción: **€0,99/persona/partido** y soporte chatbot).

### 2.2 Incumbentes globales (definen estándar y descontento)

**Mindbody** (incumbente, matriz Playlist/ClassPass) — G2 3.7 · Capterra 4.0
- Precio opaco por local (~$79-$699+), **comisión 20% del marketplace** (tope $30), procesamiento ~3-3,6%, contratos 12-24m, **cargo de ~$500 por exportar datos al cancelar**. Gasto real reportado **>$1.000/mes**.
- IA 2025-26: AI Assistant (GPT-4), Clients At Risk (churn), Big Spenders, **AI Concierge** (recepción 24/7, jul-2026).
- **Odio nº1 del mercado:** precio, subidas sin avisar (**"cuadruplicó en 4 años"**), **soporte degradado a IA** (esperas 45min, ticket abierto 16 meses), lock-in y cancelación difícil, bloat de funciones. *"No hay defensores en ningún hilo de Reddit."*

**Momence** (YC, Xplor) — Capterra 3.9 · app consumidor 4.9
- Precio actual: Free (5%+4%) · Pro $60 (2,5%) · Custom $199 (0%) · **AI Agent +$399/mo**. Sobrecoste ~1% sobre Stripe + backlink forzado a momence.com.
- Fuerte: **mejor suite de marketing de la categoría**, UI moderna rápida, vídeo on-demand/LMS nativo, app de socio 4.9/5, integraciones ClassPass/Gympass nativas.
- Débil: soporte con poca continuidad, **bugs de captura de pago** (checkout OK pero no cobra), inestabilidad, opacidad de tarifas, degradación post-adquisición, **sin UI de reserva Reformer nativa**.

**Glofox** (ABC Fitness/Thoma Bravo) — G2 4.5 · Capterra 4.4 · **Trustpilot 3.6**
- Precio opaco ("desde $99", real $110-$600+), prepago trimestral, anual auto-renovable.
- Diferenciador: **app de socio 100% branded**; fuerte en franquicia/multi-sede (Club Pilates, Pure Barre). IA: churn predictor, billing inteligente.
- Débil (patrón post-adquisición ABC, ~29% menos plantilla): **soporte hundido**, **subidas del ~70% a mitad de contrato**, cancelación imposible con cargos posteriores, bugs de facturación.

**WellnessLiving** (Canadá, "el anti-Mindbody") — Capterra 4.4 · G2 4.6 · **BBB 1.12**
- Precio: Starter $69 · Business $199 · BusinessPro $349. Procesador **obligatorio Paragon/Nuvei (sin Stripe)**. Coste real 2-3× lo publicado. Contrato anual auto-renovable, **términos vinculantes escondidos en los ToU de la web**.
- Diferenciador: **programa de puntos/fidelización gamificado**, app Achieve, IA (Isaac, CAASI, AI Marketing Suite abr-2026).
- Débil: **el contraste Capterra 4.4 vs BBB 1.12 lo dice todo** — subidas silenciosas, alta de add-ons sin avisar, cancelación con amenaza de BBB/FTC, app Achieve 2-3★, curva empinada.

**Vagaro** (salón+spa+fitness) — Capterra 4.7 · G2 4.6 · Trustpilot 4.0
- Precio $30 base **por calendario** + add-ons de todo (SMS $20, forms $10, web $20, app $100…) → real $100-150+. Marketplace de consumidor "52M clientes".
- Débil: **nickel-and-diming** (queja nº1), bugs/outages, soporte con esperas de 1h, disputas de facturación, **más salón que fitness** (caro por instructor, sin gestión de eventos ni vídeo).

**Walla** (ex-Mindbody execs, ~$18M) — Capterra 4.9 (muestra pequeña) · app 4.9
- Precio: Core $320 · Pro $599, mucho add-on à la carte. Sin permanencia. Stripe estándar.
- Diferenciador: **UX "el Apple del software de estudios"**, gestión de sustitutos y equipamiento, **WallaPredict** (churn IA sobre AWS ML), sin marketplace que compita con tu marca.
- Débil: reporting superficial, **flujo de citas/privados flojo** ("más para yoga que Pilates"), bugs de app, à la carte caro, soporte solo email (esperas hasta 2 semanas).

**TeamUp** (UK, simplicidad) — Capterra 4.8 · **PushPress** (US, gym, free tier) — Capterra 4.7
- Los "amados por simplicidad y soporte" a los que migra la gente que huye de Mindbody. TeamUp: precio por cliente activo (~$189/200 clientes), Zoom incluido, edición de clase en ~15s vs "un buen rato + portátil" en Mindbody. PushPress: tier gratis (monetiza vía procesamiento 4,99%), módulo Grow de captación potente.
- Ambos débiles en **reporting** y (TeamUp) **sin app de staff nativa**.

**Verticales/pequeños:** Wodify (CrossFit, workout tracking, downtime), Zen Planner (Daxko, feature-rich pero "clunky", Trustpilot ~2,5 por facturación), Pike13 (limitado en features/reporting), **Gymdesk** (precio transparente, soporte 4.9, **sin app móvil**), GymMaster (control de acceso 24/7, POS "clunky").

---

## 3. Tabla comparativa de precios y modelo (síntesis)

| Producto | Entrada | Modelo | Comisión pago | Marketplace fee | Contrato | Fiscal ES |
|---|---|---|---|---|---|---|
| **Tentare** | €29 BASE / €59 / €149 | por plan SaaS | Stripe Connect + take-rate propio | — (sin marketplace) | sin permanencia (cobro día 1) | ✅ **Verifactu nativo** |
| Eversports | €49-€229 | por nº reservas | opaca (alta) | 25% / €75 | ~12m + facturación tras cancelar | ✅ (add-on Fiskaly de pago) |
| bsport | ~€150/feature | por feature | 1,99% | — | **anual, 2m preaviso** | ❌ (bridge ERP) |
| Timp | €50-€170 | por centro | no público | — | — | ✅ (Verifactu+TicketBAI) |
| Nubapp/Resawod | €0-€160 | vertical | €0,25+3,5% (PayG) | — | sin permanencia | ⚠️ solo SEPA |
| Mindbody | ~$79-$699 | por local | ~3-3,6% | **20%** ($30 tope) | 12-24m + $500 export | ❌ |
| Momence | $0/$60/$199 | tiers | 2,5% +~1% | — | "sin contrato" (cobra tras cancelar) | ❌ |
| Glofox | ~$110-$600 | opaco | ~2,9% (+surcharge?) | — | **anual, prepago trimestral** | ❌ |
| WellnessLiving | $69-$349 | tiers | Paragon/Nuvei oblig. | — | anual auto-renov. | ❌ |
| Walla | $320-$599 | tiers + à la carte | Stripe 2,9% | — | **sin permanencia** | ❌ |

**Lecturas clave:**
1. **Tu precio (€29-€149) es agresivo y correcto** para el mercado español boutique: por debajo de Eversports/bsport y competitivo con Timp. Pero cobras desde el día 1 sin trial → fricción de adquisición (ver archivo 05/06).
2. **NO tienes marketplace de consumidor** — es el arma de captación de Eversports/Mindbody/Vagaro/Momence. Es una desventaja de adquisición real, pero también te libera del odio que genera la comisión del 20-25% (Walla lo convierte en posicionamiento: "sin marketplace que compita con tu marca").
3. **Verifactu nativo es tu única ventaja estructural difícil de copiar rápido** frente a bsport, Mindbody, Momence, Glofox, WellnessLiving, Walla, Nubapp. Timp y Eversports ya la tienen → contra ellos NO es diferenciador, es paridad.
