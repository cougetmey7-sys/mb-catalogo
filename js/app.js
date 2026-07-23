/* ═══════════════════════════════════════════════
   MB — app.js  v3.0
   Centro de Abastecimiento Integral
═══════════════════════════════════════════════ */
'use strict';

/* ─────────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────────── */
const WA_NUMBER   = '5493541680001';
const PAGE_SIZE   = 48;
const DEBOUNCE_MS = 280;
const CART_KEY    = 'mb_carrito_v1';   // sessionStorage key

/* ─────────────────────────────────────────────
   ESTADO GLOBAL
───────────────────────────────────────────── */
let productos     = [];
let indiceTexto   = [];    // índice de búsqueda pre-calculado y normalizado
let filtroActivo  = 'todos';
let paginaActual  = 1;
let carrito       = {};
let timerBusqueda = null;

/* ─────────────────────────────────────────────
   DOM CACHE
───────────────────────────────────────────── */
const DOM = {};
function initDOM() {
  DOM.grid        = document.getElementById('catGrid');
  DOM.noRes       = document.getElementById('catNoResults');
  DOM.info        = document.getElementById('catResultsInfo');
  DOM.search      = document.getElementById('catSearch');
  DOM.filters     = document.getElementById('catFilters');
  DOM.cartDrawer  = document.getElementById('cartDrawer');
  DOM.cartOverlay = document.getElementById('cartOverlay');
  DOM.cartEmpty   = document.getElementById('cartEmpty');
  DOM.cartItems   = document.getElementById('cartItems');
  DOM.cartFoot    = document.getElementById('cartFoot');
  DOM.cartBadge   = document.getElementById('cartBadge');
  DOM.cartTotal   = document.getElementById('cartTotalItems');
  DOM.cartNombre  = document.getElementById('cartNombre');
  DOM.cartNegocio = document.getElementById('cartNegocio');
  DOM.cartDireccion = document.getElementById('cartDireccion');
  DOM.cartObs     = document.getElementById('cartObs');
  DOM.cartFab     = document.querySelector('.cart-fab');
  DOM.ofertasDestSection = document.getElementById('ofertasDestacadasSection');
  DOM.ofertasDestGrid    = document.getElementById('ofertasDestacadasGrid');
}

/* ─────────────────────────────────────────────
   NORMALIZACIÓN DE TEXTO
   Elimina tildes, ñ→n, mayúsculas, espacios dobles
   para búsqueda tolerante a errores.
───────────────────────────────────────────── */
function normalizar(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/ñ/g, 'n')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─────────────────────────────────────────────
   BADGES
───────────────────────────────────────────── */
const BADGES = [
  { key: 'oferta',     label: '🔥 OFERTA',      css: 'ptag-oferta'     },
  { key: 'nuevo',      label: '🆕 NUEVO',       css: 'ptag-nuevo'      },
  { key: 'masVendido', label: '⭐ MÁS VENDIDO', css: 'ptag-masvendido' },
  { key: 'aPedido',    label: '📋 A PEDIDO',    css: 'ptag-apedido'    },
];

/* ─────────────────────────────────────────────
   ÍNDICE DE BÚSQUEDA
   Pre-calculado una vez. Incluye variantes de
   "mozzarella/muzzarella", sinónimos de categoría, etc.
───────────────────────────────────────────── */
function construirIndice() {
  indiceTexto = productos.map(p => {
    const catLabel = CATEGORIAS[p.categoria]?.label || '';
    // Base: nombre + marca + categoria + label + peso
    let base = normalizar(
      `${p.nombre} ${p.marca} ${p.categoria} ${catLabel} ${p.peso}`
    );
    // Aliases para búsquedas comunes
    if (base.includes('muzzarella') || base.includes('mozzarella')) {
      base += ' mozzarella muzzarella';
    }
    if (base.includes('jamon') || base.includes('jamon')) {
      base += ' jamon';
    }
    return base;
  });
}

