const SHEET_NAME = "Cervezas";
const HEADERS = [
  "ID",
  "Fecha",
  "Nombre",
  "Cervecería",
  "Estilo",
  "° ALC",
  "IBU",
  "Nota Karina",
  "Nota Guillermo",
  "Comentario",
  "Imagen"
];

const DEFAULT_AI_MODEL = "gemini-3.8-flash";

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : "";

  if (action === "getCervezas") {
    return jsonResponse(getCervezas());
  } else if (action === "getSuggestions") {
    return jsonResponse(getSuggestions());
  } else if (action === "getAiStatus") {
    return jsonResponse(getAiStatus());
  }

  return jsonResponse({ error: "Invalid action or no action provided" });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON: " + err.message });
  }

  const action = data.action;
  let result;

  try {
    if (action === "addCerveza") {
      result = addCerveza(data.payload);
    } else if (action === "updateCerveza") {
      result = updateCerveza(data.payload);
    } else if (action === "deleteCerveza") {
      result = deleteCerveza(data.id);
    } else if (action === "saveAiConfig") {
      result = saveAiConfig(data.payload || {});
    } else if (action === "analyzeBeerImage") {
      result = analyzeBeerWithGemini(data.payload || {});
    } else {
      return jsonResponse({ error: "Invalid POST action: " + action });
    }
  } catch (err) {
    return jsonResponse({ error: err.message || String(err) });
  }

  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  }
  return sheet;
}

// Asegura que la primera fila siempre tenga las 11 columnas reales en el orden correcto
function ensureHeaders(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#3e2723")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function getCervezas() {
  const sheet = getSheet();
  ensureHeaders(sheet);

  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];

  const rows = data.slice(1);

  return rows
    .map(row => {
      let cerveza = {};
      HEADERS.forEach((header, index) => {
        cerveza[header] = row[index] !== undefined ? row[index] : "";
      });
      return cerveza;
    })
    .reverse();
}

function getSuggestions() {
  const sheet = getSheet();
  ensureHeaders(sheet);

  const data = sheet.getDataRange().getValues();
  const aiStatus = getAiStatus();

  if (data.length <= 1) {
    return {
      cervecerias: [],
      estilos: [],
      hasAiKey: aiStatus.hasAiKey,
      aiModel: aiStatus.aiModel
    };
  }

  const headers = data[0];
  const idxCerveceria = headers.indexOf("Cervecería");
  const idxEstilo = headers.indexOf("Estilo");

  let cervecerias = new Set();
  let estilos = new Set();

  for (let i = 1; i < data.length; i++) {
    if (idxCerveceria >= 0 && data[i][idxCerveceria]) {
      cervecerias.add(data[i][idxCerveceria].toString().trim());
    }
    if (idxEstilo >= 0 && data[i][idxEstilo]) {
      estilos.add(data[i][idxEstilo].toString().trim());
    }
  }

  return {
    cervecerias: Array.from(cervecerias).sort(),
    estilos: Array.from(estilos).sort(),
    hasAiKey: aiStatus.hasAiKey,
    aiModel: aiStatus.aiModel
  };
}

function addCerveza(data) {
  const sheet = getSheet();
  ensureHeaders(sheet);
  const id = new Date().getTime().toString();

  const alcValue = data.alc !== undefined ? data.alc : (data["° ALC"] || "");
  const ibuValue = data.ibu !== undefined ? data.ibu : (data["IBU"] || "");

  let newRow = [
    id,
    data.fecha || "",
    data.nombre || "",
    data.cerveceria || "",
    data.estilo || "",
    alcValue,
    ibuValue,
    data.notaKarina || "Sin puntuar",
    data.notaGuillermo || "Sin puntuar",
    data.comentario || "",
    data.imagen || ""
  ];

  sheet.appendRow(newRow);
  return getCervezas();
}

