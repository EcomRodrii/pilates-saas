import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embudoPorWidget, nombreDeEtiqueta, textoMes } from './embudo.ts';

test('la etiqueta por defecto se nombra con su widget; una propia, tal cual; sin etiqueta, al final', () => {
  assert.deepEqual(nombreDeEtiqueta('web-horario'), { widgetId: 'horario', nombre: 'Horario y reservas' });
  assert.deepEqual(nombreDeEtiqueta('web-planes'), { widgetId: 'planes', nombre: 'Planes y precios' });
  assert.deepEqual(nombreDeEtiqueta('insta-bio'), { widgetId: null, nombre: 'Etiqueta «insta-bio»' });
  // Un `web-` que no es de ningún widget no se atribuye a ninguno.
  assert.deepEqual(nombreDeEtiqueta('web-inventado'), { widgetId: null, nombre: 'Etiqueta «web-inventado»' });
  assert.equal(nombreDeEtiqueta(null).widgetId, null);
});

test('agrupa por etiqueta con las MISMAS definiciones que el embudo general', () => {
  const r = embudoPorWidget([
    { origen: 'web-horario', tipo: 'widget_loaded', n: 200 },
    { origen: 'web-horario', tipo: 'class_selected', n: 40 },
    { origen: 'web-horario', tipo: 'class_detail_viewed', n: 10 },
    { origen: 'web-horario', tipo: 'booking_started', n: 20 },
    { origen: 'web-horario', tipo: 'booking_completed', n: 9 },
    { origen: 'web-planes', tipo: 'widget_loaded', n: 50 },
    { origen: 'web-planes', tipo: 'checkout_started', n: 4 },
    { origen: null, tipo: 'widget_loaded', n: 900 },
    { origen: '  ', tipo: 'widget_loaded', n: 1 },
  ]);
  assert.deepEqual(r.map(x => x.etiqueta), ['web-horario', 'web-planes', null]);
  const h = r[0];
  assert.equal(h.visitas, 200);
  assert.equal(h.interacciones, 50);
  assert.equal(h.reservasIniciadas, 20);
  assert.equal(h.reservasCompletadas, 9);
  assert.equal(h.conversion, 4.5);
  assert.equal(r[1].comprasIniciadas, 4);
  // Un widget de venta no tiene «conversión» aquí: la compra la confirma el
  // webhook de Stripe, no este embudo. Nunca un 0 % que no es verdad.
  assert.equal(r[1].conversion, null);
  // Lo sin etiqueta va al final aunque tenga más visitas, y el vacío cuenta ahí.
  assert.equal(r[2].visitas, 901);
});

test('sin visitas, la conversión es null — nunca un 0 % inventado', () => {
  const [x] = embudoPorWidget([{ origen: 'web-citas', tipo: 'booking_completed', n: 1 }]);
  assert.equal(x.visitas, 0);
  assert.equal(x.conversion, null);
});

test('sin filas, nada', () => {
  assert.deepEqual(embudoPorWidget([]), []);
});

test('textoMes: una línea por widget, en singular o plural, y nunca un «0 %»', () => {
  const [horario, planes] = embudoPorWidget([
    { origen: 'web-horario', tipo: 'widget_loaded', n: 214 },
    { origen: 'web-horario', tipo: 'booking_completed', n: 11 },
    { origen: 'web-planes', tipo: 'widget_loaded', n: 1 },
  ]);
  assert.equal(textoMes(horario), 'Este mes: 214 visitas · 11 reservas · 5,1 %');
  // Un widget de venta no tiene reservas que contar: ni «0 reservas» ni «0 %».
  assert.equal(textoMes(planes), 'Este mes: 1 visita');

  const [una] = embudoPorWidget([
    { origen: 'web-horario', tipo: 'widget_loaded', n: 1 },
    { origen: 'web-horario', tipo: 'booking_completed', n: 1 },
  ]);
  assert.equal(textoMes(una), 'Este mes: 1 visita · 1 reserva · 100 %');

  // Con visitas y sin reservas, las reservas se cuentan pero el porcentaje no se enseña.
  const [sinReservas] = embudoPorWidget([{ origen: 'web-horario', tipo: 'widget_loaded', n: 12 }]);
  assert.equal(textoMes(sinReservas), 'Este mes: 12 visitas · 0 reservas');
  // Un porcentaje que redondea a 0 tampoco.
  const [casiCero] = embudoPorWidget([
    { origen: 'web-horario', tipo: 'widget_loaded', n: 3000 },
    { origen: 'web-horario', tipo: 'booking_completed', n: 1 },
  ]);
  assert.equal(textoMes(casiCero), 'Este mes: 3000 visitas · 1 reserva');

  assert.equal(textoMes(null), 'Aún no ha llegado nadie desde aquí este mes');
  assert.equal(textoMes({ ...horario, visitas: 0, conversion: null }), 'Aún no ha llegado nadie desde aquí este mes');
});

test('⚠️ el formulario de contacto no tiene «conversión» a reserva: null, nunca un 0 %', () => {
  const [x] = embudoPorWidget([
    { origen: 'web-contacto', tipo: 'widget_loaded', n: 40 },
  ]);
  assert.equal(x.widgetId, 'contacto');
  assert.equal(x.visitas, 40);
  assert.equal(x.conversion, null);
});
