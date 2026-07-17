# Auditoría de módulo — Calendario + Reservas
### Comité: VC · fundador serial · ex-PM Stripe/Shopify/HubSpot/Notion · obseso de UX · auditor hostil. Sin cortesías.

**Fecha:** 10 julio 2026
**Alcance:** `app/(dashboard)/calendario/page.tsx` (1.494 líneas), `app/reservar/[slug]/page.tsx` (1.004 líneas), `lib/booking-logic.ts`, `lib/studio-context.tsx` (reservas), `lib/supabase-data.ts` (reservas), `app/api/public/reserva/route.ts`, `supabase/schema.sql` (`reservar_plaza`, `cancelar_reserva_plaza`).
**No repite** lo ya documentado en `AUDITORIA-CTO.md` / `AUDITORIA-ESCALABILIDAD.md` / `AUDITORIA-PRODUCTO.md`; lo referencia.
**Leyenda:** ✅ confirmado en código · ⚠️ inferencia razonada · ❓ no verificable sin más información.

---

## 0. Lo primero: reconocimiento de lo corregido

✅ El bug de sobreventa de aforo (P0 de las auditorías anteriores) **está arreglado de verdad**: `reservar_plaza` y `cancelar_reserva_plaza` son funciones Postgres transaccionales con `SELECT ... FOR UPDATE` sobre la sesión, chequeo de duplicado (`YA_RESERVADA`), promoción atómica de lista de espera y devolución/consumo de bono en servidor (`supabase/schema.sql:1137-1244`). La UI hace estimación optimista y se corrige con el resultado autoritativo (`studio-context.tsx:1083-1131`). Esto es exactamente como lo haría un equipo serio. También se corrigió la fuga de PII en la ruta pública: `fetchPublicStudioData` ahora devuelve solo `{id, sesion_id, estado}` de reservas (`supabase-data.ts:1075-1077`).

Dicho esto: el módulo sigue **mintiendo al usuario final en tres sitios**, no tiene política de cancelación, y su flujo de captación de cliente nuevo destruye conversión. Eso es lo que decide si este producto lidera o no. Vamos por partes.

---

## 1. Problemas críticos (ordenados por gravedad)

### C-1. El producto promete notificaciones que no existen. Tres mentiras literales en pantalla. ✅
1. **"Te avisaremos si se libera una plaza"** (`reservar/[slug]/page.tsx:862`). Cuando una socia cancela por la vía pública, `cancelarReservaPublica` promociona a la primera de la lista y **le consume el bono** — y no le envía absolutamente nada (`supabase-data.ts:1239-1251`: tras el RPC solo hay `consumirBonoServidor`). Por la vía admin, lo único que se genera es una notificación de campana **para el dueño**, no para la socia (`studio-context.tsx:1182`).
2. **"La clase quedará marcada como cancelada. Las socias serán notificadas"** (`calendario/page.tsx:394`). `cancelarSesion` → `updateSesion(id, {cancelada: true})` → un `UPDATE` y nada más (`studio-context.tsx:1002-1005`). Cero emails, cero avisos. Las socias se presentan en el estudio y encuentran la puerta cerrada.
3. **Consecuencia compuesta y la más grave:** una socia es promovida de lista de espera sin enterarse, **se le descuenta una sesión del bono sin su consentimiento** (`schema.sql` promueve, `supabase-data.ts:1251` consume), no se presenta porque no lo sabe, y la plaza se quema. Has convertido la lista de espera —una feature de retención— en una máquina de cobrar clases que la clienta no sabe que tiene. Esto genera la peor conversación posible entre el estudio y su clienta: "me habéis quitado una clase del bono". Es el tipo de incidente que provoca churn del estudio, no solo de la socia.

**Ningún producto de la liga que aspiras a jugar lanza una promesa en UI sin el sistema detrás.** O construyes la notificación (email vía Resend ya lo tienes integrado para otras cosas) o borras la frase de la pantalla hoy mismo. Lo segundo cuesta 2 minutos y elimina la mentira.