function updateCerveza(data) {
  const sheet = getSheet();
  ensureHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  const imgColIndex = HEADERS.indexOf("Imagen");

  const alcValue = data.alc !== undefined ? data.alc : (data["° ALC"] || "");
  const ibuValue = data.ibu !== undefined ? data.ibu : (data["IBU"] || "");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === data.id.toString()) {
      const existingImage = imgColIndex >= 0 ? (rows[i][imgColIndex] || "") : "";
      const finalImage = data.removeImage
        ? ""
        : (data.imagen !== undefined && data.imagen !== "" ? data.imagen : existingImage);

      let updateRow = [
        data.id,
        data.fecha || "",
        data.nombre || "",
        data.cerveceria || "",
        data.estilo || "",
        alcValue,
        ibuValue,
        data.notaKarina || "Sin puntuar",
        data.notaGuillermo || "Sin puntuar",
        data.comentario || "",
        finalImage
      ];

      sheet.getRange(i + 1, 1, 1, HEADERS.length).setValues([updateRow]);
      break;
    }
  }
  return getCervezas();
}

function deleteCerveza(id) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === id.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return getCervezas();
}

// ============================================================================
// INTEGRACIÓN IA (GOOGLE GEMINI + BÚSQUEDA WEB EN TIEMPO REAL)
// ============================================================================

function getAiStatus() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("GEMINI_API_KEY") || "";
  const model = props.getProperty("GEMINI_MODEL") || DEFAULT_AI_MODEL;
  return {
    hasAiKey: Boolean(key && key.trim().length > 10),
    aiModel: model
  };
}

function saveAiConfig(payload) {
  const props = PropertiesService.getScriptProperties();
  if (payload.apiKey !== undefined) {
    props.setProperty("GEMINI_API_KEY", (payload.apiKey || "").trim());
  }
  if (payload.model) {
    props.setProperty("GEMINI_MODEL", payload.model.trim());
  }
  return {
    success: true,
    hasAiKey: Boolean(props.getProperty("GEMINI_API_KEY")),
    aiModel: props.getProperty("GEMINI_MODEL") || DEFAULT_AI_MODEL
  };
}

function discoverAvailableModels(apiKey) {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey);
    const res = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    const json = JSON.parse(res.getContentText());
    if (!json.models) return [];
    return json.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf("generateContent") !== -1)
      .map(m => m.name.replace(/^models\//, ""));
  } catch (e) {
    return [];
  }
}

function buildModelCandidateList(preferredModel, apiKey) {
  const priorityList = [
    preferredModel || DEFAULT_AI_MODEL,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash"
  ];

  const discovered = discoverAvailableModels(apiKey);
  if (discovered.length > 0) {
    // Si encontramos modelos 3.x o 4.x en la cuenta del usuario, priorizarlos también
    discovered.forEach(m => {
      if (m.indexOf("gemini") === 0 && m.indexOf("vision") === -1 && m.indexOf("embedding") === -1 && m.indexOf("tts") === -1) {
        if (priorityList.indexOf(m) === -1) {
          priorityList.push(m);
        }
      }
    });
  }

  // Filtrar duplicados preservando orden; si discovered no está vacío, poner primero los que existen en discovered
  const unique = [];
  priorityList.forEach(m => {
    if (m && unique.indexOf(m) === -1) unique.push(m);
  });

  if (discovered.length > 0) {
    const valid = unique.filter(m => discovered.indexOf(m) !== -1);
    const rest = unique.filter(m => discovered.indexOf(m) === -1);
    return valid.concat(rest);
  }
  return unique;
}

