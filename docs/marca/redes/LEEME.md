# Pack de redes sociales

Todo esto sale del kit de al lado con `node scripts/exportar-redes.mjs`. No se
edita a mano: si el isotipo cambia, se vuelve a correr el script. Está en PNG
—y no en SVG— porque ninguna red social acepta vectorial al subir.

## Qué subir a cada sitio

| Archivo | Dónde |
|---|---|
| `perfil/tentare-avatar-color-1024.png` | Foto de perfil en Instagram, X, LinkedIn, Facebook, TikTok, YouTube |
| `perfil/tentare-avatar-claro-1024.png` | Igual, cuando el perfil vive sobre una cabecera oscura o el color satura |
| `perfil/tentare-avatar-oscuro-1024.png` | Igual, para interfaces en modo oscuro |
| `portadas/tentare-x-1500x500.png` | Cabecera de X |
| `portadas/tentare-linkedin-1128x191.png` | Portada de la **página de empresa** de LinkedIn |
| `portadas/tentare-facebook-1640x624.png` | Portada de la página de Facebook |
| `portadas/tentare-youtube-2560x1440.png` | Arte de canal de YouTube |
| `publicaciones/tentare-post-1080-color.png` | Publicación cuadrada (Instagram, LinkedIn, Facebook) |
| `publicaciones/tentare-post-1080-claro.png` | Igual, versión clara |
| `publicaciones/tentare-story-1080x1920.png` | Story / Reel / TikTok |
| `publicaciones/tentare-compartir-1200x630.png` | Miniatura al pegar un enlace (Open Graph, WhatsApp, Slack) |
| `logos/*.png` | Fondo transparente, para meter el logo sobre una foto o una plantilla ajena |
| `vectorial/*.svg` | Lo que se manda a una imprenta, un medio o un patrocinio |

## Tres cosas que se olvidan al subirlo

1. **El avatar lleva fondo a propósito.** Un PNG transparente como foto de
   perfil lo rellena cada plataforma por su cuenta, casi siempre en negro.
2. **Casi todas recortan el avatar en círculo.** Por eso el isotipo ocupa solo
   el 46 % del cuadrado: las esquinas están vacías porque se pierden.
3. **Las medidas son de subida, no de visualización.** LinkedIn enseña su
   portada mucho más pequeña de 1128×191, pero subir la grande es lo que evita
   que se vea remuestreada en pantallas de alta densidad.

## Lo que no está aquí

Ninguna pieza lleva texto más allá del logotipo: ni claim, ni «reserva tu
clase», ni la web. Eso se decide, no se genera — y en cuanto una pieza lleva
copy deja de servir para el mes siguiente. Si hace falta una plantilla con
mensaje, se monta sobre `publicaciones/` o sobre los PNG de `logos/`.

Tampoco están las marcas de producto (Core, Manager, Studio, Network, Interno):
son marcas internas de la app, no la cara pública. Sus SVG siguen en
`docs/marca/productos/`, y añadir cualquiera al pack es una línea más en
`scripts/exportar-redes.mjs`.
