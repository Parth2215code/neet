/**
 * Neet Photography · Full-Stack & GitHub Pages Universal Engine
 * Seamlessly runs on:
 * 1) Node.js + SQLite Server (with live API & multi-device real-time sync)
 * 2) Static GitHub Pages / Netlify / Vercel (with LocalStorage, encoded share links & offline fallback)
 */

(function () {
  "use strict";

  const TOKEN_KEY = "neet_admin_token";
  const LOCAL_STORAGE_KEY = "neet_shoot_schedule_local";
  const LOCAL_PIN_KEY = "neet_custom_pin";
  const SPAN_MONTHS = 4;
  const POLL_INTERVAL_MS = 8000;

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const DEFAULT_BOOKED = {
    "2026-10": [25, 30],
    "2026-11": [2, 3, 11, 12, 14],
    "2027-01": [19, 24, 25, 26, 27, 28, 31],
    "2027-02": [1, 2, 10, 11, 12, 15, 16]
  };

  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

  // Application State
  let isServerBackendAvailable = false;
  let isAdmin = false;
  let adminToken = localStorage.getItem(TOKEN_KEY) || "";
  let currentCategory = "traditional";
  let shootsData = {};
  let studioSettings = { studioName: "Neet Photography", phone: "+91 98765 43210" };
  let currentViewMode = "grid";
  let lastServerVersion = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let viewDate = {
    year: today.getFullYear(),
    month: today.getMonth()
  };

  const $ = (id) => document.getElementById(id);

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }

  function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    }
    return headers;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  // ----------------- LOCAL DATA MANAGEMENT (FOR GITHUB PAGES) -----------------
  function getInitialLocalStore() {
    const o = {};
    for (const mStr in DEFAULT_BOOKED) {
      DEFAULT_BOOKED[mStr].forEach((d) => {
        const fullDate = `${mStr}-${pad(d)}`;
        o[fullDate] = {
          name: "Reserved Shoot",
          venue: "",
          time: "",
          phone: "",
          status: "confirmed",
          notes: ""
        };
      });
    }
    return {
      traditional: JSON.parse(JSON.stringify(o)),
      semi: JSON.parse(JSON.stringify(o)),
      wedding: JSON.parse(JSON.stringify(o))
    };
  }

  function loadLocalStore() {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    const initial = getInitialLocalStore();
    saveLocalStore(initial);
    return initial;
  }

  function saveLocalStore(data) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadLocalFallbackData() {
    // Check if URL hash has encoded data
    const hash = window.location.hash.replace("#", "");
    if (hash && hash.startsWith("data=")) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(hash.replace("data=", ""))));
        if (decoded && decoded.traditional) {
          saveLocalStore(decoded);
          showToast("Loaded shared schedule from link");
        }
      } catch (e) {}
    }

    const store = loadLocalStore();
    shootsData = store[currentCategory] || {};
    updateRoleDisplay();
    render();

    // Update status badge for GitHub Pages
    const syncBadge = $("syncStatus");
    if (syncBadge) {
      syncBadge.innerHTML = '<span class="pulse-dot"></span> Live on GitHub';
      syncBadge.style.display = "inline-flex";
    }
  }

  // ----------------- API CALLS -----------------

  async function checkAuthSession() {
    if (!adminToken) {
      isAdmin = false;
      updateRoleDisplay();
      return;
    }

    if (adminToken === "local_admin_token") {
      isAdmin = true;
      updateRoleDisplay();
      return;
    }

    try {
      const res = await fetch("/api/auth/check", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        isAdmin = !!data.isAdmin;
        isServerBackendAvailable = true;
      } else {
        isAdmin = false;
        adminToken = "";
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      isServerBackendAvailable = false;
    }
    updateRoleDisplay();
  }

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        studioSettings = await res.json();
        isServerBackendAvailable = true;
        if (studioSettings.studioName) {
          $("studioTitle").textContent = studioSettings.studioName;
        }
        return;
      }
    } catch (e) {
      isServerBackendAvailable = false;
    }

    // Local fallback settings
    try {
      const localName = localStorage.getItem("neet_studio_name");
      const localPhone = localStorage.getItem("neet_studio_phone");
      if (localName) studioSettings.studioName = localName;
      if (localPhone) studioSettings.phone = localPhone;
      $("studioTitle").textContent = studioSettings.studioName;
    } catch (e) {}
  }

  async function fetchSchedule(silent = false) {
    try {
      const res = await fetch(`/api/schedule?category=${encodeURIComponent(currentCategory)}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        shootsData = data.shoots || {};
        lastServerVersion = data.lastUpdated || Date.now();
        isAdmin = !!data.isAdmin;
        isServerBackendAvailable = true;
        updateRoleDisplay();
        render();
        if (!silent && $("syncStatus")) {
          $("syncStatus").innerHTML = '<span class="pulse-dot"></span> Live Database';
          $("syncStatus").style.display = "inline-flex";
        }
        return;
      }
    } catch (e) {
      isServerBackendAvailable = false;
    }

    // Static / GitHub Pages Fallback
    loadLocalFallbackData();
  }

  // Real-Time Poller (When connected to backend server)
  async function pollDatabaseUpdates() {
    if (!isServerBackendAvailable) return;
    try {
      const res = await fetch("/api/version");
      if (res.ok) {
        const data = await res.json();
        if (data.lastUpdated && data.lastUpdated !== lastServerVersion) {
          await fetchSchedule(true);
          showToast("⚡ Schedule updated from live database");
        }
      }
    } catch (e) {}
  }

  // ----------------- UI & ROLE RENDERING -----------------

  function updateRoleDisplay() {
    const badge = $("roleBadge");
    const badgeText = $("roleBadgeText");
    const toggleText = $("adminToggleText");
    const adminTools = $("adminTools");
    const userHint = $("userHintText");
    const mobileLoginText = $("mobileLoginText");

    if (isAdmin) {
      badge.className = "badge-role badge-admin";
      badgeText.textContent = "Editor Mode (Neet)";
      toggleText.textContent = "Lock / Viewer";
      if (mobileLoginText) mobileLoginText.textContent = "Logout";
      adminTools.style.display = "inline-flex";
      userHint.innerHTML = "<span><strong>Editor Mode Active:</strong> Click any date to sign, edit, or release it.</span>";
    } else {
      badge.className = "badge-role badge-viewer";
      badgeText.textContent = "Viewer Mode";
      toggleText.textContent = "Photographer Login";
      if (mobileLoginText) mobileLoginText.textContent = "Login";
      adminTools.style.display = "none";
      userHint.innerHTML = "<span>Click any date to check availability or inquire directly with Neet.</span>";
    }
  }

  function getCategoryLabel(cat) {
    switch (cat) {
      case "semi":
        return "Semi-candid / Candid";
      case "wedding":
        return "Cinematic Wedding";
      case "traditional":
      default:
        return "Traditional Video & Photo";
    }
  }

  function getMonths() {
    const list = [];
    for (let i = 0; i < SPAN_MONTHS; i++) {
      const d = new Date(viewDate.year, viewDate.month + i, 1);
      list.push([d.getFullYear(), d.getMonth()]);
    }
    return list;
  }

  function shiftView(step) {
    const d = new Date(viewDate.year, viewDate.month + step, 1);
    viewDate = { year: d.getFullYear(), month: d.getMonth() };
    render();
  }

  // ----------------- RENDER CALENDAR -----------------

  function render() {
    const months = getMonths();
    const firstM = months[0];
    const lastM = months[months.length - 1];

    $("rangeTitle").textContent = `${MONTH_NAMES[firstM[1]]} ${firstM[0]} – ${MONTH_NAMES[lastM[1]]} ${lastM[0]}`;
    $("jumpMonthInput").value = `${firstM[0]}-${pad(firstM[1] + 1)}`;
    $("currentCategoryLabel").textContent = getCategoryLabel(currentCategory);

    // Update Category Tabs
    document.querySelectorAll("#categoryTabs .tab-btn").forEach((btn) => {
      const active = btn.dataset.cat === currentCategory;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    const gridContainer = $("calendarGrid");
    gridContainer.innerHTML = "";

    let totalAvailable = 0;
    let totalBooked = 0;
    let nextShoot = null;

    months.forEach(([y, m]) => {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const firstDayIndex = new Date(y, m, 1).getDay();
      let monthAvailable = 0;
      let monthBooked = 0;

      let daysHtml = "";
      ["S", "M", "T", "W", "T", "F", "S"].forEach((d) => {
        daysHtml += `<div class="weekday-header">${d}</div>`;
      });

      for (let i = 0; i < firstDayIndex; i++) {
        daysHtml += '<div class="day-cell day-empty"></div>';
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const key = dateKey(y, m, d);
        const shootInfo = shootsData[key];
        const isBusy = !!shootInfo;
        const cellDate = new Date(y, m, d);
        const isPast = cellDate < today;
        const isToday = cellDate.getTime() === today.getTime();

        if (isBusy) {
          monthBooked++;
          totalBooked++;
          if (cellDate >= today && (!nextShoot || cellDate < nextShoot.date)) {
            nextShoot = { date: cellDate, key, info: shootInfo };
          }
        } else {
          monthAvailable++;
          totalAvailable++;
        }

        const classes = [
          "day-cell",
          isBusy ? "day-busy" : "day-free",
          isPast ? "day-past" : "",
          isToday ? "day-today" : ""
        ].filter(Boolean).join(" ");

        let titleAttr = "";
        if (isBusy) {
          if (isAdmin && shootInfo.name) {
            titleAttr = ` title="${escapeHtml(shootInfo.name)}${shootInfo.venue ? " · " + escapeHtml(shootInfo.venue) : ""}"`;
          } else {
            titleAttr = ' title="Booked / Reserved"';
          }
        } else {
          titleAttr = ' title="Available for booking"';
        }

        daysHtml += `
          <button type="button" class="${classes}" data-date="${key}" ${titleAttr} aria-label="${d} ${MONTH_NAMES[m]} ${y}, ${isBusy ? "Booked" : "Available"}">
            <span>${d}</span>
          </button>
        `;
      }

      const card = document.createElement("section");
      card.className = "month-card";
      card.innerHTML = `
        <header class="month-header">
          <h3 class="month-name">${MONTH_NAMES[m]} ${y}</h3>
          <span class="month-stats">${monthAvailable} available</span>
        </header>
        <div class="calendar-days-grid">
          ${daysHtml}
        </div>
      `;
      gridContainer.appendChild(card);
    });

    $("totalAvailableCount").textContent = totalAvailable;
    $("totalBookedCount").textContent = totalBooked;

    if (nextShoot) {
      const nsDate = nextShoot.date;
      $("nextShootDate").textContent = `${nsDate.getDate()} ${MONTH_NAMES[nsDate.getMonth()].slice(0, 3)} ${nsDate.getFullYear()}`;
    } else {
      $("nextShootDate").textContent = "None in view";
    }

    if (currentViewMode === "list") {
      renderAgendaView(months);
    }
  }

  function renderAgendaView(months) {
    const listContainer = $("calendarList");
    listContainer.innerHTML = "";

    months.forEach(([y, m]) => {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const monthSection = document.createElement("div");
      monthSection.className = "agenda-month-section";

      let bookedItems = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const key = dateKey(y, m, d);
        if (shootsData[key]) {
          bookedItems.push({ d, key, info: shootsData[key] });
        }
      }

      let itemsHtml = "";
      if (bookedItems.length === 0) {
        itemsHtml = `<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">All dates available in ${MONTH_NAMES[m]}.</p>`;
      } else {
        bookedItems.forEach((item) => {
          const clientDisplay = isAdmin ? (item.info.name || "Reserved Shoot") : "Reserved Shoot";
          const venueDisplay = (isAdmin && item.info.venue) ? ` · ${escapeHtml(item.info.venue)}` : "";
          itemsHtml += `
            <div class="agenda-card is-booked">
              <div>
                <strong>${item.d} ${MONTH_NAMES[m]} ${y}</strong>
                <div style="font-size: 0.8rem; opacity: 0.85;">${escapeHtml(clientDisplay)}${venueDisplay}</div>
              </div>
              <span class="status-indicator" style="width: 8px; height: 8px; border-radius: 50%; background: #ea4335;"></span>
            </div>
          `;
        });
      }

      monthSection.innerHTML = `
        <h3 class="agenda-month-heading">
          <span>${MONTH_NAMES[m]} ${y}</span>
          <small style="font-size: 0.8rem; font-family: var(--font-sans); color: var(--text-muted);">
            ${bookedItems.length} booked / ${daysInMonth - bookedItems.length} free
          </small>
        </h3>
        <div class="agenda-grid">
          ${itemsHtml}
        </div>
      `;
      listContainer.appendChild(monthSection);
    });
  }

  // ----------------- DATE CLICK INTERACTION -----------------
  let activeSelectedDate = null;

  $("scheduleContent").addEventListener("click", (e) => {
    const dayBtn = e.target.closest(".day-cell");
    if (!dayBtn || dayBtn.classList.contains("day-empty")) return;

    const dateStr = dayBtn.dataset.date;
    if (!dateStr) return;

    activeSelectedDate = dateStr;
    const [y, m, d] = dateStr.split("-").map(Number);
    const record = shootsData[dateStr];

    if (isAdmin) {
      // Admin Editor Modal
      $("editDateTitle").textContent = `${d} ${MONTH_NAMES[m - 1]} ${y}`;
      $("editCategoryPill").textContent = getCategoryLabel(currentCategory);

      const banner = $("dateStatusBanner");
      const statusLabel = $("dateStatusLabel");

      if (record) {
        banner.className = "date-status-banner is-booked";
        statusLabel.textContent = "Booked / Reserved Date";
        $("clientNameInput").value = record.name || "";
        $("venueInput").value = record.venue || "";
        $("timeInput").value = record.time || "";
        $("phoneInput").value = record.phone || "";
        $("bookingStatusSelect").value = record.status || "confirmed";
        $("clientNotesInput").value = record.notes || "";
        $("freeDateBtn").style.display = "inline-flex";
        $("saveDateBtn").textContent = "Update Booking";
      } else {
        banner.className = "date-status-banner is-free";
        statusLabel.textContent = "Available Date";
        $("clientNameInput").value = "";
        $("venueInput").value = "";
        $("timeInput").value = "";
        $("phoneInput").value = "";
        $("bookingStatusSelect").value = "confirmed";
        $("clientNotesInput").value = "";
        $("freeDateBtn").style.display = "none";
        $("saveDateBtn").textContent = "Sign Date";
      }

      $("editDateModal").showModal();
    } else {
      // Client / Viewer Modal
      $("clientDateTitle").textContent = `${d} ${MONTH_NAMES[m - 1]} ${y}`;
      $("clientCategoryPill").textContent = getCategoryLabel(currentCategory);

      const content = $("clientDateContent");
      if (record) {
        content.innerHTML = `
          <div class="client-reserved-box">
            <h4>Date Reserved</h4>
            <p>This date is currently marked as <strong>Booked</strong> for ${getCategoryLabel(currentCategory)}.</p>
            <p style="margin-top: 8px; font-size: 0.82rem;">Please browse the open green dates on the calendar for availability.</p>
          </div>
        `;
      } else {
        const studioPhone = studioSettings.phone || "+91 98765 43210";
        const cleanPhone = studioPhone.replace(/[^0-9]/g, "");
        const formattedDate = `${d} ${MONTH_NAMES[m - 1]} ${y}`;
        const waMsg = encodeURIComponent(
          `Hi Neet, I checked your photography schedule and saw that ${formattedDate} is AVAILABLE for ${getCategoryLabel(currentCategory)}. I would like to inquire about booking this date!`
        );
        const waUrl = `https://wa.me/${cleanPhone}?text=${waMsg}`;

        content.innerHTML = `
          <div class="client-inquiry-box">
            <h4>✨ Date Available!</h4>
            <p>${formattedDate} is currently open for booking your shoot.</p>
            <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp full-width" style="margin-top: 10px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              <span>Inquire on WhatsApp</span>
            </a>
          </div>
        `;
      }
      $("clientDateModal").showModal();
    }
  });

  // Save Shoot Date
  $("saveDateBtn").onclick = async () => {
    if (!isAdmin || !activeSelectedDate) return;

    const payload = {
      category: currentCategory,
      date: activeSelectedDate,
      clientName: $("clientNameInput").value.trim() || "Signed Shoot",
      venue: $("venueInput").value.trim(),
      time: $("timeInput").value.trim(),
      phone: $("phoneInput").value.trim(),
      status: $("bookingStatusSelect").value,
      notes: $("clientNotesInput").value.trim()
    };

    if (isServerBackendAvailable) {
      try {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          $("editDateModal").close();
          await fetchSchedule(true);
          showToast("Shoot date saved to database!");
          return;
        }
      } catch (e) {}
    }

    // Static Local Fallback
    const store = loadLocalStore();
    if (!store[currentCategory]) store[currentCategory] = {};
    store[currentCategory][activeSelectedDate] = {
      name: payload.clientName,
      venue: payload.venue,
      time: payload.time,
      phone: payload.phone,
      status: payload.status,
      notes: payload.notes
    };
    saveLocalStore(store);
    shootsData = store[currentCategory];
    render();
    $("editDateModal").close();
    showToast("Shoot date saved!");
  };

  // Release Shoot Date
  $("freeDateBtn").onclick = async () => {
    if (!isAdmin || !activeSelectedDate) return;

    if (isServerBackendAvailable) {
      try {
        const res = await fetch("/api/schedule", {
          method: "DELETE",
          headers: getAuthHeaders(),
          body: JSON.stringify({ category: currentCategory, date: activeSelectedDate })
        });
        if (res.ok) {
          $("editDateModal").close();
          await fetchSchedule(true);
          showToast("Date released and marked available");
          return;
        }
      } catch (e) {}
    }

    // Static Local Fallback
    const store = loadLocalStore();
    if (store[currentCategory] && store[currentCategory][activeSelectedDate]) {
      delete store[currentCategory][activeSelectedDate];
      saveLocalStore(store);
      shootsData = store[currentCategory];
      render();
      $("editDateModal").close();
      showToast("Date released and marked available");
    }
  };

  // ----------------- AUTHENTICATION & LOGIN -----------------
  function handleLoginLogoutToggle() {
    if (isAdmin) {
      adminToken = "";
      isAdmin = false;
      localStorage.removeItem(TOKEN_KEY);
      fetchSchedule();
      showToast("Viewer mode active (Locked)");
    } else {
      $("adminPinInput").value = "";
      $("loginModal").showModal();
    }
  }

  $("adminToggleBtn").onclick = handleLoginLogoutToggle;
  if ($("mobileNavLogin")) {
    $("mobileNavLogin").onclick = handleLoginLogoutToggle;
  }

  $("submitLoginBtn").onclick = async () => {
    const pin = $("adminPinInput").value.trim();
    if (!pin) return;

    if (isServerBackendAvailable) {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin })
        });
        if (res.ok) {
          const data = await res.json();
          adminToken = data.token;
          isAdmin = true;
          localStorage.setItem(TOKEN_KEY, adminToken);
          $("loginModal").close();
          await fetchSchedule();
          showToast("Welcome Neet! Editor unlocked.");
          return;
        }
      } catch (e) {}
    }

    // Static / GitHub Pages PIN check
    const localPin = localStorage.getItem(LOCAL_PIN_KEY) || "1234";
    if (pin === localPin) {
      isAdmin = true;
      adminToken = "local_admin_token";
      localStorage.setItem(TOKEN_KEY, adminToken);
      $("loginModal").close();
      loadLocalFallbackData();
      showToast("Welcome Neet! Editor unlocked.");
    } else {
      showToast("Invalid PIN. Please try again.");
    }
  };

  // ----------------- CATEGORY TABS -----------------
  $("categoryTabs").addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab-btn");
    if (!tabBtn) return;
    const cat = tabBtn.dataset.cat;
    if (cat && currentCategory !== cat) {
      currentCategory = cat;
      fetchSchedule();
    }
  });

  // ----------------- NAVIGATION -----------------
  $("prevBtn").onclick = () => shiftView(-SPAN_MONTHS);
  $("nextBtn").onclick = () => shiftView(SPAN_MONTHS);
  $("todayBtn").onclick = () => {
    viewDate = { year: today.getFullYear(), month: today.getMonth() };
    render();
  };
  $("jumpMonthInput").onchange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [y, m] = val.split("-").map(Number);
    viewDate = { year: y, month: m - 1 };
    render();
  };

  // View Toggle: Grid vs Agenda
  function switchView(mode) {
    currentViewMode = mode;
    $("viewGridBtn").classList.toggle("active", mode === "grid");
    $("viewListBtn").classList.toggle("active", mode === "list");

    if ($("mobileNavCalendar")) {
      $("mobileNavCalendar").classList.toggle("active", mode === "grid");
      $("mobileNavAgenda").classList.toggle("active", mode === "list");
    }

    $("calendarGrid").style.display = mode === "grid" ? "grid" : "none";
    $("calendarList").style.display = mode === "list" ? "block" : "none";
    render();
  }

  $("viewGridBtn").onclick = () => switchView("grid");
  $("viewListBtn").onclick = () => switchView("list");
  if ($("mobileNavCalendar")) $("mobileNavCalendar").onclick = () => switchView("grid");
  if ($("mobileNavAgenda")) $("mobileNavAgenda").onclick = () => switchView("list");

  // ----------------- SHARE & WHATSAPP MODAL -----------------
  function openShareModal() {
    let shareUrl = window.location.origin + window.location.pathname;
    // On static hosting (like GitHub Pages), encode schedule state into URL hash
    // so any recipient instantly receives the latest schedule!
    if (!isServerBackendAvailable) {
      try {
        const store = loadLocalStore();
        const payload = btoa(encodeURIComponent(JSON.stringify(store)));
        shareUrl = `${shareUrl}?mode=view#data=${payload}`;
      } catch (e) {}
    }
    $("shareUrlInput").value = shareUrl;
    $("shareModal").showModal();
  }

  $("shareScheduleBtn").onclick = openShareModal;

  $("copyShareUrlBtn").onclick = () => {
    const input = $("shareUrlInput");
    input.select();
    navigator.clipboard.writeText(input.value).then(
      () => showToast("Share link copied!"),
      () => {
        document.execCommand("copy");
        showToast("Share link copied!");
      }
    );
  };

  $("whatsAppShareBtn").onclick = () => {
    const shareUrl = $("shareUrlInput").value;
    const catLabel = getCategoryLabel(currentCategory);
    const msg = encodeURIComponent(
      `📸 *${studioSettings.studioName} · Shoot Dates Availability*\n` +
      `Check live open and booked dates for ${catLabel} here:\n${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
  };

  // ----------------- COPY SCHEDULE FOR WHATSAPP -----------------
  function copyScheduleToClipboard() {
    const catLabel = getCategoryLabel(currentCategory);
    const months = getMonths();

    let text = `📸 *${studioSettings.studioName.toUpperCase()} · AVAILABLE SHOOT DATES*\n`;
    text += `Category: ${catLabel}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;

    months.forEach(([y, m]) => {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const freeList = [];
      const bookedList = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const key = dateKey(y, m, d);
        if (shootsData[key]) {
          bookedList.push(d);
        } else {
          freeList.push(d);
        }
      }

      text += `\n🗓️ *${MONTH_NAMES[m].toUpperCase()} ${y}*\n`;
      text += `✅ Available: ${freeList.length > 0 ? freeList.join(", ") : "None"}\n`;
      text += `❌ Booked: ${bookedList.length > 0 ? bookedList.join(", ") : "None"}\n`;
    });

    if (studioSettings.phone) {
      text += `\n📞 For bookings & inquiries: ${studioSettings.phone}\n`;
    }

    navigator.clipboard.writeText(text).then(
      () => showToast("Schedule copied! Ready to paste in WhatsApp."),
      () => prompt("Copy this text:", text)
    );
  }

  $("copyClipboardBtn").onclick = copyScheduleToClipboard;
  if ($("mobileNavCopy")) $("mobileNavCopy").onclick = copyScheduleToClipboard;

  // ----------------- PDF EXPORT -----------------
  function exportScheduleAsPdf() {
    showToast("Generating PDF document...");

    const catLabel = getCategoryLabel(currentCategory);
    const months = getMonths();
    const rangeStr = `${MONTH_NAMES[months[0][1]]} ${months[0][0]} – ${MONTH_NAMES[months[months.length - 1][1]]} ${months[months.length - 1][0]}`;

    $("printMetaInfo").textContent = `Category: ${catLabel} · Date Range: ${rangeStr} · Generated on ${new Date().toLocaleDateString()}`;

    if (window.html2pdf) {
      const element = document.createElement("div");
      element.style.padding = "20px";
      element.style.background = "#ffffff";
      element.style.color = "#1d1f24";
      element.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif";

      const printHeaderClone = $("printHeader").cloneNode(true);
      printHeaderClone.style.display = "block";
      printHeaderClone.style.marginBottom = "20px";
      printHeaderClone.style.borderBottom = "2px solid #222";

      const gridClone = $("calendarGrid").cloneNode(true);
      gridClone.style.display = "grid";
      gridClone.style.gridTemplateColumns = "repeat(2, 1fr)";
      gridClone.style.gap = "16px";

      element.appendChild(printHeaderClone);
      element.appendChild(gridClone);

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Neet_Photography_Schedule_${currentCategory}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      };

      window.html2pdf().set(opt).from(element).save().then(() => {
        showToast("PDF downloaded successfully!");
      }).catch(() => {
        window.print();
      });
    } else {
      window.print();
    }
  }

  $("exportPdfBtn").onclick = exportScheduleAsPdf;
  if ($("mobileNavPdf")) $("mobileNavPdf").onclick = exportScheduleAsPdf;

  // ----------------- SETTINGS MODAL -----------------
  $("settingsBtn").onclick = () => {
    if (!isAdmin) return;
    $("photographerNameInput").value = studioSettings.studioName || "Neet Photography";
    $("photographerPhoneInput").value = studioSettings.phone || "";
    $("changePinInput").value = "";
    $("settingsModal").showModal();
  };

  $("saveSettingsBtn").onclick = async () => {
    if (!isAdmin) return;

    const studioName = $("photographerNameInput").value.trim() || "Neet Photography";
    const phone = $("photographerPhoneInput").value.trim();
    const newPin = $("changePinInput").value.trim();

    studioSettings.studioName = studioName;
    studioSettings.phone = phone;
    $("studioTitle").textContent = studioName;

    localStorage.setItem("neet_studio_name", studioName);
    localStorage.setItem("neet_studio_phone", phone);
    if (newPin) {
      localStorage.setItem(LOCAL_PIN_KEY, newPin);
    }

    if (isServerBackendAvailable) {
      try {
        const payload = { studioName, phone };
        if (newPin) payload.newPin = newPin;
        await fetch("/api/settings", {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
      } catch (e) {}
    }

    $("settingsModal").close();
    showToast("Settings updated successfully");
  };

  // ----------------- BACKUP & RESTORE -----------------
  $("backupBtn").onclick = () => {
    if (!isAdmin) return;
    if (isServerBackendAvailable) {
      window.open(`/api/backup?token=${encodeURIComponent(adminToken)}`, "_blank");
      return;
    }
    const store = loadLocalStore();
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `neet-schedule-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("Backup downloaded!");
  };

  $("exportBackupBtn").onclick = () => $("backupBtn").click();
  $("importBackupBtn").onclick = () => $("backupFileInput").click();

  $("backupFileInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (isServerBackendAvailable) {
          await fetch("/api/backup", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(parsed)
          });
        }
        saveLocalStore(parsed);
        $("settingsModal").close();
        await fetchSchedule();
        showToast("Database restored successfully!");
      } catch (err) {
        showToast("Invalid JSON backup file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ----------------- INITIALIZE -----------------
  async function init() {
    await checkAuthSession();
    await fetchSettings();
    await fetchSchedule();

    setInterval(pollDatabaseUpdates, POLL_INTERVAL_MS);
  }

  init();
})();
