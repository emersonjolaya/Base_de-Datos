/*
  BioRed v2 - Paletas por franja horaria

  La paleta cambia sola según la hora del dispositivo que abre la página.
    Día          06:30 a 17:29   Bosque claro
    Crepúsculo   05:30 a 06:29 y 17:30 a 18:29   Grafito azul
    Noche        18:30 a 05:29   Medianoche violeta

  El usuario puede fijar Día o Noche con el selector del encabezado.
  Cada vez que la paleta cambia se emite el evento 'biored:tema' para
  que las gráficas se vuelvan a pintar con los colores nuevos.
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.BioTema = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {

  // Límites de cada franja en minutos desde la medianoche
  const FRANJAS = {
    amanecer:  { desde: 5 * 60 + 30, hasta: 6 * 60 + 30 },    // 05:30 a 06:29
    atardecer: { desde: 17 * 60 + 30, hasta: 18 * 60 + 30 }   // 17:30 a 18:29
  };

  // Colores de cada paleta. "ui" alimenta las variables CSS y "graf" las gráficas,
  // porque ECharts dibuja en canvas y no puede leer variables CSS.
  const PALETAS = {
    dia: {
      id: 'dia', nombre: 'Bosque claro', franja: 'Día',
      ui: {
        fondo: '#E7EFE6', fondo2: '#DCE8DB', tarjeta: '#F6FAF4', tarjetaAlta: '#FFFFFF',
        borde: '#CFDDCD', texto: '#1C2B22', texto2: '#4A5E51', texto3: '#7A8C80',
        acento: '#2F7D4A', sobreAcento: '#FFFFFF', alerta: '#B5482C'
      },
      graf: {
        texto: '#4A5E51', ejes: '#B9CBB7', rejilla: '#DCE6DA', fantasma: 'rgba(74, 94, 81, 0.16)',
        fantasmaLinea: 'rgba(74, 94, 81, 0.35)', tooltip: '#FFFFFF',
        sensores: { temperature_c: '#D9603D', humidity_pct: '#2D7FC4', light_pct: '#B98208', co2_ppm: '#178F76', sound_db: '#B8487A',
                    co_ppm: '#4F6FD1', nh3_ppm: '#8A55C7', alcohol_ppm: '#C2702A', toluene_ppm: '#4C8F2E', acetone_ppm: '#C24A62' }
      }
    },
    crepusculo: {
      id: 'crepusculo', nombre: 'Grafito azul', franja: 'Crepúsculo',
      ui: {
        fondo: '#0F172A', fondo2: '#131D33', tarjeta: '#1A2438', tarjetaAlta: '#212D45',
        borde: '#2A3650', texto: '#E2E8F0', texto2: '#A7B3C6', texto3: '#7A889E',
        acento: '#38BDF8', sobreAcento: '#0F172A', alerta: '#F59E7A'
      },
      graf: {
        texto: '#A7B3C6', ejes: '#33405C', rejilla: '#243049', fantasma: 'rgba(148, 163, 184, 0.20)',
        fantasmaLinea: 'rgba(148, 163, 184, 0.40)', tooltip: '#212D45',
        sensores: { temperature_c: '#F28B6B', humidity_pct: '#5AB0F0', light_pct: '#F2C14E', co2_ppm: '#4FD1B5', sound_db: '#E07BB0',
                    co_ppm: '#7FA2FF', nh3_ppm: '#C79BFF', alcohol_ppm: '#FFB86B', toluene_ppm: '#8FE388', acetone_ppm: '#FF8FA3' }
      }
    },
    noche: {
      id: 'noche', nombre: 'Medianoche violeta', franja: 'Noche',
      ui: {
        fondo: '#14121D', fondo2: '#191624', tarjeta: '#201D30', tarjetaAlta: '#29253C',
        borde: '#332E4A', texto: '#ECE9F6', texto2: '#B3ADCB', texto3: '#857F9E',
        acento: '#A78BFA', sobreAcento: '#14121D', alerta: '#F59E7A'
      },
      graf: {
        texto: '#B3ADCB', ejes: '#3A3452', rejilla: '#2B2740', fantasma: 'rgba(170, 165, 195, 0.20)',
        fantasmaLinea: 'rgba(170, 165, 195, 0.40)', tooltip: '#29253C',
        sensores: { temperature_c: '#F28B6B', humidity_pct: '#5AB0F0', light_pct: '#F2C14E', co2_ppm: '#4FD1B5', sound_db: '#E07BB0',
                    co_ppm: '#7FA2FF', nh3_ppm: '#C79BFF', alcohol_ppm: '#FFB86B', toluene_ppm: '#8FE388', acetone_ppm: '#FF8FA3' }
      }
    }
  };

  const enRango = (m, f) => m >= f.desde && m < f.hasta;

  // Devuelve 'dia', 'crepusculo' o 'noche' para un minuto del día (0 a 1439)
  function faseDeMinuto(minuto) {
    const m = ((Math.floor(minuto) % 1440) + 1440) % 1440;
    if (enRango(m, FRANJAS.amanecer) || enRango(m, FRANJAS.atardecer)) return 'crepusculo';
    if (m >= FRANJAS.amanecer.hasta && m < FRANJAS.atardecer.desde) return 'dia';
    return 'noche';
  }

  const faseDeFecha = (fecha) => faseDeMinuto(fecha.getHours() * 60 + fecha.getMinutes());

  // Minutos que faltan para el próximo cambio de franja, para mostrarlo en el encabezado
  function proximoCambio(minuto) {
    const actual = faseDeMinuto(minuto);
    for (let i = 1; i <= 1440; i++) {
      const f = faseDeMinuto(minuto + i);
      if (f !== actual) return { minutos: i, fase: f };
    }
    return null;
  }

  // Modo elegido: 'auto' sigue la hora, 'dia' y 'noche' la fijan
  const MODOS = ['auto', 'dia', 'noche'];

  function faseEfectiva(modo, fecha) {
    return modo === 'auto' ? faseDeFecha(fecha) : modo;
  }

  // ---------- Parte del navegador ----------
  let modo = 'auto', faseActual = null, reloj = null;

  function leerModoGuardado() {
    try { const m = localStorage.getItem('biored.modoTema'); return MODOS.includes(m) ? m : 'auto'; } catch (e) { return 'auto'; }
  }
  function guardarModo(m) {
    try { localStorage.setItem('biored.modoTema', m); } catch (e) { /* sin almacenamiento, se usa el modo por defecto */ }
  }

  function aplicarVariables(p) {
    const r = document.documentElement.style;
    for (const [k, v] of Object.entries(p.ui)) r.setProperty('--' + k, v);
    document.documentElement.dataset.tema = p.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.ui.fondo);
  }

  // Marca el botón del modo elegido en el encabezado
  function marcarBotones() {
    document.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
  }

  // El fondo, las tarjetas y el botón cambian de inmediato. Las gráficas se
  // repintan después de que el navegador muestre ese cambio, para que en un
  // celular el toque responda al instante aunque el repintado tarde un poco.
  let pendiente = null;
  function actualizar(forzar) {
    const fase = faseEfectiva(modo, new Date());
    marcarBotones();
    if (fase === faseActual && !forzar) return;
    faseActual = fase;
    aplicarVariables(PALETAS[fase]);
    if (pendiente) clearTimeout(pendiente);
    const emitir = () => {
      pendiente = setTimeout(() => {
        pendiente = null;
        document.dispatchEvent(new CustomEvent('biored:tema', { detail: { paleta: PALETAS[faseActual], modo } }));
      }, 0);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(emitir); else emitir();
  }

  function iniciar() {
    modo = leerModoGuardado();
    actualizar(true);
    // Revisa la hora cada 30 segundos para cambiar de franja sin recargar
    if (reloj) clearInterval(reloj);
    reloj = setInterval(() => actualizar(false), 30000);
  }

  function fijarModo(m) {
    if (!MODOS.includes(m)) return;
    modo = m;
    guardarModo(m);
    actualizar(true);
  }

  return {
    PALETAS, FRANJAS, MODOS,
    faseDeMinuto, faseDeFecha, proximoCambio, faseEfectiva,
    iniciar, fijarModo,
    modo: () => modo,
    actual: () => PALETAS[faseActual || 'dia']
  };
});
