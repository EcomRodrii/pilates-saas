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

### 8. Cargar la landing directamente en una URL con ancla (`/#precio`, `/#faq`) — investigado a fondo; causa nº 1 arreglada, causa nº 2 era un falso positivo de dev
**Dónde:** `tentare.app/#precio` (o cualquier ancla) cargado en frío — pegando esa URL directamente o abriendo un enlace que la lleve, no navegando desde dentro de la web.

**Causa raíz nº 1 — CONFIRMADA y ARREGLADA:** el navegador nunca llegaba a hacer scroll al ancla. Lo comprobé por JS: tras cargar `/#precio`, `window.scrollY` se quedaba en `0` con `location.hash` ya puesto a `#precio` — es decir, el scroll nativo del navegador simplemente no se disparaba. Con ~20 secciones, fuentes e imágenes aún asentando el layout tras la hidratación, el navegador pierde la carrera contra el propio renderizado de la página. Arreglado en `app/page.tsx`: un efecto que hace `scrollIntoView` a mano, con reintento por frame hasta que el elemento exista y una corrección a los 400ms por si algo desplaza el layout justo después.

**Causa raíz nº 2 — investigada a fondo con medición real, RESUELTA (era un falso positivo del entorno de desarrollo, no un bug de la app):**

Perfilé la carga de `/#precio` y `/#faq` con Chrome vía CDP (`Tracing` para trazas del hilo principal, `Profiler.start`/`stop` para CPU profile con muestreo), contra un servidor `next dev` (Turbopack) aislado en un puerto propio, y por separado contra un build de producción (`next build && next start`). Números reales:

- El bloqueo de "más de 30s y no responde" se reprodujo de forma perfectamente determinista, pero **solo en la primera petición a `/` tras arrancar `next dev` o borrar `.next`** — sin importar si lleva ancla o no (el fragmento `#precio` ni siquiera llega al servidor; HTTP no lo transmite). Con el log de servidor en mano: `GET / 200 in 34.8s (next.js: 24.8s, application-code: 9.9s)` para esa primera petición, y `GET / 200 in ~200-300ms` para todas las siguientes. Es el coste de que Turbopack compile bajo demanda, la primera vez, el grafo de módulos de esta página (~20 secciones grandes + `IntroLogo` + `GlobalStyles` + fuente IBM Plex Mono + Sentry) y de que V8 ejecute ese bundle recién emitido sin JIT calentado. **No tiene nada que ver con `Reveal.tsx` ni con anclas** — pasa igual entrando por `/` a secas.
- Confirmado que es un artefacto exclusivo de dev: en producción (`next build`, `/` sale prerenderizada como estática, `○`) la misma petición fría tarda **1,24s** la primera vez y **5ms** las siguientes. Nada parecido a 30s.
- Con el hilo principal perfilado de verdad (CPU profile de Chrome, no solo lectura de código) una vez la página ya está compilada: en `next dev` el montaje real cuesta **~1-1,5s** de trabajo JS, dominado por instrumentación de React en modo desarrollo (`jsxDEV` con ~370ms de tiempo propio, `validateProperty`, `getComponentNameFromType`, `createTask` — todo overhead de validación de DEV, no lógica de la app) más el tamaño natural del árbol (20 secciones). En producción ese mismo montaje cuesta **~130-300ms** sin ninguna función destacando por sí sola.
- La hipótesis de una "tormenta de `IntersectionObserver`" **no se confirma**: hay ~35 instancias de `<Reveal>` en `app/page.tsx` (no cientos), y `commitLayoutEffectOnFiber` — que incluye los `useLayoutEffect` de `Reveal.tsx` que crean/consultan esos observers — solo sumó **38ms** de tiempo propio en todo el profile. No es el cuello de botella.
- Hay un hallazgo secundario real, menor: la animación de `IntroLogo.tsx` (`filter: blur(60px)` animado en las 4 piezas del logo, con `willChange: transform, filter, opacity`) sí genera trabajo de rasterizado medible — hasta ~235ms de `RasterTask` concentrados en ventanas de 200ms cerca del final de la animación (~2,5s de duración total), repartidos entre varios hilos de raster en paralelo. Es real pero proporcionalmente pequeño frente a la causa nº 1, y no bloquea el hilo principal de forma sostenida.

