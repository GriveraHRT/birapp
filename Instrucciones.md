# 🍻 Guía de Actualización y Uso: Birapp (Edición Tour Cervecero)

Esta versión de **Birapp** está optimizada para usar en bares y rutas cerveceras desde el celular, sincronizada con tus **11 columnas reales** de Google Sheets (`ID`, `Fecha`, `Nombre`, `Cervecería`, `Estilo`, `° ALC`, `IBU`, `Nota Karina`, `Nota Guillermo`, `Comentario`, `Imagen`):

- **✨ IA Rápida con `gemini-4-hydrogen` + Búsqueda Web (2 Fases):**
  - Lee primero la etiqueta en alta nitidez (1024 px) sin inventar datos que no estén impresos.
  - Si faltan **Estilo, ° ALC o IBU** (o si buscas sin foto una cerveza de **barril / schop**), consulta la web en tiempo real (`google_search`) y muestra las fuentes encontradas.
  - Incluye el botón **"🧪 Probar IA + Web"** en el menú **✨** para verificar clave, modelo y latencia antes de salir.
- **📡 Modo Offline y Cola de Sincronización (IndexedDB):**
  - Tu bodega queda guardada en el teléfono para abrir al instante incluso sin señal.
  - Si registras o editas cervezas sin internet, se encolan localmente y se suben automáticamente apenas recuperas cobertura.
- **⚠️ Detector de Duplicados:** Al escribir o escanear una cerveza que ya registraron antes, Birapp te avisa su fecha y nota anterior con acceso directo a la ficha.
- **📸 Cámara, Encuadre Táctil y Compresión Segura:** Zoom con pellizco, rotación 90°, borrador automático y compresión adaptativa bajo el límite de celda de Google Sheets (`50.000` caracteres).
- **🏆 Bodega y Ranking Mejorados:** Búsqueda insensible a tildes, filtro **⏳ Sin puntuar**, orden por fecha real o IBU, promedio por cervecería/estilo, botón **📤 Compartir** y soporte de botón **Atrás** en el móvil.
- **🌙 Modo Claro y Taproom Nocturno + PWA Real:** Íconos PNG reales para iOS/Android y carga rápida en redes lentas.

---

## Paso 1: Subir los archivos a GitHub Pages
Sube y reemplaza en el repositorio los archivos actualizados:
- `index.html`, `sw.js`, `manifest.json`, `Instalador-Birapp.html`
- Carpeta `assets/` (`icon-cheers.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`)

*(El frontend ya apunta a tu URL actual de Google Apps Script y mantiene respaldo de compatibilidad con versiones previas).*

## Paso 2: Actualizar `Codigo.gs` en Google Apps Script (Muy Recomendado)
Al actualizar `Codigo.gs` habilitas:
- Protección contra guardados simultáneos de Karina y Guillermo (`LockService`) + idempotencia para cola offline.
- Carga única (`getBootstrap`), fechas protegidas como texto (`DD/MM/YYYY`), y uso compartido de la API Key de Gemini desde cualquiera de los dos teléfonos.

Pasos:
1. Abre tu planilla de Google Sheets (`Cervezas`) → **Extensiones > Apps Script**.
2. Reemplaza todo el contenido por el nuevo **`Codigo.gs`** y guarda (💾).
3. Arriba a la derecha, haz clic en **Implementar > Administrar implementaciones**.
4. Pulsa el ícono del lápiz ✏️ (**Editar**), en **Versión** selecciona **"Nueva versión"** y haz clic en **Implementar** *(conservando exactamente la misma URL de Web App)*.

## Paso 3: Configurar y Probar la IA Gratuita
1. Si aún no tienes clave, entra a **[Google AI Studio (aistudio.google.com/apikey)](https://aistudio.google.com/apikey)** y crea una API Key gratuita.
2. En Birapp, toca el botón **✨** arriba a la derecha.
3. Pega tu API Key, deja **`gemini-4-hydrogen`** seleccionado (respaldo automático a `gemini-3.8-flash` y `gemini-3.5-flash-lite`), pulsa **"🧪 Probar IA + Web"** para confirmar que responde rápido, y finalmente toca **"💾 Guardar"**.
