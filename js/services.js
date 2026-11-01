import {
  VILLAINS,
  filterVillainsByLanguage,
  sortVillains,
  generatePact,
} from "./services-data.js";

// DOM Elements
const villainsGrid = document.getElementById("villains-grid");
const noResults = document.getElementById("no-results");
const resultsCount = document.getElementById("results-count");
const searchInput = document.getElementById("villain-search");
const clearSearchBtn = document.getElementById("clear-search");
const sortSelect = document.getElementById("sort-select");
const langPills = document.querySelectorAll(".lang-pill");
const resetFiltersBtn = document.getElementById("reset-filters-btn");

// Modal Elements
const pactModal = document.getElementById("pact-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const pactFormView = document.getElementById("pact-form-view");
const pactDecreeView = document.getElementById("pact-decree-view");
const pactMasterImg = document.getElementById("pact-master-img");
const pactMasterSigil = document.getElementById("pact-master-sigil");
const pactMasterRealm = document.getElementById("pact-master-realm");
const pactMasterYear = document.getElementById("pact-master-year");
const pactMasterName = document.getElementById("pact-master-name");
const pactMasterMovie = document.getElementById("pact-master-movie");
const pactMasterPractice = document.getElementById("pact-master-practice");
const pactMasterService = document.getElementById("pact-master-service");
const pactMasterOffering = document.getElementById("pact-master-offering");
const pactForm = document.getElementById("pact-form");
const pactTargetInput = document.getElementById("pact-target-input");
const pactRiteSelect = document.getElementById("pact-rite-select");

// Decree Elements
const decreePactId = document.getElementById("decree-pact-id");
const decreeTargetName = document.getElementById("decree-target-name");
const decreeMasterName = document.getElementById("decree-master-name");
const decreePractice = document.getElementById("decree-practice");
const decreeIncantation = document.getElementById("decree-incantation");
const decreeBurnBtn = document.getElementById("decree-burn-btn");
const copyDecreeBtn = document.getElementById("copy-decree-btn");
const newPactBtn = document.getElementById("new-pact-btn");
const decreeStatusLine = document.getElementById("decree-status-line");
const decreeLegalWarning = document.getElementById("decree-legal-warning");

// Audio Elements
const audioToggleBtn = document.getElementById("services-audio-toggle");
const audioElem = document.getElementById("occult-audio");

// State
let currentLanguage = "all";
let currentSort = "chrono-asc";
let currentSearch = "";
let selectedVillain = null;
let currentPact = null;
let isAudioPlaying = false;

/**
 * Render a single villain card HTML
 */
function createVillainCard(villain) {
  const card = document.createElement("article");
  card.className = "villain-card";
  card.dataset.id = villain.id;
  card.dataset.language = villain.language;
  card.dataset.year = String(villain.year);

  // Escaping helper
  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  card.innerHTML = `
    <div class="villain-media">
      <img src="${escapeHtml(villain.image)}" alt="Portrait of ${escapeHtml(villain.name)}" class="villain-img" loading="lazy">
      <div class="media-vignette" aria-hidden="true"></div>
      <span class="badge-realm">${escapeHtml(villain.language.toUpperCase())} &middot; ${villain.year}</span>
      <span class="badge-danger">${escapeHtml(villain.dangerTier.toUpperCase())}</span>
      <span class="sigil-watermark" aria-hidden="true">${villain.sigil}</span>
    </div>
    <div class="villain-body">
      <div class="villain-title-row">
        <h3 class="villain-name">${escapeHtml(villain.name)}</h3>
        <div class="villain-actor">${escapeHtml(villain.actor)} &middot; ${escapeHtml(villain.movie)}</div>
      </div>

      <div class="practice-block">
        <div class="practice-label">Primary Occult Practice</div>
        <div class="practice-name">${escapeHtml(villain.practice)}</div>
      </div>

      <p class="villain-quote">${escapeHtml(villain.quote)}</p>

      <p class="villain-role">${escapeHtml(villain.role)}</p>

      <div class="service-callout">
        <div class="service-title">
          <span>🔮</span> ${escapeHtml(villain.service)}
        </div>
        <div class="service-desc">${escapeHtml(villain.serviceDesc)}</div>
        <div class="service-offering-req">
          <strong>Offering:</strong> ${escapeHtml(villain.offering)}
        </div>
      </div>

      <div class="villain-actions">
        <button type="button" class="btn-invoke" data-action="invoke" data-id="${villain.id}">
          <span>🔮</span> Invoke Service
        </button>
      </div>
    </div>
  `;

  // Attach Invoke handler
  const invokeBtn = card.querySelector('[data-action="invoke"]');
  invokeBtn.addEventListener("click", () => openPactModal(villain));

  return card;
}

/**
 * Filter and sort villains based on active state, then render
 */
function renderVillains() {
  let list = filterVillainsByLanguage(VILLAINS, currentLanguage);

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.actor.toLowerCase().includes(q) ||
      v.movie.toLowerCase().includes(q) ||
      v.practice.toLowerCase().includes(q) ||
      v.role.toLowerCase().includes(q) ||
      v.quote.toLowerCase().includes(q) ||
      v.service.toLowerCase().includes(q) ||
      v.language.toLowerCase().includes(q)
    );
  }

  list = sortVillains(list, currentSort);

  // Clear grid
  villainsGrid.innerHTML = "";

  if (list.length === 0) {
    noResults.hidden = false;
    resultsCount.textContent = "No Masters Found";
  } else {
    noResults.hidden = true;
    const fragment = document.createDocumentFragment();
    list.forEach((villain) => {
      fragment.appendChild(createVillainCard(villain));
    });
    villainsGrid.appendChild(fragment);

    const realmName = currentLanguage === "all" ? "All Realms" : `${currentLanguage} Realm`;
    resultsCount.textContent = `Displaying ${list.length} Masters (${realmName})`;
  }
}

