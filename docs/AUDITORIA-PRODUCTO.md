# Due diligence de producto, arquitectura e inversión — pilates-saas
### Evaluación técnica + de producto + tesis de inversión. Sin cortesías.

**Fecha:** 9 julio 2026
**Panel simulado:** Principal/Staff Engineer · CTO · PM Senior · Consultor SaaS B2B · VC.
**Alcance:** producto, arquitectura, dominio, competencia, diferenciación, monetización, decisión de inversión.
**Base:** el mismo repositorio auditado en `AUDITORIA-CTO.md` (seguridad) y `AUDITORIA-ESCALABILIDAD.md` (escala). Este documento **no repite** esos hallazgos salvo cuando tienen consecuencia de producto/negocio; los da por leídos.

**Leyenda de evidencia (obligatoria en cada afirmación):**
✅ Confirmado por el código · ⚠️ Inferencia razonable (explico por qué) · ❓ No determinable con la información disponible · 🌐 Requiere/proviene de investigación externa (competencia)

---

## 0. La verdad en tres frases

1. ✅ **Este producto, hoy, no tiene forma de ganar dinero.** No existe ningún mecanismo en el código para que el SaaS cobre a los estudios: `crear-estudio` no tiene paso de pago, el campo `studios.plan` (`BASE`/`ESTUDIO`/`CADENA`) no gatea ni una sola funcionalidad, y no hay panel de plataforma ni suscripción de la cuenta. El producto sabe cobrar a las *socias* de un estudio (Stripe Connect, de verdad), pero no sabe cobrarle *al estudio*.
2. ✅ **La única ventaja difícil de copiar en el mercado español está sin construir** y ya prometida en la landing: facturación **VeriFactu/TicketBAI**. En el código es un banner "Próximamente" y una columna `verifactu_hash` que siempre vale `null`. 🌐 De todos los competidores investigados, **solo Eversports** la tiene nativa hoy — es el hueco de mercado más defendible que existe, y lo tienes vacío.
3. ⚠️ **Tu diferenciador visible (gamificación + IA + vertical pilates) es real pero es un "wedge", no un foso.** 🌐 Ningún incumbente boutique lo hace bien, pero es una *feature* copiable en un ciclo de release, no una barrera de entrada. El foso de verdad que tienen los grandes —un marketplace que trae clientes nuevos— tú no lo tienes ni empezado.

---

## 1. Resumen ejecutivo

El proyecto demuestra una capacidad de ejecución de producto muy por encima de lo normal para lo que aparenta ser un equipo mínimo: 20 módulos de dashboard, 14 pantallas de portal de socia, Stripe Connect de nivel producción, motores de gamificación reales, IA integrada de verdad (Anthropic), y una landing de marketing completa (`app/page.tsx`, ~800 líneas). ✅ El *alcance funcional* impresiona.

Pero una due diligence no compra alcance, compra **fiabilidad, monetización y diferenciación defendible**, y en las tres el producto suspende hoy:

- **Fiabilidad:** el core de reservas sobrevende clases (bug de aforo, documentado en `AUDITORIA-CTO.md` y `AUDITORIA-ESCALABILIDAD.md`) y la arquitectura no soporta un solo estudio grande de más de un año (`AUDITORIA-ESCALABILIDAD.md`). Un software de reservas que sobrevende es un software que no hace su trabajo.
- **Monetización:** no existe. Cero. No es "hay que pulirla" — no está construida (§3, hallazgo M-1).
- **Diferenciación defendible:** la gamificación es copiable; el marketplace y las integraciones de agregadores (el foso real) son stubs; la ventaja legal (VeriFactu) está sin hacer.

**Traducción de inversor:** hay talento de producto evidente y un producto con *deseo*, montado sobre una base sin modelo de negocio implementado, sin foso, y con el core aún poco fiable. El valor está en el fundador y en un par de decisiones estratégicas todavía sin tomar, no en el código tal como está.

---

## 2. Lo mejor del producto

