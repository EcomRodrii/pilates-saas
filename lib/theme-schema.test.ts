import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  themeConfigSchema,
  resolveTheme,
  DEFAULT_THEME,
  FUENTES,
  RADIOS,
  instalarTema,
  CAMPOS_DEL_TEMA,
  CAMPOS_DEL_ESTUDIO,
  RESERVAR_VACIO_TITULO_MAX,
  type ThemeConfig, POSICION_FOTO } from './theme-schema.ts';

test('themeConfigSchema acepta un tema completo válido', () => {
  const r = themeConfigSchema.safeParse({
    primary: '#4F46E5',
    secondary: '#22D3EE',
    accent: '#FDE68A',
    background: '#FFFFFF',
    text: '#111111',
    fontId: 'inter',
    radius: 'pill',
    faviconUrl: 'https://cdn.example.com/f.ico',
  });
  assert.equal(r.success, true);
});

test('themeConfigSchema rechaza hex inválido y claves extra (strict)', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, primary: 'rojo' }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, extra: 1 }).success, false);
});

test('themeConfigSchema rechaza fontId/radius fuera del set curado', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, fontId: 'comic-sans' }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, radius: 'huge' }).success, false);
});

test('resolveTheme: null/garbage → tema por defecto completo', () => {
  assert.deepEqual(resolveTheme(null), DEFAULT_THEME);
  assert.deepEqual(resolveTheme('nope'), DEFAULT_THEME);
  assert.deepEqual(resolveTheme(42), DEFAULT_THEME);
});

test('resolveTheme: parcial rellena solo los tokens ausentes', () => {
  const r = resolveTheme({ primary: '#000000', fontId: 'serif' });
  assert.equal(r.primary, '#000000');
  assert.equal(r.fontId, 'serif');
  assert.equal(r.background, DEFAULT_THEME.background); // ausente → default
  assert.equal(r.radius, DEFAULT_THEME.radius);
});

test('resolveTheme: fallback POR TOKEN ante un valor inválido', () => {
  const r = resolveTheme({ primary: '#123456', secondary: 'no-es-hex' });
  assert.equal(r.primary, '#123456'); // válido, se respeta
  assert.equal(r.secondary, DEFAULT_THEME.secondary); // inválido → default, sin tumbar el resto
});

test('resolveTheme: faviconUrl inválido → null', () => {
  assert.equal(resolveTheme({ faviconUrl: 'no-url' }).faviconUrl, null);
  assert.equal(resolveTheme({ faviconUrl: 'https://x.com/f.ico' }).faviconUrl, 'https://x.com/f.ico');
});

test('registros curados coherentes', () => {
  assert.ok(FUENTES.some((f) => f.id === 'jakarta'));
  assert.deepEqual(
    RADIOS.map((r) => r.id),
    ['sharp', 'rounded', 'pill'],
  );
});

test('themeConfigSchema: buttonStyle/cardStyle ausentes → default solid/flat (tema guardado antes de esta fase)', () => {
  const sinEstilos: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinEstilos.buttonStyle;
  delete sinEstilos.cardStyle;
  const r = themeConfigSchema.safeParse(sinEstilos);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.buttonStyle, 'solid');
    assert.equal(r.data.cardStyle, 'flat');
  }
});

test('themeConfigSchema rechaza buttonStyle/cardStyle fuera del set curado', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, buttonStyle: 'glow' }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, cardStyle: 'glass' }).success, false);
});

test('resolveTheme: buttonStyle/cardStyle inválidos caen a solid/flat', () => {
  const r = resolveTheme({ buttonStyle: 'glow', cardStyle: 'glass' });
  assert.equal(r.buttonStyle, 'solid');
  assert.equal(r.cardStyle, 'flat');
});

test('themeConfigSchema: galería de temas ausente → defaults (tema guardado antes de esta fase)', () => {
  const sinGaleria: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinGaleria.portalHeadingFontId;
  delete sinGaleria.themeId;
  delete sinGaleria.themeVersion;
  delete sinGaleria.themeCustomized;
  const r = themeConfigSchema.safeParse(sinGaleria);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.portalHeadingFontId, 'instrumentSerif');
    assert.equal(r.data.themeId, 'classic');
    assert.equal(r.data.themeVersion, 1);
    assert.equal(r.data.themeCustomized, false);
  }
});