/* ─────────────────────────────────────────────
   FILTROS
───────────────────────────────────────────── */
function construirFiltros() {
  if (!DOM.filters) return;
  const frag = document.createDocumentFragment();

  frag.appendChild(crearBotonFiltro('todos', 'Todos', true));
  for (const [clave, cfg] of Object.entries(CATEGORIAS)) {
    frag.appendChild(crearBotonFiltro(clave, cfg.label, false));
  }
  const btnOfertas = crearBotonFiltro('oferta', '🔥 Ofertas', false);
  btnOfertas.classList.add('oferta-btn');
  frag.appendChild(btnOfertas);

  DOM.filters.innerHTML = '';
  DOM.filters.appendChild(frag);

  DOM.filters.addEventListener('click', e => {
    const btn = e.target.closest('.cat-filter-btn');
    if (!btn) return;
    setFiltro(btn.dataset.filter, btn);
  });
}

function crearBotonFiltro(valor, texto, activo) {
  const btn = document.createElement('button');
  btn.className      = 'cat-filter-btn' + (activo ? ' active' : '');
  btn.dataset.filter = valor;
  btn.textContent    = texto;
  btn.type           = 'button';
  return btn;
}

function setFiltro(filtro, btn) {
  if (filtroActivo === filtro) return;
  filtroActivo = filtro;
  paginaActual = 1;
  DOM.filters.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCatalogo();
}

/* ─────────────────────────────────────────────
   BUSCADOR
───────────────────────────────────────────── */
function onBusqueda() {
  clearTimeout(timerBusqueda);
  timerBusqueda = setTimeout(() => { paginaActual = 1; renderCatalogo(); }, DEBOUNCE_MS);
}

function filtrarProductos() {
  const q = normalizar(DOM.search?.value || '');
  return productos.filter((p, i) => {
    const matchFiltro =
      filtroActivo === 'todos'  ? true :
      filtroActivo === 'oferta' ? p.oferta :
      p.categoria === filtroActivo;
    if (!matchFiltro) return false;
    if (!q) return true;
    return indiceTexto[i].includes(q);
  });
}

/* ─────────────────────────────────────────────
   OFERTAS DESTACADAS (sección fija, arriba de la portada)
───────────────────────────────────────────── */
function renderOfertasDestacadas() {
  if (!DOM.ofertasDestGrid || !DOM.ofertasDestSection) return;
  const destacadas = productos.filter(p => p.oferta && p.precioOferta);
  const btnVerOfertas = document.getElementById('verOfertasBtn');

  if (!destacadas.length) {
    DOM.ofertasDestSection.style.display = 'none';
    if (btnVerOfertas) btnVerOfertas.style.display = 'none';
    return;
  }

  DOM.ofertasDestSection.style.display = '';
  if (btnVerOfertas) btnVerOfertas.style.display = '';
  const frag = document.createDocumentFragment();
  destacadas.forEach(p => {
    frag.appendChild(crearTarjeta(p, { destacado: true, idPrefix: 'feat-' }));
  });
  DOM.ofertasDestGrid.innerHTML = '';
  DOM.ofertasDestGrid.appendChild(frag);

  // BUGFIX: sin esto, las tarjetas de Ofertas quedaban con opacity:0 para
  // siempre — la animación "fade-up" solo se activa cuando el elemento es
  // observado por fadeObserver, y esta sección no lo estaba haciendo
  // (a diferencia de renderCatalogo(), que sí registra sus tarjetas nuevas).
  requestAnimationFrame(() => {
    DOM.ofertasDestGrid.querySelectorAll('.fade-up:not(.visible)').forEach(el => fadeObserver.observe(el));
  });
}

function initOfertasDestacadasCarrusel() {
  const prev = document.getElementById('ofertasDestPrev');
  const next = document.getElementById('ofertasDestNext');
  const scrollPor = dir => {
    if (!DOM.ofertasDestGrid) return;
    const tarjeta = DOM.ofertasDestGrid.querySelector('.pcard');
    const ancho = tarjeta ? tarjeta.offsetWidth + 16 : 216; // 16px = gap
    DOM.ofertasDestGrid.scrollBy({ left: dir * ancho * 2, behavior: 'smooth' });
  };
  prev?.addEventListener('click', () => scrollPor(-1));
  next?.addEventListener('click', () => scrollPor(1));
}

