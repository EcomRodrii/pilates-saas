import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'bonos-de-pilates',
  titulo: 'Bonos de pilates: cómo diseñarlos (tipos, precio, caducidad y cancelaciones)',
  tituloSeo: 'Bonos de pilates: cómo diseñarlos y ponerles precio',
  descripcion: 'Bono de sesiones, cuota o clase suelta: cuánto descontar, qué caducidad ponen los estudios (de un mes a un año) y qué hacer con las cancelaciones tardías.',
  resumen: 'Tipos de bono, cuánto descontar por volumen, caducidades reales de estudios españoles, cancelaciones tardías y congelaciones: lo que decide si un bono te da caja o problemas.',
  categoria: 'rentabilidad',
  seccion: 'Rentabilidad',
  publicado: '2026-09-25',
  consultaPrincipal: 'bonos de pilates: cómo diseñarlos',
  consultas: [
    'bono de clases de pilates',
    'bono pilates reformer',
    'cuántas clases debe tener un bono',
    'caducidad de un bono de pilates',
    'bono o mensualidad pilates',
  ],
  respuesta: 'Para diseñar bonos de pilates que funcionen, ofrece pocas opciones (clase suelta, bono de 5, bono de 10 y cuota mensual), haz que cada una salga más barata por sesión que la anterior y deja por escrito, antes de venderlos, la caducidad y qué pasa si se cancela tarde. En los estudios que hemos revisado, el bono de 10 de reformer ahorra una mediana del 21 % frente a la clase suelta y, en 8 de cada 10, caduca entre los 2 y los 4 meses.',
  entradilla: 'Un bono mal diseñado no se nota el día que lo vendes, sino meses después: sesiones caducadas, discusiones por una cancelación tardía o un descuento que se come el margen. Así diseñan sus bonos de pilates 32 estudios españoles, y lo que puedes copiar de ellos.',
  secciones: [
    {
      id: 'tipos-de-bono-de-clases-de-pilates',
      titulo: 'Tipos de bono de clases de pilates: sesiones, cuota y clase suelta',
      bloques: [
        { t: 'p', texto: 'Casi todos los estudios combinan cuatro productos, cada uno con su alumna y su riesgo:' },
        {
          t: 'tabla',
          cabecera: ['Producto', 'Cómo funciona', 'Para quién', 'Riesgo para el estudio'],
          filas: [
            ['Clase suelta', 'Paga cada sesión', 'Quien prueba o viene a ratos', 'Ingreso imprevisible'],
            ['Bono de sesiones', 'Compra varias clases y las gasta en un plazo', 'Quien tiene horarios cambiantes', 'Sesiones caducadas y reclamaciones si el plazo no estaba claro'],
            ['Cuota mensual', 'Paga cada mes una, dos o tres clases semanales, a menudo con plaza fija', 'Quien quiere rutina', 'Faltas y recuperaciones que hay que ordenar'],
            ['Tarifa ilimitada', 'Paga cada mes y viene cuanto quiere', 'Quien viene tres o más veces por semana', 'Si viene mucho, la sesión sale por debajo de tu coste'],
          ],
        },
        { t: 'p', texto: 'En nuestra muestra de 32 estudios, 31 publican alguna cuota mensual y 18 venden además un bono de 10 sesiones. La ilimitada es menos común (en reformer, 185, 195 y 250 € al mes en tres estudios), y una cadena de Barcelona cobra cada 4 semanas: 13 cobros al año, no 12.' },
      ],
    },
    {
      id: 'bono-o-mensualidad-de-pilates',
      titulo: '¿Bono o mensualidad de pilates? Qué conviene a tu estudio',
      bloques: [
        { t: 'p', texto: 'Para el estudio, la cuota mensual suele ser mejor negocio: ingresos previsibles, cobro automático y alumnas con hábito. El bono es la puerta de entrada de quien no puede comprometer un día fijo.' },
        { t: 'p', texto: 'Para la alumna, las dos rebajan la sesión: en reformer, con cuota de una clase semanal sale a 18,75 € de mediana y con bono de 10, a 21,10 €, frente a los 25 € de la suelta. Que la cuota sea la opción más barata tiene sentido: premias el compromiso.' },
        {
          t: 'lista',
          items: [
            '**Cuota:** si trabajas con plazas fijas y quieres la semana llena con antelación.',
            '**Bono:** para alumnas nuevas, turnos cambiantes o quien viaja.',
            '**Clase suelta:** precio de referencia alto que hace atractivos los otros dos.',
          ],
        },
        { t: 'p', texto: 'Cobrar la cuota a mano es trabajo y deja huecos. En Tentare, con Stripe conectado, las cuotas se cobran solas con tarjeta o SEPA; si un cobro falla, se reintenta tres veces (+1, +3 y +7 días) y te avisa. Los bonos y pagos puntuales admiten también Bizum; las cuotas, no. Más en [cobros recurrentes](/funcionalidades/cobros-recurrentes).' },
      ],
    },
    {
      id: 'cuantas-clases-debe-tener-un-bono',
      titulo: '¿Cuántas clases debe tener un bono?',
      bloques: [
        { t: 'p', texto: 'El tamaño más repetido es el de 10 sesiones, casi siempre con uno de 5: 18 de los 32 estudios venden bono de 10 y 15, de 5. Los hay de 4 a 30 sesiones, pero con dos tamaños te basta.' },
        { t: 'p', texto: 'La regla: que el bono se pueda gastar en su plazo al ritmo real de la alumna. Diez sesiones a una por semana son diez semanas: un plazo de 10 semanas, como el de un estudio de Madrid, no perdona un catarro.' },
        {
          t: 'lista',
          items: [
            '**Bono de 5:** para probar y para alumnas ocasionales. Caduca entre 1 y 6 meses en la muestra; en 7 de 9 estudios, entre 6 semanas y 3 meses.',
            '**Bono de 10:** para quien no quiere cuota. En 8 de los 10 estudios que publican su plazo, caduca entre los 2 y los 4 meses; los otros dos dan un año.',
            '**Bonos de 20 o más:** para quien viene mucho, con plazos largos: una cadena de Barcelona da 6 meses al de 20 sesiones y 9 al de 30.',
          ],
        },
      ],
    },
    {
      id: 'como-disenar-bonos-de-pilates',
      titulo: 'Bonos de pilates: cómo diseñarlos con una escalera de precios',
      bloques: [
        { t: 'p', texto: 'Una escalera funciona si cada escalón sale más barato por sesión que el anterior y la diferencia se ve. Este ejemplo parte de las medianas de reformer en grupo de nuestro [estudio de precios de 32 estudios](/recursos/precio-clase-de-pilates):' },
        {
          t: 'tabla',
          cabecera: ['Producto (ejemplo)', 'Precio', 'Por sesión', 'Ahorro frente a la suelta'],
          filas: [
            ['Clase suelta', '25 €', '25 €', '—'],
            ['Bono de 5 sesiones', '110 €', '22 €', '12 %'],
            ['Bono de 10 sesiones', '200 €', '20 €', '20 %'],
            ['Cuota de 1 clase semanal', '75 €/mes', '18,75 €', '25 %'],
            ['Cuota de 2 clases semanales', '130 €/mes', '16,25 €', '35 %'],
          ],
          nota: 'Ejemplo. Suelta y cuotas: medianas de reformer en grupo de 32 estudios (25-sep-2026). Bonos redondeados dentro de los descuentos observados frente a la suelta del mismo estudio: bono de 5, del 7 % al 20 % (mediana: 14 %); bono de 10, del 7 % al 33 % (mediana: 21 %).',
        },
        {
          t: 'lista',
          items: [
            '**Nunca por debajo de tu coste por plaza.** El escalón más barato tiene que cubrir lo que te cuesta una plaza ocupada; cómo calcularlo, en [¿es rentable un estudio de pilates?](/recursos/rentabilidad-estudio-de-pilates).',
            '**Premia el compromiso más que el volumen.** Si el bono de 10 sale más barato por sesión que la cuota de una clase semanal, empujas a tus alumnas fuera de la cuota.',
            '**Enseña el precio por sesión.** Varios estudios de la muestra lo ponen junto a cada tarifa («24,75 €/clase», «20 €/clase»): la alumna compara sin hacer cuentas.',
            '**Pon las condiciones junto al precio.** Caducidad, ventana de cancelación y si es personal e intransferible (como en Tout Suite y True Pilates), igual en la web y en el justificante.',
          ],
        },
        { t: 'p', texto: 'Después, llévalo a tu programa de reservas para no controlar caducidades a mano. En Tentare configuras [bonos, cuotas mensuales y clases sueltas](/funcionalidades/bonos-y-membresias), con la caducidad de cada bono y reglas por tipo de clase; si de momento usas una hoja de cálculo, tienes la [plantilla de control de asistencia](/recursos/plantilla-control-de-asistencia-pilates).' },
      ],
    },
    {
      id: 'caducidad-de-un-bono-de-pilates',
      titulo: 'Caducidad de un bono de pilates: qué plazo poner',
      bloques: [
        {
          t: 'tabla',
          cabecera: ['Estudio', 'Bono', 'Caducidad'],
          filas: [
            ['PILAT3S Gràcia (Barcelona)', '5 / 10 / 20 / 30 sesiones', '1 / 3 / 6 / 9 meses'],
            ['Temple Pilates (Madrid)', '5 / 10 sesiones', '6 / 10 semanas'],
            ['BYBO Studios (Alicante)', '5 / 10 sesiones', '45 / 60 días'],
            ['Ruth Centro de Pilates (Madrid)', '5 / 10 / 15 sesiones', 'mes y medio / 2 / 3 meses'],
            ['Pinar Pilates (Madrid)', '5 / 10 / 20 sesiones', '90 días'],
            ['Estudio Pilates Málaga', '5 / 10 sesiones', '90 / 120 días'],
            ['Area Pilates (Barcelona), privadas', '5 / 10 sesiones', '2 / 4 meses'],
            ['True Pilates Zaragoza, privadas', '5 / 10 sesiones', '6 / 12 semanas'],
            ['Corestudio (Sevilla)', '10 sesiones', 'un año desde la compra'],
            ['Tout Suite (Zaragoza)', '10 / 20 sesiones', 'un año'],
          ],
          nota: 'Plazos publicados en la web de cada estudio, consultada el 25-sep-2026. En Estudio Pilates Málaga, sus bonos «de larga caducidad».',
        },
        { t: 'p', texto: 'El patrón: la mayoría da de 2 a 4 meses al bono de 10, y unos pocos, un año. Un plazo corto empuja a venir; uno largo es más cómodo para quien viene a ratos. Que cuadre con el ritmo: 10 sesiones a una por semana piden al menos 10 semanas.' },
        { t: 'nota', titulo: 'Lo que dice la ley, en general', texto: 'La ley estatal de consumidores obliga a informar antes de la compra, con claridad, de las condiciones económicas y del precio total con impuestos (artículo 60 del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios), y pide que las condiciones no negociadas sean claras y no abusivas (artículo 80). La caducidad es una de ellas: escríbela antes de vender. Para un plazo concreto o normas de tu comunidad autónoma, pregunta en su oficina de consumo o a tu gestoría.' },
      ],
    },
    {
      id: 'cancelaciones-tardias-y-congelaciones',
      titulo: 'Cancelaciones tardías y congelaciones: qué pasa con la sesión del bono',
      bloques: [
        { t: 'p', texto: 'La regla más extendida: si la alumna cancela a tiempo, la sesión vuelve al bono; si cancela tarde o no viene, se descuenta. Lo que cambia es la ventana:' },
        {
          t: 'lista',
          items: [
            '**24 horas:** Tout Suite (Zaragoza) —si no, «la clase se descuenta del bono»—, True Pilates (Zaragoza) y Body Mechanics (Barcelona), que deja recuperar la sesión si avisas a tiempo.',
            '**12 horas:** Estación Pilates (Madrid): «Si avisas con al menos 12 horas de antelación, la clase no se descuenta».',
            '**6 horas:** Olimpia (Madrid), para sus socias; 12 para quien no lo es.',
            '**3 o 4 horas:** Corestudio (Sevilla), 3 en grupo (12 en privadas), y Pilates Estudio (Madrid), 4, con recuperación hasta 6 meses después.',
          ],
        },
        { t: 'p', texto: 'Cuanta más demanda tenga una clase, más larga conviene la ventana, y solo sirve si el hueco se ofrece enseguida a la lista de espera. Más en [cómo reducir las cancelaciones de última hora](/recursos/reducir-cancelaciones-ultima-hora).' },
        { t: 'p', texto: 'Con las congelaciones, dos fórmulas reales: Olimpia deja a sus socias congelar la cuota hasta dos veces al año, y Body Mechanics cobra un 30 % de la mensualidad por guardarte la plaza, como máximo un mes. Escribe la tuya: cuántas veces, cuánto tiempo y con qué aviso.' },
        { t: 'p', texto: 'En Tentare fijas reglas por tipo de clase, como la antelación para cancelar sin perder la sesión, y la lista de espera automática ofrece la plaza liberada al momento o con plazo para aceptarla: [cancelaciones y políticas](/funcionalidades/cancelaciones-y-politicas).' },
      ],
    },
    {
      id: 'bono-de-pilates-reformer',
      titulo: 'Bono de pilates reformer: ¿aparte del de suelo o uno para todo?',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Bonos separados por formato.** Pilates Salud (Sevilla) vende el bono de 10 de máquinas a 280 € y el de suelo a 135 €, más uno de 5 + 5 a 205 €. Claro, y protege el precio de la máquina.',
            '**Un bono para todo.** Pilates Estudio (Madrid) vende 5 clases por 65 € para suelo, máquinas o estiramientos. Flexible, pero cobra igual la plaza de máquina que la de suelo.',
            '**Un bono con créditos.** La sesión de reformer descuenta más créditos que la de suelo: mantienes la diferencia sin multiplicar productos. Lo explicamos en [reformer vs. mat](/recursos/precios-reformer-mat).',
          ],
        },
        { t: 'p', texto: 'En la muestra, la máquina cuesta 1,6 veces el suelo de mediana: con un bono único al mismo precio, regalas margen en el reformer o cobras de más el suelo.' },
      ],
    },
  ],
  faq: [
    { q: '¿Cuánto cuesta un bono de 10 clases de pilates?', a: 'En reformer en grupo, entre 179 y 280 € en los 10 estudios de la muestra que lo publican (mediana: 211 €). En privadas, entre 300 y 550 € (mediana: 456 €). En suelo solo lo publican dos estudios: 125 y 135 €.' },
    { q: '¿Es legal que caduque un bono de pilates?', a: 'La ley estatal de consumidores obliga a informar con claridad de las condiciones antes de la compra y prohíbe las cláusulas abusivas. Pon la caducidad por escrito y, para un plazo concreto, consulta con la oficina de consumo de tu comunidad.' },
    { q: '¿Qué pasa si una alumna cancela tarde con bono?', a: 'Lo habitual es que la sesión se descuente. En los estudios revisados, la ventana para cancelar sin perderla va de 3 a 24 horas antes de la clase.' },
    { q: '¿Se puede congelar un bono o una cuota de pilates?', a: 'Depende de tu política: hay estudios que dejan congelar la cuota hasta dos veces al año y otros que cobran una parte de la cuota por guardar la plaza.' },
    { q: '¿Qué es mejor, bono o mensualidad de pilates?', a: 'Para quien viene cada semana, la mensualidad suele salir más barata por sesión; para horarios cambiantes, el bono. Al estudio, la cuota le da ingresos previsibles.' },
    { q: '¿Cuántas clases debe tener un bono de pilates?', a: 'Con 5 y 10 sesiones cubres a casi todas las alumnas: son los tamaños más comunes (15 y 18 de 32 estudios). Ajusta la caducidad al ritmo real: 10 sesiones a una por semana piden al menos 10 semanas.' },
  ],
  fuentes: [
    { titulo: 'PILAT3S Gràcia (Barcelona): estudio y precios', url: 'https://pilat3s.com/studio/pilat3s-gracia/', consultada: '2026-09-25' },
    { titulo: 'Temple Pilates (Madrid): precios', url: 'https://templepilates.es/precios/', consultada: '2026-09-25' },
    { titulo: 'BYBO Studios (Alicante): pilates reformer', url: 'https://www.bybostudios.com/reservar-pilates-reformer', consultada: '2026-09-25' },
    { titulo: 'Ruth Centro de Pilates (Madrid): tarifas y promociones', url: 'https://ruthpilates.es/tarifas-y-promociones/', consultada: '2026-09-25' },
    { titulo: 'Pinar Pilates (Madrid): precios', url: 'https://pinarpilates.com/precios/', consultada: '2026-09-25' },
    { titulo: 'Estudio Pilates Málaga: tarifas', url: 'https://estudiopilatesmalaga.com/tarifas/', consultada: '2026-09-25' },
    { titulo: 'Area Pilates (Barcelona): horarios y tarifas', url: 'https://areapilates.com/horarios/', consultada: '2026-09-25' },
    { titulo: 'True Pilates Zaragoza: clases y tarifas', url: 'https://truepilateszaragoza.com/clases-y-tarifas/', consultada: '2026-09-25' },
    { titulo: 'Pilates Estudio (Madrid): clases y precios', url: 'https://pilatesestudio.es/clases-y-precios/', consultada: '2026-09-25' },
    { titulo: 'Corestudio (Sevilla): tarifas', url: 'https://corestudiopilates.es/tarifas/', consultada: '2026-09-25' },
    { titulo: 'Tout Suite (Zaragoza): pilates reformer', url: 'https://toutsuite.es/fitness/pilates-maquina-zaragoza/', consultada: '2026-09-25' },
    { titulo: 'Estación Pilates (Madrid): precios', url: 'https://estacionpilates.es/precios/', consultada: '2026-09-25' },
    { titulo: 'Olimpia (Madrid): clases y membresías', url: 'https://olimpiatwc.com', consultada: '2026-09-25' },
    { titulo: 'Body Mechanics (Barcelona): precios y condiciones', url: 'https://www.bodymechanics.es/precios/', consultada: '2026-09-25' },
    { titulo: 'Pilates Salud (Sevilla): precios', url: 'https://pilatessaludsevilla.com/precio', consultada: '2026-09-25' },
    { titulo: 'Horta Pilates (Barcelona): precios', url: 'https://www.hortapilates.com/precios/', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto Legislativo 1/2007, texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (arts. 60 y 80)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/precio-clase-de-pilates',
    '/recursos/precios-reformer-mat',
    '/funcionalidades/bonos-y-membresias',
    '/funcionalidades/cancelaciones-y-politicas',
  ],
  cta: {
    titulo: 'Tus bonos y cuotas, con sus reglas, en un solo sitio',
    texto: 'En Tentare configuras bonos, cuotas y clases sueltas con su caducidad y reglas por tipo de clase, y cobras las cuotas con Stripe (tarjeta o SEPA). Prueba 7 días gratis, sin tarjeta, el plan que elijas.',
  },
  revision: [
    'Escalera de ejemplo: la suelta (25 €) y las cuotas (75 y 130 €) son medianas del estudio de precios; los bonos de 5 (110 €) y 10 (200 €) están redondeados dentro de los descuentos observados, no son medianas.',
    'Los recuentos «31 de 32 publican cuota», «18 venden bono de 10» y «15 bono de 5» están hechos a mano sobre las 32 páginas de tarifas del estudio de precios (cualquier formato).',
    'Body Mechanics (Barcelona) se cita solo por su política de cancelación y de congelación: no entra en la muestra de precios porque no dice cuántas sesiones incluye cada cuota. Estación Pilates publica «Los bonos no caducan en el período acordado» (frase ambigua): fuera de la tabla de caducidades.',
    'Parte legal: arts. 60 y 80 del TRLGDCU (BOE). No se ha localizado una norma estatal específica sobre la caducidad de bonos de clases; si el revisor conoce normativa autonómica aplicable, conviene citarla.',
  ],
};

export default articulo;
