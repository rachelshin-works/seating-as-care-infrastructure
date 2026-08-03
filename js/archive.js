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

function loadDocumented(text) {
  const rows = parseCsv(text, ",");
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.replace(/^"|"$/g, ""));
  const latIdx = headers.indexOf("Latitude");
  const lngIdx = headers.indexOf("Longitude");
  const benchIdx = headers.indexOf("Asset_Subtype");
  const dateIdx = headers.indexOf("Installation Date");

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    items.push({
      type: "documented",
      category: cols[benchIdx] || "—",
      lng: cols[lngIdx] || "—",
      lat: cols[latIdx] || "—",
      installedDate: cols[dateIdx] || "—",
      observedDate: "—",
    });
  }
  return items;
}

function loadUndocumented(text) {
  const rows = parseCsv(text, ";");
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.replace(/^"|"$/g, ""));
  const latIdx = headers.indexOf("_Record your current location_latitude");
  const lngIdx = headers.indexOf("_Record your current location_longitude");
  const typeIdx = headers.indexOf("type");
  const dateIdx = headers.indexOf("today");

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    items.push({
      type: "undocumented",
      category: (cols[typeIdx] || "—").replace(/_/g, " "),
      lng: cols[lngIdx] || "—",
      lat: cols[latIdx] || "—",
      installedDate: "—",
      observedDate: cols[dateIdx] || "—",
    });
  }
  return items;
}

function loadCommunity(text) {
  const rows = parseCsv(text, ",");
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.replace(/^"|"$/g, "").trim());
  const lngIdx = headers.indexOf("longitude");
  const latIdx = headers.indexOf("latitude");
  const catIdx = headers.indexOf("category");
  const dateIdx = headers.indexOf("observed_date");

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols.length || cols.every((c) => !String(c).trim())) continue;

    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    items.push({
      type: "undocumented",
      category: (cols[catIdx] || "—").replace(/_/g, " "),
      lng: String(lng),
      lat: String(lat),
      installedDate: "—",
      observedDate: cols[dateIdx] || "—",
    });
  }
  return items;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function fillSelect(select, values) {
  const current = select.value || "all";
  select.innerHTML =
    '<option value="all">all</option>' +
    values
      .map(
        (value) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
      .join("");
  select.value = values.includes(current) ? current : "all";
}

function renderList(items) {
  const root = document.getElementById("archive-list");
  if (!items.length) {
    root.innerHTML = '<p class="archive__status">no records</p>';
    return;
  }

  root.innerHTML = items
    .map(
      (item) => `
      <article class="archive__row">
        <span>${escapeHtml(item.type)}</span>
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.lng)} / ${escapeHtml(item.lat)}</span>
        <span>${escapeHtml(item.installedDate)}</span>
        <span>${escapeHtml(item.observedDate)}</span>
      </article>`
    )
    .join("");
}

function applyFilters(allItems) {
  const type = document.getElementById("filter-type").value;
  const category = document.getElementById("filter-category").value;

  return allItems.filter((item) => {
    if (type !== "all" && item.type !== type) return false;
    if (category !== "all" && item.category !== category) return false;
    return true;
  });
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

(async function initArchive() {
  const root = document.getElementById("archive-list");
  const typeSelect = document.getElementById("filter-type");
  const categorySelect = document.getElementById("filter-category");

  try {
    const [documentedText, undocText, communityText] = await Promise.all([
      fetchText("data/Seating_Locations_20260319.csv"),
      fetchText("data/0724_undocumented_seatings.csv"),
      fetchText("/api/seatings").catch(() =>
        fetchText("data/community_seatings.csv")
      ),
    ]);

    const allItems = [
      ...loadDocumented(documentedText),
      ...loadUndocumented(undocText),
      ...loadCommunity(communityText),
    ];

    fillSelect(typeSelect, uniqueSorted(allItems.map((item) => item.type)));
    fillSelect(
      categorySelect,
      uniqueSorted(allItems.map((item) => item.category))
    );

    const refresh = () => {
      const categoriesForType =
        typeSelect.value === "all"
          ? allItems
          : allItems.filter((item) => item.type === typeSelect.value);
      fillSelect(
        categorySelect,
        uniqueSorted(categoriesForType.map((item) => item.category))
      );
      renderList(applyFilters(allItems));
    };

    typeSelect.addEventListener("change", refresh);
    categorySelect.addEventListener("change", () => {
      renderList(applyFilters(allItems));
    });

    renderList(allItems);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="archive__status">${escapeHtml(err.message)}</p>`;
  }
})();