### C-2. No existe política de cancelación. En un negocio de aforos pequeños, esto es dinero. ✅
No hay ni rastro de ventana de cancelación, late-cancel o penalización en todo el repo (grep exhaustivo: nada en `lib/`, nada en `app/`, nada en el esquema). Una socia puede cancelar 1 minuto antes de la clase (`reservar/[slug]/page.tsx:673`, sin más validación que un `confirm()` nativo) y **se le devuelve el bono** (`cancelar_reserva_plaza` → `devolverBonoServidor`). En un estudio de reformer con 8 plazas, una cancelación a las 8:55 para la clase de 9:00 es una plaza incobrable e irrellenable. Mindbody, bsport, Momence, Mariana Tek: todos tienen ventana configurable (12-24h), late-cancel fee y no-show fee. Es de las primeras preguntas que hace un dueño de estudio al evaluar software. No es una feature "nice to have"; es la caja del negocio.

### C-3. `NO_ASISTIO` es un estado fantasma: se pinta, nunca se escribe. ✅
El tipo existe (`types.ts:7`), el portal lo muestra ("No asistió", `portal/[slug]/reservas/page.tsx:16`), la ficha de socia lo filtra (`socios/[id]/page.tsx:325`), el progreso lo cuenta (`portal/progreso/page.tsx:52`)… y **ninguna línea de código lo asigna jamás a una reserva de clase** (grep: solo lecturas). Las reservas sin check-in se quedan `CONFIRMADA` para siempre. Consecuencias en cascada: no hay métrica real de no-shows, la automatización de ausencias razona sobre datos falsos, la penalización por no-show (C-2) es imposible de construir, y las pantallas mienten por omisión. Falta el barrido "clase terminada → confirmadas sin check-in pasan a NO_ASISTIO" (un cron o un trigger; tienes infraestructura de cron).

### C-4. Cualquier socia puede reservar infinitas clases sin plan, sin bono y sin pagar. ✅
Ni `reservar_plaza` ni el flujo público comprueban derecho alguno: `consumirBonoServidor` hace `return` silencioso si no hay bono (`supabase-data.ts:1172-1173`) y la reserva queda confirmada igualmente. No existe configuración de "exigir plan activo para reservar", ni límite de reservas simultáneas, ni límite semanal por tipo de plan. Un estudio que viva de bonos descubrirá que su software regala clases y que cobrar es un proceso manual de perseguir gente. Esto contradice tu propio motor: tienes bonos, suscripciones, Stripe Connect… y la puerta de entrada no los mira. Es un agujero de monetización *del estudio* (tu cliente), que es peor que un agujero de monetización tuyo: te hace perder al cliente que paga.

### C-5. Bug de timezone en clases recurrentes: el flujo estándar de creación de horario genera datos corruptos. ✅
Dos caminos de creación con formatos incompatibles:
- Clase única: `toISO()` → `new Date(...).toISOString()` → UTC con `Z` (`calendario/page.tsx:41-43`).
- Recurrentes: `inicio = "${dateStr}T${horaInicio}:00"` **naive local** (línea 645) pero `fin = finDate.toISOString().slice(0,19)` **UTC truncado sin Z** (línea 653). En España (UTC+2 verano): clase creada a las 10:00 de 60 min → `inicio="…T10:00:00"`, `fin="…T09:00:00"`. El fin queda ANTES del inicio. El grid la pinta con duración clamped a 20px, el `.ics` y Google Calendar heredan la hora corrupta, y las stats de ocupación por franja quedan mal. El camino que un estudio usa para montar TODO su horario del trimestre produce sesiones defectuosas. Que esto no haya saltado indica que nadie ha probado el flujo completo con datos reales mirando el resultado.

