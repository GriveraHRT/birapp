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

const DEFAULT_AI_MODEL = "gemini-4-hydrogen";
const AI_FALLBACK_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
];
const MAX_CELL_IMAGE_CHARS = 49500;

function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || "").trim() : "";

  if (action === "getBootstrap") {
    return jsonResponse(getBootstrap());
  } else if (action === "getCervezas") {
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
    const rawPayload = (e && e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : (e && e.postData && e.postData.contents ? e.postData.contents : "{}");
    data = JSON.parse(rawPayload);
  } catch (err) {
    return jsonResponse({ error: true, message: "Invalid JSON: " + err.message });
  }

  const action = data.action;
  const itemData = data.data || data.payload || data;
  let result;

  try {
    if (action === "addCerveza") {
      result = addCerveza(itemData);
    } else if (action === "updateCerveza") {
      result = updateCerveza(itemData);
    } else if (action === "deleteCerveza") {
      result = deleteCerveza(data.id || itemData.id);
    } else if (action === "saveAiConfig") {
      result = saveAiConfig(itemData);
    } else if (action === "analyzeBeerImage") {
      result = analyzeBeerWithGemini(itemData);
    } else if (action === "testAiConfig") {
      result = testAiConfig(itemData);
    } else {
      return jsonResponse({ error: true, message: "Invalid POST action: " + action });
    }
  } catch (err) {
    return jsonResponse({ error: true, message: err.message || String(err) });
  }

  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

// Solo escribe/estiliza encabezados cuando la hoja está vacía o los encabezados no coinciden
function ensureHeaders(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    const matches = HEADERS.every(function (header, idx) {
      return String(currentHeaders[idx] || "").trim() === header;
    });
    if (matches) return;
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#3e2723")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function withScriptLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    throw new Error("Otro dispositivo está guardando en este momento. Intenta de nuevo en unos segundos.");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function normalizeAlcValue(val) {
  if (val === undefined || val === null) return "";
  return String(val)
    .replace(/,/g, ".")
    .replace(/[%°]/g, "")
    .replace(/\b(alc|abv)\b/gi, "")
    .trim();
}

function normalizeIbuValue(val) {
  if (val === undefined || val === null) return "";
  const cleaned = String(val).replace(/ibu/gi, "").replace(/[^\d.]/g, "").trim();
  if (!cleaned) return "";
  const num = parseFloat(cleaned);
  return isNaN(num) ? "" : String(Math.round(num));
}

function getCervezas() {
  const sheet = getSheet();
  ensureHeaders(sheet);

  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];

  const rows = data.slice(1);
  return rows
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || "").trim() !== "";
      });
    })
    .map(function (row) {
      const cerveza = {};
      HEADERS.forEach(function (header, index) {
        cerveza[header] = row[index] !== undefined ? row[index] : "";
      });
      return cerveza;
    })
    .reverse();
}

function extractSuggestionsFromCervezas(cervezas) {
  const cerveceriasMap = {};
  const estilosMap = {};

  cervezas.forEach(function (beer) {
    const c = String(beer["Cervecería"] || "").trim();
    const s = String(beer["Estilo"] || "").trim();
    if (c) cerveceriasMap[c] = true;
    if (s) estilosMap[s] = true;
  });

  return {
    cervecerias: Object.keys(cerveceriasMap).sort(),
    estilos: Object.keys(estilosMap).sort()
  };
}

function getSuggestions() {
  const cervezas = getCervezas();
  const lists = extractSuggestionsFromCervezas(cervezas);
  const aiStatus = getAiStatus();

  return {
    cervecerias: lists.cervecerias,
    estilos: lists.estilos,
    hasAiKey: aiStatus.hasAiKey,
    aiModel: aiStatus.aiModel
  };
}

