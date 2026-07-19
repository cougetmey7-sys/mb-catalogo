/* ═══════════════════════════════════════════════
   MB — loader.js  v2.0 (producción)
   Carga, parsea y valida data/productos.csv.
   Devuelve array de productos al llamador.

   Depende de: js/categorias.js
═══════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const CSV_PATH      = 'data/productos.csv';
const IMAGEN_PREFIX = 'images/';
const BOOL_TRUE     = new Set(['true', '1', 'si', 'sí', 'yes']);
const EXT_VALIDAS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const COLS_MINIMAS  = 4;  // mínimo de columnas para considerar fila válida

/* ─────────────────────────────────────────────
   PARSER CSV RFC 4180
   Soporta: campos con comas, saltos de línea y
   comillas dobles dentro de campos citados.
───────────────────────────────────────────── */
function parsearCSV(texto) {
  const resultado = [];
  let fila   = [];
  let campo  = '';
  let citado = false;
  let i      = 0;

  while (i < texto.length) {
    const c    = texto[i];
    const next = texto[i + 1];

    if (c === '"') {
      if (citado && next === '"') { campo += '"'; i += 2; continue; }  // "" → "
      citado = !citado; i++; continue;
    }
    if (c === ',' && !citado) {
      fila.push(campo.trim()); campo = ''; i++; continue;
    }
    if ((c === '\n' || (c === '\r' && next === '\n')) && !citado) {
      fila.push(campo.trim());
      const linea = fila.join('').trim();
      // Ignorar líneas vacías y comentarios
      if (linea && !linea.startsWith('#')) resultado.push(fila);
      fila = []; campo = '';
      if (c === '\r') i++;
      i++; continue;
    }
    campo += c; i++;
  }
  // Última fila sin newline final
  if (campo || fila.length) {
    fila.push(campo.trim());
    const linea = fila.join('').trim();
    if (linea && !linea.startsWith('#')) resultado.push(fila);
  }

  return resultado;
}

/* ─────────────────────────────────────────────
   VALIDACIÓN POR FILA
───────────────────────────────────────────── */
function validarFila(raw, numFila, idsVistos, nombresVistos, errores) {
  const [id, nombre, marca, categoria, peso, imagen,
         oferta, nuevo, masVendido, aPedido] = raw;

  // ── Campos obligatorios ──
  const vacios = [];
  if (!id)        vacios.push('id');
  if (!nombre)    vacios.push('nombre');
  if (!categoria) vacios.push('categoria');
  // marca es opcional — productos genéricos pueden no tener marca
  if (vacios.length) {
    errores.push({
      fila:     numFila,
      producto: nombre || '(sin nombre)',
      problema: `Campos obligatorios vacíos: ${vacios.join(', ')}.`,
    });
    return null;
  }

  // ── ID numérico positivo ──
  const idNum = parseInt(id, 10);
  if (isNaN(idNum) || idNum <= 0) {
    errores.push({
      fila:     numFila,
      producto: nombre,
      problema: `ID inválido: "${id}". Debe ser un número entero mayor a 0.`,
    });
    return null;
  }

  // ── ID duplicado ──
  if (idsVistos.has(idNum)) {
    errores.push({
      fila:     numFila,
      producto: nombre,
      problema: `ID duplicado: ${idNum}. Cada producto debe tener un ID único.`,
    });
    return null;
  }

  // ── Producto repetido (advertencia, no bloquea) ──
  const claveNombre = `${nombre.toLowerCase()}|${marca.toLowerCase()}`;
  if (nombresVistos.has(claveNombre)) {
    errores.push({
      fila:     numFila,
      producto: nombre,
      problema: `Producto posiblemente repetido: "${nombre}" de "${marca}" ya existe en otra fila.`,
    });
    // No retorna null: el producto se carga de todas formas
  }

  // ── Categoría válida ──
  if (!CATEGORIAS[categoria.toLowerCase()]) {
    const disponibles = Object.keys(CATEGORIAS).join(', ');
    errores.push({
      fila:     numFila,
      producto: nombre,
      problema: `Categoría desconocida: "${categoria}". Disponibles: ${disponibles}.`,
    });
    return null;
  }

  // ── Imagen ──
  const imgNombre = (imagen || '').trim();
  if (imgNombre) {
    if (/\s/.test(imgNombre)) {
      errores.push({
        fila:     numFila,
        producto: nombre,
        problema: `El nombre de imagen contiene espacios: "${imgNombre}". Usar guión (-) en vez de espacio.`,
      });
      return null;
    }
    const punto = imgNombre.lastIndexOf('.');
    if (punto === -1) {
      errores.push({
        fila:     numFila,
        producto: nombre,
        problema: `La imagen no tiene extensión: "${imgNombre}". Usar: ${[...EXT_VALIDAS].join(', ')}.`,
      });
      return null;
    }
    const ext = imgNombre.slice(punto).toLowerCase();
    if (!EXT_VALIDAS.has(ext)) {
      errores.push({
        fila:     numFila,
        producto: nombre,
        problema: `Extensión de imagen no válida: "${ext}". Usar: ${[...EXT_VALIDAS].join(', ')}.`,
      });
      return null;
    }
  }

  idsVistos.add(idNum);
  nombresVistos.add(claveNombre);

  return {
    id:         idNum,
    nombre:     nombre,
    marca:      marca,
    categoria:  categoria.toLowerCase(),
    peso:       peso  || '',
    imagen:     imgNombre ? IMAGEN_PREFIX + imgNombre : '',
    oferta:     BOOL_TRUE.has((oferta     || '').toLowerCase()),
    nuevo:      BOOL_TRUE.has((nuevo      || '').toLowerCase()),
    masVendido: BOOL_TRUE.has((masVendido || '').toLowerCase()),
    aPedido:    BOOL_TRUE.has((aPedido    || '').toLowerCase()),
  };
}

