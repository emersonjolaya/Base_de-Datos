/*
  BioRed v2 - Análisis del periodo (Fase 4)

  Secciones debajo del gráfico principal. Trabajan sobre los últimos
  7, 14 o 30 días y se recalculan cada 10 minutos para incluir las
  lecturas nuevas.
    Vista general       cinco sensores en escala de 0 a 100 %
    Mapa de calor       promedio por hora del día y por día
    Hallazgos           texto automático (interpretacion.js de la v1)
    Resumen estadístico tabla con percentiles y desviación
    Correlaciones       matriz de Pearson, clic para ver la dispersión
    Dispersión          lecturas y recta de regresión
*/
(function () {
  const C = window.BIORED_CONFIG;
  const T = window.BioTema;
  const D = window.BioDatos;
  const E = window.BioEstadisticas;
  const I = window.BioInterpretacion;
  const A = window.BioAgregados;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const fmt = (x, d) => (x === null || x === undefined) ? '—' : x.toFixed(d);
  const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const variable = (campo) => C.variables.find(v => v.campo === campo);
  const art = (v) => v.articulo || v.nombre;
  const tactil = window.matchMedia('(pointer: coarse)').matches;
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const fechaCorta = (t) => { const f = new Date(t); return `${DIAS[f.getDay()]} ${p2(f.getDate())}/${p2(f.getMonth() + 1)}`; };
  const fechaHora = (t) => { const f = new Date(t); return `${fechaCorta(t)} ${p2(f.getHours())}:00`; };

  const estado = {
    dias: 7,
    desde: null, hasta: null,
    lecturas: [],
    ocultas: new Set(),          // variables ocultas en la vista general
    calor: 'temperature_c',
    dispX: 'temperature_c',
    dispY: 'humidity_pct'
  };
  const graficas = {};

  function alfa(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function grafica(id) {
    if (!graficas[id]) graficas[id] = echarts.init($(id), null, { renderer: 'canvas' });
    return graficas[id];
  }
  const base = (pal) => ({
    animationDuration: 600, animationDurationUpdate: 500,
    textStyle: { fontFamily: 'Inter, Segoe UI, sans-serif', color: pal.graf.texto }
  });
  const estiloTooltip = (pal) => ({
    backgroundColor: pal.graf.tooltip, borderColor: pal.ui.borde, borderWidth: 1, padding: [10, 12],
    textStyle: { color: pal.ui.texto, fontSize: 12, fontFamily: 'Inter, Segoe UI, sans-serif' },
    extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18)'
  });

  // ---------- Carga ----------
  async function cargar() {
    const ahora = Date.now();
    const f = new Date(ahora); f.setHours(0, 0, 0, 0); f.setDate(f.getDate() - (estado.dias - 1));
    estado.desde = f.getTime(); estado.hasta = ahora;
    $('sub-analisis').textContent = 'Cargando lecturas...';
    estado.lecturas = await D.cargarRango(C, estado.desde, estado.hasta);
    const l = estado.lecturas;
    $('sub-analisis').textContent = l.length
      ? `${miles(l.length)} lecturas del ${fechaCorta(l[0].t)} al ${fechaCorta(l.at(-1).t)}. Se actualiza cada 10 minutos.`
      : 'No hay lecturas en el periodo.';
  }

  // ---------- Chips ----------
  function pintarChips() {
    const pal = T.actual();
    $('chips-general').innerHTML = C.variables.map(v =>
      `<button type="button" class="chip" data-campo="${v.campo}" aria-pressed="${!estado.ocultas.has(v.campo)}" style="--color-sensor:${pal.graf.sensores[v.campo]}"><i></i>${v.corto}</button>`).join('');
    $('chips-calor').innerHTML = C.variables.map(v =>
      `<button type="button" class="chip" data-campo="${v.campo}" aria-pressed="${estado.calor === v.campo}" style="--color-sensor:${pal.graf.sensores[v.campo]}"><i></i>${v.corto}</button>`).join('');
    $('chips-general').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.campo;
      if (estado.ocultas.has(c)) estado.ocultas.delete(c);
      else if (estado.ocultas.size < C.variables.length - 1) estado.ocultas.add(c);   // siempre queda al menos una
      pintarChips(); pintarGeneral();
    }));
    $('chips-calor').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
      estado.calor = b.dataset.campo; pintarChips(); pintarCalor();
    }));
  }

  // ---------- Vista general ----------
  function pintarGeneral() {
    const pal = T.actual(), g = pal.graf;
    const series = A.vistaGeneral(estado.lecturas, C.variables);
    const visibles = series.filter(s => !estado.ocultas.has(s.campo));
    grafica('grafica-general').setOption({
      ...base(pal),
      grid: { left: 8, right: 16, top: 12, bottom: 44, containLabel: true },
      tooltip: {
        trigger: 'axis', ...estiloTooltip(pal),
        axisPointer: { type: 'line', lineStyle: { color: g.ejes, type: 'dashed' } },
        formatter: (ps) => {
          const filas = ps.filter(p => p.value[1] !== null).map(p => {
            const v = variable(p.seriesId);
            return `<div style="display:flex;justify-content:space-between;gap:18px">${p.marker.replace('border-radius:10px', 'border-radius:3px')}<span style="flex:1">${v.corto}</span>` +
                   `<b>${fmt(p.value[2], v.decimales)} ${v.unidad}</b><span style="opacity:.6;width:38px;text-align:right">${Math.round(p.value[1])} %</span></div>`;
          });
          return `<div style="font-weight:600;margin-bottom:6px">${fechaHora(ps[0].value[0])}</div>${filas.join('') || 'Sin datos'}`;
        }
      },
      xAxis: {
        type: 'time', axisLine: { lineStyle: { color: g.ejes } }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: g.texto, hideOverlap: true, formatter: { year: '{dd}/{MM}', month: '{dd}/{MM}', day: '{dd}/{MM}', hour: '{HH}:{mm}', minute: '{HH}:{mm}' } }
      },
      yAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { color: g.texto, formatter: '{value} %' }, splitLine: { lineStyle: { color: g.rejilla } } },
      dataZoom: [
        { type: 'inside', filterMode: 'none', zoomOnMouseWheel: false, moveOnMouseMove: tactil, moveOnMouseWheel: false },
        { type: 'slider', filterMode: 'none', height: 20, bottom: 6, borderColor: 'transparent', backgroundColor: pal.ui.fondo2,
          fillerColor: alfa(pal.ui.acento, 0.18), handleStyle: { color: pal.ui.tarjetaAlta, borderColor: pal.ui.acento },
          moveHandleSize: 0, showDetail: false, brushSelect: false,
          dataBackground: { lineStyle: { color: g.fantasmaLinea }, areaStyle: { color: g.fantasma } },
          selectedDataBackground: { lineStyle: { color: pal.ui.acento }, areaStyle: { color: alfa(pal.ui.acento, 0.2) } } }
      ],
      series: visibles.map(s => ({
        id: s.campo, name: variable(s.campo).corto, type: 'line', data: s.puntos, symbol: 'none', smooth: 0.25,
        connectNulls: false, lineStyle: { width: 1.8, color: g.sensores[s.campo] }, itemStyle: { color: g.sensores[s.campo] },
        emphasis: { focus: 'series', lineStyle: { width: 2.6 } }
      }))
    }, { replaceMerge: ['series'] });
  }

  // ---------- Mapa de calor ----------
  function pintarCalor() {
    const pal = T.actual(), g = pal.graf, v = variable(estado.calor), color = g.sensores[v.campo];
    const m = A.mapaCalor(estado.lecturas, v.campo, estado.desde, estado.hasta);
    const alto = Math.max(220, m.dias.length * (tactil ? 18 : 22) + 90);
    $('grafica-calor').style.height = alto + 'px';
    const gr = grafica('grafica-calor');
    gr.resize();
    gr.setOption({
      ...base(pal),
      grid: { left: 8, right: 12, top: 8, bottom: 52, containLabel: true },
      tooltip: {
        ...estiloTooltip(pal),
        formatter: (p) => `<div style="font-weight:600;margin-bottom:4px">${fechaCorta(m.dias[p.value[1]])} · ${p2(p.value[0])}:00 a ${p2(p.value[0])}:59</div>` +
                          `${v.nombre} <b>${fmt(p.value[2], v.decimales)} ${v.unidad}</b><div style="opacity:.6;margin-top:2px">${p.value[3]} lecturas</div>`
      },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, h) => p2(h)), splitArea: { show: false },
               axisLabel: { color: g.texto, interval: tactil ? 2 : 0 }, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: 'category', data: m.dias.map(fechaCorta), inverse: true,
               axisLabel: { color: g.texto }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: {
        min: m.min ?? 0, max: m.max ?? 1, dimension: 2, calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
        itemWidth: 12, itemHeight: tactil ? 160 : 260, textStyle: { color: g.texto },
        formatter: (x) => `${Number(x).toFixed(v.decimales)} ${v.unidad}`,
        inRange: { color: [alfa(color, 0.06), alfa(color, 0.45), color] }
      },
      series: [{
        type: 'heatmap', data: m.celdas, progressive: 0,
        itemStyle: { borderColor: pal.ui.tarjeta, borderWidth: 2, borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: pal.ui.texto, borderWidth: 1 } }
      }]
    }, { notMerge: true });
  }

  // ---------- Hallazgos ----------
  const ICONOS = {
    ciclo: '<path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
    tendencia: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    correlacion: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    calidad: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    hueco: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M16.9 10.9a10 10 0 0 1 2.1 2M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/>',
    vacio: '<circle cx="12" cy="12" r="9"/>'
  };
  const TITULOS = { ciclo: 'Ciclo diario', tendencia: 'Tendencias entre días', correlacion: 'Relaciones entre variables',
                    calidad: 'Calidad de los datos', hueco: 'Periodos sin datos', vacio: 'Sin datos' };

  function pintarHallazgos() {
    const h = I.interpretar(estado.lecturas, C.variables);
    $('hallazgos').innerHTML = Object.keys(TITULOS).map(tipo => {
      const items = h.filter(x => x.tipo === tipo);
      if (!items.length) return '';
      return `<div class="grupo-hallazgo tipo-${tipo}">
        <div class="grupo-cab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[tipo]}</svg><h3>${TITULOS[tipo]}</h3></div>
        <ul>${items.map(x => `<li>${x.texto}</li>`).join('')}</ul></div>`;
    }).join('');
  }

  // ---------- Resumen estadístico ----------
  function pintarResumen() {
    const pal = T.actual(), total = estado.lecturas.length;
    $('tabla-resumen').querySelector('tbody').innerHTML = C.variables.map(v => {
      const r = E.resumen(E.valores(estado.lecturas, v.campo)), d = v.decimales;
      const pct = total ? 100 * r.n / total : 0;
      return `<tr>
        <th scope="row"><span class="punto" style="background:${pal.graf.sensores[v.campo]}"></span>${v.nombre} <span class="unidad">${v.unidad}</span>${v.nota ? `<span class="nota-tabla">${v.nota}</span>` : ''}</th>
        <td>${miles(r.n)}</td><td class="${pct < 95 ? 'alerta' : ''}">${fmt(pct, 1)} %</td>
        <td>${fmt(r.min, d)}</td><td>${fmt(r.p25, d)}</td><td>${fmt(r.mediana, d)}</td>
        <td><strong>${fmt(r.media, d)}</strong></td><td>${fmt(r.p75, d)}</td><td>${fmt(r.max, d)}</td><td>${fmt(r.desviacion, d + 1)}</td>
      </tr>`;
    }).join('');
  }

  // ---------- Matriz de correlación ----------
  function pintarMatriz() {
    const pal = T.actual(), g = pal.graf, vs = C.variables;
    const celdas = A.matrizCorrelacion(estado.lecturas, vs);
    const gr = grafica('grafica-matriz');
    gr.setOption({
      ...base(pal),
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...estiloTooltip(pal),
        formatter: (p) => {
          const [i, j, r, n] = p.value, a = vs[i], b = vs[j];
          if (i === j) return a.nombre;
          return `<div style="font-weight:600;margin-bottom:4px">${a.corto} y ${b.corto}</div>r = <b>${fmt(r, 2)}</b>, correlación ${E.fuerzaCorrelacion(r)}` +
                 `${r === null ? '' : r < 0 ? ' negativa' : ' positiva'}<div style="opacity:.6;margin-top:2px">${miles(n)} pares · clic para ver la dispersión</div>`;
        }
      },
      xAxis: { type: 'category', data: vs.map(v => v.corto), position: 'top', axisLabel: { color: g.texto, interval: 0, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: 'category', data: vs.map(v => v.corto), inverse: true, axisLabel: { color: g.texto, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: { show: false, min: -1, max: 1, dimension: 2,
                   inRange: { color: [g.sensores.humidity_pct, pal.ui.fondo2, g.sensores.temperature_c] } },
      series: [{
        type: 'heatmap', data: celdas.map(c => ({ value: c, cursor: c[0] === c[1] ? 'default' : 'pointer' })),
        label: { show: true, formatter: (p) => fmt(p.value[2], 2), fontSize: 12, fontWeight: 600,
                 color: pal.ui.texto },
        itemStyle: { borderColor: pal.ui.tarjeta, borderWidth: 3, borderRadius: 6 },
        emphasis: { itemStyle: { borderColor: pal.ui.texto, borderWidth: 1 } }
      }]
    }, { notMerge: true });
    gr.off('click');
    gr.on('click', (p) => {
      const [i, j] = p.value;
      if (i === j) return;
      estado.dispX = vs[i].campo; estado.dispY = vs[j].campo;
      $('disp-x').value = estado.dispX; $('disp-y').value = estado.dispY;
      pintarDispersion();
    });
  }

  // ---------- Dispersión ----------
  function pintarDispersion() {
    const pal = T.actual(), g = pal.graf;
    const vx = variable(estado.dispX), vy = variable(estado.dispY);
    const { xs, ys } = E.pares(estado.lecturas, vx.campo, vy.campo);
    const reg = E.regresion(xs, ys), r = E.pearson(xs, ys);
    const puntos = A.muestrear(xs, ys);
    let linea = [];
    if (reg && xs.length) {
      let a = Infinity, b = -Infinity;
      for (const x of xs) { if (x < a) a = x; if (x > b) b = x; }
      linea = [[a, reg.pendiente * a + reg.intercepto], [b, reg.pendiente * b + reg.intercepto]];
    }
    grafica('grafica-dispersion').setOption({
      ...base(pal),
      grid: { left: 8, right: 16, top: 34, bottom: 30, containLabel: true },
      tooltip: { ...estiloTooltip(pal), trigger: 'item',
        formatter: (p) => p.seriesType === 'line' ? 'Recta de regresión'
          : `${vx.corto} <b>${fmt(p.value[0], vx.decimales)} ${vx.unidad}</b><br>${vy.corto} <b>${fmt(p.value[1], vy.decimales)} ${vy.unidad}</b>` },
      xAxis: { type: 'value', scale: true, name: `${vx.corto} (${vx.unidad})`, nameLocation: 'middle', nameGap: 26,
               nameTextStyle: { color: g.texto }, axisLabel: { color: g.texto }, splitLine: { lineStyle: { color: g.rejilla } }, axisLine: { lineStyle: { color: g.ejes } } },
      yAxis: { type: 'value', scale: true, name: `${vy.corto} (${vy.unidad})`, nameTextStyle: { color: g.texto, align: 'left' },
               axisLabel: { color: g.texto }, splitLine: { lineStyle: { color: g.rejilla } } },
      series: [
        { type: 'scatter', data: puntos, symbolSize: 4, large: true, itemStyle: { color: alfa(g.sensores[vx.campo], 0.45) } },
        { type: 'line', data: linea, symbol: 'none', lineStyle: { color: pal.ui.texto, width: 2 }, z: 5 }
      ]
    }, { notMerge: true });
    $('nota-dispersion').textContent = (r === null || !reg)
      ? 'No hay datos suficientes para relacionar estas dos variables.'
      : `r = ${fmt(r, 2)} (correlación ${E.fuerzaCorrelacion(r)} ${r < 0 ? 'negativa' : 'positiva'}), R² = ${fmt(reg.r2, 2)}. ` +
        `En promedio, por cada ${vx.unidad} que sube ${art(vx)}, ${art(vy)} ${reg.pendiente < 0 ? 'baja' : 'sube'} ` +
        `${fmt(Math.abs(reg.pendiente), vy.decimales + 1)} ${vy.unidad}. ${miles(xs.length)} pares de lecturas.`;
  }

  function llenarSelect(id, valor) {
    $(id).innerHTML = C.variables.map(v => `<option value="${v.campo}">${v.nombre} (${v.unidad})</option>`).join('');
    $(id).value = valor;
  }

  // Pinta las secciones una por una, cediendo el turno al navegador entre cada
  // una. Así la página sigue respondiendo a los toques mientras se repinta, y
  // si una sección falla las demás se pintan igual.
  let turno = 0;
  function pintarTodo() {
    const mio = ++turno;
    const pasos = [pintarChips, pintarGeneral, pintarCalor, pintarHallazgos, pintarResumen, pintarMatriz, pintarDispersion];
    const siguiente = (i) => {
      if (mio !== turno || i >= pasos.length) return;
      try { pasos[i](); } catch (e) { console.error('BioRed, error al pintar una sección del análisis', e); }
      setTimeout(() => siguiente(i + 1), 0);
    };
    siguiente(0);
  }

  async function recargar() {
    try { await cargar(); pintarTodo(); }
    catch (e) { $('sub-analisis').textContent = 'No se pudieron cargar las lecturas del periodo. ' + e.message; }
  }

  function iniciar() {
    llenarSelect('disp-x', estado.dispX);
    llenarSelect('disp-y', estado.dispY);
    $('disp-x').addEventListener('change', (e) => { estado.dispX = e.target.value; pintarDispersion(); });
    $('disp-y').addEventListener('change', (e) => { estado.dispY = e.target.value; pintarDispersion(); });
    document.querySelectorAll('[data-dias]').forEach(b => b.addEventListener('click', () => {
      estado.dias = Number(b.dataset.dias);
      document.querySelectorAll('[data-dias]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      recargar();
    }));
    document.addEventListener('biored:tema', () => { if (estado.lecturas.length) pintarTodo(); });
    window.addEventListener('resize', () => Object.values(graficas).forEach(g => g.resize()));
    recargar();
    setInterval(recargar, 10 * 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
