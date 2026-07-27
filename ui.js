const dock = document.querySelector(".dock");
const panel = document.getElementById("map-panel");
const closeBtn = document.querySelector(".panel__close");

function openMapPanel() {
  panel.hidden = false;
  panel.classList.remove("is-hidden");
}

function closeMapPanel() {
  panel.classList.add("is-hidden");
  panel.hidden = true;
}

dock.addEventListener("click", (e) => {
  const tab = e.target.closest(".dock__tab");
  if (!tab) return;

  if (tab.dataset.view === "map") {
    openMapPanel();
  }
});

closeBtn.addEventListener("click", closeMapPanel);