/* ─────────────────────────────────────────────
   MOSTRAR ERRORES EN PANTALLA
───────────────────────────────────────────── */
function mostrarErroresCarga(errores) {
  if (!errores.length) return;

  // Consola agrupada por severidad
  console.group('%c⚠ MB Catálogo — Errores en productos.csv', 'color:#C8111A;font-weight:bold;font-size:13px');
  errores.forEach(({ fila, producto, problema }) => {
    console.warn(`Fila ${fila} · ${producto}: ${problema}`);
  });
  console.groupEnd();

  // Banner visual en la página (descartable)
  const seccion = document.getElementById('catalogo');
  if (!seccion || document.getElementById('csv-error-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'csv-error-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'background:#1a0808',
    'border:1px solid #C8111A',
    'border-radius:2px',
    'padding:20px 24px',
    'margin:0 24px 24px',
    'font-family:monospace',
    'font-size:12px',
    'line-height:1.9',
    'color:#ccc',
  ].join(';');

  const filas = errores.map(({ fila, producto, problema }) =>
    `<div>Fila <strong>${fila}</strong> · <em>${producto}</em>: ${problema}</div>`
  ).join('');

  banner.innerHTML = `
    <div style="color:#C8111A;font-weight:700;font-size:14px;margin-bottom:10px">
      ⚠ Se encontraron ${errores.length} error${errores.length > 1 ? 'es' : ''} en productos.csv
    </div>
    ${filas}
    <div style="margin-top:10px;color:#555;font-size:11px">
      Corregí el CSV y recargá la página. Estos mensajes no son visibles para los clientes.
    </div>
    <button
      onclick="this.closest('#csv-error-banner').remove()"
      type="button"
      style="margin-top:10px;background:transparent;border:1px solid #555;color:#888;padding:5px 14px;cursor:pointer;font-size:11px"
    >Cerrar</button>`;

  seccion.prepend(banner);
}

/* ─────────────────────────────────────────────
   MENSAJE CUANDO EL CSV NO PUEDE CARGARSE
───────────────────────────────────────────── */
function mostrarErrorCargaCSV(mensajeExtra) {
  const noRes = document.getElementById('catNoResults');
  const grid  = document.getElementById('catGrid');
  if (grid)  grid.style.display = 'none';
  if (noRes) {
    noRes.style.display = 'block';
    const h3 = noRes.querySelector('h3');
    const p  = noRes.querySelector('p');
    if (h3) h3.textContent = 'No se pudo cargar el catálogo';
    if (p)  p.innerHTML   =
      `${mensajeExtra} <a href="https://wa.me/5493541680001" style="color:var(--rojo)">Contactanos si el problema persiste.</a>`;
  }
}

/* ─────────────────────────────────────────────
   CARGA PRINCIPAL — async
───────────────────────────────────────────── */
async function cargarProductos() {
  const errores      = [];
  const idsVistos    = new Set();
  const nombresVistos= new Set();

  // Fetch del CSV (sin cache-bust en producción para aprovechar caché del navegador)
  let respuesta;
  try {
    respuesta = await fetch(CSV_PATH);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} — ${respuesta.statusText}`);
  } catch (err) {
    const esArchivo = location.protocol === 'file:';
    const msg = esArchivo
      ? 'El sitio debe servirse desde un servidor (Netlify, VS Code Live Server, etc.), no abriendo el archivo directamente.'
      : `No se encontró el archivo <code>data/productos.csv</code>.`;
    console.error('MB Catálogo:', err.message);
    if (esArchivo) console.info('💡 Abrí el proyecto con VS Code Live Server o subilo a Netlify.');
    mostrarErrorCargaCSV(msg);
    return [];
  }

  const texto = await respuesta.text();
  const filas = parsearCSV(texto);

  if (!filas.length) {
    console.info('MB Catálogo: productos.csv está vacío — agregá productos para verlos aquí.');
    return [];
  }

  // Detectar encabezado: primera fila cuya col[0] no sea número
  const primeraFila   = filas[0];
  const esEncabezado  = !primeraFila[0] || isNaN(parseInt(primeraFila[0], 10));
  const filasDatos    = esEncabezado ? filas.slice(1) : filas;
  const offsetFila    = esEncabezado ? 2 : 1;

  const resultado = [];
  filasDatos.forEach((fila, i) => {
    if (fila.length < COLS_MINIMAS) return;   // fila incompleta → ignorar silenciosamente
    const p = validarFila(fila, i + offsetFila, idsVistos, nombresVistos, errores);
    if (p) resultado.push(p);
  });

  mostrarErroresCarga(errores);

  const ok    = resultado.length;
  const total = filasDatos.filter(f => f.length >= COLS_MINIMAS).length;
  console.info(`MB Catálogo: ${ok} de ${total} productos cargados. ${errores.length ? errores.length + ' error(es) detectado(s).' : '✓ Sin errores.'}`);

  return resultado;
}
