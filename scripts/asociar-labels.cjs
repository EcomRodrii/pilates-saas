// Asocia cada <label> suelto con su control hermano (WCAG 1.3.1 / 4.1.2)
// usando el AST de TypeScript, no expresiones regulares sobre JSX.
//
// Un intento previo con regex falló de dos formas: casaba la llave de una
// anotación de tipo en vez de la del cuerpo del componente, e ignoraba los
// componentes escritos como arrow function. El AST elimina ambos problemas
// porque da posiciones exactas y el nodo de función real.
const ts = require('typescript');
const fs = require('fs');

const CONTROLES = new Set(['input', 'select', 'textarea']);
const nombreTag = n => (n.tagName && n.tagName.getText ? n.tagName.getText() : '');
const esLabel = n => (ts.isJsxElement(n) && nombreTag(n.openingElement) === 'label');
const tieneHtmlFor = oe => oe.attributes.properties.some(p => p.name && p.name.getText() === 'htmlFor');
const esControl = n => {
  const t = ts.isJsxSelfClosingElement(n) ? nombreTag(n) : (ts.isJsxElement(n) ? nombreTag(n.openingElement) : '');
  return CONTROLES.has(t);
};
// ¿el label envuelve ya un control? entonces está asociado por anidamiento
function envuelveControl(node) {
  let found = false;
  const walk = n => { if (found) return; if (esControl(n)) { found = true; return; } n.forEachChild(walk); };
  node.children.forEach(walk);
  return found;
}
function funcionContenedora(n) {
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p))
        && p.body && ts.isBlock(p.body)) return p;
  }
  return null;
}

function procesar(ruta) {
  const src = fs.readFileSync(ruta, 'utf8');
  const sf = ts.createSourceFile(ruta, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];        // {pos, texto}
  const bloques = new Map(); // funcion -> contador
  let n = 0;

  const visitar = nodo => {
    if (esLabel(nodo) && !tieneHtmlFor(nodo.openingElement) && !envuelveControl(nodo)) {
      const padre = nodo.parent;
      const hermanos = padre && padre.children ? padre.children : null;
      if (hermanos) {
        const i = hermanos.indexOf(nodo);
        const sig = hermanos.slice(i + 1).find(c => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
        if (sig && esControl(sig)) {
          const fn = funcionContenedora(nodo);
          if (fn) {
            const k = (bloques.get(fn) || 0) + 1;
            bloques.set(fn, k);
            const clave = '{`${uid}-' + k + '`}';
            edits.push({ pos: nodo.openingElement.getStart() + '<label'.length, texto: ` htmlFor=${clave}` });
            const abre = ts.isJsxSelfClosingElement(sig) ? sig : sig.openingElement;
            edits.push({ pos: abre.getStart() + 1 + nombreTag(abre).length, texto: ` id=${clave}` });
            n++;
          }
        }
      }
    }
    nodo.forEachChild(visitar);
  };
  visitar(sf);
  if (!n) return { n: 0 };

  for (const [fn] of bloques) edits.push({ pos: fn.body.getStart() + 1, texto: '\n  const uid = useId();' });

  let out = src;
  edits.sort((a, b) => b.pos - a.pos).forEach(e => { out = out.slice(0, e.pos) + e.texto + out.slice(e.pos); });
  if (!/\buseId\b/.test(src)) {
    out = out.replace(/import \{([^}]*)\} from 'react';?/, (m, g) => `import {${g.replace(/\s*$/, '')}, useId } from 'react';`);
  }
  return { n, out };
}

const rutas = process.argv.slice(2).filter(a => a !== '--write');
const write = process.argv.includes('--write');
let total = 0;
for (const r of rutas) {
  const { n, out } = procesar(r);
  if (n) { total += n; if (write) fs.writeFileSync(r, out); console.log(`  ${r}: ${n}`); }
}
console.log(`  TOTAL: ${total}`);
