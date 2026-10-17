/*
  BioRed v2 - Agregados para las secciones de análisis del periodo

  Funciones puras que preparan los datos de la vista general, el mapa
  de calor y la matriz de correlación. Usan la librería de estadísticas
  de la v1 (estadisticas.js).
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./estadisticas.js'));
  else raiz.BioAgregados = fabrica(raiz.BioEstadisticas);
})(typeof self !== 'undefined' ? self : this, function (E) {

  function inicioDia(t) { const f = new Date(t); f.setHours(0, 0, 0, 0); return f.getTime(); }

  // Promedio por hora de cada variable llevado a una escala de 0 a 100 %,
  // donde 0 es el mínimo y 100 el máximo de los promedios del periodo.
  // Cada punto es [t, porcentaje, valorReal]. Las horas sin datos quedan en null.
  function vistaGeneral(lecturas, variables) {
    return variables.map(v => {
      const grupos = E.agrupar(lecturas, v.campo, 'hora');
      const medias = grupos.map(g => g.media).filter(x => x !== null);
      const min = medias.length ? Math.min(...medias) : null;
      const max = medias.length ? Math.max(...medias) : null;
      const span = (max !== null && max - min > 1e-9) ? max - min : null;
      const puntos = grupos.map(g => [g.t, g.media === null ? null : (span ? Math.min(100, Math.max(0, 100 * (g.media - min) / span)) : 50), g.media]);
      return { campo: v.campo, min, max, puntos };
    });
  }

  // Promedio de cada hora del día (columnas 0 a 23) para cada día del rango (filas).
  // Incluye los días sin datos para que el mapa no salte fechas.
  function mapaCalor(lecturas, campo, desdeMs, hastaMs) {
    const dias = [];
    for (let d = inicioDia(desdeMs); d <= hastaMs; ) {
      dias.push(d);
      const f = new Date(d); f.setDate(f.getDate() + 1); d = f.getTime();
    }
    const indice = new Map(dias.map((d, i) => [d, i]));
    const suma = new Map(), cuenta = new Map();
    for (const l of lecturas) {
      const v = l[campo];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const fila = indice.get(inicioDia(l.t));
      if (fila === undefined) continue;
      const k = fila * 24 + new Date(l.t).getHours();
      suma.set(k, (suma.get(k) || 0) + v);
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    const celdas = [];
    let min = Infinity, max = -Infinity;
    for (const [k, s] of suma) {
      const media = s / cuenta.get(k);
      celdas.push([k % 24, Math.floor(k / 24), media, cuenta.get(k)]);
      if (media < min) min = media;
      if (media > max) max = media;
    }
    return { dias, celdas, min: celdas.length ? min : null, max: celdas.length ? max : null };
  }

  // Coeficiente de Pearson para cada par de variables. Devuelve celdas [columna, fila, r, pares]
  function matrizCorrelacion(lecturas, variables) {
    const celdas = [];
    const n = variables.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) { celdas.push([i, j, 1, null]); continue; }
        const { xs, ys } = E.pares(lecturas, variables[i].campo, variables[j].campo);
        celdas.push([i, j, E.pearson(xs, ys), xs.length]);
      }
    }
    return celdas;
  }

  // Toma como máximo 'max' puntos repartidos de manera uniforme, para que la dispersión sea fluida
  function muestrear(xs, ys, max = 3000) {
    const paso = Math.max(1, Math.ceil(xs.length / max));
    const r = [];
    for (let i = 0; i < xs.length; i += paso) r.push([xs[i], ys[i]]);
    return r;
  }

  return { vistaGeneral, mapaCalor, matrizCorrelacion, muestrear };
});
