/*
  BioRed v2 - Utilidades para el gráfico principal y las tarjetas

  Funciones puras, sin dependencia del navegador, para poder probarlas
  con Node. Trabajan con lecturas normalizadas (cada una con su campo t
  en milisegundos) y con el minuto del día (0 a 1440).
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.BioSerie = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {

  const HUECO_MIN = 10;   // minutos sin lecturas a partir de los cuales la línea se corta

  function inicioDia(t) { const f = new Date(t); f.setHours(0, 0, 0, 0); return f.getTime(); }
  const minutoDelDia = (t) => (t - inicioDia(t)) / 60000;

  // Puntos [minuto, valor] para ECharts. '-' marca un valor vacío y corta la línea
  function puntos(lecturas, campo) {
    const r = [];
    let ant = null;
    for (const l of lecturas) {
      const m = minutoDelDia(l.t);
      if (ant !== null && m - ant > HUECO_MIN) r.push([(ant + m) / 2, '-']);
      r.push([m, l[campo] === null ? '-' : l[campo]]);
      ant = m;
    }
    return r;
  }

  function ultimoValido(lecturas, campo) {
    for (let i = lecturas.length - 1; i >= 0; i--) if (lecturas[i][campo] !== null) return lecturas[i];
    return null;
  }

  // Lectura más cercana a un minuto del día, a menos de HUECO_MIN minutos. Búsqueda binaria.
  function lecturaEnMinuto(lecturas, minuto) {
    let lo = 0, hi = lecturas.length - 1, mejor = -1, dist = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, m = minutoDelDia(lecturas[mid].t), d = Math.abs(m - minuto);
      if (d < dist) { dist = d; mejor = mid; }
      if (m < minuto) lo = mid + 1; else hi = mid - 1;
    }
    return (mejor < 0 || dist > HUECO_MIN) ? null : lecturas[mejor];
  }

  function valorEnMinuto(lecturas, campo, minuto) {
    const l = lecturaEnMinuto(lecturas, minuto);
    return l ? l[campo] : null;
  }

  // Mínimo, máximo y promedio de las lecturas válidas
  function resumen(lecturas, campo) {
    let n = 0, s = 0, min = Infinity, max = -Infinity, tMin = null, tMax = null;
    for (const l of lecturas) {
      const v = l[campo];
      if (v === null || v === undefined) continue;
      n++; s += v;
      if (v < min) { min = v; tMin = l.t; }
      if (v > max) { max = v; tMax = l.t; }
    }
    return n ? { n, min, max, media: s / n, tMin, tMax } : { n: 0, min: null, max: null, media: null, tMin: null, tMax: null };
  }

  // Promedios de las últimas 'horas' horas en 'partes' tramos, para la sparkline.
  // Los tramos sin datos quedan en null.
  function sparkline(lecturas, campo, hastaT, horas = 3, partes = 36) {
    const desde = hastaT - horas * 3600000, ancho = (hastaT - desde) / partes;
    const suma = new Array(partes).fill(0), cuenta = new Array(partes).fill(0);
    for (let i = lecturas.length - 1; i >= 0; i--) {
      const l = lecturas[i];
      if (l.t <= desde) break;
      if (l.t > hastaT || l[campo] === null) continue;
      const k = Math.min(partes - 1, Math.floor((l.t - desde) / ancho));
      suma[k] += l[campo]; cuenta[k]++;
    }
    return suma.map((s, k) => cuenta[k] ? s / cuenta[k] : null);
  }

  // Polilínea SVG en una caja de 100 x alto. Los tramos vacíos cortan la línea.
  function trazoSvg(valores, alto = 28, margen = 3) {
    const v = valores.filter(x => x !== null);
    if (v.length < 2) return '';
    let min = Math.min(...v), max = Math.max(...v);
    if (max - min < 1e-9) { min -= 1; max += 1; }
    const paso = 100 / (valores.length - 1);
    let d = '', abierto = false;
    valores.forEach((x, i) => {
      if (x === null) { abierto = false; return; }
      const px = (i * paso).toFixed(2), py = (margen + (1 - (x - min) / (max - min)) * (alto - 2 * margen)).toFixed(2);
      d += `${abierto ? 'L' : 'M'}${px} ${py} `;
      abierto = true;
    });
    return d.trim();
  }

  // 'alto', 'bajo' o 'normal' según el rango configurado de la variable
  function estadoRango(valor, rango) {
    if (valor === null || valor === undefined || !rango) return 'normal';
    if (rango.max !== undefined && valor > rango.max) return 'alto';
    if (rango.min !== undefined && valor < rango.min) return 'bajo';
    return 'normal';
  }

  // Separación de las marcas del eje X (en minutos) según cuántos minutos se ven
  function intervaloEje(minutosVisibles) {
    const opciones = [5, 10, 15, 30, 60, 120, 180];
    for (const o of opciones) if (minutosVisibles / o <= 9) return o;
    return 180;
  }

  // Límites del eje Y para los valores visibles, con números redondos.
  // Los límites del rango normal se muestran solo si están cerca de los datos,
  // para que una línea lejana no aplaste la curva.
  function ejeY(valores, umbrales = []) {
    const v = valores.filter(x => typeof x === 'number' && Number.isFinite(x));
    if (!v.length) return { min: null, max: null, umbrales: [] };
    let lo = Math.min(...v), hi = Math.max(...v);
    const span0 = Math.max(hi - lo, Math.abs(hi) * 0.02, 0.1);
    const visibles = umbrales.filter(u => u >= lo - span0 * 0.35 && u <= hi + span0 * 0.35);
    for (const u of visibles) { lo = Math.min(lo, u); hi = Math.max(hi, u); }
    const span = Math.max(hi - lo, span0);
    const bruto = span / 4, pot = 10 ** Math.floor(Math.log10(bruto));
    const paso = [1, 2, 2.5, 5, 10].map(k => k * pot).find(k => k >= bruto);
    let min = Math.floor((lo - span * 0.06) / paso) * paso;
    const max = Math.ceil((hi + span * 0.06) / paso) * paso;
    if (lo >= 0 && min < 0) min = 0;
    return { min: +min.toFixed(6), max: +max.toFixed(6), paso: +paso.toFixed(6), umbrales: visibles };
  }

  return { HUECO_MIN, ejeY, inicioDia, minutoDelDia, puntos, ultimoValido, lecturaEnMinuto, valorEnMinuto,
           resumen, sparkline, trazoSvg, estadoRango, intervaloEje };
});