### C-6. El magic link tira la intención de compra a la basura. ✅
Flujo de una clienta nueva con máxima intención ("quiero ESTA clase"): elige clase → email → "Revisa tu email… **y vuelve a reservar tu clase**" (`reservar/[slug]/page.tsx:900-903`). El enlace no vuelve a la clase elegida: la clienta debe reabrir la web, encontrar el día, encontrar la clase y volver a empezar. Cada paso pierde gente; en móvil (donde ocurre esto), muchísima. El estándar es trivial: el magic link lleva `?sesion=<id>` y al autenticar aterriza directo en el paso de confirmación. Estás pagando captación (referidos, marketing) para tirar la conversión en el último metro. Es probablemente el fallo con mayor coste económico directo de todo el módulo.

### C-7. La firma del contrato es teatro. ✅
`CanvasSignature` solo reporta un booleano `onHasDrawing` — **el trazo se descarta** (`reservar/[slug]/page.tsx:96-163`). Lo que se guarda es `firma: socia.nombre` en texto (`:322-333`). Le pides a la clienta el esfuerzo de dibujar su firma en el móvil (fricción real) para no conservar ninguna evidencia (valor legal ~cero). Es lo peor de ambos mundos: fricción de firma manuscrita + validez de checkbox. O guardas el PNG del canvas con timestamp + IP + versión del texto (evidencia razonable), o lo reduces a un checkbox de aceptación (menos fricción, misma validez que hoy). Lo actual da al dueño una falsa sensación de cobertura legal — eso es un riesgo, no una feature.

---

## 2. Problemas importantes

**I-1. Cero detección de conflictos al crear/editar clase.** ✅ `addSesion`/`updateSesion` no comprueban solapamiento de sala ni de instructora (`studio-context.tsx:990-1005`). Puedes programar dos clases en el mismo reformer a la misma hora, o a la misma instructora en dos salas. Con recurrentes, el error se multiplica por 50 sesiones de golpe. Todo calendario serio avisa.

**I-2. Editar aforo ignora la realidad.** ✅ Puedes bajar el aforo de 10 a 4 con 8 confirmadas; nadie pasa a lista de espera, no hay aviso, la clase queda al 200% (`editarSesion`, `calendario/page.tsx:1156-1169`).

**I-3. No existen las series.** ✅ Las recurrentes se crean como N sesiones huérfanas (`forEach(addSesion)` — además N llamadas de red, `calendario/page.tsx:1185-1189`). No hay entidad "serie": imposible "cambiar la instructora de todos los lunes desde hoy" o "cancelar la serie del verano". El estudio edita 50 sesiones a mano. Esto duele cada semana de la vida del cliente.

**I-4. El check-in no tiene deshacer.** ✅ `ASISTIDA` es terminal en la UI (`SessionSidebar`, `calendario/page.tsx:528-532`: un span estático "OK"). En recepción se hace check-in a la socia equivocada varias veces al mes; hoy eso es una reserva envenenada (y un bono consumido) sin remedio en pantalla.

**I-5. Acciones destructivas invisibles en touch.** ✅ La X de cancelar reserva de una socia aparece solo con `opacity-0 group-hover:opacity-100` (`calendario/page.tsx:535`). El dispositivo típico de recepción es un iPad: sin hover, la acción **no existe**. Además cancela sin confirmación ni motivo.

**I-6. El admin añade a una socia a clase llena y no se entera de que fue a lista de espera.** ✅ `onAddReserva` descarta el estado devuelto por `addReserva` (`calendario/page.tsx:458`); no hay toast. La recepcionista le dice "ya estás dentro" a alguien que está en espera #3.

**I-7. "Asistentes (N)" cuenta una cosa y lista otra.** ✅ El contador excluye `LISTA_ESPERA` (`:428`) pero la lista las incluye (`:490`). Incoherencia visible cada vez que hay espera.

**I-8. La StatsBar siempre habla de HOY, aunque estés mirando otra semana.** ✅ Recibe `todayStr` fijo (`:1289`). Navegas a la semana que viene para planificar y los números no cambian: el usuario aprende a ignorar la barra, que es lo peor que le puede pasar a una métrica.

