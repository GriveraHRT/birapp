# 🍻 Guía de Actualización y Uso: Birapp 2.0 (Mobile + IA)

Esta versión de **Birapp** está diseñada especialmente para celulares, sincronizada con tus **11 columnas reales** de Google Sheets (`ID`, `Fecha`, `Nombre`, `Cervecería`, `Estilo`, `° ALC`, `IBU`, `Nota Karina`, `Nota Guillermo`, `Comentario`, `Imagen`) e incluye:

- **📸 Cámara directa y Galería separadas:** Abre directamente la cámara trasera del celular o sube desde tu galería.
- **✂️ Editor Táctil de Encuadre:** Haz zoom pellizcando con dos dedos o con el deslizador, arrastra para centrar la botella, rota 90° o usa **"🍾 Ver Entera"** para que las botellas verticales nunca salgan cortadas.
- **✨ IA Gratuita (`gemini-3.8-flash`) + Búsqueda Web en Tiempo Real:** Lee el nombre y cervecería desde la foto de la botella y busca en internet (Untappd, web de la cervecería, catálogos) el **Estilo, ° ALC e IBU** aunque no aparezcan en la etiqueta frontal.
- **🌙 Modo Claro y Modo Oscuro ("Taproom Nocturno"):** Conmutable desde el botón de luna/sol arriba a la derecha.
- **🏆 Pestaña de Ranking y Estadísticas:** Top 5 mejores cervezas, duelo de promedios entre Karina y Guillermo, cervecerías y estilos favoritos.

---

## Paso 1: Actualizar el Archivo `index.html` en tu GitHub Pages
1. Entra a tu repositorio de GitHub donde tienes alojada la app.
2. Sube y reemplaza el archivo **`index.html`** por el nuevo `index.html` de esta carpeta y haz clic en **Commit changes**.
   *(Nota: `index.html` ya tiene configurada tu URL actual de Google Apps Script, por lo que seguirá conectada a tus 29 registros de inmediato).*

## Paso 2: Actualizar `Codigo.gs` en tu Google Sheets (Opcional pero Recomendado)
Para que la clave de IA quede guardada también en tu nube de Google (y funcione automáticamente tanto en el celular de Guillermo como en el de Karina):
1. Abre tu planilla de Google Sheets (`Cervezas`) y ve a **Extensiones > Apps Script**.
2. Reemplaza el contenido por el nuevo archivo **`Codigo.gs`** de esta carpeta y guarda (💾).
3. Arriba a la derecha, haz clic en **Implementar > Administrar implementaciones**.
4. Haz clic en el ícono del lápiz ✏️ (Editar), en "Versión" elige **"Nueva versión"** y pulsa **Implementar**. *(Así conservas exactamente la misma URL de siempre).*

## Paso 3: Activar la IA Gratuita con Búsqueda Web (1 sola vez)
1. Entra desde tu navegador a **[Google AI Studio (aistudio.google.com/apikey)](https://aistudio.google.com/apikey)** con tu cuenta de Google.
2. Pulsa **"Create API Key"** y copia la clave generada (es gratuita).
3. Abre **Birapp**, toca el botón de destellos **✨** arriba a la derecha (junto al botón de modo oscuro), pega tu API Key y toca **Guardar Configuración**.
4. ¡Listo! Ahora cada vez que saques una foto a una cerveza (o escribas su nombre) y toques **"✨ Autocompletar con IA + Web"**, la app identificará la cerveza y buscará su variedad, `° ALC` e `IBU` automáticamente.
