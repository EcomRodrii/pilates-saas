# Shell a sangre (`SHELL_NUEVO`) — estado a 18-nov-2026

Todo detrás del interruptor `SHELL_NUEVO` (apagado de serie, `lib/estudio/interruptores.ts`), solo escritorio (`lg:`), y la raíz del
panel lleva `data-shell-nuevo` (por atributo, nunca por `className`: ver `PanelThemeProvider`). Referencias medidas:
`shopify-barrido-por-secciones.md` (capturas) y `shopify-tokens-extraidos.md` (JSON de DevTools).

## Hecho
| Pieza | Dónde |
|---|---|
| Marco `#0a0a0a`, menú a sangre (224 px), lienzo con radio 16 a 4 px del borde | `sidebar.tsx`, `dashboard-shell.tsx`, `globals.css` |
| Buscador «Buscar ⌘K» en el menú (vidrio) + isotipo y botón de contraer | `sidebar.tsx` (`BotonBuscarMenu`), `lib/buscador-evento.ts` |
| Filas de 30 px (450/500, `#dcdcdc`/`#fcfcfc`), rótulos en frase, pie con la tienda | `sidebar.tsx` |
| Brillo de abajo con los colores de Tentare (`trial-wave`, 17,5 s) | `sidebar.tsx` (`BrilloDelMarco`), `globals.css` |
| Configuración: el menú pasa a ser el de sus secciones (portal) | `config-shell.tsx`, `sidebar.tsx` (`MenuConfiguracion`) |
| Cabecera de página compacta, tarjetas de cifras y gráficas con sombra Polaris, pastillas, tablas | `globals.css` + `data-vivo`/`data-slot` en `vivo.tsx`, `page-header.tsx` |
| Asistente en columna (356 px, el lienzo se encoge 0,3 s) + píldora + ⌘J | `lib/asistente-columna.tsx`, `columna-asistente.tsx` |
| Compositor de la columna: tarjeta radio 26, pestaña gris y texto que rota con desenfoque | `vista-chat.tsx` |
| Tarjetas de «Pon en marcha tu estudio» con imagen, bisel y cierre | `tarjetas-de-paso.tsx`, `ilustraciones/pasos.tsx`, `primeros-pasos-tarjeta.tsx` |
| Ilustraciones originales de vacíos (7 escenas) | `ilustraciones/escenas.tsx`, `ui/empty-state.tsx` (`escena`) |
| Letra Inter (OFL, 133 KB, sin precarga) solo en el marco | `app/_fuentes/inter/`, `fuentes-panel.ts` |
| Píldora de plan en negro, buscador y estados de Clientes al estilo «Buscar y filtrar» | `globals.css` |
| Resumen en una columna mientras la columna del asistente está abierta | `data-columna-abierta` en `dashboard-shell.tsx` |

## Verificado (Chromium, `next dev --webpack`, `e2e/shell-nuevo-captura.spec.ts`)
Resumen, Clientes, Informes y Configuración a 1440 y 1024 px en claro; oscuro (Resumen con asistente, Clientes); móvil 390 sin desbordes
y sin ninguna pieza del marco; `/asistente` a pantalla completa respeta el hueco del menú; la tarjeta de paso se descarta; Inter se carga.
`tsc` limpio; tests de marca, huecos, interruptores, barra opaca y «dónde vive Tenti» en verde.

## Sin verificar / conocido
- **`e2e/asistente.spec.ts:40`** falla en este entorno (`next dev` sobre WASM): mira que el texto del chat esté en el JS recibido y en dev
  los textos viajan escapados. No toca lo que cambié (el texto del chat no cambia) pero no lo he podido contrastar con un build de producción.
- Pantallas con elementos fijos que usan `--sidebar-w` (POS, visita guiada, barra de «Quién me debe») no revisadas una a una.
- Safari/WebKit, iPad en vertical y el modo «menú arriba» con el interruptor encendido.
- Datos reales: todo se ha visto con los datos sembrados de `panel-sembrado.ts`.
- La web comercial no se toca (el copy público lo decide el fundador).
- Falta decidir: lienzo crema (marca) o blanco (Shopify); si los degradados nuevos (brillo del menú) entran en el Brand OS (hoy solo logo/progreso).

## Añadido después (misma fecha)
- **Componentes y movimiento de Shopify** (valores del JSON): lienzo blanco, botones de 28 px con `--p-shadow-button-primary`, campos con `--p-shadow-input` y foco azul, badges de radio 8, diálogos de radio 24 con `--p-shadow-600`, pestañas en pastillas de 28 px, entrada de tarjetas (450 ms / 24 px / escalón 70 ms), fundido de contenido 400 ms lineal, esqueleto con barrido de luz. `globals.css`, todo bajo `[data-shell-nuevo]` y `lg:`.
- **Compositor de Inicio** (`components/asistente/compositor-inicio.tsx`): tarjeta radio 26 bajo el saludo que abre la columna con la pregunta enviada.
- **Tarjetas del asistente en la columna** adaptadas a 356 px.
- **Ilustraciones externas**: `lib/ilustraciones/manifiesto.ts` + `public/ilustraciones/` + 17 SVG de partida y encargo en `docs/diseno/ilustraciones/`.
- **Barrido de módulos** (Calendario, Cobros, Equipo, Productos, Informes, Citas, Mensajería, Centro de Control, Cierre): sin errores de página. Automatizaciones agotó el tiempo por compilación lenta en dev, pendiente de repetir.