**I-9. Página pública 100% client-side, primer paint en blanco.** ✅ `'use client'` + `if (!mounted) return null` (`reservar/[slug]/page.tsx:398`) + todo el dataset del contexto antes de pintar. Para la página que define la conversión y el SEO local del estudio ("pilates málaga reservar"), esto es renunciar a Google y regalar segundos de pantalla blanca en móvil. Debe ser Server Component con datos mínimos cacheados (además resuelve P0-12 de la auditoría de escalabilidad).

**I-10. La atribución de referidos está silenciosamente rota en la página pública.** ⚠️ La validación `socios.some(s => s.id === refCode)` (`:345`) corre contra un array de socios que en contexto público no se carga (solo la propia socia). Todo `?ref=` de una campaña de referidos se descarta sin error. Tu módulo de afiliados/referidos depende de esto.

**I-11. La socia no ve su posición en lista de espera.** ✅ El mapping público fuerza `posicionEspera: null` (`studio-context.tsx:496`); el portal muestra "⏳ En espera" a secas. Saber si eres #1 o #7 cambia tu decisión (esperar vs reservar otra clase).

**I-12. Spot-booking solo para el admin.** ✅ El `SpotMap` existe en el sidebar del calendario, pero la socia no elige su reformer al reservar. Mariana Tek construyó su marca exactamente sobre esto ("pick your spot"). Tienes la infraestructura (spots, mapa, asignación) y no la expones donde genera diferenciación: en la reserva del cliente final.

**I-13. Tres escalas de color de ocupación contradictorias.** ✅ `ocupColorFor` (4 tramos: 60/85/100, `calendario/page.tsx:153-158`), `barColor` del sidebar (3 tramos: 70/100, `:295`), `PlazasDots` (umbral "≤2 plazas", `reservar:185`). El mismo 75% es ámbar en un sitio y verde en otro. Un sistema de diseño tiene UNA semántica de ocupación.

**I-14. Sin vista de día/mes/lista, sin drag & drop.** ✅ Solo grid semanal. Reprogramar una clase = abrir sidebar → Editar → cambiar fecha/hora en inputs → guardar (4-5 interacciones). En Momence/bsport es un arrastre. Para "la tarea que se hace 20 veces al día", cada paso extra se paga.

**I-15. Dos caminos de crear recurrentes con semánticas distintas.** ✅ Toggle "Repetir semanalmente" (N semanas) dentro de Nueva clase + modal "Clases recurrentes" (rango + días). Dos modelos mentales para lo mismo, uno de ellos con el bug C-5. Fusionar en uno.

**I-16. XSS en los enlaces legales.** ✅ `document.write` del texto de términos sin escapar (`reservar/[slug]/page.tsx:800-803`). El texto lo edita el dueño del estudio; si pega HTML/script, se ejecuta en el navegador de sus clientas. Es además una manera fea de mostrar un documento legal.

**I-17. El servidor acepta reservas de clases ya pasadas.** ✅ `reservar_plaza` no valida `inicio > now()`. La UI pública lo bloquea, pero la API no. Datos basura y gamificación explotable (reservar+check-in de clases de ayer).

---

## 3. Problemas menores

- ✅ `FALLBACK = new Date('2026-06-29')` hardcodeado como fecha de hidratación (`calendario/page.tsx:996`, `reservar:244`) — magia que alguien heredará sin entender.
- ✅ `.ics` sin `UID` ni `DTSTAMP` (violación de RFC 5545; Outlook puede rechazarlo), filename fijo `clase-pilates.ics` (`reservar:74-92`). Y hereda la hora corrupta de C-5.
- ✅ Copy desactualizado: "Introduce tu nombre y email para acceder" cuando el flujo real es solo email + magic link (`reservar:610`).
- ✅ Emojis 🟢🟡🔴 en `LevelBadge` (`reservar:175`) — único sitio del producto que comunica con emojis; rompe el lenguaje visual.
- ✅ Leyenda de tipos truncada a 4 sin indicador "+N" (`calendario/page.tsx:1217`).
- ✅ Accesibilidad: botones icónicos sin `aria-label` (X, chevrons), `focus:outline-none` sin anillo de foco alternativo en la mayoría de inputs, texto `#A8A89F` sobre blanco ≈ 2.7:1 (falla WCAG AA para texto normal) usado en metadatos de toda la página pública.
- ✅ `confirm()` nativo del navegador para cancelar plaza (`reservar:673`) — rompe el diseño y no es traducible/estilizable.
- ✅ Fallback `slug ?? 'tentare'` en el enlace al kiosk (`calendario/page.tsx:567`) — nombre de un estudio concreto hardcodeado en código multi-tenant.
- ✅ Duración de recurrentes limitada a 45/60/90 mientras la clase única permite cualquier rango — incoherencia arbitraria.
- ✅ `max=50` de aforo (`:1417`) contradice el escenario de salas de 200-300 plazas usado en tu propia auditoría de escalabilidad.

