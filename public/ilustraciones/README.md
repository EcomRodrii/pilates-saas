# Ilustraciones de /primeros-pasos (y error del panel)

Origen: set **Bangalore – Free** de [Streamline](https://www.streamlinehq.com/illustrations/bangalore)
(licencia **CC BY 4.0** — uso comercial libre CON atribución; cada SVG conserva
su `<desc>` con el crédito, y este README es la atribución en código; si algún
día se monta una página de créditos, Streamline debe figurar). Sustituyen a las
unDraw anteriores (2026-08-20): un solo set con figuras en movimiento — encaja
con un producto de Pilates — frente a las unDraw genéricas, y en el estilo
"elegante casi abstracto" del set entero, no piezas sueltas de estilos mezclados.

Recoloreadas de la paleta original a la de marca **editando los hex directamente**
(mismo método que ya se usó con unDraw — el export recoloreado del sitio es de
pago). El mapa exacto, por si hay que traer otra pieza del set:

| Original (Bangalore) | Marca |
|---|---|
| `#120071` (línea índigo) | `#343825` (oliva tinta) |
| `#6153bd` (violeta) | `#5A6142` (verde medio) |
| `#fecfc4` (melocotón/piel) | `#E9CFB4` (arena suave) |

Se les quita también el `width`/`height` fijo de 420 (queda solo el `viewBox`):
el tamaño lo pone la clase del consumidor.

| Archivo | Pieza original en Bangalore |
|---|---|
| `hero.svg` | Marketing Target |
| `configuracion.svg` | Office Desk |
| `pagos.svg` | Payment With Card |
| `automatizaciones.svg` | Digital Ads Performance |
| `equipo.svg` | About Us About Our Team |
| `portal.svg` | Social Media Discussion |
| `completado.svg` | Success |
| `error.svg` | We Got A Problem |

Usadas en `app/(dashboard)/primeros-pasos/page.tsx` y (`error.svg`) en
`app/(dashboard)/error.tsx`. ⚠️ Solo superficies de MARCA TENTARE: nunca en el
portal ni en el widget de reservas (marca blanca del estudio — ahí una
ilustración en oliva/arena sería la marca equivocada).
