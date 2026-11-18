/*
 * Extractor de DISEÑO v2 para DevTools (solo lectura, no envía nada a ningún sitio).
 *
 * Saca MEDIDAS Y REGLAS (hechos de diseño), no el código ni los archivos de la página: estructura de
 * regiones, cajas, flex/grid, espaciados, tipografías, colores, sombras, radios, degradados, filtros,
 * transiciones, animaciones, @keyframes, puntos de corte (@media) y estados :hover/:focus/:active.
 *
 * Uso:
 *   1. Abre una pantalla del admin de Shopify (⌥⌘I → Consola) y pega este archivo entero.
 *   2. Para ver el RESPONSIVE: abre el modo dispositivo (⌥⌘I → icono de móvil, o ⇧⌘M) y repite el script
 *      con ancho 390, 768, 1024, 1280 y 1568. Cada pasada descarga su JSON (`...-<ancho>.json`).
 *   3. Pasa los JSON a Claude. Repite en: Inicio, Productos (listado), un producto, Pedidos, Clientes,
 *      Informes y estadísticas, Configuración (general, una sección), con el panel de Sidekick abierto
 *      y con un menú ⋯ / un modal abiertos (el script lee lo que esté en pantalla en ese momento).
 *
 * Lo que NO hace, a propósito: no descarga HTML, JS, CSS, imágenes ni fuentes de la página. Copiar esos
 * archivos a otro producto no es diseño, es copiar su obra; lo que sí se puede reproducir son las medidas.
 */
