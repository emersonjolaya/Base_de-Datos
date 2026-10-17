/*
  BioRed v2 - Lógica de la página (Fase 3)

  Gráfico principal en tiempo real
    Hoy en color sobre la curva gris del periodo de comparación
    Tooltip con hoy, el periodo elegido y la diferencia
    Zoom arrastrando sobre la gráfica, doble clic para volver.
    En pantallas táctiles, barra de zoom debajo de la gráfica
    Límites del rango normal del sensor
  Tarjetas KPI con valor actual, diferencia, sparkline de 3 horas y alertas
*/
(function () {
  const C = window.BIORED_CONFIG;
  const T = window.BioTema;
  const D = window.BioDatos;
  const S = window.BioSimulador;
  const U = window.BioSerie;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const hhmm = (m) => `${p2(Math.floor(m / 60) % 24)}:${p2(Math.floor(m % 60))}`;
  const hhmmT = (t) => { const f = new Date(t); return `${p2(f.getHours())}:${p2(f.getMinutes())}`; };
  const hhmmss = (t) => { const f = new Date(t); return `${p2(f.getHours())}:${p2(f.getMinutes())}:${p2(f.getSeconds())}`; };
  const GASES = C.gases || [];
  const TODAS = [...C.variables, ...GASES];
  const variable = (campo) => TODAS.find(v => v.campo === campo);
  const CO2 = 'co2_ppm';
  const tactil = window.matchMedia('(pointer: coarse)').matches;

  const PERIODOS = {
    dia:    { nombre: 'Ayer',          fecha: (t) => t - S.DIA },
    semana: { nombre: 'Hace 1 semana', fecha: (t) => t - 7 * S.DIA },
    mes:    { nombre: 'Hace 1 mes',    fecha: (t) => { const f = new Date(t); f.setMonth(f.getMonth() - 1); return f.getTime(); } }
  };

  const estado = {
    sensor: 'temperature_c',
    periodo: 'dia',
    inicioHoy: S.inicioDia(Date.now()),
    hoy: [],
    comparacion: {},
    ultimaT: null,
    zoom: null,             // [minutoInicio, minutoFin] o null si se ve el día completo
    gases: leerGases(),     // gases extra que el usuario agregó a la tarjeta del MQ-135
    gasPrincipal: CO2       // gas que se ve en grande en la tarjeta
  };
  let grafica = null;

  // Preferencia de gases guardada en el navegador
  function leerGases() {
    try {
      const g = JSON.parse(localStorage.getItem('biored.gases') || '[]');
      return Array.isArray(g) ? g.filter(c => (C.gases || []).some(x => x.campo === c)) : [];
    } catch (e) { return []; }
  }
  function guardarGases() {
    try { localStorage.setItem('biored.gases', JSON.stringify(estado.gases)); } catch (e) { /* sin almacenamiento */ }
  }

  const comp = () => estado.comparacion[estado.periodo] || [];
  const nombreComp = () => PERIODOS[estado.periodo].nombre;

  // ---------- Carga ----------
  async function cargarComparacion(periodo) {
    if (!estado.comparacion[periodo]) {
      estado.comparacion[periodo] = await D.cargarDia(C, PERIODOS[periodo].fecha(estado.inicioHoy + S.DIA / 2));
    }
    return estado.comparacion[periodo];
  }

  async function cargarTodo() {
    estado.inicioHoy = S.inicioDia(Date.now());
    estado.comparacion = {};
    estado.hoy = await D.cargarDia(C, Date.now());
    estado.ultimaT = estado.hoy.length ? estado.hoy.at(-1).t : estado.inicioHoy;
    await cargarComparacion(estado.periodo);
  }

  async function actualizarEnVivo() {
    try {
      if (S.inicioDia(Date.now()) !== estado.inicioHoy) { await cargarTodo(); pintarTodo(); return; }
      const llegaron = await D.nuevas(C, estado.ultimaT);
      if (llegaron.length) {
        estado.hoy.push(...llegaron);
        estado.ultimaT = llegaron.at(-1).t;
        pintarKpis();
        pintarResumenDia();
        pintarGrafica();
      }
      pintarEstado();
    } catch (e) {
      mostrarError('No se pudieron consultar las lecturas nuevas. ' + e.message);
    }
  }

  // ---------- Encabezado y estado ----------
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function duracion(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  }

  function pintarReloj() {
    const f = new Date(), m = f.getHours() * 60 + f.getMinutes();
    const pal = T.actual(), prox = T.proximoCambio(m);
    $('reloj').innerHTML = `<span>${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}</span>` +
      `<strong class="num">${p2(f.getHours())}:${p2(f.getMinutes())}</strong>`;
    $('pie-paleta').textContent = T.modo() === 'auto'
      ? `Paleta ${pal.nombre} (${pal.franja.toLowerCase()}). Cambia a ${T.PALETAS[prox.fase].nombre} en ${duracion(prox.minutos)}.`
      : `Paleta ${pal.nombre}, fijada manualmente.`;
  }

  function pintarEstado() {
    if (!estado.ultimaT) return;
    const seg = Math.max(0, Math.round((Date.now() - estado.ultimaT) / 1000));
    const hace = seg < 60 ? `hace ${seg} s` : `hace ${duracion(Math.round(seg / 60))}`;
    const atrasado = seg > C.intervaloActualizacionS * 4;
    $('estado-vivo').className = 'estado-vivo' + (atrasado ? ' atrasado' : '');
    $('estado-vivo').textContent = atrasado
      ? `Sin lecturas nuevas desde las ${hhmmss(estado.ultimaT)} (${hace})`
      : `Última lectura ${hhmmss(estado.ultimaT)} · ${hace} · ${estado.hoy.length} lecturas hoy`;
  }

  function mostrarError(msg) {
    $('estado-vivo').className = 'estado-vivo atrasado';
    $('estado-vivo').textContent = msg;
  }

  function pintarSelectorTema() {
    document.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === T.modo())));
  }

  // Mínimo, máximo y promedio de hoy del sensor elegido
  function pintarResumenDia() {
    const v = variable(estado.sensor), r = U.resumen(estado.hoy, v.campo), d = v.decimales;
    $('resumen-dia').innerHTML = r.n
      ? `<span>Mín. hoy <b>${r.min.toFixed(d)}</b> <small>${hhmmT(r.tMin)}</small></span>` +
        `<span>Máx. hoy <b>${r.max.toFixed(d)}</b> <small>${hhmmT(r.tMax)}</small></span>` +
        `<span>Promedio <b>${r.media.toFixed(d)}</b> <small>${v.unidad}</small></span>`
      : '<span>Sin lecturas válidas hoy</span>';
  }

  // ---------- Tarjetas KPI ----------
  // Valor actual, diferencia contra el periodo, alerta de rango y sparkline de una variable
  function datosTarjeta(v) {
    const c = comp();
    const u = U.ultimoValido(estado.hoy, v.campo);
    const ultima = estado.hoy.at(-1);
    const sinResponder = ultima && ultima[v.campo] === null && v.campoValidez;
    let valor = '—', delta = 'Sin dato válido hoy', rango = 'normal', numero = null;
    if (u) {
      numero = u[v.campo];
      valor = `${numero.toFixed(v.decimales)}<small>${v.unidad}</small>`;
      rango = U.estadoRango(numero, v.rango);
      const antes = U.valorEnMinuto(c, v.campo, U.minutoDelDia(u.t));
      if (antes === null) delta = `Sin dato de ${nombreComp().toLowerCase()} a esta hora`;
      else {
        const dif = numero - antes;
        delta = `${dif > 0 ? '▲' : dif < 0 ? '▼' : '='} ${Math.abs(dif).toFixed(v.decimales)} vs ${nombreComp().toLowerCase()}`;
      }
    }
    if (sinResponder) delta = `<span class="aviso">Sensor sin responder${u ? ', último dato ' + hhmmT(u.t) : ''}</span>`;
    const insignia = rango === 'alto' ? `<span class="pastilla">Alto · máx. ${v.rango.max}</span>`
                   : rango === 'bajo' ? `<span class="pastilla">Bajo · mín. ${v.rango.min}</span>` : '';
    const trazo = U.trazoSvg(U.sparkline(estado.hoy, v.campo, estado.ultimaT || Date.now()));
    return { valor, delta, rango, insignia, trazo, numero };
  }

  function tarjetaSimple(v, pal) {
    const d = datosTarjeta(v);
    return `<button type="button" class="kpi${d.rango !== 'normal' ? ' fuera' : ''}" data-campo="${v.campo}" aria-pressed="${v.campo === estado.sensor}" style="--color-sensor:${pal.graf.sensores[v.campo]}">
        <div class="kpi-nombre"><i></i>${v.corto}${d.insignia}</div>
        <div class="kpi-valor">${d.valor}</div>
        <div class="kpi-delta">${d.delta}</div>
        <svg class="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="${d.trazo}"/></svg>
      </button>`;
  }

  // Tarjeta del MQ-135. Muestra un gas en grande y, si el usuario agregó más,
  // una lista compacta. Tocar un gas de la lista lo pasa al gráfico principal.
  function tarjetaGases(pal) {
    const activos = [CO2, ...estado.gases];
    if (!activos.includes(estado.gasPrincipal)) estado.gasPrincipal = CO2;
    const p = variable(estado.gasPrincipal), d = datosTarjeta(p);
    const resto = activos.filter(c => c !== p.campo).map(variable);
    const seleccionada = activos.includes(estado.sensor);
    const filas = resto.map(g => {
      const dg = datosTarjeta(g);
      return `<button type="button" class="gas-fila${g.campo === estado.sensor ? ' activa' : ''}" data-gas="${g.campo}" style="--color-gas:${pal.graf.sensores[g.campo]}">
          <span><i></i>${g.corto}</span><b>${dg.numero === null ? '—' : dg.numero.toFixed(g.decimales)}</b></button>`;
    }).join('');
    return `<div class="kpi kpi-gases${d.rango !== 'normal' ? ' fuera' : ''}${resto.length ? ' con-lista' : ''}" role="group" aria-label="Gases del MQ-135" aria-pressed="${seleccionada}" style="--color-sensor:${pal.graf.sensores[p.campo]}">
        <div class="kpi-nombre"><i></i><span class="gas-titulo">${p.corto}</span>${d.insignia}
          <button type="button" class="boton-gas" id="boton-gas" aria-haspopup="true" aria-expanded="false" title="Elegir qué gases ver">+ Agregar gas</button></div>
        <button type="button" class="gas-principal" data-gas="${p.campo}" aria-label="Ver ${p.nombre} en el gráfico">
          <div class="kpi-valor">${d.valor}</div>
          <div class="kpi-delta">${d.delta}</div>
        </button>
        ${resto.length ? `<div class="gas-lista">${filas}</div>`
                       : `<svg class="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="${d.trazo}"/></svg>`}
      </div>`;
  }

  function seleccionar(campo) {
    estado.sensor = campo;
    pintarKpis();
    pintarResumenDia();
    pintarGrafica();
  }

  function pintarKpis() {
    const pal = T.actual();
    $('kpis').classList.toggle('con-gases', estado.gases.length > 0);
    $('kpis').innerHTML = C.variables.map(v => v.campo === CO2 ? tarjetaGases(pal) : tarjetaSimple(v, pal)).join('');
    document.querySelectorAll('button.kpi').forEach(b => b.addEventListener('click', () => seleccionar(b.dataset.campo)));
    document.querySelectorAll('.gas-principal').forEach(b => b.addEventListener('click', () => seleccionar(b.dataset.gas)));
    document.querySelectorAll('.gas-fila').forEach(b => b.addEventListener('click', () => {
      estado.gasPrincipal = b.dataset.gas;
      seleccionar(b.dataset.gas);
    }));
    const boton = $('boton-gas');
    if (boton) boton.addEventListener('click', (e) => { e.stopPropagation(); alternarMenuGases(); });
    if (menuAbierto) ubicarMenu();
  }

  // ---------- Menú "Agregar gas" ----------
  let menuAbierto = false;

  function pintarMenuGases() {
    const pal = T.actual(), m = $('menu-gases');
    m.innerHTML = `<div class="menu-cab"><b>Lecturas del MQ-135</b><button type="button" class="menu-cerrar" aria-label="Cerrar">×</button></div>
      <p>Todas salen de la misma resistencia del sensor, por eso suben y bajan juntas. Son valores orientativos.</p>
      <div class="chips">
        <span class="chip fijo" aria-pressed="true" style="--color-sensor:${pal.graf.sensores[CO2]}" title="El CO2 siempre está visible"><i></i>CO2 est.</span>
        ${GASES.map(g => `<button type="button" class="chip" data-gas="${g.campo}" aria-pressed="${estado.gases.includes(g.campo)}" style="--color-sensor:${pal.graf.sensores[g.campo]}"><i></i>${g.corto}</button>`).join('')}
      </div>
      <div class="menu-pie"><button type="button" class="boton-suave" data-accion="todos">Agregar todos</button><button type="button" class="boton-suave" data-accion="ninguno">Solo CO2</button></div>`;
    m.querySelector('.menu-cerrar').addEventListener('click', cerrarMenuGases);
    m.querySelectorAll('.chip[data-gas]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.gas;
      estado.gases = estado.gases.includes(c) ? estado.gases.filter(x => x !== c) : GASES.map(g => g.campo).filter(x => x === c || estado.gases.includes(x));
      cambioDeGases();
    }));
    m.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', () => {
      estado.gases = b.dataset.accion === 'todos' ? GASES.map(g => g.campo) : [];
      cambioDeGases();
    }));
  }

  function cambioDeGases() {
    guardarGases();
    const activos = [CO2, ...estado.gases];
    // Si se quitó el gas que estaba en el gráfico, el gráfico vuelve al CO2
    if (!activos.includes(estado.gasPrincipal)) estado.gasPrincipal = CO2;
    if (variable(estado.sensor) && GASES.some(g => g.campo === estado.sensor) && !activos.includes(estado.sensor)) {
      estado.sensor = CO2; pintarResumenDia(); pintarGrafica();
    }
    pintarMenuGases();
    pintarKpis();
  }

  function ubicarMenu() {
    const m = $('menu-gases'), b = $('boton-gas'), panel = m.parentElement;
    if (!b) return;
    const rp = panel.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ancho = Math.min(320, rp.width - 24);
    let x = rb.right - rp.left - ancho;
    x = Math.max(12, Math.min(x, rp.width - ancho - 12));
    m.style.width = ancho + 'px';
    m.style.left = x + 'px';
    m.style.top = (rb.bottom - rp.top + 8) + 'px';
    b.setAttribute('aria-expanded', 'true');
  }

  function alternarMenuGases() { menuAbierto ? cerrarMenuGases() : abrirMenuGases(); }
  function abrirMenuGases() {
    menuAbierto = true;
    pintarMenuGases();
    $('menu-gases').hidden = false;
    ubicarMenu();
  }
  function cerrarMenuGases() {
    menuAbierto = false;
    $('menu-gases').hidden = true;
    const b = $('boton-gas'); if (b) b.setAttribute('aria-expanded', 'false');
  }

  // ---------- Gráfica principal ----------
  function alfa(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // Tooltip con hoy, el periodo de comparación y la diferencia en la misma caja
  function tooltip(params) {
    const v = variable(estado.sensor), pal = T.actual(), g = pal.graf;
    const minuto = params[0].value[0];
    const lh = U.lecturaEnMinuto(estado.hoy, minuto);
    const hoy = lh && minuto <= U.minutoDelDia(estado.ultimaT) + U.HUECO_MIN ? lh[v.campo] : null;
    const antes = U.valorEnMinuto(comp(), v.campo, minuto);
    const f = (x) => x === null ? '<span style="opacity:.6">sin dato</span>' : `<b>${x.toFixed(v.decimales)}</b> ${v.unidad}`;
    const fila = (color, nombre, valor) =>
      `<div style="display:flex;justify-content:space-between;gap:18px;align-items:center">
         <span><i style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${color};margin-right:6px;vertical-align:middle"></i>${nombre}</span><span>${valor}</span></div>`;
    let html = `<div style="font-weight:600;margin-bottom:6px">${hhmm(minuto)}</div>` +
      fila(g.sensores[estado.sensor], 'Hoy', f(hoy)) + fila(g.fantasmaLinea, nombreComp(), f(antes));
    if (hoy !== null && antes !== null) {
      const dif = hoy - antes;
      html += `<div style="border-top:1px solid ${pal.ui.borde};margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;gap:18px">
                 <span>Diferencia</span><b>${dif > 0 ? '▲ +' : dif < 0 ? '▼ −' : ''}${Math.abs(dif).toFixed(v.decimales)} ${v.unidad}</b></div>`;
    }
    const r = U.estadoRango(hoy, v.rango);
    if (r !== 'normal') html += `<div style="margin-top:6px;color:${pal.ui.alerta};font-weight:600">Fuera del rango normal (${r === 'alto' ? 'máx. ' + v.rango.max : 'mín. ' + v.rango.min} ${v.unidad})</div>`;
    return html;
  }

  // Líneas de los límites del rango normal
  function lineasRango(v, pal, visibles) {
    if (!v.rango) return [];
    const estilo = { color: pal.ui.alerta, type: [4, 4], width: 1, opacity: 0.7 };
    const etiqueta = (t) => ({ formatter: t, position: 'insideEndTop', color: pal.ui.alerta, fontSize: 11 });
    const l = [];
    if (v.rango.max !== undefined && visibles.includes(v.rango.max)) l.push({ yAxis: v.rango.max, lineStyle: estilo, label: etiqueta(`Máx. ${v.rango.max} ${v.unidad}`) });
    if (v.rango.min !== undefined && visibles.includes(v.rango.min)) l.push({ yAxis: v.rango.min, lineStyle: estilo, label: etiqueta(`Mín. ${v.rango.min} ${v.unidad}`) });
    return l;
  }

  function pintarGrafica() {
    const pal = T.actual(), g = pal.graf, v = variable(estado.sensor), color = g.sensores[estado.sensor];
    const hoy = U.puntos(estado.hoy, v.campo);
    const antes = U.puntos(comp(), v.campo);
    const u = U.ultimoValido(estado.hoy, v.campo);
    const ahora = u ? [[U.minutoDelDia(u.t), u[v.campo]]] : [];
    const visible = estado.zoom ? estado.zoom[1] - estado.zoom[0] : 1440;
    const [zA, zB] = estado.zoom || [0, 1440];
    const enVista = (pts) => pts.filter(q => q[0] >= zA && q[0] <= zB).map(q => q[1]);
    const umbrales = v.rango ? [v.rango.min, v.rango.max].filter(x => x !== undefined) : [];
    const ey = U.ejeY([...enVista(hoy), ...enVista(antes)], umbrales);
    const rangoZoom = estado.zoom ? { startValue: estado.zoom[0], endValue: estado.zoom[1] } : { start: 0, end: 100 };

    $('titulo-sensor').textContent = `${v.nombre} · tiempo real`;
    $('leyenda-principal').innerHTML =
      `<span><i style="background:${color}"></i>Hoy</span>` +
      `<span><i style="background:${g.fantasmaLinea}"></i>${nombreComp()}</span>` +
      (v.rango ? `<span><i class="discontinua" style="border-color:${pal.ui.alerta}"></i>Rango normal</span>` : '') +
      (v.nota ? `<span>${v.nota}</span>` : '');
    $('restablecer-zoom').hidden = !estado.zoom;

    if (!grafica) crearGrafica();

    grafica.setOption({
      animationDurationUpdate: 550, animationEasingUpdate: 'cubicInOut',
      textStyle: { fontFamily: 'Inter, Segoe UI, sans-serif', color: g.texto },
      grid: { left: 8, right: 16, top: 20, bottom: tactil ? 44 : 8, containLabel: true },
      tooltip: {
        trigger: 'axis', backgroundColor: g.tooltip, borderColor: pal.ui.borde, borderWidth: 1, padding: [10, 12],
        textStyle: { color: pal.ui.texto, fontSize: 12, fontFamily: 'Inter, Segoe UI, sans-serif' },
        extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);min-width:190px',
        axisPointer: { type: 'line', lineStyle: { color: g.ejes, type: 'dashed' } },
        formatter: tooltip
      },
      xAxis: {
        type: 'value', min: 0, max: 1440, interval: U.intervaloEje(visible),
        axisLabel: { color: g.texto, formatter: (m) => hhmm(m), hideOverlap: true },
        axisLine: { lineStyle: { color: g.ejes } }, axisTick: { show: false }, splitLine: { show: false },
        axisPointer: { label: { show: false } }
      },
      yAxis: {
        type: 'value', min: ey.min ?? undefined, max: ey.max ?? undefined, interval: ey.paso ?? undefined,
        axisLabel: { color: g.texto, formatter: (x) => +x.toFixed(4) }, splitLine: { lineStyle: { color: g.rejilla } }
      },
      dataZoom: [
        { id: 'zi', type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false, ...rangoZoom },
        { id: 'zs', type: 'slider', xAxisIndex: 0, filterMode: 'none', show: tactil, ...rangoZoom, height: 22, bottom: 6,
          borderColor: 'transparent', backgroundColor: pal.ui.fondo2, fillerColor: alfa(pal.ui.acento, 0.18),
          dataBackground: { lineStyle: { color: g.fantasmaLinea }, areaStyle: { color: g.fantasma } },
          selectedDataBackground: { lineStyle: { color }, areaStyle: { color: alfa(color, 0.25) } },
          handleStyle: { color: pal.ui.tarjetaAlta, borderColor: pal.ui.acento }, moveHandleSize: 0,
          textStyle: { color: g.texto }, labelFormatter: (m) => hhmm(m), brushSelect: false }
      ],
      series: [
        { id: 'comp', name: nombreComp(), type: 'line', data: antes, smooth: 0.3, symbol: 'none', z: 1, connectNulls: false,
          lineStyle: { color: g.fantasmaLinea, width: 1 }, itemStyle: { color: g.fantasmaLinea },
          areaStyle: { color: g.fantasma }, emphasis: { disabled: true } },
        { id: 'hoy', name: 'Hoy', type: 'line', data: hoy, smooth: 0.3, symbol: 'none', z: 3, connectNulls: false,
          lineStyle: { color, width: 2.4 }, itemStyle: { color }, emphasis: { disabled: true },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: alfa(color, 0.38) }, { offset: 1, color: alfa(color, 0.02) }]) },
          markLine: { silent: true, symbol: 'none', animation: false, data: lineasRango(v, pal, ey.umbrales) } },
        { id: 'ahora', name: 'ahora', type: 'effectScatter', data: ahora, z: 4,
          symbolSize: 9, itemStyle: { color, borderColor: pal.ui.tarjeta, borderWidth: 2 },
          rippleEffect: { scale: 3.2, brushType: 'stroke', period: 2.5, color }, tooltip: { show: false } }
      ]
    });
  }

  // ---------- Zoom por arrastre ----------
  function aplicarZoom(desde, hasta) {
    if (desde === null) {
      estado.zoom = null;
      grafica.dispatchAction({ type: 'dataZoom', dataZoomId: 'zi', start: 0, end: 100 });
    } else {
      estado.zoom = [Math.max(0, desde), Math.min(1440, hasta)];
      grafica.dispatchAction({ type: 'dataZoom', dataZoomId: 'zi', startValue: estado.zoom[0], endValue: estado.zoom[1] });
    }
  }

  function crearGrafica() {
    grafica = echarts.init($('grafica-principal'), null, { renderer: 'canvas' });
    const zr = grafica.getZr();
    let inicioX = null;

    const rectGrid = () => grafica.getModel().getComponent('grid').coordinateSystem.getRect();
    const aMinuto = (x) => grafica.convertFromPixel({ xAxisIndex: 0 }, x);

    let hayRect = false;
    function dibujarSeleccion(x0, x1) {
      const r = rectGrid(), pal = T.actual();
      hayRect = true;
      grafica.setOption({ graphic: [{ id: 'seleccion', type: 'rect', silent: true, z: 100,
        shape: { x: Math.min(x0, x1), y: r.y, width: Math.abs(x1 - x0), height: r.height },
        style: { fill: alfa(pal.ui.acento, 0.12), stroke: pal.ui.acento, lineWidth: 1 } }] });
    }
    const quitarSeleccion = () => {
      if (hayRect) grafica.setOption({ graphic: [{ id: 'seleccion', $action: 'remove' }] });
      hayRect = false;
    };

    if (!tactil) {
      zr.on('mousedown', (e) => {
        if (e.event.button !== 0 || !grafica.containPixel('grid', [e.offsetX, e.offsetY])) return;
        inicioX = e.offsetX;
      });
      zr.on('mousemove', (e) => {
        if (inicioX === null) return;
        const r = rectGrid();
        dibujarSeleccion(inicioX, Math.min(r.x + r.width, Math.max(r.x, e.offsetX)));
      });
      const terminar = (e) => {
        if (inicioX === null) return;
        const r = rectGrid(), x1 = Math.min(r.x + r.width, Math.max(r.x, e.offsetX));
        if (Math.abs(x1 - inicioX) > 8) {
          const a = aMinuto(Math.min(inicioX, x1)), b = aMinuto(Math.max(inicioX, x1));
          if (b - a >= 5) aplicarZoom(a, b);
        }
        const huboArrastre = hayRect;
        inicioX = null;
        quitarSeleccion();
        if (huboArrastre) pintarGrafica();
      };
      zr.on('mouseup', terminar);
      zr.on('globalout', (e) => { if (inicioX !== null) terminar(e); });
      zr.on('dblclick', () => { aplicarZoom(null); pintarGrafica(); });
    }

    // La barra táctil también actualiza el estado del zoom y las marcas del eje
    grafica.on('datazoom', () => {
      const dz = grafica.getOption().dataZoom[0];
      const completo = dz.start <= 0.01 && dz.end >= 99.99;
      const a = completo ? 0 : dz.startValue, b = completo ? 1440 : dz.endValue;
      const nuevo = completo ? null : [a, b];
      const cambio = JSON.stringify(nuevo) !== JSON.stringify(estado.zoom);
      estado.zoom = nuevo;
      if (cambio) pintarGrafica();
    });
  }

  function pintarTodo() {
    pintarSelectorTema();
    pintarReloj();
    pintarKpis();
    pintarResumenDia();
    pintarGrafica();
    pintarEstado();
  }

  // ---------- Inicio y eventos ----------
  async function iniciar() {
    $('fuente').textContent = C.apiUrl ? 'Datos de la API' : 'Datos de demostración';
    $('ayuda-zoom').textContent = tactil ? 'Usa la barra de abajo para acercar' : 'Arrastra sobre la gráfica para acercar · doble clic para volver';
    document.addEventListener('biored:tema', () => { if (estado.ultimaT) pintarTodo(); if (menuAbierto) pintarMenuGases(); });
    T.iniciar();

    document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => T.fijarModo(b.dataset.modo)));
    document.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', async () => {
      estado.periodo = b.dataset.periodo;
      document.querySelectorAll('[data-periodo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      await cargarComparacion(estado.periodo);
      pintarKpis();
      pintarGrafica();
    }));
    $('restablecer-zoom').addEventListener('click', () => { aplicarZoom(null); pintarGrafica(); });
    document.addEventListener('click', (e) => {
      if (!menuAbierto) return;
      const ruta = e.composedPath();
      if (!ruta.includes($('menu-gases')) && !ruta.some(n => n.id === 'boton-gas')) cerrarMenuGases();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuAbierto) cerrarMenuGases(); });
    $('kpis').addEventListener('scroll', () => { if (menuAbierto) ubicarMenu(); }, { passive: true });
    window.addEventListener('resize', () => { if (grafica) grafica.resize(); if (menuAbierto) ubicarMenu(); });

    try {
      $('estado-vivo').textContent = 'Cargando lecturas...';
      await cargarTodo();
      pintarTodo();
      await actualizarEnVivo();   // completa los minutos entre la última lectura del histórico y ahora
    } catch (e) {
      mostrarError('No se pudieron cargar los datos. ' + e.message);
    }

    setInterval(actualizarEnVivo, C.intervaloActualizacionS * 1000);
    setInterval(() => { pintarEstado(); pintarReloj(); }, 1000);
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
