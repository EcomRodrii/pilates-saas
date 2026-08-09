# Cómo está hecho el editor de temas de Shopify, y qué nos falta

Sacado el 2026-08-09 de dos sitios: la interfaz real (tienda `uhdeeb-vk`, tema
Horizon, entrando con la sesión del fundador) y la documentación pública de
Shopify, que es donde está el modelo de datos.

⚠️ **Lo que NO se pudo sacar, y por qué.** El editor entero vive en un iframe
de otro origen (`online-store-web.shopifyapps.com`). Ni el JS ni el árbol de
accesibilidad cruzan esa frontera, y los clics sintéticos tampoco llegan
dentro: se comprobó pulsando el engranaje de ajustes y la pestaña activa no
cambió. La URL del iframe —que abriría ese origen directamente— lleva el token
de sesión y la herramienta la bloquea. Así que de la interfaz solo hay lo que
se ve en pantalla; el modelo de abajo sale de la documentación, que es además
más fiable que deducirlo de un DOM minificado.

---

## 1. Lo que se ve en pantalla

**Dos columnas, no tres.** Rail (~200 px) + lienzo. **No hay panel derecho
permanente**: el inspector aparece al seleccionar algo. En reposo, todo el
ancho que no es rail es vista previa.

> Esto contradice el mockup del handoff, que dibuja tres columnas fijas. En
> una pantalla de 1920 el panel derecho fijo nos come 344 px permanentes para
> enseñar «Selecciona un bloque de la izquierda».

**El rail tiene tres grupos**, y no es una decisión de diseño — es el modelo
de datos (ver §4):

```
Página de inicio
── Encabezado
   ▸ Barra de anuncios
   ▸ Encabezado
   ⊕ Add section
── Template
   ▸ Hero
   ▸ Colección destacada
   ⊕ Add section
── Pie de página
   ⊕ Add section
   ▸ Pie de página
   ▸ Utilidades
```

Cada fila: chevron + icono + **nombre corto en una línea**. Sin segunda línea
descriptiva. Cada grupo con su propio «Add section».

**Barra superior**: atrás · tres iconos de modo (secciones / ajustes / apps) ·
centro con tema (`Horizon` + insignia `Active`) y página (`Página de inicio`) ·
derecha con dispositivo, deshacer/rehacer, `…` y **Guardar desactivado cuando
no hay cambios**.

---

## 2. El schema de una sección

Cada sección declara su propio `{% schema %}`:

| clave | qué hace |
|---|---|
| `name` | título en el editor |
| `tag` / `class` | envoltorio HTML |
| `limit` | cuántas instancias caben en una página |
| `settings[]` | los campos del inspector |
| `blocks[]` | qué hijos admite |
| `max_blocks` | tope de hijos (máx. 50) |
| `presets[]` | **varias configuraciones con nombre de la MISMA sección** |
| `default` | config de secciones estáticas |
| `enabled_on` / `disabled_on` | en qué plantillas aparece |
| `locales` | sus propias traducciones |

Esto es, casi clave por clave, nuestro `REGISTRO_BLOQUES`: `nombre`, `campos`,
`limites`, `pantallas`, `hijos`. El motor de campos que ya construimos es el
mismo mecanismo.

---

## 3. Los dos huecos de verdad

### 3.1 `presets` — no lo tenemos, y es lo que más se nota

Una misma sección puede ofrecer **varias configuraciones con nombre** en el
selector de «Add section», agrupadas por categoría:

```json
"presets": [
  { "name": "Text" },
  { "name": "Content", "settings": { "text": "<p>Hello, world!</p>" } }
]
```

Nosotros tenemos un bloque = una configuración inicial. Añadir «Banner» da
siempre el mismo banner vacío. Un `presets` daría «Banner con foto», «Banner
solo texto», «Banner con botón» — el mismo render, tres puntos de partida.

Es más barato que nuestras `variantes` de tema y ataca el momento correcto:
al insertar, no al instalar un tema entero.

### 3.2 El anidamiento se declara con comodín, no con lista blanca

```json
"blocks": [{ "type": "@theme" }, { "type": "@app" }]
```

`@theme` = acepta CUALQUIER bloque del tema. Nuestro `hijos.admite` es una
lista cerrada por padre: cada bloque nuevo obliga a repasar los padres que
deberían aceptarlo. El comodín escala; la lista blanca envejece.

(Nuestro anidamiento está declarado en el registro y **sin usar** — ver el
plan del Theme Builder.)

---

## 4. Por qué Shopify tiene tres grupos y nosotros no deberíamos

`Encabezado` y `Pie de página` **no son agrupaciones visuales**: son
`header-group.json` y `footer-group.json`, ficheros de datos aparte que se
comparten entre TODAS las páginas y se inyectan en el layout con
`{% sections 'header-group' %}`. `Template` es lo propio de esa página.

```json
{
  "type": "header",
  "name": "Header Group",
  "sections": { "header": { "type": "header", "settings": {} } },
  "order": ["header"]
}
```

En nuestro portal no existe ese concepto: no hay secciones de cabecera ni de
pie compartidas entre pantallas. El análogo —la barra inferior— es
configuración del tema, no una lista de secciones editable. **Copiar los tres
grupos nos dejaría dos vacíos para siempre**, que es justo lo que se decidió
al diseñar nuestro rail. La decisión sigue en pie, y ahora con el motivo real:
no es que no queramos, es que no tenemos el modelo de datos que los justifica.

---

## 5. Tipos de campo: lo que tienen y no tenemos

Shopify expone ~30 tipos. Los nuestros cubren los básicos. Los que faltan y
tendrían uso real en el portal:

- **`range`** con `min`/`max`/`step`/`unit` — deslizador con unidad. Hoy
  usamos `numero` a secas.
- **`richtext`** / **`inline_richtext`** — negrita, cursiva y enlace en un
  texto. Hoy es texto plano y la propietaria no puede resaltar nada.
- **`video_url`** con `accept: ["youtube","vimeo"]` — valida el proveedor en
  el propio campo.
- **`*_list`** con `limit` — selección múltiple acotada.
- **`color_scheme` / `color_scheme_group`** — esquemas de color con nombre,
  elegibles por sección. Nosotros derivamos la paleta de un color de marca
  (`derivarPaleta`), que para un estudio de Pilates probablemente sea mejor:
  menos decisiones.

## 6. Condicionales: los suyos son más potentes y más peligrosos

`visible_if` acepta una expresión Liquid:

```json
"visible_if": "{{ block.settings.url contains 'shopify://collections/' }}"
```

Nuestro `visibleSi` son **datos serializables**, no una expresión evaluable.
Es menos potente —no permite `contains` sobre el valor— pero no ejecuta nada
de lo que escriba nadie y se puede testear como función pura. No lo cambiaría.

Límite que ellos también tienen: las condiciones **no ven datos resueltos en
runtime**, solo si el ajuste tiene valor o no.

---

## Qué haría con esto

1. **`presets` por bloque** — el hueco más rentable, y encaja en el registro
   que ya existe.
2. **`richtext` en línea** — la propietaria no puede poner una negrita hoy.
3. **Quitar el panel derecho fijo** cuando no hay selección, y devolver ese
   ancho al lienzo.
4. **NO copiar los tres grupos del rail** — §4.
5. **NO copiar `visible_if` como expresión** — §6.

Fuentes: [section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema) ·
[input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings) ·
[theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks) ·
[section groups](https://shopify.dev/docs/storefronts/themes/architecture/section-groups) ·
[conditional settings (changelog)](https://shopify.dev/changelog/conditional-settings-in-the-theme-editor)