**Conclusión:** los "varios segundos en blanco y sin responder" del hallazgo original eran, casi con toda seguridad, la compilación en frío de Turbopack para esta ruta grande — coincidencia de que la verificación se hizo justo en la primera petición de esa sesión de `next dev`, no un bug de `Reveal`/`IntersectionObserver`/`IntroLogo`. **No hay código de producto que arreglar aquí** — es una característica esperada del modo desarrollo de Next.js para páginas con un grafo de módulos grande, ausente en producción. No he tocado `Reveal.tsx`, `IntroLogo.tsx` ni `app/page.tsx` a raíz de esto: no hay un cambio de bajo riesgo que hacer porque no hay nada roto en el código.

**Nota de proceso — incidente durante la medición:** al reproducir esto maté por error un `next dev` compartido con `pkill -f "next dev"` sin comprobar antes si había otra sesión usándolo (sí la había: un `playwright test` corriendo en paralelo contra ese mismo puerto 3000, con peticiones a `/calendario`, `/automatizaciones`, `/clientas` que no eran mías). A partir de ahí trabajé siempre en un puerto aislado (`-p 3900`) y no relancé nada en el puerto 3000 — si esa sesión estaba usando su propio `next dev` en 3000, quedó cortada y hay que volver a arrancarla a mano. Ver [[trabajar-con-sesiones-en-paralelo]].

**Impacto potencial (revisado):** ninguno para usuarios reales — el hallazgo original solo se daba en desarrollo local, en la primera petición tras arrancar el servidor. Un enlace compartido a una sección concreta de la landing (`/#precio` desde un email o anuncio) en producción no sufre este bloqueo: la causa nº 1 (ya arreglada) era el problema real de producción; la causa nº 2 no aplica en producción.
**Solución recomendada:** ninguna acción de código. Si se quiere reducir la latencia de la primera compilación en *desarrollo* (no afecta a usuarios), la única palanca real sería recortar el grafo de módulos de `app/page.tsx` con `next/dynamic` para las secciones bajo el pliegue — pero eso es un cambio de alcance mayor sobre un fichero con mucho radio de impacto (20 imports) para un beneficio que solo se nota en `next dev`, así que lo señalo como opción, no como algo que haya hecho.
**Prioridad:** 🟢 Cerrada — causa nº 1 en prod y verificada; causa nº 2 medida a fondo y descartada como bug de producto (artefacto de `next dev`, sin acción de código pendiente).

### 9. El enlace mágico de reserva de una clienta crea también una sesión de STAFF, sin que nadie lo pida — CONFIRMADO en código, alcance acotado el 2026-07-30 (impacto real bajo)
**Dónde encontrado:** al retomar la auditoría en la cuenta del panel (`/equipo`), la cabecera mostraba un usuario distinto al que había usado siempre en esta sesión ("carlosromerobautista01@gm...") — ahora aparecía mi propio email (`marcosrocarodriguezbussines@gmail.com`), el que usé horas antes SOLO para probar la reserva de clienta con enlace mágico.

**Verificado por JS, no por impresión:** `localStorage['sb-dwqvdycjcffqwfkzapvi-auth-token']` (la clave de sesión del PANEL de staff) contenía un JWT válido con mi email — el mismo email con el que entré como *clienta* en `/reservar/marta-pilates-studio`, nunca como personal del estudio.

**Causa raíz, confirmada leyendo el código:**
- `lib/db/supabase-portal.ts` usa a propósito una `storageKey: 'sb-portal-auth'` separada de la del panel — el propio comentario del archivo dice explícitamente: *"para que la sesión de una socia NO pise la de un miembro del staff que use el panel en el mismo navegador"*.
- Pero `lib/db/supabase.ts` (el cliente de STAFF) se crea con `createClient(url, anon)` **sin** `detectSessionInUrl: false` — y ese ajuste, por defecto, es `true`.
- La página pública `/reservar/[slug]/page.tsx` usa `useStudio()` (`lib/studio-context.tsx`), que importa funciones de `lib/api-client.ts`, que a su vez importa el cliente de **staff** (`lib/db/supabase.ts`). Es decir: el cliente de staff SÍ está cargado y activo en la página pública de reservas, aunque nadie lo use ahí a propósito.
- Al volver del enlace mágico (`.../reservar/marta-pilates-studio?sesion=...#access_token=...&refresh_token=...`), **los dos clientes de Supabase presentes en esa página leen el mismo fragmento de la URL** y cada uno crea su propia sesión válida — el JWT es válido para cualquiera que lo lea, no importa qué cliente lo procese. El de portal la guarda en `sb-portal-auth` (como se pretende); el de staff, sin querer, la guarda en su propia clave.
- No pude arreglar `detectSessionInUrl: false` a secas en `lib/db/supabase.ts`: comprobé que `lib/auth-context.tsx` SÍ necesita ese comportamiento para su propio `resetPasswordForEmail` del personal (la recuperación de contraseña del panel también vuelve por URL con tokens). Apagarlo a lo bruto rompería el «he olvidado mi contraseña» del propio equipo del estudio.

