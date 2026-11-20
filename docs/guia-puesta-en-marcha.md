# Guía paso a paso de puesta en marcha (20-nov-2026)

Por qué existe: tras el alta, el panel solo guiaba a «crear la primera clase» y el resto de
pantallas decía «no tienes salas / instructoras / clases». Quien no sabe qué es una sala o
por qué la necesita se va. Esta guía lleva por todo lo esencial, en orden, y los estados
vacíos pasan de acusar («no tienes X») a explicar y llevar al paso que toca.

## 1. Cómo guían los grandes (patrones, no textos)

⚠️ Resumen hecho **de memoria sobre cómo se comportan los productos públicos**, no copiado ni
re-verificado hoy contra sus pantallas. Si se quiere citar a alguien en la web, hay que mirarlo antes.

| Producto | Lo que hace bien | Lo que nos llevamos |
|---|---|---|
| **Shopify** | Lista corta de «setup guide» con progreso y un solo paso abierto; cada paso dice qué es, tiene un botón que lo hace y se tacha solo | Un paso abierto a la vez, botón que lo hace, se marca con datos |
| **Stripe** | Checklist de activación con el siguiente paso siempre arriba; modo prueba para no bloquear | El «siguiente paso» siempre visible; lo opcional no bloquea |
| **Linear / Notion** | Estados vacíos que enseñan para qué sirve la pantalla y dan UNA acción | El vacío explica el concepto y lleva a la acción |
| **Mindbody / Glofox / Mariana Tek** | Orden de estudio de fitness: ubicación y salas → staff → tipos de clase → horario → precios → cobros | El orden de nuestra ruta |
| **Momence / Bsport / Eversports** | Pocas decisiones al principio, plantillas por defecto, ver la app de la alumna pronto | Defectos razonables; enseñar «lo que verá tu clienta» |

Patrones comunes:
1. **Un concepto por pantalla**, con una frase de qué es y una de por qué importa.
2. **El botón hace la cosa ahí mismo** (abre el formulario ya abierto), no manda a «buscar en Configuración».
3. **Se marca solo** con datos reales; nunca un «ya lo leí».
4. **Se puede saltar** lo que no aplica (cobrar online si cobras en mano), pero saltar no cuenta como hecho.
5. **El vacío es parte de la guía**: dice qué falta y qué paso es.
6. **En móvil es otra app**: un paso por pantalla, botón grande abajo, nada de listas largas.

## 2. La ruta (12 pasos, ordenados por dependencias)

Regla de oro: **nunca se pide una tarea sin sus dependencias**. Un paso con `requiere` sin cumplir sale
«bloqueado» y su botón lleva al paso que falta (ej.: programar clases exige sala, instructora y tipo de clase).

| # | Paso | Requiere | Se marca con (dato real) | Saltable |
|---|---|---|---|---|
| 1 | Tus datos y tu horario | – | NIF puesto | sí |
| 2 | Sala | – | alguna sala | no |
| 3 | Instructora | – | alguna instructora | no |
| 4 | Tipo de clase (plantilla, no clase en el calendario) | – | algún tipo | no |
| 5 | Reglas de reserva | – | **sin dato** (revisión) | sí |
| 6 | Reglas de cancelación | – | **sin dato** (revisión) | sí |
| 7 | Paquetes (suelta, bono, cuota) | tipo | algún paquete con precio | sí |
| 8 | Cobros (en el estudio o Stripe) | – | Stripe conectado | sí |
| 9 | Programar clases | sala, instructora, tipo | alguna clase programada | no |
| 10 | Clientas / migración | – | alguna ficha | sí |
| 11 | La app de tus clientas (marca) | – | marca personalizada | sí |
| 12 | Abre tus reservas | horario | primera reserva real | no |

«Listo para abrir» = sala + instructora + tipo + clase. Paquetes, Stripe y clientas NO bloquean (condicionales).

⚠️ **Duda documentada**: las reglas de reserva y de cancelación tienen valores de serie y no hay un «guardado»
que diga «el estudio las revisó». Por eso son *revisión*: no cuentan como hechas ni en el progreso; se cierran
con «Ya lo he revisado» (solo en este navegador). Marcarlas de verdad por dato exigiría una columna nueva
(migración): decisión pendiente. Las opciones nombradas en la guía (exigir paquete, lista de espera y su plazo,
horas de cancelación, devolver sesión/recuperación en cancelación tardía) están en `/configuracion?tab=reservas`.
Los cargos por cancelar tarde/no presentarse se activan aparte (penalización); no se describe su comportamiento.

Pendiente de las siguientes tandas: ayuda contextual ampliada, Academy por fases, analítica, seguimiento interno
de estudios atascados y Playwright.

## 3. Qué se construyó

- `lib/guia/ruta-puesta-en-marcha.ts`: la ruta pura (textos, estados, siguiente paso). Testeada.
- `/puesta-en-marcha`: pantalla paso a paso. Un paso por pantalla; en móvil, hoja a pantalla completa
  con botón fijo abajo.
- Píldora de la barra y tarjeta del Resumen: pasan a «Paso n de 10» + «Seguir» al siguiente paso.
- `AyudaDelPaso`: banda en Equipo, Configuración (salas, tipos de clase), Tarifas y Calendario que
  explica el concepto mientras el paso no está hecho.
- Estados vacíos del Calendario, Salas, Tipos de clase y Equipo: explican y llevan al paso.
- Interruptor `GUIA_PASO_A_PASO`: APAGADO de serie; `on` = todos, `estudios:<id1>,<id2>` = solo esos.

## 4. Lo que no se hizo

- Copy público (landing, /funcionalidades…): intacto.
- No se verificó contra Supabase real ni con un estudio nuevo de verdad: ver el PR.
