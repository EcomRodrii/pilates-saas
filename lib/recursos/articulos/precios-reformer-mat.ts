import type { Articulo } from './tipos.ts';

// Rehecho el 7-oct-2026 a partir de la guía antigua del mismo nombre (TSX con
// cifras «de ejemplo ilustrativo» y sin fuentes). Mantiene la URL y los enlaces
// que ya recibía. Ahora va de la ECONOMÍA de cada plaza: lo que cuesta, lo que
// factura una máquina y la diferencia de precio real entre reformer y suelo.
// Los precios salen del estudio de 32 estudios (precio-clase-de-pilates) y los
// costes, del escenario A de la calculadora de rentabilidad; el precio de las
// máquinas, de la tienda oficial de Elina Pilates (cuanto-cuesta-abrir…).

const articulo: Articulo = {
  slug: 'precios-reformer-mat',
  titulo: 'Reformer vs. mat: cuánto cuesta cada plaza, cuánto factura una máquina y qué precio ponerle',
  tituloSeo: 'Reformer vs mat: coste por plaza y cuánto factura un reformer',
  descripcion: 'Cuánto cuesta ofrecer una plaza de reformer y una de mat, cuánto factura una máquina al mes y qué diferencia de precio cobran 32 estudios españoles.',
  resumen: 'La cuenta de una plaza de reformer frente a una de suelo, lo que factura cada máquina según la ocupación y la diferencia de precio que cobran los estudios españoles.',
  categoria: 'rentabilidad',
  seccion: 'Rentabilidad',
  publicado: '2026-07-01',
  actualizado: '2026-10-07',
  consultaPrincipal: 'precio reformer vs mat',
  consultas: [
    'cuánto factura un reformer al mes',
    'coste por plaza de una clase de pilates',
    'diferencia de precio entre pilates reformer y suelo',
    'cuánto cobrar por una clase de reformer',
    'rentabilidad de un reformer',
  ],
  respuesta:
    'Una plaza de reformer cuesta más que una de mat porque el aforo lo fijan las máquinas: los mismos costes de instructora y local se reparten entre seis reformers en lugar de entre doce esterillas. En los seis estudios de nuestra muestra que venden los dos formatos con la misma tarifa, la máquina cuesta entre 1,27 y 2,2 veces el suelo (mediana: 1,6). Con 25 clases a la semana, un 70 % de ocupación y 18,75 € de precio medio por sesión, cada reformer ingresa unos 1.420 € al mes.',
  entradilla:
    'Muchos estudios ponen al reformer el precio de la competencia y al suelo, lo que queda. Funciona hasta que haces la cuenta: son dos negocios con costes y techos de ingresos distintos bajo el mismo techo. Aquí está la cuenta de cada plaza, lo que factura una máquina y lo que cobran de verdad 32 estudios españoles.',
  secciones: [
    {
      id: 'por-que-cuestan-distinto',
      titulo: 'Por qué una plaza de reformer cuesta más que una de mat',
      bloques: [
        {
          t: 'p',
          texto: 'En suelo, otra alumna cabe casi gratis: una esterilla de estudio cuesta 20,70 € con IVA en la tienda oficial de Elina Pilates. En reformer, el aforo queda fijado el día que compras las máquinas, y un reformer profesional cuesta en la misma tienda entre 2.891,90 y 6.037,90 € con IVA. La instructora y el local cuestan lo mismo con seis alumnas que con doce, así que cada plaza de reformer carga con una parte más grande de esos costes.',
        },
        {
          t: 'lista',
          items: [
            '**Menos plazas por clase.** Los estudios de la muestra van de 4 a 12 reformers por clase; en suelo, el límite es el espacio.',
            '**Más inversión por plaza.** Una máquina cuesta lo que entre 140 y 290 esterillas.',
            '**Más mantenimiento.** Muelles, cuerdas y tapicería se cambian; una esterilla se repone.',
            '**Más estudios lo venden.** El reformer en grupo es el formato más extendido de la muestra: lo venden 26 de los 32 estudios.',
          ],
        },
      ],
    },
    {
      id: 'coste-por-plaza',
      titulo: 'Cuánto cuesta ofrecer una plaza: la cuenta',
      bloques: [
        {
          t: 'p',
          texto: 'El coste de una plaza es lo que cuesta dar una clase (la instructora más su parte de los gastos fijos) dividido entre las plazas que de verdad se ocupan. Por debajo de esa cifra, llenar la clase te hace perder dinero. Un ejemplo con los costes del escenario base de nuestra [calculadora de rentabilidad](/recursos/rentabilidad-estudio-de-pilates):',
        },
        {
          t: 'tabla',
          cabecera: ['Concepto', 'Reformer (6 máquinas)', 'Suelo (12 esterillas)'],
          filas: [
            ['Instructora por clase', '25 €', '25 €'],
            ['Gastos fijos por clase', '23,11 € (local y reserva para máquinas)', '18,46 € (local)'],
            ['Coste de dar la clase', '48,11 €', '43,46 €'],
            ['Coste por plaza, con la clase llena', '8,02 €', '3,62 €'],
            ['Coste por plaza, al 70 % de ocupación', '11,45 €', '5,17 €'],
          ],
          nota: 'Ejemplo: 2.400 € de local, 604 € al mes de reserva para renovar máquinas (solo en reformer) y 30 clases a la semana (130 al mes). Son los costes del escenario A de la calculadora de rentabilidad (en suelo, sin la reserva para máquinas); cámbialos por los tuyos.',
        },
        {
          t: 'p',
          texto: 'La plaza de reformer cuesta algo más del doble que la de suelo: el doble por tener la mitad de plazas para los mismos costes, y algo más por la reserva para las máquinas. Y lo que más mueve la cifra no es el alquiler: es la ocupación. Del 100 % al 70 %, el coste de cada plaza ocupada sube un 43 %.',
        },
      ],
    },
    {
      id: 'cuanto-factura-un-reformer',
      titulo: 'Cuánto factura un reformer al mes',
      bloques: [
        {
          t: 'p',
          texto: 'Lo que ingresa una máquina al mes es: clases a la semana × 4,33 × ocupación × precio medio por sesión. Si la máquina se usa en 25 clases a la semana y cada sesión sale de media a 18,75 € (lo que cuesta cada clase de la cuota mediana de una clase semanal de reformer, 75 €, contando cuatro al mes, como hacen los estudios en su web):',
        },
        {
          t: 'tabla',
          cabecera: ['Ocupación', 'Sesiones al mes por máquina', 'Ingresos al mes con IVA', 'Sin IVA'],
          filas: [
            ['50 %', '54', '1.016 €', '839 €'],
            ['60 %', '65', '1.219 €', '1.007 €'],
            ['70 %', '76', '1.422 €', '1.175 €'],
            ['80 %', '87', '1.625 €', '1.343 €'],
            ['90 %', '98', '1.828 €', '1.511 €'],
          ],
          nota: 'Cálculo: 25 clases × 52/12 semanas × ocupación × 18,75 € (cuota mediana de una clase semanal de reformer en 32 estudios, 25-sep-2026, entre cuatro clases). Sin IVA, al 21 %. Sesiones redondeadas. Si todas tus alumnas pagan esa cuota, el mes tiene de media 4,33 semanas y cada sesión sale a 17,31 €: los ingresos son un 8 % más bajos.',
        },
        {
          t: 'p',
          texto: 'Otra forma de verlo: una máquina de 2.891,90 € equivale a 154 sesiones a 18,75 €, y una de 6.037,90 €, a 322. Cada plaza que sale y no se reserva retrasa esa cuenta, y no se recupera: la clase de las 19:00 del martes no se puede vender el miércoles. Pon tus números en la [calculadora de plazas vacías](/soluciones/estudio-de-pilates-reformer) para ver cuánto es al mes en tu estudio.',
        },
      ],
    },
    {
      id: 'diferencia-de-precio',
      titulo: 'Qué diferencia de precio cobran los estudios entre reformer y suelo',
      bloques: [
        {
          t: 'tabla',
          cabecera: ['Precio', 'Reformer en grupo', 'Suelo en grupo'],
          filas: [
            ['Clase suelta (mediana)', '25 €', '16 €'],
            ['Cuota de 1 clase a la semana', '75 €/mes', '55 €/mes'],
            ['Por sesión con esa cuota', '18,75 €', '13,75 €'],
            ['Por sesión con 2 clases a la semana', '16,25 €', '10,63 €'],
          ],
          nota: 'Medianas de las tarifas publicadas por 32 estudios de 8 ciudades españolas, consultadas el 25-sep-2026 (ver precio de una clase de pilates). Reformer: 18 estudios con clase suelta y 23 con cuota; suelo: 7 y 8.',
        },
        {
          t: 'p',
          texto: 'La comparación más limpia es dentro de un mismo estudio. En los seis que venden los dos formatos con la misma tarifa, la máquina siempre cuesta más: entre **1,27 y 2,2 veces** el suelo, con una mediana de **1,6**. Ojo con la conclusión: con los números de arriba, una clase de suelo llena ingresa más (12 × 13,75 € = 165 €) que una de reformer llena (6 × 18,75 € = 112,50 €). El reformer no se sostiene por el margen de cada plaza, sino por lo que la alumna está dispuesta a pagar por él; si tu sala de suelo se llena, no la descuides.',
        },
        {
          t: 'p',
          texto: 'La regla práctica: el precio mínimo de cada formato es su coste por plaza a tu ocupación real, más el margen que quieras y el 21 % de IVA. A partir de ahí, compárate con los estudios de tu zona y tu formato, no con una media nacional.',
        },
      ],
    },
    {
      id: 'como-montar-los-precios',
      titulo: 'Cómo montar los precios de los dos formatos',
      bloques: [
        {
          t: 'pasos',
          items: [
            { titulo: 'Bonos y cuotas por formato', texto: 'Un bono de reformer y otro de suelo, cada uno con su precio. Es lo más claro para la alumna y lo más fácil de explicar en recepción.' },
            { titulo: 'Un bono con créditos', texto: 'Si prefieres un solo producto, la sesión de reformer descuenta más créditos que la de suelo. Mantienes la diferencia sin multiplicar bonos, pero hay que explicarlo bien.' },
            { titulo: 'La cuota que cubre los dos', texto: 'Para quien hace los dos formatos cada semana: una cuota con un límite de clases a la semana, más cara que la de solo suelo.' },
            { titulo: 'La escalera dentro de cada formato', texto: 'Suelta, bono de 5, bono de 10 y cuota, cada escalón más barato por sesión que el anterior. Cómo hacerla, en [bonos de pilates](/recursos/bonos-de-pilates).' },
          ],
        },
        {
          t: 'nota',
          titulo: 'Revisa los precios una vez al año',
          texto: 'Y siempre que suba un coste importante (alquiler, salarios) o que una franja tenga lista de espera fija. Sube primero donde hay cola, avisa con antelación y respeta el precio a quien ya tiene un bono en curso.',
        },
      ],
    },
    {
      id: 'proteger-el-precio',
      titulo: 'Protege el precio de las plazas vacías',
      bloques: [
        {
          t: 'p',
          texto: 'El precio perfecto no sirve de nada si las plazas se quedan vacías por cancelaciones de última hora. En reformer duele el doble, porque cada plaza cuesta el doble. Tres defensas que funcionan juntas:',
        },
        {
          t: 'lista',
          items: [
            '**Una ventana de cancelación clara**, más larga en reformer que en suelo si quieres: quien cancela tarde pierde la sesión. Plantilla y ley, en [política de cancelación de clases](/recursos/politica-de-cancelacion-de-clases).',
            '**Lista de espera que da la plaza sola** a la siguiente en cuanto alguien cancela a tiempo.',
            '**Recordatorio de la clase** el día antes: buena parte de las faltas son olvidos. Más tácticas, en [cómo reducir las cancelaciones y los plantones](/recursos/reducir-cancelaciones-ultima-hora).',
          ],
        },
        {
          t: 'producto',
          titulo: 'El reformer y el mat, cada uno con su precio y sus reglas',
          texto: 'En Tentare los bonos y las cuotas pueden ser de un tipo de clase concreto, si defines los puestos de la sala la alumna elige su reformer al reservar, y la plaza que se libera pasa sola a la primera de la lista de espera. Desde 29 €/mes con IVA y sin permanencia.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Cuántas veces más caro tiene que ser el reformer que el suelo?',
      a: 'En los seis estudios de nuestra muestra que venden los dos formatos con la misma tarifa, el reformer cuesta entre 1,27 y 2,2 veces el suelo, con una mediana de 1,6. Tu cifra depende de tu coste por plaza: con seis máquinas frente a doce esterillas y los mismos costes, la plaza de reformer cuesta el doble, y algo más con la reserva para renovar las máquinas.',
    },
    {
      q: '¿Cuánto factura un reformer al mes?',
      a: 'Con 25 clases a la semana y 18,75 € de precio medio por sesión, unos 1.016 € al mes al 50 % de ocupación, 1.422 € al 70 % y 1.828 € al 90 %, con IVA. Sin IVA, 839, 1.175 y 1.511 €.',
    },
    {
      q: '¿Cuánto cuesta un reformer?',
      a: 'En la tienda oficial europea de Elina Pilates, un reformer profesional cuesta de 2.891,90 a 6.037,90 € con IVA según el modelo, y el Nubium, para casa y para estudio, 2.407,90 €. Una esterilla de estudio cuesta 20,70 €.',
    },
    {
      q: '¿Puedo cobrar el reformer y el suelo con el mismo bono?',
      a: 'Sí, con un bono de créditos en el que la sesión de reformer descuenta más que la de suelo. Es más difícil de explicar que dos bonos separados, pero evita multiplicar productos.',
    },
    {
      q: '¿Qué pesa más en el coste de una plaza?',
      a: 'La ocupación. Con los mismos costes, pasar del 100 % al 70 % sube el coste de cada plaza ocupada un 43 %. Por eso una plaza vacía de reformer duele más que una de suelo.',
    },
  ],
  fuentes: [
    { titulo: 'Elina Pilates, tienda oficial europea: reformers', url: 'https://www.elinapilates.com/eu/en/59-pilates-reformers', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: reformers con torre', url: 'https://www.elinapilates.com/eu/en/60-reformers-with-tower', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: esterillas', url: 'https://www.elinapilates.com/eu/en/69-mats', consultada: '2026-09-25' },
    { titulo: 'Horta Pilates (Barcelona): precios', url: 'https://www.hortapilates.com/precios/', consultada: '2026-09-25' },
    { titulo: 'Temple Pilates (Madrid): precios', url: 'https://templepilates.es/precios/', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/precio-clase-de-pilates',
    '/recursos/rentabilidad-estudio-de-pilates',
    '/recursos/bonos-de-pilates',
    '/soluciones/estudio-de-pilates-reformer',
  ],
  cta: {
    titulo: 'Cada formato con su precio, y ninguna plaza perdida.',
    texto: 'Bonos y cuotas por tipo de clase, reserva por reformer y lista de espera automática. 7 días gratis, sin tarjeta y sin permanencia.',
  },
  revision: [
    'Precios de Elina Pilates y de la muestra de 32 estudios: 25-sep-2026.',
    'El ejemplo de costes es el escenario A de rentabilidad-estudio-de-pilates; si cambia allí, cambia aquí.',
  ],
};

export default articulo;