function getBootstrap() {
  const cervezas = getCervezas();
  const lists = extractSuggestionsFromCervezas(cervezas);
  const aiStatus = getAiStatus();

  return {
    cervezas: cervezas,
    cervecerias: lists.cervecerias,
    estilos: lists.estilos,
    hasAiKey: aiStatus.hasAiKey,
    aiModel: aiStatus.aiModel,
    serverTime: new Date().toISOString()
  };
}

function addCerveza(data) {
  return withScriptLock(function () {
    const sheet = getSheet();
    ensureHeaders(sheet);

    const clientId = data.clientId ? String(data.clientId).trim() : "";
    const lastRow = sheet.getLastRow();

    // Idempotencia para reintentos de cola offline
    if (clientId && lastRow > 1) {
      const existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (let i = 0; i < existingIds.length; i++) {
        if (String(existingIds[i][0] || "").trim() === clientId) {
          return getCervezas();
        }
      }
    }

    const imagen = data.imagen ? String(data.imagen) : "";
    if (imagen.length > MAX_CELL_IMAGE_CHARS) {
      throw new Error("La imagen supera el límite de Google Sheets (" + imagen.length + " caracteres). Comprímela más e intenta de nuevo.");
    }

    const id = clientId || (Date.now().toString() + "-" + Math.floor(Math.random() * 900 + 100));
    const alcValue = normalizeAlcValue(data.alc !== undefined ? data.alc : data["° ALC"]);
    const ibuValue = normalizeIbuValue(data.ibu !== undefined ? data.ibu : data["IBU"]);

    const newRow = [
      id,
      String(data.fecha || ""),
      String(data.nombre || "").trim(),
      String(data.cerveceria || "").trim(),
      String(data.estilo || "").trim(),
      alcValue,
      ibuValue,
      String(data.notaKarina || "Sin puntuar"),
      String(data.notaGuillermo || "Sin puntuar"),
      String(data.comentario || "").trim(),
      imagen
    ];

    const nextRow = Math.max(lastRow + 1, 2);
    // Forzar ID y Fecha como texto plano para evitar que Sheets invierta DD/MM a MM/DD
    sheet.getRange(nextRow, 1, 1, 2).setNumberFormat("@");
    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([newRow]);
    SpreadsheetApp.flush();
    return getCervezas();
  });
}

function updateCerveza(data) {
  return withScriptLock(function () {
    const targetId = data.id !== undefined && data.id !== null ? String(data.id).trim() : "";
    if (!targetId) {
      throw new Error("Falta el ID de la cerveza a actualizar.");
    }

    const sheet = getSheet();
    ensureHeaders(sheet);
    const rows = sheet.getDataRange().getDisplayValues();
    const imgColIndex = HEADERS.indexOf("Imagen");

    const alcValue = normalizeAlcValue(data.alc !== undefined ? data.alc : data["° ALC"]);
    const ibuValue = normalizeIbuValue(data.ibu !== undefined ? data.ibu : data["IBU"]);

    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim() === targetId) {
        const existingImage = imgColIndex >= 0 ? (rows[i][imgColIndex] || "") : "";
        const finalImage = data.removeImage
          ? ""
          : (data.imagen !== undefined && data.imagen !== "" ? String(data.imagen) : existingImage);

        if (finalImage.length > MAX_CELL_IMAGE_CHARS) {
          throw new Error("La imagen supera el límite de Google Sheets (" + finalImage.length + " caracteres). Comprímela más e intenta de nuevo.");
        }

        const updateRow = [
          targetId,
          String(data.fecha || ""),
          String(data.nombre || "").trim(),
          String(data.cerveceria || "").trim(),
          String(data.estilo || "").trim(),
          alcValue,
          ibuValue,
          String(data.notaKarina || "Sin puntuar"),
          String(data.notaGuillermo || "Sin puntuar"),
          String(data.comentario || "").trim(),
          finalImage
        ];

        sheet.getRange(i + 1, 1, 1, 2).setNumberFormat("@");
        sheet.getRange(i + 1, 1, 1, HEADERS.length).setValues([updateRow]);
        SpreadsheetApp.flush();
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        error: true,
        message: "No se encontró el registro en la planilla (pudo haberse eliminado desde otro dispositivo)."
      };
    }

    return getCervezas();
  });
}

