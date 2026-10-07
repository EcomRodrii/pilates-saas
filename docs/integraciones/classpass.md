# ClassPass: cómo está montado

Estado a 7-oct-2026. ClassPass no tiene API abierta: hemos pedido acceso como partner y, hasta que contesten, se
trabaja **a mano**. El estudio publica plazas en su panel de ClassPass, ClassPass le avisa por correo de cada venta y
recepción la apunta en la clase (**Añadir → ClassPass**): ocupa su plaza, no gasta bonos ni pasa por los cobros y sale
en la lista con la etiqueta de la plataforma (`reservar_plaza_externa`, igual que USC y Wellhub).

## Las plazas que se ceden a ClassPass quedan APARTADAS

Decisión del fundador del 7-oct-2026 (migr `20261007164222_classpass_aparta_plazas`). Antes, las plazas cedidas eran
un **techo compartido**: si las alumnas llenaban la clase por la app, ClassPass seguía vendiendo sus N plazas y el
estudio se encontraba con gente de más. Ahora, mientras ClassPass no las venda, nadie las coge desde Tentare.

La regla vive en UN sitio, `plazas_apartadas(sesión, para_origen)`:

```
apartadas = Σ, por cada plataforma que aparta (hoy solo CLASSPASS), encendida y que no es quien reserva,
            de max(0, cupo − vendidas), mientras now() < inicio − X horas. Después, 0.
```

- **cupo**: `cupo_plataforma` (la excepción de la sesión y, si no hay, la del tipo de clase). Sin cifra, no aparta nada.
- **vendidas**: sus reservas CONFIRMADA o ASISTIDA. Sus ventas gastan SUS plazas; lo vendido de más no devuelve nada.
- **X**: `plataforma_ajustes.liberar_horas_antes` (0–72). Se pregunta al encender ClassPass en Conexiones («¿Hasta
  cuántas horas antes de la clase se puede reservar en ClassPass?»). Sin respuesta, 0: apartadas hasta que empieza la
  clase. Nunca sobreventa.
- Sesión cancelada o tipo de clase que exige autorización (ClassPass no puede venderlo): 0.
- Qué plataformas apartan: `plataformas_que_apartan()` en SQL y `PLATAFORMAS_QUE_APARTAN`
  (`lib/plataformas/apartadas.ts`) en TS. Un test cruza las dos. USC y Wellhub van por API y ven la ocupación al momento:
  no apartan.

**Se calcula al leer**: ningún cron «libera» nada. Lo único periódico es dar a la lista de espera las plazas que se
acaban de liberar (ver abajo).

### Quién la aplica

| Dónde | Qué hace |
|---|---|
| `evaluar_reserva` (y por ella `reservar_plaza`) | App, /reservar, widget, API y mostrador: las apartadas cuentan como ocupadas → completa o lista de espera |
| `promocionar_siguiente_espera` | Una plaza que se libera y es de ClassPass vuelve a ClassPass: no sube a nadie de la cola |
| `resolver_reserva_pendiente`, `aceptar_oferta_lista_espera` | Lo mismo al aprobar una pendiente o aceptar una oferta |
| `reservar_plaza_externa` | ClassPass usa las suyas; USC y Wellhub no (`AFORO_LLENO_APARTADAS`, que llega a su API como «clase completa») |
| App de la alumna, /reservar, widget | Las plazas libres que se enseñan restan las apartadas (`aforoApartadas` en la respuesta pública) |
| Cobro a una invitada sin ficha (`comprobarPlazaAntesDeCobrar`) | Si no se pueden leer las apartadas, **no se cobra** |
| Aviso de hueco libre (marketing) | Resta las apartadas; si no se pueden leer, 503 |

Las cinco funciones solo suman las apartadas a las ocupadas justo antes de comparar con el aforo. Lo vigila
`lib/plataformas/apartadas-contrato.test.ts`.

Fuera a propósito: **las clases fijas** (`materializar_plazas_fijas_interno`). Son un derecho preaprobado y se reservan
al crear la sesión, antes que cualquier venta.

### En el panel

- **Hoja de la clase**: «Quedan N, apartadas para ClassPass hasta las HH:MM». Recepción no usa una apartada
  directamente (decisión del fundador): primero la cierra en ClassPass y después pulsa **«La he cerrado en ClassPass:
  liberar 1»**. `POST /api/plataformas/liberar-apartada` (permiso de gestionar el calendario; el estudio sale de la
  sesión, nunca del cuerpo) llama a `liberar_plaza_apartada`, que con el candado de la sesión baja en 1 el cupo de ESA
  clase. Solo libera lo que está apartado en ese momento (`NADA_APARTADO` si no queda nada) y deja una línea en Actividad.
- **Tipos de clase → plazas por plataforma**: el texto dice la verdad según lo encendido (ClassPass aparta; USC y
  Wellhub comparten el techo).
- **Configuración → Conexiones** (solo la propietaria): la pregunta de X al encender ClassPass, y «Cambiar» después.
  La RLS deja escribir `plataforma_ajustes` a quien gestiona la sede (propietaria y gerencia); recepción la lee.

### La lista de espera, cuando se liberan

`sesiones_con_plazas_liberadas(ventana)` devuelve las clases cuya hora de liberar acaba de pasar y que tienen cola y
hueco. Va en el job de pg_cron que ya existía (`lista-espera-ofertas-expirar`, cada 5 min), con el predicado ampliado,
y su ruta llama a `barrerColasConPlazaLiberada` (`lib/lista-espera/plazas-liberadas.ts`), que sube a la cola con
`promocionar_espera_de_sesion` hueco a hueco. ⚠️ El predicado del job y la ruta usan la misma ventana (15 min): cambiar
una es cambiar la otra (lo comprueba el test de contrato).

### Vuelta atrás

`create or replace function public.plazas_apartadas(text, text) ... select 0` devuelve todo al techo compartido sin
tocar nada más.

## Pendiente

- **API de ClassPass**: cuando den acceso, las ventas entrarían solas y ClassPass vería nuestra ocupación al momento.
  Entonces dejaría de hacer falta apartar.
- Si un estudio vende a la vez en ClassPass (a mano) y en USC o Wellhub (por API), lo que publicamos a USC
  (`bookingCountUsc`) y a Wellhub (`total_booked`) todavía no resta las apartadas de ClassPass: su app puede enseñar un
  hueco que al reservar contesta «completa». El candado es la base de datos, así que no hay sobreventa, pero se ve mal.
  Hoy no afecta a nadie (USC y Wellhub no están encendidos por API).
