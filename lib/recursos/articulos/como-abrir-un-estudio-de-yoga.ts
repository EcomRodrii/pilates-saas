import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'como-abrir-un-estudio-de-yoga',
  titulo: 'Cómo abrir un estudio de yoga: estilos, local, material, trámites, titulación y precios',
  tituloSeo: 'Cómo abrir un estudio de yoga: qué necesitas y cuánto cuesta',
  descripcion: 'Qué pide cada estilo al local (aéreo, sala caliente), material con precios reales, epígrafe e IVA, titulación oficial y lo que cobran 14 estudios españoles.',
  resumen: 'Lo propio de montar un estudio de yoga en España: qué pide cada estilo al local, material con precios, epígrafe, CNAE e IVA, titulación oficial y lo que cobran 14 estudios.',
  categoria: 'abrir',
  seccion: 'Abrir un estudio',
  publicado: '2026-09-25',
  consultaPrincipal: 'cómo abrir un estudio de yoga',
  consultas: [
    'qué necesito para abrir un estudio de yoga',
    'abrir un centro de yoga',
    'cuánto cuesta abrir un estudio de yoga',
    'requisitos para abrir un centro de yoga',
    'es rentable un estudio de yoga',
  ],
  respuesta: 'Para abrir un estudio de yoga, elige primero los estilos, porque deciden el local: el aéreo necesita anclajes al techo calculados por una técnica, y el de sala caliente, una instalación de calefacción, humedad y ventilación con su documentación. Después: material para tu aforo, altas en Hacienda (epígrafe 967.2 del IAE) y en la Seguridad Social, licencia o declaración responsable, seguro, profesoras formadas (la referencia oficial es la cualificación «Instrucción en yoga») y precios: en nuestra muestra, 17,50 € la clase suelta y 50 € al mes la clase semanal.',
  entradilla: 'Cómo abrir un estudio de yoga sin pagar dos veces: antes que el alquiler, mira si el techo aguanta una hamaca, si la sala caliente tendrá la instalación que pide el reglamento y si tus profesoras tienen la formación que crees. Aquí va lo propio del yoga, con sus fuentes; lo que comparte con cualquier estudio, resumido y enlazado.',
  secciones: [
    {
      id: 'que-necesitas',
      titulo: 'Qué necesito para abrir un estudio de yoga: la lista, paso a paso',
      bloques: [
        {
          t: 'p',
          texto: 'Lo común a cualquier estudio está, con su norma, en [requisitos para abrir un estudio de pilates](/recursos/requisitos-para-abrir-un-estudio-de-pilates), y el recorrido completo, en [cómo abrir un estudio de pilates](/recursos/como-abrir-un-estudio-de-pilates): valen para el yoga. Esto es lo que cambia:',
        },
        {
          t: 'tabla',
          cabecera: ['Paso', 'Lo propio del yoga'],
          filas: [
            ['1. Estilos', 'El aéreo y el de sala caliente condicionan el local'],
            ['2. Local', 'Metros por esterilla; anclajes calculados o instalación térmica, si los necesitas'],
            ['3. Material', 'Esterillas, bloques, cinturones, mantas, bolsters y cojines para todo el aforo'],
            ['4. Trámites', 'Los de cualquier estudio, con el epígrafe 967.2 del IAE y el CNAE 93.13'],
            ['5. Profesoras', 'La cualificación oficial «Instrucción en yoga» o lo que pida tu comunidad'],
            ['6. Precios', 'En la muestra, 17,50 € la clase suelta y 50 € al mes la clase semanal'],
            ['7. Sistema', 'Reservas, cobros y lista de espera funcionando antes de abrir'],
          ],
          nota: 'Orden recomendado. Cada dato lleva su fuente en las secciones siguientes; los precios son de una muestra de 14 estudios (25-sep-2026).',
        },
      ],
    },
    {
      id: 'estilos-y-local',
      titulo: 'Estilos de yoga y lo que cada uno exige al local',
      bloques: [
        { t: 'p', texto: 'El estilo decide el local antes que el precio del alquiler. Un hatha y un aéreo pueden compartir horario, pero no techo:' },
        {
          t: 'tabla',
          cabecera: ['Estilo', 'Cómo es la clase', 'Qué exige al local'],
          filas: [
            ['Hatha', 'Posturas mantenidas, a ritmo pausado', 'Sala diáfana y suelo cálido y fácil de limpiar'],
            ['Vinyasa y ashtanga', 'Posturas encadenadas, más dinámicas', 'Más holgura entre esterillas y buena ventilación'],
            ['Yin y restaurativo', 'Posturas largas con apoyos', 'Sitio para guardar el material; sala templada y silenciosa'],
            ['Aéreo', 'Con una hamaca colgada del techo', 'Anclajes calculados por una técnica y altura libre'],
            ['En sala caliente', 'Sala a unos 40 ºC y con humedad alta', 'Instalación térmica con su documentación, y duchas'],
          ],
          nota: 'Orientativo. La temperatura es la de un estudio de Madrid según la instaladora que lo equipó; el detalle, debajo.',
        },
        {
          t: 'p',
          texto: '**Yoga aéreo.** El punto débil no es la hamaca, sino el techo. Uplift Active, fabricante de hamacas, las certifica para 200 kg, pero avisa de que algunos movimientos generan fuerzas de 2 a 4 veces el peso de la alumna y de que cada anclaje debería aguantar con holgura 1.000 libras (unos 450 kg) y tener una capacidad nominal de 3.000 libras (unos 1.360 kg) o más. Que una especialista en estructuras revise el techo antes de colgar nada: si necesita refuerzo, es obra, con su permiso municipal. Y pregunta a tu aseguradora qué revisiones exige.',
        },
        {
          t: 'p',
          texto: '**Yoga en sala caliente.** La instaladora de un estudio de hot yoga de Madrid describe el objetivo: 40 ºC, 50 % de humedad y aire limpio. Es una instalación térmica: el Reglamento de Instalaciones Térmicas en los Edificios (RITE) pide un proyecto firmado por una técnica titulada por encima de 70 kW y una memoria técnica entre 5 y 70 kW, y fija el aire exterior que hay que renovar en los locales para el deporte (categoría IDA 3). Pide el cálculo antes de firmar el alquiler.',
        },
        {
          t: 'p',
          texto: '**Metros por alumna, un ejemplo.** Una esterilla estándar mide 183 × 61 cm. Si reservas para cada una 2,4 × 1,2 m (unos 30 cm de paso alrededor: una decisión tuya, no una norma), cada puesto ocupa casi 2,9 m², y una clase de 15 pide unos 43 m², sin contar el sitio de la profesora, el almacén ni los vestuarios.',
        },
      ],
    },
    {
      id: 'material-y-precios',
      titulo: 'Material para un estudio de yoga: precios reales y dotación para 15 alumnas',
      bloques: [
        { t: 'p', texto: 'Sin máquinas, el material es barato por unidad, pero se multiplica por el aforo. Estos son los precios, con impuestos, de dos tiendas españolas especializadas:' },
        {
          t: 'tabla',
          cabecera: ['Material', 'Yogaes (Madrid)', 'Zafuki (Petrer, Alicante)'],
          filas: [
            ['Esterilla', '21,50 € (4,5 mm, 183 × 61 cm); 224 € la caja de 12', 'De 24,90 € (PVC, 5 mm) a 68,99 € (látex natural)'],
            ['Bloque de corcho', '9,50 € (22 × 11 × 7 cm)', '13,50 €'],
            ['Cinturón', '9,00 € (algodón, 2,5 m)', '12,90 €'],
            ['Manta', '10,70 € (140 × 200 cm)', '16,90 € (tejido reciclado)'],
            ['Bolster', '46,00 € (23 × 65 cm)', 'Desde 75,00 € (23 × 64 cm)'],
            ['Cojín de meditación (zafu)', '32,00 €', 'Desde 43,90 €'],
          ],
          nota: 'Precios publicados en yogaes.com y zafuki.es, impuestos incluidos, consultados el 25-sep-2026. Las dos tiendas anuncian condiciones para centros: pide presupuesto antes de equipar la sala.',
        },
        {
          t: 'tabla',
          cabecera: ['Material (ejemplo)', 'Unidades', 'Con precios de Yogaes', 'Con precios de Zafuki'],
          filas: [
            ['Esterillas', '15', '288,50 €', '373,50 €'],
            ['Bloques de corcho', '30', '285,00 €', '405,00 €'],
            ['Cinturones', '15', '135,00 €', '193,50 €'],
            ['Mantas', '15', '160,50 €', '253,50 €'],
            ['Bolsters', '15', '690,00 €', '1.125,00 €'],
            ['Zafus', '15', '480,00 €', '658,50 €'],
            ['Total', '—', '2.039,00 €', '3.009,00 €'],
          ],
          nota: 'Ejemplo, no presupuesto: cantidades elegidas por nosotras (dos bloques por alumna y una unidad de lo demás). Yogaes: una caja de 12 esterillas y tres sueltas. Zafuki: esterilla de PVC de 5 mm, y bolster y zafu redondo al precio «desde». Con impuestos, sin envío ni descuentos (25-sep-2026).',
        },
        { t: 'p', texto: 'Si das aéreo, suma las hamacas, los herrajes certificados y el cálculo del techo; si das sala caliente, la instalación térmica.' },
      ],
    },
    {
      id: 'requisitos-epigrafe-cnae-iva',
      titulo: 'Requisitos para abrir un centro de yoga: epígrafe, CNAE e IVA',
      bloques: [
        {
          t: 'p',
          texto: 'Los trámites generales (modelo 036, Seguridad Social, licencia o declaración responsable, seguro, hojas de reclamaciones y datos de salud) están en [requisitos para abrir un estudio de pilates](/recursos/requisitos-para-abrir-un-estudio-de-pilates). Esto es lo que Hacienda y el INE han escrito sobre el yoga:',
        },
        {
          t: 'lista',
          items: [
            '**Epígrafe del IAE: 967.2.** En la consulta vinculante V1236-11 (2011), sobre una escuela de yoga, la Dirección General de Tributos (DGT) resolvió: epígrafe 967.2 de la sección primera, «Escuelas y servicios de perfeccionamiento del deporte», si las clases se dan dentro de una organización empresarial; epígrafe 826 de la sección segunda si una profesora las da por su cuenta. Las personas físicas no pagan el impuesto, pero lo declaran en el alta.',
            '**CNAE: 93.13.** La CNAE-2025 del INE incluye expresamente «las actividades de estudios de yoga» en la clase 93.13, «Actividades de los centros deportivos»; la profesora que trabaja por su cuenta va a la 85.51, que recoge «las clases de yoga o pilates».',
            '**IVA: 21 %.** La Resolución de la DGT de 2 de agosto de 2012 cita las clases de yoga entre las que pasaron al tipo general, y la DGT lo repitió en la consulta V1845-25 (2025). En Canarias, el IGIC grava la práctica del deporte, «incluido el pilates y el yoga», al 3 %.',
            '**Formación de profesoras.** La DGT ha considerado exentos de IVA los cursos que preparan para la cualificación oficial de instrucción en yoga (consultas V2433-18 y V0957-26); las clases normales siguen al 21 %. Antes de facturar una formación sin IVA, confírmalo con tu gestoría.',
          ],
        },
        { t: 'p', texto: 'Asociaciones, sesiones con fisioterapeutas y cómo poner el IVA en tus facturas: en [IVA en las clases de pilates](/recursos/iva-clases-de-pilates), que vale también para el yoga.' },
      ],
    },
    {
      id: 'titulacion-para-dar-clases-de-yoga',
      titulo: 'Titulación para dar clases de yoga: qué es oficial y qué no',
      bloques: [
        {
          t: 'p',
          texto: 'Existe una cualificación profesional oficial, **«Instrucción en yoga» (AFD616_3, nivel 3)**, creada por el Real Decreto 1034/2011 y modificada en parte por el Real Decreto 1021/2024. El propio decreto aclara que sus cualificaciones «no constituyen una regulación del ejercicio profesional»: son la referencia oficial, no una licencia para enseñar.',
        },
        {
          t: 'p',
          texto: 'La formación oficial que lleva a ella es el certificado de profesionalidad **AFDA0311, Instrucción en yoga** (Real Decreto 1076/2012): 550 horas entre técnicas de yoga, programación, metodología de las sesiones, primeros auxilios y prácticas.',
        },
        {
          t: 'p',
          texto: '**Lo que no es oficial.** Un certificado de Yoga Alliance (RYT 200, por ejemplo) viene de una organización estadounidense sin ánimo de lucro que se presenta como un registro voluntario de escuelas y profesoras; su credencial de escuela básica, RYS 200, corresponde a una formación de 200 horas. Puede ser buena formación, pero es una acreditación privada: no equivale a la cualificación española.',
        },
        {
          t: 'p',
          texto: 'Lo que sí puede obligar es tu comunidad: varias tienen ley de profesiones del deporte, y si el yoga entra y con qué título depende de cada texto. Pregúntalo en su dirección general de deportes antes de contratar. Y si buscas profesoras, [Tentare Network](/network) es un directorio público y gratuito de instructoras de pilates y yoga en España.',
        },
      ],
    },
    {
      id: 'precios-de-clases-de-yoga',
      titulo: 'Cuánto cobrar: precios de clases de yoga en 14 estudios',
      bloques: [
        { t: 'p', texto: 'Estas son las tarifas que publican 14 estudios de yoga de 9 ciudades. Es una muestra pequeña y no aleatoria (estudios con precios claros en su web): tómala como referencia, no como estadística del mercado.' },
        {
          t: 'tabla',
          cabecera: ['Estudio', 'Ciudad', 'Clase suelta', 'Una clase semanal, al mes'],
          filas: [
            ['The StudiOm Yoga', 'Madrid', '25 €', '65 €'],
            ['Numen Yoga', 'Madrid', '25 €', '70 € (4 clases)'],
            ['More Yoga', 'Madrid', '18 €', '60 € (bono de 4 clases, 30 días)'],
            ['Zama Yoga', 'Barcelona', '26 €', '57,50 € (4 clases)'],
            ['FIGA Yoga Studio', 'Barcelona', '15 €', '50 € (4 clases)'],
            ['Centro Yoga Iturbi', 'Valencia', '18 €', '45 €'],
            ['Yoyoga', 'Valencia', '15 €', '34 €'],
            ['Olēka Yoga', 'Valencia', '20 €', '50 € (4 clases)'],
            ['Prana Escuela de Yoga', 'Alicante', '15 €', '45 €'],
            ['Yoga Sadhana', 'Sevilla', '15 €', '50 €'],
            ['Tierrayoga', 'Málaga', '15 €', '40 €'],
            ['Namaste Yoga', 'Bilbao', '17 €', '50 € (4 sesiones)'],
            ['Om Yoga Zaragoza', 'Zaragoza', '—', '40 €'],
            ['Yoga Shala Granada', 'Granada', '—', '50 € (4 clases)'],
          ],
          nota: 'Tarifas publicadas en la web de cada estudio, consultadas el 25-sep-2026; la mayoría no dice si incluyen IVA. Muestra no aleatoria. «—»: no la publica. En Zama, clases de 1 h o 1 h 15 (las de hora y media, 62,50 €).',
        },
        {
          t: 'cifras',
          titulo: 'Lo que cobra la muestra',
          cifras: [
            { valor: '17,50 €', etiqueta: 'Mediana de la clase suelta (de 15 a 26 €)' },
            { valor: '50 €', etiqueta: 'Mediana al mes por una clase semanal (de 34 a 70 €)' },
            { valor: '32 %', etiqueta: 'Rebaja mediana por clase de la cuota frente a la suelta' },
          ],
          nota: 'Clase suelta: 12 estudios; cuota: 14. La rebaja, en los 12 que publican las dos tarifas, contando cuatro clases al mes (25-sep-2026).',
        },
        {
          t: 'p',
          texto: 'Con la cuota mediana, cada clase sale a 12,50 € si cuentas cuatro al mes, y la rebaja frente a la suelta va del 17 % al 45 %. El aéreo se cobra más: en Prana (Alicante), 55 € al mes la clase semanal, frente a 45 € la general. Cómo montar la escalera de bonos y cuotas, en [bonos de pilates](/recursos/bonos-de-pilates); qué pasa cuando alguien falta, en tu [política de cancelación de clases](/recursos/politica-de-cancelacion-de-clases).',
        },
      ],
    },
    {
      id: 'cuanto-cuesta-y-rentabilidad',
      titulo: '¿Cuánto cuesta abrir un estudio de yoga y es rentable?',
      bloques: [
        {
          t: 'p',
          texto: 'La inversión se va sobre todo en el local y la obra: el material para 15 alumnas cuesta, en el ejemplo de arriba, entre 2.039 y 3.009 €, cuando en pilates cada reformer se lleva miles de euros. El resto (fianza, obra, licencias, seguros, colchón) tiene su desglose en [cuánto cuesta abrir un estudio de pilates](/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates).',
        },
        {
          t: 'p',
          texto: 'Que sea rentable depende de la ocupación y de lo que pagues por clase a tus profesoras. El método, con calculadora, está en [¿es rentable un estudio de pilates?](/recursos/rentabilidad-estudio-de-pilates). En Tentare, el informe de rentabilidad por clase resta a lo que ingresa cada clase lo que cuesta su profesora.',
        },
        {
          t: 'nota',
          titulo: 'Ejemplo con cifras inventadas',
          texto: 'Con la cuota mediana de la muestra (50 € al mes con IVA, 41,32 € sin IVA), si tus gastos fijos, profesoras incluidas, fueran 3.500 € al mes, necesitarías 85 alumnas con una clase semanal: unas seis clases llenas de 15 cada semana. No son cifras de mercado: cámbialas por las tuyas.',
        },
      ],
    },
    {
      id: 'reservas-y-cobros',
      titulo: 'Reservas, bonos y cobros desde la primera clase',
      bloques: [
        {
          t: 'p',
          texto: 'Tus alumnas tienen que poder reservar y cancelar sin escribirte, y los bonos, descontarse y caducar sin hojas de cálculo. En Tentare reservan y cancelan desde el móvil, con la app del estudio en su pantalla de inicio con tu nombre y tu icono; la lista de espera es automática, y las cuotas se cobran con Stripe (tarjeta o SEPA), con tres reintentos si un cobro falla. Cuesta 29, 59 o 149 € al mes con IVA, sin permanencia: [Tentare para estudios de yoga](/soluciones/estudio-de-yoga).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué necesito para abrir un estudio de yoga?',
      a: 'Un local que admita la actividad y encaje con tus estilos, material para tu aforo, altas en Hacienda (epígrafe 967.2) y en la Seguridad Social, licencia o declaración responsable, seguro, profesoras formadas y un sistema de reservas y cobros.',
    },
    {
      q: '¿Cuánto cuesta abrir un estudio de yoga?',
      a: 'Depende sobre todo del local y de la obra. El material para 15 alumnas cuesta entre 2.039 y 3.009 € en nuestro ejemplo con precios de dos tiendas españolas; súmale fianza, obra, licencias, seguros y un colchón.',
    },
    {
      q: '¿Qué epígrafe del IAE corresponde a un centro de yoga?',
      a: 'El 967.2 de la sección primera, «Escuelas y servicios de perfeccionamiento del deporte», si las clases se dan dentro de una organización empresarial; la profesora que enseña por su cuenta va al 826 de la sección segunda (consulta V1236-11).',
    },
    {
      q: '¿Hace falta un título oficial para dar clases de yoga?',
      a: 'No hay una licencia estatal: la cualificación oficial «Instrucción en yoga» no regula el ejercicio de la profesión. Lo que puede exigir un título es la ley de profesiones del deporte de tu comunidad.',
    },
    {
      q: '¿Las clases de yoga llevan IVA?',
      a: 'Sí, el 21 % en un estudio privado: Hacienda las cita expresamente entre las clases deportivas que pasaron al tipo general en 2012. En Canarias se aplica el IGIC, al 3 %.',
    },
    {
      q: '¿Es rentable un estudio de yoga?',
      a: 'Puede serlo si llenas las clases: sin máquinas la inversión es menor, pero la cuota también (50 € al mes de mediana en nuestra muestra). Calcula cuántas alumnas necesitas antes de firmar el alquiler.',
    },
    {
      q: '¿Cuánto cobrar por una clase de yoga?',
      a: 'En los 14 estudios revisados, la clase suelta va de 15 a 26 € (mediana: 17,50 €) y la cuota de una clase semanal, de 34 a 70 € al mes (mediana: 50 €).',
    },
  ],
  fuentes: [
    { titulo: 'Dirección General de Tributos, consulta vinculante V1236-11, de 18 de mayo de 2011 (escuela de yoga, epígrafe del IAE)', url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V1236-11', consultada: '2026-09-25' },
    { titulo: 'INE: CNAE-2025, notas explicativas (febrero de 2026)', url: 'https://www.ine.es/daco/daco42/clasificaciones/cnae25/notas_explicativas_CNAE_2025.pdf', consultada: '2026-09-25' },
    { titulo: 'BOE: Resolución de 2 de agosto de 2012, de la DGT, sobre el tipo impositivo aplicable a determinadas operaciones', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2012-10534', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V1845-25, de 14 de octubre de 2025 (sesiones y formación de yoga)', url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V1845-25', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V2433-18, de 10 de septiembre de 2018 (clases y formación de monitores de yoga)', url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V2433-18', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V0957-26, de 29 de abril de 2026 (enseñanza de yoga)', url: 'https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V0957-26', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 4/2012 de Canarias, artículo 54 (IGIC al 3 %, «incluido el pilates y el yoga»)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-9282', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1034/2011, que establece la cualificación Instrucción en yoga (AFD616_3)', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2011-13391', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1021/2024, que modifica parcialmente la cualificación AFD616_3', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2024-23541', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1076/2012, que establece el certificado de profesionalidad AFDA0311 Instrucción en yoga', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2012-11325', consultada: '2026-09-25' },
    { titulo: 'Yoga Alliance: historia y naturaleza de la organización', url: 'https://yogaalliance.org/meet-yoga-alliance/', consultada: '2026-09-25' },
    { titulo: 'Yoga Alliance: credenciales para escuelas (RYS 200, 300 y 500)', url: 'https://yogaalliance.org/explore-credentialing-options/', consultada: '2026-09-25' },
    { titulo: 'Uplift Active: guía para montar un estudio de yoga aéreo (cargas y anclajes)', url: 'https://upliftactive.com/pages/aerial-yoga-studio-set-up-guide', consultada: '2026-09-25' },
    { titulo: 'Europea Térmica Eléctrica: instalación del estudio Hot Yoga Barquillo (Madrid)', url: 'https://ete.es/estudio-hot-yoga-barquillo-12-madrid/', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1027/2007, Reglamento de Instalaciones Térmicas en los Edificios (RITE), texto consolidado', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-15820', consultada: '2026-09-25' },
    { titulo: 'Yogaes: caja de 12 esterillas Asana de 4,5 mm', url: 'https://www.yogaes.com/esterillas-y-mantas/486-537-caja-12-esterillas-asana-45-mm.html', consultada: '2026-09-25' },
    { titulo: 'Yogaes: esterilla Asana de 4,5 mm', url: 'https://www.yogaes.com/esterillas-y-mantas/90-104-esterillas-yoga-asana-45-mm.html', consultada: '2026-09-25' },
    { titulo: 'Yogaes: brick de corcho natural', url: 'https://www.yogaes.com/accesorios-yoga/85-90-brick-de-corcho.html', consultada: '2026-09-25' },
    { titulo: 'Yogaes: cinturón de yoga de algodón', url: 'https://www.yogaes.com/accesorios-yoga/53-30-cinturon-para-yoga.html', consultada: '2026-09-25' },
    { titulo: 'Yogaes: manta de yoga de 140 × 200 cm', url: 'https://www.yogaes.com/esterillas-y-mantas/300-236-manta-de-yoga-soporte-para-asanas-y-savasana.html', consultada: '2026-09-25' },
    { titulo: 'Yogaes: bolster ECO de yoga y pilates', url: 'https://www.yogaes.com/accesorios-pilates/86-100-bolster-eco-de-yoga-y-pilates.html', consultada: '2026-09-25' },
    { titulo: 'Yogaes: zafu de algodón con espelta', url: 'https://www.yogaes.com/zafus-y-zafutones/48-581-zafu-yoga-cojin-de-meditacion-clasico-de-algodon.html', consultada: '2026-09-25' },
    { titulo: 'Zafuki: accesorios de yoga (esterillas, bloques, mantas)', url: 'https://zafuki.es/69-yoga-accesorios', consultada: '2026-09-25' },
    { titulo: 'Zafuki: accesorios de yoga, página 3 (cinturón)', url: 'https://zafuki.es/69-yoga-accesorios?page=3', consultada: '2026-09-25' },
    { titulo: 'Zafuki: bolster de yoga restaurativo', url: 'https://zafuki.es/inicio/438-bolster-yoga-rodillo-restaurativo.html', consultada: '2026-09-25' },
    { titulo: 'Zafuki: zafus redondos', url: 'https://zafuki.es/13-zafu-redondo', consultada: '2026-09-25' },
    { titulo: 'The StudiOm Yoga (Madrid): tarifas', url: 'https://www.thestudiomyoga.com/tarifas', consultada: '2026-09-25' },
    { titulo: 'Numen Yoga (Madrid): tarifas del estudio', url: 'https://numenyoga.com/tarifas-estudio/', consultada: '2026-09-25' },
    { titulo: 'More Yoga (Madrid): tarifas', url: 'https://moreyogamadrid.com/tarifas/', consultada: '2026-09-25' },
    { titulo: 'Zama Yoga (Barcelona): horarios y cuotas', url: 'https://www.zamaioga.com/es/horarios-y-cuotas/', consultada: '2026-09-25' },
    { titulo: 'FIGA Yoga Studio (Barcelona): precios', url: 'https://figayogastudio.com/precios', consultada: '2026-09-25' },
    { titulo: 'Centro Yoga Iturbi (Valencia): horarios y precios', url: 'https://centroyogaiturbi.com/horario-tarifas/', consultada: '2026-09-25' },
    { titulo: 'Yoyoga (Valencia): las clases', url: 'https://yoyoga.es/las-clases/', consultada: '2026-09-25' },
    { titulo: 'Olēka Yoga (Valencia): precios y condiciones generales de contratación', url: 'https://olekayoga.com/preciosycondicionesgeneralesdecontratacion', consultada: '2026-09-25' },
    { titulo: 'Prana Escuela de Yoga (Alicante): tarifas, curso 2026-2027', url: 'https://pranaescueladeyoga.com/tarifas/', consultada: '2026-09-25' },
    { titulo: 'Yoga Sadhana (Sevilla): precios, curso 2026-27', url: 'https://sadhanasevilla.es/precios/', consultada: '2026-09-25' },
    { titulo: 'Tierrayoga (Málaga): sala de yoga y precios', url: 'https://tierrayogamalaga.webnode.es/', consultada: '2026-09-25' },
    { titulo: 'Namaste Yoga (Bilbao): horarios y precios', url: 'https://www.namasteyogabilbao.es/horarios', consultada: '2026-09-25' },
    { titulo: 'Om Yoga Zaragoza: grupos y tarifas', url: 'https://omyogazaragoza.es/grupos-y-tarifas/', consultada: '2026-09-25' },
    { titulo: 'Yoga Shala Granada: precios', url: 'https://granadayoga.es/precios-yoga-shala-granada-2/', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/soluciones/estudio-de-yoga',
    '/recursos/requisitos-para-abrir-un-estudio-de-pilates',
    '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates',
    '/recursos/rentabilidad-estudio-de-pilates',
    '/recursos/politica-de-cancelacion-de-clases',
  ],
  cta: {
    titulo: 'Abre tu estudio de yoga con las reservas resueltas',
    texto: 'Tentare deja listos las reservas, los bonos, las cuotas y la lista de espera de tu estudio antes de la primera clase, con la app del estudio para tus alumnas. Pruébalo 7 días gratis, sin tarjeta, con el plan que elijas.',
  },
  revision: [
    'Precios de material (Yogaes y Zafuki) y tarifas de los 14 estudios consultados el 25-sep-2026: cambian a menudo, revisarlos antes de publicar. La mayoría de los estudios no dice si sus precios incluyen IVA.',
    'Cargas del yoga aéreo: son de un fabricante estadounidense (Uplift Active), publicadas en libras y convertidas a kg redondeando. No se ha encontrado norma española específica para anclajes de yoga aéreo.',
    'Sala caliente: los 40 ºC y 50 % de humedad son los que publica la instaladora de un estudio de Madrid, no una norma.',
    'Formación de profesoras exenta de IVA (V2433-18 y V0957-26): que la revise una asesora fiscal antes de publicar; depende de requisitos del centro que no se desarrollan aquí.',
    'Dotación de ejemplo: cantidades elegidas por nosotras; los importes de Zafuki usan el precio «desde» del bolster y del zafu.',
  ],
};

export default articulo;