test('themeConfigSchema rechaza portalHeadingFontId fuera del set curado', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, portalHeadingFontId: 'papyrus' }).success, false);
});

test('resolveTheme: portalHeadingFontId inválido cae a instrumentSerif; themeId/version/customized se respetan si son válidos', () => {
  const r = resolveTheme({ portalHeadingFontId: 'papyrus', themeId: 'geometric', themeVersion: 1, themeCustomized: true });
  assert.equal(r.portalHeadingFontId, 'instrumentSerif');
  assert.equal(r.themeId, 'geometric');
  assert.equal(r.themeVersion, 1);
  assert.equal(r.themeCustomized, true);
});

test('themeConfigSchema: tabBarStyle ausente → default clasica (tema guardado antes de esta fase)', () => {
  const sinTabBar: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinTabBar.tabBarStyle;
  const r = themeConfigSchema.safeParse(sinTabBar);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.tabBarStyle, 'clasica');
});

test('themeConfigSchema acepta instrumentSansBold y tabBarStyle pestanaActiva (tema Editorial)', () => {
  const r = themeConfigSchema.safeParse({ ...DEFAULT_THEME, portalHeadingFontId: 'instrumentSansBold', tabBarStyle: 'pestanaActiva' });
  assert.equal(r.success, true);
});

test('resolveTheme: tabBarStyle inválido cae a clasica', () => {
  assert.equal(resolveTheme({ tabBarStyle: 'flotante' }).tabBarStyle, 'clasica');
});

test('themeConfigSchema: barraOscura ausente → false (tema guardado antes del tema Noir)', () => {
  const sinBarra: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinBarra.barraOscura;
  const r = themeConfigSchema.safeParse(sinBarra);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.barraOscura, false);
});

test('resolveTheme: barraOscura no booleana cae a false; true se respeta', () => {
  assert.equal(resolveTheme({ barraOscura: 'si' }).barraOscura, false);
  assert.equal(resolveTheme(null).barraOscura, false);
  assert.equal(resolveTheme({ barraOscura: true }).barraOscura, true);
});

test('themeConfigSchema: barraFlotante/destacado/radioTema ausentes → false/null/undefined (tema guardado antes de esta fase)', () => {
  const sinCampos: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinCampos.barraFlotante;
  delete sinCampos.destacado;
  delete sinCampos.radioTema;
  const r = themeConfigSchema.safeParse(sinCampos);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.barraFlotante, false);
    assert.equal(r.data.destacado, null);
    assert.equal(r.data.radioTema, undefined);
  }
});

test('resolveTheme: barraFlotante/destacado/radioTema — inválidos caen al default, válidos se respetan', () => {
  assert.equal(resolveTheme({ barraFlotante: 'si' }).barraFlotante, false);
  assert.equal(resolveTheme({ barraFlotante: true }).barraFlotante, true);
  assert.equal(resolveTheme({ destacado: 'no-es-hex' }).destacado, null);
  assert.equal(resolveTheme({ destacado: '#D9B166' }).destacado, '#D9B166');
  assert.deepEqual(resolveTheme({ radioTema: 'nope' }).radioTema, undefined);
  assert.deepEqual(resolveTheme({ radioTema: { card: 30 } }).radioTema, { card: 30 });
});

test('themeConfigSchema: barraClasica ausente → false (tema guardado antes de esta fase)', () => {
  const sinCampo: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinCampo.barraClasica;
  const r = themeConfigSchema.safeParse(sinCampo);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.barraClasica, false);
});

test('resolveTheme: barraClasica no booleano cae a false; true se respeta', () => {
  assert.equal(resolveTheme({ barraClasica: 'si' }).barraClasica, false);
  assert.equal(resolveTheme(null).barraClasica, false);
  assert.equal(resolveTheme({ barraClasica: true }).barraClasica, true);
});

