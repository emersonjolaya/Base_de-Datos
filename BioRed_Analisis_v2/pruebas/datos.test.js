/*
  Pruebas del simulador y del adaptador de datos
  Ejecutar desde la carpeta BioRed_Analisis_v2 con   node pruebas/datos.test.js
*/
const assert = require('assert');
const S = require('../js/simulador.js');
const D = require('../js/datos.js');

const CONFIG = {
  apiUrl: null, deviceUid: '80:B5:4E:C7:50:94', intervaloActualizacionS: 15,
  variables: [
    { campo: 'temperature_c', campoValidez: 'dht_valid' }, { campo: 'humidity_pct', campoValidez: 'dht_valid' },
    { campo: 'light_pct' }, { campo: 'co2_ppm' }, { campo: 'sound_db', campoValidez: 'audio_valid' }
  ]
};
const AHORA = new Date(2026, 9, 16, 15, 20, 7).getTime();
const MIN = 60000;

let ok = 0, fallos = 0;
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log('  PASA  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}

(async () => {
  console.log('Simulador');
  const mes = S.generar(AHORA - 35 * S.DIA, AHORA);

  await prueba('la misma hora siempre da la misma lectura', () => {
    assert.deepStrictEqual(S.lectura(AHORA), S.lectura(AHORA));
  });
  await prueba('35 días cada 3 minutos dan entre 16 000 y 16 800 lecturas', () => {
    assert.ok(mes.length > 16000 && mes.length <= 16800, `obtuvo ${mes.length}`);
  });
  await prueba('las lecturas del histórico caen en minutos múltiplos de 3 y segundo 0', () => {
    assert.ok(mes.every(l => { const m = +l.received_at.slice(14, 16), s = +l.received_at.slice(17, 19); return m % 3 === 0 && s === 0; }));
  });
  await prueba('no genera lecturas en el futuro', () => {
    assert.ok(D.aMs(mes.at(-1).received_at) <= AHORA);
  });
  await prueba('los valores quedan en rangos físicos razonables', () => {
    for (const l of mes) {
      if (l.temperature_c !== null) assert.ok(l.temperature_c > 5 && l.temperature_c < 35, 'temperatura ' + l.temperature_c);
      if (l.humidity_pct !== null) assert.ok(l.humidity_pct >= 30 && l.humidity_pct <= 99, 'humedad ' + l.humidity_pct);
      assert.ok(l.light_pct >= 0 && l.light_pct <= 100, 'luz ' + l.light_pct);
      assert.ok(l.co2_ppm >= 0 && l.co2_ppm < 20, 'co2 ' + l.co2_ppm);
      assert.ok(l.sound_db > 15 && l.sound_db < 60, 'sonido ' + l.sound_db);
    }
  });
  await prueba('la luz es cero de noche y alta al mediodía', () => {
    const noche = mes.filter(l => { const h = +l.received_at.slice(11, 13); return h >= 20 || h < 5; });
    const medio = mes.filter(l => { const h = +l.received_at.slice(11, 13); return h >= 11 && h < 13; });
    const prom = (a) => a.reduce((s, l) => s + l.light_pct, 0) / a.length;
    assert.ok(prom(noche) < 2, 'noche ' + prom(noche)); assert.ok(prom(medio) > 40, 'mediodía ' + prom(medio));
  });
  await prueba('la temperatura es más alta a las 14:00 que a las 05:00', () => {
    const prom = (h) => { const a = mes.filter(l => +l.received_at.slice(11, 13) === h && l.temperature_c !== null); return a.reduce((s, l) => s + l.temperature_c, 0) / a.length; };
    assert.ok(prom(14) - prom(5) > 6, `diferencia ${prom(14) - prom(5)}`);
  });
  await prueba('incluye fallas del DHT22, del micrófono y huecos de envío', () => {
    assert.ok(mes.some(l => !l.dht_valid), 'sin fallas del DHT22');
    assert.ok(mes.some(l => !l.audio_valid), 'sin fallas del micrófono');
    let huecos = 0;
    for (let i = 1; i < mes.length; i++) if (D.aMs(mes[i].received_at) - D.aMs(mes[i - 1].received_at) > 10 * MIN) huecos++;
    assert.ok(huecos >= 1, 'sin huecos');
  });
  await prueba('cuando el DHT22 falla, temperatura y humedad llegan en null', () => {
    assert.ok(mes.filter(l => !l.dht_valid).every(l => l.temperature_c === null && l.humidity_pct === null));
  });

  console.log('Adaptador');
  await prueba('cargarDia de hoy va desde las 00:00 hasta ahora', async () => {
    const hoy = await D.cargarDia(CONFIG, AHORA, AHORA);
    assert.ok(hoy[0].t >= S.inicioDia(AHORA) && hoy[0].t < S.inicioDia(AHORA) + 10 * MIN);
    assert.ok(hoy.at(-1).t <= AHORA && hoy.at(-1).t > AHORA - 10 * MIN);
  });
  await prueba('cargarDia de ayer trae el día completo', async () => {
    const ayer = await D.cargarDia(CONFIG, AHORA - S.DIA, AHORA);
    const hay = (h) => ayer.some(l => new Date(l.t).getHours() === h);
    assert.ok(hay(0) && hay(23), 'faltan horas extremas');
  });
  await prueba('nuevas entrega una lectura cada 15 s después de la última', async () => {
    const ult = AHORA - 60000;
    const n = await D.nuevas(CONFIG, ult, AHORA);
    assert.ok(n.length >= 3 && n.length <= 4, `obtuvo ${n.length}`);
    assert.ok(n.every(l => l.t > ult && l.t <= AHORA));
    for (let i = 1; i < n.length; i++) assert.strictEqual(n[i].t - n[i - 1].t, 15000);
  });
  await prueba('nuevas no repite la última lectura que ya se tenía', async () => {
    const n1 = await D.nuevas(CONFIG, AHORA - 30000, AHORA);
    const n2 = await D.nuevas(CONFIG, n1.at(-1).t, AHORA);
    assert.strictEqual(n2.length, 0);
  });
  await prueba('normalizar acepta banderas 0 y 1 y números como texto', () => {
    const r = D.normalizar([{ received_at: '2026-10-16 10:00:00', temperature_c: '21.5', humidity_pct: '60', dht_valid: 1,
      light_pct: '40', co2_ppm: '3.1', sound_db: '30', audio_valid: 0 }], CONFIG.variables)[0];
    assert.strictEqual(r.temperature_c, 21.5); assert.strictEqual(r.dht_valid, true);
    assert.strictEqual(r.sound_db, null); assert.strictEqual(r.audio_valid, false);
  });

  console.log('Gases del MQ-135');
  await prueba('cada lectura trae los seis gases', () => {
    const l = S.lectura(AHORA);
    for (const c of ['co2_ppm', 'co_ppm', 'nh3_ppm', 'alcohol_ppm', 'toluene_ppm', 'acetone_ppm']) assert.ok(typeof l[c] === 'number', c);
  });
  await prueba('las curvas dan los mismos valores del caso P01 del set de pruebas de la base de datos', () => {
    // P01 de BioRed_DB_v3/pruebas_payloads_v3.json, CO2 2.83 ppm
    assert.deepStrictEqual(S.gasesDesdeCo2(2.83), { co_ppm: 3.91, nh3_ppm: 4.31, alcohol_ppm: 1.32, toluene_ppm: 0.55, acetone_ppm: 0.46 });
  });
  await prueba('todos los gases suben cuando sube el CO2', () => {
    const a = S.gasesDesdeCo2(3), b = S.gasesDesdeCo2(6);
    for (const k of Object.keys(a)) assert.ok(b[k] > a[k], k);
  });
  await prueba('el adaptador convierte a número los gases que lleguen como texto', () => {
    const cfg = { ...CONFIG, gases: [{ campo: 'co_ppm' }, { campo: 'nh3_ppm' }] };
    const r = D.normalizar([{ received_at: '2026-10-16 10:00:00', co_ppm: '4.05', nh3_ppm: null }], D.camposDe(cfg))[0];
    assert.strictEqual(r.co_ppm, 4.05); assert.strictEqual(r.nh3_ppm, null);
  });

  console.log(`\n${ok} pasan, ${fallos} fallan`);
  process.exit(fallos ? 1 : 0);
})();
