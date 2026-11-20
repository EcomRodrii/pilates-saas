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

## 2. La ruta elegida (10 pasos)

Orden del camino a la primera reserva, el mismo que el de un estudio de Pilates en la vida real
(el sitio → quién → qué → cuándo → a qué precio → cómo se cobra → que se vea suyo → traer gente).

| # | Paso | Qué es (una frase) | Se marca con | Se puede saltar |
|---|---|---|---|---|
| 1 | Salas | El espacio donde das clase; su aforo es el máximo de plazas | alguna sala | no |
| 2 | Instructoras | Quien da cada clase, aunque seas tú | alguna instructora | no |
| 3 | Tipos de clase | Reformer, Mat…: se define una vez y sirve para todo el horario | algún tipo de clase | no |
| 4 | Horario | Las clases en el calendario, sueltas o repetidas cada semana | alguna clase programada | no |
| 5 | Tarifas | Clase suelta, bonos y cuotas | alguna tarifa con precio | sí |
| 6 | Cobros | Cobrar en el estudio o con tarjeta online (Stripe) | Stripe conectado | sí (cobrar en mano es válido) |
| 7 | Tu app | Logo y color: lo primero que ve tu clienta | marca personalizada | sí |
| 8 | Tus clientas | Traerlas de tu programa anterior o darlas de alta | alguna ficha | no |
| 9 | Compartir | Enlace y QR de tu app | el enlace se copió/mandó | no |
| 10 | Primera reserva | Se marca sola cuando alguien reserva | una reserva | no (sin botón) |

«Tu primera clase» (alta nueva) crea de golpe sala + instructora + tipo + clase + tarifa: quien
pasó por ahí ve los pasos 1 a 5 ya hechos. La guía ofrece ese atajo a quien no ha hecho ninguno.

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
