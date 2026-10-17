/*
  BioRed - Interpretación automática de los datos

  Convierte las estadísticas en hallazgos escritos en lenguaje natural,
  para que cualquier integrante del semillero entienda qué muestran
  los datos sin leer cada gráfica.
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./estadisticas.js'));
  else raiz.BioInterpretacion = fabrica(raiz.BioEstadisticas);
})(typeof self !== 'undefined' ? self : this, function (E) {

  const p2 = (n) => String(n).padStart(2, '0');
  const art = (v) => v.articulo || v.nombre;
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const hora = (h) => `${p2(h)}:00`;
  const fecha = (ms) => { const f = new Date(ms); return `${p2(f.getDate())}/${p2(f.getMonth() + 1)} a las ${p2(f.getHours())}:${p2(f.getMinutes())}`; };
  const fmt = (x, d) => (x === null || x === undefined) ? 'sin dato' : x.toFixed(d);
  function duracion(ms) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} minutos`;
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  // Hallazgos del ciclo diario de una variable
  function hallazgoPerfil(lecturas, v) {
    const perfil = E.perfilDiario(lecturas, v.campo).filter(p => p.media !== null);
    if (perfil.length < 12) return null;
    let alto = perfil[0], bajo = perfil[0];
    for (const p of perfil) { if (p.media > alto.media) alto = p; if (p.media < bajo.media) bajo = p; }
    return {
      tipo: 'ciclo', variable: v.campo,
      texto: `${mayus(art(v))} alcanza su promedio más alto hacia las ${hora(alto.hora)} (${fmt(alto.media, v.decimales)} ${v.unidad}) ` +
             `y el más bajo hacia las ${hora(bajo.hora)} (${fmt(bajo.media, v.decimales)} ${v.unidad}). ` +
             `La variación promedio a lo largo del día es de ${fmt(alto.media - bajo.media, v.decimales)} ${v.unidad}.`
    };
  }

  // Hallazgo de tendencia entre días
  function hallazgoTendencia(lecturas, v) {
    const t = E.tendenciaDiaria(lecturas, v.campo);
    if (!t) return null;
    if (t.r2 !== null && t.r2 >= 0.5) {
      const sube = t.pendientePorDia > 0;
      return {
        tipo: 'tendencia', variable: v.campo,
        texto: `${mayus(art(v))} muestra una tendencia ${sube ? 'al alza' : 'a la baja'} entre días, ` +
               `de ${fmt(Math.abs(t.pendientePorDia), v.decimales + 1)} ${v.unidad} por día en promedio ` +
               `(R² = ${fmt(t.r2, 2)}, ${t.dias} días).`
      };
    }
    return {
      tipo: 'tendencia', variable: v.campo,
      texto: `${mayus(art(v))} no muestra una tendencia clara entre días. Sus promedios diarios suben y bajan sin una dirección constante (R² = ${fmt(t.r2, 2)}).`
    };
  }

  // Lecturas descartadas por venir marcadas como inválidas
  function hallazgoCalidad(lecturas, v) {
    if (!v.campoValidez) return null;
    const invalidas = lecturas.filter(l => l[v.campoValidez] === false).length;
    if (invalidas === 0) return null;
    const pct = 100 * invalidas / lecturas.length;
    return {
      tipo: 'calidad', variable: v.campo,
      texto: `Se descartaron ${invalidas} lecturas de ${v.nombre.toLowerCase()} marcadas como inválidas por el sensor (${fmt(pct, 1)} % del periodo).`
    };
  }

  // Correlaciones moderadas o fuertes entre pares de variables
  function hallazgosCorrelacion(lecturas, variables, umbral = 0.4) {
    const r = [];
    for (let i = 0; i < variables.length; i++) {
      for (let j = i + 1; j < variables.length; j++) {
        const a = variables[i], b = variables[j];
        const { xs, ys } = E.pares(lecturas, a.campo, b.campo);
        const c = E.pearson(xs, ys);
        if (c === null || Math.abs(c) < umbral) continue;
        const explicacion = c < 0 ? 'Cuando una sube, la otra tiende a bajar.' : 'Tienden a subir y bajar al mismo tiempo.';
        r.push({
          tipo: 'correlacion', variables: [a.campo, b.campo], r: c,
          texto: `${mayus(art(a))} y ${art(b)} tienen una correlación ${E.fuerzaCorrelacion(c)} ` +
                 `${c < 0 ? 'negativa' : 'positiva'} (r = ${fmt(c, 2)}). ${explicacion}`
        });
      }
    }
    return r.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  }

  function hallazgosHuecos(lecturas) {
    return E.huecos(lecturas).map(h => ({
      tipo: 'hueco',
      texto: `No llegaron datos durante ${duracion(h.sinDatosMs)}, después de la lectura del ${fecha(h.desde)} y hasta la del ${fecha(h.hasta)}. ` +
             `Puede deberse a una pérdida de Wi-Fi o de energía en la estación.`
    }));
  }

  // Todos los hallazgos del periodo, en orden de lectura
  function interpretar(lecturas, variables) {
    if (!lecturas.length) return [{ tipo: 'vacio', texto: 'No hay lecturas en el periodo seleccionado.' }];
    const h = [];
    for (const v of variables) {
      const c = hallazgoPerfil(lecturas, v); if (c) h.push(c);
    }
    for (const v of variables) {
      const t = hallazgoTendencia(lecturas, v); if (t) h.push(t);
    }
    h.push(...hallazgosCorrelacion(lecturas, variables));
    for (const v of variables) {
      const q = hallazgoCalidad(lecturas, v); if (q) h.push(q);
    }
    h.push(...hallazgosHuecos(lecturas));
    return h;
  }

  return { interpretar, hallazgoPerfil, hallazgoTendencia, hallazgoCalidad, hallazgosCorrelacion, hallazgosHuecos };
});
