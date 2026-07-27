const dock = document.querySelector(".dock");
const panel = document.getElementById("map-panel");
const panelChip = document.getElementById("panel-chip");
const closeBtn = document.querySelector(".panel__close");
const form = document.getElementById("seat-form");
const lngInput = document.getElementById("field-lng");
const latInput = document.getElementById("field-lat");
const statusEl = document.getElementById("form-status");
const locateBtn = document.getElementById("locate-btn");

let pickOnMap = true;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function syncPanelChipWidth() {
  if (!dock || !panelChip) return;
  panelChip.style.width = `${dock.getBoundingClientRect().width}px`;
}

function setCoords(lng, lat, source = "gps") {
  lngInput.value = Number(lng).toFixed(6);
  latInput.value = Number(lat).toFixed(6);
  setStatus(`location ready (${source})`);
}

function expandMapPanel() {
  syncPanelChipWidth();
  panel.hidden = false;
  panel.classList.remove("is-hidden");
  panelChip.hidden = true;
  panelChip.classList.add("is-hidden");
  pickOnMap = true;
  if (typeof window.resizeCareMap === "function") window.resizeCareMap();
}

function collapseMapPanel() {
  syncPanelChipWidth();
  panel.classList.add("is-hidden");
  panel.hidden = true;
  panelChip.hidden = false;
  panelChip.classList.remove("is-hidden");
  pickOnMap = false;
  setStatus("");
}

function openMapPanel() {
  expandMapPanel();
  setStatus("locating… or click the map to drop a point");
  requestLocation();
}

function geoErrorMessage(err) {
  if (!err) return "location unavailable";
  switch (err.code) {
    case 1:
      return "location permission denied — allow location, or click the map";
    case 2:
      return "location unavailable — click the map to set coords";
    case 3:
      return "location timed out — click the map to set coords";
    default:
      return `${err.message || "location unavailable"} — click the map`;
  }
}

function getPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function requestLocation() {
  if (!window.isSecureContext) {
    setStatus("location needs https or localhost — click the map instead", true);
    return;
  }

  if (!navigator.geolocation) {
    setStatus("geolocation not supported — click the map instead", true);
    return;
  }

  setStatus("locating…");
  locateBtn.disabled = true;

  try {
    const pos = await getPosition({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });
    setCoords(pos.coords.longitude, pos.coords.latitude, "network");
  } catch (firstErr) {
    try {
      const pos = await getPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
      setCoords(pos.coords.longitude, pos.coords.latitude, "gps");
    } catch (secondErr) {
      setStatus(geoErrorMessage(secondErr || firstErr), true);
    }
  } finally {
    locateBtn.disabled = false;
  }
}

dock.addEventListener("click", (e) => {
  const tab = e.target.closest(".dock__tab");
  if (!tab) return;

  if (tab.dataset.view === "archive") {
    return;
  }

  if (tab.dataset.view === "map") {
    e.preventDefault();
    openMapPanel();
  }
});

closeBtn.addEventListener("click", collapseMapPanel);
panelChip.addEventListener("click", expandMapPanel);
locateBtn.addEventListener("click", requestLocation);
window.addEventListener("resize", syncPanelChipWidth);

window.onMapPickLocation = function onMapPickLocation(lng, lat) {
  if (!pickOnMap || panel.hidden) return false;
  setCoords(lng, lat, "map");
  return true;
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const longitude = parseFloat(lngInput.value);
  const latitude = parseFloat(latInput.value);
  const category = form.querySelector('input[name="category"]:checked')?.value;
  const rate = form.querySelector('input[name="rate"]:checked')?.value;
  const comment = form.querySelector("#field-comment")?.value || "";

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    setStatus("set location first: locate me, or click the map", true);
    return;
  }

  const submitBtn = form.querySelector(".submit");
  submitBtn.disabled = true;
  setStatus("submitting…");

  try {
    const res = await fetch("/api/seatings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        longitude,
        latitude,
        category,
        rate,
        comment,
      }),
    });

    const raw = await res.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (_) {
        throw new Error(
          "server returned non-json — open http://localhost:3000 (npm start)"
        );
      }
    }

    if (!res.ok) {
      throw new Error(data?.error || `submit failed (${res.status})`);
    }
    if (!data?.feature) {
      throw new Error(
        "empty server response — open http://localhost:3000 (npm start)"
      );
    }

    if (typeof window.addUndocumentedFeature === "function") {
      window.addUndocumentedFeature(data.feature);
    }

    setStatus("submitted");
    form.querySelector("#field-comment").value = "";
  } catch (err) {
    setStatus(err.message || "submit failed", true);
  } finally {
    submitBtn.disabled = false;
  }
});

/* color-range filter */
const heatMin = document.getElementById("heat-min");
const heatMax = document.getElementById("heat-max");
const heatMinLabel = document.getElementById("heat-min-label");
const heatMaxLabel = document.getElementById("heat-max-label");

function syncHeatSlider() {
  let min = Number(heatMin.value);
  let max = Number(heatMax.value);
  if (min > max) {
    [min, max] = [max, min];
    heatMin.value = min;
    heatMax.value = max;
  }
  heatMinLabel.textContent = String(min);
  heatMaxLabel.textContent = String(max);
  if (typeof window.applyHeatFilter === "function") {
    window.applyHeatFilter(min, max);
  }
}

heatMin?.addEventListener("input", syncHeatSlider);
heatMax?.addEventListener("input", syncHeatSlider);

/* open by default */
syncPanelChipWidth();
openMapPanel();