/**
 * Open Pact Modal for a selected villain
 */
function openPactModal(villain) {
  selectedVillain = villain;
  pactMasterImg.src = villain.image;
  pactMasterImg.alt = villain.name;
  pactMasterSigil.textContent = villain.sigil;
  pactMasterRealm.textContent = villain.language;
  pactMasterYear.textContent = String(villain.year);
  pactMasterName.textContent = villain.name;
  pactMasterMovie.textContent = `${villain.actor} in ${villain.movie}`;
  pactMasterPractice.textContent = villain.practice;
  pactMasterService.textContent = villain.service;
  pactMasterOffering.textContent = villain.offering;

  pactTargetInput.value = "";
  pactFormView.hidden = false;
  pactDecreeView.hidden = true;
  pactModal.hidden = false;

  pactTargetInput.focus();
}

/**
 * Close Pact Modal
 */
function closePactModal() {
  pactModal.hidden = true;
  selectedVillain = null;
  currentPact = null;
}

/**
 * Seal the Occult Pact Form
 */
function handlePactSubmit(e) {
  e.preventDefault();
  if (!selectedVillain) return;

  const target = pactTargetInput.value.trim() || "Nameless Adversary";
  const riteLabel = pactRiteSelect.options[pactRiteSelect.selectedIndex].text;

  currentPact = generatePact(selectedVillain, target, riteLabel);

  // Populate Decree View
  decreePactId.textContent = currentPact.pactId;
  decreeTargetName.textContent = currentPact.target;
  decreeMasterName.textContent = `${currentPact.villainName} (${currentPact.actor} · ${currentPact.movie})`;
  decreePractice.textContent = selectedVillain.practice;
  decreeIncantation.textContent = selectedVillain.incantation;
  decreeBurnBtn.href = currentPact.burnUrl;

  const isLegalPutNazar = pactRiteSelect.value === "nazar";

  // Flash transition
  pactFormView.hidden = true;
  pactDecreeView.hidden = false;

  if (decreeStatusLine) {
    if (isLegalPutNazar) {
      decreeStatusLine.innerHTML = `<span class="status-dot"></span> STATUS: 100% LEGAL & APPROVED &middot; PUT NAZAR CLEANSING ACTIVE`;
      decreeStatusLine.style.color = "#86efac";
    } else {
      decreeStatusLine.innerHTML = `<span class="status-dot status-dot-illegal"></span> STATUS: PROHIBITED & ILLEGAL SERVICE &middot; CEASED BY LAW`;
      decreeStatusLine.style.color = "#ff8a80";
    }
  }

  if (decreeLegalWarning) {
    decreeLegalWarning.hidden = isLegalPutNazar;
  }

  // Play audio pulse if available
  playAtmosphere();
}

