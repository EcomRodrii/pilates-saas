# Auditoría extrema — Laura, propietaria de estudio de pilates (52 años)

**Fecha:** 2026-07-29
**Dónde se probó:** producción real, `https://www.tentare.app`, sesión ya autenticada como estudio "Laura Pilates" (usuario `carlosromerobautista01@gm...`, estudio recién creado, 0 clientas).
**Alcance real de esta pasada:** landing pública (marketing, precio, FAQ), página 404, y el flujo completo de bienvenida/onboarding de un estudio nuevo (intro animada → wizard de 6 preguntas → resumen → panel). No llegué a auditar el resto del panel (calendario con datos, clientas, cobros, sustituciones) ni el portal de la clienta — me lo comió el tiempo verificando (y corrigiendo) el primer hallazgo. Si quieres que continúe con el resto de pantallas y con más personas, lo retomo en otra pasada.

**Corrección importante sobre el proceso:** en la primera mitad de esta auditoría reporté como bug crítico ("P0: cualquier pantalla del panel te devuelve a un vídeo de bienvenida en bucle, sin salida") algo que resultó ser un malentendido mío. Cada vez que navegaba con `navigate()` a una URL nueva remonté el componente de bienvenida desde cero (su estado vive en memoria del componente, no en localStorage), así que nunca dejé que la animación llegara al botón "Empezar". Al leer el código (`app/(dashboard)/layout.tsx` y `components/onboarding/pantalla-bienvenida.tsx`) y luego completar el flujo real con clics de ratón, el mecanismo funciona correctamente de principio a fin: intro (3 frases) → botón "Empezar" → wizard de 6 preguntas (clicables con ratón, no hace falta usar el teclado pese a la pista "pulsa 1-N") → resumen personalizado → botón "Entrar al panel" → aterriza exactamente en la página pedida. Lo dejo anotado explícitamente porque es justo el error que quiero evitar: afirmar impacto sin haberlo verificado hasta el final.

---

## Hallazgos reales confirmados

### 1. La página 404 está en inglés en un sitio 100% en español
**Dónde:** cualquier URL inexistente del dominio de marketing, ej. `tentare.app/alta` → "404 — This page could not be found."
**Cómo reproducirlo:** entra a cualquier ruta que no exista.
**Impacto:** bajo, pero rompe la promesa de "hecho en España" que la propia landing usa como argumento de venta un par de scrolls más abajo.
**Qué pensaría Laura:** "¿Esto no era una empresa española? ¿Por qué me habla en inglés de repente?"
**Comparación:** bsport/Momence/Eversports también fallan aquí a menudo (páginas de error genéricas), así que no es un diferencial negativo grave, pero sí gratuito de arreglar.
**Solución:** página 404 personalizada en español, con enlace de vuelta a inicio.
**Prioridad:** 🟢 Baja.

### 2. Fogonazo de bajo contraste en la primera carga de la landing y al saltar por ancla
**Dónde:** `tentare.app` (marketing), primera carga y al hacer clic en "Precio" del menú (ancla `#precio`).
**Cómo reproducirlo:** recargar la home, o hacer clic en "Precio"/"FAQ" del menú — durante ~1-2s el contenido aparece con muy poco contraste (como deshabilitado o "fantasma") antes de mostrarse con normalidad.
**Impacto:** bajo — se autocorrige solo, pero en una landing que se vende como premium, cualquier parpadeo se nota en los primeros 3 segundos, que es la ventana de la que habla la propia auditoría.
**Qué pensaría Laura:** "Ha tardado un poco raro en cargar, pero ya está bien."
**Solución:** revisar la animación de entrada por scroll/IntersectionObserver — probablemente no distingue "sección ya visible tras salto de ancla" de "aún no vista por scroll natural", y arranca el fade-in desde 0 en vez de saltar directo al estado final.
**Prioridad:** 🟢 Baja.

