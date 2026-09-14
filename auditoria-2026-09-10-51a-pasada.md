# Auditoria 51a - Growth Widget / Builder (embebido + CORS)

Fecha: 2026-09-10. Alcance: app/widget-bundle/**, lib/cors-widget.ts,
lib/reservar/**, app/api/public/** (las que llama el widget), app/api/widget/**,
components/configuracion/tab-api.tsx (el "Builder": Estudio -> API/Widgets),
components/configuracion/tab-crecimiento-web.tsx. Explicitamente NO se ha vuelto a
auditar el flujo de pago del widget (checkout Modo A/B, Bizum, consentimiento legal -
32a/39a pasadas) ni el barrido sistematico de RPCs SECURITY DEFINER (49a pasada).

## Resumen ejecutivo

El Growth Widget esta mejor blindado de lo que esperaba encontrar: la lista blanca de
dominios CORS (lib/cors-widget.ts) hace allowlist real por origen exacto (nunca
wildcard, nunca refleja el Origin sin comprobarlo), la autorizacion para escribir la
configuracion del Builder esta en RLS (no solo en la UI) restringida a PROPIETARIO de
su propio estudio, y el aislamiento multi-tenant del bundle embebible (cache de sesion,
Shadow DOM, postMessage con verificacion de origen+source) esta bien pensado.

Encontre un hallazgo real que no estaba cubierto por pasadas anteriores (clickjacking
sobre el panel de administracion, incluida la propia pantalla del Builder) y una
puntualizacion de diseno sobre que protege de verdad la lista de dominios del widget
(no es un control de autorizacion de escritura, solo de lectura desde navegador) que
merece documentarse para que nadie la venda como mas de lo que es. El resto de la
checklist (autorizacion del Builder, cross-tenant, secretos) queda verificado sin
hallazgos.

| # | Severidad | Hallazgo |
|---|---|---|
| 1 | ALTA (naranja) | Sin X-Frame-Options/frame-ancestors en el panel de staff - clickjacking, incluida la pantalla del Builder |
| 2 | MEDIA (amarilla) | widget_dominios_autorizados no es un control de autorizacion de escritura - un POST directo (no-navegador) a /api/public/evento ignora la lista blanca para cualquier studioId |
| 3 | VERDE | Verificado sin hallazgos: autorizacion del Builder (RLS owner_studios), CORS del widget (allowlist real), aislamiento multi-tenant del bundle |

---

## [ALTA] 1. Sin proteccion contra framing en el panel - clickjacking sobre el Builder y cualquier accion de staff

Donde: no hay ningun X-Frame-Options ni Content-Security-Policy: frame-ancestors
en todo el repo fuera de un caso puntual (lib/theme-import/cabeceras.ts, para el import
de temas ZIP, no para rutas HTTP). Confirmado:
- next.config.ts:104-113 - el unico headers() configurado es Cache-Control para
  /widget.js. Ninguna entrada para el resto de rutas.
- No existe middleware.ts en la raiz del repo.
- vercel.json no define headers.
- Ningun layout (dashboard layout, app layout) hace comprobacion window.top !== self
  ni nada equivalente en cliente.

Por que importa aqui concretamente: el propio modelo de negocio del Growth Widget
exige que ALGUNAS rutas sean embebibles a proposito (/reservar/[slug], /portal/[slug],
public/widget.js) - asi que la ausencia total de cabecera no es un despiste aislado,
es "nunca se ha puesto la cabecera en ningun sitio", lo cual dejo fuera tambien las rutas
que NO deberian ser embebibles: todo el panel de staff bajo el grupo de rutas del
dashboard (incluida Configuracion -> API/Widgets, donde vive el propio Builder de este
widget: components/configuracion/tab-api.tsx), /login, /crear-estudio.

Escenario de explotacion concreto: un atacante monta una pagina con un iframe
apuntando a https://tentare.app/configuracion?tab=api con opacity 0, superpuesto a un
senuelo ("Has ganado un premio, pulsa aqui"), posicionado en pixeles exactos sobre el
boton "Anadir" de GestionDominios (tab-api.tsx:1174-1181) con un dominio
evil.com pre-rellenado via un segundo clic disfrazado (o sobre cualquier otro boton de
una sola pulsacion del panel: aprobar una penalizacion, desconectar Stripe, borrar una
instructora...). Si consigue que la propietaria (que YA tiene sesion abierta en Tentare en
otra pestana - cookies/JWT persisten en el navegador con independencia del framing) visite
esa pagina y haga los clics del senuelo, ejecuta la accion real dentro del iframe invisible.
Clickjacking no depende de si la auth es por cookie o por Bearer token en localStorage:
el iframe carga la sesion real de la victima en su propio navegador de todas formas.

No he podido verificarlo en un navegador real (sin credenciales de sesion de staff en
este entorno, misma limitacion que otras pasadas), pero la ausencia de la cabecera es
verificable estaticamente y es una condicion necesaria y suficiente para que el vector
exista - no hay ninguna otra defensa (CSP, JS anti-framing) que lo compense.

Severidad: ALTA pero no critica - requiere ingenieria social (que la victima visite una
pagina maliciosa mientras tiene sesion abierta, y ejecute una secuencia de clics
disfrazados con precision de pixel), no es explotable de forma remota/automatica ni sin
interaccion. Pero el radio de accion cubre TODO el panel (incluida la gestion de Stripe
Connect, el cierre de caja, borrar equipo, aprobar penalizaciones economicas), no solo
el Builder.

Propuesta de fix: cabecera X-Frame-Options DENY mas Content-Security-Policy
frame-ancestors 'none' por defecto en next.config.ts headers() (o un middleware.ts
si se prefiere logica condicional), con una excepcion explicita para las rutas que SI
deben ser embebibles: /reservar/:slug*, /portal/:slug*. public/widget.js no necesita
excepcion (es un script, no un documento - la cabecera de framing no aplica a .js).

Ejemplo minimo (pseudocodigo de next.config.ts):

    headers() devuelve una lista con:
      - source '/widget.js' -> Cache-Control (ya existe)
      - source que excluya /reservar y /portal -> X-Frame-Options DENY
        y Content-Security-Policy: frame-ancestors 'none'

(Ajustar el patron para que no capture accidentalmente rutas con prefijo /reservar-*
o /portal-* si existieran y no debieran ser embebibles - revisar el arbol de rutas
antes de aplicar.)

---

## [MEDIA] 2. widget_dominios_autorizados protege la LECTURA desde navegador, no la ESCRITURA directa

Donde: lib/cors-widget.ts y todos sus consumidores (app/api/public/evento/route.ts,
studio-data, aforo, reserva, etc.).

El mecanismo, tal y como esta documentado en la propia UI (tab-api.tsx:1161-1163,
"Solo estas webs podran cargar el widget - protege contra que otro sitio lo copie sin
permiso") y en el comentario de cors-widget.ts, es CORS: el servidor solo anade
Access-Control-Allow-Origin si el Origin de la peticion esta en la lista del estudio.

Esto es correcto para lo que CORS protege de verdad: evita que la web de un tercero
clone visualmente el widget leyendo la respuesta via fetch() desde el navegador de
SU visitante. Pero CORS no impide que la peticion HTTP se ejecute en el servidor -
solo impide que un navegador deje que el JS del origen no autorizado LEA la respuesta.
Un atacante que llame directamente (curl o script, sin navegador de por medio) a
/api/public/evento con CUALQUIER studioId en el body consigue que
registrarEventoWidget escriba en widget_eventos de ESE estudio igual, sin que el
dominio este en ninguna lista blanca - porque el Origin ni siquiera se comprueba para
decidir si se ejecuta la escritura, solo para decidir que cabecera CORS devolver
(app/api/public/evento/route.ts:36-82: nunca hay un 403 por origen no autorizado, solo
la respuesta sale sin cabeceras CORS).

Impacto real: bajo. El propio comentario del endpoint ya asume esto ("fire-and-forget
... como mucho ensucia widget_eventos.socio_id", C-4 de la auditoria 29-ago) - es
analitica, no dinero ni PII sensible, y esta limitado por enforceRateLimit (120/min por
IP). El riesgo es contaminar el embudo de conversion (TabCrecimientoWeb) de un estudio
CUALQUIERA con eventos falsos, sin necesitar ni siquiera tener cuenta en Tentare. No es
explotable para leer datos de otra socia ni para escribir una reserva
(/api/public/reserva exige un JWT real cuyo socioAutenticado(...) se resuelve
server-side contra body.studioId, asi que el mismo desacople query-vs-body no escala a
account takeover ahi - verificado en app/api/public/reserva/route.ts:36-39).

No es una vulnerabilidad nueva que "arreglar" con mas CORS - es una limitacion
estructural de CORS como mecanismo (nunca es un control de autorizacion del servidor).
Lo que si merece ajustarse es la expectativa que transmite la UI: "protege contra que
otro sitio lo copie" es cierto para el caso de uso principal (que un competidor clone el
widget en su web), pero no es una defensa contra abuso directo del endpoint - eso ya lo
cubre el rate limit, no el dominio.

Propuesta: sin cambio de codigo obligatorio (el rate limit ya acota el dano y es
justamente el patron que ya usa intentos_reserva_fallidos y captcha-servidor.ts en
este repo para endpoints publicos). Si se quiere cerrar del todo, anadir una
comprobacion server-side de que body.studioId (o body.slug) existe de verdad antes de
escribir - hoy registrarEventoWidget confia en la FK de widget_eventos.studio_id para
eso (fallaria en silencio con un id inventado, no con uno real de otro estudio).
Documentar en el comentario de cors-widget.ts que el gate es "solo lectura por
navegador", para que la proxima sesion que anada un endpoint nuevo aqui no asuma que
resuelve autorizacion.

---

## [VERDE] 3. Verificado sin hallazgos

- Autorizacion del Builder (checklist #2): dbUpdateStudio (lib/supabase-data.ts:4558)
  escribe widget_dominios_autorizados y widget_builder con un update directo desde el
  navegador (sin ruta de servidor intermedia) - el candado real es la RLS owner_studios
  (supabase/migrations/0000_base.sql:3115): FOR ALL con USING (current_rol() =
  'PROPIETARIO' AND id = current_studio_id()). Un usuario de OTRO estudio no puede tocar
  la fila (RLS filtra por id = current_studio_id(), no hay forma de "cambiar" el
  studioId objetivo desde el cliente porque no viaja como parametro - la fila la decide
  el JWT). Un MANAGER o RECEPCION del MISMO estudio tampoco puede, aunque la UI lo
  ocultara: current_rol() = 'PROPIETARIO' es explicito. Coincide con las listas
  BLOQUEADO_MANAGER / BLOQUEADO_RECEPCION (lib/permisos-reglas.ts), que ya bloquean
  /configuracion entero para esos roles en el cliente - doble candado, consistente.
- CORS del widget embebido (checklist #3): origenPermitido() (lib/cors-widget.ts:14-27)
  hace dominios.includes(origin) - comparacion exacta contra una lista real en BD, nunca
  un wildcard, nunca refleja el Origin recibido sin comprobarlo. Ni siquiera pone
  Access-Control-Allow-Credentials, asi que aunque hubiera cookies de sesion no viajarian
  cross-origin - la auth del widget va por header Authorization explicito
  (portalAuthHeader()), no por cookie, evitando el patron "CORS abierto + credentials"
  que si seria critico.
- Multi-tenant en el bundle (checklist #5): CacheSesion (lib/widget/sesion-cache.ts)
  clava por (baseUrl, slug, userId) - dos widgets de estudios distintos en la misma
  pagina no comparten cache. postMessage en snippet-embed.ts valida e.origin Y
  e.source === iframe.contentWindow por cada entrada del registro compartido
  window.__tentareEmbeds, asi que dos widgets del mismo estudio en la misma pagina
  tampoco se pisan (comentario propio del fichero lo documenta como fix ya aplicado).
- Secretos (checklist #5): STRIPE_PUBLISHABLE_KEY es la unica clave que toca el
  bundle publico, y pasa por esClavePublicable() (rechaza cualquier cosa que no empiece
  por pk_) antes de usarse - no hay forma de que una sk_ acabe en el bundle servido al
  navegador.
- Rate limiting (checklist #6): todos los endpoints /api/public/** que toca el
  widget llevan enforceRateLimit (60 a 120 por minuto por IP segun el endpoint) - no hay
  ninguno sin limite. La enumeracion lenta de slugs (rotando IP) seguiria siendo posible
  para leer el catalogo publico de precios de otros estudios, pero eso es informacion que
  el propio producto expone a proposito a cualquier visitante de /reservar/[slug] - no es
  una fuga nueva, es el mismo dato por una via distinta.

## Que NO se ha auditado (fuera de alcance explicito)

- Flujo de pago del widget (checkout embebido Modo A/B, Bizum, consentimiento legal) -
  32a/39a pasadas.
- Barrido sistematico de RPCs SECURITY DEFINER - 49a pasada (otra sesion). Ninguna RPC
  propia del Growth Widget aparecio en el catalogo de get_advisors con un patron nuevo
  respecto a lo ya auditado el 2026-08-12.
- Fases 4-7 del roadmap (growth-widget-roadmap.md dice 3/7 entregadas) - no hay codigo
  de "Builder visual" mas alla de lo auditado (Estudio -> API/Widgets: elegir cual de las
  5 pantallas existentes embeber, mas personalizar color/fuente/textos congelados en el
  snippet). No hay editor de "que planes se muestran" independiente del catalogo real del
  estudio, asi que ese punto de la checklist no aplica todavia - no hay nada que auditar
  ahi porque no existe ese control granular (el widget muestra el catalogo tal cual esta
  configurado en Planes, no un subconjunto elegible aparte).