test('themeConfigSchema: portalHeadingFontId acepta "poppins" (tema Bloom)', () => {
  const r = themeConfigSchema.safeParse({ ...DEFAULT_THEME, portalHeadingFontId: 'poppins' });
  assert.equal(r.success, true);
});

test('themeConfigSchema: navPortal ausente → default sin ocultos/etiquetas/iconos (tema guardado antes de la Fase 2)', () => {
  const sinNav: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinNav.navPortal;
  const r = themeConfigSchema.safeParse(sinNav);
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.navPortal, { ocultos: [], etiquetas: {}, iconos: {} });
});

test('themeConfigSchema acepta navPortal con pestañas ocultas, renombradas y con icono distinto', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    navPortal: { ocultos: ['videos'], etiquetas: { clases: 'Agenda' }, iconos: { bonos: 'Star' } },
  });
  assert.equal(r.success, true);
});

test('themeConfigSchema rechaza un icono de navPortal fuera del catálogo curado', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    navPortal: { ocultos: [], etiquetas: {}, iconos: { clases: 'IconoInventado' } },
  });
  assert.equal(r.success, false);
});

test('resolveTheme: navPortal corrupto no lanza y cae al default', () => {
  assert.doesNotThrow(() => resolveTheme({ navPortal: 'basura' }));
  assert.deepEqual(resolveTheme({ navPortal: 'basura' }).navPortal, { ocultos: [], etiquetas: {}, iconos: {} });
});

// Compatibilidad hacia atrás con los temas que YA están guardados en producción:
// se publicaron con tres claves, antes de que TikTok existiera. Con campos
// `z.string()` sin default, este `.strict()` los habría rechazado enteros y el
// estudio habría perdido de vista sus tres redes de siempre al republicar.
test('themeConfigSchema: un redesSociales de TRES claves (tema ya publicado) sigue valiendo', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    redesSociales: { instagram: '@x', facebook: '', whatsapp: '' },
  });
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.redesSociales, { instagram: '@x', facebook: '', tiktok: '', whatsapp: '' });
});

test('themeConfigSchema: redesSociales ausente → default vacío (tema guardado antes de la Fase 3)', () => {
  const sinRedes: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinRedes.redesSociales;
  const r = themeConfigSchema.safeParse(sinRedes);
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.redesSociales, { instagram: '', facebook: '', tiktok: '', whatsapp: '' });
});

test('themeConfigSchema acepta redesSociales con las cuatro cuentas', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    redesSociales: { instagram: 'https://instagram.com/x', facebook: 'https://facebook.com/x', tiktok: 'https://tiktok.com/@x', whatsapp: 'https://wa.me/34600000000' },
  });
  assert.equal(r.success, true);
});

test('themeConfigSchema rechaza claves extra en redesSociales (strict)', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    redesSociales: { instagram: '', facebook: '', tiktok: '', whatsapp: '', threads: 'https://threads.net/@x' },
  });
  assert.equal(r.success, false);
});

test('resolveTheme: redesSociales corrupto no lanza y cae al default vacío', () => {
  assert.doesNotThrow(() => resolveTheme({ redesSociales: 'basura' }));
  assert.deepEqual(resolveTheme({ redesSociales: 'basura' }).redesSociales, { instagram: '', facebook: '', tiktok: '', whatsapp: '' });
});

// ── Variantes de forma por bloque ───────────────────────────────────────────

test('themeConfigSchema: `variantes` ausente → undefined (tema guardado antes de esta fase)', () => {
  const r = themeConfigSchema.safeParse({ ...DEFAULT_THEME });
  assert.equal(r.success, true);
  assert.equal(r.data!.variantes, undefined);
});

test('themeConfigSchema acepta variantes válidas y rechaza un valor fuera del catálogo', () => {
  const ok = themeConfigSchema.safeParse({ ...DEFAULT_THEME, variantes: { accesosRapidos: 'circulos', barra: 'todas' } });
  assert.equal(ok.success, true);
  const mal = themeConfigSchema.safeParse({ ...DEFAULT_THEME, variantes: { accesosRapidos: 'espiral' } });
  assert.equal(mal.success, false);
});