/**
 * Audio control
 */
function toggleAtmosphere() {
  if (!audioElem) return;
  if (isAudioPlaying) {
    audioElem.pause();
    isAudioPlaying = false;
    audioToggleBtn.textContent = "🔇";
    audioToggleBtn.setAttribute("title", "Unmute occult sound drone");
  } else {
    audioElem.play().then(() => {
      isAudioPlaying = true;
      audioToggleBtn.textContent = "🔊";
      audioToggleBtn.setAttribute("title", "Mute occult sound drone");
    }).catch(() => {
      // Audio autoplay restrictions
    });
  }
}

function playAtmosphere() {
  if (audioElem && !isAudioPlaying) {
    audioElem.play().then(() => {
      isAudioPlaying = true;
      if (audioToggleBtn) audioToggleBtn.textContent = "🔊";
    }).catch(() => {});
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Initial render
  renderVillains();

  // Language Pill selection
  langPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      langPills.forEach((p) => {
        p.classList.remove("active");
        p.setAttribute("aria-selected", "false");
      });
      pill.classList.add("active");
      pill.setAttribute("aria-selected", "true");
      currentLanguage = pill.dataset.lang || "all";
      renderVillains();
    });
  });

  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.trim();
      clearSearchBtn.hidden = !currentSearch;
      renderVillains();
    });
  }

  // Clear search button
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      currentSearch = "";
      clearSearchBtn.hidden = true;
      searchInput.focus();
      renderVillains();
    });
  }

  // Sort dropdown
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSort = e.target.value;
      renderVillains();
    });
  }

  // Reset filters
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      currentLanguage = "all";
      currentSearch = "";
      if (searchInput) searchInput.value = "";
      if (clearSearchBtn) clearSearchBtn.hidden = true;
      langPills.forEach((p) => {
        p.classList.remove("active");
        p.setAttribute("aria-selected", "false");
      });
      const allPill = document.querySelector('.lang-pill[data-lang="all"]');
      if (allPill) {
        allPill.classList.add("active");
        allPill.setAttribute("aria-selected", "true");
      }
      renderVillains();
    });
  }

  // Modal close events
  if (closeModalBtn) closeModalBtn.addEventListener("click", closePactModal);
  if (pactModal) {
    pactModal.addEventListener("click", (e) => {
      if (e.target.classList.contains("pact-modal-backdrop")) {
        closePactModal();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pactModal.hidden) {
      closePactModal();
    }
  });

  // Form submit
  if (pactForm) pactForm.addEventListener("submit", handlePactSubmit);

  // Copy Decree button
  if (copyDecreeBtn) {
    copyDecreeBtn.addEventListener("click", () => {
      if (!currentPact) return;
      const isLegal = pactRiteSelect?.value === "nazar";
      const legalNote = isLegal ? "100% Legal & Approved Put Nazar" : "PROHIBITED BY LAW (Except Put Nazar, all black magic and harmful hexes are illegal)";
      const text = `[OCCULT DECREE ${currentPact.pactId}]\nTarget: ${currentPact.target}\nPresiding Master: ${currentPact.villainName}\nPractice: ${selectedVillain?.practice}\nIncantation: "${selectedVillain?.incantation}"\nStatus: Sealed & Bound\nLegal Classification: ${legalNote}`;
      navigator.clipboard.writeText(text).then(() => {
        copyDecreeBtn.textContent = "✓ Decree Copied to Clipboard";
        setTimeout(() => {
          copyDecreeBtn.textContent = "📜 Copy Decree Mantra";
        }, 2200);
      });
    });
  }

  // New Pact button
  if (newPactBtn) {
    newPactBtn.addEventListener("click", () => {
      pactFormView.hidden = false;
      pactDecreeView.hidden = true;
      pactTargetInput.value = "";
      pactTargetInput.focus();
    });
  }

  // Audio Toggle
  if (audioToggleBtn) {
    audioToggleBtn.addEventListener("click", toggleAtmosphere);
  }
});
