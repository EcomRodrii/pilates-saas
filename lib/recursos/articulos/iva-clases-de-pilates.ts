import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'iva-clases-de-pilates',
  titulo: '¿Las clases de pilates llevan IVA? El tipo que se aplica y cuándo están exentas',
  tituloSeo: '¿Las clases de pilates llevan IVA? Tipo y exenciones',
  descripcion:
    'Sí: un estudio privado cobra el 21 %. Cuándo el pilates está exento (fisioterapia, asociaciones), qué dice Hacienda y cómo ponerlo en tus facturas.',
  resumen:
    'Qué IVA lleva una clase de pilates en un estudio privado, en una clínica de fisioterapia o en una asociación, con la ley y las consultas de Hacienda que lo deciden.',
  categoria: 'espana',
  seccion: 'España y fiscalidad',
  publicado: '2026-09-25',
  consultaPrincipal: '¿las clases de pilates llevan IVA?',
  consultas: [
    'IVA de las clases de pilates',
    'IVA pilates',
    'IVA gimnasio',
    'pilates exento de IVA',
    'IVA pilates terapéutico fisioterapia',
  ],
  respuesta:
    'Sí. Las clases de pilates de un estudio privado llevan un 21 % de IVA: la Ley del IVA no les aplica ningún tipo reducido y Hacienda las trata como práctica deportiva, no como enseñanza. Solo están exentas en casos concretos, como cuando las presta una entidad pública o una entidad deportiva sin ánimo de lucro de «carácter social», o cuando una fisioterapeuta las usa para tratar o prevenir una enfermedad. En Canarias no hay IVA: se aplica el IGIC, al 3 % para el pilates desde 2025.',
  entradilla:
    'Si las clases de pilates llevan IVA es la duda fiscal más repetida al montar un estudio, y la respuesta corta cabe en una línea. La larga importa si trabajas con fisioterapeutas, si eres una asociación o si vendes formación, porque ahí el mismo pilates puede ir al 21 % o exento.',
  secciones: [
    {
      id: 'iva-de-las-clases-de-pilates',
      titulo: '¿Las clases de pilates llevan IVA? Sí, el 21 % en un estudio privado',
      bloques: [
        {
          t: 'p',
          texto:
            'La Ley 37/1992 del IVA fija un tipo general del **21 %** (artículo 90) y reserva los tipos reducidos para lo que enumera el artículo 91. En esa lista no están las clases ni las cuotas para practicar deporte; solo la entrada a espectáculos deportivos de aficionados, al 10 %.',
        },
        {
          t: 'p',
          texto:
            'Hacienda lo dejó por escrito cuando el deporte pasó al tipo general, el 1 de septiembre de 2012: la Resolución de la Dirección General de Tributos (DGT) de 2 de agosto de 2012 pone como ejemplos «las cuotas de acceso a los gimnasios» y las clases de yoga o pilates. En la consulta vinculante V2661-14, sobre una profesora que iba a dar clases de pilates en un local alquilado, la DGT concluyó que tributaban al 21 %.',
        },
        {
          t: 'p',
          texto:
            'Por eso el **IVA de un gimnasio** y el de un estudio de pilates son el mismo: 21 % sobre la cuota, el bono o la clase suelta, lo cobre una autónoma o una sociedad. Tampoco cambia por ser una clase particular: para la DGT, las clases para practicar deporte no son «clases a título particular».',
        },
        {
          t: 'cifras',
          titulo: 'Los tres tipos que te puedes encontrar',
          cifras: [
            { valor: '21 %', etiqueta: 'Clases, bonos y cuotas de un estudio privado' },
            { valor: '10 %', etiqueta: 'Solo espectáculos deportivos de aficionados' },
            { valor: '3 %', etiqueta: 'IGIC en Canarias para el pilates, desde 2025' },
          ],
          nota: 'Ley 37/1992 del IVA, artículos 90 y 91, y Ley 4/2012 de Canarias, artículo 54.2.f (textos consolidados del BOE).',
        },
      ],
    },
    {
      id: 'ha-bajado-el-iva-de-los-gimnasios',
      titulo: '¿Ha bajado el IVA del pilates o de los gimnasios en 2025 o 2026?',
      bloques: [
        {
          t: 'p',
          texto:
            'No. El texto consolidado de la Ley del IVA que publica el BOE, con su última modificación de febrero de 2026, sigue sin ningún tipo reducido para los servicios deportivos. Peticiones sí ha habido: la patronal de instalaciones deportivas FNEID reclama volver al tipo reducido, hoy del 10 % (hasta 2012 el deporte tributaba al 8 %), y en enero de 2024 el PP registró en el Senado una moción para instar al Gobierno a bajarlo al 10 %. Ninguna se ha convertido en ley: hasta que el BOE diga otra cosa, factura al 21 %.',
        },
        {
          t: 'nota',
          titulo: 'Canarias, Ceuta y Melilla: otro impuesto',
          texto:
            'La Ley del IVA no se aplica en Canarias, Ceuta y Melilla (artículo 3). En Canarias rige el IGIC y, desde el 1 de enero de 2025, la práctica del deporte o la educación física, «incluido el pilates y el yoga», va al 3 %. En Ceuta y Melilla hay un impuesto propio: pregunta a tu gestoría.',
        },
      ],
    },
    {
      id: 'cuando-esta-exento-de-iva',
      titulo: 'Cuándo el pilates está exento de IVA',
      bloques: [
        {
          t: 'p',
          texto:
            'Exento no significa «con IVA reducido»: la factura va sin IVA porque la ley excluye esa operación. Tres exenciones del artículo 20.Uno suenan aplicables al pilates, y solo dos funcionan, con condiciones:',
        },
        {
          t: 'tabla',
          cabecera: ['Caso', 'IVA', 'Base legal', 'Qué ha dicho Hacienda'],
          filas: [
            ['Estudio privado, de una autónoma o de una sociedad', '21 %', 'Arts. 90 y 91', 'V2661-14: sujeto y no exento'],
            ['Pilates de fisioterapeutas para tratar o prevenir una enfermedad', 'Exento', 'Art. 20.Uno.3.º', 'V1152-22 y V1451-26: exento solo con esa finalidad'],
            ['Pilates de mantenimiento o forma física en una clínica', '21 %', 'Art. 90', 'V1451-26: sin finalidad terapéutica, tributa'],
            ['Asociación o club sin ánimo de lucro de carácter social', 'Exento', 'Arts. 20.Uno.13.º y 20.Tres', 'V5104-26: exento si cumple los requisitos'],
            ['Polideportivo municipal u otra entidad pública', 'Exento', 'Art. 20.Uno.13.º', 'Lo dice la propia ley'],
            ['Formación de instructoras en una empresa privada', '21 %', 'Art. 20.Uno.9.º, que no aplica', 'V2830-21: el pilates cuenta como deporte'],
            ['Instructora autónoma que factura a un estudio', '21 %', 'Art. 90', 'V0759-26: sujeto y no exento'],
          ],
          nota: 'Ley 37/1992 del IVA y consultas vinculantes de la DGT del buscador PETETE, consultadas el 25-sep-2026. Una consulta vincula a Hacienda para el caso que describe: si el tuyo se aparta, confírmalo con tu gestoría.',
        },
        {
          t: 'p',
          texto:
            'La exención de la enseñanza (artículo 20.Uno.9.º) es la que más se intenta aplicar y la que no sirve: el artículo deja fuera «los servicios relativos a la práctica del deporte, prestados por empresas distintas de los centros docentes», y la DGT califica el pilates como deporte.',
        },
      ],
    },
    {
      id: 'iva-pilates-terapeutico-fisioterapia',
      titulo: 'IVA del pilates terapéutico en fisioterapia',
      bloques: [
        {
          t: 'p',
          texto:
            'La asistencia que prestan los profesionales sanitarios está exenta (artículo 20.Uno.3.º), y las fisioterapeutas lo son. La DGT ha aceptado que esa exención cubra sesiones de rehabilitación con técnicas de pilates, también en grupo, cuando las dan fisioterapeutas y tienen por objeto el diagnóstico, la prevención o el tratamiento de enfermedades (consulta V1152-22, de 26 de mayo de 2022).',
        },
        {
          t: 'p',
          texto:
            'La frontera es la finalidad, no el título de quien da la clase. En la consulta V1451-26, de 9 de junio de 2026, una clínica preguntaba por sesiones de pilates de fisioterapeutas para prevenir lesiones y mantener la forma física, sin tratar una patología concreta. La respuesta: si no tienen por objeto diagnosticar, prevenir o tratar una enfermedad, van al 21 %. Y la receta médica no cambia la tributación.',
        },
        {
          t: 'lista',
          items: [
            'Separa en tu horario y en tus facturas las sesiones de tratamiento, exentas, de las clases abiertas, al 21 %.',
            'Deja constancia de la valoración y del objetivo terapéutico de cada paciente: es lo que sostiene la exención.',
            'Revisa tu alta en el IAE: la DGT encaja esta rehabilitación en el epígrafe 942.9 y la actividad deportiva en el 967.2 (V1152-22).',
            'La parte exenta no te deja deducir el IVA de lo que compras para ella; si mezclas, se aplica la prorrata (artículos 94 y 102 de la Ley).',
          ],
        },
      ],
    },
    {
      id: 'asociacion-sin-animo-de-lucro',
      titulo: 'Pilates exento de IVA en asociaciones y clubes sin ánimo de lucro',
      bloques: [
        {
          t: 'p',
          texto:
            'El artículo 20.Uno.13.º exime los servicios directamente relacionados con la práctica del deporte o la educación física que prestan, entre otros, las entidades o establecimientos deportivos privados de carácter social. Para serlo, el artículo 20.Tres pide que la entidad no tenga ánimo de lucro y dedique los beneficios a la misma actividad, y que los cargos de presidencia, patronato o representación sean gratuitos.',
        },
        {
          t: 'p',
          texto:
            'En la consulta V5104-26, de 1 de julio de 2026, una asociación sin ánimo de lucro de yoga y disciplinas afines preguntó si necesitaba un certificado previo. La DGT respondió que puede pedir la calificación como entidad de carácter social, pero que la exención se aplica si cumple los requisitos, la tenga o no. Sus cuotas y cursos deportivos quedarían exentos; la cafetería o la tienda, no. Un estudio con ánimo de lucro no puede usar esta vía: la DGT la descartó para una profesora de pilates por cuenta propia (V2661-14).',
        },
      ],
    },
    {
      id: 'formacion-y-otros-casos',
      titulo: 'Formación de instructoras, clases particulares y otros casos',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Formación de instructoras.** Una empresa que forma en el método pilates preguntó si podía aplicar la exención de enseñanza. La DGT dijo que no, porque califica esa enseñanza como deporte (V2830-21). Si tu curso forma parte de un título oficial, el análisis puede cambiar: consúltalo con tu gestoría.',
            '**Clases particulares o a domicilio.** También al 21 %: esa exención solo cubre materias de los planes de estudio oficiales (V2661-14).',
            '**Instructoras autónomas que facturan al estudio.** Te facturan con un 21 % de IVA (V0759-26), que te deduces si tu estudio cobra con IVA. Qué más implica pagar así lo tienes en [cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates).',
            '**Facturar poco no te exime.** España no aplica hoy un régimen de franquicia del IVA para pequeñas empresas en operaciones nacionales: aunque factures poco, repercutes el IVA.',
          ],
        },
      ],
    },
    {
      id: 'iva-en-precios-bonos-y-facturas',
      titulo: 'Cómo poner el IVA en tus precios, bonos y facturas',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Anuncia siempre el precio final',
              texto:
                'A tus alumnas, que son consumidoras, les debes el precio final con impuestos incluidos (artículo 20 de la Ley General para la Defensa de los Consumidores y Usuarios). Ejemplo: de una clase suelta de 15 € con IVA, tu ingreso son 12,40 € y 2,60 € son IVA.',
            },
            {
              titulo: 'El IVA de un bono se devenga al cobrarlo',
              texto:
                'Si la alumna paga por adelantado, el IVA se devenga al cobrar, no cuando usa las clases (artículo 75.Dos de la Ley). Para fijar tarifas, mira [bonos de pilates](/recursos/bonos-de-pilates) y [precio de una clase de pilates](/recursos/precio-clase-de-pilates).',
            },
            {
              titulo: 'Usa factura simplificada con tus alumnas',
              texto:
                'Hasta 400 € con IVA incluido vale la factura simplificada, con el tipo aplicado y, si quieres, la mención «IVA incluido» (Reglamento de facturación, artículos 4 y 7).',
            },
            {
              titulo: 'Si está exenta, dilo en la factura',
              texto:
                'Una factura sin IVA tiene que citar el precepto de la exención o indicar que la operación está exenta (artículo 6.1.j del Reglamento), por ejemplo «exenta, artículo 20.Uno.3.º de la Ley 37/1992».',
            },
          ],
        },
        {
          t: 'p',
          texto:
            'Si usas Tentare, cada factura sale con numeración legal correlativa y huella encadenada; la firma y el envío automático de los registros a la AEAT todavía están en desarrollo, y el QR de cotejo se imprime cuando la AEAT tiene el registro. Tienes el detalle en [facturación](/funcionalidades/facturacion) y las fechas de la obligación en [facturación electrónica y Veri*Factu](/recursos/facturacion-electronica-verifactu).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Las clases de pilates llevan IVA?',
      a: 'Sí, un 21 % cuando las da un estudio privado, sea de una autónoma o de una sociedad. Quedan exentas si las presta una entidad pública o una deportiva sin ánimo de lucro de carácter social, o si forman parte de un tratamiento sanitario.',
    },
    {
      q: '¿El pilates terapéutico está exento de IVA?',
      a: 'Solo si lo da una profesional sanitaria, como una fisioterapeuta, para diagnosticar, prevenir o tratar una enfermedad. Si es mantenimiento de la forma física, lleva el 21 % aunque se anuncie como terapéutico (consulta V1451-26).',
    },
    {
      q: '¿Qué IVA lleva la cuota de un gimnasio?',
      a: 'El 21 %, igual que una clase de pilates, desde el 1 de septiembre de 2012. Solo va sin IVA si la cobra una entidad exenta, como un club sin ánimo de lucro de carácter social.',
    },
    {
      q: '¿Puedo no cobrar IVA si soy autónoma y facturo poco?',
      a: 'No. España no aplica hoy un régimen de franquicia del IVA por volumen en operaciones nacionales: la exención depende del servicio y de quién lo presta, no de cuánto factures.',
    },
    {
      q: '¿Las clases particulares de pilates llevan IVA?',
      a: 'Sí, el 21 %. La exención de las clases particulares cubre materias de los planes de estudio oficiales, y Hacienda no incluye ahí las clases para practicar deporte (V2661-14).',
    },
    {
      q: '¿Cuándo se paga el IVA de un bono de pilates?',
      a: 'Cuando lo cobras: si la alumna paga por adelantado, el IVA se devenga en ese momento, aunque use las clases después (artículo 75.Dos de la Ley del IVA).',
    },
  ],
  fuentes: [
    {
      titulo: 'Ley 37/1992, del Impuesto sobre el Valor Añadido (texto consolidado, BOE)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Resolución de 2 de agosto de 2012, de la DGT, sobre el tipo impositivo aplicable a determinadas operaciones (BOE)',
      url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2012-10534',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Consulta vinculante DGT V2661-14, de 8 de octubre de 2014 (clases de pilates)',
      url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V2661-14',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Consulta vinculante DGT V1451-26, de 9 de junio de 2026 (pilates impartido por fisioterapeutas)',
      url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V1451-26',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Consulta vinculante DGT V1152-22, de 26 de mayo de 2022 (rehabilitación con técnicas de pilates)',
      url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V1152-22',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Consulta vinculante DGT V5104-26, de 1 de julio de 2026 (asociación sin ánimo de lucro)',
      url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V5104-26',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Consulta vinculante DGT V2830-21, de 16 de noviembre de 2021 (formación en el método pilates)',
      url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V2830-21',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Consulta vinculante DGT V0759-26, de 6 de abril de 2026 (entrenador autónomo que factura a gimnasios)',
      url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V0759-26',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Ley 4/2012 de Canarias, de medidas administrativas y fiscales, art. 54 (texto consolidado, BOE)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-9282',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Ley 5/2024, de Presupuestos Generales de la Comunidad Autónoma de Canarias para 2025 (BOE)',
      url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-4913',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Real Decreto 1619/2012, Reglamento por el que se regulan las obligaciones de facturación (BOE)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696',
      consultada: '2026-09-25',
    },
    {
      titulo: 'Real Decreto Legislativo 1/2007, Ley General para la Defensa de los Consumidores y Usuarios (BOE)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555',
      consultada: '2026-09-25',
    },
    {
      titulo: '2Playbook: El PP propone al Senado reducir el IVA de los gimnasios y los servicios deportivos al 10 % (19-feb-2024)',
      url: 'https://www.2playbook.com/fitness/pp-propone-senado-reducir-iva-gimnasios-servicios-deportivos-10_14697_102.html',
      consultada: '2026-09-25',
    },
    {
      titulo: 'FNEID: el PP asume el compromiso de estudiar la restitución del IVA reducido a la actividad física (19-jul-2023)',
      url: 'https://www.fneid.es/noticias/el-pp-asume-el-compromiso-con-fneid-de-estudiar-la-restitucion-del-iva-reducido-del-10-a-la-actividad-fisica?elem=304094',
      consultada: '2026-09-25',
    },
    {
      titulo: 'ProDespachos: No, el IVA para autónomos hasta 85.000 € no está aprobado en España (9-abr-2026)',
      url: 'https://www.prodespachos.com/art%C3%ADculos/no-el-iva-para-autonomos-hasta-85-000-e-no-esta-aprobado-en-espana/',
      consultada: '2026-09-25',
    },
  ],
  relacionadas: [
    '/funcionalidades/facturacion',
    '/recursos/facturacion-electronica-verifactu',
    '/recursos/precio-clase-de-pilates',
    '/recursos/cuanto-cobra-una-instructora-de-pilates',
  ],
  cta: {
    titulo: 'Facturas con el IVA bien puesto, sin hacerlas a mano',
    texto:
      'Tentare emite cada factura con numeración legal y huella encadenada, y el envío automático a la AEAT está en desarrollo. Pruébalo 7 días gratis, sin tarjeta, con el plan que elijas: desde 29 €/mes, IVA incluido y sin permanencia.',
  },
  revision: [
    'Confirmar que no se ha publicado en el BOE ninguna rebaja del IVA de los servicios deportivos posterior a la última modificación del texto consolidado consultado (28-feb-2026).',
    'Confirmar que el IGIC del 3 % para el pilates en Canarias sigue vigente en 2026: el texto consolidado de la Ley 4/2012 consultado en el BOE es de 30-dic-2024.',
    'Que una asesora fiscal revise los apartados de exenciones (fisioterapia, asociaciones y formación) antes de publicar.',
  ],
};

export default articulo;