test('resolveTheme: `variantes` corrupto cae a undefined (dirección segura: el look de siempre)', () => {
  // `.strict()` + clave desconocida tumba el objeto entero; `pick` lo deja en
  // undefined, que es "sin variantes" = aspecto de hoy. Nunca un estado a medias.
  const r = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', variantes: { ejeInventado: 'x' } });
  assert.equal(r.variantes, undefined);
  // Y uno válido sí se respeta.
  const ok = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', variantes: { retos: 'color' } });
  assert.deepEqual(ok.variantes, { retos: 'color' });
});


// ── Instalar un tema SUSTITUYE, no fusiona ──────────────────────────────────
//
// ⚠️ El bug que motivó esto se encontró en un estudio REAL: su borrador tenía
// `barraOscura`, `barraClasica` Y `barraFlotante` a `true` a la vez, con
// `themeId: 'oliva'`. `instalar()` hacía `{ ...draft, ...defaults }` y ese
// `...draft` conservaba todo eje que el tema nuevo no declarase. El gate de
// contraste llegó a avisar de "la barra oscura" en un tema que no la tiene.

test('instalarTema: los ejes del tema anterior NO sobreviven', () => {
  const conNoir: ThemeConfig = {
    ...DEFAULT_THEME, themeId: 'noir', barraOscura: true, destacado: '#D9B166',
  };
  const oliva = instalarTema(conNoir, { barraClasica: true, primary: '#3D4A2F' },
    { themeId: 'oliva', themeVersion: 5 });

  assert.equal(oliva.barraOscura, false, 'la barra oscura de Noir ha sobrevivido');
  assert.equal(oliva.barraFlotante, false);
  assert.equal(oliva.barraClasica, true);
  assert.equal(oliva.destacado, null, 'el destacado de Noir ha sobrevivido');
  assert.equal(oliva.primary, '#3D4A2F');
  assert.equal(oliva.themeId, 'oliva');
  assert.equal(oliva.themeCustomized, false);
});

test('instalarTema: lo que es del ESTUDIO y no del tema sí sobrevive', () => {
  const draft: ThemeConfig = {
    ...DEFAULT_THEME,
    faviconUrl: 'https://estudio/favicon.png',
    redesSociales: { instagram: '@miestudio', facebook: '', tiktok: '@miestudio', whatsapp: '600' },
  };
  const noir = instalarTema(draft, { barraOscura: true }, { themeId: 'noir', themeVersion: 6 });

  // Cambiar de tema no puede borrarle el favicon ni las redes al estudio.
  assert.equal(noir.faviconUrl, 'https://estudio/favicon.png');
  assert.equal(noir.redesSociales.instagram, '@miestudio');
  assert.equal(noir.redesSociales.tiktok, '@miestudio');
});

test('instalarTema: clona los objetos anidados del tema', () => {
  const defaults = { variantes: { barra: 'todasRelleno' as const }, radioTema: { card: 26 } };
  const a = instalarTema(DEFAULT_THEME, defaults, { themeId: 'oliva', themeVersion: 5 });
  const b = instalarTema(DEFAULT_THEME, defaults, { themeId: 'oliva', themeVersion: 5 });
  a.variantes!.barra = 'etiquetas';
  // Sin clonar, los dos estudios compartirían la referencia de la constante
  // del módulo y tocar uno cambiaría el otro.
  assert.equal(b.variantes!.barra, 'todasRelleno');
});

// ⚠️ EL GUARDIÁN DE FUTURO. Sin esto, añadir un campo a `ThemeConfig` y
// olvidarse de clasificarlo reabre el bug en silencio: si es del tema y no se
// resetea, se acumula; si es del estudio y se resetea, se le borra al cliente.
test('todo campo de ThemeConfig está clasificado: o del tema, o del estudio', () => {
  const clasificados = new Set<string>([...CAMPOS_DEL_TEMA, ...CAMPOS_DEL_ESTUDIO]);
  const sinClasificar = Object.keys(DEFAULT_THEME).filter((k) => !clasificados.has(k));
  assert.deepEqual(sinClasificar, [],
    'campos nuevos en ThemeConfig sin decidir si los borra o los conserva instalar un tema');
});

