const LINE = "#00ECF0";
const PAPER = "#ffffff";
const SEAT_COLOR = "#D4D4D4";
const UNDOC_COLORS = {
  staircase: "#FF5E00",
  small_infrastructure: "#FF8138",
  floor: "#FFA26D",
  portable_seating: "#FFC6A5",
};
const UNDOC_COLOR_DEFAULT = "#FF5E00";
const LINE_SCALE = 0.4;

/** 0 grey/documented … 4 hottest orange */
const HEAT_BY_CATEGORY = {
  documented: 0,
  portable_seating: 1,
  floor: 2,
  small_infrastructure: 3,
  staircase: 4,
};

function heatForCategory(categoryKey, kind) {
  if (kind === "documented") return 0;
  if (categoryKey in HEAT_BY_CATEGORY) return HEAT_BY_CATEGORY[categoryKey];
  return 4;
}

function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (ch === "\r") i++;
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function documentedToGeoJSON(text) {
  const rows = parseCsv(text, ",");
  if (!rows.length) return { type: "FeatureCollection", features: [] };

  const headers = rows[0].map((h) => h.replace(/^"|"$/g, ""));
  const latIdx = headers.indexOf("Latitude");
  const lngIdx = headers.indexOf("Longitude");
  const benchIdx = headers.indexOf("Asset_Subtype");
  const dateIdx = headers.indexOf("Installation Date");

  const features = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        kind: "documented",
        category: cols[benchIdx] || "",
        lng: cols[lngIdx] || "",
        lat: cols[latIdx] || "",
        date: cols[dateIdx] || "",
        heat: 0,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function undocumentedToGeoJSON(text) {
  const rows = parseCsv(text, ";");
  if (!rows.length) return { type: "FeatureCollection", features: [] };

  const headers = rows[0].map((h) => h.replace(/^"|"$/g, ""));
  const latIdx = headers.indexOf("_Record your current location_latitude");
  const lngIdx = headers.indexOf("_Record your current location_longitude");
  const typeIdx = headers.indexOf("type");
  const dateIdx = headers.indexOf("today");

  const features = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const categoryKey = cols[typeIdx] || "";
    const category = categoryKey.replace(/_/g, " ");

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        kind: "undocumented",
        category,
        categoryKey,
        lng: cols[lngIdx] || "",
        lat: cols[latIdx] || "",
        date: cols[dateIdx] || "",
        heat: heatForCategory(categoryKey, "undocumented"),
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function communityToGeoJSON(text) {
  const rows = parseCsv(text, ",");
  if (rows.length < 2) return { type: "FeatureCollection", features: [] };

  const headers = rows[0].map((h) => h.replace(/^"|"$/g, "").trim());
  const lngIdx = headers.indexOf("longitude");
  const latIdx = headers.indexOf("latitude");
  const catIdx = headers.indexOf("category");
  const dateIdx = headers.indexOf("observed_date");
  const rateIdx = headers.indexOf("rate");
  const commentIdx = headers.indexOf("comment");

  const features = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols.length || cols.every((c) => !String(c).trim())) continue;

    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const categoryKey = (cols[catIdx] || "").trim();
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        kind: "undocumented",
        category: categoryKey.replace(/_/g, " "),
        categoryKey,
        lng: String(lng),
        lat: String(lat),
        date: cols[dateIdx] || "",
        rate: cols[rateIdx] || "",
        comment: cols[commentIdx] || "",
        heat: heatForCategory(categoryKey, "undocumented"),
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function mergeFeatureCollections(...collections) {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((c) => c.features || []),
  };
}

let undocumentedData = { type: "FeatureCollection", features: [] };

const seatPopup = document.getElementById("seat-popup");
const seatPopupType = document.getElementById("seat-popup-type");
const seatPopupCategoryLabel = document.getElementById("seat-popup-category-label");
const seatPopupCategory = document.getElementById("seat-popup-category");
const seatPopupLng = document.getElementById("seat-popup-lng");
const seatPopupLat = document.getElementById("seat-popup-lat");
const seatPopupDateLabel = document.getElementById("seat-popup-date-label");
const seatPopupDate = document.getElementById("seat-popup-date");
const seatPopupClose = document.querySelector(".seat-popup__close");

function showSeatPopup(props, point) {
  const isUndoc = props.kind === "undocumented";

  seatPopupType.textContent = isUndoc ? "undocumented" : "documented";
  seatPopupCategoryLabel.textContent = isUndoc ? "category" : "bench";
  seatPopupCategory.textContent = props.category || "—";
  seatPopupLng.textContent = props.lng || "—";
  seatPopupLat.textContent = props.lat || "—";
  seatPopupDateLabel.textContent = isUndoc ? "observed date" : "installed date";
  seatPopupDate.textContent = props.date || "—";

  seatPopup.hidden = false;
  seatPopup.classList.remove("is-hidden");

  const offset = 14;
  const mapRect = map.getContainer().getBoundingClientRect();
  const pad = 8;

  let x = mapRect.left + point.x + offset;
  let y = mapRect.top + point.y + offset;

  const popupW = seatPopup.offsetWidth;
  const popupH = seatPopup.offsetHeight;

  if (x + popupW + pad > window.innerWidth) {
    x = mapRect.left + point.x - popupW - offset;
  }
  if (y + popupH + pad > window.innerHeight) {
    y = mapRect.top + point.y - popupH - offset;
  }

  x = Math.max(pad, Math.min(x, window.innerWidth - popupW - pad));
  y = Math.max(pad, Math.min(y, window.innerHeight - popupH - pad));

  seatPopup.style.left = `${x}px`;
  seatPopup.style.top = `${y}px`;
}

function hideSeatPopup() {
  seatPopup.classList.add("is-hidden");
  seatPopup.hidden = true;
}

seatPopupClose?.addEventListener("click", hideSeatPopup);

const POINT_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  1,
  13,
  3,
  16,
  6,
  18,
  9,
];