### 3. El wizard de bienvenida sugiere el teclado ("Pulsa 1-N para responder") a una persona que no lo va a usar
**Dónde:** las 6 preguntas del asistente de bienvenida tras crear un estudio.
**Cómo reproducirlo:** completa el wizard; en la parte inferior izquierda siempre pone "Pulsa 1-N para responder".
**Impacto:** ninguno funcional (el clic con ratón/dedo funciona perfectamente), pero es una pista dirigida a un público que no es Laura. Una propietaria de 52 años no va a probar a pulsar números en el teclado; simplemente hace clic, que es justo lo que ya funciona.
**Qué pensaría Laura:** no lo notaría como problema (el clic funciona), pero tampoco le aporta nada — es ruido de una persona.
**Comparación:** el resto del asistente está muy bien pensado (nota que cambia según la respuesta anterior, ej. "Alumnos, bonos y reservas de Momence" tras decir que vienes de Momence) — este detalle desentona con ese nivel de cuidado.
**Solución:** o quitar la pista en pantallas táctiles/sin teclado físico detectado, o cambiarla por algo más útil para todos ("Elige una opción").
**Prioridad:** 🟢 Baja — cosmético.

**Estado:** arreglados los 3 (404 en español, fogonazo con `useLayoutEffect` en `components/landing/Reveal.tsx`, y esta pista cambiada a "Elige una opción" en `components/onboarding/pantalla-bienvenida.tsx`).

### 8. Cargar la landing directamente en una URL con ancla (`/#precio`, `/#faq`) — investigado a fondo, PARCIALMENTE arreglado, queda un resto sin explicar del todo
**Dónde:** `tentare.app/#precio` (o cualquier ancla) cargado en frío — pegando esa URL directamente o abriendo un enlace que la lleve, no navegando desde dentro de la web.

**Causa raíz nº 1 — CONFIRMADA y ARREGLADA:** el navegador nunca llegaba a hacer scroll al ancla. Lo comprobé por JS: tras cargar `/#precio`, `window.scrollY` se quedaba en `0` con `location.hash` ya puesto a `#precio` — es decir, el scroll nativo del navegador simplemente no se disparaba. Con ~20 secciones, fuentes e imágenes aún asentando el layout tras la hidratación, el navegador pierde la carrera contra el propio renderizado de la página. Arreglado en `app/page.tsx`: un efecto que hace `scrollIntoView` a mano, con reintento por frame hasta que el elemento exista y una corrección a los 400ms por si algo desplaza el layout justo después.

**Causa raíz nº 2 — encontrada, NO arreglada, no confirmada del todo:** incluso con el scroll ya corregido (confirmé por JS que el contenido de "Precio" queda en la posición correcta, con opacidad 1), la pantalla seguía en blanco varios segundos, y en un intento una simple acción de scroll del navegador **tardó más de 30s y no respondió** — señal real de que el hilo principal se bloquea con trabajo pesado en este momento concreto (probablemente decenas de `IntersectionObserver` y transiciones CSS de `Reveal` disparándose casi a la vez al forzar el salto a una sección profunda de golpe, en vez de ir revelándose sección a sección como al hacer scroll normal). No llegué a aislar la causa exacta ni a arreglarla — sería una investigación de rendimiento aparte, no algo para resolver a ciegas en este mismo commit. Lo marco explícitamente como sin confirmar del todo — ver [[verificar-antes-de-afirmar-impacto]].
**Impacto potencial:** un enlace compartido a una sección concreta de la landing (un anuncio, un email) puede dejar a quien lo abre varios segundos con la pantalla en blanco y sin responder al scroll. Ya no se queda así para siempre (la causa nº 1 lo garantizaba antes), pero la experiencia sigue siendo mala mientras dure la causa nº 2.
**Solución recomendada:** una pasada de rendimiento específica sobre `components/landing/Reveal.tsx` y cuántas instancias se crean a la vez en esta página — encaja con lo que hace el agente `tentare-performance` de este repo. No lo he lanzado yo para no gastar sin que lo pidas.
**Prioridad:** 🟠 Alta — recomiendo una tarea aparte con tiempo dedicado a perfilar el hilo principal, no otro intento a ciegas.

---

