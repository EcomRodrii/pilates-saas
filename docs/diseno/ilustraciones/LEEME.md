# Ilustraciones de Tentare — encargo y cómo pasármelas

Aquí están **todas las ilustraciones que hoy pinta el producto**, como SVG sueltos que se abren en cualquier editor (Figma, Illustrator,
Affinity, Inkscape). Son un punto de partida: cámbialas o rehaz las que quieras y pásame los archivos con **el mismo nombre**.

## Cómo pasármelas
1. Guarda cada SVG con el nombre EXACTO de la tabla (ej. `vacio-agenda.svg`).
2. Déjalos en `public/ilustraciones/` (o pásamelos por aquí) y dime cuáles. Yo añado su clave a `lib/ilustraciones/manifiesto.ts`; desde ese
   momento mandan sobre las dibujadas en código. Si no subes una, se sigue usando la de código.
3. Una sola cosa por archivo: nada de varias escenas en el mismo SVG.

## Reglas de estilo (para que encajen entre sí y con el producto)
- **Plano, sin degradados** (el producto no los usa en ilustración), trazo de **1,5 px** redondeado en tinta `#222A33`, rellenos suaves.
- **Disco suave** detrás (`#ECE6DC`, 120 px de diámetro) y **2–3 objetos** encima. Un solo punto de acento pequeño (turquesa `#4C9CB0` o magenta `#B4537E`).
- **Sin texto dentro del dibujo, sin emojis, sin personas con rasgos** (avatares simples con círculo y hombros). Nada que dependa de un idioma.
- **Paleta cerrada**: tinta `#222A33` · lienzo `#F7F4EE` · blanco `#FFFFFF` · piedra `#ECE6DC` · línea `#CFC6B8` ·
  turquesa `#4C9CB0` / `#DCE7EC` · magenta `#B4537E` / `#F2DDE6`. Nada fuera de esta lista.
- **Modo oscuro**: un SVG en `<img>` no lee los colores del tema. Si quieres que se vea bien en oscuro, pásame también `<nombre>-oscuro.svg`
  (misma escena con tinta `#F2EEE7`, tarjeta `#1B2027`, piedra `#242A33`); si no, pongo la versión clara sobre una placa.
- **Que se lea a 100 px de ancho**: es el tamaño al que aparecen casi siempre.
- Nada de marcas ni dibujos de otras empresas: se tienen que poder usar.

## Estados vacíos y sin datos — lienzo 200 × 150 (`viewBox="0 0 200 150"`)
| Archivo | Dónde sale | Qué dibuja hoy |
|---|---|---|
| `vacio-sinDatos.svg` | Listas y tablas sin filas (salas, notificaciones…) | documento con líneas y un «+» |
| `vacio-agenda.svg` | Calendario, horario, sustituciones sin nada | calendario con línea de horario punteada |
| `vacio-personas.svg` | Clientes, equipo, conversaciones sin dar de alta | dos tarjetas de persona |
| `vacio-busqueda.svg` | Búsquedas y filtros sin resultados | lista y lupa |
| `vacio-grafico.svg` | Informes y gráficos sin datos del periodo | barras sobre base punteada |
| `vacio-cobros.svg` | Cobros, recibos y caja sin movimientos | recibo y tarjeta |
| `vacio-relleno.svg` | Imagen de relleno (foto, logo o portada sin subir) | marco con montañas y sol |

### Huecos que aún no tienen dibujo propio (hoy reutilizan uno de arriba)
`vacio-mensajeria.svg` (conversaciones) · `vacio-productos.svg` (paquetes y tarifas) · `vacio-notificaciones.svg` (campana tranquila) ·
`vacio-automatizaciones.svg` · `vacio-comunidad.svg` · `vacio-festivos.svg` · `vacio-informes.svg` · `vacio-error.svg` (algo ha ido mal; sin dramatismo) ·
`vacio-conexion.svg` (sin red) · `vacio-permisos.svg` (esta parte la gestiona la propietaria). Si los haces, dímelo y los cableo a su pantalla.

## Tarjetas de «Pon en marcha tu estudio» — lienzo 286 × 140 (`viewBox="0 0 286 140"`)
Fondo piedra `#ECE6DC` incluido en el SVG; el bisel y las esquinas redondeadas los pone la tarjeta. Objetos centrados, con 20 px de margen.
| Archivo | Paso | Qué dibuja hoy |
|---|---|---|
| `paso-instructor.svg` | Añade a quien da las clases | avatar con insignia de tick |
| `paso-clase.svg` | Crea tu primer tipo de clase | ficha de clase con etiquetas |
| `paso-horario.svg` | Programa tus clases | rejilla semanal con bloques |
| `paso-bonos.svg` | Pon a la venta una cuota o un bono | entrada con troquel y «+» |
| `paso-clientes.svg` | Trae a tus clientes | dos tarjetas de persona |
| `paso-primera-reserva.svg` | Recibe tu primera reserva | entrada con tick |
| `paso-salas.svg` | (sala) | puerta y ventana |
| `paso-reservas.svg` | (reservas abiertas) | interruptor y enlace |
| `paso-stripe.svg` | (cobra online) | tarjeta de pago |
| `paso-generico.svg` | Cualquier paso sin dibujo propio | ficha con líneas |
Los ids `compartir`, `alumnas`, `primera-clase` y `cuenta` reutilizan `paso-reservas`, `paso-clientes`, `paso-clase` y `paso-instructor`.