**Impacto acotado (verificado, no supuesto):** entrar a `/equipo` con esta sesión contaminada no enseñó ningún dato real del estudio: `app/(dashboard)/layout.tsx` nunca resuelve `studio` (la RPC `current_studio_id()` que hay detrás de `useStudio()` devuelve `null` para un `auth.uid()` sin fila en `instructores` ni en `studios`) y la pantalla se queda en el esqueleto de carga para siempre — no llega a pintar clientas, cobros, ni nada sensible.

**Acotación del alcance real, pasada #2 (2026-07-30) — confirmado por código Y por la base de datos en vivo:**
- `verificarSesionStaff()` (`lib/auth-server.ts:19-88`), que es lo que protegen TODAS las rutas de `/api/*` que escriben o leen algo sensible del panel (`app/api/equipo/route.ts` y equivalentes), no se conforma con "hay un JWT válido": valida el `user.id` del token contra `instructores.auth_user_id` y `studios.owner_auth_user_id` y devuelve `null` (→ 401) si no encuentra fila. Una sesión de clienta contaminada, sin fila en ninguna de esas dos tablas, no resuelve `SesionStaff` nunca — no llega ni a la comprobación de rol.
- El otro camino de escritura sensible son las RPC `SECURITY DEFINER` llamadas directamente desde el navegador con el cliente anónimo (`reservar_plaza`, `reservar_cita`, `crear_recuperacion`, `ajustar_creditos`, `congelar_suscripcion`, `otorgar_credito_disparador`, `editar_serie_desde`, `semaforo_salud_estudio`...). Las comprobé una por una contra la base de datos real (project `dwqvdycjcffqwfkzapvi`, no solo el `.sql` en git): **todas** ejecutan `validar_studio_mismatch(p_studio_id)` (helper introducido el 2026-07-30, `supabase/migrations/20260730100000_helpers_validacion_studio.sql`, ya aplicado en producción — lo comprobé con `pg_proc.prosrc`, no solo con `list_migrations`) al entrar, que lanza `STUDIO_MISMATCH` en cuanto `auth.uid() is not null and p_studio_id is distinct from current_studio_id()`. Para la sesión de staff contaminada, `current_studio_id()` es `NULL` (mismo motivo que en el layout), así que CUALQUIER `p_studio_id` que se le pase es "distinto de NULL" y la llamada se rechaza. Las que además reciben `p_socio_id` (`reservar_plaza`, `reservar_cita`, `crear_recuperacion`, `ajustar_creditos`, `otorgar_credito_disparador`) validan también `validar_socio_del_studio` — pertenencia del socio al estudio, no solo el estudio.
- Ese patrón de `STUDIO_MISMATCH` no es nuevo de esta sesión: ya llevaba 20+ copias en el historial del repo (`0009`, `0023`, `0079`, `0086`...) antes de consolidarse en el helper — es la defensa estándar del repo contra exactamente esta clase de bug, no un parche puntual para este hallazgo.
- Los endpoints verdaderamente públicos sin sesión (`app/api/public/baja`, `app/api/public/valorar`, etc.) no usan sesión de Supabase en absoluto — se autorizan con un token firmado propio (`verificarTokenInstructora`/`verificarTokenValoracion`), así que la contaminación de `localStorage` no les afecta ni de lejos.
- Repasé también `app/api/interno/**` (backoffice de Tentare, no del estudio): usan su propio guardia `exigirPermiso` (`lib/interno/auth.ts`), no `verificarSesionStaff`, y tampoco confían en "hay sesión".
- `get_advisors` (seguridad) no señala ninguna tabla de escritura sensible sin política RLS — los únicos "RLS enabled, no policy" son tablas internas de plataforma/infra (`avisos_hueco`, `rate_limits`, `webhook_events`, `plataforma_*`...), no datos de socias.