/* ─────────────────────────────────────────────
   RENDER CATÁLOGO
───────────────────────────────────────────── */
function renderCatalogo() {
  if (!DOM.grid) return;
  const lista  = filtrarProductos();
  const total  = lista.length;
  const fin    = paginaActual * PAGE_SIZE;
  const slice  = lista.slice(0, fin);
  const hayMas = fin < total;

  if (DOM.info) {
    DOM.info.innerHTML = `Mostrando <span>${total}</span> producto${total !== 1 ? 's' : ''}`;
  }

  if (!total) {
    DOM.grid.innerHTML   = '';
    DOM.grid.style.display = 'none';
    if (DOM.noRes) DOM.noRes.style.display = 'block';
    quitarBotonVerMas();
    return;
  }
  if (DOM.noRes) DOM.noRes.style.display = 'none';
  DOM.grid.style.display = 'grid';

  const frag = document.createDocumentFragment();
  slice.forEach(p => frag.appendChild(crearTarjeta(p)));
  DOM.grid.innerHTML = '';
  DOM.grid.appendChild(frag);

  requestAnimationFrame(() => {
    DOM.grid.querySelectorAll('.fade-up:not(.visible)').forEach(el => fadeObserver.observe(el));
  });

  hayMas ? mostrarBotonVerMas(total, slice.length) : quitarBotonVerMas();
}

/* ─────────────────────────────────────────────
   CARPETA AUTOMÁTICA DE FOTOS
   Prueba 1.webp, 2.webp, 3.jpg... dentro de
   images/<carpeta>/ hasta que una no exista.
   No requiere listar nombres de archivo en el CSV.
───────────────────────────────────────────── */
const CARPETA_EXTENSIONES = ['webp', 'jpg', 'jpeg', 'png'];
const CARPETA_MAX_FOTOS   = 10;