**M+1. Stripe Connect de verdad.**
- *Estado:* ✅ Confirmado por el código (`app/api/stripe/*`, webhook con firma verificada, `charge-off-session` con `off_session` + gate de aprobación humana).
- *Descripción:* cobro directo sobre la cuenta conectada del estudio, tarjeta guardada, cobro off-session con manejo de 3DS.
- *Impacto:* es la pieza más difícil y arriesgada de un SaaS de este tipo, y está a nivel producción. Un competidor tarda meses en igualar esto bien.
- *Cómo lo hace un SaaS de primer nivel:* exactamente así. Aquí estás a la par.
- *Recomendación:* protégelo. Es tu activo técnico más valioso. (Nota de seguridad: `charge-off-session` sin auth — ver `AUDITORIA-CTO.md`; arréglalo antes de presumir de esto).

**M+2. Gamificación vertical completa (créditos, logros, retos, niveles, rachas).**
- *Estado:* ✅ Confirmado (`lib/achievement-engine.ts`, `challenge-engine.ts`, `level-engine.ts`, `reward-engine.ts`, `streak-engine.ts`, tablas propias, motores testeados).
- *Impacto:* 🌐 Es whitespace real en boutique/pilates. Ningún incumbente boutique (bsport, Momence, Mindbody, Mariana Tek, Eversports) envía gamificación profunda; ofrecen como mucho mecánicas de fidelidad (referidos, VIP, puntos). El único que gamifica de verdad, Virtuagym, es de gimnasio/coaching, no boutique.
- *Consecuencia:* es tu mejor gancho de marketing y de retención de la socia final.
- *Cómo lo hace un SaaS de primer nivel:* lo ata a resultados de negocio medibles (reducción de no-shows, reactivación) y lo pone al servicio del dueño, no como vanity feature.
- *Recomendación:* consérvalo pero **no lo confundas con un foso** (§9). Mídelo: si demuestras que sube la retención X puntos, es un argumento de venta; si no, es decoración.

**M+3. IA integrada real (no fachada).**
- *Estado:* ✅ Confirmado (`claude-haiku-4-5` en asistente de campañas y notas de instructor).
- *Impacto:* 🌐 La IA se está volviendo *table stakes* rápido (Mindbody Messenger[ai], Momence AI Agent a $399/mes, bsport churn-AI, Virtuagym MAX AI). Estás dentro de la ola, no por delante.
- *Recomendación:* la IA no vende sola. Úsala donde el dueño siente dolor caro y repetitivo (redactar campañas, resumir progreso, sugerir a quién reactivar), no como etiqueta.

**M+4. Enfoque vertical pilates (spots/posiciones, niveles de clase).**
- *Estado:* ✅ Confirmado (`components/spots/spot-map.tsx`, tablas `spots`, niveles de clase).
- *Impacto:* 🌐 El spot-booking sobre plano de sala es *table stakes* entre los serios (Mariana Tek, Mindbody, bsport) pero te separa de los genéricos (TeamUp, Vagaro, Zen Planner). Estás en la liga correcta en esto.
- *Recomendación:* mantenlo, pero sabe que no diferencia frente a bsport/Mariana Tek — solo frente a los genéricos.

**M+5. Diseño y coherencia visual.**
- *Estado:* ⚠️ Inferencia razonable (landing y dashboard cuidados; no evalúo estética como hecho objetivo).
- *Impacto:* transmite profesionalidad. En un mercado donde Mindbody es criticado por complejidad y Momence por bugs, "se ve limpio y va rápido" es un argumento comercial legítimo.

---

## 3. Lo peor del producto