const UNDOC_CIRCLE_COLOR = [
  "match",
  ["get", "categoryKey"],
  "staircase",
  UNDOC_COLORS.staircase,
  "small_infrastructure",
  UNDOC_COLORS.small_infrastructure,
  "floor",
  UNDOC_COLORS.floor,
  "portable_seating",
  UNDOC_COLORS.portable_seating,
  UNDOC_COLOR_DEFAULT,
];

function showMapError(message) {
  const el = document.getElementById("map");
  if (!el) return;
  el.classList.add("map-error");
  el.textContent = message;
}

if (typeof maplibregl === "undefined") {
  showMapError("map library failed to load — refresh or check network");
  throw new Error("maplibregl missing");
}

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: [-73.9995, 40.7165],
  zoom: 14,
  pitch: 0,
  bearing: 0,
  maxPitch: 0,
  attributionControl: false,
});

window.addUndocumentedFeature = function addUndocumentedFeature(feature) {
  const source = map.getSource("undocumented");
  if (!source) return;

  if (feature?.properties && feature.properties.heat == null) {
    feature.properties.heat = heatForCategory(
      feature.properties.categoryKey,
      feature.properties.kind
    );
  }

  undocumentedData = {
    type: "FeatureCollection",
    features: [...undocumentedData.features, feature],
  };
  source.setData(undocumentedData);
};

window.resizeCareMap = function resizeCareMap() {
  try {
    map.resize();
  } catch (_) {
    /* map not ready */
  }
};

window.applyHeatFilter = function applyHeatFilter(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const filter = [
    "all",
    [">=", ["to-number", ["get", "heat"]], lo],
    ["<=", ["to-number", ["get", "heat"]], hi],
  ];

  if (map.getLayer("seating-points")) {
    map.setFilter("seating-points", filter);
  }
  if (map.getLayer("undocumented-points")) {
    map.setFilter("undocumented-points", filter);
  }
};

map.on("error", (e) => {
  console.error("Map error:", e.error || e);
});

window.addEventListener("resize", () => map.resize());

function setPaint(id, prop, value) {
  try {
    map.setPaintProperty(id, prop, value);
  } catch (_) {
    /* layer may not support this paint property */
  }
}

