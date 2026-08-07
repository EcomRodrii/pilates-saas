import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOQUES_SISTEMA_IDS } from './portal-home-bloques.ts';
import { THEME_DEFINITIONS, getThemeDefinition } from './theme-definitions.ts';
import { themeDraftSchema, themeConfigSchema, DEFAULT_THEME } from './theme-schema.ts';
import { validarContrasteTheme, themeToCssVars } from './theme-runtime.ts';
import { VARIANTES_PORTAL } from './theme-variantes.ts';

test('THEME_DEFINITIONS: ids únicos, y "classic" existe con defaults vacíos (el tema de siempre)', () => {
  const ids = THEME_DEFINITIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const clasico = getThemeDefinition('classic');
  assert.ok(clasico);
  assert.deepEqual(clasico!.defaults, {});
  assert.deepEqual(clasico!.capabilities, []);
});

test('THEME_DEFINITIONS: cada "defaults" es un ThemeDraft válido (nada que rompa al aplicarlo)', () => {
  for (const def of THEME_DEFINITIONS) {
    const r = themeDraftSchema.safeParse(def.defaults);
    assert.equal(r.success, true, `defaults de "${def.id}" no es un ThemeDraft válido`);
  }
});

test('getThemeDefinition: "geometric" fija portalHeadingFontId a outfit y declara la capability', () => {
  const geo = getThemeDefinition('geometric');
  assert.ok(geo);
  assert.equal(geo!.defaults.portalHeadingFontId, 'outfit');
  assert.ok(geo!.capabilities.includes('typography'));
});

test('getThemeDefinition: id desconocido → undefined', () => {
  assert.equal(getThemeDefinition('no-existe'), undefined);
});

test('getThemeDefinition: "editorial" fija tipografía negrita, botón/tarjeta y barra de pestaña activa', () => {
  const ed = getThemeDefinition('editorial');
  assert.ok(ed);
  assert.equal(ed!.defaults.portalHeadingFontId, 'instrumentSansBold');
  assert.equal(ed!.defaults.buttonStyle, 'solid');
  assert.equal(ed!.defaults.cardStyle, 'elevated');
  assert.equal(ed!.defaults.tabBarStyle, 'pestanaActiva');
  assert.deepEqual(ed!.capabilities.sort(), ['buttons', 'cards', 'nav', 'typography']);
});

// ── Tanda Oliva/Bloom/Noir ──────────────────────────────────────────────────
// Estas dos guardias recorren el registro ENTERO, no los temas que hay hoy:
// cualquier tema futuro tiene que pasar por aquí. Un tema que no valide contra
// el schema completo, o que no pase el gate de contraste, sería imposible de
// publicar desde el editor — mejor que falle en CI que en la cara de la
// propietaria.

test('THEME_DEFINITIONS: cada tema aplicado sobre DEFAULT_THEME es un ThemeConfig completo válido', () => {
  for (const def of THEME_DEFINITIONS) {
    const r = themeConfigSchema.safeParse({ ...DEFAULT_THEME, ...def.defaults });
    assert.equal(r.success, true, `El tema "${def.id}" no valida contra themeConfigSchema`);
  }
});

test('THEME_DEFINITIONS: todos los temas pasan el gate de contraste, sin retocar colores', () => {
  for (const def of THEME_DEFINITIONS) {
    const chequeo = validarContrasteTheme({ ...DEFAULT_THEME, ...def.defaults });
    assert.equal(chequeo.ok, true, `El tema "${def.id}" no pasa el contraste: ${chequeo.errores.join(' / ')}`);
  }
});

test('THEME_DEFINITIONS: siguen estando los temas anteriores a esta tanda', () => {
  // Un estudio que ya eligió `geometric`/`editorial` tiene ese id guardado en su
  // ThemeConfig; borrarlos del registro dejaría su tema sin nombre en la galería.
  for (const id of ['classic', 'geometric', 'editorial', 'oliva', 'bloom', 'noir']) {
    assert.ok(getThemeDefinition(id), `Falta el tema "${id}" en el registro`);
  }
});

test('Noir es el único que pide barra oscura; Bloom el único que pide barra flotante', () => {
  assert.equal(getThemeDefinition('noir')!.defaults.barraOscura, true);
  assert.equal(THEME_DEFINITIONS.filter((t) => t.defaults.barraOscura).length, 1);
  assert.equal(getThemeDefinition('bloom')!.defaults.barraFlotante, true);
  assert.equal(THEME_DEFINITIONS.filter((t) => t.defaults.barraFlotante).length, 1);
});