**M-1. NO HAY MODELO DE NEGOCIO IMPLEMENTADO. (El hallazgo más grave de todo el informe.)**
- *Estado:* ✅ Confirmado por el código. `grep` de billing de plataforma → 0 resultados. `crear-estudio/page.tsx` no tiene ni un `stripe`, `checkout`, `precio`, `trial` ni `tarjeta`. `studios.plan` existe como enum pero **no gatea ninguna funcionalidad** (grep de entitlements → 0 resultados).
- *Descripción:* un estudio puede crear su cuenta y usar el producto completo sin pagar nada, porque no existe la mecánica para cobrarle. La landing (`app/page.tsx`) *habla* de planes y facturación, pero detrás no hay suscripción de la cuenta, ni límites por tier, ni prueba, ni facturación de la plataforma, ni panel de super-admin para gestionar cuentas.
- *Impacto:* una empresa SaaS sin mecanismo de cobro no es una empresa, es un producto gratis. No hay MRR posible con este código. Para un inversor, esto convierte cualquier proyección de ingresos en ficción hasta que se construya.
- *Consecuencia:* no puedes medir conversión, no puedes hacer pricing experiments, no puedes tener churn (no hay a qué renunciar), no puedes reportar la única métrica que un VC mira primero: ingresos recurrentes.
- *Cómo lo hace un SaaS de primer nivel:* Stripe Billing (no Connect — Connect es para que el estudio cobre a sus socias; **Billing** es para que tú cobres al estudio), con tiers que gatean features de verdad, trial de 14-30 días, y dunning propio.
- *Mi recomendación:* **P0 absoluto de negocio.** Antes que cualquier feature nueva. El enum `plan` ya existe; conviértelo en entitlements reales y añade la suscripción de la cuenta con Stripe Billing. Sin esto, todo lo demás es un hobby caro.

**M-2. El core de reservas sobrevende y consume mal el bono.**
- *Estado:* ✅ Confirmado (`AUDITORIA-CTO.md` §3, `AUDITORIA-ESCALABILIDAD.md` P0-5). `addReserva` siempre escribe `CONFIRMADA`; el bono solo se descuenta en check-in, no al reservar.
- *Impacto:* 🌐 los incumbentes no sobrevenden. Es el requisito número uno de un software de reservas. Un dueño que quede mal delante de su clienta por una plaza vendida de más no renueva.
- *Consecuencia:* destruye la confianza operativa, que es exactamente lo que el dueño compra.
- *Recomendación:* P0 de producto. Aforo transaccional en BD (ver `AUDITORIA-ESCALABILIDAD.md`). Nada de "es una feature secundaria": es el corazón.

**M-3. La ventaja legal española (VeriFactu/TicketBAI) está prometida y sin construir.**
- *Estado:* ✅ Confirmado. Es un banner "Próximamente" (`facturas/page.tsx:287`), la landing lo vende como "en desarrollo" (`app/page.tsx:776`), y `verifactu_hash` siempre es `null`.
- *Impacto:* 🌐 VeriFactu es **obligación legal en España** (contribuyentes de sociedades desde ene-2027, resto jul-2027; TicketBAI ya vivo en País Vasco/Navarra), con software no certificado multable hasta 50.000 €. De toda la competencia investigada, **solo Eversports lo tiene nativo** (vía Fiskaly). bsport explícitamente NO (necesita middleware tipo Holded/Sage). Momence, Mindbody, Mariana Tek, TeamUp, Vagaro: sin evidencia de soporte.
- *Consecuencia:* tienes en la mano el argumento de venta más fuerte y difícil de copiar del mercado español —"cumplimos VeriFactu de serie, tu software actual no"— y lo estás desperdiciando como un "próximamente".
- *Cómo lo hace un SaaS de primer nivel:* integración con un certificador (Fiskaly u homólogo), hash encadenado + QR en cada factura, envío a AEAT, y lo convierte en el gancho de venta principal en España.
- *Mi recomendación:* **este es tu wedge, no la gamificación.** Priorízalo por encima de casi todo lo demás una vez cerrada la seguridad. Es la diferencia entre "otro software de reservas con gamificación" y "el software que te pone en regla con Hacienda sin middleware".

**M-4. Demasiados módulos, varios a medias (fachadas que restan confianza).**
- *Estado:* ✅ Confirmado. 20 módulos de dashboard; POS sin stock, comunidad que no persiste comentarios, on-demand sin reproductor, 7 integraciones stub, export PDF simulado (`AUDITORIA-CTO.md` §3).
- *Impacto:* un módulo a medias resta más confianza de la que suma valor. El dueño de un estudio de pilates quiere llenar clases, cobrar y no liarse — no 20 pestañas.
- *Recomendación:* esconde lo que no funciona, fusiona finanzas (pagos+transacciones+facturas) y comunicación (chat+mensajería+notificaciones). Menos módulos, más terminados.

