/*
  Pruebas de las utilidades del gráfico principal y las tarjetas
  Ejecutar desde la carpeta BioRed_Analisis_v2 con   node pruebas/serie.test.js
*/
const assert = require('assert');
const U = require('../js/serie.js');

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  PASA  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}

const base = new Date(2026, 9, 16, 0, 0, 0).getTime();
const L = (min, temp) => ({ t: base + min * 60000, temperature_c: temp });

console.log('Puntos de la gráfica');
prueba('convierte la hora en minuto del día', () => {
  assert.deepStrictEqual(U.puntos([L(0, 10), L(90, 12)], 'temperature_c').filter(p => p[1] !== '-')[1], [90, 12]);
});
prueba('corta la línea cuando faltan más de 10 minutos', () => {
  const p = U.puntos([L(0, 10), L(3, 11), L(30, 12)], 'temperature_c');
  assert.strictEqual(p.length, 4); assert.strictEqual(p[2][1], '-');
});
prueba('no corta la línea con lecturas cada 3 minutos', () => {
  const p = U.puntos([L(0, 10), L(3, 11), L(6, 12)], 'temperature_c');
  assert.ok(p.every(x => x[1] !== '-'));
});
prueba('un valor inválido se dibuja como vacío', () => {
  assert.strictEqual(U.puntos([L(0, null)], 'temperature_c')[0][1], '-');
});

console.log('Búsquedas');
const dia = [L(0, 10), L(3, 11), L(6, null), L(9, 13), L(60, 20)];
prueba('ultimoValido salta las lecturas inválidas', () => {
  assert.strictEqual(U.ultimoValido([L(0, 10), L(3, null)], 'temperature_c').temperature_c, 10);
});
prueba('valorEnMinuto toma la lectura más cercana', () => {
  assert.strictEqual(U.valorEnMinuto(dia, 'temperature_c', 4), 11);
  assert.strictEqual(U.valorEnMinuto(dia, 'temperature_c', 8), 13);
});
prueba('valorEnMinuto devuelve null si la lectura más cercana está a más de 10 minutos', () => {
  assert.strictEqual(U.valorEnMinuto(dia, 'temperature_c', 35), null);
});

console.log('Resumen del día');
prueba('mínimo, máximo y promedio sin contar inválidos', () => {
  const r = U.resumen(dia, 'temperature_c');
  assert.strictEqual(r.n, 4); assert.strictEqual(r.min, 10); assert.strictEqual(r.max, 20);
  assert.strictEqual(r.media, 13.5); assert.strictEqual(r.tMax, base + 60 * 60000);
});
prueba('sin lecturas válidas devuelve n = 0', () => assert.strictEqual(U.resumen([L(0, null)], 'temperature_c').n, 0));

console.log('Sparkline');
prueba('agrupa las últimas 3 horas en 36 tramos y deja vacíos los tramos sin datos', () => {
  const lect = []; for (let m = 0; m < 180; m += 3) if (m < 60 || m >= 120) lect.push(L(m, m));
  const s = U.sparkline(lect, 'temperature_c', base + 180 * 60000);
  assert.strictEqual(s.length, 36);
  assert.ok(s.slice(13, 23).every(x => x === null), 'debería haber un hueco en el centro');
  assert.ok(s[0] !== null && s[35] !== null);
});
prueba('el trazo SVG se corta donde no hay datos', () => {
  const d = U.trazoSvg([1, 2, null, 3, 4]);
  assert.strictEqual((d.match(/M/g) || []).length, 2);
});
prueba('el trazo queda dentro de la caja de 100 x 28', () => {
  const nums = U.trazoSvg([5, 9, 1, 7]).match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.every(n => n >= 0 && n <= 100));
});

console.log('Alertas de rango');
prueba('marca alto, bajo y normal', () => {
  const r = { min: 12, max: 24 };
  assert.strictEqual(U.estadoRango(25, r), 'alto');
  assert.strictEqual(U.estadoRango(11.9, r), 'bajo');
  assert.strictEqual(U.estadoRango(24, r), 'normal');
  assert.strictEqual(U.estadoRango(3, { max: 6 }), 'normal');
  assert.strictEqual(U.estadoRango(null, r), 'normal');
});

console.log('Ejes');
prueba('las marcas del eje X se ajustan al zoom', () => {
  assert.strictEqual(U.intervaloEje(1440), 180);
  assert.strictEqual(U.intervaloEje(240), 30);
  assert.strictEqual(U.intervaloEje(40), 5);
});
prueba('el eje Y usa números redondos y contiene los datos', () => {
  const e = U.ejeY([12.8, 21.9]);
  assert.ok(e.min <= 12.8 && e.max >= 21.9);
  assert.ok(Number.isInteger(e.min / e.paso) && Number.isInteger(e.max / e.paso));
});
prueba('muestra el límite del rango solo si está cerca de los datos', () => {
  assert.deepStrictEqual(U.ejeY([12.8, 21.9], [12, 24]).umbrales, [12, 24]);
  assert.deepStrictEqual(U.ejeY([16.4, 21.6], [12, 24]).umbrales, []);
  assert.deepStrictEqual(U.ejeY([2.5, 3.4], [6]).umbrales, []);
});
prueba('la luz no baja de 0 en el eje', () => assert.strictEqual(U.ejeY([0, 88]).min, 0));

console.log(`\n${ok} pasan, ${fallos} fallan`);
process.exit(fallos ? 1 : 0);
