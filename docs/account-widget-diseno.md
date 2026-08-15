# Fase 4 — Cuenta de la clienta dentro del widget embebido: diseño técnico

> Estado del repo auditado: `origin/main` @ `5aaaebfc` (15 ago 2026). Este documento
> es una fotografía para decisión, no código — la implementación es un paso
> posterior.
>
> Continúa `docs/booking-engine-architecture.md` (Fase 0, §3.1/§3.3) y
> `docs/auth-widget-diseno.md` (Fase 2, ya implementada en `main`) y coexiste con
> `docs/checkout-embebido-diseno.md` (Fase 3, sin implementar) sin depender de
> él — esta fase es de solo lectura + dos escrituras ya existentes (cancelar,
> aceptar oferta, editar perfil), nunca mueve dinero.

## 0. Corrección sobre lo que decía el brief — verificado, no asumido

El brief pedía diseñar "ver/gestionar reservas, bonos, membresías y perfil sin
salir de la web del estudio", dando a entender que hace falta construir todo
eso de cero. **No es así, y cambia radicalmente el alcance real de esta
fase**:

- **El payload que el widget YA pide en cada carga ya trae todo lo necesario.**
  `fetchPublicStudioData` (`lib/db/supabase-data-admin.ts:399-721`) hace el
  bloque `socia.*` (suscripciones, reservas — TODAS, no solo las futuras,
  recibos, facturas, plazas fijas, recuperaciones, el `Socio` completo)
  **incondicionalmente si hay `member` autenticado** (línea 645:
  `if (!member) return { ...base, socia: null }`). El flag `liviano` (que el
  bundle Modo B sí pasa, `usar-datos-widget.ts:58`) **solo** recorta el
  catálogo del estudio entero (vídeos, recompensas, niveles, contenido de
  portal — líneas 466-507); **nunca** el bloque `socia`. Es decir: cada visita
  autenticada al widget de hoy ya descarga `pub.socia.reservas` (todas, con
  `CANCELADA`/`ASISTIDA`/`NO_ASISTIO` incluidas — `resRes` en la línea 660 no
  filtra por estado), `pub.socia.suscripciones` (línea 660, sin filtrar por
  `estado` tampoco) y `pub.socia.socio` (la ficha completa) — y **los tira a la
  basura**. `useDatosWidget` (`lib/widget/usar-datos-widget.ts:60-80`) solo
  usa `pub.socia.reservas` para enriquecer el mapa de aforo de los slots
  visibles (línea 66), y ni siquiera toca `pub.socia.suscripciones`/`.socio`.
