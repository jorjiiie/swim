// === Data Store ===
const store = {
  raw: [],              // All imported records
  byDay: new Map(),     // Records grouped by day
  songDurations: new Map(), // Global max duration per song
  years: new Set(),
  currentYear: null,
};

// === Date Helpers ===
Date.prototype.getWeekNumber = function () {
  const d = new Date(this.getFullYear(), this.getMonth(), this.getDate());
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
};

Date.prototype.toDayKey = function () {
  return new Date(this.getFullYear(), this.getMonth(), this.getDate()).toISOString();
};

function formatMinutes(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
}

// === DOM Elements ===
const elements = {
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
};

// === Modal Controls ===
document.getElementById("closeModal").onclick = closeModal;
document.querySelector(".modal-backdrop").onclick = closeModal;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function openModal() {
  elements.modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.modal.classList.add("hidden");
  document.body.style.overflow = "";
}

// === Data Import ===
elements.importBtn.onclick = function () {
  const files = elements.fileInput.files;
  if (files.length === 0) return;

  let pending = files.length;

  for (const file of files) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const records = JSON.parse(e.target.result).map(convertRecord);
      store.raw.push(...records);
      pending--;
      if (pending === 0) processData();
    };
    reader.readAsText(file);
  }
};

function convertRecord(raw) {
  return {
    ts: new Date(raw.ts),
    ms: raw.ms_played,
    track: raw.master_metadata_track_name,
    artist: raw.master_metadata_album_artist_name,
  };
}

function processData() {
  store.byDay.clear();
  store.years.clear();
  store.songDurations.clear();

  for (const rec of store.raw) {
    if (!rec.ts) continue;
    
    // Group by day
    const key = rec.ts.toDayKey();
    store.years.add(rec.ts.getFullYear());
    if (store.byDay.has(key)) {
      store.byDay.get(key).push(rec);
    } else {
      store.byDay.set(key, [rec]);
    }
    
    // Track global max duration per song
    if (rec.track) {
      const songKey = `${rec.track}|||${rec.artist}`;
      const currentMax = store.songDurations.get(songKey) || 0;
      store.songDurations.set(songKey, Math.max(currentMax, rec.ms));
    }
  }

  store.byDay = new Map([...store.byDay.entries()].sort());
  populateYearSelect();
  showDashboard();
}

function populateYearSelect() {
  const select = elements.yearSelect;
  select.innerHTML = "";
  const sortedYears = [...store.years].sort((a, b) => b - a);

  sortedYears.forEach((year) => {
    const opt = document.createElement("option");
    opt.value = year;
    opt.text = year;
    select.add(opt);
  });

  select.disabled = false;
  store.currentYear = sortedYears[0];
  select.value = store.currentYear;

  select.onchange = function () {
    store.currentYear = parseInt(this.value);
    renderAll();
  };
}

function showDashboard() {
  elements.emptyState.classList.add("hidden");
  elements.dashboard.classList.remove("hidden");
  renderAll();
}

// === Render All Components ===
function renderAll() {
  const yearData = getYearData(store.currentYear);
  renderStats(yearData);
  renderTopArtists(yearData);
  renderTopSongs(yearData);
  renderHeatmap(yearData);
  renderHourChart(yearData);
  renderDayChart(yearData);
}

function getYearData(year) {
  return store.raw.filter((r) => r.ts && r.ts.getFullYear() === year);
}

// === Stats Cards ===
function renderStats(data) {
  const totalMs = data.reduce((sum, r) => sum + r.ms, 0);
  const hours = Math.round(totalMs / 3600000);
  const artists = new Set(data.map((r) => r.artist).filter(Boolean)).size;
  const tracks = new Set(data.map((r) => `${r.track}-${r.artist}`).filter(Boolean)).size;

  const days = new Set(data.map((r) => r.ts.toDayKey())).size;
  const avgDaily = days > 0 ? Math.round(totalMs / days / 60000) : 0;

  elements.totalHours.textContent = hours.toLocaleString();
  elements.uniqueArtists.textContent = artists.toLocaleString();
  elements.uniqueTracks.textContent = tracks.toLocaleString();
  elements.avgDaily.textContent = avgDaily.toLocaleString();
}