function deleteCerveza(id) {
  return withScriptLock(function () {
    const targetId = id !== undefined && id !== null ? String(id).trim() : "";
    const sheet = getSheet();
    if (!targetId) return getCervezas();

    const rows = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim() === targetId) {
        sheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        break;
      }
    }
    return getCervezas();
  });
}

// ============================================================================
// INTEGRACIÓN IA (GEMINI 4 HYDROGEN / 3.8 FLASH + BÚSQUEDA WEB EN 2 FASES)
// ============================================================================

function normalizeAiModel(modelName) {
  const m = String(modelName || "").trim();
  if (!m || m.indexOf("gemini-2.") === 0 || m === "gemini-3.1-pro-preview") {
    return DEFAULT_AI_MODEL;
  }
  return m;
}

function getAiStatus() {
  const props = PropertiesService.getScriptProperties();
  const key = (props.getProperty("GEMINI_API_KEY") || "").trim();
  const model = normalizeAiModel(props.getProperty("GEMINI_MODEL"));
  return {
    hasAiKey: Boolean(key && key.length > 10),
    aiModel: model
  };
}

function saveAiConfig(payload) {
  const props = PropertiesService.getScriptProperties();

  if (payload && payload.clearApiKey === true) {
    props.deleteProperty("GEMINI_API_KEY");
  } else if (payload && typeof payload.apiKey === "string" && payload.apiKey.trim().length > 0) {
    props.setProperty("GEMINI_API_KEY", payload.apiKey.trim());
  }

  if (payload && typeof payload.model === "string" && payload.model.trim().length > 0) {
    props.setProperty("GEMINI_MODEL", normalizeAiModel(payload.model));
  }

  const status = getAiStatus();
  return {
    success: true,
    hasAiKey: status.hasAiKey,
    aiModel: status.aiModel
  };
}

function buildModelCandidateList(preferredModel) {
  const raw = [normalizeAiModel(preferredModel)].concat(AI_FALLBACK_MODELS);
  const unique = [];
  raw.forEach(function (m) {
    if (m && unique.indexOf(m) === -1) unique.push(m);
  });
  return unique;
}

function buildThinkingConfig(modelName, phase) {
  const m = String(modelName || "").toLowerCase();
  if (m.indexOf("flash-lite") !== -1) {
    return { thinkingLevel: phase === "vision" ? "MINIMAL" : "LOW" };
  }
  if (m.indexOf("gemini-4") !== -1 || m.indexOf("gemini-3") !== -1) {
    // gemini-4-hydrogen, gemini-4-argon y gemini-3.8-flash requieren mínimo "LOW" ("MINIMAL" da 400)
    return { thinkingLevel: "LOW" };
  }
  return null;
}

function supportsTemperature(modelName) {
  return String(modelName || "").toLowerCase().indexOf("gemini-4") !== 0;
}

function isAuthError(status, rawText) {
  return status === 401 || status === 403 || (rawText && rawText.indexOf("API_KEY_INVALID") !== -1);
}

function isThinkingError(status, rawText) {
  return status === 400 && rawText && rawText.toLowerCase().indexOf("thinking") !== -1;
}