**M-5. Sin canal de adquisición propio (ni marketplace ni agregadores reales).**
- *Estado:* ✅ Confirmado (integraciones ClassPass/Wellhub/Urban Sports son UI de configuración sin backend — `configuracion/page.tsx`, y ver `AUDITORIA-ESCALABILIDAD.md` P0-39).
- *Impacto:* 🌐 El foso real de los grandes es el marketplace que trae clientes nuevos (Mindbody/ClassPass global, Eversports en Europa: dicen que el 95% de sus partners captan socias así). Tú no traes ni un cliente nuevo al estudio; solo gestionas los que ya tiene.
- *Consecuencia:* vendes "gestión", no "crecimiento". El dueño paga menos y con menos fidelidad por gestión que por clientes nuevos.
- *Recomendación:* no puedes construir un marketplace de la noche a la mañana (efecto red). **Alquila demanda:** integra ClassPass/Wellhub/Urban Sports de verdad desde el día uno, como hacen bsport y Eversports. Cede el foso pero llena clases.

**M-6. El "portal de socia" no es una app, es una web con sesión falsa.**
- *Estado:* ✅ Confirmado (localStorage sin auth real — `AUDITORIA-CTO.md`). Hay `manifest.ts` (PWA) pero el login es un blob de localStorage.
- *Impacto:* 🌐 Mariana Tek presume de que >90% de sus socias auto-reservan en su app branded 5★; Momence tiene app propia. Tu socia final vive en una web con auth suplantable.
- *Recomendación:* auth real (Supabase Auth/magic link) + PWA sólida como mínimo viable; app nativa branded como objetivo medio.

---

## 4. Lo que eliminaría

- *Estado:* ✅ (código muerto confirmado) / ⚠️ (recomendaciones de producto).
- **`lib/mock-data.ts` (47 KB) y `new-mock-data.ts`** — código muerto, no se importan. Borrar. ✅
- **Módulos-fachada de la navegación principal hasta que funcionen:** on-demand/vídeos (sin reproductor), comunidad (no persiste), POS de productos (sin stock). No los borres del roadmap, pero **escóndelos del producto vendible** — un "Próximamente" dentro del producto de pago es una promesa que erosiona confianza cada vez que alguien la toca.
- **El enum `studios.plan` tal como está** (dead field): o lo conviertes en entitlements reales (recomendado, §M-1) o lo quitas para no mentir al modelo de datos.
- **7 integraciones de agregadores como tarjetas "Conectar" que no hacen nada** — o las marcas honestamente "Próximamente" (como sí están ClassPass/Wellhub) o, mejor, implementas 1-2 de verdad. Las tres marcadas "Conectado" sin backend (WhatsApp/PayPal/Google Calendar, ver `AUDITORIA-ESCALABILIDAD.md` P0-39) son directamente publicidad engañosa dentro del producto.

## 5. Lo que añadiría (por orden de retorno)

1. **Facturación de la plataforma (Stripe Billing) + entitlements por tier.** Sin esto no hay empresa. ✅ inexistente hoy.
2. **VeriFactu/TicketBAI nativo.** Tu único wedge legal difícil de copiar. 🌐 solo Eversports lo tiene.
3. **Integraciones reales de agregadores (ClassPass/Wellhub/Urban Sports).** Tu único canal de adquisición realista a corto. 🌐 tabla de apuestas europea.
4. **App de socia real (auth + PWA/nativa) con push.** 🌐 estándar del sector.
5. **Onboarding self-service <10 min** (crear estudio → primera clase → primer socio → primer cobro). ⚠️ hoy `crear-estudio` crea la cuenta pero no guía ni cobra.
6. **Reducción de no-shows medible** (recordatorios reales por email/SMS/WhatsApp con confirmación) — ata la gamificación a esto y tendrás una métrica que vender.

## 6. Lo que simplificaría