// ── Encuadre de la foto del estudio ────────────────────────────────────────
// Nace de un caso real: el primer estudio cuya foto llegó al portal tenía
// subido un primer plano de una cara, y `center` dejaba el logo sobre la boca.

test('themeConfigSchema: fotoEncuadre ausente → centro (tema guardado antes de este token)', () => {
  const sinEncuadre = { ...DEFAULT_THEME } as Record<string, unknown>;
  delete sinEncuadre.fotoEncuadre;
  const r = themeConfigSchema.safeParse(sinEncuadre);
  assert.ok(r.success);
  if (r.success) assert.equal(r.data.fotoEncuadre, 'centro');
});

test('resolveTheme: un fotoEncuadre inventado cae a centro; los tres válidos se respetan', () => {
  assert.equal(resolveTheme({ ...DEFAULT_THEME, fotoEncuadre: 'diagonal' }).fotoEncuadre, 'centro');
  assert.equal(resolveTheme({ ...DEFAULT_THEME, fotoEncuadre: 7 }).fotoEncuadre, 'centro');
  for (const v of ['arriba', 'centro', 'abajo'] as const) {
    assert.equal(resolveTheme({ ...DEFAULT_THEME, fotoEncuadre: v }).fotoEncuadre, v);
  }
});

test('POSICION_FOTO cubre los tres encuadres y son background-position válidos', () => {
  assert.deepEqual(POSICION_FOTO, {
    arriba: 'center top',
    centro: 'center center',
    abajo: 'center bottom',
  });
});

test('⚠️ los textos de VOZ son del ESTUDIO, no del tema', () => {
  // Estar clasificado no basta: el test de cobertura de arriba pasa igual si un
  // campo cae en el grupo equivocado. Y el grupo equivocado aquí NO es un
  // detalle — `CAMPOS_DEL_TEMA` se sobrescribe al instalar otro tema (decisión
  // explícita: instalar es un reset, no un merge), así que probar un tema nuevo
  // le borraría a la propietaria lo que escribió para sus clientas.
  const voz = [
    'reservarAvisoQuiz', 'reservarVacioTitulo', 'reservarVacioTexto',
    'reservarConfirmacion', 'reservarListaEspera', 'reservarAyuda', 'reservarComoFunciona',
  ];
  for (const campo of voz) {
    assert.ok(
      (CAMPOS_DEL_ESTUDIO as readonly string[]).includes(campo),
      `${campo} debe sobrevivir a instalar otro tema`,
    );
  }
});

test('un texto de voz demasiado largo no se guarda a medias', () => {
  // El editor corta con `maxLength`, pero el esquema es la cerradura real: el
  // valor también llega por la API al publicar.
  //
  // ⚠️ Con la base completa a propósito. La primera versión de este test
  // pasaba un objeto con SOLO este campo y daba verde — pero por el motivo
  // equivocado: `themeConfigSchema` exige los campos base, así que fallaba
  // igual con un texto corto y no probaba nada sobre la longitud.
  const base = {
    primary: '#4F46E5', secondary: '#22D3EE', accent: '#FDE68A',
    background: '#FFFFFF', text: '#111111', fontId: 'inter', radius: 'pill',
    faviconUrl: null,
  };
  const largo = 'x'.repeat(RESERVAR_VACIO_TITULO_MAX + 1);
  assert.equal(themeConfigSchema.safeParse({ ...base, reservarVacioTitulo: largo }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...base, reservarVacioTitulo: 'Hoy descansamos' }).success, true);
});

test('resolveTheme deja vacíos los textos de voz cuando no hay nada guardado', () => {
  // Vacío es la señal de «usa el de fábrica». Si `resolveTheme` inventara aquí
  // un texto por defecto, la página no podría distinguir «no ha escrito nada»
  // de «ha escrito justo eso», y el día que cambie el texto de fábrica no se
  // actualizaría para nadie.
  const r = resolveTheme({});
  assert.equal(r.reservarAvisoQuiz, '');
  assert.equal(r.reservarListaEspera, '');
});
