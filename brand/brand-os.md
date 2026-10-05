# TENTARE BRAND OS · v1.0

Fuente única de verdad de la identidad. Consolida las sesiones 01–10 y `docs/marca/LEEME.md`. Ante cualquier contradicción, manda este documento. Lo no definido aparece como **OPEN DECISION** y no se inventa.

> Pregunta guía: **¿Está todo en su sitio? ¿Hay algo forzado?**

---

## 1. Brand foundation
- **Qué es TENTARE:** el software de gestión para estudios de Pilates. Reservas por reformer, cobros, bonos, sustituciones y decisiones del día en un solo sitio.
- **Para quién:** la dueña del estudio (decide), su equipo (opera) y sus alumnas (reservan).
- **Promesa:** el estudio funciona solo; la dueña decide solo lo que necesita su criterio.
- **Hechos verificables que sostienen la marca:**
  - Precio público desde 29 €/mes.
  - Sin permanencia.
  - 0 % de comisión sobre los cobros.
  - Hecho en España para Pilates.
  - Responde una persona.

## 2. Creative platform
- **Plataforma:** «Todo en su sitio. Nada forzado.»
  - *Todo en su sitio* = el sistema (orden, control, precisión).
  - *Nada forzado* = la experiencia (sin fricción, sin pasos de más).
- **Referencia conceptual interna:** *Contrology for studios*. Nunca aparece en comunicación.

## 3. Brand personality
- **Sí:** premium, calm, confident, modern, precise, editorial, intelligent, desirable, human, European.
- **No:** corporate, clinical, generic SaaS, cheap fitness, overly feminine, startup cliché, AI-generated, trendy.
- **Voz:** directa, serena y experta. Frases cortas, verbos concretos y ninguna hipérbole. Nada de «revoluciona», «todo-en-uno» ni «potencia».

## 4. Visual territory
- **«Arquitectura blanda»:** una retícula estricta habitada por las formas suaves del isotipo.
- **Materia:** madera lacada, muelle de acero, lino, papel grueso, luz de mañana.
- **Dos mundos:**
  - **A, producto:** de aquí sale la claridad del sistema.
  - **B, cultura boutique:** de aquí salen el deseo y la sensación de comunidad.
  - TENTARE vive en la intersección.

## 5. Color
Los valores exactos están en `design-tokens.json`.

| Rol | Token | Valor | Uso aprox. |
|---|---|---|---|
| Base | Cream | #F7F4EE | 55 % |
| Estructura | Ink | #222A33 | 25 % |
| Calidez | Sand / Stone | #D8CDBB / #ECE6DC | 12 % |
| Identidad / tecnología | Blue (turquesa oficial) | #4C9CB0 · texto #3E6A82 | 6 % |
| Acento de alta atención | Magenta oficial | #B4537E · texto #963A62 | ~2 % |

- **Magenta:** *high-attention accent, used sparingly and intentionally*. El ~2 % es una referencia de dirección de arte, no un límite. Nunca se usa en errores.
- **Degradado (135°, turquesa → magenta):**
  - Por defecto es propiedad del isotipo.
  - Como excepción, puede usarse para indicar progreso o tiempo transcurrido, siempre lineal y en una superficie de como mucho el 5 %.
  - Nunca en fondos, botones, texto ni cards.
- **Estados:**
  - success #2F6A53
  - warning #855A16
  - error #A3342A (rojo tierra)
  - info = Blue
- **Retirado:** oliva, salvia y arena del producto anterior. No hay verdes decorativos.
- **Marca blanca:** en el producto, el acento (`--brand`) es el del estudio. TENTARE vive en Ink, tipografía, mono y línea de horario.
- **OPEN DECISION:** los colores de estado en modo oscuro.

## 6. Typography
- **Familias:** Schibsted Grotesk (400/500/600) para todo. DM Mono (400/500) para horas, cifras de tabla, etiquetas, índices y fechas técnicas.
- **Escala:** 72 · 48 · 31 · 30 (título de pantalla) · 20 · 17 · 16 · 14 · 13 · 12 mono · 11 mono.
- **Mínimo:** 13 px en producto.
- **Reglas de escritura:**
  - Titulares en frase (nunca Title Case) y de 8 palabras como máximo.
  - Punto final solo en titulares de marca.
  - Mayúsculas solo en mono, con +8 % de tracking.
- **Números:** formato español (1.284 · 64,00 € · 07:00). Siempre tabulares.

## 7. Grid
- **Desktop:** 12 columnas, gutter 24, margen 64, ancho máximo 1280.
- **Tablet:** 8 columnas, gutter 20, margen 32.
- **Móvil:** 4 columnas, gutter 16, margen 20.
- **Panel:** contenido de 1320 como máximo. Sidebar de 64 / 224 / 288. Topbar de 56.
- **Retícula visible:** módulo de 24 px, solo en piezas de marca; en el producto es invisible pero obligatoria.

## 8. Spacing
- **Escala base 4:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96 · 128.
- **Producto:** 4–24.
- **Marca:** 32–128. Las secciones web se separan 128 / 96 / 64.
- **Aire:** al menos un tercio de cada pieza de marca queda vacío.

