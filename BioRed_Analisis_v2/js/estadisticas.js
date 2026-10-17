/*
  BioRed - Libreria de estadisticas del modulo de analisis

  Funciones puras, sin dependencias. Funcionan en el navegador
  (window.BioEstadisticas) y en Node (require) para las pruebas.

  Cada lectura es un objeto con la fecha en milisegundos en el campo t
  y los valores de cada variable. Un valor null significa que no hay
  dato valido y se ignora en todos los calculos.
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.BioEstadisticas = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {

  const MS_MINUTO = 60 * 1000;
  const MS_HORA = 60 * MS_MINUTO;

  const esNumero = (x) => typeof x === 'number' && Number.isFinite(x);

  // Valores validos de un campo
  function valores(lecturas, campo) {
    const r = [];
    for (const l of lecturas) if (esNumero(l[campo])) r.push(l[campo]);
    return r;
  }

  // Percentil con interpolacion lineal sobre un arreglo ya ordenado
  function percentil(ordenados, p) {
    if (ordenados.length === 0) return null;
    const pos = (ordenados.length - 1) * p;
    const i = Math.floor(pos), f = pos - i;
    return i + 1 < ordenados.length ? ordenados[i] * (1 - f) + ordenados[i + 1] * f : ordenados[i];
  }

  // Estadisticas descriptivas de un arreglo de numeros
  function resumen(numeros) {
    const v = numeros.filter(esNumero);
    const n = v.length;
    if (n === 0) return { n: 0, min: null, max: null, media: null, mediana: null, desviacion: null, p25: null, p75: null };
    const ord = [...v].sort((a, b) => a - b);
    const media = v.reduce((s, x) => s + x, 0) / n;
    const varianza = n > 1 ? v.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1) : 0;
    return {
      n,
      min: ord[0],
      max: ord[n - 1],
      media,
      mediana: percentil(ord, 0.5),
      desviacion: Math.sqrt(varianza),       // desviacion estandar muestral
      p25: percentil(ord, 0.25),
      p75: percentil(ord, 0.75)
    };
  }

  // Pares de valores donde las dos variables tienen dato en la misma lectura
  function pares(lecturas, campoX, campoY) {
    const xs = [], ys = [];
    for (const l of lecturas) {
      if (esNumero(l[campoX]) && esNumero(l[campoY])) { xs.push(l[campoX]); ys.push(l[campoY]); }
    }
    return { xs, ys };
  }

  // Coeficiente de correlacion de Pearson. Null si no se puede calcular
  function pearson(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }

  // Regresion lineal por minimos cuadrados, y = pendiente * x + intercepto
  function regresion(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    if (sxx === 0) return null;
    const pendiente = sxy / sxx;
    const r = pearson(xs, ys);
    return { pendiente, intercepto: my - pendiente * mx, r2: r === null ? null : r * r, n };
  }

  // Inicio del periodo (minuto, hora o dia) al que pertenece una fecha, en hora local
  function inicioPeriodo(ms, periodo) {
    const f = new Date(ms);
    if (periodo === 'minuto') f.setSeconds(0, 0);
    else if (periodo === 'hora') f.setMinutes(0, 0, 0);
    else if (periodo === 'dia') f.setHours(0, 0, 0, 0);
    else throw new Error('Periodo no valido ' + periodo);
    return f.getTime();
  }

  function siguientePeriodo(ms, periodo) {
    const f = new Date(ms);
    if (periodo === 'minuto') f.setMinutes(f.getMinutes() + 1);
    else if (periodo === 'hora') f.setHours(f.getHours() + 1);
    else f.setDate(f.getDate() + 1);
    return f.getTime();
  }

  // Agrupa un campo por periodo. Devuelve media, minimo, maximo y cantidad.
  // Los periodos sin datos se incluyen con media null para que las
  // graficas muestren el hueco en lugar de unir los puntos.
  function agrupar(lecturas, campo, periodo) {
    const grupos = new Map();
    for (const l of lecturas) {
      if (!esNumero(l[campo])) continue;
      const k = inicioPeriodo(l.t, periodo);
      let g = grupos.get(k);
      if (!g) { g = { suma: 0, n: 0, min: Infinity, max: -Infinity }; grupos.set(k, g); }
      g.suma += l[campo]; g.n++;
      if (l[campo] < g.min) g.min = l[campo];
      if (l[campo] > g.max) g.max = l[campo];
    }
    if (grupos.size === 0) return [];
    const claves = [...grupos.keys()].sort((a, b) => a - b);
    const salida = [];
    for (let k = claves[0]; k <= claves[claves.length - 1]; k = siguientePeriodo(k, periodo)) {
      const g = grupos.get(k);
      salida.push(g ? { t: k, media: g.suma / g.n, min: g.min, max: g.max, n: g.n }
                     : { t: k, media: null, min: null, max: null, n: 0 });
    }
    return salida;
  }

  // Perfil diario, estadisticas por hora del dia (0 a 23) uniendo todos los dias
  function perfilDiario(lecturas, campo) {
    const horas = Array.from({ length: 24 }, () => []);
    for (const l of lecturas) if (esNumero(l[campo])) horas[new Date(l.t).getHours()].push(l[campo]);
    return horas.map((v, hora) => {
      const r = resumen(v);
      return { hora, media: r.media, min: r.min, max: r.max, desviacion: r.desviacion, n: r.n };
    });
  }

  // Tendencia entre dias. Ajusta una recta a los promedios diarios.
  function tendenciaDiaria(lecturas, campo) {
    const dias = agrupar(lecturas, campo, 'dia').filter(d => d.media !== null);
    if (dias.length < 3) return null;
    const xs = dias.map((d, i) => i), ys = dias.map(d => d.media);
    const reg = regresion(xs, ys);
    return reg && { pendientePorDia: reg.pendiente, r2: reg.r2, dias: dias.length, promediosDiarios: dias };
  }

  // Periodos sin datos mayores que un umbral (por defecto 10 minutos)
  // duracionMs es el tiempo entre las dos lecturas que rodean el hueco.
  // sinDatosMs le resta el intervalo normal de envio (la mediana).
  function huecos(lecturas, umbralMs = 10 * MS_MINUTO) {
    const ts = lecturas.map(l => l.t).sort((a, b) => a - b);
    const difs = [];
    for (let i = 1; i < ts.length; i++) difs.push(ts[i] - ts[i - 1]);
    const intervalo = difs.length ? percentil([...difs].sort((a, b) => a - b), 0.5) : 0;
    const r = [];
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i] - ts[i - 1];
      if (d > umbralMs) r.push({ desde: ts[i - 1], hasta: ts[i], duracionMs: d, sinDatosMs: d - intervalo });
    }
    return r;
  }

  // Interpretacion verbal de la fuerza de una correlacion
  function fuerzaCorrelacion(r) {
    if (r === null) return 'sin datos suficientes';
    const a = Math.abs(r);
    if (a >= 0.7) return 'fuerte';
    if (a >= 0.4) return 'moderada';
    if (a >= 0.2) return 'débil';
    return 'muy débil o nula';
  }

  return {
    MS_MINUTO, MS_HORA,
    valores, percentil, resumen, pares, pearson, regresion,
    inicioPeriodo, agrupar, perfilDiario, tendenciaDiaria, huecos, fuerzaCorrelacion
  };
});
