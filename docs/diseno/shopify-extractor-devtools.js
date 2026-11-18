/*
 * Extractor de diseño para DevTools (solo lectura: no envía nada a ningún sitio).
 *
 * Uso: abre una pantalla del admin de Shopify, pulsa ⌥⌘I (Consola), pega TODO este archivo y Enter.
 * Al terminar descarga `shopify-diseno-<pantalla>.json` y lo copia al portapapeles.
 * Repite en cada pantalla (Inicio, Productos, Pedidos, Informes, Configuración…) y con los
 * estados que quieras ver: menú abierto, asistente abierto, pasar el ratón NO hace falta (ver `:hover` abajo).
 *
 * Qué saca:
 *  - variables CSS (`--p-*`, Polaris) de :root, con su valor resuelto;
 *  - una muestra de cada ELEMENTO ÚNICO visible (por huella de estilos): rectángulo, fuente, color, fondo,
 *    degradados, backdrop-filter, sombras, bordes, radios, transiciones, animaciones, z-index…;
 *  - los pseudo-elementos ::before / ::after que dibujan algo (el «vidrio» del buscador vive ahí);
 *  - los @keyframes y las reglas :hover / :focus-visible / :active de las hojas legibles;
 *  - las animaciones que están corriendo ahora (duración, curva, fotogramas);
 *  - las fuentes cargadas.
 */
(async () => {
  const PROPS = [
    'display','position','zIndex','width','height','padding','margin','gap',
    'fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','textDecoration',
    'color','backgroundColor','backgroundImage','backdropFilter','filter','mixBlendMode','opacity',
    'border','borderRadius','boxShadow','outline','overflow','transform','transformOrigin',
    'transition','animation','cursor',
  ];
  const DEFAULTS = new Set(['none','normal','auto','0px','rgba(0, 0, 0, 0)','visible','0','1','static','block','inline','baseline','start','repeat','medium']);
  const rect = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const sel = (e) => {
    const p = []; let n = e;
    while (n && n.nodeType === 1 && p.length < 4) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += '#' + n.id; p.unshift(s); break; }
      const r = n.getAttribute('role'); if (r) s += `[role=${r}]`;
      const dc = [...n.attributes].find((a) => /^data-(testid|id|polaris|navigation|sidebar)/.test(a.name)); if (dc) s += `[${dc.name}=${dc.value.slice(0, 30)}]`;
      p.unshift(s); n = n.parentElement;
    }
    return p.join(' > ');
  };
  const styles = (cs) => { const o = {}; for (const p of PROPS) { const v = cs[p]; if (v && !DEFAULTS.has(v)) o[p] = v; } return o; };
  const visible = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 2 && b.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden'; };

  // 1 · Variables CSS
  const vars = {};
  const rootCS = getComputedStyle(document.documentElement);
  const rules = [];
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) rules.push(r); } catch (_) { /* hoja de otro origen */ } }
  const walk = (list, fn) => { for (const r of list) { fn(r); if (r.cssRules) walk(r.cssRules, fn); } };
  walk(rules, (r) => {
    if (r.style) for (const n of r.style) if (n.startsWith('--')) vars[n] = rootCS.getPropertyValue(n).trim() || r.style.getPropertyValue(n).trim();
  });

  // 2 · Elementos únicos
  const seen = new Map();
  const all = [...document.querySelectorAll('body *')].filter(visible);
  for (const e of all) {
    const cs = getComputedStyle(e);
    const st = styles(cs);
    const own = (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ? e.textContent.trim().slice(0, 40) : '';
    const dibuja = cs.backgroundImage !== 'none' || cs.backdropFilter !== 'none' || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderStyle !== 'none' || own;
    if (!dibuja) continue;
    const key = JSON.stringify(st) + (own ? '|t' : '');
    if (seen.has(key)) { seen.get(key).veces++; continue; }
    seen.set(key, { selector: sel(e), texto: own, rect: rect(e), estilos: st, veces: 1 });
  }

  // 3 · Pseudo-elementos que dibujan
  const pseudos = [];
  for (const e of all) {
    for (const ps of ['::before', '::after']) {
      const cs = getComputedStyle(e, ps);
      if (cs.content === 'none' || cs.content === 'normal') continue;
      const d = cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderStyle !== 'none';
      if (d) pseudos.push({ selector: sel(e) + ps, inset: cs.inset, estilos: styles(cs) });
    }
  }

  // 4 · Reglas de interacción y keyframes
  const interaccion = []; const keyframes = {};
  walk(rules, (r) => {
    if (r.type === CSSRule.KEYFRAMES_RULE) keyframes[r.name] = r.cssText.slice(0, 1200);
    else if (r.selectorText && /:(hover|focus-visible|focus|active|disabled)/.test(r.selectorText) && /background|shadow|transform|opacity|color|border|filter/.test(r.cssText)) {
      if (interaccion.length < 400) interaccion.push(r.cssText.slice(0, 400));
    }
  });

  // 5 · Animaciones en marcha
  const animaciones = document.getAnimations().slice(0, 80).map((a) => {
    const t = a.effect?.getTiming?.() ?? {};
    return {
      nombre: a.animationName || a.transitionProperty || '', objetivo: a.effect?.target ? sel(a.effect.target) : '',
      duracion: t.duration, curva: t.easing, retraso: t.delay, iteraciones: t.iterations, direccion: t.direction,
      fotogramas: (a.effect?.getKeyframes?.() ?? []).slice(0, 8).map((k) => ({ offset: k.offset, opacity: k.opacity, transform: k.transform })),
    };
  });

  // 6 · Fuentes
  const fuentes = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`);

  const salida = {
    url: location.pathname, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    variables: vars, elementos: [...seen.values()], pseudoelementos: pseudos, interaccion, keyframes, animaciones, fuentes,
  };
  const txt = JSON.stringify(salida, null, 1);
  try { await navigator.clipboard.writeText(txt); } catch (_) { try { copy(txt); } catch (__) { /* sin portapapeles */ } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
  a.download = `shopify-diseno-${(location.pathname.split('/').filter(Boolean).pop() || 'inicio')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log(`OK · ${salida.elementos.length} elementos únicos · ${pseudos.length} pseudoelementos · ${Object.keys(vars).length} variables · ${Object.keys(keyframes).length} keyframes · ${animaciones.length} animaciones`);
})();
