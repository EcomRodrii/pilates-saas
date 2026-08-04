import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  themeConfigSchema,
  resolveTheme,
  DEFAULT_THEME,
  FUENTES,
  RADIOS,
} from './theme-schema.ts';

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

test('themeConfigSchema: redesSociales ausente → default vacío (tema guardado antes de la Fase 3)', () => {
  const sinRedes: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinRedes.redesSociales;
  const r = themeConfigSchema.safeParse(sinRedes);
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.redesSociales, { instagram: '', facebook: '', whatsapp: '' });
});

test('themeConfigSchema acepta redesSociales con las tres cuentas', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    redesSociales: { instagram: 'https://instagram.com/x', facebook: 'https://facebook.com/x', whatsapp: 'https://wa.me/34600000000' },
  });
  assert.equal(r.success, true);
});

test('themeConfigSchema rechaza claves extra en redesSociales (strict)', () => {
  const r = themeConfigSchema.safeParse({
    ...DEFAULT_THEME,
    redesSociales: { instagram: '', facebook: '', whatsapp: '', tiktok: 'https://tiktok.com/@x' },
  });
  assert.equal(r.success, false);
});

test('resolveTheme: redesSociales corrupto no lanza y cae al default vacío', () => {
  assert.doesNotThrow(() => resolveTheme({ redesSociales: 'basura' }));
  assert.deepEqual(resolveTheme({ redesSociales: 'basura' }).redesSociales, { instagram: '', facebook: '', whatsapp: '' });
});
