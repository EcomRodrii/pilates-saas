// Genera los dos documentos Word que se descargan a cambio del email desde /recursos:
//
//   · mensajes-llenar-clases-recuperar-alumnas.docx   (guía «Clases valle»)
//   · checklist-mensual-estudio-de-pilates.docx       (guía «Cómo gestionar un estudio de Pilates»)
//
//   npm i --no-save docx@9
//   node scripts/generar-docx-imanes.mjs /tmp/imanes
//
// Después: copiarlos a public/recursos/descargas/ con los 10 primeros caracteres
// de su sha256 en el nombre (`shasum -a 256`) y cambiar `archivo` en
// lib/recursos/descargas.ts. El hash en el nombre evita cachés viejas.
//
// `docx` no está en package.json a propósito: solo lo usa este script (mismo
// criterio que scripts/generar-plantilla-cancelacion.mjs).
//
// Reglas del texto, para que no mienta:
//   · Ni una cifra de «tasa de respuesta» ni de «cuánto funciona»: no hay dato.
//   · Nada de salud ni de cuerpo de la alumna, en ningún mensaje.
//   · Lo que va entre [corchetes] es lo que cambia cada estudio y sale resaltado.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat,
  Footer, BorderStyle, ShadingType,
} = require('docx');

const OLIVA = '343825';
const GRIS = '5A5A52';
const FUENTE = 'Arial';

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

const p = (children, opts = {}) => new Paragraph({ children, spacing: { after: 120, line: 300 }, ...opts });
const t = (text, extra = {}) => new TextRun({ text, font: FUENTE, size: 22, ...extra });
const h2 = (text, opts = {}) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text })], ...opts });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text })] });
const vineta = (texto) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, children: runsConHuecos(texto), spacing: { after: 100, line: 300 } });
const casilla = (texto) => new Paragraph({
  children: [t('☐  ', { size: 24 }), ...runsConHuecos(texto)],
  spacing: { after: 90, line: 290 }, indent: { left: 360, hanging: 360 },
});
const recuadro = (titulo, texto) => new Paragraph({
  children: [new TextRun({ text: `${titulo} `, bold: true, font: FUENTE, size: 21 }), ...runsConHuecos(texto, { size: 21 })],
  shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F2EA' },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: OLIVA, space: 8 } },
  spacing: { before: 120, after: 240, line: 300 },
  indent: { left: 160, right: 160 },
});
const mensaje = (texto) => new Paragraph({
  children: runsConHuecos(texto),
  shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FAFAF7' },
  border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'B9C7A6', space: 8 } },
  spacing: { before: 60, after: 120, line: 300 },
  indent: { left: 200, right: 120 },
});
const etiqueta = (clave, valor) => p([t(`${clave}: `, { bold: true, size: 21, color: GRIS }), ...runsConHuecos(valor, { size: 21 })], { spacing: { after: 60, line: 280 } });

function documento({ titulo, descripcion, pie, hijos }) {
  return new Document({
    creator: 'Tentare',
    title: titulo,
    description: descripcion,
    styles: {
      default: { document: { run: { font: FUENTE, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 34, bold: true, font: FUENTE, color: OLIVA }, paragraph: { spacing: { before: 120, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: FUENTE, color: OLIVA }, paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 23, bold: true, font: FUENTE, color: '1B1C17' }, paragraph: { spacing: { before: 240, after: 60 }, outlineLevel: 2 } },
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
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pie, font: FUENTE, size: 16, color: GRIS })] })] }) },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'PLANTILLA · TENTARE', font: FUENTE, size: 16, bold: true, color: GRIS, characterSpacing: 40 })], spacing: { after: 60 } }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: titulo })] }),
        ...hijos,
      ],
    }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Doce mensajes
// ─────────────────────────────────────────────────────────────────────────────

