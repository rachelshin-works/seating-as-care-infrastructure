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
      },
    });
  }

  return { type: "FeatureCollection", features };
}

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

seatPopupClose.addEventListener("click", hideSeatPopup);

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

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: [-73.9995, 40.7165],
  zoom: 15.2,
  pitch: 0,
  bearing: 0,
  maxPitch: 0,
  attributionControl: false,
});

map.on("error", (e) => {
  console.error("Map error:", e.error || e);
});

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

  return expr.map((item) => scaleLineWidth(item, factor));
}

function bindPointLayer(layerId) {
  map.on("click", layerId, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    showSeatPopup(feature.properties, e.point);
  });

  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

map.on("load", async () => {
  const style = map.getStyle();

  for (const layer of style.layers) {
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
      map.setLayoutProperty(id, "visibility", "none");
    }
  }

  try {
    const [boundaryRes, seatsRes, undocRes] = await Promise.all([
      fetch("data/chinatown.geojson"),
      fetch("data/Seating_Locations_20260319.csv"),
      fetch("data/0724_undocumented_seatings.csv"),
    ]);

    if (!boundaryRes.ok) throw new Error(`Failed to load boundary: ${boundaryRes.status}`);
    if (!seatsRes.ok) throw new Error(`Failed to load seats: ${seatsRes.status}`);
    if (!undocRes.ok) throw new Error(`Failed to load undocumented: ${undocRes.status}`);

    const boundary = await boundaryRes.json();
    const seats = documentedToGeoJSON(await seatsRes.text());
    const undoc = undocumentedToGeoJSON(await undocRes.text());

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

    map.addSource("undocumented", { type: "geojson", data: undoc });
    map.addLayer({
      id: "undocumented-points",
      type: "circle",
      source: "undocumented",
      paint: {
        "circle-radius": POINT_RADIUS,
        "circle-color": [
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
        ],
        "circle-opacity": 0.95,
      },
    });

    bindPointLayer("seating-points");
    bindPointLayer("undocumented-points");

    map.on("click", (e) => {
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
  } catch (err) {
    console.error(err);
  }
});
