/*
  Pruebas de las franjas horarias de la paleta
  Ejecutar desde la carpeta BioRed_Analisis_v2 con   node pruebas/tema.test.js
*/
const assert = require('assert');
const T = require('../js/tema.js');

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  PASA  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}
const min = (h, m) => h * 60 + m;

console.log('Franjas horarias');
prueba('00:00 es noche', () => assert.strictEqual(T.faseDeMinuto(min(0, 0)), 'noche'));
prueba('05:29 es noche', () => assert.strictEqual(T.faseDeMinuto(min(5, 29)), 'noche'));
prueba('05:30 es crepúsculo (amanecer)', () => assert.strictEqual(T.faseDeMinuto(min(5, 30)), 'crepusculo'));
prueba('06:29 es crepúsculo', () => assert.strictEqual(T.faseDeMinuto(min(6, 29)), 'crepusculo'));
prueba('06:30 es día', () => assert.strictEqual(T.faseDeMinuto(min(6, 30)), 'dia'));
prueba('12:00 es día', () => assert.strictEqual(T.faseDeMinuto(min(12, 0)), 'dia'));
prueba('17:29 es día', () => assert.strictEqual(T.faseDeMinuto(min(17, 29)), 'dia'));
prueba('17:30 es crepúsculo (atardecer)', () => assert.strictEqual(T.faseDeMinuto(min(17, 30)), 'crepusculo'));
prueba('18:29 es crepúsculo', () => assert.strictEqual(T.faseDeMinuto(min(18, 29)), 'crepusculo'));
prueba('18:30 es noche', () => assert.strictEqual(T.faseDeMinuto(min(18, 30)), 'noche'));
prueba('23:59 es noche', () => assert.strictEqual(T.faseDeMinuto(min(23, 59)), 'noche'));
prueba('1440 minutos vuelve a medianoche', () => assert.strictEqual(T.faseDeMinuto(1440), 'noche'));

console.log('Cobertura del día');
prueba('cada minuto del día tiene una sola franja válida', () => {
  const cuenta = { dia: 0, crepusculo: 0, noche: 0 };
  for (let m = 0; m < 1440; m++) cuenta[T.faseDeMinuto(m)]++;
  assert.strictEqual(cuenta.dia, 11 * 60);
  assert.strictEqual(cuenta.crepusculo, 2 * 60);
  assert.strictEqual(cuenta.noche, 11 * 60);
});

console.log('Próximo cambio');
prueba('a las 12:00 el próximo cambio es crepúsculo en 330 min', () => {
  assert.deepStrictEqual(T.proximoCambio(min(12, 0)), { minutos: 330, fase: 'crepusculo' });
});
prueba('a las 23:00 el próximo cambio es crepúsculo en 390 min', () => {
  assert.deepStrictEqual(T.proximoCambio(min(23, 0)), { minutos: 390, fase: 'crepusculo' });
});

console.log('Modo manual');
prueba('modo dia fija la paleta día a medianoche', () => assert.strictEqual(T.faseEfectiva('dia', new Date(2026, 9, 16, 0, 0)), 'dia'));
prueba('modo noche fija la paleta noche al mediodía', () => assert.strictEqual(T.faseEfectiva('noche', new Date(2026, 9, 16, 12, 0)), 'noche'));
prueba('modo auto sigue la hora', () => assert.strictEqual(T.faseEfectiva('auto', new Date(2026, 9, 16, 18, 0)), 'crepusculo'));

console.log('Paletas');
prueba('las tres paletas tienen los mismos campos de color', () => {
  const claves = (o) => Object.keys(o).sort().join(',');
  const [a, b, c] = ['dia', 'crepusculo', 'noche'].map(k => T.PALETAS[k]);
  assert.strictEqual(claves(a.ui), claves(b.ui)); assert.strictEqual(claves(a.ui), claves(c.ui));
  assert.strictEqual(claves(a.graf.sensores), claves(c.graf.sensores));
});

console.log(`\n${ok} pasan, ${fallos} fallan`);
process.exit(fallos ? 1 : 0);