const MENSAJES = [
  {
    grupo: 'Recuperar a quien se alejó',
    items: [
      {
        titulo: 'Hace tiempo que no te vemos',
        cuando: 'Lleva más de un mes sin venir y todavía tiene bono o cuota.',
        canal: 'WhatsApp, mejor que email.',
        texto: 'Hola [nombre], soy [tu nombre] de [nombre del estudio]. Hace un tiempo que no te vemos por aquí y me acordaba de ti. ¿Todo bien? Si te viene mejor otro horario, dímelo y miro qué puedo hacer. Un abrazo.',
        evita: 'Los reproches («¿por qué no vienes?») y cualquier pregunta sobre su salud o su cuerpo.',
      },
      {
        titulo: 'Tu bono caduca pronto',
        cuando: 'Le quedan sesiones sin usar y su bono caduca en las próximas dos semanas.',
        canal: 'WhatsApp o email. Es un aviso de servicio: le ayuda a no perder lo que ha pagado.',
        texto: 'Hola [nombre], te aviso para que no se te pierda: tu bono tiene [número] sesiones sin usar y caduca el [fecha]. Esta semana quedan sitios el [día y hora] y el [día y hora]. ¿Te reservo uno?',
        evita: 'Presentarlo como una oferta. Es un recordatorio útil, y así se lee.',
      },
      {
        titulo: 'Volvemos tras las vacaciones',
        cuando: 'Septiembre, enero o después de un cierre largo, a quien solía venir.',
        canal: 'WhatsApp o email.',
        texto: 'Hola [nombre], ya hemos vuelto [el día que vuelves]. Tu sitio de los [día y hora] te espera. ¿Retomamos la semana que viene? Si prefieres empezar con calma, puedes volver con una clase suelta, sin compromiso.',
        evita: 'Dar por hecho que sigue interesada: deja una puerta fácil, no una obligación.',
      },
      {
        titulo: 'Dejó la cuota y la puerta sigue abierta',
        cuando: 'Se dio de baja de la cuota hace entre uno y tres meses.',
        canal: 'WhatsApp, una sola vez.',
        texto: 'Hola [nombre], espero que estés genial. Solo quería decirte que aquí tienes siempre las puertas abiertas: si algún día quieres volver, [lo que ofreces, por ejemplo, tu horario de siempre]. Y si hay algo que podríamos haber hecho mejor, me ayudaría mucho saberlo. Gracias por el tiempo que estuviste con nosotras.',
        evita: 'Insistir. Un mensaje, y si no contesta, déjalo.',
      },
    ],
  },
  {
    grupo: 'Llenar las clases flojas',
    items: [
      {
        titulo: 'Un hueco de última hora',
        cuando: 'La clase de hoy o de mañana tiene plazas libres.',
        canal: 'WhatsApp, a quien suele venir a esa franja y te ha dado permiso para escribirle.',
        texto: 'Hola [nombre], hoy a las [hora] tenemos [número] plazas libres en [clase]. Si te apetece, te guardo una. Respóndeme con un «sí» y está hecho.',
        evita: 'Mandarlo a todo el mundo: a quien no es de esa franja le sobra.',
      },
      {
        titulo: 'Prueba un horario nuevo',
        cuando: 'Has abierto o quieres llenar una franja con poca ocupación.',
        canal: 'WhatsApp o email, a las que podrían venir a esa hora.',
        texto: 'Hola [nombre], hemos puesto [clase] los [día] a las [hora] y me encantaría que la probaras. Es una clase [cómo es: más tranquila, con más ritmo…]. Esta semana, tu primera clase en ese horario es [lo que ofreces: gratis, con descuento…].',
        evita: 'Descuentos permanentes: una oferta para estrenar la franja, con fecha de fin.',
      },
      {
        titulo: 'Se ha liberado tu plaza',
        cuando: 'Estaba en lista de espera y se libera una plaza.',
        canal: 'WhatsApp o aviso en la app. Es un aviso de servicio de algo que ella pidió.',
        texto: 'Hola [nombre], se ha liberado una plaza en [clase] el [día] a las [hora], la que estabas esperando. La mantengo hasta las [hora límite]; si no la quieres, pasa a la siguiente persona. ¿Te la confirmo?',
        evita: 'Dejarla sin plazo: sin hora límite, la plaza se queda bloqueada.',
      },
      {
        titulo: 'Trae a una amiga',
        cuando: 'Una clase va floja y tienes alumnas contentas que la frecuentan.',
        canal: 'WhatsApp, a quien viene a esa clase.',
        texto: 'Hola [nombre], el [día] a las [hora] tienes [clase]. Si quieres, trae a una amiga: su primera clase es [lo que ofreces]. Solo tiene que decirme que va de tu parte.',
        evita: 'Apuntar a la amiga a tus mensajes sin que lo pida: para escribirle después, necesitas su permiso.',
      },
    ],
  },
  {
    grupo: 'Convertir y cuidar',
    items: [
      {
        titulo: 'Probó una clase y no volvió',
        cuando: 'Vino a una clase de prueba hace unos días y no ha comprado nada.',
        canal: 'WhatsApp o email, al día siguiente o a los dos días.',
        texto: 'Hola [nombre], gracias por venir a probar [clase] el [día]. ¿Qué tal la clase? Si te quedaste con ganas de más, esta semana tengo sitio el [día] y el [día]. Y si no era lo que buscabas, cuéntamelo: quizá otra clase te encaja mejor.',
        evita: 'Preguntar por cómo se ha sentido su cuerpo: pregunta por la clase, no por ella.',
      },
      {
        titulo: 'Le quedan pocas sesiones',
        cuando: 'Su bono está a punto de agotarse.',
        canal: 'En persona al acabar la clase, o por WhatsApp.',
        texto: 'Hola [nombre], te quedan [número] sesiones en tu bono. Cuando quieras, te cuento las opciones para seguir y eliges la que mejor te vaya. Sin prisa.',
        evita: 'Empujar a la compra: a quien está contenta, basta con que sepa que puede seguir.',
      },
      {
        titulo: 'Después de cancelar tarde',
        cuando: 'Ha cancelado fuera de plazo y no quieres que se sienta mal.',
        canal: 'WhatsApp, ese mismo día.',
        texto: 'Hola [nombre], no pasa nada por lo de hoy; sé que a veces surgen cosas. Para la próxima, si avisas con [24 horas] puedes cambiar tu clase sin perder la sesión. ¿Te reservo otra para esta semana?',
        evita: 'Un tono de multa: recuerda la norma una vez y propón la siguiente clase.',
      },
      {
        titulo: 'Pídele una reseña',
        cuando: 'Lleva varias semanas viniendo con regularidad y se la ve contenta.',
        canal: 'WhatsApp, con el enlace directo.',
        texto: 'Hola [nombre], ¡ya llevas [número] clases con nosotras y da gusto verte! Si estás contenta, ¿me dejarías una reseña en [enlace a tu ficha de Google]? Me ayuda muchísimo a que nos encuentre más gente. Gracias de corazón.',
        evita: 'Ofrecer nada a cambio de la reseña: Google no lo permite.',
      },
    ],
  },
];

