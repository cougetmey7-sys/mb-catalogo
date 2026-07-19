/* ═══════════════════════════════════════════════
   MB — categorias.js
   Fuente única de categorías del catálogo.

   PARA AGREGAR UNA CATEGORÍA:
   1. Agregá la clave aquí con su label.
   2. El botón de filtro aparece automáticamente.
   3. Usá esa clave exacta en la columna "categoria" del CSV.

   SUBCATEGORÍAS (preparado para futuro):
   Cuando quieras usar subcategorías, agregá una columna
   "subcategoria" al CSV y activá la lógica en app.js.
   Ejemplo futuro: fiambres → jamones | salames | pancetas
═══════════════════════════════════════════════ */

const CATEGORIAS = {
  quesos:    { label: '🧀 Quesos'    },
  fiambres:  { label: '🥩 Fiambres'  },
  lacteos:   { label: '🥛 Lácteos'   },
  conservas: { label: '🥫 Conservas' },
  aderezos:  { label: '🧴 Aderezos'  },
  especias:  { label: '🌿 Especias'  },
  bebidas:   { label: '🥤 Bebidas'   },
  otros:     { label: '🛒 Otros'     },
};

/*
  SUBCATEGORÍAS — activar en el futuro agregando esto al CSV:
  id,nombre,marca,categoria,subcategoria,peso,imagen,...

  Y en categorias.js:
  const SUBCATEGORIAS = {
    fiambres: ['Jamones', 'Salames', 'Pancetas', 'Embutidos'],
    quesos:   ['Blandos', 'Semiduros', 'Duros'],
  };
*/
