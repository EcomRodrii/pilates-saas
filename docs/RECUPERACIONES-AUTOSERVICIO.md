# Recuperaciones self-service — qué da el SaaS y qué falta en la app

Contexto: «Profe, ¿puedo recuperar la clase del martes?», cincuenta veces al mes.
La promesa es que la alumna las gestione sola, dentro de las reglas del estudio,
sin que la propietaria toque nada.

## Lo que YA está hecho en el SaaS (no hay que construirlo)

**Gastarla es automático desde antes de todo esto.** `reservar_plaza` (RPC)
consume una recuperación sola cuando la alumna se topa con su límite semanal:
coge la de caducidad más cercana, la marca `USADA` y la ata a la reserva. Si no
tiene ninguna, lanza `LIMITE_SEMANAL`. La app no tiene que pedir nada especial:
reserva normal y la RPC decide.

**Devolverla también.** Si cancela esa reserva, `cancelar_reserva_plaza` le
devuelve la recuperación a `DISPONIBLE`. No hay que compensar nada a mano.

**Ganarlas, nuevo.** Un barrido semanal (lunes) otorga una recuperación por cada
hueco que la alumna dejó sin usar habiendo cancelado a tiempo. Opt-in por estudio
(`studios.recuperacion_auto_semanal`), solo para planes con límite semanal.

## Los datos que la app puede leer

Tabla `recuperaciones`:

| columna | para qué sirve en la app |
|---|---|
| `estado` | `DISPONIBLE` / `USADA` / (caducadas siguen DISPONIBLE con `caduca_el` pasado) |
| `caduca_el` | **la fecha que hay que enseñar**: «recupérala antes del …» |
| `motivo` | texto ya redactado del porqué, listo para pintar |
| `usada_en_reserva_id` | con qué reserva se gastó |
| `origen_reserva_id` | la clase que canceló y la originó |

Para «cuántas tengo»: contar `estado = 'DISPONIBLE' and caduca_el >= hoy`. Ojo,
**una caducada no cambia de estado**: sigue `DISPONIBLE` con la fecha pasada. Si
se cuentan sin filtrar por fecha, la app dirá que tiene 3 y la RPC solo le dejará
usar 1.

## Lo que falta, y es de la app

1. **Verlas.** Cuántas tiene y para cuándo caduca cada una. Hoy la alumna no
   tiene forma de saber que existen.
2. **Saber que está gastando una.** Al reservar por encima de su límite semanal
   la RPC consume una en silencio: la pantalla debería decírselo ANTES de
   confirmar, no después.
3. **El aviso de caducidad.** Una recuperación que caduca sin usarse es
   exactamente la promesa incumplida. El motor de notificaciones ya existe.
4. **El caso sin recuperaciones.** Si se topa con el límite y no tiene ninguna,
   hoy recibe `LIMITE_SEMANAL` a secas. Merece un mensaje que explique cuándo
   vuelve a tener hueco.

## Dos cosas que conviene NO reimplementar en la app

- **No calcular «puede reservar» en cliente.** El límite semanal y el consumo de
  la recuperación los resuelve la RPC con bloqueo de fila. Una copia en la app se
  desincroniza y promete plazas que no existen.
- **No contar recuperaciones sin filtrar `caduca_el`.** Ver arriba.