(async () => {
  const W = innerWidth;
  const PROPS = [
    'display','position','top','right','bottom','left','zIndex','width','height','minWidth','maxWidth','minHeight','maxHeight',
    'flexDirection','flexWrap','flex','alignItems','justifyContent','gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridAutoFlow',
    'padding','margin','overflow','boxSizing',
    'fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','textDecoration','textAlign','whiteSpace','textOverflow',
    'color','backgroundColor','backgroundImage','backgroundSize','backdropFilter','filter','mixBlendMode','opacity',
    'border','borderRadius','boxShadow','outline',
    'transform','transformOrigin','transition','animation','cursor','pointerEvents',
  ];
  const DEF = new Set(['none','normal','auto','0px','rgba(0, 0, 0, 0)','visible','0','1','static','block','inline','baseline','start','repeat','medium','row','nowrap','stretch','content-box','left','0px 0px','initial']);
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const st = (cs) => { const o = {}; for (const p of PROPS) { const v = cs[p]; if (v && !DEF.has(v)) o[p] = v; } return o; };
  const vis = (e) => { if (!e.getBoundingClientRect) return false; const b = e.getBoundingClientRect(); const cs = e.ownerDocument.defaultView.getComputedStyle(e); return b.width > 1 && b.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const tag = (e) => {
    let s = e.tagName.toLowerCase();
    const role = e.getAttribute('role'); if (role) s += `[role=${role}]`;
    const id = e.id && !/^[:«]|\d{4,}/.test(e.id) ? '#' + e.id : ''; s += id;
    for (const a of e.attributes) if (/^data-(testid|test-id|polaris|navigation|state|variant|tone|size)/.test(a.name)) s += `[${a.name}=${String(a.value).slice(0, 24)}]`;
    return s;
  };

  // 0 · Recorrido que ATRAVIESA shadow DOM abiertos e iframes del mismo origen (los componentes de Shopify
  //     —s-internal-*, Informes, Inicio— viven ahí dentro y `querySelectorAll` normal no los ve).
  const hijosDe = (e) => {
    const h = [...(e.shadowRoot ? e.shadowRoot.children : []), ...e.children];
    if (e.tagName === 'IFRAME') { try { if (e.contentDocument?.body) h.push(e.contentDocument.body); } catch (_) { /* otro origen */ } }
    return h;
  };
  const todos = () => { const out = []; const v = (e) => { out.push(e); for (const c of hijosDe(e)) v(c); }; for (const c of hijosDe(document.body)) v(c); return out; };

  // 1 · Esqueleto de la página: 6 niveles de regiones con su caja y su layout (sin textos).
  const esqueleto = (e, d) => {
    if (d > 8 || !vis(e)) return null;
    const cs = e.ownerDocument.defaultView.getComputedStyle(e);
    const hijos = hijosDe(e).map((c) => esqueleto(c, d + 1)).filter(Boolean).slice(0, 14);
    const dibuja = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none' || cs.borderStyle !== 'none' || cs.backgroundImage !== 'none';
    if (!hijos.length && !dibuja && d > 3) return null;
    return { el: tag(e), caja: r(e), css: st(cs), hijos };
  };

  // 2 · Elementos únicos por huella de estilos (texto recortado a 24 caracteres: solo para identificar).
  const vistos = new Map();
  for (const e of todos().filter(vis)) {
    const cs = e.ownerDocument.defaultView.getComputedStyle(e); const s = st(cs);
    const propio = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ? e.textContent.trim().slice(0, 24) : '';
    if (!(propio || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderStyle !== 'none')) continue;
    const k = JSON.stringify(s);
    if (vistos.has(k)) { vistos.get(k).veces++; continue; }
    vistos.set(k, { el: tag(e), muestra: propio, caja: r(e), css: s, veces: 1 });
  }

  // 3 · Pseudoelementos que dibujan (el vidrio, los resplandores, los indicadores).
  const pseudos = [];
  for (const e of todos().filter(vis)) {
    for (const p of ['::before', '::after']) {
      const cs = e.ownerDocument.defaultView.getComputedStyle(e, p);
      if (cs.content === 'none' || cs.content === 'normal') continue;
      if (cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderStyle !== 'none') pseudos.push({ el: tag(e) + p, inset: cs.inset, css: st(cs) });
    }
  }

  // 4 · Hojas legibles: variables, @media (puntos de corte), @keyframes y reglas de estado.
  const reglas = [];
  const docs = [document, ...[...document.querySelectorAll('iframe')].map((f) => { try { return f.contentDocument; } catch (_) { return null; } }).filter(Boolean)];
  for (const d of docs) for (const sh of d.styleSheets) { try { for (const x of sh.cssRules) reglas.push(x); } catch (_) { /* otro origen */ } }
  const recorre = (lista, f, ctx = '') => { for (const x of lista) { f(x, ctx); if (x.cssRules) recorre(x.cssRules, f, x.media ? x.media.mediaText : ctx); } };
  const variables = {}; const consultas = new Set(); const keyframes = {}; const estados = [];
  const raiz = getComputedStyle(document.documentElement);
  recorre(reglas, (x, ctx) => {
    if (x.media) consultas.add(x.media.mediaText);
    if (x.style) for (const n of x.style) if (n.startsWith('--')) variables[n] = raiz.getPropertyValue(n).trim() || x.style.getPropertyValue(n).trim();
    if (x.type === CSSRule.KEYFRAMES_RULE) keyframes[x.name] = x.cssText.slice(0, 1500);
    else if (x.selectorText && /:(hover|focus-visible|active|disabled|checked|selected)/.test(x.selectorText) && /background|shadow|transform|opacity|color|border|filter|outline/.test(x.cssText) && estados.length < 600) estados.push({ en: ctx, regla: x.cssText.slice(0, 420) });
  });

  // 5 · Animaciones en marcha y fuentes.
  const animaciones = docs.flatMap((d) => d.getAnimations()).slice(0, 160).map((a) => {
    const t = a.effect?.getTiming?.() ?? {};
    return { nombre: a.animationName || a.transitionProperty || '', el: a.effect?.target ? tag(a.effect.target) : '', ms: t.duration, curva: t.easing, retraso: t.delay, vueltas: t.iterations, dir: t.direction, fotogramas: (a.effect?.getKeyframes?.() ?? []).slice(0, 10).map((k) => ({ o: k.offset, opacity: k.opacity, transform: k.transform, filter: k.filter })) };
  });
  const fuentes = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`);

  const salida = {
    version: 2, url: location.pathname, ancho: W, alto: innerHeight, dpr: devicePixelRatio,
    esqueleto: esqueleto(document.body, 0),
    elementos: [...vistos.values()], pseudoelementos: pseudos,
    puntosDeCorte: [...consultas].sort(), variables, keyframes, estados, animaciones, fuentes,
  };
  const txt = JSON.stringify(salida);
  try { await navigator.clipboard.writeText(txt); } catch (_) { try { copy(txt); } catch (__) { /* sin portapapeles */ } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
  a.download = `shopify-diseno-v2-${location.pathname.split('/').filter(Boolean).pop() || 'inicio'}-${W}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log(`iframes legibles: ${docs.length - 1} · `);
  console.log(`OK ${W}px · ${salida.elementos.length} elementos · ${pseudos.length} pseudos · ${consultas.size} @media · ${Object.keys(keyframes).length} keyframes · ${estados.length} estados · ${animaciones.length} animaciones`);
})();
