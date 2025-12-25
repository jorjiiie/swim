// === swim core ===
window.swim = {
  // Data store
  store: {
    raw: [],
    byDay: new Map(),
    songDurations: new Map(),
    years: new Set(),
    currentYear: null,
  },

  // Panel registry
  panels: [],
  registerPanel: function(renderFn) {
    this.panels.push(renderFn);
  },

  // DOM elements (populated on DOMContentLoaded)
  elements: {},

  // === Utilities ===
  formatMinutes: function(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remaining = mins % 60;
    return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
  },

  escapeHtml: function(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  getYearData: function(year) {
    return this.store.raw.filter((r) => r.ts && r.ts.getFullYear() === year);
  },

  aggregateSongs: function(data) {
    const map = new Map();

    for (const r of data) {
      if (!r.track) continue;
      const key = `${r.track}|||${r.artist}`;

      if (map.has(key)) {
        map.get(key).totalMs += r.ms;
      } else {
        map.set(key, {
          track: r.track,
          artist: r.artist,
          totalMs: r.ms,
        });
      }
    }

    // Calculate estimated streams using global max duration
    for (const [key, song] of map.entries()) {
      const globalMax = this.store.songDurations.get(key) || song.totalMs;
      song.streams = Math.max(1, Math.round(song.totalMs / globalMax));
    }

    return map;
  },

  // === Modal ===
  openModal: function(theme = 'activity') {
    this.elements.modal.classList.remove("hidden");
    this.elements.modal.querySelector('.modal-content').dataset.theme = theme;
    document.body.style.overflow = "hidden";
  },

  closeModal: function() {
    this.elements.modal.classList.add("hidden");
    document.body.style.overflow = "";
  },

  // === Render all panels ===
  renderAll: function() {
    const data = this.getYearData(this.store.currentYear);
    this.panels.forEach(fn => fn(data));
  },
};

// === Date Helpers ===
Date.prototype.getWeekNumber = function() {
  const d = new Date(this.getFullYear(), this.getMonth(), this.getDate());
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
};

Date.prototype.toDayKey = function() {
  return new Date(this.getFullYear(), this.getMonth(), this.getDate()).toISOString();
};

// === Initialize on DOM ready ===
document.addEventListener('DOMContentLoaded', function() {
  const s = swim;

  // Cache DOM elements
  s.elements = {
    fileInput: document.getElementById("selectFiles"),
    importBtn: document.getElementById("import"),
    yearSelect: document.getElementById("yearSelect"),
    emptyState: document.getElementById("emptyState"),
    dashboard: document.getElementById("dashboardContent"),
    totalHours: document.getElementById("totalHours"),
    uniqueArtists: document.getElementById("uniqueArtists"),
    uniqueTracks: document.getElementById("uniqueTracks"),
    avgDaily: document.getElementById("avgDaily"),
    topArtists: document.getElementById("topArtists"),
    topSongs: document.getElementById("topSongs"),
    heatmap: document.getElementById("heatmap"),
    hourChart: document.getElementById("hourChart"),
    dayChart: document.getElementById("dayChart"),
    modal: document.getElementById("dailyModal"),
    modalDate: document.getElementById("modalDate"),
    modalTime: document.getElementById("modalTime"),
    modalStreams: document.getElementById("modalStreams"),
    modalTracks: document.getElementById("modalTracks"),
    modalArtists: document.getElementById("modalArtists"),
    modalSongs: document.getElementById("modalSongs"),
    modalTimeline: document.getElementById("modalTimeline"),
  };

  // Modal controls
  document.getElementById("closeModal").onclick = () => s.closeModal();
  document.querySelector(".modal-backdrop").onclick = () => s.closeModal();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") s.closeModal();
  });

  // Data import
  s.elements.importBtn.onclick = function() {
    const files = s.elements.fileInput.files;
    if (files.length === 0) return;

    let pending = files.length;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const records = JSON.parse(e.target.result).map(convertRecord);
        s.store.raw.push(...records);
        pending--;
        if (pending === 0) processData();
      };
      reader.readAsText(file);
    }
  };

  function convertRecord(raw) {
    const isPodcast = !!raw.episode_name;
    return {
      ts: new Date(raw.ts),
      ms: raw.ms_played,
      track: isPodcast ? raw.episode_name : raw.master_metadata_track_name,
      artist: isPodcast ? raw.episode_show_name : raw.master_metadata_album_artist_name,
    };
  }

  function processData() {
    s.store.byDay.clear();
    s.store.years.clear();
    s.store.songDurations.clear();

    for (const rec of s.store.raw) {
      if (!rec.ts) continue;

      const key = rec.ts.toDayKey();
      s.store.years.add(rec.ts.getFullYear());

      if (s.store.byDay.has(key)) {
        s.store.byDay.get(key).push(rec);
      } else {
        s.store.byDay.set(key, [rec]);
      }

      if (rec.track) {
        const songKey = `${rec.track}|||${rec.artist}`;
        const currentMax = s.store.songDurations.get(songKey) || 0;
        s.store.songDurations.set(songKey, Math.max(currentMax, rec.ms));
      }
    }

    s.store.byDay = new Map([...s.store.byDay.entries()].sort());
    populateYearSelect();
    showDashboard();
  }

  function populateYearSelect() {
    const select = s.elements.yearSelect;
    select.innerHTML = "";
    const sortedYears = [...s.store.years].sort((a, b) => b - a);

    sortedYears.forEach((year) => {
      const opt = document.createElement("option");
      opt.value = year;
      opt.text = year;
      select.add(opt);
    });

    select.disabled = false;
    s.store.currentYear = sortedYears[0];
    select.value = s.store.currentYear;

    select.onchange = function() {
      s.store.currentYear = parseInt(this.value);
      s.renderAll();
    };
  }

  function showDashboard() {
    s.elements.emptyState.classList.add("hidden");
    s.elements.dashboard.classList.remove("hidden");
    s.renderAll();
  }
});