test('Oliva y Noir piden barra clásica; Bloom no la pide (sigue flotando)', () => {
  assert.equal(getThemeDefinition('oliva')!.defaults.barraClasica, true);
  assert.equal(getThemeDefinition('noir')!.defaults.barraClasica, true);
  assert.ok(!getThemeDefinition('bloom')!.defaults.barraClasica);
  assert.equal(THEME_DEFINITIONS.filter((t) => t.defaults.barraClasica).length, 2);
});

// Valores exactos del prototipo real (paleta() → radCard/radBoton), leído vía
// el MCP claude_design — ver harmonic-discovering-kettle.md. Antes de esta
// ronda solo Bloom traía `radioTema` (y solo `card`), así que Button.tsx/
// Card.tsx (usados en TODO el portal) nunca reflejaban ninguna diferencia
// real entre temas — "todos iguales pero de otro color".
test('radioTema completo (card+boton) por tema, con los valores exactos del prototipo', () => {
  // `chip: 999` en los tres (radChip del prototipo) y `acceso` solo donde hay
  // baldosa — Noir no lo lleva porque sus accesos son círculos.
  assert.deepEqual(getThemeDefinition('oliva')!.defaults.radioTema, { card: 26, boton: 20, chip: 999, acceso: 20 });
  assert.deepEqual(getThemeDefinition('bloom')!.defaults.radioTema, { card: 30, boton: 999, chip: 999, acceso: 22 });
  assert.deepEqual(getThemeDefinition('noir')!.defaults.radioTema, { card: 24, boton: 18, chip: 999 });
});

test('cardStyle: Bloom y Noir con sombra, Oliva plana — según la tabla del encargo', () => {
  // ⚠️ Noir estaba en `flat` con el comentario "plana como Oliva a propósito —
  // el prototipo solo da sombra a Bloom". Era una lectura del prototipo que
  // contradecía la tabla de `entrega/HANDOFF-temas.md` §1, que dice `elevated`
  // para Noir. Manda la tabla: el propio encargo pide "sácalos de aquí, no del
  // ojo". Corregido a petición expresa.
  assert.equal(getThemeDefinition('oliva')!.defaults.cardStyle, 'flat');
  assert.equal(getThemeDefinition('bloom')!.defaults.cardStyle, 'elevated');
  assert.equal(getThemeDefinition('noir')!.defaults.cardStyle, 'elevated');
});

test('validarContrasteTheme: con barra oscura, un destacado ilegible sobre la marca se rechaza', () => {
  const malo = validarContrasteTheme({
    ...DEFAULT_THEME, ...getThemeDefinition('noir')!.defaults,
    destacado: '#1E2B22', // casi el mismo verde que la marca: invisible como icono activo
  });
  assert.equal(malo.ok, false);
  assert.ok(malo.errores.some((e) => e.includes('destacado')));
});

test('validarContrasteTheme: con barra flotante (sin oscura), el par destacado/marca NO se comprueba', () => {
  // Solo `barraOscura` pinta `destacado` SOBRE la marca (varsBarra). La barra
  // flotante también tiene la marca de fondo desde que su pastilla activa es
  // de marca, pero encima va el foreground autoderivado por contraste, no
  // `destacado` — así que este par sigue sin aplicar ahí.
  const r = validarContrasteTheme({
    ...DEFAULT_THEME, ...getThemeDefinition('bloom')!.defaults,
    destacado: getThemeDefinition('bloom')!.defaults.primary, // a propósito, ilegible SI se comprobara
  });
  assert.equal(r.ok, true);
});

test('validarContrasteTheme: sin barra oscura, ese par no se comprueba', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, destacado: DEFAULT_THEME.primary, barraOscura: false });
  assert.equal(r.ok, true);
});

test('validarContrasteTheme: sin `destacado`, el gate cae a `secondary` (tema guardado antes de esta fase)', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, barraOscura: true, secondary: '#FFFFFF', destacado: null });
  assert.equal(r.ok, true); // blanco sobre el primary por defecto (oliva oscuro) sí contrasta
});

test('THEME_DEFINITIONS: bloquesHome de Oliva/Bloom/Noir solo referencia ids reales de bloques sistema', () => {
  // Derivado, NO escrito a mano: la lista a mano se quedó desfasada en cuanto
  // se añadió `proximaClase` y este test falló por su propia copia, no por un
  // id malo de verdad.
  const idsValidos = new Set<string>(BLOQUES_SISTEMA_IDS);
  for (const id of ['oliva', 'bloom', 'noir']) {
    const def = getThemeDefinition(id)!;
    assert.ok(def.bloquesHome && def.bloquesHome.length > 0, `"${id}" no trae bloquesHome`);
    for (const b of def.bloquesHome!) {
      assert.ok(idsValidos.has(b), `"${id}" referencia un id de bloque desconocido: "${b}"`);
    }
  }
  // Retos sí se construyó de verdad (conteo real, ver lib/retos-portal.ts) —
  // Bloom lo instala primero, antes de "Accesos rápidos".
  // `proximaClase` va PRIMERO en los tres, como manda el diseño aprobado. Se
  // había caído de los tres porque ese bloque no existía todavía.
  assert.deepEqual(getThemeDefinition('bloom')!.bloquesHome, ['proximaClase', 'retos', 'accesosRapidos', 'contenidoEstudio']);
  for (const id of ['oliva', 'bloom', 'noir']) {
    assert.equal(getThemeDefinition(id)!.bloquesHome![0], 'proximaClase', id);
  }
});