---

## 4. Funcionalidades que sobran

Poco que recortar — el módulo está razonablemente enfocado. Dos cosas:
1. **Uno de los dos caminos de recurrentes** (I-15). Elimina el toggle "repetir semanalmente" y deja un solo creador de series bien hecho.
2. **La firma manuscrita en canvas** tal como está (C-7): o se convierte en evidencia real o es fricción pura y debe ser un checkbox.

## 5. Funcionalidades imprescindibles que faltan

Por qué las necesita un estudio de Pilates real, en orden:
1. **Política de cancelación + no-show** (C-2, C-3): aforos de 6-10 plazas hacen que cada plaza perdida sea un % relevante de la caja del día. Es la feature nº1 de protección de ingresos del sector.
2. **Notificaciones transaccionales reales**: promoción de espera (idealmente con confirmación "tienes 2h para aceptar la plaza"), cancelación de clase, recordatorio pre-clase (reduce no-shows 20-40% según todos los benchmarks del sector). Tienes Resend integrado; es ensamblaje, no I+D.
3. **Gate de derechos al reservar** (C-4): exigir plan/bono activo (configurable), límite de reservas simultáneas, clases incluidas por plan.
4. **Series recurrentes como entidad** (I-3): editar/cancelar "esta y futuras" es la operación de mantenimiento de horario más común del año del estudio.
5. **Detección de conflictos** sala/instructora (I-1).
6. **Selección de spot por la socia** (I-12): tienes el 80% construido; es diferenciación visible en la primera demo.
7. **Deep-link del magic link a la clase** (C-6).
8. **Ausencias/vacaciones de instructoras**: hoy nada impide programar a alguien de vacaciones; con series, esto genera cancelaciones en cadena mal gestionadas.

## 6. Flujo de usuario

- **Socia existente reserva:** 2 clics (Reservar → Confirmar). Bien. Nivel correcto.
- **Socia nueva reserva:** elegir clase → email → ir al correo → volver → re-encontrar la clase → nombre → leer contrato → dibujar firma → confirmar. **8+ pasos con pérdida de contexto en el medio** (C-6). Los mejores del sector lo hacen en 3-4 sin salir del flujo.
- **Admin crea clase:** clic en slot vacío prellena fecha/hora (buen detalle, nivel Linear) → formulario → crear. Correcto.
- **Admin reprograma clase:** 4-5 interacciones vía formulario; el estándar es 1 arrastre (I-14).
- **Check-in de una clase:** abrir clase → localizar socia → botón. Aceptable; el kiosk lo complementa. Falta el deshacer (I-4).
- **Carga cognitiva:** el sidebar de sesión mezcla bien información y acción. El problema no es el layout, son los huecos (sin undo, sin feedback de espera, acciones hover-only).

## 7. UX visual

⚠️ Evaluación desde código, pendiente de verificación en pantalla (ver §12). Lo objetivable: jerarquía tipográfica consistente y cuidada (escala 10/11/13/16/26 con pesos coherentes), sistema de tokens (`--brand`, `--muted`) bien usado en el dashboard, grid semanal con time-axis, línea de "ahora" y layout de solapes correcto — por encima de la media del sector. En contra: contraste insuficiente en metadatos (§3), foco de teclado eliminado sin sustituto, tres semánticas de color para ocupación (I-13), emojis fuera de sistema, y la página pública usa colores hardcodeados (`#1A1A1A`, `#EEEEE8`) en vez de la marca del estudio — un estudio boutique quiere SU color, no el tuyo (el header usa `PRIMARY` fijo, no `studio.color`). ❓ Espaciados, alineaciones reales y comportamiento responsive requieren la app corriendo.

