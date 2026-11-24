# Birapp (GitHub Pages + Google Sheets + Gemini IA)

Aplicación web progresiva (PWA) móvil diseñada para registrar catas de cerveza entre dos catadores (Karina y Guillermo), con sincronización en Google Sheets vía Google Apps Script, funcionamiento offline con IndexedDB e identificación asistida con Google Gemini + Búsqueda Web.

## Estructura del proyecto

- `index.html`: Aplicación principal (UI móvil, editor táctil de fotos, flujo IA en 2 fases, IndexedDB + cola offline, ranking).
- `Codigo.gs`: Backend de Google Apps Script (manejo de 11 columnas reales, `LockService`, formato seguro de fechas, configuración y proxy/respaldo de Gemini).
- `sw.js`: Service Worker (`birapp-static-v6`) con estrategia Network-First con timeout de 2.8 s para redes móviles lentas.
- `manifest.json` y `assets/`: Manifiesto PWA e íconos (`icon-cheers.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
- `Instalador-Birapp.html`: Redirección de compatibilidad hacia `./index.html`.
- `Instrucciones.md`: Guía rápida de actualización y uso en tour.

## Endpoint configurado

`index.html` usa este backend de Google Apps Script:

- `https://script.google.com/macros/s/AKfycbwosRVbZN3CCzeGJFDruvvvj5Z9aqYHl-36_dTAN7Z03Jxbt6jl0-PfyiObo5FUiPomAA/exec`

## Contrato del backend (Apps Script)

- **GET**:
  - `?action=getBootstrap` *(devuelve `{ cervezas, cervecerias, estilos, hasAiKey, aiModel, serverTime }` en una sola petición)*
  - `?action=getCervezas`
  - `?action=getSuggestions`
  - `?action=getAiStatus`
- **POST** (`payload` form-urlencoded para evitar preflight CORS):
  - `payload={"action":"addCerveza","data":{...}}` *(soporta `clientId` para idempotencia)*
  - `payload={"action":"updateCerveza","data":{...}}`
  - `payload={"action":"deleteCerveza","id":"..."}`
  - `payload={"action":"saveAiConfig","data":{"apiKey":"...","model":"..."}}`
  - `payload={"action":"analyzeBeerImage","data":{...}}`
  - `payload={"action":"testAiConfig","data":{"model":"..."}}`

Todas las respuestas se devuelven en JSON (`ContentService.MimeType.JSON`).

## Notas técnicas clave

- **Columnas de la hoja `Cervezas`:** `ID`, `Fecha`, `Nombre`, `Cervecería`, `Estilo`, `° ALC`, `IBU`, `Nota Karina`, `Nota Guillermo`, `Comentario`, `Imagen`.
- **Límite de celda en Google Sheets:** La compresión adaptativa en `index.html` garantiza imágenes `<= 46.000` caracteres (y `Codigo.gs` valida `<= 49.500`), manteniendo en paralelo una copia nítida en memoria (1024 px) exclusiva para la lectura de etiqueta con IA.
- **Modelos Gemini recomendados (Free Tier):** `gemini-4-hydrogen` (`thinkingLevel: "LOW"`), con respaldo automático en `gemini-3.8-flash` (`LOW`) y `gemini-3.5-flash-lite` (`MINIMAL`/`LOW`). Las búsquedas con `google_search` se ejecutan en fase separada sin `responseMimeType: "application/json"` para evitar errores `400`.
- **Re-implementación en Apps Script:** Tras actualizar `Codigo.gs`, recuerda publicar una **Nueva versión** en *Implementar > Administrar implementaciones > Editar > Implementar*.