function existeImagen(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function resolverFotoNumerada(carpeta, indice) {
  for (const ext of CARPETA_EXTENSIONES) {
    const src = `images/${carpeta}/${indice}.${ext}`;
    if (await existeImagen(src)) return src;
  }
  return null;
}

async function resolverImagenesCarpeta(carpeta) {
  const encontradas = [];
  for (let i = 1; i <= CARPETA_MAX_FOTOS; i++) {
    const src = await resolverFotoNumerada(carpeta, i);
    if (!src) break; // se detiene en el primer número faltante
    encontradas.push(src);
  }
  return encontradas;
}

async function resolverCarpetasDeProductos(lista) {
  const conCarpeta = lista.filter(p => p.carpeta);
  await Promise.all(conCarpeta.map(async p => {
    const fotos = await resolverImagenesCarpeta(p.carpeta);
    if (fotos.length) {
      p.imagenes = fotos;      // la carpeta numerada tiene prioridad sobre imagen/imagen2..5
      p.imagen   = fotos[0];
    }
  }));
}

/* ─────────────────────────────────────────────
   TARJETA DE PRODUCTO
───────────────────────────────────────────── */
function crearTarjeta(p, opciones = {}) {
  const { destacado = false, idPrefix = '' } = opciones;
  const enCarrito = !!carrito[p.id];
  const fotos = (p.imagenes && p.imagenes.length) ? p.imagenes : (p.imagen ? [p.imagen] : []);

  // Imagen: carrusel si hay 2+ fotos; una sola img si hay 1; placeholder si no hay ninguna
  let imgHtml;
  if (fotos.length > 1) {
    const slides = fotos.map((src, i) =>
      `<img src="${src}" alt="${p.nombre}" loading="lazy" class="pcard-slide${i === 0 ? ' is-active' : ''}" data-idx="${i}"
            onerror="this.style.display='none'">`
    ).join('');
    const dots = fotos.map((_, i) =>
      `<span class="pcard-dot${i === 0 ? ' is-active' : ''}" data-idx="${i}"></span>`
    ).join('');
    imgHtml = `
      <div class="pcard-carousel" data-idx="0" data-total="${fotos.length}" data-id="${p.id}">
        ${slides}
        <button class="pcard-arrow pcard-arrow-prev" data-action="foto-prev" data-id="${p.id}" type="button" aria-label="Foto anterior">‹</button>
        <button class="pcard-arrow pcard-arrow-next" data-action="foto-next" data-id="${p.id}" type="button" aria-label="Foto siguiente">›</button>
        <div class="pcard-dots">${dots}</div>
      </div>`;
  } else if (fotos.length === 1) {
    imgHtml = `<img src="${fotos[0]}" alt="${p.nombre}" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
       ><div class="pcard-img-placeholder" style="display:none">
           <span>Imagen<br>próximamente</span>
         </div>`;
  } else {
    imgHtml = `<div class="pcard-img-placeholder"><span>Imagen<br>próximamente</span></div>`;
  }

  // El precio SOLO se muestra en la sección de Ofertas Destacadas,
  // nunca en la grilla normal del catálogo (aunque el producto tenga oferta=true).
  const esOfertaConPrecio = destacado && p.oferta && p.precioOferta;
  const ribbonOferta = esOfertaConPrecio ? `<div class="pcard-ribbon-oferta">OFERTA</div>` : '';
  const precioHtml = esOfertaConPrecio
    ? `<div class="pcard-precio-tag">🔥 Precio Oferta</div>
       <div class="pcard-precio">${/^[\d.,]+$/.test(p.precioOferta) ? '$' + p.precioOferta : p.precioOferta}</div>`
    : '';
  const textoBoton = enCarrito ? '✓ Agregado' : (esOfertaConPrecio ? '🛒 Agregar al pedido' : '+ Agregar');
  const descripcionHtml = p.descripcion ? `<div class="pcard-desc">${p.descripcion}</div>` : '';
  const apedidoHtml = p.aPedido ? `<div class="pcard-badge-apedido">📦 Producto disponible por pedido</div>` : '';
  const variantesHtml = p.variantes.length ? `
      <select class="pcard-variant" id="${idPrefix}variant_${p.id}" aria-label="Elegir sabor/variante de ${p.nombre}">
        ${p.variantes.map(v => `<option value="${v}">${v}</option>`).join('')}
      </select>` : '';

  const div = document.createElement('div');
  div.className  = 'pcard fade-up' + (esOfertaConPrecio ? ' pcard-oferta' : '');
  div.id         = `${idPrefix}pcard_${p.id}`;
  div.dataset.id = p.id;

  div.innerHTML = `
    <div class="pcard-img-wrap">
      ${ribbonOferta}
      ${imgHtml}
    </div>
    <div class="pcard-body">
      ${apedidoHtml}
      <div class="pcard-name">${p.nombre}</div>
      ${p.marca ? `<div class="pcard-brand">${p.marca}</div>` : ''}
      <div class="pcard-peso">${p.peso}</div>
      ${descripcionHtml}
      ${precioHtml}
      ${variantesHtml}
    </div>
    <div class="pcard-footer">
      <button class="pcard-btn-add${enCarrito ? ' added' : ''}" id="${idPrefix}btn_${p.id}"
              data-action="agregar" data-id="${p.id}" type="button">
        ${textoBoton}
      </button>
      <button class="pcard-btn-consult" data-action="consultar" data-id="${p.id}"
              type="button" title="Consultar" aria-label="Consultar ${p.nombre} por WhatsApp">💬</button>
    </div>`;

  return div;
}

/* ─────────────────────────────────────────────
   CARRUSEL — mostrar una foto puntual del set
───────────────────────────────────────────── */
function irAFotoCarrusel(carouselEl, idx) {
  const total = parseInt(carouselEl.dataset.total, 10) || 1;
  const nuevoIdx = ((idx % total) + total) % total; // wrap-around
  carouselEl.dataset.idx = nuevoIdx;
  carouselEl.querySelectorAll('.pcard-slide').forEach(img => {
    img.classList.toggle('is-active', parseInt(img.dataset.idx, 10) === nuevoIdx);
  });
  carouselEl.querySelectorAll('.pcard-dot').forEach(dot => {
    dot.classList.toggle('is-active', parseInt(dot.dataset.idx, 10) === nuevoIdx);
  });
}

/* ─────────────────────────────────────────────
   EVENT DELEGATION — grilla
───────────────────────────────────────────── */
function initGridDelegation(container) {
  container = container || DOM.grid;
  container?.addEventListener('click', e => {
    // Flechas del carrusel
    const arrow = e.target.closest('[data-action="foto-prev"], [data-action="foto-next"]');
    if (arrow) {
      const carousel = arrow.closest('.pcard-carousel');
      if (carousel) {
        const dir = arrow.dataset.action === 'foto-next' ? 1 : -1;
        irAFotoCarrusel(carousel, parseInt(carousel.dataset.idx, 10) + dir);
      }
      return;
    }
    // Puntos del carrusel
    const dot = e.target.closest('.pcard-dot');
    if (dot) {
      const carousel = dot.closest('.pcard-carousel');
      if (carousel) irAFotoCarrusel(carousel, parseInt(dot.dataset.idx, 10));
      return;
    }
    // Clic en la foto → lightbox (con navegación si el producto tiene varias)
    const img = e.target.closest('.pcard-img-wrap img');
    if (img) {
      const pcard = img.closest('.pcard');
      const id = pcard ? parseInt(pcard.dataset.id, 10) : null;
      const p  = id ? productos.find(x => x.id === id) : null;
      const fotos = (p && p.imagenes && p.imagenes.length) ? p.imagenes : [img.src];
      const carousel = img.closest('.pcard-carousel');
      const idxActual = carousel ? parseInt(carousel.dataset.idx, 10) : 0;
      abrirLightbox(fotos, idxActual, img.alt);
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (btn.dataset.action === 'agregar')   agregarAlCarrito(id, btn);
    if (btn.dataset.action === 'consultar') consultarProducto(id);
  });

  // Deslizar (swipe) para cambiar de foto en celular
  let touchX = null;
  container?.addEventListener('touchstart', e => {
    const carousel = e.target.closest('.pcard-carousel');
    touchX = carousel ? e.touches[0].clientX : null;
  }, { passive: true });
  container?.addEventListener('touchend', e => {
    if (touchX === null) return;
    const carousel = e.target.closest('.pcard-carousel');
    if (!carousel) { touchX = null; return; }
    const deltaX = e.changedTouches[0].clientX - touchX;
    if (Math.abs(deltaX) > 40) {
      irAFotoCarrusel(carousel, parseInt(carousel.dataset.idx, 10) + (deltaX < 0 ? 1 : -1));
    }
    touchX = null;
  }, { passive: true });
}


/* ─────────────────────────────────────────────
   LIGHTBOX — ampliar imagen de producto (con navegación)
───────────────────────────────────────────── */
let lightboxFotos = [];
let lightboxIdx   = 0;

function renderLightboxImg() {
  const img  = document.getElementById('imgLightboxImg');
  const nav  = document.getElementById('imgLightboxNav');
  if (!img) return;
  img.src = lightboxFotos[lightboxIdx];
  if (nav) nav.style.display = lightboxFotos.length > 1 ? 'flex' : 'none';
}

function abrirLightbox(fotos, idx, alt) {
  const overlay = document.getElementById('imgLightbox');
  const img     = document.getElementById('imgLightboxImg');
  if (!overlay || !img) return;
  lightboxFotos = Array.isArray(fotos) ? fotos : [fotos];
  lightboxIdx   = idx || 0;
  img.alt = alt || '';
  renderLightboxImg();
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function moverLightbox(delta) {
  const total = lightboxFotos.length;
  if (total <= 1) return;
  lightboxIdx = ((lightboxIdx + delta) % total + total) % total;
  renderLightboxImg();
}

function cerrarLightbox() {
  const overlay = document.getElementById('imgLightbox');
  const img     = document.getElementById('imgLightboxImg');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  if (img) img.src = '';
  lightboxFotos = [];
  lightboxIdx = 0;
}

function initLightbox() {
  const overlay  = document.getElementById('imgLightbox');
  const closeBtn = document.getElementById('imgLightboxClose');
  const prevBtn  = document.getElementById('imgLightboxPrev');
  const nextBtn  = document.getElementById('imgLightboxNext');
  if (!overlay) return;

  // Clic fuera de la imagen (en el fondo oscuro) cierra
  overlay.addEventListener('click', e => {
    if (e.target === overlay) cerrarLightbox();
  });
  closeBtn?.addEventListener('click', cerrarLightbox);
  prevBtn?.addEventListener('click', e => { e.stopPropagation(); moverLightbox(-1); });
  nextBtn?.addEventListener('click', e => { e.stopPropagation(); moverLightbox(1); });

  // Teclado: Esc cierra, flechas navegan
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape')   cerrarLightbox();
    if (e.key === 'ArrowLeft')  moverLightbox(-1);
    if (e.key === 'ArrowRight') moverLightbox(1);
  });

  // Swipe en el lightbox (mobile)
  let touchX = null;
  overlay.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', e => {
    if (touchX === null) return;
    const deltaX = e.changedTouches[0].clientX - touchX;
    if (Math.abs(deltaX) > 50) moverLightbox(deltaX < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });
}