- **Cancelar una reserva y aceptar una oferta de lista de espera ya están
  resueltos y ya son CORS-aware.** `onCancelar`/`onAceptarOferta`
  (`usar-datos-widget.ts:122-139`) llaman a `/api/public/reserva`
  (`accion:'cancelar'`) y `/api/public/aceptar-oferta-espera`
  (Fase 5, PR #1109) — ambos ya montados en `<ReservaCalendario>`
  (`app/widget-bundle/main.tsx:123-124`) para cancelar/aceptar sobre el slot
  abierto. El único trabajo real es exponer esos MISMOS handlers sobre una
  **lista** de reservas en vez de un slot único.
- **Editar el perfil ya tiene endpoint, ya es CORS-aware, y ya define su
  propia lista blanca de campos.** `POST /api/public/socio` con
  `accion:'actualizar'` (`app/api/public/socio/route.ts:66-73`,
  `actualizarSociaPublica` en `lib/db/supabase-data-admin.ts:2502-2533`)
  deriva el `socioId` del JWT (nunca del body) y solo escribe
  `CAMPOS_SOCIA_EDITABLES = { telefono, nif, avatar, fotoUrl,
  fechaNacimiento, direccion }` — deliberadamente **sin** `nombre`,
  `apellidos` ni `email` (línea 2500: "no tocar tags, lead_stage, activo,
  referido_por ni datos de Stripe" — y el propio mapa tampoco los incluye).
- **Modo A (`/reservar/[slug]`) ya tiene una pestaña "Mis reservas"**
  (`app/reservar/[slug]/page.tsx:1718-1812`, `TAB_IDS` en la línea 226) con
  próximas/pasadas y botón "Cancelar" — pero **no** bonos, no suscripciones, no
  perfil. Y el paso "reserva confirmada" empuja explícitamente a la socia
  fuera del widget: *"Tus clases y tus bonos están en tu portal"*
  (`page.tsx:2184-2205`, con enlace a `/portal/[slug]/login` o `/acceso`). Esa
  frase es exactamente lo que esta fase debe poder dejar de decir para
  bonos/perfil (reservas ya se quedan, desde antes de esta fase).
- **Modo B (`app/widget-bundle/main.tsx`) no tiene ningún punto de entrada a
  "mi cuenta" hoy.** El único control de sesión es un enlace "Iniciar sesión"
  en la esquina, y **desaparece del todo** en cuanto hay `socia`
  (`main.tsx:79`: `{!socia && (...)}` envuelve toda la barra superior) — una
  socia ya identificada no tiene ningún sitio al que ir salvo reservar.

**Consecuencia real para el alcance de esta fase**: no hace falta ningún
endpoint nuevo, ninguna tabla nueva, ninguna query nueva de servidor para el
alcance de lectura+cancelar+aceptar-oferta+editar-perfil-básico. El trabajo
es: (1) dejar de descartar en el cliente datos que el servidor ya manda, (2)
un componente de presentación nuevo, compartido entre Modo A/B con el mismo
criterio que `<ReservaCalendario>`, y (3) un punto de entrada nuevo en cada
modo.

---

## 1. Alcance exacto de esta fase

**Dentro:**
- **Mis reservas**: próximas / pasadas / canceladas / en espera (mismo
  desglose en cuatro que `PortalReservasView`), con cancelar (reservas
  futuras `CONFIRMADA`) y aceptar oferta de lista de espera (`LISTA_ESPERA`
  con `ofertaExpiraEn`) — ambos ya wired, ver §0.
- **Mis bonos y membresías**: saldo por bono (restantes/total, barra de
  progreso, caducidad), lista si hay varios (se gastan por orden de
  caducidad), plan mensual (estado "Activo"/próxima renovación). Sin
  contratar/comprar uno nuevo desde aquí (§6).
- **Mi perfil**: nombre/apellidos/email en solo lectura (identidad, no
  editable — ver §0 y §6), y edición de los campos que YA acepta
  `actualizarSociaPublica`: teléfono, NIF, fecha de nacimiento, dirección,
  foto/avatar.
- **Cerrar sesión.**

**Fuera de esta fase, explícito — ver §6 para el razonamiento de cada uno:**
recibos/facturas, métodos de pago/tarjeta guardada, comprar/renovar un
bono, editar nombre/apellidos/email, pausar/reanudar/dar de baja una plaza
fija, "reprogramar" una reserva, preferencias de notificaciones.

---

## 2. Qué UI se reutiliza — y qué NO, con el porqué

**No se reutilizan `PortalReservasView`/`PortalBonosView`/`PortalPerfilView`
tal cual.** Los tres importan `useStudio()` (`portal-reservas-view.tsx:32`,
`portal-bonos-view.tsx:14`, `portal-perfil-view.tsx:22`) — el mismo problema
que ya documentó la Fase 0 para todo lo del portal instalable
(`booking-engine-architecture.md` §3.1): `useStudio()` exige un
`<StudioProvider>` ancestro y arrastra ~15 dominios de negocio + un import de
`next/navigation` al bundle. Eso es aceptable dentro de `app/portal/[slug]`
(Next completo, dentro del árbol de contexto) pero rompe el bundle esbuild de
Modo B por el mismo motivo exacto por el que `usar-sesion-widget.ts`/
`usar-datos-widget.ts` ya existen como versión mínima de
`use-socia-session.ts`/`useStudio()` (comentario explícito en
`usar-sesion-widget.ts:6-12`).

**Sí se reutiliza toda la lógica PURA de negocio que ya está extraída y sin
dependencia de contexto:**
- `bonoActivo()` (`lib/bonos-portal.ts:12-...`) — calcula restantes/total/
  progreso/caducidad/mensual a partir de `Suscripcion[]`/`PlanTarifa[]`/
  `TipoClase[]`/`socioId`, sin ningún hook. Es exactamente lo que
  `PortalBonosView` usa (línea 113-116) y lo que la tarjeta de bonos del
  widget necesita — se llama igual en los dos sitios.
- `calcularEstadoSuscripcion`/`textoCaducidad` (`lib/suscripcion-estado.ts`,
  usadas por `bonos-portal.ts`).
- `lib/booking-logic.ts` (`esCancelacionTardia`, ya usado en
  `page.tsx:1796` para el aviso de cancelación tardía en Modo A).

**Decisión de arquitectura: un componente de presentación nuevo,
100% compartido entre Modo A y Modo B, mismo criterio que
`<ReservaCalendario>`** (`components/reserva/reserva-calendario.tsx`, ya
"candidato directo a paquete compartido" según la Fase 0). No una
reimplementación distinta por modo, no una extracción a medias de las vistas
del portal:

```
components/cuenta-widget/
  mi-cuenta.tsx          — shell con las 3 secciones (reservas/bonos/perfil) + tabs internas
  mis-reservas-lista.tsx — próximas/pasadas/canceladas/espera, cancelar, aceptar oferta
  mis-bonos.tsx          — tarjeta de saldo + lista si hay varios (usa bonoActivo())
  mi-perfil.tsx          — datos de solo lectura + formulario de los 5 campos editables
```

Todo recibe los datos por props (nunca un hook de contexto dentro): mismas
`Reserva[]`/`Suscripcion[]`/`PlanTarifa[]`/`Socio`/`TipoClase[]`/`Sala[]`/
`Instructor[]` que ya usan `PortalReservasView`/`PortalBonosView`/
`PortalPerfilView`, más los handlers `onCancelar`/`onAceptarOferta`/
`onActualizarPerfil`/`onLogout`. La única diferencia entre modos es QUIÉN
llama a este componente y de dónde saca las props — igual que
`<ReservaCalendario>` hoy: `/reservar/[slug]/page.tsx` lo monta con datos de
`useStudio()`, `main.tsx` lo monta con datos de `useDatosWidget` extendido
(§3).

**Qué se descarta explícitamente de las vistas del portal, a propósito**: el
lenguaje visual completo de `portal-design.ts` (serif display, cristal con
blur, sombras verdes) — el widget usa el sistema más pequeño
`lib/reservar-publico-tokens.ts`/`MODO_TOKENS` que ya usan
`<ReservaCalendario>`/`FormularioAccesoWidget`, coherente con que Modo A/B
son "un calendario embebido", no una app instalable de marca. Mismo criterio
que ya documentó la Fase 0 para Apariencia (§3.5: "Modo A/B usan un sistema
deliberadamente más pequeño y separado").

---

## 3. Datos: extender `useDatosWidget`, cero fetch nuevo

`useDatosWidget` (`lib/widget/usar-datos-widget.ts`) ya recibe el payload
completo de `pub.socia` en cada `recargar()` (línea 58-83) y hoy solo se
queda con lo que necesita `<ReservaCalendario>`. Se añaden tres campos
derivados del MISMO `pub` que ya llega, sin tocar `cargarDatosPublicos` ni el
endpoint:

```ts
// dentro de recargar(), junto al resto de setDatos(...)
misReservas: pub.socia?.reservas ?? [],       // TODAS las de la socia (§0):
                                                // CONFIRMADA/CANCELADA/ASISTIDA/
                                                // NO_ASISTIO/LISTA_ESPERA — el
                                                // desglose en 4 pestañas lo hace
                                                // el componente, igual que
                                                // PortalReservasView (misma
                                                // lógica, distinto árbol)
suscripciones: pub.socia?.suscripciones ?? [], // YA se cargaba (línea 76) pero
                                                // no se exponía fuera del hook
socio: pub.socia?.socio ?? null,               // ficha completa: nombre,
                                                // apellidos, email, teléfono,
                                                // NIF, fechaNacimiento,
                                                // dirección, avatar, fotoUrl
```

**Ojo con el `datos.reservas` que YA existe** (línea 74, usado para calcular
aforo de los slots): es el array MEZCLADO estudio-entero + las propias
enriquecidas, pensado para capacidad — no sirve para "mis reservas" (pierde
el `estado` real de las canceladas de OTRAS sesiones y no lleva
`sesionId`→sesión resuelta para pasadas). `misReservas` es un campo nuevo y
separado, no una reinterpretación del que ya hay.

`onActualizarPerfil` se añade junto a `onReservar`/`onCancelar`/
`onAceptarOferta` (mismo patrón, mismo helper `postPublicoWidget`):

```ts
const onActualizarPerfil = useCallback(async (cambios: Record<string, unknown>) => {
  if (!socia?.socioId) return { ok: false, error: 'No autenticada.' } as const;
  const r = await postPublicoWidget(`${baseUrl}/api/public/socio`, {
    accion: 'actualizar', studioId: datos.studioId, cambios,
  }, { studioId: datos.studioId });
  recargar();
  return r;
}, [socia, datos.studioId, recargar, baseUrl]);
```

Para Modo A, que ya vive dentro de `<StudioProvider>`, no hace falta ningún
hook nuevo: `page.tsx` ya tiene `suscripciones`, `socios`, `reservas`,
`updateSocio` de `useStudio()` (línea 261-262) — el shell nuevo se monta ahí
con esas mismas props, sin pasar por `useDatosWidget`.

---

## 4. Dónde vive en cada modo

**Modo A**: se añade `'cuenta'` a `TAB_IDS`
(`app/reservar/[slug]/page.tsx:226`) como **quinta pestaña nueva**, no se
reutiliza/reconvierte `'misreservas'`. Dos motivos concretos, no
preferencia:
1. `TAB_IDS` valida `?tab=` de enlaces YA en producción (comentario de la
   línea 224: *"Estudio > Enlaces genera un `<iframe ?embed=1&tab=…>`
   distinto por cada una"*) y de notificaciones con `deep_link` guardado —
   el mismo problema que ya obligó a mantener viva la redirección de
   `/mi-plan` → `/bonos` en el portal (`app/portal/[slug]/mi-plan/page.tsx:1-17`,
   por 24 filas reales en producción). Añadir un id es seguro; repurponer uno
   existente no lo es.
2. "Mis reservas" y "Mi cuenta" (bonos+perfil) son ya conceptualmente
   distintos incluso en el portal instalable (rutas separadas
   `/reservas` vs `/bonos` vs `/perfil`) — juntarlos todos bajo
   "misreservas" sería forzar tres pantallas en una pestaña pensada para una.

La pestaña nueva usa el `mi-cuenta.tsx` de §2 con sub-tabs internas
(Reservas/Bonos/Perfil) en vez de tres tabs de nivel superior más —
`page.tsx` ya tiene 4 tabs horizontales (línea 1212); una quinta ya aprieta
en móvil (`cq()` container queries), y las 4 originales cubren dominios
distintos del negocio (clases/citas/reservas/info del centro) mientras que
reservas+bonos+perfil son todas "sobre MÍ" — coherente agruparlas.

**Modo B**: no hay tabs ni router — es un calendario embebido en la web del
estudio, no una página. Se sustituye el `{!socia && (...)}` de
`main.tsx:79` por un control que SIEMPRE se pinta cuando hay `socia`
autenticada: un botón "Mi cuenta" en la misma esquina donde hoy vive
"Iniciar sesión", que abre `mi-cuenta.tsx` en el MISMO patrón de hoja
(`BottomSheet`-like) que `<ReservaCalendario>` ya usa para el detalle de un
slot (`reserva-calendario.tsx:540-...`, `SlotSheet`) — no una ruta nueva, no
un segundo `createRoot`. Mismo componente `mi-cuenta.tsx` que Modo A, montado
dentro de una hoja en vez de un panel de pestaña.

```tsx
// main.tsx, dentro de WidgetApp()
{socia && (
  <button onClick={() => setCuentaAbierta(true)} ...>Mi cuenta</button>
)}
{cuentaAbierta && (
  <HojaCuentaWidget onClose={() => setCuentaAbierta(false)}>
    <MiCuenta
      socio={socio} suscripciones={suscripciones} misReservas={misReservas}
      tiposClase={...} salas={...} instructores={...}
      onCancelar={onCancelar} onAceptarOferta={onAceptarOferta}
      onActualizarPerfil={onActualizarPerfil} onLogout={logout}
    />
  </HojaCuentaWidget>
)}
```

`logout` no existe hoy en `useDatosWidget`/`useSesionWidget` — se añade
`supabasePortal.auth.signOut()` (idéntico a `use-socia-session.ts:118-122` y
a `useAuthWidget.logout` ya existente en `usar-auth-widget.ts:94`, que de
hecho ya podría reutilizarse tal cual sin duplicar).

---

## 5. Cancelar y "reprogramar"

**Cancelar**: se reutiliza `onCancelar(reservaId)` sin cambios de firma
(§0/§3) — la única pieza nueva es la superficie que lo llama: en vez de un
slot único abierto (`SlotSheet`), una fila dentro de la lista de "Próximas"
de `mis-reservas-lista.tsx`, mismo criterio de "solo si `CONFIRMADA` y en el
futuro" que ya usa `PortalReservasView` (`portal-reservas-view.tsx:323`) y
Modo A (`page.tsx:1780`, `isFuture`). Se mantiene el aviso de cancelación
tardía que Modo A ya calcula con `esCancelacionTardia` (`page.tsx:1793-1798`)
— la pieza que `PortalReservasView` NO tiene y que sí sería una regresión
perder si se copiara solo esa vista sin más.

**"Reprogramar" — verificado, no existe en el repo.** Grep sobre
`reprogramar`/`RPC.*reprogram` en `lib/`, `app/api/`, `supabase/migrations/`:
cero resultados. `PortalReservasView` (el equivalente del portal instalable,
que lleva meses en producción) tampoco lo tiene — solo "Cancelar reserva"
(línea 380-392). No hay ninguna RPC ni endpoint que combine
cancelar+reservar de forma atómica. **Se descarta construirlo en esta
fase**: sería una pieza nueva de verdad (semántica propia: ¿cuenta como
"tardía" a efectos de penalización? ¿se pierde el spot elegido? ¿qué pasa si
la nueva sesión está llena?), no una extensión trivial del patrón existente,
y ni el panel ni el portal la tienen hoy — construirla aquí primero
invertiría el orden natural (el panel/portal la necesitarían primero). El
camino de hoy (cancelar, luego reservar de nuevo desde "Clases") es el mismo
que ya ofrece el portal instalable — coherente, no una regresión.

---

## 6. Explícitamente fuera de alcance — con el porqué de cada uno

- **Recibos y facturas.** Los datos YA están en el payload
  (`pub.socia.recibos`/`.facturas`, `supabase-data-admin.ts:706-707`) pero se
  quedan fuera: una factura real es un PDF (`lib/facturacion` /
  Veri*Factu), y el mecanismo de descarga hoy vive detrás de sesión de panel/
  portal, no de un endpoint `/api/public/*` CORS-aware — traerlo exigiría
  decidir cómo se sirve un PDF cross-origin desde el dominio del estudio
  (`Content-Disposition`, CORS sobre un blob) sin que sea trivial copiar el
  patrón JSON del resto de esta fase. Además es territorio más cercano a
  Fase 3/9 (dinero/API pública) que a "ver mi cuenta". Se documenta el
  hueco, no se resuelve aquí.
- **Métodos de pago / tarjeta guardada.** Ligado 1:1 a Stripe Elements
  embebido, que es exactamente lo que Fase 3 tiene pendiente de sus dos
  spikes (`checkout-embebido-diseno.md`) — no hay nada que mostrar de forma
  útil sin ese trabajo (hoy ni siquiera existe Payment Element en el repo,
  confirmado en la Fase 0 §3.4).
- **Comprar/renovar un bono desde Mi Cuenta.** Mismo motivo: es checkout,
  no cuenta — Fase 3.
- **Editar nombre/apellidos/email.** `actualizarSociaPublica` los excluye
  DELIBERADAMENTE del whitelist ya existente (§0) — no es un hueco a
  rellenar, es una decisión de seguridad/identidad ya tomada en otro PR:
  cambiar el `email` de una socia tiene implicaciones sobre `auth.users` de
  Supabase (identidad de login) que no puede resolverse con un simple
  `UPDATE socios`, y nombre/apellidos son datos de la ficha que hoy solo
  edita el estudio salvo en el portal instalable
  (`portal-perfil-view.tsx:102-109`, que sí los deja — pero ese camino corre
  sobre `updateSocio()` de `useStudio()`, con sesión de panel/portal, no
  sobre `/api/public/*`). Ampliar el whitelist público es una decisión propia
  que no se toma de pasada en esta fase — si se quiere, es un cambio a
  `actualizarSociaPublica` explícitamente pedido y revisado por
  `tentare-seguridad`, no una consecuencia automática de "mostrar el
  perfil".
- **Pausar/reanudar/dar de baja una plaza fija.** Existe como autoservicio
  YA CONSTRUIDO — pero solo dentro de `useStudio()`
  (`pausarPlazaFijaPropia`/`reanudarPlazaFijaPropia`/
  `darDeBajaPlazaFijaPropia`, únicos callers en `lib/studio-context.tsx`), sin
  ningún endpoint `/api/public/*` equivalente. A diferencia de
  cancelar/aceptar-oferta/actualizar-perfil (§0, ya CORS-aware), esto SÍ
  necesitaría un endpoint nuevo con su propia lista blanca — trabajo real,
  no solo "conectar lo que ya hay". Se deja fuera de esta fase y documentado
  como el único hueco de backend real que dejaría este diseño si se quisiera
  llevar el autoservicio de plaza fija también al widget.
- **"Reprogramar"**: ver §5.
- **Preferencias de notificaciones** (`/portal/[slug]/preferencias`). Función
  de portal instalable sin pedir en el brief, sin overlap con "ver mis
  reservas/bonos/perfil" — no se añade por iniciativa propia.

---

## 7. Seguridad — confirmado contra el código real, no asumido

- **El `socioId` nunca sale del cliente.** Los tres caminos de escritura que
  usa esta fase (`/api/public/reserva` accion:`cancelar`,
  `/api/public/aceptar-oferta-espera`, `/api/public/socio`
  accion:`actualizar`) resuelven el `socioId` con `socioAutenticado(userId,
  studioId)` a partir del JWT verificado (`verificarUsuarioSupabase`), nunca
  del body — mismo patrón ya auditado en Fase 0 (§3.1) y Fase 2 (§7). Este
  diseño no añade ninguna vía nueva de escritura, solo nuevas superficies de
  UI sobre las tres que ya existen.
- **Lectura**: `fetchPublicStudioData` solo devuelve el bloque `socia` si
  `emailOk` (el email del JWT coincide con el de la ficha,
  `supabase-data-admin.ts:653-655`) — la identidad se prueba dos veces
  (existencia + email), igual que en cualquier otro camino público ya
  auditado.
- **CORS**: cero endpoints nuevos → cero entradas nuevas en
  `lib/cors-widget.ts`. Los cuatro que esta fase usa
  (`public-studio-data`, `public-reserva`, `public-aceptar-oferta-espera`,
  `public-socio`) ya están en la lista blanca por dominio
  (`studios.widget_dominios_autorizados`) desde PR #1090/#1109.
- **Rate limiting**: ya dimensionado para el patrón de uso real de estos
  endpoints (`public-studio-data` 60/60s, `public-reserva`/
  `public-aceptar-oferta-espera`/`public-socio` 20/60s cada uno,
  `app/api/public/*/route.ts`) — "abrir Mi Cuenta" es una recarga del mismo
  `studio-data` que ya se pide en cada carga del widget (no una petición
  nueva), y cancelar/aceptar-oferta/editar-perfil son acciones ya
  contempladas en esos límites por Fase 2/5. No hace falta tocar ningún
  límite para el volumen de esta fase.
- **Nada de lo anterior cambia si algún día se decide construir el
  autoservicio de plaza fija (§6) o exponer recibos/facturas** — esas dos
  piezas, si se hicieran, necesitarían su propia revisión de
  `tentare-seguridad` al definir su whitelist, como cualquier endpoint nuevo.

---

## 8. Riesgos — ninguno requiere spike de validación

A diferencia de Fase 2 (storage partitioning/Safari real) y Fase 3
(Payment Element en Shadow DOM), esta fase no introduce ningún mecanismo de
plataforma nuevo — reutiliza sesión, CORS, fetch y hojas modales que ya
están medidos en producción. Los dos puntos a vigilar, ninguno bloqueante:

1. **Tamaño del bundle.** `mi-cuenta.tsx` + sub-componentes se suman al
   mismo `main.tsx` sin code-splitting (deuda ya señalada en Fase 0 §5.5,
   sin línea base documentada). Mismo riesgo ya heredado de Fase 2, no
   agravado de forma distinta — medir el delta de `widget.js` antes/después
   sigue pendiente en general, no específico de esta fase.
2. **E2E del bundle real.** Mismo hueco que ya señalan Fase 0 (§5.7) y
   Fase 2 (§9.6): ningún test carga `public/widget.js` compilado. Esta fase
   necesita al menos un spec que abra "Mi cuenta" sobre el bundle real y
   verifique que cancelar/aceptar-oferta llaman de verdad a la red (mismo
   criterio del punto ciego #1 de este repo: "un test de camino de fallo sin
   contador de peticiones es hueco", `.claude/tentare-os.md`) — reutilizar
   el andamiaje de `e2e/reservar-el-servidor-dice-no.spec.ts` en vez de
   rehacerlo.

---

**Resumen de una frase**: diseño de "Mi cuenta" dentro del widget (Fase 4 del
Booking Experience Engine) — cero endpoints nuevos porque el payload que el
widget ya descarga en cada carga trae reservas/bonos/perfil completos sin
usar (`fetchPublicStudioData`, `socia.*` no gateado por `liviano`), cancelar
y aceptar-oferta ya wired desde Fase 5, editar perfil ya resuelto por
`actualizarSociaPublica` con su propia lista blanca deliberada (sin
nombre/apellidos/email); el trabajo real es un componente de presentación
nuevo compartido Modo A/B (mismo criterio que `<ReservaCalendario>`) y un
punto de entrada por modo — quinta pestaña en Modo A, hoja modal sobre "Mi
cuenta" en Modo B.
