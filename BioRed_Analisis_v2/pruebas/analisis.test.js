/*
  Pruebas de los agregados y de los hallazgos sobre los datos del simulador
  Ejecutar desde la carpeta BioRed_Analisis_v2 con   node pruebas/analisis.test.js
*/
const assert = require('assert');
const S = require('../js/simulador.js');
const D = require('../js/datos.js');
const E = require('../js/estadisticas.js');
const I = require('../js/interpretacion.js');
const A = require('../js/agregados.js');

const VARIABLES = [
  { campo: 'temperature_c', nombre: 'Temperatura', articulo: 'la temperatura', unidad: '°C', decimales: 1, campoValidez: 'dht_valid' },
  { campo: 'humidity_pct', nombre: 'Humedad relativa', articulo: 'la humedad relativa', unidad: '%', decimales: 1, campoValidez: 'dht_valid' },
  { campo: 'light_pct', nombre: 'Luz', articulo: 'la luz', unidad: '%', decimales: 0 },
  { campo: 'co2_ppm', nombre: 'CO2 estimado', articulo: 'el CO2 estimado', unidad: 'ppm', decimales: 2 },
  { campo: 'sound_db', nombre: 'Nivel de sonido', articulo: 'el nivel de sonido', unidad: 'dB', decimales: 1, campoValidez: 'audio_valid' }
];
const AHORA = new Date(2026, 9, 16, 15, 20).getTime();
const DESDE = new Date(2026, 8, 17).getTime();                     // 30 días
const lect = D.normalizar(S.generar(DESDE, AHORA), VARIABLES);

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  PASA  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}

console.log('Vista general');
const vg = A.vistaGeneral(lect, VARIABLES);
prueba('una serie por variable', () => assert.strictEqual(vg.length, 5));
prueba('los porcentajes quedan entre 0 y 100 y tocan ambos extremos', () => {
  for (const s of vg) {
    const p = s.puntos.map(x => x[1]).filter(x => x !== null);
    assert.ok(p.every(x => x >= 0 && x <= 100), s.campo);
    assert.ok(Math.min(...p) < 0.001 && Math.max(...p) > 99.999, s.campo);
  }
});
prueba('cada punto conserva el valor real de la hora', () => {
  const t = vg[0].puntos.find(x => x[2] !== null);
  assert.ok(Math.abs(t[1] - 100 * (t[2] - vg[0].min) / (vg[0].max - vg[0].min)) < 1e-9);
});

console.log('Mapa de calor');
const mc = A.mapaCalor(lect, 'temperature_c', DESDE, AHORA);
prueba('incluye los 30 días del rango', () => assert.strictEqual(mc.dias.length, 30));
prueba('las celdas están en 0 a 23 horas y en los días del rango', () => {
  assert.ok(mc.celdas.every(c => c[0] >= 0 && c[0] <= 23 && c[1] >= 0 && c[1] < 30));
});
prueba('hoy no tiene celdas después de la hora actual', () => {
  assert.ok(!mc.celdas.some(c => c[1] === 29 && c[0] > 15));
});
prueba('la celda de las 14:00 es más cálida que la de las 05:00 en promedio', () => {
  const prom = (h) => { const c = mc.celdas.filter(x => x[0] === h); return c.reduce((s, x) => s + x[2], 0) / c.length; };
  assert.ok(prom(14) > prom(5) + 5);
});

console.log('Matriz de correlación');
const mz = A.matrizCorrelacion(lect, VARIABLES);
prueba('tiene 25 celdas y la diagonal vale 1', () => {
  assert.strictEqual(mz.length, 25);
  assert.ok(mz.filter(c => c[0] === c[1]).every(c => c[2] === 1));
});
prueba('es simétrica', () => {
  for (const c of mz) { const o = mz.find(x => x[0] === c[1] && x[1] === c[0]); assert.ok(Math.abs(c[2] - o[2]) < 1e-12); }
});
prueba('temperatura y humedad tienen correlación fuerte negativa', () => {
  const r = mz.find(c => c[0] === 0 && c[1] === 1)[2];
  assert.ok(r < -0.7, `r = ${r}`);
});

console.log('Muestreo');
prueba('limita la dispersión a 3000 puntos', () => {
  const xs = Array.from({ length: 14000 }, (_, i) => i);
  assert.ok(A.muestrear(xs, xs).length <= 3000);
});

console.log('Hallazgos sobre el simulador');
const h = I.interpretar(lect, VARIABLES);
prueba('describe el ciclo diario de la temperatura con el máximo de la tarde', () => {
  const c = h.find(x => x.tipo === 'ciclo' && x.variable === 'temperature_c');
  assert.ok(c && /hacia las 1[3-5]:00/.test(c.texto), c && c.texto);
});
prueba('reporta la relación negativa entre temperatura y humedad', () => {
  assert.ok(h.some(x => x.tipo === 'correlacion' && /temperatura y la humedad relativa/.test(x.texto) && /negativa/.test(x.texto)));
});
prueba('reporta las lecturas inválidas del DHT22', () => assert.ok(h.some(x => x.tipo === 'calidad')));
prueba('usa tilde en la palabra débil', () => assert.strictEqual(E.fuerzaCorrelacion(0.3), 'débil'));

console.log(`\n${ok} pasan, ${fallos} fallan`);
process.exit(fallos ? 1 : 0);
