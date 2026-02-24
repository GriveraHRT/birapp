# Birapp (GitHub Pages + Google Sheets)

Esta versión está adaptada para ejecutarse en GitHub Pages y conservar sincronización con Google Sheets vía tu Web App de Apps Script.

## Endpoint configurado

`index.html` usa este backend:

- `https://script.google.com/macros/s/AKfycbwosRVbZN3CCzeGJFDruvvvj5Z9aqYHl-36_dTAN7Z03Jxbt6jl0-PfyiObo5FUiPomAA/exec`

## Contrato esperado del backend (Apps Script)

El frontend usa `fetch` con `action`:

- `GET ?action=getCervezas`
- `GET ?action=getSuggestions`
- `POST { "action": "addCerveza", "data": {...} }`
- `POST { "action": "updateCerveza", "data": {...} }`
- `POST { "action": "deleteCerveza", "id": "..." }`

Todas las respuestas deben ser JSON.

## Ejemplo mínimo de enrutador para Apps Script

```javascript
function doGet(e) {
  const action = (e.parameter.action || '').trim();
  let out;

  if (action === 'getCervezas') out = getCervezas();
  else if (action === 'getSuggestions') out = getSuggestions();
  else out = { error: 'Acción GET no soportada' };

  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}');
  const action = payload.action;
  let out;

  if (action === 'addCerveza') out = addCerveza(payload.data);
  else if (action === 'updateCerveza') out = updateCerveza(payload.data);
  else if (action === 'deleteCerveza') out = deleteCerveza(payload.id);
  else out = { error: 'Acción POST no soportada' };

  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
```

## Publicación

1. Subir estos archivos al repo.
2. Activar GitHub Pages (branch principal, carpeta `/root`).
3. Re-deploy del Apps Script como Web App con acceso adecuado.
