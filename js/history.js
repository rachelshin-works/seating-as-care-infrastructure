function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseWriting(text) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current && current.paragraphs.at(-1) !== "") {
        current.paragraphs.push("");
      }
      continue;
    }

    const heading = line.match(/^([ivx]+)\)\s+(.+)$/i);
    if (heading) {
      current = {
        mark: heading[1].toLowerCase(),
        title: heading[2].trim(),
        paragraphs: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { mark: "", title: "", paragraphs: [] };
      sections.push(current);
    }

    if (current.paragraphs.length === 0 || current.paragraphs.at(-1) === "") {
      if (current.paragraphs.at(-1) === "") current.paragraphs.pop();
      current.paragraphs.push(line);
    } else {
      current.paragraphs[current.paragraphs.length - 1] += " " + line;
    }
  }

  return sections;
}

function renderWriting(sections) {
  const root = document.getElementById("history-content");
  if (!sections.length) {
    root.innerHTML = `<p class="history__status">no writing yet</p>`;
    return;
  }

  root.innerHTML = sections
    .map((section) => {
      const head =
        section.mark || section.title
          ? `<header class="history__section-head">
              ${
                section.mark
                  ? `<span class="history__mark">${escapeHtml(section.mark)})</span>`
                  : ""
              }
              ${
                section.title
                  ? `<h2 class="history__title">${escapeHtml(section.title)}</h2>`
                  : ""
              }
            </header>`
          : "";

      const body = section.paragraphs
        .filter(Boolean)
        .map((p) => `<p class="history__p">${escapeHtml(p)}</p>`)
        .join("");

      return `<section class="history__section">${head}${body}</section>`;
    })
    .join("");
}

(async function initHistory() {
  const root = document.getElementById("history-content");
  try {
    const res = await fetch("data/writing.txt");
    if (!res.ok) throw new Error(`could not load writing (${res.status})`);
    const text = await res.text();
    renderWriting(parseWriting(text));
  } catch (err) {
    root.innerHTML = `<p class="history__status">${escapeHtml(err.message)}</p>`;
  }
})();