- *Estado:* ✅ estructura confirmada.
- **20 módulos → 6-8.** Núcleo que debe brillar: Calendario, Socios, Reservas, Cobros. Fusiona Finanzas y Comunicación (§M-4).
- **El "god-context" de 2.339 líneas y las páginas de 1.400-1.900 líneas** — problema de mantenibilidad que encarece cada feature futura (detalle en `AUDITORIA-ESCALABILIDAD.md`). No es cosmético: es lo que hace que el segundo desarrollador que entre tarde semanas en ser productivo.
- **El modelo de datos del cliente:** todo se carga y calcula en el navegador. Simplificar = mover agregaciones al servidor (ver auditoría de escala). Es el cambio que desbloquea todo lo demás.

---

## 7. Comparativa con bsport (tu competidor más directo en España)

🌐 Fuente: investigación de competencia (bsport.io, Capterra, Trustpilot, CeroOne, ronda Series B €30M).

| Dimensión | bsport | pilates-saas (tú) | Quién gana |
|---|---|---|---|
| Reservas + spot booking | ✅ reformer como recurso nombrado | ✅ spots sobre plano | Empate |
| Fiabilidad del core (aforo) | ✅ no sobrevende | ❌ sobrevende hoy | **bsport** |
| Pagos | ✅ (con quejas de payouts/reembolsos) | ✅ Stripe Connect sólido | Empate / ligera ventaja tuya en robustez de flujo |
| Marketing automation | ✅ smart lists, email/SMS/push | ⚠️ motor real pero campañas no se envían aún | **bsport** |
| Gamificación profunda | 🟡 solo fidelidad (referidos/VIP) | ✅ logros/retos/niveles/rachas | **Tú** |
| IA | 🟡 churn-AI, invierte fuerte | ✅ campañas + notas | Empate (ambos incipientes) |
| Agregadores (ClassPass/Wellhub/USC) | ✅ reales | ❌ stubs | **bsport** |
| VeriFactu/TicketBAI | ❌ requiere middleware | ❌ "Próximamente" | Empate en 0 — **oportunidad tuya** |
| App de socia | 🟡 branded, bien valorada | ❌ web con auth falsa | **bsport** |
| Modelo de negocio | ✅ 5 tiers, 3.000 estudios, €30M levantados | ❌ sin cobrar | **bsport** |
| Escala/tracción | ✅ 40+ países, ~$15,4M rev 2025 | ❌ 0 clientes de pago | **bsport** |

**Veredicto:** bsport te gana en todo lo que un cliente *paga y confía*, y tú le ganas en una cosa (gamificación) que es copiable. **Tu única jugada asimétrica frente a bsport es VeriFactu nativo** — bsport explícitamente no lo tiene y necesita middleware; si tú lo tienes de serie, tienes un titular de venta que ellos no pueden replicar rápido en España. Sin esa jugada, eres "bsport con menos tracción y gamificación bonita".

## 8. Comparativa con el resto de competidores

🌐 Fuente: investigación de competencia.

- **Mindbody (+ ClassPass + EGYM, fusión $7.5B completada ~mar-2026):** el gigante. Marketplace propio (foso), Pick-a-Spot, Messenger[ai]. Caro y complejo (su debilidad). No compites de frente; compites por debajo, en un vertical y un país concretos.
- **Momence:** marketing automation fortísimo y app propia, pero reputación de bugs, cobros ocultos y soporte pobre. Te gana en marketing y adquisición; tú puedes ganarle en fiabilidad y honestidad de precio *si* ejecutas.
- **Mariana Tek (Xplor):** spot-booking premium best-in-class + app branded 5★. Orientado a franquicias/EE.UU. No es tu pelea diaria en España.
- **Eversports:** **tu competidor a batir en Europa/España.** Marketplace propio + VeriFactu/TicketBAI nativo (vía Fiskaly) + UI en español + desde 49 €/mes. Es literalmente el que ya ocupa el hueco que tú tienes vacío. Estudia su extensión fiscal como referencia.
- **TeamUp / Gymdesk / Zen Planner / Vagaro:** SMB genéricos, simples, sin spot booking pilates-grade ni gamificación ni fiscal español. Aquí sí les ganas en profundidad vertical — pero son baratos y "suficientes", que es un competidor peligroso por precio.
- **Fresha:** appointment-first (belleza), gratis + comisión de marketplace. No es class/reformer-native. Poco solape.