## Lo que funciona bien (para no perder de vista el conjunto)
- El wizard de bienvenida es de los mejores flujos de alta que he visto en este tipo de producto: 6 preguntas cortas, opciones grandes tocables, progreso visible, y un resumen final que reutiliza tus respuestas para personalizar el texto ("Laura Pilates, tu panel ya está ordenado a tu medida", "Migramos tus datos de Momence..."). Esto es mejor que el alta genérica de bsport/Momence, que no suele preguntar nada y te suelta directamente en un dashboard vacío sin contexto.
- La landing responde con precisión a objeciones reales de quien migra de otro software (sección "Cambiarse sin dolor", con capturas en vivo reconociendo el CSV exacto de Eversports/Momence/Timp/Nubapp) — es un argumento de venta fuerte y concreto, no genérico.
- Tras el wizard, aterriza exactamente en la URL pedida (`/clientas`) con el estado vacío correcto ("Aún no hay clientas" + botón "Añadir primera clienta"), no en un dashboard genérico desconectado de lo que pediste.
- El modal "Nueva clase" con el estudio aún vacío detecta que faltan tipo de clase/sala/instructora, **bloquea el botón de crear** y explica exactamente qué falta con un enlace directo — que además aterriza en la sub-pestaña correcta de Configuración ("Clases y salas") con un ejemplo útil ("Reformer, Suelo, Embarazadas..."). No dejar que el usuario envíe un formulario condenado a fallar, y decirle exactamente adónde ir a arreglarlo, es un nivel de cuidado que no es nada habitual en este tipo de software.

---

## Segunda pasada — estudio con datos reales ("Marta Pilates Studio", misma cuenta)

La cuenta autenticada tiene varias sedes de prueba bajo el mismo login. Cambié a "Marta Pilates Studio" (301 clientas, calendario con 16 clases/semana, 64% ocupación) para poder auditar pantallas con contenido real en vez de un estudio vacío.

### 4. El banner "Verifactu — Próximamente" es copy fija y desfasada, no un estado real — CONFIRMADO en código y BD
**Dónde:** `/cobros` → pestaña "Facturas". Componente `components/cobros/panel-facturas.tsx:217-225`.
**Cómo reproducirlo:** entra a Cobros de cualquier estudio → pestaña "Facturas": aparece siempre el aviso "Verifactu — Próximamente. Integración con AEAT en desarrollo. Las facturas se generan automáticamente al cobrar un recibo."
**Verificación (no me quedé en "a ver si algún día lo compruebo" — lo miré):**
- En BD (`studios`), "Marta Pilates Studio" tiene `fiskaly_signer_id` y `fiskaly_client_id` en `NULL` → nunca se dio de alta en Fiskaly, así que para ESTE estudio concreto es cierto que no hay facturación real activa.
- Pero en el propio código, el banner de `panel-facturas.tsx:217` **no tiene ninguna condición** — ni mira `studio.fiskaly_signer_id`, ni ningún flag: se pinta igual para todos los estudios, tengan o no Fiskaly configurado. Y el mismo archivo usa más abajo (línea 57 y 473-487) hash y QR de cotejo reales de Verifactu para facturas que sí lo tienen — es decir, el propio código sabe distinguir "esta factura tiene Verifactu" de "esta no", pero el banner de arriba no usa esa misma información.
**Impacto:** para un estudio SIN Fiskaly configurado (como este) el mensaje da la casualidad de ser cierto, pero por accidente de datos, no porque el código lo compruebe. En cuanto un estudio SÍ tenga Fiskaly activo (según mi memoria de sesiones anteriores, esa integración ya se desplegó en producción el 26/07), seguirá viendo "Próximamente / en desarrollo" aunque sus facturas ya se estén firmando y enviando a la AEAT de verdad — un mensaje falso sobre una obligación fiscal.
**Qué pensaría Laura:** "Llevo un mes cobrando y aquí pone que la factura todavía está 'en desarrollo'. ¿Entonces qué le enseño a mi gestoría?"
**Comparación:** bsport/Momence/Eversports no dejan ese hueco de ambigüedad — o hay factura o no la hay, nunca un cartel fijo de "ya llegará" mientras el dinero ya se está cobrando.
**Solución:** condicionar el banner al estado real (`studio.fiskaly_signer_id` no nulo, o el flag que use el resto del código) en vez de un texto fijo — mostrar "Facturación automática activa" cuando ya lo esté, y reservar "Próximamente" solo para estudios genuinamente sin activar.
**Prioridad:** 🟠 Alta — no es una pérdida de dinero, pero es copy incorrecta sobre una obligación fiscal en cuanto el primer estudio con Fiskaly activo mire esta pantalla.