// ── Variantes de forma por bloque ───────────────────────────────────────────

// Guardia sobre el registro ENTERO, mismo espíritu que el gate de contraste:
// un tema futuro con una variante inventada se detecta aquí, no en el portal
// de una socia.
test('THEME_DEFINITIONS: toda `variantes` declarada usa ejes y valores del catálogo', () => {
  for (const def of THEME_DEFINITIONS) {
    const v = def.defaults.variantes;
    if (!v) continue;
    for (const [eje, valor] of Object.entries(v)) {
      const permitidos = (VARIANTES_PORTAL as Record<string, readonly string[]>)[eje];
      assert.ok(permitidos, `"${def.id}" declara un eje desconocido: "${eje}"`);
      assert.ok(permitidos.includes(valor as string), `"${def.id}".${eje} = "${valor}" no está en el catálogo`);
    }
  }
});

test('Variantes exactas por tema, según el prototipo real', () => {
  // Oliva: baldosas + las 4 etiquetas con icono activo relleno.
  assert.deepEqual(getThemeDefinition('oliva')!.defaults.variantes,
    { cabeceraInicio: 'saludo', accesosRapidos: 'rejilla', barra: 'todasRelleno', tarjetaPrincipal: 'rotulada', bienvenida: 'foto' });
  // Bloom es el único que conserva la píldora flotante → su barra se queda con
  // etiqueta solo en la activa (`conTexto: !tabPill || activo` del prototipo).
  assert.equal(getThemeDefinition('bloom')!.defaults.variantes?.barra, undefined);
  assert.equal(getThemeDefinition('bloom')!.defaults.variantes?.retos, 'color');
  // Noir es el ÚNICO con accesos en círculo.
  assert.equal(getThemeDefinition('noir')!.defaults.variantes?.accesosRapidos, 'circulos');
  assert.equal(
    THEME_DEFINITIONS.filter((t) => t.defaults.variantes?.accesosRapidos === 'circulos').length, 1);
});

test('Editorial declara su bienvenida al mudarse el gate de tabBarStyle a variantes', () => {
  // Sin esto, un estudio que instale Editorial DESPUÉS de esta fase perdería
  // la bienvenida. (Los que ya la tienen instalada se cubren con el OR de
  // tabBarStyle en login/page.tsx: `defaults` no es retroactivo.)
  assert.equal(getThemeDefinition('editorial')!.defaults.variantes?.bienvenida, 'foto');
});

test('cada cambio de defaults sube la versión — `defaults` NO es retroactivo', () => {
  // Sin subirla, un estudio que ya tenga el tema instalado se queda con los
  // valores viejos para siempre y sin enterarse. Los tres suben con
  // `escalaTexto`; Noir iba una por delante desde que su `cardStyle` pasó a
  // `elevated`.
  assert.equal(getThemeDefinition('oliva')!.version, 5);
  assert.equal(getThemeDefinition('bloom')!.version, 5);
  assert.equal(getThemeDefinition('noir')!.version, 6);
  assert.equal(getThemeDefinition('editorial')!.version, 2);
});

test('los 3 temas piden la tarjeta principal rotulada (rótulo + estado vacío simple)', () => {
  for (const id of ['oliva', 'bloom', 'noir']) {
    assert.equal(getThemeDefinition(id)!.defaults.variantes?.tarjetaPrincipal, 'rotulada', id);
  }
  // Y el default sigue siendo el hero de siempre para todo lo demás.
  assert.equal(getThemeDefinition('classic')!.defaults.variantes, undefined);
});

test('cabecera: Oliva `saludo`, Noir `nombre`, y solo Bloom `titular` (con titular grande)', () => {
  assert.equal(getThemeDefinition('oliva')!.defaults.variantes?.cabeceraInicio, 'saludo');
  assert.equal(getThemeDefinition('bloom')!.defaults.variantes?.cabeceraInicio, 'titular');
  // Noir NO lleva titular grande — en el prototipo ese solo lo tiene Bloom.
  assert.equal(getThemeDefinition('noir')!.defaults.variantes?.cabeceraInicio, 'nombre');
});

