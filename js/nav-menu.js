// Universal Navigation Menu Controller for PUTNAZAR

export function initNavMenu(activePage = "") {
  const toggleBtn = document.getElementById("menu-toggle");
  const menuDrawer = document.getElementById("site-menu");
  const closeBtn = document.getElementById("menu-close");
  const backdrop = document.getElementById("menu-backdrop");

  if (!toggleBtn || !menuDrawer) return;

  function openMenu() {
    menuDrawer.hidden = false;
    menuDrawer.setAttribute("aria-hidden", "false");
    toggleBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menuDrawer.hidden = true;
    menuDrawer.setAttribute("aria-hidden", "true");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menuDrawer.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", closeMenu);
  if (backdrop) backdrop.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menuDrawer.hidden) {
      closeMenu();
    }
  });

  // Highlight active page item
  const currentPage = activePage || document.body.dataset.page || "";
  if (currentPage) {
    const activeItem = menuDrawer.querySelector(`[data-page="${currentPage}"]`);
    if (activeItem) {
      activeItem.classList.add("active");
    }
  }
}

// Auto-initialize when loaded
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initNavMenu();
    });
  } else {
    initNavMenu();
  }
}