## 8. Product thinking

- ¿Por qué existe esta pantalla? El calendario es EL centro operativo; justificado al 100%.
- ¿La reserva pública? Es la cara de conversión; justificada.
- Lo que no está justificado es la **asimetría de inversión**: hay spot-map, gamificación y stats decorativas, pero no hay política de cancelación ni notificaciones. Se ha construido lo demo-able antes que lo operativo. Un dueño no paga por el mapa de spots del admin; paga porque el software le llene las clases y le proteja la caja cuando alguien cancela tarde. La prioridad está invertida respecto al dolor real.
- La StatsBar de hoy (I-8) es un ejemplo de métrica decorativa: no responde ninguna pregunta accionable ("¿qué clase de la semana que viene necesita empuje?" sí lo sería).

## 9. Escalabilidad

Ya auditada en profundidad (P0-29: el calendario recorre TODO el histórico antes de recortar a la semana; P0-11: sin sincronización entre pestañas/empleados; P0-12: payload público sin límite). Nada de eso se ha corregido aún en este módulo. ✅ Añadido nuevo de esta auditoría: `crearClasesRecurrentes` dispara N inserts secuenciales sin batch ni transacción (52 semanas × 3 días = 156 llamadas; una falla y el horario queda medio creado, sin rollback ni aviso).

## 10. Datos y métricas que faltan

Sin C-2/C-3 no puedes medir: tasa de no-show por socia/clase/franja, tasa de late-cancel, tiempo medio de rellenado de plaza cancelada, conversión de lista de espera (¿cuántas promovidas asisten?), conversión del funnel público (visita → email → confirmación — hoy invisible porque el magic link rompe el rastro), fill-rate por serie. Estas cinco métricas son exactamente las que un dueño usa para decidir horario y precios. Hoy el módulo de informes construye cohortes sofisticadas sobre datos que en la base están incompletos o mal (reservas eternamente CONFIRMADAS).

## 11. Riesgos a 6 meses / 2 años

- **6 meses:** primer estudio real con lista de espera activa → incidente del bono consumido sin aviso (C-1.3) → reseña negativa del tipo "me cobran clases que no sabía que tenía". Es el peor tipo de bug: el que erosiona confianza en el dinero.
- **6 meses:** estudio monta su horario del trimestre con recurrentes → sesiones con horas corruptas en producción (C-5) → soporte manual tuyo, uno a uno.
- **2 años:** sin entidad de serie (I-3), cada mejora futura del calendario (festivos, sustituciones de instructora, cierres) se construye sobre sesiones huérfanas y se vuelve un caso especial. La deuda de modelo de datos es la más cara de pagar tarde.

## 12. Lo que NO he podido verificar (no asumo)

- ❓ UX visual real (espaciados, responsive, estados vacíos, rendimiento percibido): necesito la app corriendo. Arranca `npm run dev` y hago la pasada visual con el navegador.
- ❓ Si los emails de Resend salen de sandbox (la auditoría CTO decía que no llegaban; afecta a toda la sección de notificaciones).
- ❓ Comportamiento del kiosk y su interacción con el check-in del calendario.
- ❓ Si existe alguna promoción de lista de espera vía cron/webhook que no haya encontrado (busqué en `app/api/cron` y no aparece — pero lo dejo señalado).

---

## 13. Roadmap del módulo

**Crítico — esta semana:**
1. Borrar las dos promesas falsas de la UI (2 min) y, acto seguido, construir los 3 emails transaccionales: promoción de espera, cancelación de clase, recordatorio (C-1).
2. Fix del timezone en recurrentes: un solo formato (UTC ISO con Z) en ambos caminos + test (C-5).
3. Barrido no-show: cron que pasa CONFIRMADA→NO_ASISTIO al cerrar la clase + toggle manual en el sidebar (C-3).
4. Deep-link del magic link a la sesión elegida (C-6).

