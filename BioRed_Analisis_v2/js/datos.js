/*
  BioRed v2 - Adaptador de datos

  Es la única parte del módulo que sabe de dónde vienen los datos.
  Si config.apiUrl tiene una dirección, consulta la API. Si no, usa el
  simulador. El resto del módulo no cambia en ningún caso.

  El contrato con la API es el mismo de la v1, un solo endpoint
    GET {apiUrl}/lecturas?device_uid=...&desde=AAAA-MM-DD HH:MM:SS&hasta=AAAA-MM-DD HH:MM:SS

  Funciones
    cargarDia(config, fechaMs)       lecturas de un día completo, o hasta ahora si es hoy
    cargarRango(config, desde, hasta) lecturas entre dos fechas (secciones de análisis)
    nuevas(config, despuesDeMs)      lecturas que llegaron después de la última que se tiene
*/
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./simulador.js'));
  else raiz.BioDatos = fabrica(raiz.BioSimulador);
})(typeof self !== 'undefined' ? self : this, function (S) {

  const p2 = (n) => String(n).padStart(2, '0');
  const aMs = (texto) => new Date(texto.replace(' ', 'T')).getTime();
  const aTexto = (ms) => {
    const f = new Date(ms);
    return `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())} ${p2(f.getHours())}:${p2(f.getMinutes())}:${p2(f.getSeconds())}`;
  };

  // MySQL puede entregar las banderas como 0 y 1, y los DECIMAL como texto
  const esInvalido = (x) => x === false || x === 0 || x === '0';
  const aNumero = (x) => (x === null || x === undefined || x === '') ? null : (Number.isFinite(Number(x)) ? Number(x) : null);

  // Agrega la fecha en milisegundos (t), convierte los valores a número
  // y anula los valores marcados como inválidos
  function normalizar(lecturas, variables) {
    return lecturas.map(l => {
      const r = { ...l, t: aMs(l.received_at) };
      for (const v of variables) {
        r[v.campo] = aNumero(l[v.campo]);
        if (v.campoValidez) {
          r[v.campoValidez] = esInvalido(l[v.campoValidez]) ? false : (l[v.campoValidez] == null ? null : true);
          if (r[v.campoValidez] === false) r[v.campo] = null;
        }
      }
      return r;
    }).sort((a, b) => a.t - b.t);
  }

  // Variables y gases sin repetir, para normalizar todos los campos numéricos
  const camposDe = (config) => {
    const vistos = new Set();
    return [...config.variables, ...(config.gases || [])].filter(v => !vistos.has(v.campo) && vistos.add(v.campo));
  };

  async function pedirApi(config, desdeMs, hastaMs) {
    const url = `${config.apiUrl.replace(/\/$/, '')}/lecturas` +
                `?device_uid=${encodeURIComponent(config.deviceUid)}` +
                `&desde=${encodeURIComponent(aTexto(desdeMs))}&hasta=${encodeURIComponent(aTexto(hastaMs))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`La API respondió con el código ${res.status}`);
    const json = await res.json();
    return json.lecturas || [];
  }

  // Lecturas crudas entre dos fechas, desde la API o desde el simulador
  async function crudas(config, desdeMs, hastaMs, ahora) {
    const hasta = Math.min(hastaMs, ahora);
    if (hasta < desdeMs) return [];
    if (config.apiUrl) return pedirApi(config, desdeMs, hasta);
    return S.generar(desdeMs, hasta);
  }

  async function cargarRango(config, desdeMs, hastaMs, ahora = Date.now()) {
    return normalizar(await crudas(config, desdeMs, hastaMs, ahora), camposDe(config));
  }

  async function cargarDia(config, fechaMs, ahora = Date.now()) {
    const ini = S.inicioDia(fechaMs);
    return cargarRango(config, ini, ini + S.DIA - 1000, ahora);
  }

  // Lecturas posteriores a despuesDeMs. En modo demostración la estación
  // "envía" una lectura cada config.intervaloActualizacionS segundos.
  async function nuevas(config, despuesDeMs, ahora = Date.now()) {
    if (config.apiUrl) {
      const l = await pedirApi(config, despuesDeMs + 1000, ahora);
      return normalizar(l, camposDe(config)).filter(x => x.t > despuesDeMs);
    }
    const paso = config.intervaloActualizacionS * 1000;
    // Si la pestaña estuvo en segundo plano, se recuperan como máximo las últimas 2 horas
    const desde = Math.max(despuesDeMs + 1, ahora - 2 * S.HORA);
    return normalizar(S.generar(desde, ahora, paso), camposDe(config));
  }

  return { cargarDia, cargarRango, nuevas, normalizar, camposDe, aMs, aTexto };
});
