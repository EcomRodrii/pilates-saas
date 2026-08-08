# Por qué las funciones corren en Fráncfort

`vercel.json` fija `"regions": ["fra1"]`. No es una preferencia estética: sin
esa línea Vercel usa su valor por defecto, `iad1` (Washington), y la base de
datos está en `eu-central-1` (Fráncfort).

## Lo que se midió

Abriendo el editor de temas en producción, con la conexión ya establecida:

| llamada | duración | de la cual, esperando al servidor |
|---|---|---|
| `/api/portal-bloques` | 2483 ms | **2476 ms** |
| `/api/layout` | 2471 ms | — |
| `/api/billing/status` | 2427 ms | — |
| `/api/theme` | 2192 ms | — |
| `/api/theme/home-preview-token` | 1740 ms | — |

DNS 0 ms, TCP 0 ms, TLS 0 ms, descarga 1 ms, respuesta de 394 bytes. **Todo el
tiempo es el servidor pensando**, no la red del navegador.

Y la cabecera lo explica:

    x-vercel-id: cdg1::iad1::288m8-...

El borde recibe en París (`cdg1`) y la función se ejecuta en `iad1`. Así que
cada petición del panel hace: navegador (España) → París → **Washington** →
**Fráncfort** → Washington → París → navegador. Cada consulta a la base de
datos cruza el Atlántico dos veces.

`verificarSesionStaff` —la primera línea de CADA ruta de staff— hace un
`auth.getUser` y tres lecturas en paralelo: dos viajes de ida y vuelta antes de
que la ruta empiece su propio trabajo. A ~90 ms por travesía eso ya son ~360 ms
de puro cable, y la ruta todavía tiene que hacer lo suyo.

## Por qué `fra1` y no otra

Es donde está Supabase (`eu-central-1`), así que las consultas dejan de cruzar
el océano. Y de paso está mucho más cerca de quien usa esto, que son estudios
de Pilates en España.

## Qué NO arregla

El número de llamadas. Al abrir el editor se piden `portal-bloques` tres veces
y `billing/status` dos — eso es trabajo aparte, y esta línea no lo tapa: lo
deja más barato, que no es lo mismo.

## Cómo comprobar que sigue bien

Cualquier respuesta de `/api/*` en producción:

```js
(await fetch('/api/theme')).headers.get('x-vercel-id')
```

El segundo tramo debe decir `fra1`. Si algún día vuelve a decir `iad1`, alguien
quitó la línea o Vercel cambió el valor por defecto — y el panel entero volverá
a pagar el Atlántico en cada clic.