**Muy importante — este mes:**
5. Política de cancelación configurable (ventana, devolución de bono sí/no, late-cancel) (C-2).
6. Gate de derechos al reservar, configurable por estudio (C-4).
7. Decisión sobre la firma: evidencia real (PNG+metadata) o checkbox (C-7).
8. Undo de check-in (I-4), feedback de "fue a lista de espera" al añadir socia (I-6), acciones visibles en touch (I-5).
9. Entidad de serie recurrente + editar/cancelar "esta y futuras" (I-3), con creación en batch transaccional.

**Importante — este trimestre:**
10. Conflictos de sala/instructora al crear/editar (I-1) y validación de aforo al editar (I-2).
11. Página pública como Server Component con payload mínimo cacheado (I-9, y cierra P0-12).
12. Selección de spot por la socia en la reserva (I-12) — tu mejor diferenciación visible con el menor coste.
13. Unificar semántica de color de ocupación (I-13), marca del estudio en la página pública, accesibilidad AA.
14. Arreglar atribución de referidos pública (I-10) y posición de espera visible (I-11).

**Mejoras futuras:** drag & drop para reprogramar, vista mes/lista, confirmación de plaza promovida con expiración ("tienes 2h"), WhatsApp para avisos de espera (canal dominante en España), festivos/ausencias de instructoras.

**Descartado:** firma manuscrita tal como está; el segundo camino de recurrentes; stats decorativas de "hoy" en semanas futuras (sustituir por stats de la semana visible).

## 14. Puntuaciones (escala: 10 = Apple)

| Apartado | Nota | Justificación en una línea |
|---|---|---|
| Corrección funcional | **4** | Aforo atómico bien resuelto (+), pero 3 promesas falsas en UI, TZ corrupto en recurrentes y estado fantasma (−). |
| Flujo admin diario | **6** | Crear clase y check-in correctos; reprogramar, undo y feedback de espera por debajo del estándar. |
| Flujo socia existente | **7** | 2 clics, limpio. Le falta spot y posición de espera para ser 8-9. |
| Flujo socia nueva (conversión) | **3** | 8+ pasos con pérdida de contexto en el momento de máxima intención. Es el peor flujo del módulo y el más caro. |
| UX visual (desde código) | **7**❓ | Sistema tipográfico y grid muy por encima de la media; contraste, foco y consistencia de color lo bajan. Pendiente de pasada en pantalla. |
| Product thinking | **5** | Prioridades invertidas: lo demo-able antes que la protección de caja del cliente. |
| Modelo de datos del módulo | **4** | RPCs atómicos excelentes (+); sin series, sin no-show, sin política de cancelación en el esquema (−). |
| Escalabilidad | **3** | Sin cambios desde la auditoría anterior (P0-29, P0-11, P0-12 siguen). |
| Datos/métricas accionables | **4** | Las 5 métricas que un dueño necesita para decidir horario no se pueden calcular hoy. |
| Diferenciación del módulo | **4** | El spot-map (tu carta vertical) no llega al cliente final; el resto es paridad incompleta con incumbentes. |

**Regla de oro aplicada:** ¿lanzarían Apple, Stripe, Linear o Notion un calendario que promete notificaciones que no envía y una lista de espera que cobra bonos sin avisar? No. Y no lo lanzarían no por perfeccionismo, sino porque saben que la confianza en un software de reservas se pierde exactamente ahí: donde el sistema toca el dinero y la palabra dada.

---

*Siguiente módulo cuando lo indiques. Recomendación del comité: antes de pasar a otro módulo, ejecuta los puntos 1-4 del roadmap crítico — son días de trabajo, no semanas, y convierten el core de "miente" a "cumple". Para la pasada de UX visual en pantalla, arranca `npm run dev` y seguimos.*