/* ─────────────────────────────────────────────
   VER MÁS
───────────────────────────────────────────── */
function mostrarBotonVerMas(total, visibles) {
  let btn = document.getElementById('btn-ver-mas');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-ver-mas'; btn.className = 'btn-ver-mas'; btn.type = 'button';
    DOM.grid.after(btn);
  }
  const restantes = total - visibles;
  btn.textContent = `Ver ${Math.min(restantes, PAGE_SIZE)} más — ${restantes} restantes`;
  btn.onclick = () => { paginaActual++; renderCatalogo(); };
}
function quitarBotonVerMas() { document.getElementById('btn-ver-mas')?.remove(); }

/* ─────────────────────────────────────────────
   CARRITO
───────────────────────────────────────────── */
function guardarCarrito() {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(carrito));
  } catch (_) {}
}

function cargarCarritoGuardado() {
  try {
    const saved = sessionStorage.getItem(CART_KEY);
    if (saved) carrito = JSON.parse(saved);
  } catch (_) { carrito = {}; }
}

function agregarAlCarrito(id, btnOrigen) {
  const p = productos.find(x => x.id === id);
  if (!p) return;

  let variante = null;
  if (p.variantes && p.variantes.length) {
    // Leer el selector DENTRO de la misma tarjeta que disparó el clic
    // (evita confundir la tarjeta de Ofertas con la de su categoría).
    const card = btnOrigen ? btnOrigen.closest('.pcard') : null;
    const sel  = card ? card.querySelector('.pcard-variant') : document.getElementById(`variant_${id}`);
    variante = sel ? sel.value : p.variantes[0];
  }
  const key = variante ? `${id}::${variante}` : String(id);
  const esNuevo = !carrito[key];

  if (carrito[key]) {
    carrito[key].cantidad++;
  } else {
    carrito[key] = { producto: p, cantidad: 1, variante };
  }

  if (variante) {
    // Feedback transitorio SOLO en el botón que se tocó: con variantes,
    // un mismo producto puede tener varias líneas de carrito (una por sabor),
    // así que no conviene marcar TODAS sus tarjetas como "agregado" fijo.
    const btn = btnOrigen || document.getElementById(`btn_${id}`);
    if (btn) {
      const original = textoBotonPara(btn);
      btn.textContent = '✓ Agregado';
      btn.classList.add('added');
      clearTimeout(btn._resetTimer);
      btn._resetTimer = setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('added');
      }, 1400);
    }
  } else if (esNuevo) {
    // Sin variantes: reflejar "agregado" en TODAS las instancias del producto
    // (por si aparece a la vez en Ofertas y en su categoría).
    botonesAgregarDe(id).forEach(btn => {
      btn.textContent = '✓ Agregado';
      btn.classList.add('added');
    });
  }

  guardarCarrito();
  actualizarBadgeCarrito();
  if (DOM.cartFab) {
    DOM.cartFab.style.transform = 'scale(1.2)';
    setTimeout(() => { DOM.cartFab.style.transform = ''; }, 200);
  }
}

