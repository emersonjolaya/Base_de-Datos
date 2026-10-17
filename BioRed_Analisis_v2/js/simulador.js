/*
  BioRed v2 - Simulador de la estación

  Genera lecturas sintéticas con el mismo formato que entregará la API.
  Cada valor depende solo de su fecha y hora, sin estado guardado. Por eso
  la misma hora siempre da la misma lectura, el histórico se puede pedir
  por partes y las lecturas "en vivo" encajan con las anteriores.

  Comportamientos que imita
    Temperatura con mínimo hacia las 05:00 y máximo hacia las 14:00,
      variación propia de cada día y una ola lenta de unos 23 días
    Humedad relativa inversa a la temperatura
    Luz solo de día, afectada por la nubosidad de cada hora
    Sonido más alto de día, coro de aves al amanecer y eventos sueltos
    CO2 estimado algo mayor de noche, con eventos de gas que se disipan
    CO, NH3, alcohol, tolueno y acetona calculados con las curvas del
      MQ-135 a partir de la misma Rs/R0 del CO2, como lo hace el firmware

  Fallas a propósito, en días elegidos por la semilla
    Huecos de envío de 1 a 2 horas en la madrugada (unos 1 de cada 8 días)
    DHT22 sin responder 10 a 25 minutos (unos 1 de cada 6 días)
    Micrófono desconectado 30 a 60 minutos (unos 1 de cada 12 días)
    Lecturas inválidas sueltas del DHT22 (0.3 %)
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.BioSimulador = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {

  const SEMILLA = 20261016;
  const MIN = 60000, HORA = 3600000, DIA = 86400000;

  // ---------- Azar reproducible a partir de números ----------
  function azar(a, b) {
    let h = Math.imul((a | 0) ^ SEMILLA, 0x9E3779B1) ^ Math.imul((b | 0) + 0x632BE5AB, 0x85EBCA77);
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
    h = Math.imul(h ^ (h >>> 12), 0x297A2D39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
  function gauss(a, b) {
    const u = Math.max(azar(a, b), 1e-9), v = azar(a, b + 7919);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Canales para que cada variable tenga su propio azar
  const K = { tDia: 1, hDia: 2, nube: 3, ruidoT: 4, ruidoH: 5, ruidoL: 6, ruidoS: 7, ruidoC: 8, evS: 9, evS2: 10,
              co2: 11, co2Ini: 12, co2Amp: 13, hueco: 14, huecoIni: 15, huecoDur: 16, dht: 17, dhtIni: 18, dhtDur: 19,
              mic: 20, micIni: 21, micDur: 22, dhtSuelto: 23 };

  const redondear = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
  const p2 = (n) => String(n).padStart(2, '0');

  // Número de día y hora decimal en la hora local del navegador
  function diaLocal(t) { const f = new Date(t); return Math.floor((t - f.getTimezoneOffset() * MIN) / DIA); }
  function horaLocal(t) { const f = new Date(t); return f.getHours() + f.getMinutes() / 60 + f.getSeconds() / 3600; }
  function inicioDia(t) { const f = new Date(t); f.setHours(0, 0, 0, 0); return f.getTime(); }

  function texto(t) {
    const f = new Date(t);
    return `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())} ${p2(f.getHours())}:${p2(f.getMinutes())}:${p2(f.getSeconds())}`;
  }

  // Valor propio de cada día, interpolado a lo largo de la hora para que no salte a medianoche
  function suaveDiario(canal, dia, h, escala) {
    const a = gauss(dia, canal) * escala, b = gauss(dia + 1, canal) * escala;
    return a + (b - a) * (h / 24);
  }

  // Forma diaria de la temperatura. Mínimo a las 05:00 y máximo a las 14:00
  function formaDiaria(h) {
    if (h >= 5 && h < 14) return -Math.cos(Math.PI * (h - 5) / 9);
    const hh = h < 5 ? h + 24 : h;
    return Math.cos(Math.PI * (hh - 14) / 15);
  }

  // Nubosidad por hora (0.45 muy nublado, 1 despejado)
  function nubosidad(t) {
    const hAbs = t / HORA, i = Math.floor(hAbs), f = hAbs - i;
    const n = (k) => 0.45 + 0.55 * azar(k, K.nube);
    return n(i) * (1 - f) + n(i + 1) * f;
  }

  // ---------- Fallas programadas por día ----------
  function fallaDelDia(dia, canal, prob, iniMin, iniMax, durMin, durMax, cIni, cDur) {
    if (azar(dia, canal) >= prob) return null;
    const ini = iniMin + azar(dia, cIni) * (iniMax - iniMin);   // horas
    const dur = durMin + azar(dia, cDur) * (durMax - durMin);   // minutos
    return { desde: ini, hasta: ini + dur / 60 };
  }
  const enFalla = (f, h) => f && h >= f.desde && h < f.hasta;

  function fallas(dia) {
    return {
      hueco: fallaDelDia(dia, K.hueco, 0.125, 1, 4, 60, 120, K.huecoIni, K.huecoDur),
      dht:   fallaDelDia(dia, K.dht, 0.17, 8, 18, 10, 25, K.dhtIni, K.dhtDur),
      mic:   fallaDelDia(dia, K.mic, 0.085, 9, 17, 30, 60, K.micIni, K.micDur)
    };
  }

  // ¿La estación envió datos en este momento?
  function hayEnvio(t) { return !enFalla(fallas(diaLocal(t)).hueco, horaLocal(t)); }

  // ---------- CO2 con eventos que se disipan ----------
  function co2Eventos(t) {
    const H = Math.floor(t / HORA);
    let extra = 0;
    for (let k = H - 3; k <= H; k++) {
      if (azar(k, K.co2) >= 0.09) continue;
      const ini = k * HORA + azar(k, K.co2Ini) * HORA;
      if (t < ini) continue;
      extra += (3 + 7 * azar(k, K.co2Amp)) * Math.exp(-(t - ini) / (12 * MIN));
    }
    return extra;
  }

  // ---------- Gases del MQ-135 ----------
  // Curvas ppm = a * (Rs/R0)^b de la librería MQUnifiedsensor, las mismas del
  // script 04 de la base de datos. Todos los gases salen de la misma relación
  // Rs/R0, por eso suben y bajan juntos.
  const CURVAS = {
    co2_ppm:     { a: 110.47, b: -2.862 },
    co_ppm:      { a: 605.18, b: -3.937 },
    nh3_ppm:     { a: 102.2,  b: -2.473 },
    alcohol_ppm: { a: 77.255, b: -3.18 },
    toluene_ppm: { a: 44.947, b: -3.445 },
    acetone_ppm: { a: 34.668, b: -3.369 }
  };
  function gasesDesdeCo2(co2) {
    const razon = Math.pow(co2 / CURVAS.co2_ppm.a, 1 / CURVAS.co2_ppm.b);   // Rs/R0
    const r = {};
    for (const [campo, c] of Object.entries(CURVAS)) {
      if (campo !== 'co2_ppm') r[campo] = redondear(c.a * Math.pow(razon, c.b), 2);
    }
    return r;
  }

  // ---------- Una lectura ----------
  function lectura(t) {
    const s = Math.floor(t / 1000);                 // segundo, base del ruido de cada lectura
    const dia = diaLocal(t), h = horaLocal(t), f = fallas(dia);

    const temp = 18.3 + 1.3 * Math.sin(2 * Math.PI * dia / 23) + suaveDiario(K.tDia, dia, h, 0.8)
               + 4.6 * formaDiaria(h) + gauss(s, K.ruidoT) * 0.12;
    const hum = limitar(118 - 2.45 * temp + suaveDiario(K.hDia, dia, h, 3) + 4 * Math.sin(t / HORA / 5)
               + gauss(s, K.ruidoH) * 1.2, 30, 99);

    let luz = 0;
    if (h >= 6 && h < 18) luz = 88 * Math.sin(Math.PI * (h - 6) / 12) * nubosidad(t);
    luz = Math.round(limitar(luz + gauss(s, K.ruidoL) * 1.5, 0, 100));

    let db = 24.5 + 6.5 * limitar((h - 5.5) / 0.75, 0, 1) * limitar((19.5 - h) / 0.75, 0, 1);
    if (h >= 5.5 && h < 7) db += 6 * Math.sin(Math.PI * (h - 5.5) / 1.5);
    if (azar(s, K.evS) < 0.02) db += 8 + 7 * azar(s, K.evS2);
    db += gauss(s, K.ruidoS) * 1.2;

    const nocturno = 0.5 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (h - 2) / 24));
    const co2 = Math.max(0, 2.75 + nocturno + co2Eventos(t) + gauss(s, K.ruidoC) * 0.08);

    const dhtValido = !(enFalla(f.dht, h) || azar(s, K.dhtSuelto) < 0.003);
    const audioValido = !enFalla(f.mic, h);
    const dbFinal = audioValido ? db : 23.6 + gauss(s, K.ruidoS) * 0.4;   // lo que mide con el pin al aire

    return {
      reading_id: s,
      received_at: texto(t),
      temperature_c: dhtValido ? redondear(temp, 1) : null,
      humidity_pct: dhtValido ? redondear(hum, 1) : null,
      dht_valid: dhtValido,
      light_pct: luz,
      co2_ppm: redondear(co2, 2),
      ...gasesDesdeCo2(Math.max(co2, 0.01)),
      sound_db: redondear(dbFinal, 1),
      audio_valid: audioValido
    };
  }

  // Lecturas entre dos fechas sobre una rejilla fija de pasoMs (por defecto cada 3 minutos).
  // Incluye desdeMs y hastaMs si caen en la rejilla, y omite los momentos sin envío.
  function generar(desdeMs, hastaMs, pasoMs = 3 * MIN) {
    const r = [];
    for (let t = Math.ceil(desdeMs / pasoMs) * pasoMs; t <= hastaMs; t += pasoMs) {
      if (hayEnvio(t)) r.push(lectura(t));
    }
    return r;
  }

  return { lectura, generar, gasesDesdeCo2, CURVAS, hayEnvio, fallas, diaLocal, horaLocal, inicioDia, texto, MIN, HORA, DIA };
});
