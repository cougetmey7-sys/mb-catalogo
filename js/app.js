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
  DOM.cartLocalidad = document.getElementById('cartLocalidad');
  DOM.cartObs     = document.getElementById('cartObs');
  DOM.cartFab     = document.querySelector('.cart-fab');
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
   TARJETA DE PRODUCTO
───────────────────────────────────────────── */
function crearTarjeta(p) {
  const catLabel  = CATEGORIAS[p.categoria]?.label || p.categoria;
  const badges    = BADGES.filter(b => p[b.key])
    .map(b => `<span class="ptag ${b.css}">${b.label}</span>`).join('');
  const enCarrito = !!carrito[p.id];

  // Imagen: si tiene → img con fallback placeholder; si no → placeholder directo
  const imgHtml = p.imagen
    ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
       ><div class="pcard-img-placeholder" style="display:none">
           <span>Imagen<br>próximamente</span>
         </div>`
    : `<div class="pcard-img-placeholder"><span>Imagen<br>próximamente</span></div>`;

  const div = document.createElement('div');
  div.className  = 'pcard fade-up';
  div.id         = `pcard_${p.id}`;
  div.dataset.id = p.id;

  div.innerHTML = `
    <div class="pcard-img-wrap">
      <div class="pcard-cat-badge">${catLabel}</div>
      ${badges ? `<div class="pcard-tags">${badges}</div>` : ''}
      ${imgHtml}
    </div>
    <div class="pcard-body">
      <div class="pcard-name">${p.nombre}</div>
      ${p.marca ? `<div class="pcard-brand">${p.marca}</div>` : ''}
      <div class="pcard-peso">${p.peso}</div>
    </div>
    <div class="pcard-footer">
      <button class="pcard-btn-add${enCarrito ? ' added' : ''}" id="btn_${p.id}"
              data-action="agregar" data-id="${p.id}" type="button">
        ${enCarrito ? '✓ Agregado' : '+ Agregar'}
      </button>
      <button class="pcard-btn-consult" data-action="consultar" data-id="${p.id}"
              type="button" title="Consultar" aria-label="Consultar ${p.nombre} por WhatsApp">💬</button>
    </div>`;

  return div;
}

/* ─────────────────────────────────────────────
   EVENT DELEGATION — grilla
───────────────────────────────────────────── */
function initGridDelegation() {
  DOM.grid?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (btn.dataset.action === 'agregar')   agregarAlCarrito(id);
    if (btn.dataset.action === 'consultar') consultarProducto(id);
  });
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

function agregarAlCarrito(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;

  if (carrito[id]) {
    carrito[id].cantidad++;
  } else {
    carrito[id] = { producto: p, cantidad: 1 };
    const btn = document.getElementById(`btn_${id}`);
    if (btn) { btn.textContent = '✓ Agregado'; btn.classList.add('added'); }
  }

  guardarCarrito();
  actualizarBadgeCarrito();
  if (DOM.cartFab) {
    DOM.cartFab.style.transform = 'scale(1.2)';
    setTimeout(() => { DOM.cartFab.style.transform = ''; }, 200);
  }
}

function quitarDelCarrito(id) {
  delete carrito[id];
  const btn = document.getElementById(`btn_${id}`);
  if (btn) { btn.textContent = '+ Agregar'; btn.classList.remove('added'); }
  guardarCarrito();
  actualizarBadgeCarrito();
  renderItemsCarrito();
}

function cambiarCantidad(id, delta) {
  if (!carrito[id]) return;
  carrito[id].cantidad += delta;
  if (carrito[id].cantidad <= 0) { quitarDelCarrito(id); return; }
  guardarCarrito();
  actualizarBadgeCarrito();
  renderItemsCarrito();
}

function vaciarCarrito() {
  Object.keys(carrito).forEach(id => {
    const btn = document.getElementById(`btn_${id}`);
    if (btn) { btn.textContent = '+ Agregar'; btn.classList.remove('added'); }
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

  DOM.cartItems.innerHTML = items.map(({ producto: p, cantidad }) => `
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
        <div class="cart-item-brand">${p.marca ? p.marca + ' · ' : ''}${p.peso}</div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" type="button" data-cart-action="menos" data-cart-id="${p.id}" aria-label="Reducir">−</button>
          <span class="cart-qty-num" aria-live="polite">${cantidad}</span>
          <button class="cart-qty-btn" type="button" data-cart-action="mas"   data-cart-id="${p.id}" aria-label="Aumentar">+</button>
        </div>
      </div>
      <button class="cart-item-del" type="button" data-cart-action="quitar" data-cart-id="${p.id}" title="Eliminar" aria-label="Eliminar ${p.nombre}">✕</button>
    </div>`).join('');
}

function initCartDelegation() {
  DOM.cartItems?.addEventListener('click', e => {
    const btn = e.target.closest('[data-cart-action]');
    if (!btn) return;
    const id     = parseInt(btn.dataset.cartId, 10);
    const action = btn.dataset.cartAction;
    if (action === 'mas')    cambiarCantidad(id, +1);
    if (action === 'menos')  cambiarCantidad(id, -1);
    if (action === 'quitar') quitarDelCarrito(id);
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
  const localidad = DOM.cartLocalidad?.value.trim() || '';
  const obs       = DOM.cartObs?.value.trim()       || '';

  if (!nombre) { DOM.cartNombre?.focus(); return; }

  const totalUnidades = items.reduce((s, { cantidad }) => s + cantidad, 0);

  const lineas = items.map(({ producto: p, cantidad }) =>
    `• ${p.nombre}${p.marca ? ' — ' + p.marca : ''}\n  Cantidad: ${cantidad}\n  Presentación: ${p.peso}`
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
  if (localidad) partes.push(`Localidad: ${localidad}`);
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
  initGridDelegation();
  initCartDelegation();
  DOM.search?.addEventListener('input', onBusqueda);

  // Cargar carrito guardado de la sesión
  cargarCarritoGuardado();

  if (DOM.info) DOM.info.innerHTML = 'Cargando catálogo…';
  productos = await cargarProductos();

  // Reconstruir botones de carrito según estado guardado
  Object.keys(carrito).forEach(id => {
    const btn = document.getElementById(`btn_${parseInt(id, 10)}`);
    if (btn) { btn.textContent = '✓ Agregado'; btn.classList.add('added'); }
  });

  construirIndice();
  actualizarBadgeCarrito();
  renderCatalogo();
});
