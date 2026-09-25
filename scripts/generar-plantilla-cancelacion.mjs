// Genera la plantilla Word de política de cancelación que se descarga desde
// /recursos/politica-de-cancelacion-de-clases (lib/recursos/descargas.ts).
//
// Sale del TEXTO de la guía publicada, no de una copia a mano: si cambian las
// cláusulas de la guía, se vuelve a correr y la plantilla dice lo mismo.
//
//   npm i --no-save docx@9
//   node --experimental-strip-types scripts/generar-plantilla-cancelacion.mjs /tmp/plantilla.docx
//
// Después: copiarla a public/recursos/descargas/ con los 10 primeros caracteres
// de su sha256 en el nombre (`shasum -a 256`) y cambiar `archivo` en
// lib/recursos/descargas.ts. El hash en el nombre hace que una versión nueva no
// choque con la vieja en la caché de nadie.
//
// `docx` no está en package.json a propósito: solo lo usa este script, y una
// dependencia más pesa en cada instalación de CI para algo que se corre a mano
// una vez cada mucho.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat,
  Footer, BorderStyle, ShadingType,
} = require('docx');
const art = (await import('../lib/recursos/articulos/politica-de-cancelacion-de-clases.ts')).default;

const OLIVA = '343825';
const GRIS = '5A5A52';
const FUENTE = 'Arial';

const seccion = (id) => art.secciones.find((s) => s.id === id);
const plantilla = seccion('plantilla');
const intro = plantilla.bloques.find((b) => b.t === 'p').texto;
const clausulas = plantilla.bloques.find((b) => b.t === 'pasos').items;
const aplicar = seccion('como-aplicarla').bloques.find((b) => b.t === 'lista').items;

// Lo que va entre corchetes se resalta para que salte a la vista qué hay que
// rellenar. Los corchetes pueden ir anidados («[y tiene [60] minutos…]»), así
// que se cuenta la profundidad en vez de usar una expresión regular.
function runsConHuecos(texto, base = {}) {
  const runs = [];
  let buf = '';
  let prof = 0;
  const volcar = (resaltar) => {
    if (!buf) return;
    runs.push(new TextRun({ text: buf, font: FUENTE, size: 22, ...base, ...(resaltar ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFF1B8' } } : {}) }));
    buf = '';
  };
  for (const ch of texto) {
    if (ch === '[') { if (prof === 0) volcar(false); prof++; buf += ch; continue; }
    if (ch === ']') { buf += ch; prof = Math.max(0, prof - 1); if (prof === 0) volcar(true); continue; }
    buf += ch;
  }
  volcar(prof > 0);
  return runs;
}

// **negrita** del marcado mínimo de las guías.
function runsMarcado(texto) {
  const out = [];
  texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach((trozo) => {
    const negrita = trozo.startsWith('**');
    out.push(new TextRun({ text: negrita ? trozo.slice(2, -2) : trozo, bold: negrita, font: FUENTE, size: 22 }));
  });
  return out;
}

const p = (children, opts = {}) => new Paragraph({ children, spacing: { after: 120, line: 300 }, ...opts });

const doc = new Document({
  creator: 'Tentare',
  title: 'Plantilla de política de cancelación de clases',
  description: 'Plantilla para estudios de pilates',
  styles: {
    default: { document: { run: { font: FUENTE, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: FUENTE, color: OLIVA }, paragraph: { spacing: { before: 120, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FUENTE, color: OLIVA }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: FUENTE, color: '1B1C17' }, paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Plantilla de Tentare · tentare.app/recursos/politica-de-cancelacion-de-clases', font: FUENTE, size: 16, color: GRIS })],
      })] }),
    },
    children: [
      new Paragraph({ children: [new TextRun({ text: 'PLANTILLA · TENTARE', font: FUENTE, size: 16, bold: true, color: GRIS, characterSpacing: 40 })], spacing: { after: 60 } }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Política de cancelación de clases' })] }),
      // Cómo usarla, en un recuadro claro.
      new Paragraph({
        children: [new TextRun({ text: 'Cómo usarla. ', bold: true, font: FUENTE, size: 21 }), new TextRun({ text: intro, font: FUENTE, size: 21 })],
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F2EA' },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: OLIVA, space: 8 } },
        spacing: { before: 120, after: 240, line: 300 },
        indent: { left: 160, right: 160 },
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [...runsConHuecos('Condiciones de reserva y cancelación de [nombre del estudio]')] }),
      ...clausulas.flatMap((c, i) => [
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: `${i + 1}. ${c.titulo}` })] }),
        p(runsConHuecos(c.texto)),
      ]),
      new Paragraph({ children: [], spacing: { after: 120 } }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Cómo aplicarla sin discusiones' })], pageBreakBefore: true }),
      ...aplicar.map((item) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, children: runsMarcado(item), spacing: { after: 120, line: 300 } })),
      new Paragraph({ children: [], spacing: { after: 120 } }),
      p([
        new TextRun({ text: 'La guía completa, con lo que dice la ley y lo que piden los estudios españoles: ', font: FUENTE, size: 21, color: GRIS }),
        new TextRun({ text: 'tentare.app/recursos/politica-de-cancelacion-de-clases', font: FUENTE, size: 21, color: OLIVA, bold: true }),
      ]),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(process.argv[2], buf);
console.log('ok', buf.length, 'bytes,', clausulas.length, 'cláusulas,', aplicar.length, 'consejos');