### 5. Fila de test con payload XSS visible en la lista de Clientas — no es una vulnerabilidad viva, pero es basura de test en un dato que un cliente potencial podría llegar a ver
**Dónde:** `/clientas`, primera fila de la lista al ordenar por nombre.
**Cómo reproducirlo:** entra a Clientas de "Marta Pilates Studio": la primera fila tiene como nombre literal `<img src=x onerror=alert(1)>Malicia "><script>alert(document.cookie)</script>` y el correo `xss-test2@ejemplo.test`.
**Verificación de seguridad:** confirmé que el payload **no se ejecuta** — aparece como texto plano en pantalla (no saltó ningún `alert()`, no hay nada en la consola). React está escapando el HTML correctamente aquí. Esto NO es una vulnerabilidad XSS activa; es un resto de un pentest o prueba de seguridad anterior sobre esta misma cuenta de demo que nunca se limpió.
**Impacto:** bajo en seguridad (está protegido), pero si esta cuenta de "Marta Pilates" se usa alguna vez para una demo comercial o una captura de pantalla, una fila con un payload de XSS a la vista transmite justo lo contrario de "empresa seria" que pide esta auditoría.
**Qué pensaría Laura:** (si viera esto en una demo) "¿Qué es esto? ¿Esto es un hackeo?"
**Solución:** limpiar las filas de test (`%test%`, `xss-test%`) de las cuentas de demo/pentest antes de usarlas para enseñar el producto a nadie.
**Prioridad:** 🟢 Baja (dato de higiene, no de seguridad).

### 6. Sustituciones (la función estrella) — funciona y es transparente sobre sus límites
**Dónde:** `/sustituciones`.
**Lo que vi:** modos de autonomía (Manual/Asistido/Autónomo/Vacaciones), aviso directo de qué instructoras no tienen disponibilidad cargada con acción "Pedirles su disponibilidad", y dos casos reales en curso:
- Una baja sin ninguna candidata disponible → ofrece "Volver a buscar", "Reprogramar a otro horario" o "Cancelar clase y avisar a las alumnas" (en rojo, claramente la opción de última instancia).
- Una baja con sustituta encontrada (65% compatibilidad) que **avisa explícitamente de sus limitaciones**: "está disponible · no ha impartido antes este tipo de clase · hace semanas que no sustituye", con un registro completo de "Lo que hemos hecho por ti" (email enviado, hora, a quién).
**No completé ninguna acción** (ni "Confirmar", ni "Cancelar clase y avisar a las alumnas", ni "Pedirles su disponibilidad") porque cada una dispara un aviso real a una instructora o alumna.
**Valoración:** esto es justo lo que la landing promete y, a diferencia de otras partes más flojas del producto, aquí el nivel de detalle y honestidad sobre sus propios límites es alto. Es el diferencial real frente a bsport/Momence/Eversports, que no tienen nada parecido.

