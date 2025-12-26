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

  // Modal navigation history
  modalHistory: [],
  forwardHistory: [],

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
    // Update navigation buttons
    this.updateNavButtons();
  },

  closeModal: function() {
    this.elements.modal.classList.add("hidden");
    document.body.style.overflow = "";
    // Clear history and tracking on close
    this.modalHistory = [];
    this.forwardHistory = [];
    this._currentArtist = null;
    this._currentSong = null;
    this._currentDay = null;
    this._currentHour = null;
    this._currentDayOfWeek = null;
    // Reset modal state
    this.resetModalState();
    // Remove any lingering tooltips

    if (this.tooltip) {
      this.tooltip.style("opacity", 0);
    }
  },

  resetModalState: function() {
    if (this.elements.modalArtists) {
      this.elements.modalArtists.parentElement.classList.remove('hidden');
    }
    if (this.elements.modalSongs) {
      this.elements.modalSongs.parentElement.classList.remove('hidden');
    }
    if (this.elements.modalTracks) {
      this.elements.modalTracks.parentElement.classList.remove('hidden');
    }
    if (this.elements.modalTimeline) {
      this.elements.modalTimeline.classList.add('hidden');
    }
  },

  updateNavButtons: function() {
    if (this.elements.modalBack) {
      if (this.modalHistory.length > 0) {
        this.elements.modalBack.classList.remove('disabled');
      } else {
        this.elements.modalBack.classList.add('disabled');
      }
    }
    if (this.elements.modalForward) {
      if (this.forwardHistory.length > 0) {
        this.elements.modalForward.classList.remove('disabled');
      } else {
        this.elements.modalForward.classList.add('disabled');
      }
    }
  },

  goBack: function() {
    if (this.modalHistory.length === 0) return;

    // Save current view to forward history
    const fullYearData = this.getYearData(this.store.currentYear);
    this._pushCurrentToForward(fullYearData);

    const prev = this.modalHistory.pop();
    this.resetModalState();

    // Restore the previous view (skip history to avoid pushing back)
    prev.restore();
    this.updateNavButtons();
  },

  goForward: function() {
    if (this.forwardHistory.length === 0) return;

    // Save current view to back history
    const fullYearData = this.getYearData(this.store.currentYear);
    this._pushCurrentToBack(fullYearData);

    const next = this.forwardHistory.pop();
    this.resetModalState();

    // Restore the next view (skip history to avoid pushing)
    next.restore();
    this.updateNavButtons();
  },

  pushHistory: function(restoreFn) {
    this.modalHistory.push({ restore: restoreFn });
    // Clear forward history when navigating to new view
    this.forwardHistory = [];
  },

  _pushCurrentToBack: function(fullYearData) {
    const s = this;
    const curr = s._getCurrentRestoreFn(fullYearData);
    if (curr) {
      s.modalHistory.push({ restore: curr });
    }
  },

  _pushCurrentToForward: function(fullYearData) {
    const s = this;
    const curr = s._getCurrentRestoreFn(fullYearData);
    if (curr) {
      s.forwardHistory.push({ restore: curr });
    }
  },


  _getCurrentRestoreFn: function(fullYearData) {
    const s = this;
    const prevArtist = s._currentArtist;
    const prevSong = s._currentSong;
    const prevDay = s._currentDay;
    const prevHour = s._currentHour;
    const prevDayOfWeek = s._currentDayOfWeek;

    if (prevArtist) {
      return () => s.showArtistDetail(prevArtist, fullYearData, true);
    } else if (prevSong) {
      return () => s.showSongDetail(prevSong.track, prevSong.artist, fullYearData, true);
    } else if (prevDay) {
      return () => s.showDayDetail(prevDay, fullYearData, true);
    } else if (prevHour !== null && prevHour !== undefined && s._showHourDetail) {
      return () => s._showHourDetail(prevHour, fullYearData);
    } else if (prevDayOfWeek !== null && prevDayOfWeek !== undefined && s._showDayOfWeekDetail) {
      return () => s._showDayOfWeekDetail(prevDayOfWeek, fullYearData);
    }

    return null;
  },
  /*
  _getCurrentRestoreFn: function(fullYearData) {
    const s = this;
    if (s._currentArtist) {
      return () => s.showArtistDetail(s._currentArtist, fullYearData, true);
    } else if (s._currentSong) {
      return () => s.showSongDetail(s._currentSong.track, s._currentSong.artist, fullYearData, true);
    } else if (s._currentDay) {
      return () => s.showDayDetail(s._currentDay, fullYearData, true);
    } else if (s._currentHour !== null && s._currentHour !== undefined && s._showHourDetail) {
      return () => s._showHourDetail(s._currentHour, fullYearData);
    } else if (s._currentDayOfWeek !== null && s._currentDayOfWeek !== undefined && s._showDayOfWeekDetail) {
      return () => s._showDayOfWeekDetail(s._currentDayOfWeek, fullYearData);
    }
    return null;
  },
  */

  _pushCurrentToHistory: function(fullYearData) {
    const s = this;
    const prevArtist = s._currentArtist;
    const prevSong = s._currentSong;
    const prevDay = s._currentDay;
    const prevHour = s._currentHour;
    const prevDayOfWeek = s._currentDayOfWeek;

    if (prevArtist) {
      s.pushHistory(() => s.showArtistDetail(prevArtist, fullYearData, true));
    } else if (prevSong) {
      s.pushHistory(() => s.showSongDetail(prevSong.track, prevSong.artist, fullYearData, true));
    } else if (prevDay) {
      s.pushHistory(() => s.showDayDetail(prevDay, fullYearData, true));
    } else if (prevHour !== null && prevHour !== undefined && s._showHourDetail) {
      s.pushHistory(() => s._showHourDetail(prevHour, fullYearData));
    } else if (prevDayOfWeek !== null && prevDayOfWeek !== undefined && s._showDayOfWeekDetail) {
      s.pushHistory(() => s._showDayOfWeekDetail(prevDayOfWeek, fullYearData));
    }
  },

  // === Timeline Chart ===
  // Renders a timeline chart for the given records
  // options: { colorVar, container, width, height, yearData }
  renderTimeline: function(records, options) {
    const s = this;
    const opts = Object.assign({
      colorVar: '--stats-color',
      container: s.elements.modalTimeline,
      width: 560,
      height: 140,
      yearData: null
    }, options);

    const container = typeof opts.container === 'string'
      ? document.getElementById(opts.container)
      : opts.container;

    if (container === s.elements.modalTimeline) {
      container.classList.remove('hidden');
    }
    container.innerHTML = '';

    // Aggregate by day
    const dayMap = new Map();
    for (const r of records) {
      const key = r.ts.toDayKey();
      dayMap.set(key, (dayMap.get(key) || 0) + r.ms);
    }

    // Create full year range
    const year = s.store.currentYear;
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const chartData = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = d.toDayKey();
      chartData.push({
        date: new Date(d),
        ms: dayMap.get(key) || 0
      });
    }

    // === Smoothing ===
    const values = chartData.map(d => d.ms);

    // Zero-phase filter (forward-backward EMA) - no phase lag
    const alpha = 0.3;
    function zeroPhase(data) {
      const forward = [data[0]];
      for (let i = 1; i < data.length; i++) {
        forward.push(alpha * data[i] + (1 - alpha) * forward[i - 1]);
      }
      const backward = new Array(data.length);
      backward[data.length - 1] = forward[data.length - 1];
      for (let i = data.length - 2; i >= 0; i--) {
        backward[i] = alpha * forward[i] + (1 - alpha) * backward[i + 1];
      }
      return backward;
    }
    function bucketedEnvelope(values, intervalDays = 4, smoothFactor = 0.3) {
      if (!values.length) return [];

      const n = values.length;
      const envelope = new Array(n);

      // Step 1: bucket max over intervalDays
      const bucketMax = [];
      for (let i = 0; i < n; i += intervalDays) {
        let maxVal = 0;
        for (let j = i; j < Math.min(i + intervalDays, n); j++) {
          maxVal = Math.max(maxVal, values[j]);
        }
        bucketMax.push(maxVal);
      }

      // Step 2: interpolate daily between buckets
      for (let i = 0; i < n; i++) {
        const bucketIdx = Math.floor(i / intervalDays);
        const nextBucketIdx = Math.min(bucketIdx + 1, bucketMax.length - 1);
        const t = (i % intervalDays) / intervalDays;
        envelope[i] = bucketMax[bucketIdx] + t * (bucketMax[nextBucketIdx] - bucketMax[bucketIdx]);
      }

      // Step 3: optional forward EMA smoothing
      if (smoothFactor > 0) {
        let prev = envelope[0];
        for (let i = 0; i < n; i++) {
          envelope[i] = smoothFactor * envelope[i] + (1 - smoothFactor) * prev;
          prev = envelope[i];
        }
      }

      return envelope;
    }


    //const smoothedValues = zeroPhase(values);
    const smoothedValues = bucketedEnvelope(values, 4, 0.5);
    const maxSmoothed = Math.max(...smoothedValues, 1);
    const normalizedValues = smoothedValues.map(v => v / maxSmoothed);

    // Chart dimensions
    const margin = { top: 20, right: 20, bottom: 30, left: 10 };
    const width = opts.width;
    const height = opts.height;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleTime()
      .domain([startDate, endDate])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Normalize raw values
    const maxRaw = Math.max(...values, 1);
    const normalizedRaw = values.map(v => v / maxRaw);

    const rawData = chartData.map((d, i) => ({ date: d.date, value: normalizedRaw[i] }));
    const smoothedData = chartData.map((d, i) => ({ date: d.date, value: normalizedValues[i] }));

    // Get color from CSS variable
    const colorVar = opts.colorVar;
    const lightVar = colorVar.replace('-color', '-light');

    // Area fill (smoothed)
    const area = d3.area()
      .x(d => xScale(d.date))
      .y0(innerHeight)
      .y1(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(smoothedData)
      .attr("fill", `var(${lightVar})`)
      .attr("d", area);

    // Raw data line (dotted)
    const rawLine = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(rawData)
      .attr("fill", "none")
      .attr("stroke", "var(--text-muted)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "2,2")
      .attr("stroke-opacity", 0.8)
      .attr("d", rawLine);

    // Smoothed line
    const line = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(smoothedData)
      .attr("fill", "none")
      .attr("stroke", `var(${colorVar})`)
      .attr("stroke-width", 2)
      .attr("d", line);

    // X axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(d3.timeMonth.every(1))
      .tickFormat(d3.timeFormat("%b"));

    svg.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .attr("fill", "var(--text-muted)")
      .attr("font-size", "10px");

    svg.selectAll(".domain, .tick line").attr("stroke", "var(--border)");

    // Tooltip and hover
    const tooltip = s.tooltip; // use persistent tooltip

    const hoverLine = svg.append("line")
      .attr("stroke", "var(--text-muted)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,2")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("opacity", 0);

    const hoverDot = svg.append("circle")
      .attr("r", 4)
      .attr("fill", `var(${colorVar})`)
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .style("opacity", 0);

    // Helper to find closest data point
    function getClosestPoint(mouseX) {
      const date = xScale.invert(mouseX);
      const bisect = d3.bisector(d => d.date).left;
      const idx = bisect(chartData, date);
      const d0 = chartData[idx - 1];
      const d1 = chartData[idx];
      const closestIdx = !d0 ? idx : !d1 ? idx - 1 : (date - d0.date > d1.date - date ? idx : idx - 1);
      if (closestIdx < 0 || closestIdx >= chartData.length) return null;
      return { idx: closestIdx, data: chartData[closestIdx] };
    }


    svg.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("mousemove", function() {
        const point = getClosestPoint(d3.mouse(this)[0]);
        if (!point) return;

        const d = point.data;
        const x = xScale(d.date);
        const y = yScale(rawData[point.idx].value);

        hoverLine.attr("x1", x).attr("x2", x).style("opacity", 1);
        hoverDot.attr("cx", x).attr("cy", y).style("opacity", 1);

        const dateStr = d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        tooltip
          .style("opacity", 1)
          .html(`<strong>${dateStr}</strong>${d.ms > 0 ? s.formatMinutes(d.ms) + ' listened' : 'No listening'}<br><span style="color:var(--text-muted)">Click to view details</span>`)
          .style("left", (d3.event.pageX + 10) + "px")
          .style("top", (d3.event.pageY - 10) + "px");
      })
      .on("mouseout", function() {
        hoverLine.style("opacity", 0);
        hoverDot.style("opacity", 0);
        tooltip.style("opacity", 0);
      })
      .on("click", function() {
        const point = getClosestPoint(d3.mouse(this)[0]);
        if (!point) return;

        tooltip.style("opacity", 0);
        // Always use full year data for day detail
        const fullYearData = s.getYearData(s.store.currentYear);
        // Don't skip history - if modal is open, we want to save current view
        s.showDayDetail(point.data.date, fullYearData, false);
      });
  },

  // === Show Day Detail ===
  showDayDetail: function(date, yearData, skipHistory) {
    const s = this;
    // Always use full year data
    const fullYearData = s.getYearData(s.store.currentYear);
    const dayKey = date.toDayKey();
    const dayRecords = s.store.byDay.get(dayKey) || [];

    if (dayRecords.length === 0) return;

    // Push current view to history before changing (if modal is already open)
    if (!skipHistory && !s.elements.modal.classList.contains('hidden')) {
      s._pushCurrentToHistory(fullYearData);
    }

    // Track current view
    s._currentArtist = null;
    s._currentSong = null;
    s._currentDay = date;
    s._currentHour = null;
    s._currentDayOfWeek = null;

    s.resetModalState();

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    s.elements.modalDate.textContent = date.toLocaleDateString('en-US', options);

    const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;

    const songData = s.aggregateSongs(dayRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams;
    s.elements.modalTracks.textContent = uniqueTracks;

    // Render clickable lists with full year data
    s.renderModalLists(dayRecords, fullYearData);

    s.openModal();
  },

  // === Show Song Detail ===
  showSongDetail: function(track, artist, yearData, skipHistory) {
    const s = this;
    // Always use full year data
    const fullYearData = s.getYearData(s.store.currentYear);
    const songRecords = fullYearData.filter(r => r.track === track && r.artist === artist);
    if (songRecords.length === 0) return;

    // Push current view to history before changing (if modal is already open)
    if (!skipHistory && !s.elements.modal.classList.contains('hidden')) {
      s._pushCurrentToHistory(fullYearData);
    }

    // Track current view
    s._currentArtist = null;
    s._currentSong = { track, artist };
    s._currentDay = null;
    s._currentHour = null;
    s._currentDayOfWeek = null;

    s.resetModalState();

    // Title
    s.elements.modalDate.innerHTML = `${s.escapeHtml(track)}<span class="modal-subtitle">${s.escapeHtml(artist)} · Listening during ${s.store.currentYear}</span>`;

    // Stats
    const totalMs = songRecords.reduce((sum, r) => sum + r.ms, 0);
    const songData = s.aggregateSongs(songRecords);
    const song = [...songData.values()][0];
    const streams = song ? song.streams : 0;

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = streams.toLocaleString();
    s.elements.modalTracks.parentElement.classList.add('hidden');

    // Hide both lists for song view
    s.elements.modalArtists.parentElement.classList.add('hidden');
    s.elements.modalSongs.parentElement.classList.add('hidden');

    // Render timeline
    s.renderTimeline(songRecords, { colorVar: '--songs-color', yearData: fullYearData });

    s.openModal('song');
  },

  // === Show Artist Detail ===
  showArtistDetail: function(artistName, yearData, skipHistory) {
    const s = this;
    // Always use full year data
    const fullYearData = s.getYearData(s.store.currentYear);
    const artistRecords = fullYearData.filter(r => r.artist === artistName);
    if (artistRecords.length === 0) return;

    // Push current view to history before changing (if modal is already open)
    if (!skipHistory && !s.elements.modal.classList.contains('hidden')) {
      s._pushCurrentToHistory(fullYearData);
    }

    // Track current view
    s._currentArtist = artistName;
    s._currentSong = null;
    s._currentDay = null;
    s._currentHour = null;
    s._currentDayOfWeek = null;

    s.resetModalState();

    // Title
    s.elements.modalDate.innerHTML = `${s.escapeHtml(artistName)}<span class="modal-subtitle">Listening throughout ${s.store.currentYear}</span>`;

    // Stats
    const totalMs = artistRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(artistRecords.map(r => r.track).filter(Boolean)).size;
    const songData = s.aggregateSongs(artistRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams.toLocaleString();
    s.elements.modalTracks.textContent = uniqueTracks.toLocaleString();

    // Hide artists section, show only songs
    s.elements.modalArtists.parentElement.classList.add('hidden');

    // Top Songs by this artist (clickable)
    const topSongs = [...songData.values()]
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 10);

    s.elements.modalSongs.innerHTML = topSongs
      .map((song, idx) => `
        <li class="clickable-song" data-idx="${idx}">
          <div class="list-item-info">
            <div class="list-item-name">${s.escapeHtml(song.track)}</div>
          </div>
          <span class="list-item-stat">
            ${s.formatMinutes(song.totalMs)}
            <span class="list-item-streams"> · ${song.streams}×</span>
          </span>
        </li>
      `).join("");

    // Store songs for click handler
    s._modalSongs = topSongs;
    s._modalYearData = fullYearData;

    // Add click handlers to songs in modal
    s.elements.modalSongs.querySelectorAll('.clickable-song').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(li.dataset.idx);
        const song = s._modalSongs[idx];
        s.showSongDetail(song.track, song.artist, fullYearData);
      });
    });

    // Render timeline chart
    s.renderTimeline(artistRecords, { colorVar: '--artists-color', yearData: fullYearData });

    s.openModal('artist');
  },

  // === Render Clickable Modal Lists ===
  // Helper to render clickable artist/song lists in modals
  renderModalLists: function(records, yearData) {
    const s = this;

    // Top Artists
    const artistMap = new Map();
    for (const r of records) {
      if (!r.artist) continue;
      artistMap.set(r.artist, (artistMap.get(r.artist) || 0) + r.ms);
    }
    const topArtists = [...artistMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    s.elements.modalArtists.innerHTML = topArtists
      .map(([name, ms], idx) => `
        <li class="clickable-artist" data-idx="${idx}">
          <div class="list-item-info">
            <div class="list-item-name">${s.escapeHtml(name)}</div>
          </div>
          <span class="list-item-stat">${s.formatMinutes(ms)}</span>
        </li>
      `).join("");

    // Top Songs
    const songData = s.aggregateSongs(records);
    const topSongs = [...songData.values()]
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 5);

    s.elements.modalSongs.innerHTML = topSongs
      .map((song, idx) => `
        <li class="clickable-song" data-idx="${idx}">
          <div class="list-item-info">
            <div class="list-item-name">${s.escapeHtml(song.track)}</div>
            <div class="list-item-detail">${s.escapeHtml(song.artist || "Unknown")}</div>
          </div>
          <span class="list-item-stat">
            ${s.formatMinutes(song.totalMs)}
            <span class="list-item-streams"> · ${song.streams}×</span>
          </span>
        </li>
      `).join("");

    // Store for click handlers
    s._modalArtists = topArtists.map(([name]) => name);
    s._modalSongs = topSongs;
    s._modalYearData = yearData;

    // Add click handlers
    s.elements.modalArtists.querySelectorAll('.clickable-artist').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(li.dataset.idx);
        s.showArtistDetail(s._modalArtists[idx], s._modalYearData);
      });
    });

    s.elements.modalSongs.querySelectorAll('.clickable-song').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(li.dataset.idx);
        const song = s._modalSongs[idx];
        s.showSongDetail(song.track, song.artist, s._modalYearData);
      });
    });
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
    modalBack: document.getElementById("modalBack"),
    modalForward: document.getElementById("modalForward"),
  };

  let tooltip = d3.select("body").selectAll('.timeline-tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select("body")
      .append("div")
      .attr("class", "timeline-tooltip")
      .style("opacity", 0)
      .style("position", "absolute")
      .style("pointer-events", "none"); // avoids blocking hover events
  }
  swim.tooltip = tooltip;


  // Modal controls
  document.getElementById("closeModal").onclick = () => s.closeModal();
  document.getElementById("modalBack").onclick = () => s.goBack();
  document.getElementById("modalForward").onclick = () => s.goForward();
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


  function inferSongDuration(values, eps = 2000) {
    if (values.length === 0) return null;

    // sort ascending
    const sorted = [...values].sort((a, b) => a - b);

    // drop extreme corruption (top 0.1%)
    const cutoff = Math.floor(sorted.length * 0.999);
    const clean = sorted.slice(0, Math.max(cutoff, 1));

    // --- 1) upper-end clustering ---
    const k = Math.min(10, clean.length);
    const top = clean.slice(-k);

    const mean =
      top.reduce((a, b) => a + b, 0) / top.length;
    const variance =
      top.reduce((a, b) => a + (b - mean) ** 2, 0) / top.length;

    if (Math.sqrt(variance) < eps) {
      return Math.round(mean);
    }

    // --- 2) repeated values ---
    const counts = new Map();
    for (const v of clean) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }

    let best = null;
    for (const [v, c] of counts) {
      if (c > 1 && (best === null || v > best)) {
        best = v;
      }
    }

    if (best !== null) return best;

    // --- 3) information-theoretic fallback ---
    return Math.max(...clean);
  }

  function processData() {
    s.store.byDay.clear();
    s.store.years.clear();
    s.store.songDurations.clear();

    // song|artist -> list of playtimes
    const durations = new Map();

    for (const rec of s.store.raw) {
      if (!rec.ts) continue;

      const key = rec.ts.toDayKey();
      s.store.years.add(rec.ts.getFullYear());

      if (!s.store.byDay.has(key)) {
        s.store.byDay.set(key, []);
      }
      s.store.byDay.get(key).push(rec);

      if (rec.track) {
        const songKey = `${rec.track}|||${rec.artist}`;
        if (!durations.has(songKey)) {
          durations.set(songKey, []);
        }
        durations.get(songKey).push(rec.ms);
      }
    }

    // --- second pass: infer durations ---
    for (const [songKey, values] of durations) {
      const inferred = inferSongDuration(values);
      if (inferred !== null) {
        s.store.songDurations.set(songKey, inferred);
      }
    }

    s.store.byDay = new Map(
      [...s.store.byDay.entries()].sort()
    );

    populateYearSelect();
    showDashboard();
  }
  /*
  function processData() {
    s.store.byDay.clear();
    s.store.years.clear();
    s.store.songDurations.clear();

    // song|artist -> list of song durations 
    durations = new Map();

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

        // append the current duration onto the map 
        durations.set(`${rec.track}|||${rec.artist}`, [
          ...(durations.get(`${rec.track}|||${rec.artist}`) || []),
          rec.ms
        ]);
        const songKey = `${rec.track}|||${rec.artist}`;
        const currentMax = s.store.songDurations.get(songKey) || 0;
        s.store.songDurations.set(songKey, Math.max(currentMax, rec.ms));
      }
    }

    s.store.byDay = new Map([...s.store.byDay.entries()].sort());
    populateYearSelect();
    showDashboard();
  }
  */

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
