const LINE = "#01E1E5";
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

function setSelectedPointGlow(lng, lat, mode = "pick") {
  if (!map.getSource("selected-point")) return;
  map.getSource("selected-point").setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
        properties: { mode },
      },
    ],
  });
}

function clearSelectedPointGlow() {
  if (!map.getSource("selected-point")) return;
  map.getSource("selected-point").setData({
    type: "FeatureCollection",
    features: [],
  });
}

let popupAnchor = null;

function positionSeatPopup() {
  if (!popupAnchor || seatPopup.hidden || seatPopup.classList.contains("is-hidden")) {
    return;
  }

  const point = map.project([popupAnchor.lng, popupAnchor.lat]);
  const mapRect = map.getContainer().getBoundingClientRect();
  const pad = 8;
  const offset = 8;

  seatPopup.hidden = false;
  seatPopup.classList.remove("is-hidden");

  const popupW = seatPopup.offsetWidth || 240;
  const popupH = seatPopup.offsetHeight || 160;

  let x = mapRect.left + point.x + offset;
  let y = mapRect.top + point.y - popupH / 2;

  // flip to left if it would overflow the right edge
  if (x + popupW + pad > window.innerWidth) {
    x = mapRect.left + point.x - popupW - offset;
  }
  // keep vertically near the point
  if (y < pad) y = pad;
  if (y + popupH + pad > window.innerHeight) {
    y = window.innerHeight - popupH - pad;
  }

  x = Math.max(pad, Math.min(x, window.innerWidth - popupW - pad));

  seatPopup.style.left = `${x}px`;
  seatPopup.style.top = `${y}px`;
}

function showSeatPopup(props, _point, lngLat) {
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

  if (lngLat) {
    popupAnchor = { lng: lngLat.lng, lat: lngLat.lat };
    // existing seats: mint glow only (no solid mint core on top)
    setSelectedPointGlow(lngLat.lng, lngLat.lat, "select");
  }

  positionSeatPopup();
}

function hideSeatPopup() {
  seatPopup.classList.add("is-hidden");
  seatPopup.hidden = true;
  popupAnchor = null;
  // keep mint pick marker visible even after the popup closes
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

window.applyAxesFilter = function applyAxesFilter(selected) {
  const active = new Set(selected);

  if (map.getLayer("seating-points")) {
    map.setFilter(
      "seating-points",
      active.has("doc-public") ? null : ["==", ["get", "kind"], "__none__"]
    );
  }

  if (map.getLayer("undocumented-points")) {
    const cats = [];
    if (active.has("undoc-individual")) {
      cats.push(
        "portable_seating",
        "small_infrastructure",
        "floor",
        "cars",
        "building_infrastructures",
        "building_scaffolding"
      );
    }
    if (active.has("undoc-public")) {
      cats.push("staircase");
    }

    if (!cats.length) {
      map.setFilter("undocumented-points", ["==", ["get", "kind"], "__none__"]);
    } else {
      map.setFilter("undocumented-points", [
        "in",
        ["get", "categoryKey"],
        ["literal", cats],
      ]);
    }
  }
};

// keep old name as alias during transition
window.applyHeatFilter = function applyHeatFilter() {
  window.applyAxesFilter?.(["doc-public", "undoc-individual", "undoc-public"]);
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
    e.originalEvent?.stopPropagation?.();

    // fill form coords if open, but don't pan — keep popup glued to the point
    if (typeof window.onMapPickLocation === "function") {
      window.onMapPickLocation(e.lngLat.lng, e.lngLat.lat, { pan: false });
    }

    showSeatPopup(feature.properties, e.point, e.lngLat);
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
      let communityText;
      try {
        communityText = await fetchText("/api/seatings");
      } catch (_) {
        communityText = await fetchText("data/community_seatings.csv");
      }
      community = communityToGeoJSON(communityText);
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
        "circle-stroke-width": 0,
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
        "circle-stroke-width": 0,
      },
    });

    // mint glow for selected seats; solid core only for new map picks
    map.addSource("selected-point", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "selected-point-glow",
      type: "circle",
      source: "selected-point",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          8.4,
          13,
          14,
          16,
          21,
          18,
          28,
        ],
        "circle-color": LINE,
        "circle-opacity": 0.4,
        "circle-blur": 0.85,
        "circle-stroke-width": 0,
      },
    });
    map.addLayer({
      id: "selected-point-core",
      type: "circle",
      source: "selected-point",
      filter: ["==", ["get", "mode"], "pick"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          2.1,
          13,
          3.5,
          16,
          5.6,
          18,
          7.7,
        ],
        "circle-color": LINE,
        "circle-opacity": 0.95,
        "circle-stroke-width": 0,
      },
    });

    bindPointLayer("seating-points");
    bindPointLayer("undocumented-points");

    map.on("move", positionSeatPopup);
    map.on("resize", positionSeatPopup);

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["seating-points", "undocumented-points"],
      });
      // point layers handle their own click (info popup); don't re-run pick here
      if (hits.length) return;

      if (
        typeof window.onMapPickLocation === "function" &&
        window.onMapPickLocation(e.lngLat.lng, e.lngLat.lat)
      ) {
        hideSeatPopup();
        return;
      }

      hideSeatPopup();
      clearSelectedPointGlow();
    });

    window.focusMapLocation = function focusMapLocation(lng, lat) {
      const coordinates = [Number(lng), Number(lat)];
      if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
        return;
      }

      // close info popup UI without clearing the pick glow
      seatPopup.classList.add("is-hidden");
      seatPopup.hidden = true;
      popupAnchor = null;
      setSelectedPointGlow(coordinates[0], coordinates[1], "pick");

      const mobile = window.matchMedia("(max-width: 720px)").matches;
      map.easeTo({
        center: coordinates,
        zoom: Math.max(map.getZoom(), mobile ? 16 : 15.5),
        duration: 750,
        padding: mobile
          ? { top: 48, bottom: 120, left: 24, right: 24 }
          : { top: 80, bottom: 80, left: 80, right: 300 },
      });
    };

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
    if (typeof window.applyAxesFilter === "function") {
      window.applyAxesFilter(["doc-public", "undoc-individual", "undoc-public"]);
    }
  } catch (err) {
    console.error(err);
  }
});