function botonesAgregarDe(id) {
  return document.querySelectorAll(`[data-action="agregar"][data-id="${id}"]`);
}

function textoBotonPara(btnEl) {
  return btnEl.closest('.pcard')?.classList.contains('pcard-oferta') ? '🛒 Agregar al pedido' : '+ Agregar';
}

function quitarDelCarrito(key) {
  const item = carrito[key];
  delete carrito[key];
  if (item && !item.variante) {
    botonesAgregarDe(item.producto.id).forEach(btn => {
      btn.textContent = textoBotonPara(btn);
      btn.classList.remove('added');
    });
  }
  guardarCarrito();
  actualizarBadgeCarrito();
  renderItemsCarrito();
}

function cambiarCantidad(key, delta) {
  if (!carrito[key]) return;
  carrito[key].cantidad += delta;
  if (carrito[key].cantidad <= 0) { quitarDelCarrito(key); return; }
  guardarCarrito();
  actualizarBadgeCarrito();
  renderItemsCarrito();
}

function vaciarCarrito() {
  Object.values(carrito).forEach(item => {
    if (item.variante) return; // botones de variante ya vuelven solos (timeout)
    botonesAgregarDe(item.producto.id).forEach(btn => {
      btn.textContent = textoBotonPara(btn);
      btn.classList.remove('added');
    });
  });
  carrito = {};
  guardarCarrito();
  actualizarBadgeCarrito();
  renderItemsCarrito();
}