## 9. Shape language
- Hay tres formas, todas sacadas del isotipo oficial:
  - **Tallo:** cápsula.
  - **Disco:** medio disco.
  - **Hojas:** remate curvo.
- Es un sistema cerrado: solo se gira en múltiplos de 90° y hay una forma por composición.
- Los círculos completos se reservan para avatares de persona.
- **Radios:**
  - **Producto:**
    - 24 en cards (patrón aprobado; los `rounded-3xl` del repo resuelven a 38,4 px y son LEGACY).
    - 28 en la sidebar.
    - Completo (*full*) en botones, inputs, badges y pills.
    - 20 en modales.
    - 12 en menús y alertas.
  - **Marca:** 0 en imagen editorial.

## 10. Graphic language
- Cinco recursos propietarios, cada uno con una función:
  1. **Retícula** · ordenar.
  2. **Índice editorial** · numerar. *Retirado de la web por decisión del cliente; su uso en otros soportes es OPEN DECISION.*
  3. **Línea de horario** · situar en el tiempo.
  4. **Formas del isotipo** · enmarcar.
  5. **Cifra protagonista** · destacar un dato.
- **Combinación:** retícula siempre presente, más un máximo de dos recursos. Un solo protagonista por pieza.
- **Datos:** siempre reales o verosímiles.
- **Glass:** es la capa que flota sobre algo que se mueve (scroll o foto). Nunca en cards estáticas.

## 11. Photography
- Fotografiar el método, no el ejercicio.
- Luz natural lateral. Nadie mira a cámara. Piel real, sin remodelar cuerpos.
- Detalle antes que plano general; las manos son la categoría insignia.
- **Etalonaje único:** blancos hacia Cream, sombras hacia Ink, saturación −10, grano 2–4 %.
- **Proporciones:** 4:5, 3:2, 1:1 y 21:9.
- **Nunca:** stock fitness, gimnasios blancos ni imágenes generadas por IA.
- Siete preguntas de selección (sesión 05): si falla una, la imagen no entra.
- **OPEN DECISION:** sesión de fotos propia. Mientras tanto se usan las fotos de banco de la landing.

## 12. Iconography
- **Librería:** Lucide, trazo de 1,5–2, monocromo en Ink o Ink 700.
- **Retícula:** 24, con 16 en tablas.
- Blue solo para el estado activo.
- Sin iconos de color, sin iconos dentro de círculos de color y sin emojis.

## 13. Motion
- **Interfaz:**
  - 160 ms en micro, 240 ms en componente, 400 ms en pantalla y 600–900 ms en marca.
  - Curva `cubic-bezier(0.2, 0, 0, 1)`.
  - Sin rebotes.
- **Web:** entradas y parallax ligados al scroll (`animation-timeline: view()`), con mejora progresiva.
- **Logo:** solo las diez animaciones de `docs/marca/animaciones/tentare-motion.css`. Ninguna gira el isotipo.
- **`prefers-reduced-motion`:** todo queda quieto y completo.

## 14. Brand hierarchy
- **Productos:**
  - Core, Manager, Studio, Network e Interno.
  - Solo cambia el color del disco del isotipo.
  - A una tinta, el producto se distingue por la palabra.
- **Logo:**
  - En horizontal el isotipo hace de «t»: se escribe «entare».
  - Nunca por debajo de 24 px a color. De 16 a 24 px se usa el favicon a una tinta.
  - **OPEN DECISION:** el área de respeto. La propuesta actual es la altura de la «e» en horizontal y ¼ de la altura en el isotipo.
- **Volumen de marca por superficie** (cuánto se nota la marca en cada sitio): ver `ui-rules.md §1`.

## 15. Do / Don't
- **Do:**
  - Ink sobre Cream.
  - Una idea por pieza.
  - Datos reales.
  - La misma luz en todas las imágenes.
  - Que la tipografía haga el trabajo que en otras marcas hace la decoración.
- **Don't:**
  - Degradados de fondo.
  - Verdes decorativos.
  - Ilustración, 3D o mascota (el clay 3D está retirado).
  - Mockups en perspectiva.
  - Inventar formas o símbolos.
  - Magenta en errores.
  - Negro puro.

## 16. Digital principles
- **Navegación:** en píldora glass.
- **Display:** uno por página, y es la plataforma.
- **Producto:** se muestra plano y real.
- **Avisos en glass sobre foto:** son el único elemento que flota.
- **CTA magenta:** solo en el alta.
- **Prueba social:** solo verificable. Los testimonios entran únicamente con permiso firmado.
- **Precio:** siempre visible.

## 17. Product principles
- Se respeta la arquitectura existente:
  - Menú en píldora.
  - Lanzador «¿Qué quieres hacer o buscar?» con ⌘K.
  - Resumen como línea del día.
  - Centro de Control con un solo mensaje o silencio.
  - Modo privacidad.
  - Esencial/Todo.
- La marca se vuelve más silenciosa cuanto más operativa es la tarea.
- Lo que necesita decisión, siempre arriba. Lo resuelto se atenúa, no desaparece.
- Cada botón dice lo que va a pasar («Cobrar ahora», no «Hecho»).