function analyzeBeerWithGemini(payload) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = (payload.apiKey || props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    return { error: "Falta configurar la API Key gratuita de Google Gemini en el botón ✨." };
  }

  const preferredModel = normalizeAiModel(payload.model || props.getProperty("GEMINI_MODEL"));
  const imageBase64 = payload.imageBase64 || "";
  const hintNombre = String(payload.nombre || "").trim();
  const hintCerveceria = String(payload.cerveceria || "").trim();
  const knownBreweries = Array.isArray(payload.knownBreweries) ? payload.knownBreweries.slice(0, 60).join(", ") : "";
  const knownStyles = Array.isArray(payload.knownStyles) ? payload.knownStyles.slice(0, 60).join(", ") : "";

  if (!imageBase64 && !hintNombre && !hintCerveceria) {
    return { error: "Sube una foto o escribe el nombre/cervecería para buscar con IA." };
  }

  const candidateModels = buildModelCandidateList(preferredModel);
  let lastError = "";
  let merged = {
    nombre: hintNombre,
    cerveceria: hintCerveceria,
    estilo: "",
    alc: "",
    ibu: "",
    notasSugeridas: "",
    estiloLeidoEnEtiqueta: false,
    alcLeidoEnEtiqueta: false,
    ibuLeidoEnEtiqueta: false,
    fuentesWeb: [],
    fuente: "",
    modeloUsado: preferredModel
  };

  // FASE 1: Lectura visual directa sin google_search (rápida y estructurada)
  if (imageBase64) {
    const visionPrompt = [
      "Eres un maestro sommelier cervecero. Extrae únicamente lo que puedas leer con claridad en la foto de la botella, lata o etiqueta.",
      hintNombre ? ("Pista de Nombre escrita por el usuario: " + hintNombre) : "",
      hintCerveceria ? ("Pista de Cervecería escrita por el usuario: " + hintCerveceria) : "",
      knownBreweries ? ("Cervecerías ya registradas por el usuario (usa el mismo nombre exacto si coincide): " + knownBreweries) : "",
      knownStyles ? ("Estilos ya registrados por el usuario (úsalos como referencia si coincide): " + knownStyles) : "",
      "REGLA CRÍTICA: NO inventes ni estimes °ALC, IBU o Estilo si NO aparecen impresos en la foto. Si no son visibles en la etiqueta, deja ese campo en '' y marca su booleano *LeidoEnEtiqueta en false para buscarlo en la web en el siguiente paso.",
      "Para 'alc' devuelve solo el número (ej. '5.5'). Para 'ibu' solo el entero (ej. '25')."
    ].filter(Boolean).join("\n");

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    let mimeType = "image/jpeg";
    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    if (mimeMatch && mimeMatch[1]) mimeType = mimeMatch[1];

    const visionParts = [
      { text: visionPrompt },
      { inline_data: { mime_type: mimeType, data: cleanBase64 } }
    ];

    const visionSchema = {
      type: "OBJECT",
      properties: {
        nombre: { type: "STRING" },
        cerveceria: { type: "STRING" },
        estilo: { type: "STRING" },
        alc: { type: "STRING" },
        ibu: { type: "STRING" },
        notasSugeridas: { type: "STRING" },
        estiloLeidoEnEtiqueta: { type: "BOOLEAN" },
        alcLeidoEnEtiqueta: { type: "BOOLEAN" },
        ibuLeidoEnEtiqueta: { type: "BOOLEAN" }
      },
      required: ["nombre", "cerveceria", "estilo", "alc", "ibu", "estiloLeidoEnEtiqueta", "alcLeidoEnEtiqueta", "ibuLeidoEnEtiqueta"]
    };

    let visionSucceeded = false;
    for (let i = 0; i < candidateModels.length; i++) {
      const modelName = candidateModels[i];
      const res = callGeminiEndpoint(modelName, apiKey, visionParts, {
        useSearchGrounding: false,
        responseSchema: visionSchema,
        phase: "vision"
      });
      if (res.success) {
        const d = res.data;
        merged.nombre = String(d.nombre || merged.nombre || "").trim();
        merged.cerveceria = String(d.cerveceria || merged.cerveceria || "").trim();
        merged.estilo = String(d.estilo || "").trim();
        merged.alc = normalizeAlcValue(d.alc);
        merged.ibu = normalizeIbuValue(d.ibu);
        merged.notasSugeridas = String(d.notasSugeridas || "").trim();
        merged.estiloLeidoEnEtiqueta = Boolean(d.estiloLeidoEnEtiqueta && merged.estilo);
        merged.alcLeidoEnEtiqueta = Boolean(d.alcLeidoEnEtiqueta && merged.alc);
        merged.ibuLeidoEnEtiqueta = Boolean(d.ibuLeidoEnEtiqueta && merged.ibu);
        merged.modeloUsado = modelName;
        merged.fuente = "Lectura Etiqueta";
        visionSucceeded = true;
        break;
      }
      lastError = res.error;
      if (res.authFatal) {
        return { error: "API Key de Gemini inválida o sin permisos: " + res.error };
      }
    }

    if (!visionSucceeded && !merged.nombre && !merged.cerveceria) {
      return { error: "No se pudo leer la foto con Gemini: " + lastError };
    }
  }

  // FASE 2: Búsqueda web acotada si no hay imagen o faltan specs verificados de la etiqueta
  const needsWebLookup = !imageBase64 ||
    !merged.estilo ||
    !merged.alc ||
    !merged.ibu ||
    !merged.estiloLeidoEnEtiqueta ||
    !merged.alcLeidoEnEtiqueta ||
    !merged.ibuLeidoEnEtiqueta;

  if (needsWebLookup && (merged.nombre || merged.cerveceria)) {
    const webPrompt = [
      "Busca en la web la ficha técnica oficial de la cerveza \"" + merged.nombre + "\" de la cervecería \"" + merged.cerveceria + "\" (Chile / artesanal / Untappd / sitio oficial).",
      knownBreweries ? ("Cervecerías ya registradas por el usuario (usa el mismo nombre exacto si coincide): " + knownBreweries) : "",
      knownStyles ? ("Estilos ya registrados por el usuario (usa uno si coincide exactamente): " + knownStyles) : "",
      "Obtén su Estilo exacto, °ALC (% ABV, solo número ej '5.5') e IBU (solo número entero ej '18', o '' si la cervecería no lo publica) y una breve nota de cata en español de 1 oración.",
      "Responde ÚNICAMENTE con un objeto JSON válido sin bloques markdown ni texto adicional:",
      '{"nombre":"","cerveceria":"","estilo":"","alc":"","ibu":"","notasSugeridas":""}'
    ].filter(Boolean).join("\n");

    for (let i = 0; i < candidateModels.length; i++) {
      const modelName = candidateModels[i];
      const webRes = callGeminiEndpoint(modelName, apiKey, [{ text: webPrompt }], {
        useSearchGrounding: true,
        responseSchema: null,
        phase: "web"
      });
      if (webRes.success) {
        const w = webRes.data;
        if (!merged.nombre && w.nombre) merged.nombre = String(w.nombre).trim();
        if (!merged.cerveceria && w.cerveceria) merged.cerveceria = String(w.cerveceria).trim();
        if ((!merged.estilo || !merged.estiloLeidoEnEtiqueta) && w.estilo) {
          merged.estilo = String(w.estilo).trim();
        }
        if ((!merged.alc || !merged.alcLeidoEnEtiqueta) && w.alc) {
          merged.alc = normalizeAlcValue(w.alc) || merged.alc;
        }
        if ((!merged.ibu || !merged.ibuLeidoEnEtiqueta) && w.ibu) {
          merged.ibu = normalizeIbuValue(w.ibu) || merged.ibu;
        }
        if (!merged.notasSugeridas && w.notasSugeridas) {
          merged.notasSugeridas = String(w.notasSugeridas).trim();
        }
        merged.fuentesWeb = webRes.sources || [];
        merged.modeloUsado = modelName;
        merged.fuente = imageBase64 ? "Etiqueta + Búsqueda Web" : "Búsqueda Web";
        break;
      }
      lastError = webRes.error;
      if (webRes.authFatal) {
        return { error: "API Key de Gemini inválida o sin permisos: " + res.error };
      }
    }
  }

  if (!merged.nombre && !merged.cerveceria && !merged.estilo && !merged.alc) {
    return { error: "No se pudo identificar la cerveza: " + lastError };
  }

  return { success: true, data: merged };
}