// === Top Artists ===
function renderTopArtists(data) {
  const map = new Map();
  for (const r of data) {
    if (!r.artist) continue;
    map.set(r.artist, (map.get(r.artist) || 0) + r.ms);
  }

  const sorted = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  elements.topArtists.innerHTML = sorted
    .map(([name, ms]) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(name)}</div>
        </div>
        <span class="list-item-stat">${formatMinutes(ms)}</span>
      </li>
    `).join("");
}

// === Top Songs ===
function renderTopSongs(data) {
  const songData = aggregateSongs(data);
  const sorted = [...songData.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10);

  elements.topSongs.innerHTML = sorted
    .map((song) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(song.track)}</div>
          <div class="list-item-detail">${escapeHtml(song.artist || "Unknown")}</div>
        </div>
        <span class="list-item-stat">
          ${formatMinutes(song.totalMs)} · ${song.streams} plays
        </span>
      </li>
    `).join("");
}

// Aggregate songs with stream count using global duration data
function aggregateSongs(data) {
  const map = new Map();
  
  for (const r of data) {
    if (!r.track) continue;
    const key = `${r.track}|||${r.artist}`;
    
    if (map.has(key)) {
      const song = map.get(key);
      song.totalMs += r.ms;
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
    const globalMax = store.songDurations.get(key) || song.totalMs;
    song.streams = Math.max(1, Math.round(song.totalMs / globalMax));
  }
  
  return map;
}

// === Heatmap ===
function renderHeatmap(data) {
  const container = d3.select("#heatmap");
  container.selectAll("*").remove();

  const margin = { top: 20, right: 20, bottom: 20, left: 50 };
  const cellSize = 15;
  const cellPadding = 3;
  const width = 53 * (cellSize + cellPadding) + margin.left + margin.right;
  const height = 7 * (cellSize + cellPadding) + margin.top + margin.bottom;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Aggregate by day
  const dayMap = new Map();
  for (const r of data) {
    const key = r.ts.toDayKey();
    dayMap.set(key, (dayMap.get(key) || 0) + r.ms);
  }

  const chartData = [...dayMap.entries()].map(([date, ms]) => ({
    date: new Date(date),
    ms,
  }));

  const maxMs = Math.max(...chartData.map((d) => d.ms), 1);

  const colorScale = d3.scaleSequential()
    .domain([0, maxMs])
    .interpolator(d3.interpolate("#ede9e4", "#c45d3a"));

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  days.forEach((day, i) => {
    svg.append("text")
      .attr("x", -10)
      .attr("y", i * (cellSize + cellPadding) + cellSize / 2 + 4)
      .attr("text-anchor", "end")
      .attr("fill", "#9a918a")
      .attr("font-size", "10px")
      .text(day);
  });

  // Tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "heatmap-tooltip")
    .style("opacity", 0);

  svg.selectAll("rect")
    .data(chartData)
    .enter()
    .append("rect")
    .attr("width", cellSize)
    .attr("height", cellSize)
    .attr("x", (d) => (d.date.getWeekNumber() - 1) * (cellSize + cellPadding))
    .attr("y", (d) => d.date.getDay() * (cellSize + cellPadding))
    .attr("rx", 3)
    .attr("fill", (d) => colorScale(d.ms))
    .style("cursor", "pointer")
    .on("mouseover", function (d) {
      tooltip.style("opacity", 1)
        .html(`<strong>${d.date.toDateString()}</strong><br>${formatMinutes(d.ms)} listened<br><span style="color:#9a918a">Click for details</span>`);
      d3.select(this).attr("stroke", "#c45d3a").attr("stroke-width", 2);
    })
    .on("mousemove", function () {
      tooltip
        .style("left", (d3.event.pageX + 10) + "px")
        .style("top", (d3.event.pageY - 10) + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
      d3.select(this).attr("stroke", "none");
    })
    .on("click", function (d) {
      tooltip.style("opacity", 0);
      showDailyDetail(d.date);
    });
}

// === Daily Detail Modal ===
function showDailyDetail(date) {
  const dayKey = date.toDayKey();
  const dayRecords = store.byDay.get(dayKey) || [];
  
  if (dayRecords.length === 0) return;
  
  // Header
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  elements.modalDate.textContent = date.toLocaleDateString('en-US', options);
  
  // Stats
  const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
  const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;
  
  // Calculate total streams for the day
  const songData = aggregateSongs(dayRecords);
  const totalStreams = [...songData.values()].reduce((sum, s) => sum + s.streams, 0);
  
  elements.modalTime.textContent = formatMinutes(totalMs);
  elements.modalStreams.textContent = totalStreams;
  elements.modalTracks.textContent = uniqueTracks;
  
  // Top Artists for the day
  const artistMap = new Map();
  for (const r of dayRecords) {
    if (!r.artist) continue;
    artistMap.set(r.artist, (artistMap.get(r.artist) || 0) + r.ms);
  }
  
  const topArtists = [...artistMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  elements.modalArtists.innerHTML = topArtists
    .map(([name, ms]) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(name)}</div>
        </div>
        <span class="list-item-stat">${formatMinutes(ms)}</span>
      </li>
    `).join("");
  
  // Top Songs for the day
  const topSongs = [...songData.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 5);
  
  elements.modalSongs.innerHTML = topSongs
    .map((song) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(song.track)}</div>
          <div class="list-item-detail">${escapeHtml(song.artist || "Unknown")}</div>
        </div>
        <span class="list-item-stat">
          ${formatMinutes(song.totalMs)}
          <span class="list-item-streams"> · ${song.streams}×</span>
        </span>
      </li>
    `).join("");
  
  openModal();
}

// === Hour Chart ===
function renderHourChart(data) {
  const hours = Array(24).fill(0);
  for (const r of data) {
    hours[r.ts.getHours()] += r.ms;
  }

  const max = Math.max(...hours);
  const labels = hours.map((_, i) => {
    if (i === 0) return "12a";
    if (i === 12) return "12p";
    return i < 12 ? `${i}a` : `${i - 12}p`;
  });

  elements.hourChart.innerHTML = `<div class="bar-chart">${
    hours.map((ms, i) => `
      <div class="bar-row" data-hour="${i}">
        <span class="bar-label">${labels[i]}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${max > 0 ? (ms / max) * 100 : 0}%"></div>
        </div>
        <span class="bar-value">${formatMinutes(ms)}</span>
      </div>
    `).join("")
  }</div>`;

  // Add click handlers
  elements.hourChart.querySelectorAll('.bar-row').forEach(row => {
    row.addEventListener('click', () => {
      const hour = parseInt(row.dataset.hour);
      showHourDetail(hour, data);
    });
  });
}

// === Day of Week Chart ===
function renderDayChart(data) {
  const days = Array(7).fill(0);
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const r of data) {
    days[r.ts.getDay()] += r.ms;
  }

  const max = Math.max(...days);

  elements.dayChart.innerHTML = `<div class="bar-chart">${
    days.map((ms, i) => `
      <div class="bar-row" data-day="${i}">
        <span class="bar-label">${labels[i]}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${max > 0 ? (ms / max) * 100 : 0}%"></div>
        </div>
        <span class="bar-value">${formatMinutes(ms)}</span>
      </div>
    `).join("")
  }</div>`;

  // Add click handlers
  elements.dayChart.querySelectorAll('.bar-row').forEach(row => {
    row.addEventListener('click', () => {
      const day = parseInt(row.dataset.day);
      showDayOfWeekDetail(day, data);
    });
  });
}

// === Hour Detail Modal ===
function showHourDetail(hour, yearData) {
  const hourRecords = yearData.filter(r => r.ts.getHours() === hour);
  
  if (hourRecords.length === 0) return;
  
  // Format hour label
  let hourLabel;
  if (hour === 0) hourLabel = "12:00 AM";
  else if (hour === 12) hourLabel = "12:00 PM";
  else if (hour < 12) hourLabel = `${hour}:00 AM`;
  else hourLabel = `${hour - 12}:00 PM`;
  
  elements.modalDate.innerHTML = `${hourLabel}<span class="modal-subtitle">All listening during this hour in ${store.currentYear}</span>`;
  
  // Stats
  const totalMs = hourRecords.reduce((sum, r) => sum + r.ms, 0);
  const uniqueTracks = new Set(hourRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;
  const songData = aggregateSongs(hourRecords);
  const totalStreams = [...songData.values()].reduce((sum, s) => sum + s.streams, 0);
  
  elements.modalTime.textContent = formatMinutes(totalMs);
  elements.modalStreams.textContent = totalStreams.toLocaleString();
  elements.modalTracks.textContent = uniqueTracks.toLocaleString();
  
  // Top Artists
  const artistMap = new Map();
  for (const r of hourRecords) {
    if (!r.artist) continue;
    artistMap.set(r.artist, (artistMap.get(r.artist) || 0) + r.ms);
  }
  
  const topArtists = [...artistMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  elements.modalArtists.innerHTML = topArtists
    .map(([name, ms]) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(name)}</div>
        </div>
        <span class="list-item-stat">${formatMinutes(ms)}</span>
      </li>
    `).join("");
  
  // Top Songs
  const topSongs = [...songData.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 5);
  
  elements.modalSongs.innerHTML = topSongs
    .map((song) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(song.track)}</div>
          <div class="list-item-detail">${escapeHtml(song.artist || "Unknown")}</div>
        </div>
        <span class="list-item-stat">
          ${formatMinutes(song.totalMs)}
          <span class="list-item-streams"> · ${song.streams}×</span>
        </span>
      </li>
    `).join("");
  
  openModal();
}

// === Day of Week Detail Modal ===
function showDayOfWeekDetail(dayIndex, yearData) {
  const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayRecords = yearData.filter(r => r.ts.getDay() === dayIndex);
  
  if (dayRecords.length === 0) return;
  
  elements.modalDate.innerHTML = `${dayLabels[dayIndex]}s<span class="modal-subtitle">All listening on ${dayLabels[dayIndex]}s in ${store.currentYear}</span>`;
  
  // Stats
  const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
  const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;
  const songData = aggregateSongs(dayRecords);
  const totalStreams = [...songData.values()].reduce((sum, s) => sum + s.streams, 0);
  
  elements.modalTime.textContent = formatMinutes(totalMs);
  elements.modalStreams.textContent = totalStreams.toLocaleString();
  elements.modalTracks.textContent = uniqueTracks.toLocaleString();
  
  // Top Artists
  const artistMap = new Map();
  for (const r of dayRecords) {
    if (!r.artist) continue;
    artistMap.set(r.artist, (artistMap.get(r.artist) || 0) + r.ms);
  }
  
  const topArtists = [...artistMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  elements.modalArtists.innerHTML = topArtists
    .map(([name, ms]) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(name)}</div>
        </div>
        <span class="list-item-stat">${formatMinutes(ms)}</span>
      </li>
    `).join("");
  
  // Top Songs
  const topSongs = [...songData.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 5);
  
  elements.modalSongs.innerHTML = topSongs
    .map((song) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(song.track)}</div>
          <div class="list-item-detail">${escapeHtml(song.artist || "Unknown")}</div>
        </div>
        <span class="list-item-stat">
          ${formatMinutes(song.totalMs)}
          <span class="list-item-streams"> · ${song.streams}×</span>
        </span>
      </li>
    `).join("");
  
  openModal();
}

// === Utilities ===
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