## 9. Funcionalidades donde estás por delante

- *Estado:* ⚠️ inferencia sobre base ✅ (código) + 🌐 (competencia).
- **Gamificación profunda en boutique/pilates:** por delante de todos los boutique (nadie la hace). Copiable, pero hoy la tienes tú.
- **Profundidad vertical pilates (spots + niveles + gamificación juntos):** 🌐 nadie combina spot-native + gamificación (Mariana Tek/Mindbody no gamifican; Virtuagym no es boutique). Es tu combinación más singular.
- **Honestidad de flujo de cobro** (gate de aprobación humana en off-session): elegante, y frente a las quejas de payouts de bsport/Momence, "cobros que no fallan" es un argumento.
- Nada más. Sé honesto: la lista de "voy por delante" es corta y toda copiable.

## 10. Funcionalidades donde estás claramente por detrás

- *Estado:* ✅/🌐.
- **Modelo de negocio y tracción:** por detrás de todos (ellos cobran; tú no). ✅
- **Marketplace / adquisición de clientes nuevos:** por detrás de Mindbody, Eversports, Fresha. ✅ (no existe)
- **Agregadores reales:** por detrás de bsport, Eversports, Momence, TeamUp, Mariana Tek. ✅ (stubs)
- **App de socia nativa/branded:** por detrás de Mariana Tek, Momence, bsport. ✅ (web con auth falsa)
- **Fiabilidad del core (no sobreventa):** por detrás de todos. ✅
- **Cumplimiento fiscal español:** empatado en 0 con casi todos, pero **por detrás de Eversports**, que ya lo tiene. 🌐
- **Enviar campañas de marketing de verdad:** por detrás de bsport/Momence. ✅ (se guardan, no se envían)

## 11. Oportunidades que la competencia está ignorando

🌐 Síntesis de la investigación:

1. **VeriFactu/TicketBAI nativo en un producto vertical pilates español.** El hueco más claro y con requisito legal detrás. Solo Eversports lo cubre, y Eversports no es pilates-vertical ni gamificado. **Esta es la tesis.**
2. **Gamificación de retención en boutique** atada a resultados (no-shows, reactivación). Nadie boutique la explota; tú ya la tienes construida.
3. **Transparencia de precio y soporte.** bsport (payouts/reembolsos) y Momence (bugs, tarifas ocultas, subidas del 70% en renovación) tienen agujeros de satisfacción reales. Un competidor que no haga esas cosas gana por ejecución, no por features.
4. **La combinación** de los tres puntos anteriores + foco España/Europa es más defendible que cualquiera por separado, porque une un requisito legal (barrera dura) con profundidad vertical y un gancho de retención.

## 12. Qué convertiría este SaaS en un producto excepcional

- *Estado:* ⚠️ recomendación estratégica.
1. **Reposicionar la narrativa de "gestión con gamificación" a "el software de pilates que te pone en regla con Hacienda de serie (VeriFactu) y te retiene a las socias".** Cumplimiento como titular, gamificación como gancho, gestión como base.
2. **Construir el modelo de negocio** (Stripe Billing + entitlements) para poder existir como empresa.
3. **Arreglar el core** (aforo transaccional) y la **capa de datos** (agregaciones en servidor, paginación) para que aguante el primer cliente serio.
4. **Alquilar demanda** vía agregadores mientras no haya marketplace propio.
5. **App de socia real con push** para cerrar el círculo de engagement que la gamificación empieza.

## 13. Qué impediría que se convierta en líder de mercado

- *Estado:* ⚠️/✅.
- **Que sigas añadiendo módulos en vez de construir monetización, cumplimiento y fiabilidad.** Es la trampa en la que ya estás (20 módulos, 0 forma de cobrar). ✅
- **Que la arquitectura "todo en el cliente" no se rehaga** — te impide aceptar el primer cliente grande y hace cada feature más lenta de construir que la de la competencia. ✅ (`AUDITORIA-ESCALABILIDAD.md`)
- **Que el foso de adquisición de los incumbentes (marketplace) se consolide más** — la fusión $7.5B Mindbody/ClassPass/EGYM ya endurece el techo. 🌐
- **Que la gamificación, tu único diferenciador, la copie bsport** (que invierte en producto y es boutique-native) en un ciclo de release. 🌐
- **Que no haya distribución.** Producto ≠ empresa. No he visto en el repo nada de go-to-market, canal, o adquisición más allá de la landing. ❓ (no determinable desde el código, pero su ausencia es el riesgo silencioso número uno).