function testAiConfig(payload) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = (payload.apiKey || props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    return { error: "Falta ingresar una API Key para probar." };
  }

  const modelName = normalizeAiModel(payload.model || props.getProperty("GEMINI_MODEL"));
  const started = Date.now();
  const res = callGeminiEndpoint(
    modelName,
    apiKey,
    [{
      text: 'Busca en la web la cerveza chilena "Kunstmann Torobayo" y responde SOLO con JSON válido: {"cerveza":"Kunstmann Torobayo","estilo":"","alc":""}'
    }],
    {
      useSearchGrounding: true,
      responseSchema: null,
      phase: "web"
    }
  );

  if (!res.success) {
    return { error: res.error };
  }

  return {
    success: true,
    model: modelName,
    webOk: Boolean(res.sources && res.sources.length > 0),
    sources: res.sources || [],
    elapsedMs: Date.now() - started,
    sample: res.data
  };
}

function callGeminiEndpoint(modelName, apiKey, parts, options) {
  const opts = options || {};
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelName) + ":generateContent";

  const generationConfig = {};
  if (supportsTemperature(modelName)) {
    generationConfig.temperature = 0.1;
  }

  if (!opts.skipThinking) {
    const thinkingCfg = buildThinkingConfig(modelName, opts.phase || "web");
    if (thinkingCfg) {
      generationConfig.thinkingConfig = thinkingCfg;
    }
  }

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: generationConfig
  };

  if (opts.useSearchGrounding) {
    // Nunca mezclar google_search con responseMimeType: application/json (provoca HTTP 400)
    requestBody.tools = [{ google_search: {} }];
  } else {
    generationConfig.responseMimeType = "application/json";
    if (opts.responseSchema) {
      generationConfig.responseSchema = opts.responseSchema;
    }
  }

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-goog-api-key": apiKey
      },
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const rawText = response.getContentText();

    if (status !== 200) {
      if (!opts.skipThinking && isThinkingError(status, rawText)) {
        return callGeminiEndpoint(modelName, apiKey, parts, {
          useSearchGrounding: opts.useSearchGrounding,
          responseSchema: opts.responseSchema,
          phase: opts.phase,
          skipThinking: true
        });
      }
      return {
        status: status,
        success: false,
        authFatal: isAuthError(status, rawText),
        error: "HTTP " + status + " (" + modelName + "): " + rawText.slice(0, 200)
      };
    }

    const json = JSON.parse(rawText);
    const candidate = json.candidates && json.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      return { status: status, success: false, error: "Respuesta vacía de " + modelName };
    }

    const fullText = candidate.content.parts.map(function (p) { return p.text || ""; }).join("\n").trim();
    const parsedData = extractJsonFromText(fullText);
    if (!parsedData) {
      return { status: status, success: false, error: "Formato JSON inválido desde " + modelName };
    }

    const sources = extractGroundingSources(candidate.groundingMetadata);
    return { status: 200, success: true, data: parsedData, sources: sources };
  } catch (err) {
    return { status: 500, success: false, error: err.message || String(err) };
  }
}

function extractGroundingSources(metadata) {
  if (!metadata || !metadata.groundingChunks) return [];
  const seen = {};
  const list = [];
  metadata.groundingChunks.forEach(function (chunk) {
    if (chunk && chunk.web) {
      const label = String(chunk.web.title || chunk.web.uri || "").trim();
      if (label && !seen[label]) {
        seen[label] = true;
        list.push(label);
      }
    }
  });
  return list.slice(0, 4);
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
