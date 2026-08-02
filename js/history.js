function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** footnote id → images (row) + captions (right column) */
const FOOTNOTE_FIGURES = {
  1: [
    {
      src: "assets/01_Giuseppe Zocchi.png",
      alt: "Giuseppe Zocchi",
      w: 1452,
      h: 898,
      caption:
        "Giuseppe Zocchi, Piazza della Signoria, ca. 1741, oil on canvas",
    },
    {
      src: "assets/03_Domenico Ghirlandaio.png",
      alt: "Domenico Ghirlandaio",
      w: 1230,
      h: 934,
      caption:
        "Domenico Ghirlandaio, Raising of the Spini Child, 1482-86, fresco, Sassetti Chapel, Sta. Trinita, Florence",
    },
  ],
};

/**
 * section title (lowercase) → figures placed inside that section.
 * `head` runs right under the heading, numeric keys run after that paragraph.
 */
const SECTION_FIGURES = {
  "canal street": {
    head: [
      {
        src: "assets/04_canalStreet.png",
        alt: "Canal Street",
        w: 1396,
        h: 1016,
      },
    ],
    1: [
      {
        src: "assets/05_canalStreet.png",
        alt: "Canal Street",
        w: 1556,
        h: 1082,
      },
      {
        src: "assets/06_canalStreet.png",
        alt: "Canal Street",
        w: 1312,
        h: 964,
      },
    ],
  },
  "current status(canal street) – data analysis part": {
    head: [
      {
        src: "assets/09_documentedSeating.png",
        alt: "Documented seating",
        w: 794,
        h: 773,
        noHover: true,
      },
    ],
    1: [
      {
        src: "assets/07_canalSeating.png",
        alt: "Canal seating",
        w: 1024,
        h: 1372,
      },
      {
        src: "assets/08_canalSeating.png",
        alt: "Canal seating",
        w: 1054,
        h: 1412,
      },
    ],
    2: [
      {
        src: "assets/10_undocumentedSeating.png",
        alt: "Undocumented seating",
        w: 794,
        h: 773,
        noHover: true,
      },
    ],
    // after the paragraph before "Comparing documented…"
    6: [
      {
        src: "assets/11_all.png",
        alt: "All seating",
        w: 794,
        h: 773,
        noHover: true,
      },
    ],
  },
};

/** footnote id → right-column note (link or plain text) */
const FOOTNOTE_NOTES = {
  2: {
    label: "> instruction download",
    href: "assets/instruction.pdf",
  },
};

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
    const bibHeading = line.match(/^(bilbiography|bibliography)\s*$/i);

    if (heading || bibHeading) {
      const mark = heading ? heading[1].toLowerCase() : "";
      const title = heading ? heading[2].trim() : bibHeading[1].toLowerCase();
      current = {
        mark,
        title,
        keepLines: /bib/i.test(title),
        paragraphs: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { mark: "", title: "", keepLines: false, paragraphs: [] };
      sections.push(current);
    }

    // source keeps one paragraph per line
    current.paragraphs.push(line);
  }

  return sections;
}

function splitFootnote(text) {
  const match = text.match(/\s*\^(\d+)\s*$/);
  if (!match) return { body: text, note: null };
  return {
    body: text.slice(0, match.index).trimEnd(),
    note: match[1],
  };
}

function renderFigureRow(
  figs,
  { center = false, small = false, label = "figures" } = {}
) {
  if (!figs?.length) return "";
  const imgs = figs
    .map(
      (fig) =>
        `<figure class="history__fig-item">
          <img src="${escapeHtml(fig.src)}" alt="${escapeHtml(fig.alt || "")}" loading="lazy" />
        </figure>`
    )
    .join("");
  const cls = [
    "history__fig",
    center ? "history__fig--center" : "",
    small ? "history__fig--small" : "",
    figs.every((fig) => fig.noHover) ? "history__fig--no-hover" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<aside class="${cls}" aria-label="${escapeHtml(label)}">${imgs}</aside>`;
}

function renderFigures(noteId) {
  return renderFigureRow(FOOTNOTE_FIGURES[noteId], {
    center: true,
    label: `footnote ${noteId} figures`,
  });
}

function renderCaptions(noteId) {
  const figs = FOOTNOTE_FIGURES[noteId];
  if (!figs?.length) return "";
  const items = figs
    .filter((fig) => fig.caption)
    .map(
      (fig) =>
        `<li class="history__caption">${escapeHtml(fig.caption)}</li>`
    )
    .join("");
  if (!items) return "";
  return `<aside class="history__captions" aria-label="footnote ${escapeHtml(noteId)}">
    <ol class="history__caption-list">${items}</ol>
  </aside>`;
}

function renderFootnoteNote(noteId) {
  const note = FOOTNOTE_NOTES[noteId];
  if (!note) return "";
  const body = note.href
    ? `<a class="history__caption-link" href="${escapeHtml(note.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.label)}</a>`
    : escapeHtml(note.label);
  return `<aside class="history__captions" aria-label="footnote ${escapeHtml(noteId)}">
    <ol class="history__caption-list">
      <li class="history__caption">${body}</li>
    </ol>
  </aside>`;
}

function renderParagraph(text, pClass) {
  const { body, note } = splitFootnote(text);
  const noteHtml = note
    ? `<sup class="history__fn" id="fnref-${escapeHtml(note)}">${escapeHtml(note)}</sup>`
    : "";
  const p = `<p class="${pClass}">${escapeHtml(body)}${noteHtml}</p>`;
  const hasFigs = note && FOOTNOTE_FIGURES[note];
  const hasNote = note && FOOTNOTE_NOTES[note];
  if (!hasFigs && !hasNote) return p;
  const figs = hasFigs ? renderFigures(note) : "";
  const side = hasFigs ? renderCaptions(note) : renderFootnoteNote(note);
  return `${figs}<div class="history__with-note">${p}${side}</div>`;
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

      const pClass = section.keepLines ? "history__p history__p--bib" : "history__p";
      const figures = SECTION_FIGURES[section.title.toLowerCase()] || {};
      const label = `${section.title} figures`;

      const body = section.paragraphs
        .filter(Boolean)
        .map((p, i) => {
          const content =
            /^table$/i.test(p.trim())
              ? renderFigureRow(
                  [
                    {
                      src: "assets/12_table.png",
                      alt: "Seating categories table",
                    },
                  ],
                  { center: true, small: true, label: "seating table" }
                )
              : renderParagraph(p, pClass);
          return content + renderFigureRow(figures[i + 1], { center: true, label });
        })
        .join("");

      const headFigures = renderFigureRow(figures.head, {
        center: true,
        label,
      });

      return `<section class="history__section">${head}${headFigures}${body}</section>`;
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
