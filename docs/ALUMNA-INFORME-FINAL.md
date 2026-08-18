# Alumna — informe final

Cierre del encargo de auditoría, rediseño y reparación. El diagnóstico está en
[`AUDITORIA-ALUMNA.md`](./AUDITORIA-ALUMNA.md); esto es lo que se hizo con él.

Nueve fases, once PRs, todos en `main`.

---

## Bugs corregidos, por lo que le costaban a una socia

### Podían destruir o falsear sus datos

**«Mis datos» guardaba campos vacíos encima de los reales** (#1180). El
formulario fotografiaba el perfil al montar y el fichero no tenía ni un
`useEffect`. Si se abría sin socia cargada —lo que pasa cuando su token ya no
vale y el navegador todavía cree que hay sesión— los seis campos salían vacíos y
«Guardar» los enviaba así.

**El perfil enseñaba un historial inventado** (#1204). «Pilates Reformer · Mié 3
· Asistida», «Reformer fuerza · Vie 29 · No asistida» estaban escritos a mano en
el JSX, y los veía cada socia de un estudio con Oliva, Bloom o Noir como si
fueran sus clases.

### La app no respondía o mentía

**El portal no pintaba NINGÚN aviso** (#1207). El árbol real era pantalla +
barra + hojas: `<Toast>` solo lo montaba la previsualización de temas. Todos los
avisos se descartaban en silencio — y `notify(error)` también, así que **un
fallo era indistinguible de un éxito**. Toda la disciplina de «no anunciar nada
sin que el servidor lo confirme» se apoyaba en un mensaje que no se pintaba.

**El kit se quedaba congelado en `welcome`** (#1176). `mandaLaRuta` escribía su
excepción por exclusión, y el estado inicial del store tampoco es una ruta: desde
el primer render la URL dejaba de gobernar. Sin barra de pestañas y sin
responder, con el Inicio pintándose por un fallback — así que no parecía roto,
parecía muerto.

**Ningún botón acusaba el toque** (#1184). `is-pressable` solo declaraba la
transición; el estado hundido colgaba de `.is-pressed`, una clase que no pone
nadie.

### Funciones que no existían aunque lo pareciera

**Favoritas no guardaba nada** (#1194). El corazón escribía en `localStorage` y
guardaba el id de la SESIÓN; el backend guarda `tipo_clase_id`. Marcar «el
Reformer del martes» se apagaba solo al cambiar de semana, y el servidor no se
enteraba nunca. Y no había pantalla: el acceso rápido lanzaba un aviso con el
número.

**«Historial de clases» llevaba a la Agenda** (#1201), y la consulta solo
devolvía `ASISTIDA` — así que ni con pantalla habría sido un historial.

**No se podía añadir ni quitar la tarjeta** (#1203). Añadir tenía endpoint desde
hacía tiempo y nadie lo había cableado; quitar no tenía backend en absoluto.

**Lo que una socia podía hacer con su cuenta dependía del TEMA** (#1204). Los
tres «perfiles» no eran variantes de estilo: eran tres pantallas distintas. Con
Oliva/Bloom/Noir no había forma de llegar a sus datos, ni a su método de pago,
ni de cerrar sesión.

### El Inicio no era el que se diseñó

**El saludo salía al pie** (#1168). `ordenDelInicio` mandaba al final todo bloque
sin ficha en el editor, sin distinguir «la propietaria no ha opinado» de «no
puede opinar».

**Y los bloques nunca se habían publicado**: `studio_layout.publicado` estaba a
`null` y el portal pintaba la lista por defecto. ⚠️ Publicarlos ahí no habría
servido: el estudio cuelga de una cadena y el layout efectivo vive en
`cadenas.layout_config`.

---

## Componentes creados o unificados

| Qué | Por qué |
|---|---|
| `ClassRow` única, eje `row_style` | Había tres formas de la misma fila por tres puertas, y dos las elegía la pantalla con banderas ajenas (la de Sereno con una bandera de la **tira de días**) |
| `CuentaFilas` | Una sola fuente de lo que toda socia puede hacer con su cuenta. La forma sigue siendo de cada tema; el contenido ya no puede divergir |
| `filaDeClase` extraído del view model | Para que Favoritas use exactamente la misma fila que el horario, en vez de una copia que se parece hasta que una cambie |
| `ErrorState` | Vacío y error son cosas distintas: enseñar el vacío cuando la red falla le dice que no tiene reservas cuando sí las tiene |
| `Avatar` con foto | La foto real de la instructora, sobre el monograma; si no carga, el monograma sigue debajo y el encuadre no se mueve |
| Pantallas `Favoritas`, `Historial` | No existían |
| Escala de apilado (`--z-*`) | Diez `z-index` sueltos y la barra sin ninguno |

**No se unificó a propósito**: `FilaAgenda` y la tarjeta del Inicio no son la
misma fila con otro traje; forzarlas pediría tantas banderas que saldría peor.

---

## Backend

**Un solo endpoint nuevo en todo el plan**: `DELETE /api/public/tarjeta`. Todo lo
demás se resolvió con endpoints que ya existían y nadie había cableado.

- La identidad sale del **JWT**, nunca del body.
- Se limpia la **base antes que Stripe**: al revés, un detach correcto con
  escritura fallida dejaría una tarjeta que el portal enseña y que ya no se puede
  cobrar — el peor de los dos estados.

`historialAsistidasPublico` se amplió a `CANCELADA`/`NO_SHOW` con su estado. ⚠️
Eso obligó a filtrar «Completadas» de la agenda a `ASISTIDA`: sin ese filtro una
clase cancelada aparecería como completada.

---

## Rendimiento

**No se optimizó nada, y es deliberado.** El compromiso era medir contra el build
antes de tocar, y no se pudo: `npm run build` falla en este worktree por dos
paquetes de Stripe que faltan en un `node_modules` **compartido** con worktrees
donde había otras sesiones trabajando.

**Un hallazgo retirado**: la petición duplicada de `studio-data` que medí **no
existe en producción**. En el montaje hay una sola llamada; las dos eran
StrictMode duplicando el efecto en desarrollo.

**Pendiente y sin medir**: el view model (662 líneas) se recalcula con
`[state, cfg, datos]`, y `state` incluye el aviso — enseñar un aviso recalcula
clases, agenda, historial y planes. Es cierto leyendo la lista de dependencias,
pero no se reescribe el fichero más ocupado del kit sin medir antes y después.

---

## Lo que quedó fuera, y por qué

- **Valoraciones de instructora** (§9, §10). Las capturas del tema no las llevan
  en ninguna pantalla, y la tabla `valoraciones` tiene **dos filas en toda la
  base de datos**, las dos de 5. Enseñar «5,0 ★» con una valoración es el
  porcentaje sin respaldo que ya costó un bug.
- **Rediseño de los accesos rápidos** (§8). No aparecen en **ninguna** de las dos
  capturas del Inicio: las dos están recortadas y se cortan en el botón «Ver
  clase». Rediseñarlos sería inventar una interpretación.
- **Esqueletos por pantalla**. El de `PortalShell` ya coincide casi con
  `03-skeleton-carga.jpg`; lo que falla es que usa la paleta del portal viejo.
  Cablearlo obliga a tocar el gate que protege de leer «0 reservas» como dato
  real, y eso merece su propio PR.

---

## Riesgos abiertos

1. **Nada de esto se ha probado contra Stripe real.** No hay modo test
   configurado en este entorno. El primer alta y la primera retirada de tarjeta
   hay que verlas en un estudio de pruebas antes de fiarse con clientas reales.
2. **`/api/stripe/setup-tarjeta` acepta `socioId` del body** y solo valida que
   esa socia sea del estudio: no comprueba que quien llama sea ella. Viene de
   antes y está documentado como decisión propia. Tocar la autenticación de un
   endpoint de dinero merece su propia revisión.
3. **Un test flaky que cuesta un relanzamiento por PR**: `portal-bonos-compras`
   («la flecha vuelve a Bonos») falló en tres PRs seguidos —uno de ellos sin
   tocar un solo test— y pasó al relanzar las tres veces.

---

## Fase 10 — QA

### La suite

CI corre la suite completa en cada PR desde el **build de producción**, con 12
particiones. Los once PRs de este encargo pasaron los 16 checks. Correrla en
local contra `next dev` no aporta nada y tarda ~25 min: cada ruta se compila
dentro de la prueba, que es justo el motivo por el que este repo movió CI al
build.

### Recorrido como usuaria, en navegador

Lo que CI no puede hacer. **Cero errores de JavaScript en todo el recorrido.**

| Flujo | Resultado |
|---|---|
| Inicio → Clases → Agenda → Perfil | Las cuatro pestañas responden |
| Clases | 7 días, **día activo marcado**, 4 filtros, filas del día |
| Agenda | Semana / Mes / Lista, etiquetas `L M M J V S D` |
| **Reservar** | Detalle → «Reservar» → **«¡Reserva confirmada!»** → la barra sigue puesta |
| **Cancelar** | «Reservada» → «¿Cancelar esta reserva?» con la política **real** del estudio («gratis hasta 6 horas antes»), no el 6 fijo del prototipo |
| Perfil | Las seis filas del suelo presentes |

⚠️ Aquel «ningún día marcado en Clases» que quedó abierto en la fase 2 era del
**banco de pruebas**, no de la pantalla: aquí sale marcado.

### Revisión de callejones y datos inventados

- **Ninguna pantalla sin salida.** `BonoActivado` tiene sus botones de destino y
  `Calendar` lleva barra.
- **No queda contenido de muestra en pantallas reales**: sin nombres propios,
  clases ni importes escritos a mano fuera de los ficheros de datos de la
  previsualización.

### Lo que este QA NO cubre

- **Stripe real**: sin modo test en este entorno, el alta y la retirada de
  tarjeta no se han ejercitado contra Stripe.
- **iOS Safari**: WebKit de Playwright no es Safari de iOS. Lo que dependa de
  gestos o del portapapeles sigue habiendo que mirarlo en un móvil.
- **Rendimiento**: sin build local no hay cifras (ver arriba).