## 14. Decisión: como CTO e inversor principal, ¿seguiría construyendo sobre esta base? ¿Invertiría 3M€?

**Respuesta sobre la BASE (¿seguir construyendo?): Sí, con un pivote de prioridades — pero no sobre la arquitectura tal cual.**
- *Justificación con hechos:* el modelo de datos relacional (46 tablas, multi-tenant por diseño) y la integración Stripe son reutilizables y valiosos. ✅ Pero la capa de ejecución (lógica en el cliente, sin paginación, sin agregación en servidor) hay que rehacerla antes del primer cliente grande, no después (`AUDITORIA-ESCALABILIDAD.md`, sección 6: el punto de quiebre es el primer estudio mediano de +1 año, no los 500.000). Seguir construyendo *features* sobre esta capa es acumular deuda que se paga con intereses. Seguir construyendo *sobre el dominio y Stripe*, rehaciendo la capa de datos, sí.

**Respuesta sobre la INVERSIÓN de 3M€ HOY: No.**
- *Justificación con hechos, no opinión:*
  1. ✅ **No hay ingresos ni forma de generarlos** (no existe billing de plataforma). Un cheque de 3M€ a una empresa que no puede cobrar es prematuro por definición.
  2. ✅ **0 clientes de pago** (todo es potencial, no tracción).
  3. ✅ **Red flags técnicos que congelan cualquier ronda seria:** exposición de PII/RGPD y endpoint que cobra tarjetas sin auth (`AUDITORIA-CTO.md`), core que sobrevende, arquitectura que no escala a un cliente real. Ninguna DD invierte encima de una brecha activa.
  4. ⚠️ **Sin foso.** El diferenciador (gamificación) es copiable; el wedge defendible (VeriFactu) está sin construir; el foso de los grandes (marketplace) no existe.
- *Qué SÍ haría como inversor:* un cheque pequeño pre-seed **condicionado a hitos**, apostando al fundador (capacidad de ejecución demostrada), no al código. Hitos antes de hablar de 3M€:

**Qué tendría que mejorar para que la inversión fuese mucho más atractiva (en orden):**
1. **Cerrar seguridad/RGPD** (`AUDITORIA-CTO.md`, P0). Innegociable. Hasta aquí, valoración = congelada.
2. **Construir el modelo de negocio** (Stripe Billing + entitlements) y conseguir **los primeros 10-20 estudios de pago**. Esto solo ya multiplica la conversación.
3. **Arreglar el core** (aforo) y **rehacer la capa de datos** para soportar un cliente real.
4. **Enviar VeriFactu/TicketBAI a producción** y convertirlo en el titular de venta. Esto es lo que transforma "otro software de reservas" en "categoría defendible en España".
5. **Integrar 1-2 agregadores de verdad** para tener un canal de adquisición demostrable.
6. **Métricas:** con billing real, enseñar MRR, activación, retención y no-show reduction atribuible a la gamificación.

Con 1-4 hechos y una decena de estudios pagando, esto pasa de "prototipo impresionante de un fundador con talento" a "seed invertible con un wedge legal real en un mercado europeo fragmentado". Sin ellos, por muchos módulos que añadas, la respuesta del inversor seguirá siendo la misma: *talento evidente, empresa todavía no.*

---

## Cierre — la única frase que me llevaría de esta due diligence

Tienes construido lo difícil y bonito (gamificación, Stripe, IA) y sin construir lo aburrido e imprescindible (cobrar, cumplir con Hacienda, no sobrevender). Los tres "aburridos" —**modelo de negocio, VeriFactu, aforo fiable**— son exactamente lo que separa una demo que enamora de una empresa que se puede financiar. Deja de añadir módulos y construye esos tres. En ese orden.
