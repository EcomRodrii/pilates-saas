import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'cuanto-cuesta-abrir-un-estudio-de-pilates',
  titulo: 'Cuánto cuesta abrir un estudio de pilates: presupuesto por partidas con precios reales',
  tituloSeo: 'Cuánto cuesta abrir un estudio de pilates en 2026',
  descripcion: 'Precio real de un reformer con y sin IVA, fianza del local, cuota de autónoma, seguro, marca, software y un presupuesto de ejemplo con 6 reformers.',
  resumen: 'Lo que cuesta cada partida de un estudio de pilates en España, con precios publicados por fabricantes, tiendas y organismos oficiales, y un presupuesto de ejemplo para seis reformers.',
  categoria: 'abrir',
  seccion: 'Abrir un estudio',
  publicado: '2026-09-25',
  consultaPrincipal: 'cuánto cuesta abrir un estudio de pilates',
  consultas: [
    'cuánto cuesta poner un estudio de pilates reformer',
    'cuánto cuesta un reformer de pilates',
    'precio de una máquina reformer',
    'inversión para un estudio de pilates',
    'cuánto cuesta montar un negocio de pilates',
  ],
  respuesta: 'Cuánto cuesta abrir un estudio de pilates depende sobre todo de cuántos reformers compres y del local. Como referencia, un reformer profesional cuesta de 2.891,90 € a 6.037,90 € con IVA en la tienda oficial de Elina Pilates, así que seis máquinas suman de 17.351,40 € a 36.227,40 €. A eso se añaden la fianza del local (dos mensualidades por ley), la obra, las tasas, los seguros, el software, la cuota de autónoma y un colchón para los primeros meses.',
  entradilla: 'Cuánto cuesta abrir un estudio de pilates depende de decisiones tuyas, pero casi cada partida tiene un precio que se puede consultar. Aquí están los que hemos verificado, con su fuente y su fecha, y cómo calcular los que dependen de tu local y de tu municipio.',
  secciones: [
    {
      id: 'partidas',
      titulo: 'Cuánto cuesta abrir un estudio de pilates: las partidas',
      bloques: [
        {
          t: 'p',
          texto: 'Separa la **inversión inicial**, lo que pagas una vez antes de abrir, de los **gastos fijos**, lo que pagas cada mes pase lo que pase. Donde no hay un precio público fiable, te decimos cómo sacar el tuyo.',
        },
        {
          t: 'tabla',
          cabecera: ['Partida', 'Tipo', 'Referencia con fuente o cómo calcularla'],
          filas: [
            ['Reformers', 'Inversión', '2.891,90-6.037,90 € por máquina con IVA (Elina Pilates); 3.023,81 € el Align-Pilates C8 Pro'],
            ['Sillas y esterillas', 'Inversión', 'Silla, 1.076,90-2.165,90 €; esterilla de estudio, 20,70 € (Elina Pilates, con IVA)'],
            ['Fianza del local', 'Inversión', 'Dos mensualidades por ley, más las garantías que se pacten'],
            ['Alquiler', 'Gasto fijo', 'Precio por m² de los locales de tu zona × tus metros'],
            ['Obra y proyecto técnico', 'Inversión', 'Presupuestos de obra y de la técnica: dependen del local'],
            ['Licencia o declaración responsable', 'Inversión', 'Tasa de la ordenanza fiscal de tu ayuntamiento'],
            ['Registro de marca', 'Inversión', '127,88 € la primera clase, trámite electrónico (OEPM)'],
            ['Seguro de responsabilidad civil', 'Gasto fijo', 'Desde 155 €/año la de una monitora, según un comparador; la del estudio, a presupuesto'],
            ['Cuota de autónoma', 'Gasto fijo', 'Cuota reducida de 80 €/mes los 12 primeros meses (cuantía legal de 2023-2025)'],
            ['Software de reservas y cobros', 'Gasto fijo', 'Tentare: 29, 59 o 149 €/mes con IVA según el plan'],
            ['Comisiones de cobro', 'Variable', 'Stripe: 1,5 % + 0,25 € por pago con tarjeta estándar del EEE'],
            ['Instructoras', 'Gasto fijo o variable', '[Cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates)'],
            ['Marketing de apertura', 'Inversión', 'Tu plan: web, fotos, anuncios y preventa'],
          ],
          nota: 'Precios consultados el 25 de septiembre de 2026 en la web de cada fabricante, tienda u organismo; el detalle y la fuente de cada uno, en las secciones siguientes. Cambian: compruébalos antes de comprar.',
        },
      ],
    },
    {
      id: 'precio-de-un-reformer',
      titulo: 'Cuánto cuesta un reformer de pilates: precio de una máquina reformer por marca',
      bloques: [
        {
          t: 'p',
          texto: 'Es la partida que más pesa en un estudio de reformer y la que más varía. Estos son los precios que publican hoy fabricantes y tiendas que venden en España:',
        },
        {
          t: 'tabla',
          cabecera: ['Marca y modelo', 'Sin IVA', 'Con IVA', 'Dónde'],
          filas: [
            ['Elina Pilates Aluminum HL1', '2.390,00 €', '2.891,90 €', 'Tienda oficial europea'],
            ['Elina Pilates Elite', '2.890,00 €', '3.496,90 €', 'Tienda oficial europea'],
            ['Elina Pilates Master Instructor', '3.490,00 €', '4.222,90 €', 'Tienda oficial europea'],
            ['Elina Pilates Master Instructor Physio', '4.990,00 €', '6.037,90 €', 'Tienda oficial europea'],
            ['Elina Pilates Nubium (doméstico y profesional)', '1.990,00 €', '2.407,90 €', 'Tienda oficial europea'],
            ['Align-Pilates C8 Pro', 'No lo indica', '3.023,81 €', 'Aerobic y Fitness, tienda española'],
            ['Merrithew SPX Max y SPX Max Plus', '3.649 y 6.399 dólares', 'No lo indica', 'Tienda oficial de EE. UU.; en España, bajo presupuesto'],
            ['Balanced Body Allegro 2', 'Sin precio público', 'Sin precio público', 'Bajo presupuesto, también en España'],
          ],
          nota: 'Precios publicados el 25 de septiembre de 2026. Elina Pilates muestra cada precio sin IVA y con IVA (21 %). Merrithew publica en dólares en su tienda de EE. UU. y en España vende a través de su distribuidor, que da precio bajo presupuesto; Balanced Body remite a su representante, y su distribuidor en España tampoco publica precio.',
        },
        {
          t: 'p',
          texto: '**Qué sube el precio de una máquina reformer.** El material (madera o aluminio), la altura de fisioterapia y los accesorios. La torre es el ejemplo más claro: en Elina Pilates, el HL1 cuesta 2.390 € sin IVA, y con torre, 3.150 €. Para un estudio, comprueba que la garantía cubre uso profesional: hay modelos que la marca vende solo para casa.',
        },
        {
          t: 'p',
          texto: '**El resto del equipamiento.** En la misma tienda, una silla de pilates cuesta de 1.076,90 € a 2.165,90 € con IVA, una esterilla de estudio de 180 × 58 cm, 20,70 €, y una esterilla profesional con asas, 592,90 €. Suma accesorios pequeños (aros, pelotas, bandas) y el mobiliario de recepción y vestuario.',
        },
        {
          t: 'p',
          texto: '**Segunda mano.** Abarata la partida, pero sin precio de referencia fiable: depende del modelo, los años y el uso. Prueba la máquina, revisa muelles, cuerdas y ruedas del carro, y pregunta qué garantía tiene.',
        },
      ],
    },
    {
      id: 'local-y-obra',
      titulo: 'Cuánto cuesta el local: alquiler, fianza y obra',
      bloques: [
        {
          t: 'p',
          texto: 'El alquiler cambia tanto de una calle a otra que una media nacional te serviría de poco. Calcula tu referencia así:',
        },
        {
          t: 'lista',
          ordenada: true,
          items: [
            'Decide los metros: la sala (en el ejemplo de [cómo abrir un estudio de pilates](/recursos/como-abrir-un-estudio-de-pilates), unos 36 m² para seis reformers con holgura) más recepción, vestuarios y aseos.',
            'Busca en los portales inmobiliarios locales en alquiler de ese tamaño en tu zona y apunta precio y metros de al menos diez anuncios.',
            'Divide cada precio entre sus metros y quédate con el valor del medio: es tu precio por m² al mes de referencia.',
            'Multiplícalo por tus metros: esa es la renta que tiene que caber en tus números.',
          ],
        },
        {
          t: 'p',
          texto: 'Al firmar pagarás la **fianza legal de dos mensualidades**, que la Ley de Arrendamientos Urbanos fija para los alquileres de uso distinto de vivienda, y, si se pacta, una garantía adicional, como un aval. Negocia también meses de carencia: mientras haces la obra y tramitas la licencia pagas alquiler sin ingresar nada.',
        },
        {
          t: 'p',
          texto: '**Obra.** Suelo, vestuarios, aseo accesible, climatización, iluminación, insonorización y lo que pida el Código Técnico de la Edificación en accesibilidad y seguridad. No hay un precio por metro que valga para cualquier local: pide varios presupuestos con el mismo alcance, y el proyecto técnico si tu ayuntamiento lo exige.',
        },
      ],
    },
    {
      id: 'tramites-seguros-y-cuotas',
      titulo: 'Trámites, seguros y cuotas: lo que cuesta ponerse en regla',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Tasas municipales.** La declaración responsable o la licencia llevan la tasa que fija la ordenanza fiscal de tu ayuntamiento; pídela antes de firmar el local y suma los honorarios de la técnica si necesitas proyecto. Qué trámites te tocan, en [requisitos para abrir un estudio de pilates](/recursos/requisitos-para-abrir-un-estudio-de-pilates).',
            '**Cuota de autónoma.** En tu primera alta, la cuota reducida: 80 € al mes durante 12 meses, ampliable otros 12 si tus rendimientos netos no llegan al salario mínimo. El Real Decreto-ley 13/2022 fijó esa cuantía para 2023-2025 y deja la de 2026 en adelante a los Presupuestos: confírmala en Import@ss. Después cotizarás según tus rendimientos.',
            '**Sociedad limitada**, si la eliges: capital mínimo de 1 € desde la Ley 18/2022, más notaría, registro y gestoría.',
            '**Registro de marca.** 127,88 € la primera clase en trámite electrónico ante la OEPM (150,45 € en papel) y 82,84 € cada clase más, con las tasas vigentes desde el 1 de abril de 2026. Ideas de nombre, en [nombres para un estudio de pilates](/recursos/nombres-para-estudio-de-pilates).',
            '**Seguro de responsabilidad civil.** Un comparador de seguros publica la RC de una monitora deportiva con 300.000 € de cobertura desde 155 € al año (comparativa de septiembre de 2025). La póliza del estudio, que cubre también el local, te la tienen que presupuestar.',
            '**Música.** Si pones música grabada en clase, suma las licencias de la SGAE y de Somos Música (AGEDI y AIE).',
          ],
        },
      ],
    },
    {
      id: 'software-cobros-y-marketing',
      titulo: 'Software, cobros y marketing',
      bloques: [
        {
          t: 'p',
          texto: 'El software de reservas y cobros pesa poco al lado del alquiler, pero decide cuántas horas pasas contestando mensajes. Si buscas opciones gratuitas, las repasamos en [software de pilates gratis](/recursos/software-pilates-gratis); las de pago, comparadas, en [el mejor software para estudios de pilates](/recursos/mejor-software-para-estudios-de-pilates). Tentare cuesta 29 € al mes en el plan Base, 59 € en el Estudio y 149 € en el Cadena, con IVA y sin permanencia ([precios](/precios)).',
        },
        {
          t: 'p',
          texto: 'Súmale las **comisiones de cobro**. Stripe, por ejemplo, cobra en España un 1,5 % + 0,25 € por pago con tarjeta estándar del Espacio Económico Europeo, un 2,8 % + 0,25 € con tarjeta premium y 0,35 € por adeudo directo SEPA, sin cuota mensual. En un bono de 100 € pagado con tarjeta estándar (ejemplo), la comisión sería de 1,75 €.',
        },
        {
          t: 'p',
          texto: '**Marketing de apertura.** Web con reservas, fotos de la sala, perfil en Google, anuncios locales y preventa de bonos. No hay una cifra estándar: fija un presupuesto cerrado y mide qué canal te trae alumnas que se quedan.',
        },
      ],
    },
    {
      id: 'presupuesto-de-ejemplo',
      titulo: 'Inversión para un estudio de pilates: ejemplo con 6 reformers',
      bloques: [
        {
          t: 'p',
          texto: 'Esto es un **ejemplo**, no un presupuesto cerrado: usa solo precios publicados y deja en blanco lo que depende de tu local, tu municipio y tus decisiones.',
        },
        {
          t: 'tabla',
          cabecera: ['Partida', 'Ejemplo', 'De dónde sale'],
          filas: [
            ['6 reformers Elina Pilates Aluminum HL1', '17.351,40 €', '6 × 2.891,90 € con IVA'],
            ['6 esterillas de estudio de 180 × 58 cm', '124,20 €', '6 × 20,70 € con IVA'],
            ['1 silla de pilates', '1.197,90 €', 'Elina Pilates, con IVA'],
            ['Registro de marca, 1 clase', '127,88 €', 'OEPM, trámite electrónico'],
            ['Software, plan Estudio, 12 meses', '708,00 €', '12 × 59 € con IVA'],
            ['Cuota de autónoma, 12 meses', '960,00 €', '12 × 80 € de cuota reducida (confirma la vigente)'],
            ['**Subtotal con precio público**', '**20.469,38 €**', 'Suma de las filas anteriores'],
            ['Fianza del local', '2 × tu renta', 'Ley de Arrendamientos Urbanos'],
            ['Obra, proyecto y tasas', 'Tus presupuestos', 'Técnica y ayuntamiento'],
            ['Seguros', 'Tu presupuesto', 'Aseguradora o correduría'],
            ['Alquiler, instructoras y demás gastos hasta llenar', 'Tu previsión', '[Rentabilidad de un estudio de pilates](/recursos/rentabilidad-estudio-de-pilates)'],
          ],
          nota: 'Ejemplo construido con precios publicados el 25 de septiembre de 2026 (Elina Pilates, OEPM, Tentare y Seguridad Social). Incluye 12 meses de software y de cuota de autónoma. Comprueba si el precio de las máquinas incluye transporte y montaje.',
        },
        {
          t: 'p',
          texto: 'Con otras máquinas, el ejemplo cambia rápido: con seis Align-Pilates C8 Pro, la línea de reformers pasa a 18.142,86 €; con seis Master Instructor Physio de Elina, a 36.227,40 €.',
        },
        {
          t: 'p',
          texto: '**El IVA de la inversión.** Si tus clases llevan IVA, que es lo general (la DGT las consideró sujetas y no exentas en la consulta V2661-14; los matices, en [IVA en las clases de pilates](/recursos/iva-clases-de-pilates)), el IVA de lo que compras para el estudio se deduce, incluso el pagado antes de empezar la actividad si cumples los requisitos. Tu coste real en máquinas es entonces el precio sin IVA: 14.340 € por los seis HL1, aunque al comprar adelantes 17.351,40 €.',
        },
        {
          t: 'p',
          texto: '**El colchón.** Cuenta con que el estudio no abrirá lleno: guarda caja para pagar los gastos fijos de los primeros meses mientras sube la ocupación. Cuántos meses, lo decide tu previsión, que puedes construir con [rentabilidad de un estudio de pilates](/recursos/rentabilidad-estudio-de-pilates).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Cuánto cuesta un reformer de pilates?',
      a: 'En la tienda oficial de Elina Pilates, un reformer profesional cuesta de 2.891,90 € a 6.037,90 € con IVA, y el Align-Pilates C8 Pro, 3.023,81 € con IVA en una tienda española. Merrithew y Balanced Body venden en España bajo presupuesto; en su tienda de EE. UU., el Merrithew SPX Max cuesta 3.649 dólares.',
    },
    {
      q: '¿Cuánto cuesta poner un estudio de pilates reformer?',
      a: 'Solo seis máquinas cuestan de 17.351,40 € a 36.227,40 € con IVA según el modelo (precios de Elina Pilates). A eso súmale la fianza del local, la obra, las tasas, los seguros, el software y un colchón para los primeros meses, que dependen de tu local y de tu municipio.',
    },
    {
      q: '¿Se puede abrir un estudio de pilates con poco dinero?',
      a: 'Sí, si empiezas por mat: una esterilla de estudio cuesta desde 20,70 €, frente a los miles de euros de un reformer. O empieza con menos reformers y amplía cuando la ocupación lo pida. Lo que no conviene recortar es el seguro ni el colchón.',
    },
    {
      q: '¿Los precios de los reformers llevan IVA?',
      a: 'Depende de la tienda: Elina Pilates muestra los dos precios, sin IVA y con el 21 %. Si tu estudio repercute IVA en las clases, el IVA de las máquinas lo deduces en tus declaraciones, así que tu coste real es el precio sin IVA, aunque al comprar adelantes el total.',
    },
    {
      q: '¿Cuánto cuesta el software para un estudio de pilates?',
      a: 'Tentare cuesta 29, 59 o 149 € al mes con IVA según el plan, sin permanencia y con 7 días de prueba gratis sin tarjeta. Aparte van las comisiones del procesador de pagos: con Stripe, un 1,5 % + 0,25 € por pago con tarjeta estándar del Espacio Económico Europeo.',
    },
    { q: '¿Cuánto cuesta montar un negocio de pilates?', a: 'Lo que tiene precio público suma unos 20.500 € en nuestro ejemplo: 6 reformers de gama de entrada, una silla, esterillas, el registro de la marca y 12 meses de software y de cuota de autónoma. Aparte van la fianza, la obra, las tasas y los seguros, que dependen de tu local y de tu municipio. Con reformers de gama alta, solo las máquinas pasan de 36.000 €.' },
    {
      q: '¿En cuánto tiempo se recupera la inversión de un estudio de pilates?',
      a: 'No hay una cifra honesta que valga para todos: depende de la ocupación, de los precios y de los gastos fijos de tu local. Calcula cuántas plazas necesitas vender al mes para cubrir gastos y qué margen te queda por encima; con eso sale tu plazo.',
    },
  ],
  fuentes: [
    { titulo: 'Elina Pilates, tienda oficial europea: reformers', url: 'https://www.elinapilates.com/eu/en/59-pilates-reformers', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: reformers con torre', url: 'https://www.elinapilates.com/eu/en/60-reformers-with-tower', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: sillas', url: 'https://www.elinapilates.com/eu/en/62-chairs', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: esterillas', url: 'https://www.elinapilates.com/eu/en/69-mats', consultada: '2026-09-25' },
    { titulo: 'Aerobic y Fitness: Reformer Align-Pilates C8 Pro (IVA incluido)', url: 'https://www.aerobicyfitness.com/es/material-de-yoga-y-pilates/reformer-align-pilates-c8-pro-4078.html', consultada: '2026-09-25' },
    { titulo: 'Merrithew: reformers profesionales SPX (tienda de EE. UU.)', url: 'https://www.merrithew.com/shop/pilates-reformers/professional/spx-series-reformers', consultada: '2026-09-25' },
    { titulo: 'Merrithew: distribuidor oficial en España', url: 'https://www.merrithew.com/distributors/spain-es', consultada: '2026-09-25' },
    { titulo: 'Spain Pilates (distribuidor de Merrithew): SPX Max Plus, precio bajo presupuesto', url: 'https://www.spainpilates.com/spx-max-plus-reformer', consultada: '2026-09-25' },
    { titulo: 'Balanced Body: Allegro 2 Reformer', url: 'https://www.pilates.com/products/allegro-2-pilates-reformer/', consultada: '2026-09-25' },
    { titulo: 'Balanced Body España: Reformer Allegro 2', url: 'https://pilatesbalancedbody.es/productos/reformer-allegro-2/', consultada: '2026-09-25' },
    { titulo: 'Ley de Arrendamientos Urbanos, artículo 36: fianza (Iberley)', url: 'https://www.iberley.es/legislacion/articulo-36-ley-arrendamientos-urbanos', consultada: '2026-09-25' },
    { titulo: 'Código Técnico de la Edificación: DB-SUA, seguridad de utilización y accesibilidad', url: 'https://www.codigotecnico.org/DocumentosCTE/SeguridadUtilizacionAccesibilidad.html', consultada: '2026-09-25' },
    { titulo: 'Seguridad Social: sistema de cotización de autónomos y cuota reducida', url: 'https://www.seg-social.es/wps/portal/wss/internet/HerramientasWeb/9d2fd4f1-ab0f-42a6-8d10-2e74b378ee24?changeLanguage=es', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto-ley 13/2022, nuevo sistema de cotización de autónomos (cuota reducida de 2023 a 2025)', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2022-12482', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 18/2022, de creación y crecimiento de empresas', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2022-15818', consultada: '2026-09-25' },
    { titulo: 'OEPM: tasas de marcas y nombres comerciales desde el 1 de abril de 2026', url: 'https://www.oepm.es/export/sites/portal/comun/documentos_relacionados/PDF/TASAS_MARCAS_Y_NOMBRES_COMERCIALES.pdf', consultada: '2026-09-25' },
    { titulo: 'Aseguratunegocio.com: seguros de responsabilidad civil para monitores deportivos', url: 'https://www.aseguratunegocio.com/comparativa/seguros-monitores-deportivos-y-entrenadores', consultada: '2026-09-25' },
    { titulo: 'SGAE: licencia de gimnasios y academias de baile', url: 'https://www.sgae.es/licencia-de-gimnasios-y-academias-de-baile/', consultada: '2026-09-25' },
    { titulo: 'Somos Música (AGEDI y AIE): licencias de música para negocios', url: 'https://somos-musica.es/', consultada: '2026-09-25' },
    { titulo: 'Stripe: tarifas en España', url: 'https://stripe.com/es/pricing', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V2661-14 (clases de pilates), texto en Iberley', url: 'https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v2661-14-08-10-2014-704921', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: deducción de las cuotas soportadas antes de iniciar la actividad', url: 'https://sede.agenciatributaria.gob.es/Sede/eu_es/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2025/capitulo-05-deducciones-devoluciones/deducciones/deducc-cuotas-sop-satisf-antes-servic.html', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/como-abrir-un-estudio-de-pilates',
    '/recursos/requisitos-para-abrir-un-estudio-de-pilates',
    '/recursos/precios-reformer-mat',
    '/funcionalidades/informes-y-rentabilidad',
    '/precios',
  ],
  cta: {
    titulo: 'Comprueba desde el primer mes si cada clase se paga',
    texto: 'Tentare te enseña la rentabilidad de cada clase (lo que ingresa menos lo que cuesta la instructora) y cobra bonos y cuotas online desde el primer día. Pruébalo 7 días gratis, sin tarjeta, con el plan que elijas.',
  },
  revision: [
    'Los precios de equipamiento (Elina Pilates, Aerobic y Fitness, Merrithew) son del 25-sep-2026 y cambian a menudo: revisarlos antes de publicar.',
    'El precio del seguro (desde 155 €/año) sale de una comparativa de septiembre de 2025 de un comparador (aseguratunegocio.com), no de una aseguradora; cambiarlo si aparece una fuente mejor.',
    'Tarifa plana: el RDL 13/2022 y la Seguridad Social fijan 80 €/mes para 2023-2025 y remiten 2026 a los Presupuestos; no se encontró la norma de 2026 (guías privadas la siguen dando en 80 €). El ejemplo usa 80 €: confirmar y, si hay norma, citarla.',
    'Tasas de la OEPM vigentes desde el 1-abr-2026: confirmar a la fecha de publicación.',
  ],
};

export default articulo;