// ── La barra inferior de los tres temas, contra el prototipo ────────────────
// El encargo la resuelve con dos ejes (`tabPill` de Bloom y `barraOscura` de
// Noir) y NINGUNO de los tres lleva la píldora blanca con sombra que el
// componente trae de fábrica. Se comprobaba solo el fondo de la barra oscura,
// así que las tres desviaciones convivieron sin que nada fallara.
function varsDe(id: string): Record<string, string> {
  return themeToCssVars({ ...DEFAULT_THEME, ...getThemeDefinition(id)!.defaults }) as Record<string, string>;
}

test('Oliva: barra pegada abajo SIN pastilla, activo del color de marca', () => {
  const v = varsDe('oliva');
  assert.equal(v['--portal-tabbar-active-bg'], 'transparent');
  assert.equal(v['--portal-tabbar-active-shadow'], 'none');
  assert.equal(v['--portal-tabbar-active-fg'], '#3D4A2F'); // = la marca del prototipo
  assert.equal(v['--portal-tabbar-border'], undefined);    // sí lleva línea arriba
});

test('Bloom: la pastilla activa es de MARCA, no blanca, y el icono va encima en claro', () => {
  const v = varsDe('bloom');
  assert.equal(v['--portal-tabbar-active-bg'], '#7C5CFC');
  assert.equal(v['--portal-tabbar-active-shadow'], 'none'); // la sombra es de la barra
  assert.notEqual(v['--portal-tabbar-active-fg'], '#FF8FB1'); // el rosa NO es el icono activo
  assert.equal(v['--portal-tabbar-radius'], '999px');
  assert.equal(v['--portal-tabbar-height'], '66px');
});

test('Noir: barra oscura, activo dorado y SIN línea superior', () => {
  const v = varsDe('noir');
  assert.equal(v['--portal-tabbar-bg'], '#1E2B22');
  assert.equal(v['--portal-tabbar-active-fg'], '#D9B166');
  assert.equal(v['--portal-tabbar-active-bg'], 'transparent');
  assert.equal(v['--portal-tabbar-border'], 'none');
});

test('un estudio sin ninguno de los tres ejes conserva la píldora blanca de siempre', () => {
  // La regresión que más caro saldría: estos vars no deben declararse para el
  // resto de estudios, que heredan el fallback del componente.
  const v = themeToCssVars(DEFAULT_THEME) as Record<string, string>;
  for (const clave of ['--portal-tabbar-active-bg', '--portal-tabbar-active-shadow',
                       '--portal-tabbar-active-fg', '--portal-tabbar-border']) {
    assert.equal(v[clave], undefined, clave);
  }
});

test('escalaTexto: los valores EXACTOS de `typography.scale` del encargo, y distintos por tema', () => {
  // ⚠️ La escala es identidad del TEMA, no una constante del producto. Se llegó
  // a recomendar una escala única para todos los estudios y los tokens que
  // entregó diseño lo contradicen: Noir y Oliva titulan sus secciones a 17 y
  // Bloom a 20. Este test es el que impide que vuelva a unificarse "por
  // coherencia".
  assert.equal(getThemeDefinition('oliva')!.defaults.escalaTexto?.seccion, 17);
  assert.equal(getThemeDefinition('noir')!.defaults.escalaTexto?.seccion, 17);
  assert.equal(getThemeDefinition('bloom')!.defaults.escalaTexto?.seccion, 20);
  // El saludo es donde más se separan: Noir lo pone 5px por encima.
  assert.equal(getThemeDefinition('noir')!.defaults.escalaTexto?.saludo, 24);
  assert.equal(getThemeDefinition('oliva')!.defaults.escalaTexto?.saludo, 19);
  // Y la bienvenida, donde más: 33 / 40 / 46.
  assert.deepEqual(
    ['bloom', 'noir', 'oliva'].map((id) => getThemeDefinition(id)!.defaults.escalaTexto?.bienvenida),
    [33, 40, 46],
  );
});

test('escalaTexto: un estudio SIN tema de esta tanda no declara ninguna var de texto', () => {
  // La regresión cara: estos tamaños no deben cambiarle el portal a nadie más.
  const v = themeToCssVars(DEFAULT_THEME) as Record<string, string>;
  assert.equal(Object.keys(v).some((k) => k.startsWith('--portal-text-')), false);
  // Y con tema, las SEIS. Seis y no siete: el `timer` del encargo no se
  // declara porque el portal no tiene pantalla de sesión guiada.
  const oliva = themeToCssVars({ ...DEFAULT_THEME, ...getThemeDefinition('oliva')!.defaults }) as Record<string, string>;
  assert.equal(Object.keys(oliva).filter((k) => k.startsWith('--portal-text-')).length, 6);
  assert.equal(oliva['--portal-text-seccion'], '17px');
});