function analyzeBeerWithGemini(payload) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = (payload.apiKey || props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    return { error: "Falta configurar la API Key gratuita de Google Gemini en el botón ⚙️." };
  }

  const preferredModel = payload.model || props.getProperty("GEMINI_MODEL") || DEFAULT_AI_MODEL;
  const imageBase64 = payload.imageBase64 || "";
  const hintNombre = (payload.nombre || "").trim();
  const hintCerveceria = (payload.cerveceria || "").trim();
  const knownBreweries = (payload.knownBreweries || []).join(", ");
  const knownStyles = (payload.knownStyles || []).join(", ");

  if (!imageBase64 && !hintNombre && !hintCerveceria) {
    return { error: "Sube una foto o escribe el nombre/cervecería para buscar con IA." };
  }

  const promptText = [
    "Eres un maestro sommelier cervecero experto en cervezas artesanales y comerciales (especialmente de Chile, Latinoamérica y el mundo).",
    "Tu tarea es identificar la cerveza a partir de la foto de la botella/lata/etiqueta y/o las pistas de texto proporcionadas.",
    hintNombre ? ("Pista de Nombre escrita por el usuario: " + hintNombre) : "",
    hintCerveceria ? ("Pista de Cervecería escrita por el usuario: " + hintCerveceria) : "",
    knownBreweries ? ("Cervecerías ya registradas en la colección del usuario (usa exactamente el mismo nombre si coincide): " + knownBreweries) : "",
    knownStyles ? ("Estilos ya registrados en la colección del usuario: " + knownStyles) : "",
    "",
    "INSTRUCCIONES CRÍTICAS:",
    "1. Lee en la foto el Nombre de la cerveza y la Cervecería/Marca.",
    "2. Muchas veces en la foto frontal NO aparece el Estilo/Variedad, la graduación alcohólica (° ALC / % ABV) o el amargor (IBU).",
    "3. USA LA BÚSQUEDA WEB (Google Search) para buscar el nombre de la cerveza y su cervecería en internet (Untappd, web oficial de la cervecería, tiendas cerveceras como Casa de la Cerveza, Beervana, etc.) y obtener el Estilo exacto, ° ALC y el IBU oficial.",
    "4. Para 'alc' devuelve sólo el número (ejemplo: '5.5'). Para 'ibu' devuelve sólo el número entero (ejemplo: '25'), o '' si no existe dato.",
    "5. Responde ÚNICAMENTE con un objeto JSON válido, sin bloques markdown adicionales ni texto fuera del JSON, con esta estructura exacta:",
    '{',
    '  "nombre": "Nombre específico de la variedad/cerveza (sin repetir la marca si es obvia)",',
    '  "cerveceria": "Nombre de la Cervecería o Marca",',
    '  "estilo": "Estilo de cerveza (ej. Amber Lager, Hazy IPA, Oatmeal Stout, Fruit Beer...)",',
    '  "alc": "5.5",',
    '  "ibu": "18",',
    '  "notasSugeridas": "Breve descripción de cata de 1 oración sobre su perfil de sabor/aroma",',
    '  "fuente": "Etiqueta + Búsqueda Web"',
    '}'
  ].filter(Boolean).join("\n");

  const parts = [{ text: promptText }];

  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    let mimeType = "image/jpeg";
    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    if (mimeMatch && mimeMatch[1]) {
      mimeType = mimeMatch[1];
    }
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: cleanBase64
      }
    });
  }

  const candidateModels = buildModelCandidateList(preferredModel, apiKey);
  let lastError = "";

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];

    // Intento 1 con Google Search Grounding activado
    const groundedResult = callGeminiEndpoint(modelName, apiKey, parts, true);
    if (groundedResult.success) {
      groundedResult.data.modeloUsado = modelName;
      return { success: true, data: groundedResult.data };
    }

    // Si el modelo no soporta la herramienta google_search en ese endpoint, reintentar sin tool en el mismo modelo
    if (groundedResult.status === 400) {
      const standardResult = callGeminiEndpoint(modelName, apiKey, parts, false);
      if (standardResult.success) {
        standardResult.data.modeloUsado = modelName;
        return { success: true, data: standardResult.data };
      }
      lastError = standardResult.error || groundedResult.error;
    } else {
      lastError = groundedResult.error;
    }
  }

  return { error: "No se pudo analizar con Gemini: " + lastError };
}

function callGeminiEndpoint(modelName, apiKey, parts, useSearchGrounding) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelName) + ":generateContent?key=" + encodeURIComponent(apiKey);

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.2
    }
  };

  if (useSearchGrounding) {
    requestBody.tools = [{ google_search: {} }];
  } else {
    requestBody.generationConfig.responseMimeType = "application/json";
  }

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const rawText = response.getContentText();

    if (status !== 200) {
      return { status: status, success: false, error: "HTTP " + status + " (" + modelName + "): " + rawText.slice(0, 200) };
    }

    const json = JSON.parse(rawText);
    const candidate = json.candidates && json.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      return { status: status, success: false, error: "Respuesta vacía de " + modelName };
    }

    const fullText = candidate.content.parts.map(p => p.text || "").join("\n").trim();
    const parsedData = extractJsonFromText(fullText);
    if (!parsedData) {
      return { status: status, success: false, error: "Formato JSON inválido desde " + modelName };
    }

    return { status: 200, success: true, data: parsedData };
  } catch (err) {
    return { status: 500, success: false, error: err.message || String(err) };
  }
}

function extractJsonFromText(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.substring(start, end + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}