function scaleLineWidth(expr, factor) {
  if (typeof expr === "number") {
    return Math.max(0.15, +(expr * factor).toFixed(2));
  }
  if (!Array.isArray(expr)) return expr;

  if (
    expr[0] === "interpolate" ||
    expr[0] === "interpolate-hcl" ||
    expr[0] === "interpolate-lab"
  ) {
    const out = expr.slice(0, 3);
    for (let i = 3; i < expr.length; i += 2) {
      out.push(expr[i]);
      out.push(scaleLineWidth(expr[i + 1], factor));
    }
    return out;
  }

  if (expr[0] === "step") {
    const out = [expr[0], expr[1], scaleLineWidth(expr[2], factor)];
    for (let i = 3; i < expr.length; i += 2) {
      out.push(expr[i]);
      out.push(scaleLineWidth(expr[i + 1], factor));
    }
    return out;
  }

  return expr;
}

function bindPointLayer(layerId) {
  map.on("click", layerId, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    // pass coords to form if panel is open, then still show popup
    if (typeof window.onMapPickLocation === "function") {
      window.onMapPickLocation(e.lngLat.lng, e.lngLat.lat);
    }
    e.originalEvent?.stopPropagation?.();
    showSeatPopup(feature.properties, e.point);
  });

  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const raw = await res.text();
  if (!raw) throw new Error(`${url} → empty response`);
  return JSON.parse(raw);
}

map.on("load", async () => {
  map.resize();

  const style = map.getStyle();
  for (const layer of style.layers || []) {
    const id = layer.id;
    const type = layer.type;

    if (type === "background") {
      setPaint(id, "background-color", PAPER);
    } else if (type === "fill") {
      setPaint(id, "fill-color", PAPER);
      setPaint(id, "fill-outline-color", LINE);
    } else if (type === "line") {
      setPaint(id, "line-color", LINE);
      const width = map.getPaintProperty(id, "line-width");
      if (width !== undefined) {
        setPaint(id, "line-width", scaleLineWidth(width, LINE_SCALE));
      }
    } else if (type === "symbol") {
      try {
        map.setLayoutProperty(id, "visibility", "none");
      } catch (_) {
        /* ignore */
      }
    }
  }

  try {
    const boundary = await fetchJson("data/chinatown.geojson");

    let seats = { type: "FeatureCollection", features: [] };
    let fieldUndoc = { type: "FeatureCollection", features: [] };
    let community = { type: "FeatureCollection", features: [] };

    try {
      seats = documentedToGeoJSON(await fetchText("data/Seating_Locations_20260319.csv"));
    } catch (err) {
      console.error(err);
    }

    try {
      fieldUndoc = undocumentedToGeoJSON(await fetchText("data/0724_undocumented_seatings.csv"));
    } catch (err) {
      console.error(err);
    }

    try {
      community = communityToGeoJSON(await fetchText("data/community_seatings.csv"));
    } catch (err) {
      console.error(err);
    }

    undocumentedData = mergeFeatureCollections(fieldUndoc, community);

    map.addSource("seating", { type: "geojson", data: seats });
    map.addLayer({
      id: "seating-points",
      type: "circle",
      source: "seating",
      paint: {
        "circle-radius": POINT_RADIUS,
        "circle-color": SEAT_COLOR,
        "circle-opacity": 0.9,
      },
    });

    map.addSource("undocumented", { type: "geojson", data: undocumentedData });
    map.addLayer({
      id: "undocumented-points",
      type: "circle",
      source: "undocumented",
      paint: {
        "circle-radius": POINT_RADIUS,
        "circle-color": UNDOC_CIRCLE_COLOR,
        "circle-opacity": 0.95,
      },
    });

    bindPointLayer("seating-points");
    bindPointLayer("undocumented-points");

    map.on("click", (e) => {
      if (
        typeof window.onMapPickLocation === "function" &&
        window.onMapPickLocation(e.lngLat.lng, e.lngLat.lat)
      ) {
        return;
      }

      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["seating-points", "undocumented-points"],
      });
      if (!hits.length) hideSeatPopup();
    });

    map.addSource("chinatown", { type: "geojson", data: boundary });
    map.addLayer({
      id: "chinatown-boundary",
      type: "line",
      source: "chinatown",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": LINE,
        "line-width": 1.25,
        "line-opacity": 1,
      },
    });

    const coords = boundary.features[0].geometry.coordinates;
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );

    map.fitBounds(bounds, {
      padding: { top: 90, bottom: 100, left: 100, right: 300 },
      duration: 0,
      bearing: 0,
    });

    map.resize();
    if (typeof window.applyHeatFilter === "function") {
      window.applyHeatFilter(0, 4);
    }
  } catch (err) {
    console.error(err);
  }
});
