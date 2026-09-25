import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'rentabilidad-estudio-de-pilates',
  titulo: '¿Es rentable un estudio de pilates? Cómo calcularlo con tus números',
  tituloSeo: '¿Es rentable un estudio de pilates? Cómo calcularlo',
  descripcion: 'Fórmula de ingresos, costes fijos y punto de equilibrio de un estudio de pilates, con tres escenarios de ejemplo y precios reales de 32 estudios.',
  resumen: 'La cuenta que dice si tu estudio gana dinero: plazas, clases, ocupación y precio medio por plaza, costes fijos y variables, punto de equilibrio y tres escenarios de ejemplo.',
  categoria: 'rentabilidad',
  seccion: 'Rentabilidad',
  publicado: '2026-09-25',
  consultaPrincipal: '¿es rentable un estudio de pilates?',
  consultas: [
    'cuánto se gana con un estudio de pilates',
    'rentabilidad de un estudio de pilates',
    'cuánto gana un estudio de pilates al mes',
    'punto de equilibrio de un estudio de pilates',
  ],
  respuesta: 'Un estudio de pilates es rentable si vende suficientes plazas a un precio que cubra sus costes y tu sueldo. Los ingresos son plazas por clase × clases a la semana × 4,33 × ocupación × precio medio por plaza sin IVA. En nuestro ejemplo de 6 reformers, 30 clases semanales pagadas a una instructora y 18,75 € por sesión (la mediana del mercado), el estudio cubre gastos hacia el 53 % de ocupación y necesita cerca del 70 % para dejarte además 2.000 € al mes.',
  entradilla: '¿Es rentable un estudio de pilates? No hay una cifra que valga para todos: hay una cuenta. Te la damos entera, con los precios reales de 32 estudios, tres escenarios de ejemplo y las palancas que más mueven el resultado.',
  secciones: [
    {
      id: 'es-rentable-un-estudio-de-pilates',
      titulo: '¿Es rentable un estudio de pilates? Depende de cuatro números',
      bloques: [
        { t: 'p', texto: 'Un estudio de pilates vende plazas, y cada clase tiene un techo: sus reformers o sus esterillas. La rentabilidad no depende de si el pilates está de moda, sino de cuatro números que puedes medir:' },
        {
          t: 'lista',
          items: [
            '**Plazas por clase:** cuántas máquinas o esterillas caben en la sala.',
            '**Clases a la semana:** cuántas franjas abres de verdad.',
            '**Ocupación:** qué parte de esas plazas vendes y no se quedan vacías.',
            '**Precio medio por plaza:** lo que ingresas de media por cada plaza ocupada, sin IVA.',
          ],
        },
        { t: 'p', texto: 'Enfrente, los costes: instructoras, local, máquinas y cobros. Por encima del punto de equilibrio ganas; por debajo pierdes, aunque las horas punta vayan llenas. Y cuenta tu sueldo como coste, o la cuenta engaña.' },
      ],
    },
    {
      id: 'formula-de-ingresos',
      titulo: 'La fórmula de ingresos de un estudio de pilates',
      bloques: [
        { t: 'nota', titulo: 'La fórmula', texto: '**Ingresos al mes = plazas por clase × clases a la semana × 4,33 × ocupación × precio medio por plaza sin IVA.** 4,33 son las semanas de un mes medio (52 ÷ 12).' },
        { t: 'p', texto: 'El número más engañoso es el precio medio por plaza. Si casi todas tus alumnas pagan cuota, una de 75 € al mes por una clase semanal son 18,75 € por sesión, no 25 €, y con dos clases baja más. Referencias de mercado de nuestro [estudio de precios de 32 estudios](/recursos/precio-clase-de-pilates):' },
        {
          t: 'tabla',
          cabecera: ['Producto (mediana de la muestra)', 'Por sesión, con IVA', 'Por sesión, sin IVA (÷ 1,21)'],
          filas: [
            ['Reformer en grupo, clase suelta', '25 €', '20,66 €'],
            ['Reformer en grupo, cuota de 1 clase semanal', '18,75 €', '15,50 €'],
            ['Reformer en grupo, cuota de 2 clases semanales', '16,25 €', '13,43 €'],
            ['Suelo en grupo, cuota de 1 clase semanal', '13,75 €', '11,36 €'],
            ['Suelo en grupo, cuota de 2 clases semanales', '10,63 €', '8,79 €'],
          ],
          nota: 'Medianas de 32 estudios españoles (25-sep-2026); fuentes en el estudio de precios. Sin IVA = ÷ 1,21 (tipo general del 21 %); si tus clases llevan otro tipo o no llevan IVA, ajústalo.',
        },
        { t: 'p', texto: 'Calcula el tuyo con datos reales: ingresos por clases del último mes, sin IVA, entre las plazas reservadas. A una particular se le anuncia el precio con impuestos, pero esa parte no es tuya: si tus clases llevan IVA y a qué tipo, lo explicamos en [el IVA de las clases de pilates](/recursos/iva-clases-de-pilates).' },
      ],
    },
    {
      id: 'costes-fijos-y-variables',
      titulo: 'Costes fijos y variables de un estudio de pilates',
      bloques: [
        { t: 'p', texto: 'Separa los costes en cuatro grupos, porque se comportan distinto cuando cambia la ocupación:' },
        {
          t: 'tabla',
          cabecera: ['Tipo', 'Qué entra', 'Cómo se comporta'],
          filas: [
            ['Fijos del estudio', 'Alquiler, suministros, seguros, gestoría, software, publicidad, tu cuota de autónoma o la nómina de recepción', 'Los pagas con la sala vacía o llena'],
            ['Por clase', 'La instructora de cada clase', 'Se paga si la clase se da, aunque venga una sola alumna'],
            ['Máquinas', 'Reformers y demás aparatos: compra, mantenimiento y reposición', 'Es inversión: lo prudente es apartar una reserva cada mes'],
            ['Variables', 'Comisiones de cobro, toallas, consumibles', 'Suben con cada plaza vendida'],
          ],
        },
        { t: 'p', texto: 'Para ponerles cifra:' },
        {
          t: 'lista',
          items: [
            '**Instructora.** El coste que más pesa. Referencias por horas y en nómina en [cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates); cuenta lo que te cuesta a ti, no lo que ella recibe en neto.',
            '**Máquinas.** En la tienda oficial de Elina Pilates, un reformer profesional cuesta de 2.891,90 € a 6.037,90 € con IVA. Seis de los más caros son 36.227,40 €: repartidos en cinco años (una hipótesis, no un plazo fiscal), unos 604 € al mes; seis de los más sencillos, unos 289 €. El resto de la inversión, en [cuánto cuesta abrir un estudio de pilates](/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates).',
            '**Cobros.** Según las tarifas públicas de Stripe para España, una tarjeta estándar europea cuesta 1,5 % + 0,25 € por cobro y un adeudo SEPA, 0,35 €: en 100 cuotas de 75 €, 137,50 € o 35 € al mes.',
          ],
        },
      ],
    },
    {
      id: 'punto-de-equilibrio',
      titulo: 'Punto de equilibrio de un estudio de pilates',
      bloques: [
        { t: 'p', texto: 'Es la ocupación a la que ingresas justo lo que gastas. Se calcula en cinco pasos:' },
        {
          t: 'pasos',
          items: [
            { titulo: 'Suma los costes fijos del mes', texto: 'Local y gastos generales, reserva para máquinas e instructoras de todas las clases del mes (coste por clase × clases a la semana × 4,33).' },
            { titulo: 'Calcula las plazas del mes', texto: 'Plazas por clase × clases a la semana × 4,33.' },
            { titulo: 'Calcula lo que deja cada plaza', texto: 'Precio medio por plaza sin IVA, menos las comisiones de cobro.' },
            { titulo: 'Divide', texto: 'Ocupación de equilibrio = costes fijos del mes ÷ (plazas del mes × lo que deja cada plaza).' },
            { titulo: 'Súmate a ti', texto: 'Repite la cuenta añadiendo a los costes lo que quieres sacar al mes para ti. Esa es la ocupación que necesitas de verdad.' },
          ],
        },
        { t: 'p', texto: 'Haz la cuenta con tus números. La calculadora usa la misma fórmula y arranca con el escenario A de más abajo: en «costes fijos» van el local, los gastos generales y la reserva para máquinas, y en «ingreso medio por plaza», lo que te queda sin IVA y sin comisiones.' },
        { t: 'herramienta', id: 'calculadora-rentabilidad' },
        { t: 'p', texto: 'Clase a clase se entiende mejor: reparte los costes del estudio entre las clases del mes, suma la instructora y divide entre lo que deja una plaza. En el escenario A, cada clase necesita 3,2 alumnas de 6: con dos, pierde dinero aunque «se haya dado».' },
        { t: 'p', texto: 'Para pasar a alumnas, divide las plazas ocupadas a la semana entre las veces que viene cada una: por ejemplo, 108 plazas semanales son 72 alumnas que vienen una vez y media por semana.' },
      ],
    },
    {
      id: 'cuanto-gana-un-estudio-de-pilates-al-mes',
      titulo: 'Cuánto gana un estudio de pilates al mes: tres escenarios de ejemplo',
      bloques: [
        { t: 'p', texto: 'Tres estudios inventados con precios reales: cambia cada cifra por la tuya.' },
        {
          t: 'tabla',
          cabecera: ['Concepto (ejemplo)', 'A · Reformer, 6 máquinas', 'B · Reformer, 10 máquinas', 'C · Suelo, 12 plazas'],
          filas: [
            ['Clases a la semana', '30', '40', '30'],
            ['Plazas al mes', '780', '1.733', '1.560'],
            ['Precio medio por plaza', '18,75 € (15,50 € sin IVA)', '18,75 € (15,50 € sin IVA)', '13,75 € (11,36 € sin IVA)'],
            ['Instructoras (25 € por clase)', '3.250 €', '4.333 €', '3.250 €'],
            ['Local y gastos generales', '2.400 €', '3.600 €', '2.400 €'],
            ['Reserva para máquinas', '604 €', '1.006 €', '0 €'],
            ['Punto de equilibrio', '52,8 % (3,2 alumnas por clase)', '34,0 % (3,4 alumnas por clase)', '32,5 % (3,9 alumnas por clase)'],
            ['Margen al 60 % de ocupación', '853 €', '6.854 €', '4.774 €'],
            ['Margen al 70 % de ocupación', '2.038 €', '9.486 €', '6.511 €'],
            ['Ocupación para sacar además 2.000 € al mes', '69,7 %', '41,6 %', '44,0 %'],
          ],
          nota: 'Ejemplo ilustrativo, no datos de un estudio real. Precios: medianas de 32 estudios (25-sep-2026) sin el 21 % de IVA. Supuestos: instructora a 25 € por clase, local y gastos (con tu cuota de autónoma), 2 % de comisiones y reformers de 6.037,90 € en 60 meses. Margen antes de tu sueldo e impuestos.',
        },
        { t: 'p', texto: 'Lo que enseña la tabla:' },
        {
          t: 'lista',
          items: [
            '**Manda el techo de cada clase.** Con 6 reformers, una clase llena deja como máximo 93 € sin IVA; con 12 esterillas al precio de suelo, 136 €. Por eso A, el más parecido a un estudio boutique pequeño, necesita llenar más de la mitad de sus plazas solo para cubrir gastos.',
            '**Más máquinas abaratan cada plaza.** B paga más alquiler y más reformers, pero los reparte entre muchas más plazas: su equilibrio baja al 34 %.',
            '**El suelo necesita más alumnas.** C cubre gastos antes, pero al 60 % tiene que llenar 936 plazas al mes, frente a las 468 de A: el doble de alumnas que captar y retener.',
            '**Tu sueldo cambia la foto.** Sumar 2.000 € al mes para ti sube el listón de A del 52,8 % al 69,7 %. Si das tú clases, bajas el coste de instructoras, pero ese trabajo es tu sueldo: no lo cuentes dos veces.',
          ],
        },
      ],
    },
    {
      id: 'palancas-para-mejorar-la-rentabilidad',
      titulo: 'Cinco palancas para mejorar la rentabilidad de tu estudio',
      bloques: [
        { t: 'p', texto: 'Con el escenario A como base (60 % de ocupación), esto es lo que mueve cada palanca en un mes:' },
        {
          t: 'tabla',
          cabecera: ['Palanca', 'Cambio', 'Efecto en el margen de A'],
          filas: [
            ['Ocupación', 'Del 60 % al 70 %', '+1.185 € al mes'],
            ['Precio', '+1 € por sesión (con IVA)', '+379 € al mes'],
            ['Coste de instructora', '−2 € por clase', '+260 € al mes'],
          ],
          nota: 'Ejemplo ilustrativo sobre el escenario A (6 reformers, 30 clases a la semana, 18,75 € por sesión con IVA). No son resultados medidos en ningún estudio.',
        },
        {
          t: 'lista',
          items: [
            '**Llena las horas valle.** En el ejemplo es la que más mueve: la sala, la luz y a menudo la instructora ya están pagadas. Ideas en [cómo subir la ocupación de tus clases valle](/recursos/ocupacion-clases-valle).',
            '**Pon al reformer el precio que le toca.** En los estudios que venden los dos formatos, la máquina cuesta 1,6 veces el suelo de mediana: cómo calcularlo, en [reformer vs. mat](/recursos/precios-reformer-mat).',
            '**Retén antes de captar.** Una alumna con cuota de 75 € al mes son 900 € al año; cada baja que evitas es una alumna nueva que no tienes que buscar.',
            '**Corta las cancelaciones de última hora.** Una plaza que se libera tarde y nadie ocupa es ocupación perdida: ventana de cancelación, recordatorios y lista de espera, en [cómo reducir las cancelaciones de última hora](/recursos/reducir-cancelaciones-ultima-hora).',
            '**Ajusta el coste de instructora a la ocupación.** Una clase que no llega a su mínimo se paga igual: mueve, fusiona o da tú las franjas que no cubren su coste.',
          ],
        },
        { t: 'p', texto: 'Para decidir necesitas el margen clase a clase, no la media del mes. El [informe de rentabilidad por clase de Tentare](/funcionalidades/informes-y-rentabilidad) da, para cada clase, lo que ingresó menos lo que costó su instructora, y la [lista de espera automática](/funcionalidades/lista-de-espera) ofrece la plaza que se libera, al momento o con plazo para aceptarla.' },
      ],
    },
    {
      id: 'errores-al-calcular-la-rentabilidad',
      titulo: 'Errores habituales al calcular la rentabilidad de un estudio de pilates',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Hacer cuentas con el IVA dentro.** Si tus clases lo llevan, una parte de lo que cobras es de Hacienda.',
            '**Tomar la clase que se llena como media.** La de las 19:00 del lunes no es tu ocupación: cuenta también las de media mañana.',
            '**Usar la clase suelta como precio medio.** Si casi todas pagan cuota, tu precio real por sesión puede quedar un 20 % por debajo, la diferencia mediana en nuestro estudio de precios.',
            '**Olvidar las semanas sin clases.** Vacaciones y festivos quitan ingresos; el alquiler se paga igual.',
            '**No apartar nada para las máquinas.** Si no reservas cada mes, la reparación o el cambio de un reformer llega de golpe.',
            '**Dejar tu sueldo fuera.** Un estudio que cubre gastos pero no te paga es un empleo sin sueldo.',
          ],
        },
        { t: 'p', texto: 'Haz la cuenta con los datos reales del último trimestre y repítela cada tres meses.' },
      ],
    },
  ],
  faq: [
    { q: '¿Cuánto gana un estudio de pilates al mes?', a: 'Depende de plazas, ocupación, precio y costes. En nuestro ejemplo de 6 reformers con 30 clases semanales y precio de mercado, el margen antes de tu sueldo va de unos 850 € al mes con un 60 % de ocupación a unos 2.040 € con un 70 %; con 10 reformers y 40 clases, al 60 %, unos 6.850 €.' },
    { q: '¿Cuál es el punto de equilibrio de un estudio de pilates?', a: 'La ocupación a la que ingresas lo mismo que gastas: costes fijos del mes entre plazas del mes por lo que deja cada plaza. En los tres ejemplos del artículo, entre el 32,5 % y el 52,8 %; con 2.000 € de sueldo dentro, entre el 41,6 % y el 69,7 %.' },
    { q: '¿Qué ocupación necesita un estudio de pilates para ser rentable?', a: 'La que supera su punto de equilibrio con tu sueldo incluido. En los ejemplos, cerca de un 70 % con 6 reformers y entre un 42 % y un 44 % con 10 reformers o 12 plazas de suelo: cuantas más plazas por clase, menos ocupación necesitas.' },
    { q: '¿Es más rentable el pilates reformer o el de suelo?', a: 'Por plaza, el reformer, que cuesta unas 1,6 veces lo que el suelo. Por clase, depende de las plazas: 6 reformers dejan como máximo 93 € por clase sin IVA y 12 esterillas, 136 €. El suelo necesita más alumnas; el reformer, más inversión.' },
    { q: '¿Cuánto se tarda en recuperar la inversión de un estudio de pilates?', a: 'Divide la inversión inicial entre el margen que te queda cada mes después de tu sueldo. Por ejemplo, 50.000 € con 1.000 € de margen al mes tardan 50 meses; con 2.500 €, 20 meses.' },
    { q: '¿Cada cuánto hay que revisar la rentabilidad?', a: 'Al menos cada trimestre, y clase a clase: la media del mes esconde franjas que pierden dinero. Las que no cubren su coste durante varias semanas son candidatas a moverse o fusionarse.' },
  ],
  fuentes: [
    { titulo: 'Elina Pilates (tienda oficial europea): reformers', url: 'https://www.elinapilates.com/eu/en/59-pilates-reformers', consultada: '2026-09-25' },
    { titulo: 'Stripe: tarifas para España', url: 'https://stripe.com/es/pricing', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: tipos impositivos del IVA', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/calculo-iva-repercutido-clientes/tipos-impositivos-iva.html', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto Legislativo 1/2007, texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (art. 60)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/precio-clase-de-pilates',
    '/recursos/ocupacion-clases-valle',
    '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates',
    '/funcionalidades/informes-y-rentabilidad',
  ],
  cta: {
    titulo: 'Mira qué clases pagan su coste, una a una',
    texto: 'El informe de rentabilidad por clase de Tentare resta a lo que ingresó cada clase lo que costó su instructora, y la lista de espera automática ofrece las plazas que se liberan. Prueba 7 días gratis, sin tarjeta, el plan que elijas.',
  },
  revision: [
    'Los precios de los escenarios son medianas del artículo precio-clase-de-pilates (32 fuentes listadas allí); si se actualiza ese estudio, actualizar aquí.',
    'Son supuestos de ejemplo, no datos: 25 € por clase de instructora (coste para el estudio; el artículo cuanto-cobra-una-instructora-de-pilates da 20 € la hora como cifra más repetida en ofertas, de 14 a 30 € en máquinas), 2.400 y 3.600 € de local y gastos generales, 2 % de comisiones y reserva de máquinas a 60 meses.',
    'El precio sin IVA aplica el 21 % (tipo general, AEAT). Coincide con el artículo iva-clases-de-pilates del lote (21 % en un estudio privado).',
    'Precio del reformer: de 2.891,90 € (Aluminum HL1) a 6.037,90 € (Master Instructor Physio), IVA incluido, en la tienda oficial de Elina Pilates el 25-sep-2026; los escenarios usan el más caro, para no quedarse cortas. Coincide con el rango del artículo cuanto-cuesta-abrir-un-estudio-de-pilates.',
  ],
};

export default articulo;