### 7. (DESCARTADO tras leer el código) "La sesión de la clienta no persiste" — NO es un bug, es el diseño correcto
**Lo que observé primero:** tras pedir el enlace mágico y llegar hasta "Necesitas un plan o bono activo para reservar", al navegar a "Mis reservas" o recargar la página me pedía identificarme de nuevo y la cabecera mostraba "Acceder" en vez de mi nombre, pese a tener un `access_token` válido y sin caducar en `localStorage` (`sb-portal-auth`).
**Por qué parecía un bug:** confundí "estar autenticada en Supabase" (probé que controlo el email) con "ser clienta del estudio" (tener una ficha en `socios`) — son dos cosas distintas a propósito en este código.
**Lo que de verdad pasa** (verificado leyendo `lib/use-socia-session.ts`, `app/api/public/session/route.ts` y `app/reservar/[slug]/page.tsx:687`):
- El hook expone `usuarioEmail` (autenticada, aunque aún no sea socia — "walk-in que se registrará al reservar", dice el propio comentario del código) y `socia` (el perfil real, solo si ya existe una fila en `socios` vinculada a ese email).
- La cabecera y "Mis reservas" comprueban explícitamente `socia`, no `usuarioEmail` — es una decisión de diseño, no un descuido: no tiene sentido mostrar "hola, Fulanita" en la cabecera si Fulanita todavía no es clienta de este estudio.
- Mi fila en `socios` nunca se creó, confirmado por SQL (0 filas), porque el bloqueo de "necesitas un plan" cortó el flujo justo antes de crear la ficha de socia. Por eso, correctamente, seguía sin haber nadie que mostrar.
**Cómo lo confirmé antes de "arreglarlo":** estuve a punto de tocar código para un bug que no existía — igual que con el onboarding al principio de esta sesión. Esta vez leí el código de los tres archivos antes de escribir una sola línea, en vez de fiarme de lo que veía en pantalla. Ver [[verificar-antes-de-afirmar-impacto]].
**Conclusión:** no hay nada que arreglar aquí. Sí queda una mejora de UX menor y opcional (no un bug): cuando `usuarioEmail` existe pero `socia` no, la cabecera podría decir algo más específico que "Acceder" (p. ej. "Completa tu reserva") — pero es cosmético, no urgente.

**Verificación de integridad (con SQL, no solo mirando la pantalla):** el bloqueo por "necesitas un plan" no dejó ningún dato huérfano. `socios` no tiene ninguna fila para mi email ni para "Claude TEST Auditoría" (0 resultados), y la tabla `reservas` para esa sesión concreta sigue en 5 filas, las mismas que había antes de mi intento — ninguna reserva fantasma. La política de "cero escritura optimista" que ya se aplica al dinero en este repo también se cumple aquí en la reserva pública.

### Comprobación descartada: "Comunidad" en Mensajería NO es el módulo congelado
Vi una pestaña "Comunidad" dentro de `/mensajeria` y por un momento pensé que contradecía el feature-freeze de `lib/frozen-features.ts` (que congela `/comunidad` como módulo standalone). Lo comprobé antes de reportarlo: son cosas distintas — la ruta congelada es `/comunidad` (posts/likes/comentarios como red social del estudio), no esta pestaña de mensajería. No hay contradicción, no es un hallazgo.

### Lo que funciona bien aquí también
- El calendario semanal con datos reales es limpio y legible: clases coloreadas por tipo, estadísticas de ocupación/reservas/plazas libres arriba, sin ruido.
- El panel de detalle de una clase (asistentes, check-in/no-show, "Leer un pase" QR, "Buscar sustituta") reúne justo lo que se necesita en el momento, sin saltar de pantalla.
- "Buscar sustituta" es honesto: cuando las únicas candidatas libres nunca han dado ese tipo de clase, lo dice explícitamente ("Nunca ha dado esta clase") en vez de sugerir a ciegas.
- Cobros resume en una sola pantalla lo cobrado, lo pendiente, cuántas clientas deben y el ingreso medio — sin que Laura tenga que sumar nada a mano.

## Nota de proceso (importante)
No completé ninguna acción con efecto real en esta pasada (no asigné la sustituta sugerida, no cobré ni facturé nada, no creé clientas de prueba) para no escribir datos falsos ni disparar avisos reales a personas reales (instructoras, clientas) desde una cuenta de producción. El hallazgo #4 sí lo verifiqué del todo: consulta SQL sobre `studios` (Supabase MCP, solo lectura) + lectura del componente real en `components/cobros/panel-facturas.tsx` — no me quedé en "parece que..." desde el navegador.

## Siguiente paso recomendado
Dado que el arranque (landing → alta → onboarding) está en buen estado, el valor real de continuar esta auditoría está en las pantallas con datos reales: calendario con clases, cobros, sustituciones, y sobre todo el portal de la clienta final — que es donde tu propio historial de auditorías (Carmen, Cloe, feedback P2) ha encontrado la mayoría de problemas reales hasta ahora. Puedo continuar con esa pasada si quieres, usando una cuenta con datos ya cargados en vez de un estudio recién creado.