function actualizarBadgeCarrito() {
  const total = Object.values(carrito).reduce((s, c) => s + c.cantidad, 0);
  if (DOM.cartBadge) {
    DOM.cartBadge.textContent   = total;
    DOM.cartBadge.style.display = total > 0 ? 'flex' : 'none';
  }
  if (DOM.cartTotal) {
    DOM.cartTotal.textContent = `${total} ${total === 1 ? 'unidad' : 'unidades'}`;
  }
}

function renderItemsCarrito() {
  const items = Object.values(carrito);
  if (!DOM.cartEmpty || !DOM.cartItems || !DOM.cartFoot) return;

  if (!items.length) {
    DOM.cartEmpty.style.display = 'flex';
    DOM.cartItems.style.display = 'none';
    DOM.cartFoot.style.display  = 'none';
    return;
  }
  DOM.cartEmpty.style.display = 'none';
  DOM.cartItems.style.display = 'flex';
  DOM.cartFoot.style.display  = 'flex';

  DOM.cartItems.innerHTML = Object.entries(carrito).map(([key, { producto: p, cantidad, variante }]) => `
    <div class="cart-item">
      <div class="cart-item-img-wrap">
        ${p.imagen
          ? `<img class="cart-item-img" src="${p.imagen}" alt="${p.nombre}" loading="lazy"
                  onerror="this.style.display='none'">`
          : ''
        }
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.nombre}</div>
        <div class="cart-item-brand">${p.marca ? p.marca + ' · ' : ''}${p.peso}${variante ? ' · Sabor: ' + variante : ''}</div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" type="button" data-cart-action="menos" data-cart-key="${key}" aria-label="Reducir">−</button>
          <span class="cart-qty-num" aria-live="polite">${cantidad}</span>
          <button class="cart-qty-btn" type="button" data-cart-action="mas"   data-cart-key="${key}" aria-label="Aumentar">+</button>
        </div>
      </div>
      <button class="cart-item-del" type="button" data-cart-action="quitar" data-cart-key="${key}" title="Eliminar" aria-label="Eliminar ${p.nombre}">✕</button>
    </div>`).join('');
}

function initCartDelegation() {
  DOM.cartItems?.addEventListener('click', e => {
    const btn = e.target.closest('[data-cart-action]');
    if (!btn) return;
    const key    = btn.dataset.cartKey;
    const action = btn.dataset.cartAction;
    if (action === 'mas')    cambiarCantidad(key, +1);
    if (action === 'menos')  cambiarCantidad(key, -1);
    if (action === 'quitar') quitarDelCarrito(key);
  });
}

function abrirCarrito() {
  DOM.cartDrawer?.classList.add('open');
  DOM.cartOverlay?.classList.add('active');
  document.body.style.overflow = 'hidden';
  renderItemsCarrito();
}

function cerrarCarrito() {
  DOM.cartDrawer?.classList.remove('open');
  DOM.cartOverlay?.classList.remove('active');
  document.body.style.overflow = '';
}