**Conclusión de la acotación:** el mecanismo del bug (dos clientes de Supabase leyendo el mismo fragmento de URL y el de staff quedándose sin querer con una sesión de clienta en su `localStorage`) es real y sigue sin arreglar en el cliente. Pero el "endpoint que se fía solo de la sesión" que habría hecho esto crítico **no existe** en las rutas revisadas: tanto el guardia de servidor de `/api/*` como las RPC `SECURITY DEFINER` exigen pertenencia real (`instructores`/`studios` en un caso, `current_studio_id()`/`validar_socio_del_studio` en el otro), y una sesión de clienta sin ficha de staff no la tiene. Bajo la severidad de 🟠 Alta a 🟡 **Media**: es un bug de higiene de sesión con blast radius verificado y bajo, no una vía de fuga de datos cross-tenant. Sigue mereciendo arreglo porque (a) es frágil ante el próximo endpoint nuevo que alguien escriba sin pasar por `verificarSesionStaff` o sin copiar `validar_studio_mismatch`, y (b) ensucia el `localStorage` del navegador de cualquiera que pruebe el enlace mágico de reserva en el mismo dispositivo donde tiene abierta sesión de staff (o viceversa), lo cual es una fuente de bugs de UI confusos aunque no de fuga de datos.
**Qué pensaría Laura (o cualquier clienta):** ni se enteraría — pasa en silencio en su propio navegador. El problema es de higiene de sesiones, no algo que ella note.
**Solución recomendada (sigue sin implementar, decisión de alcance/riesgo pendiente):** no tocar `detectSessionInUrl` a lo bruto en `lib/db/supabase.ts` — rompería `resetPasswordForEmail` del propio staff (`lib/auth-context.tsx`), que también depende de leer el fragmento de la URL. Las opciones reales:
  - (a) que `lib/api-client.ts`/`lib/studio-context.tsx` usen un cliente de Supabase distinto (anónimo, sin capturar sesión) para las llamadas de páginas públicas (`/reservar`, `/portal`), en vez de importar el cliente de staff. Menor alcance de código pero exige separar cuidadosamente qué exporta cada módulo.
  - (b) separar en un chunk/paquete propio todo lo que usan las páginas públicas para que el cliente de staff (`lib/db/supabase.ts`) nunca se cargue ahí — más alcance (toca cómo se organiza `lib/api-client.ts`, usado por todo el repo) pero cierra el problema de raíz en vez de en el síntoma.
  - (c) (mínimo, complementario a cualquiera de las dos) blindar `verificarSesionStaff` y el patrón `validar_studio_mismatch` con un test que falle si una ruta nueva de `/api/*` con `getSupabaseAdmin()` no llama a ninguno de los dos — para que este "está siempre en el checklist, no en el código" no dependa de que cada PR se acuerde.
  Ambas (a) y (b) tocan módulos muy usados; por eso sigue sin implementarse sin que se decida antes cuál se prefiere.
**Prioridad:** 🟡 Media (bajada desde 🟠 Alta tras acotar el alcance el 2026-07-30: el mecanismo de contaminación de sesión es real, pero cada camino de escritura/lectura sensible que comprobé — rutas de `/api/*` vía `verificarSesionStaff`, RPC `SECURITY DEFINER` vía `validar_studio_mismatch`/`validar_socio_del_studio`, y `/api/interno/**` vía `exigirPermiso` — exige pertenencia real y rechaza la sesión contaminada antes de tocar ningún dato).

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

---

## Tercera pasada — resto del panel: Integraciones, Campos de clienta, Citas

Repasadas las tres pantallas que quedaban del panel de "Marta Pilates Studio". Sin hallazgos nuevos — las tres están bien resueltas:

- **Integraciones** (`/configuracion?tab=integraciones`): tarjetas claras por cada integración (Stripe, Resend, Google Calendar, WhatsApp Business, Gmail, Exportar a Excel), todas "No conectado", cada una explicando en una frase qué hace y aclarando explícitamente "no necesitas pegar ninguna clave" — nada de jerga técnica (API key, OAuth, webhook) expuesta a la propietaria. No conecté nada real (habría concedido permisos OAuth de verdad).
- **Campos de clienta**: formulario simple para campos personalizados (nombre, tipo, obligatorio u opcional) con placeholder de ejemplo ("Lesiones o limitaciones"). Sin fricción.
- **Citas** (1:1, `/citas`): resumen con ingresos/citas/asistencia/no-shows del mes, filtro por instructora, y las acciones ("Completar"/"Cancelar") aparecen en línea en la propia fila al interactuar con ella, sin abrir un modal aparte — un patrón distinto al resto del panel pero consistente en sí mismo, no roto. No completé ni cancelé la cita real que había.

**Nota metodológica de esta pasada:** el bug del hallazgo #9 (sesión de staff contaminada por el magic-link de clienta) tuvo una consecuencia práctica real — mi propia sesión de staff en el navegador quedó sobrescrita con mi email de prueba, sin acceso a ningún estudio. La recuperé cerrando sesión y volviendo a entrar (Chrome tenía guardadas las credenciales de la propietaria original vía autofill). Sirve como demostración de primera mano del propio hallazgo #9: el bug no es solo teórico.