function docMensajes() {
  const hijos = [
    recuadro('Cómo usarlos.', 'Copia el mensaje, cambia lo que va entre corchetes (sale resaltado en amarillo) y envíalo por el canal que ya usas con tus alumnas. Están pensados para ser cortos, personales y sin presionar. Escríbelos con tu voz: si uno no suena a ti, cámbialo.'),
    h2('Antes de enviar nada'),
    vineta('Solo a quien ha aceptado que le escribas. Un aviso de servicio (su bono caduca, se ha liberado la plaza que pidió) es una cosa; una promoción es otra, y para promociones necesitas su permiso.'),
    vineta('Deja siempre una forma fácil de decir que no: «si prefieres no recibir más mensajes, dímelo y listo».'),
    vineta('Escribe a pocas personas cada vez y a las que les sirve ese mensaje. Uno a todas se nota y se ignora.'),
    vineta('Nada de salud ni de cuerpo en ningún mensaje: ni para preguntar ni para suponer.'),
  ];
  let n = 0;
  for (const g of MENSAJES) {
    hijos.push(h2(g.grupo));
    for (const m of g.items) {
      n += 1;
      hijos.push(h3(`${n}. ${m.titulo}`));
      hijos.push(etiqueta('Cuándo usarlo', m.cuando));
      hijos.push(etiqueta('Canal', m.canal));
      hijos.push(mensaje(m.texto));
      hijos.push(etiqueta('Evita', m.evita));
    }
  }
  hijos.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  hijos.push(recuadro('Si no quieres hacerlo a mano.', 'En Tentare, la automatización «Clienta ausente» escribe a quien lleva días sin venir y le ofrece volver, y la lista de espera avisa sola cuando se libera una plaza. Estos mensajes te sirven igual como punto de partida para escribir los tuyos.'));
  hijos.push(p([
    t('La guía completa, con cómo detectar y llenar las franjas flojas: ', { size: 21, color: GRIS }),
    t('tentare.app/recursos/ocupacion-clases-valle', { size: 21, color: OLIVA, bold: true }),
  ]));
  return documento({
    titulo: '12 mensajes para llenar tus clases y recuperar alumnas',
    descripcion: 'Mensajes listos para copiar y adaptar para un estudio de pilates',
    pie: 'Plantilla de Tentare · tentare.app/recursos/ocupacion-clases-valle',
    hijos,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Checklist mensual
// ─────────────────────────────────────────────────────────────────────────────

const CHECKLIST = [
  {
    bloque: 'Primera semana: cierra el mes que acaba de terminar',
    items: [
      'Anota lo que se ha cobrado de verdad en el mes y compáralo con lo que esperabas cobrar.',
      'Revisa los cobros fallidos y los pendientes: a quién escribes esta semana, y cuáles ya llevan más de un mes.',
      'Apunta las devoluciones del mes y comprueba que cada una se refleja donde toca.',
      'Mira cuántas altas y cuántas bajas has tenido. Si hay más bajas que altas dos meses seguidos, es tu primera señal.',
    ],
  },
  {
    bloque: 'Alumnas',
    items: [
      'Lista de alumnas que llevan más de un mes sin venir: ¿a quién le escribes con un mensaje personal?',
      'Bonos que caducan en las próximas dos semanas con sesiones sin usar: avisa antes de que se pierdan.',
      'Clases de prueba del mes: ¿cuántas se han quedado? ¿a quién le falta un seguimiento?',
      'Mira quién viene más: una buena forma de agradecerlo es saber su nombre y decírselo.',
    ],
  },
  {
    bloque: 'Clases y ocupación',
    items: [
      'Ocupación por franja del mes: ¿qué clases se llenan casi siempre (te piden más) y cuáles van flojas de forma repetida?',
      'Para cada clase floja, decide una sola cosa: moverla, cambiarle el nombre, promocionarla o quitarla.',
      'Mira si hay lista de espera en alguna franja: es demanda que no estás atendiendo.',
      'Revisa las cancelaciones de última hora: ¿se concentran en una clase o en una persona?',
    ],
  },
  {
    bloque: 'Equipo',
    items: [
      'Cuadra las clases que ha dado cada instructora con lo que le vas a pagar.',
      'Ausencias y bajas próximas: ¿tienes cubiertas las clases de las próximas semanas?',
      'Una conversación corta con cada instructora: qué le funciona y qué le cuesta.',
    ],
  },
  {
    bloque: 'Dinero y obligaciones',
    items: [
      'Suma los gastos del mes (local, instructoras, suministros, software, marketing) y compáralos con el mes anterior.',
      'Calcula tu margen del mes: ingresos sin IVA menos todos los gastos. ¿Cuánto te queda a ti?',
      'Si presentas IVA e IRPF cada trimestre (modelos 303 y 111), los plazos acaban el día 20 de abril, julio y octubre y el 30 de enero. Confírmalo con tu asesoría.',
      'Guarda las facturas de gastos del mes en un solo sitio, con su fecha y su importe.',
    ],
  },
  {
    bloque: 'Local y máquinas',
    items: [
      'Revisa muelles, tapicerías y cuerdas de cada máquina: lo que se desgasta se nota en la clase.',
      'Anota lo que hay que reponer o reparar y aparta lo que cuesta en la reserva del mes.',
      'Limpieza a fondo y orden del material: lo primero que ve una alumna nueva.',
    ],
  },
  {
    bloque: 'Comunicación',
    items: [
      'Un mensaje o publicación pensado para el mes que viene: novedad, horario nuevo, evento o recordatorio.',
      'Actualiza lo que ve el público: horario, precios, fotos y el enlace de reservas.',
      'Responde a las reseñas del mes, las buenas y las no tan buenas.',
    ],
  },
  {
    bloque: 'La decisión del mes',
    items: [
      'Con todo lo anterior, elige UNA cosa que vas a cambiar este mes y apúntala con su fecha: [lo que cambias] antes del [fecha].',
      'El mes que viene, empieza esta lista mirando si lo hiciste y qué pasó.',
    ],
  },
];

function docChecklist() {
  const hijos = [
    recuadro('Cómo usarla.', 'Imprímela o cópiala cada mes y ve marcando. No hace falta hacerlo todo el mismo día: reparte los bloques en la semana. Lo que importa es que, al acabar, hayas elegido una decisión.'),
  ];
  for (const b of CHECKLIST) {
    hijos.push(h2(b.bloque));
    for (const i of b.items) hijos.push(casilla(i));
  }
  hijos.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  hijos.push(h2('Si usas Tentare: dónde ver cada cosa', { pageBreakBefore: true }));
  for (const [que, donde] of [
    ['Lo cobrado, los pendientes y las devoluciones', 'Cobros'],
    ['Altas, bajas, quién lleva tiempo sin venir y los bonos por caducar', 'Clientas y Resumen'],
    ['Ocupación por franja y por tipo de clase', 'Informes › Clases'],
    ['Lista de espera y clases sin cubrir', 'Calendario'],
    ['Clases por instructora, ausencias y sustituciones', 'Equipo y Sustituciones'],
  ]) hijos.push(vineta(`${que}: ${donde}.`));
  hijos.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  hijos.push(p([
    t('La rutina semanal y los cinco sistemas de un estudio, explicados: ', { size: 21, color: GRIS }),
    t('tentare.app/recursos/como-gestionar-un-estudio-de-pilates', { size: 21, color: OLIVA, bold: true }),
  ]));
  hijos.push(p([t('Esta lista no es asesoramiento fiscal ni legal. Para impuestos y plazos concretos, consulta con tu asesoría.', { size: 18, color: GRIS, italics: true })]));
  return documento({
    titulo: 'Checklist mensual de gestión de un estudio de Pilates',
    descripcion: 'Qué revisar cada mes en un estudio de pilates',
    pie: 'Plantilla de Tentare · tentare.app/recursos/como-gestionar-un-estudio-de-pilates',
    hijos,
  });
}

const salida = process.argv[2] || '/tmp/imanes';
mkdirSync(salida, { recursive: true });
const a = await Packer.toBuffer(docMensajes());
writeFileSync(join(salida, 'mensajes-llenar-clases-recuperar-alumnas.docx'), a);
const b = await Packer.toBuffer(docChecklist());
writeFileSync(join(salida, 'checklist-mensual-estudio-de-pilates.docx'), b);
console.log('ok', a.length, 'y', b.length, 'bytes;', MENSAJES.flatMap((g) => g.items).length, 'mensajes,', CHECKLIST.flatMap((x) => x.items).length, 'casillas');