/* ─────────────────────────────────────────────
   WHATSAPP — mensaje ordenado
───────────────────────────────────────────── */
function enviarPedido() {
  const items = Object.values(carrito);
  if (!items.length) { alert('Tu pedido está vacío.'); return; }

  const nombre    = DOM.cartNombre?.value.trim()    || '';
  const negocio   = DOM.cartNegocio?.value.trim()   || '';
  const direccion = DOM.cartDireccion?.value.trim() || '';
  const obs       = DOM.cartObs?.value.trim()       || '';

  if (!nombre) { DOM.cartNombre?.focus(); return; }

  const totalUnidades = items.reduce((s, { cantidad }) => s + cantidad, 0);

  const lineas = items.map(({ producto: p, cantidad, variante }) =>
    `• ${p.nombre}${p.marca ? ' — ' + p.marca : ''}${variante ? '\n  Sabor: ' + variante : ''}\n  Cantidad: ${cantidad}\n  Presentación: ${p.peso}`
  ).join('\n\n');

  const partes = [
    'Hola, quiero solicitar disponibilidad y precio para:',
    '',
    lineas,
    '',
    `Total de unidades: ${totalUnidades}`,
    '',
    `Cliente: ${nombre}`,
  ];
  if (negocio)   partes.push(`Empresa: ${negocio}`);
  if (direccion) partes.push(`Dirección de entrega: ${direccion}`);
  if (obs)       partes.push(`Observaciones: ${obs}`);

  const msg = partes.join('\n');
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

function consultarProducto(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const msg = `Hola MB! 👋 Quiero consultar sobre:\n\n*${p.nombre}*${p.marca ? ' — ' + p.marca : ''}\nPresentación: ${p.peso}`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

function enviarConseguimos() {
  const nombre   = document.getElementById('cg-nombre')?.value.trim()   || '';
  const empresa  = document.getElementById('cg-empresa')?.value.trim()  || '';
  const producto = document.getElementById('cg-producto')?.value.trim() || '';
  const wa       = document.getElementById('cg-wa')?.value.trim()       || '';

  if (!nombre || !producto) { alert('Completá al menos tu nombre y el producto.'); return; }

  const msg = [
    'Hola MB! 👋',
    '',
    `Nombre: ${nombre}`,
    `Empresa: ${empresa || '—'}`,
    `Producto buscado: ${producto}`,
    `Mi WhatsApp: ${wa || 'Este número'}`,
  ].join('\n');

  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

/* ─────────────────────────────────────────────
   FAQ
───────────────────────────────────────────── */
function toggleFaq(btn) {
  const item    = btn.closest('.faq-item');
  const abierto = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => {
    i.classList.remove('open');
    i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
  });
  if (!abierto) {
    item.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  } else {
    btn.setAttribute('aria-expanded', 'false');
  }
}

/* ─────────────────────────────────────────────
   INTERSECTION OBSERVER
───────────────────────────────────────────── */
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); fadeObserver.unobserve(e.target); }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

/* ─────────────────────────────────────────────
   NAVBAR
───────────────────────────────────────────── */
function initNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const onScroll = () => {
    nav.style.background = window.scrollY > 60
      ? 'rgba(10,10,10,0.97)' : 'rgba(10,10,10,0.9)';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initDOM();
  document.querySelectorAll('.fade-up').forEach(el => fadeObserver.observe(el));
  initNavbar();
  construirFiltros();
  initGridDelegation(DOM.grid);
  initGridDelegation(DOM.ofertasDestGrid);
  initOfertasDestacadasCarrusel();
  initCartDelegation();
  initLightbox();
  DOM.search?.addEventListener('input', onBusqueda);

  // Cargar carrito guardado de la sesión
  cargarCarritoGuardado();

  if (DOM.info) DOM.info.innerHTML = 'Cargando catálogo…';
  productos = await cargarProductos();

  // Productos con "carpeta" cargada: resolver sus fotos numeradas (1.webp, 2.webp...)
  await resolverCarpetasDeProductos(productos);

  // Reconstruir botones de carrito según estado guardado
  Object.values(carrito).forEach(item => {
    if (item.variante) return; // los de variante no llevan estado persistente en el botón
    botonesAgregarDe(item.producto.id).forEach(btn => {
      btn.textContent = '✓ Agregado';
      btn.classList.add('added');
    });
  });

  construirIndice();
  actualizarBadgeCarrito();
  renderOfertasDestacadas();
  renderCatalogo();
});
