# Marca Tentare · 50 logos + motion

Todo sale del mismo isotipo de cuatro trazados sobre una retícula de 120.
Lo único que cambia entre productos es **el color del medio disco**.

## Carpetas

```
isotipo/         6 · la marca sola, en sus seis tintas
horizontal/      3 · isotipo + palabra, en línea
vertical/        3 · isotipo arriba, palabra debajo
icono-app/       3 · placa redondeada para iOS, Android y escritorio
favicon/         1 · una sola tinta, para 16–24 px
productos/       30 · Core, Manager, Studio, Network e Interno (6 cada uno)
aplicaciones/    4 · avatar, sello, firma de correo y marca de agua
animaciones/     tentare-motion.css · las diez animaciones
redes/           PNG listos para subir a un perfil (ver redes/LEEME.md)
```

`redes/` es lo único que no se edita a mano: sale de este mismo kit con
`node scripts/exportar-redes.mjs`.

## Los colores

| Uso | Hex |
|---|---|
| Turquesa (primario) | `#4C9CB0` |
| Magenta (secundario) | `#B4537E` |
| Tinta (texto) | `#222A33` |
| Fondo claro | `#F8FAFC` |
| Fondo oscuro | `#111827` |
| Degradado de marca | `#4C9CB0` → `#B4537E`, 135° |

Color por producto, solo en el medio disco:

| Producto | Hex | |
|---|---|---|
| Core | `#4C9CB0` | de la paleta |
| Manager | `#B4537E` | de la paleta |
| Studio | `#E08A3C` | extensión |
| Network | `#4F8A5B` | extensión |
| Interno | `#566270` | grafito, a propósito: una herramienta de casa no viste color de producto |

## Cinco reglas

1. **El isotipo no se toca.** Un producto no redibuja la marca: solo cambia el color de su disco.
2. **Un solo color por producto.** Ni el tallo ni las hojas cambian nunca.
3. **La «t» la pone el isotipo, o la palabra.** En horizontal el isotipo va en línea y hace de «t»: se escribe «entare». En vertical queda encima, así que abajo va «tentare» entero con la inicial del color del disco.
4. **A una tinta manda la palabra.** En monocromo el disco pierde su color, así que ahí el producto se distingue por el nombre.
5. **Nunca por debajo de 24 px a color.** La separación de la «t» mide el 4,7 % del ancho; por debajo cae del píxel. Ahí va `favicon/tentare-favicon.svg`.

## Cómo montarlo

- **La palabra ya va en curvas.** Ningún archivo lleva `<text>` ni `font-family`: el
  logo no depende de que Quicksand ni Inter estén instaladas. Si algún día hay que
  reeditar la palabra, se rehace desde **Quicksand 600** (`entare`/`tentare`) e
  **Inter 600** (el nombre de producto), con el mismo `letter-spacing` de antes.
- **El SVG en línea, no en `<img>`.** Para animar hay que poder alcanzar cada trazado.
  Con `<img src="…svg">` el CSS no entra. En React, `import Logo from '…svg'` suele
  acabar en `<img>`: hay que incrustar el marcado, no la ruta.
- **Las piezas se identifican por clase, no por id** (`t-hoja-i`, `t-hoja-d`,
  `t-disco`, `t-tallo`, envueltas en `.t-marca`, todo dentro de un `<svg class="t-logo">`).
  Los ids no valen para esto: al montar varios logos en línea en la misma página se
  repetirían.
- **Los ids que quedan —los degradados— van con el nombre del archivo delante**
  (`tentare-core-horizontal-tg`) para que dos logos distintos no se pisen. Si vas a
  montar **el mismo archivo dos veces en una página**, dale un sufijo propio a cada
  copia (en React, `useId()`): dos ids iguales siguen siendo HTML inválido aunque el
  degradado sea idéntico.

## Motion

`animaciones/tentare-motion.css` trae las diez, cada una en su clase de estado:
`t-construccion` · `t-crecimiento` · `t-apertura` · `t-productos` · `t-cargando`
`t-confirmado` · `t-barrido` · `t-salida` · `t-cabecera` · `t-error`

Ninguna gira: girar el isotipo rompe el degradado a 135° y la lectura de la «t».
Solo dos van en bucle — cargando y cambio de producto — porque acompañan algo que dura.
Con `prefers-reduced-motion` las diez se quedan en su fotograma final.
