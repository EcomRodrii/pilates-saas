# TENTARE PRODUCT UI RULES · v1.0

Reglas para decidir **cuánta marca** lleva cada superficie y **cómo** se traducen los recursos propietarios al software. Si una pantalla no encaja en estas reglas, se marca como OPEN DECISION y no se improvisa.

## 1. Brand hierarchy por superficie
La marca se vuelve más silenciosa cuanto más operativa es la tarea.

| Superficie | Marca | Qué aparece | Qué desaparece |
|---|---|---|---|
| Website | 100 % | Display de plataforma, fotografía, formas del isotipo, línea de horario, glass, motion de scroll, CTA magenta | — |
| Marketing (ads, social, PDF) | 100 % | Ídem + retícula visible | — |
| Onboarding | 80 % | Una pregunta por pantalla, titulares con voz, progreso en línea de horario | Fotografía, glass |
| Booking widget | 70–80 % | Marca del estudio como acento, horas en mono, Capacity indicator, confirmación con línea de horario | Formas del isotipo, magenta TENTARE |
| Student app | 60–70 % | Próxima clase como protagonista, línea de horario en la reserva | Retícula visible, Display |
| Dashboard (Resumen, Centro de Control) | 60–70 % | Saludo, frase de Tentare, cifra protagonista, «Ahora» con línea de horario, un aviso al día | Fotografía, motion de marca |
| Analytics (Informes) | 50–60 % | Cifra protagonista, barras Stone + Blue | Voz de marca en titulares |
| Calendar | 40–50 % | Horas en mono, «Ahora», categorías por tono | Todo lo demás |
| Tables / forms | 20–30 % | Alineación, mono en cifras, estados | Voz, color de acento |
| Payments / admin | 20–30 % | Importes en mono, estados semánticos | Todo recurso de marca |

**Constantes en todas:** Schibsted + DM Mono, Ink sobre Cream, radios, estados y glass solo cuando algo flota.

## 2. Product language: los cinco recursos en el software

### 2.1 Grid
- **Uso real:** alineación de columnas en «Hoy en el estudio», tablas y calendario (horas en una columna fija de 70–96).
- **Regla:** invisible en el producto. Ningún fondo de cuadrícula fuera de marketing.

### 2.2 Editorial index
- **Estado:** retirado de la web por decisión del cliente.
- **Uso real conservado:** la numeración de pasos con orden real (onboarding «02 / 04», importador «01 Importar · 02 Revisar el acta»).
- **OPEN DECISION:** si se mantiene en las secciones de documentos y slides.

### 2.3 Schedule line (línea de horario) — recurso principal del producto
Une dos datos en el tiempo. En el producto **es dato, no decoración**.

| Variante | Significado | Dónde |
|---|---|---|
| Sólida 1,5 px Ink | Tiempo confirmado / hecho | Clase con instructora, paso completado del registro |
| Punteada Ink 300 | Disponible / por llegar | Huecos, día vacío del calendario, pasos pendientes |
| Degradado + punto magenta | Tiempo transcurrido / «ahora» | Marcador «Ahora» en Hoy en el estudio y Calendario, clase en curso, progreso de onboarding, evidencia del «¿Por qué?» |
| Rojo de estado | Problema en ese tramo | Clase sin instructora (OPEN DECISION: si se dibuja la línea en rojo o solo el borde) |

**Casos de uso reales:**
1. **«Ahora · HH:MM»** antes de la primera clase que todavía no ha empezado (sustituye a la línea verde actual).
2. **Clase en curso:** la parte ya transcurrida se rellena con el degradado.
3. **Registro de sustituciones / Activity timeline:** el trazo es sólido en lo hecho y punteado en lo pendiente.
4. **Evidencia del Centro de Control:** el patrón de asistencia de una alumna (sólido hasta su última visita, punteado hasta hoy).
5. **Empty state de agenda:** 07:00 ------ 21:00 en punteado.
6. **Confirmación de reserva y emails:** inicio ——— fin.
7. **Progreso del onboarding y del importador.**

**Prohibido:** usarla como subrayado, como divisor de sección o sin datos en sus extremos.

### 2.4 Isotype-derived shapes
- **Uso real en producto:**
  - **Píldora (tallo):** botones, inputs, badges, ítems del menú, lanzador.
  - **Radio 28 (forma de la píldora del menú):** sidebar flotante.
- **Medio disco y remate:** solo marketing, onboarding y la cabecera de la app de alumnas (OPEN DECISION).
- **Prohibido en producto:** recortes de imagen en cápsula en tablas o listados.

### 2.5 Hero metric (cifra protagonista)
- **Uso real:** KPI cards del Resumen e Informes, importe de la cuota, «N / M plazas», total de pagos pendientes, saldo de un bono.
- **Regla:** una cifra protagonista por card. La unidad va al 40 % del tamaño. En modo privacidad se sustituye por «•••».

## 3. Reglas de pantalla
1. Lo que necesita decisión va arriba; lo resuelto se atenúa (opacidad 0,6), no desaparece.
2. Un único aviso al día en el Centro de Control. Si no hay nada que decir, silencio («Todo bajo control»).
3. Las cifras solo aparecen si el sistema las respalda (sin €/mes inventados).
4. Cada botón dice la acción real. Mover dinero siempre lo explicita («Cobrar ahora»).
5. Sin accesos rápidos duplicados del menú (uso medido = 0).
6. Sin emojis en el producto. La severidad es un Badge con texto.
7. Los listados de cards nunca dejan una huérfana: 4 → 2 × 2, 3 → 1.
8. El modo privacidad oculta todas las cifras de dinero y de alumnas.
9. El glass, solo en topbar, barras fijas, toasts y etiquetas sobre fotos.
10. Marca blanca: ningún componente usa Blue o Magenta de TENTARE como acento si el estudio tiene su marca; usan `--brand`.

## 4. Contenido y microcopy
- Español de España, tuteo, frases cortas.
- Horas en 24 h (07:00), importes 64,00 €, miles 1.284.
- Estados en presente («Cubierta», «Reintentando»), acciones en infinitivo o imperativo («Rellenar huecos», «Buscar sustituta»).
- Los errores dicen qué pasó y qué hacer: «No se pudo confirmar. Comprueba tu conexión e inténtalo de nuevo.»
