// === swim core ===
window.swim = Object.assign(window.swim || {}, {
  // Data store
  store: {
    raw: [],
    byDay: new Map(),
    songDurations: new Map(),
    years: new Set(),
    currentYear: null,  // null means "all years"
    filterQuery: "",           // Raw filter query string
    filterAST: null,           // Parsed AST
    filterPredicate: null,     // Compiled predicate function
    dateRange: { start: null, end: null },  // zoom date filter (from timeline)
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

  // Setup scroll effect for overflowing text in list items
  setupScrollingNames: function(container) {
    const items = container.querySelectorAll('.list-item-name');
    items.forEach(el => {
      // Check if text overflows
      if (el.scrollWidth > el.clientWidth) {
        const text = el.textContent;
        const escaped = this.escapeHtml(text);
        // Duplicate text with spacer for seamless loop
        el.innerHTML = `<span class="scroll-text">${escaped}<span class="scroll-spacer"></span>${escaped}<span class="scroll-spacer"></span></span>`;
        el.classList.add('has-scroll');

        // Calculate duration based on text length (50px per second)
        const scrollText = el.querySelector('.scroll-text');
        const textWidth = scrollText.scrollWidth / 2; // Half because we duplicated
        const duration = Math.max(1, textWidth / 80); // min 1s, 80px/sec
        el.style.setProperty('--scroll-duration', `${duration}s`);
      }
    });
  },

  getYearData: function(year) {
    if (year === null) {
      // All years
      return this.store.raw.filter((r) => r.ts);
    }
    return this.store.raw.filter((r) => r.ts && r.ts.getFullYear() === year);
  },

  // Get data filtered by year, filter predicate, AND date range
  // Podcasts are filtered out by default (handled in filter AST)
  getFilteredData: function() {
    let data = this.getYearData(this.store.currentYear);

    // Apply compiled filter predicate if exists
    if (this.store.filterPredicate) {
      data = data.filter(this.store.filterPredicate);
    } else {
      // No filter query - filter out podcasts by default
      data = data.filter((r) => r.isPodcast !== true);
    }

    // Filter by date range (from timeline zoom)
    const { start, end } = this.store.dateRange;
    if (start && end) {
      data = data.filter((r) => r.ts >= start && r.ts <= end);
    }

    return data;
  },

  // Set filter from query string
  setFilter: function(query) {
    this.store.filterQuery = query;
    const searchInput = this.elements.searchFilter;

    if (query.trim()) {
      try {
        const result = this.filter.createFilter(query);
        this.store.filterAST = result.ast;
        this.store.filterPredicate = result.predicate;
        searchInput.classList.remove('filter-error');
        this.elements.filterErrorTooltip.classList.remove('visible');
      } catch (e) {
        // Show error state on input
        searchInput.classList.add('filter-error');
        this.elements.filterErrorTooltip.textContent = e.message;
        this.elements.filterErrorTooltip.classList.add('visible');
        // Clear filter on parse error
        this.store.filterAST = null;
        this.store.filterPredicate = null;
      }
    } else {
      this.store.filterAST = null;
      this.store.filterPredicate = null;
      searchInput.classList.remove('filter-error');
      this.elements.filterErrorTooltip.classList.remove('visible');
    }
    this.renderAll();
  },

  // Get year label for display
  getYearLabel: function() {
    return this.store.currentYear === null ? "all time" : this.store.currentYear;
  },

  // Get a description of the current filter for display
  getFilterDescription: function() {
    const year = this.store.currentYear === null ? "All time" : this.store.currentYear;
    const { start, end } = this.store.dateRange;

    let desc = year;
    if (start && end) {
      const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      desc = `${fmt(start)} – ${fmt(end)}`;
      if (this.store.currentYear === null) {
        // Include year in range for multi-year
        const fmtYear = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        desc = `${fmtYear(start)} – ${fmtYear(end)}`;
      }
    }
    // Add filter description from AST
    if (this.store.filterAST) {
      const filterDesc = this.filter.describe(this.store.filterAST);
      if (filterDesc) {
        desc += ` · ${filterDesc}`;
      }
    }
    return desc;
  },

  // Set date range filter and re-render
  setDateRange: function(start, end) {
    this.store.dateRange = { start, end };
    this.renderAll();
  },

  // Clear date range filter
  clearDateRange: function() {
    this.store.dateRange = { start: null, end: null };
    this.renderAll();
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
      if (song.totalMs <= 0) {
        song.streams = 0;
        continue;
      }

      const raw = this.store.songDurations.get(key);
      const globalMax =
        Number.isFinite(raw) && raw > 0 ? raw : song.totalMs;

      song.streams = Math.max(
        1,
        Math.round(song.totalMs / globalMax)
      );
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
    // Setup scrolling names after modal is visible
    const s = this;
    requestAnimationFrame(() => {
      s.setupScrollingNames(s.elements.modalArtists);
      s.setupScrollingNames(s.elements.modalSongs);
    });
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
    if (this.elements.modalHourChart) {
      this.elements.modalHourChart.classList.add('hidden');
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
    this._pushCurrentToForward();

    const prev = this.modalHistory.pop();
    this.resetModalState();

    // Restore the previous view (skip history to avoid pushing back)
    prev.restore();
    this.updateNavButtons();
  },

  goForward: function() {
    if (this.forwardHistory.length === 0) return;

    // Save current view to back history
    this._pushCurrentToBack();

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

  _pushCurrentToBack: function() {
    const s = this;
    const curr = s._getCurrentRestoreFn();
    if (curr) {
      s.modalHistory.push({ restore: curr });
    }
  },

  _pushCurrentToForward: function() {
    const s = this;
    const curr = s._getCurrentRestoreFn();
    if (curr) {
      s.forwardHistory.push({ restore: curr });
    }
  },

  // Creates a restore function for the current view
  // Note: modal functions fetch fresh filtered data internally, so we don't store data here
  _getCurrentRestoreFn: function() {
    const s = this;
    const prevArtist = s._currentArtist;
    const prevSong = s._currentSong;
    const prevDay = s._currentDay;
    const prevHour = s._currentHour;
    const prevDayOfWeek = s._currentDayOfWeek;

    if (prevArtist) {
      return () => s.showArtistDetail(prevArtist, true);
    } else if (prevSong) {
      return () => s.showSongDetail(prevSong.track, prevSong.artist, true);
    } else if (prevDay) {
      return () => s.showDayDetail(prevDay, true);
    } else if (prevHour !== null && prevHour !== undefined && s._showHourDetail) {
      return () => s._showHourDetail(prevHour);
    } else if (prevDayOfWeek !== null && prevDayOfWeek !== undefined && s._showDayOfWeekDetail) {
      return () => s._showDayOfWeekDetail(prevDayOfWeek);
    }

    return null;
  },

  _pushCurrentToHistory: function() {
    const s = this;
    const curr = s._getCurrentRestoreFn();
    if (curr) {
      s.pushHistory(curr);
    }
  },

  // === Timeline Chart ===
  // Renders a timeline chart for the given records
  // options: { colorVar, container, width, height, yearData, zoomStart, zoomEnd, isGlobal }
  // isGlobal: if true, zoom updates the global date filter; if false, zoom is local to this chart
  renderTimeline: function(records, options) {
    const s = this;
    const opts = Object.assign({
      colorVar: '--stats-color',
      container: s.elements.modalTimeline,
      width: 560,
      height: 140,
      yearData: null,
      zoomStart: null,
      zoomEnd: null,
      isGlobal: false
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

    // Create date range (full year or all data range)
    let fullStartDate, fullEndDate;
    if (s.store.currentYear === null) {
      // All years - use data range
      const dates = records.map(r => r.ts).filter(Boolean);
      if (dates.length === 0) return;
      fullStartDate = new Date(Math.min(...dates));
      fullEndDate = new Date(Math.max(...dates));
      // Extend to full months
      fullStartDate.setDate(1);
      fullEndDate.setMonth(fullEndDate.getMonth() + 1, 0);
    } else {
      const year = s.store.currentYear;
      fullStartDate = new Date(year, 0, 1);
      fullEndDate = new Date(year, 11, 31);
    }

    // Use zoom range if provided, otherwise full range
    // For global charts, use the store's dateRange
    let startDate, endDate, isZoomed;
    if (opts.isGlobal && s.store.dateRange.start && s.store.dateRange.end) {
      startDate = s.store.dateRange.start;
      endDate = s.store.dateRange.end;
      isZoomed = true;
    } else {
      startDate = opts.zoomStart || fullStartDate;
      endDate = opts.zoomEnd || fullEndDate;
      isZoomed = opts.zoomStart !== null && opts.zoomEnd !== null;
    }

    // Store original options for reset
    container._timelineOpts = {
      records: records,
      baseOptions: Object.assign({}, opts, { zoomStart: null, zoomEnd: null }),
      fullStartDate: fullStartDate,
      fullEndDate: fullEndDate
    };

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

    // X axis - adapt based on date range
    let xAxis;
    const rangeDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    if (rangeDays > 365 * 2) {
      // Multi-year: show years
      xAxis = d3.axisBottom(xScale)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d3.timeFormat("%Y"));
    } else if (rangeDays > 90) {
      // Several months: show months
      xAxis = d3.axisBottom(xScale)
        .ticks(d3.timeMonth.every(1))
        .tickFormat(d3.timeFormat("%b"));
    } else if (rangeDays > 14) {
      // Weeks: show week starts
      xAxis = d3.axisBottom(xScale)
        .ticks(d3.timeWeek.every(1))
        .tickFormat(d3.timeFormat("%b %d"));
    } else {
      // Days: show individual days
      xAxis = d3.axisBottom(xScale)
        .ticks(d3.timeDay.every(1))
        .tickFormat(d3.timeFormat("%b %d"));
    }

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


    // Selection rectangle for drag-to-zoom
    const selectionRect = svg.append("rect")
      .attr("class", "zoom-selection")
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", `var(${colorVar})`)
      .attr("fill-opacity", 0.2)
      .attr("stroke", `var(${colorVar})`)
      .attr("stroke-width", 1)
      .style("display", "none");

    // Zoom reset hint (shown when zoomed)
    if (isZoomed) {
      svg.append("text")
        .attr("x", innerWidth - 5)
        .attr("y", -5)
        .attr("text-anchor", "end")
        .attr("fill", "var(--text-muted)")
        .attr("font-size", "10px")
        .text("Double-click to reset zoom");
    }

    // Drag state
    let isDragging = false;
    let dragStartX = null;
    let dragStartDate = null;
    let wasDrag = false;
    let clickTimeout = null;

    const interactionRect = svg.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousedown", function() {
        const mouseX = d3.mouse(this)[0];
        isDragging = true;
        wasDrag = false;
        dragStartX = mouseX;
        dragStartDate = xScale.invert(mouseX);
        selectionRect
          .attr("x", mouseX)
          .attr("width", 0)
          .style("display", "block");
      })
      .on("mousemove", function() {
        const mouseX = d3.mouse(this)[0];

        if (isDragging) {
          // Update selection rectangle
          const x1 = Math.min(dragStartX, mouseX);
          const x2 = Math.max(dragStartX, mouseX);
          selectionRect
            .attr("x", x1)
            .attr("width", x2 - x1);

          // Hide hover elements during drag
          hoverLine.style("opacity", 0);
          hoverDot.style("opacity", 0);
          tooltip.style("opacity", 0);
        } else {
          // Normal hover behavior
          const point = getClosestPoint(mouseX);
          if (!point) return;

          const d = point.data;
          const x = xScale(d.date);
          const y = yScale(rawData[point.idx].value);

          hoverLine.attr("x1", x).attr("x2", x).style("opacity", 1);
          hoverDot.attr("cx", x).attr("cy", y).style("opacity", 1);

          const dateStr = d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          tooltip
            .style("opacity", 1)
            .html(`<strong>${dateStr}</strong>${d.ms > 0 ? s.formatMinutes(d.ms) + ' listened' : 'No listening'}<br><span style="color:var(--text-muted)">Click to view · Drag to zoom</span>`)
            .style("left", (d3.event.pageX + 10) + "px")
            .style("top", (d3.event.pageY - 10) + "px");
        }
      })
      .on("mouseup", function() {
        if (!isDragging) return;
        isDragging = false;
        selectionRect.style("display", "none");

        const mouseX = d3.mouse(this)[0];
        const dragEndDate = xScale.invert(mouseX);

        // Only zoom if dragged more than 10 pixels
        if (Math.abs(mouseX - dragStartX) > 10) {
          wasDrag = true;
          const zoomStart = new Date(Math.min(dragStartDate, dragEndDate));
          const zoomEnd = new Date(Math.max(dragStartDate, dragEndDate));

          if (opts.isGlobal) {
            // Update global date filter - this re-renders all panels
            s.setDateRange(zoomStart, zoomEnd);
          } else {
            // Local zoom - just re-render this chart
            s.renderTimeline(records, Object.assign({}, opts, {
              zoomStart: zoomStart,
              zoomEnd: zoomEnd
            }));
          }
        }

        dragStartX = null;
        dragStartDate = null;
      })
      .on("mouseout", function() {
        if (isDragging) return; // Don't interrupt drag
        hoverLine.style("opacity", 0);
        hoverDot.style("opacity", 0);
        tooltip.style("opacity", 0);
      })
      .on("click", function() {
        if (wasDrag) return; // Was a drag, not click

        const mouseX = d3.mouse(this)[0];

        // Delay click to allow double-click to cancel it
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          const point = getClosestPoint(mouseX);
          if (!point) return;

          tooltip.style("opacity", 0);
          s.showDayDetail(point.data.date, false);
        }, 250);
      })
      .on("dblclick", function() {
        // Cancel pending click
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }

        // Reset zoom on double-click
        if (opts.isGlobal) {
          // Clear global date filter if set
          if (s.store.dateRange.start || s.store.dateRange.end) {
            s.clearDateRange();
          }
        } else if (isZoomed && container._timelineOpts) {
          // Local reset
          const origOpts = container._timelineOpts;
          s.renderTimeline(origOpts.records, origOpts.baseOptions);
        }
      });

    // Handle mouse leaving SVG during drag
    d3.select(container).select("svg").on("mouseleave", function() {
      if (isDragging) {
        isDragging = false;
        selectionRect.style("display", "none");
        dragStartX = null;
        dragStartDate = null;
      }
    });
  },

  // === Render Day Hour Chart ===
  // Shows hourly breakdown for a specific day's records
  renderDayHourChart: function(records) {
    const s = this;
    const container = s.elements.modalHourChart;
    container.innerHTML = '';
    container.classList.remove('hidden');

    if (records.length === 0) {
      container.classList.add('hidden');
      return;
    }

    // Aggregate by hour
    const hours = Array(24).fill(0);
    const hourRecords = Array(24).fill(null).map(() => []);

    for (const r of records) {
      const hour = r.ts.getHours();
      hours[hour] += r.ms;
      hourRecords[hour].push(r);
    }

    const max = Math.max(...hours, 1);

    // Create hour labels
    const formatHour = (i) => {
      if (i === 0) return "12a";
      if (i === 12) return "12p";
      return i < 12 ? `${i}a` : `${i - 12}p`;
    };

    // Build chart HTML
    container.innerHTML = `
      <h3 class="modal-hour-chart-title">Hourly Breakdown</h3>
      <div class="hour-chart-grid">
        ${hours.map((ms, i) => `
          <div class="hour-bar-col" data-hour="${i}">
            <div class="hour-bar-track">
              <div class="hour-bar-fill" style="height: ${ms > 0 ? Math.max(4, (ms / max) * 100) : 0}%"></div>
            </div>
            <span class="hour-bar-label">${formatHour(i)}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Add tooltip handlers
    const tooltip = s.tooltip;
    container.querySelectorAll('.hour-bar-col').forEach(col => {
      const hour = parseInt(col.dataset.hour);
      const ms = hours[hour];
      const recs = hourRecords[hour];

      col.addEventListener('mouseenter', () => {
        if (ms === 0) {
          tooltip.style("opacity", 1)
            .html(`<strong>${formatHour(hour)}</strong><br>No listening`);
        } else {
          // Get top 3 songs for this hour
          const songMap = new Map();
          for (const r of recs) {
            if (!r.track) continue;
            const key = `${r.track}|||${r.artist}`;
            songMap.set(key, (songMap.get(key) || 0) + r.ms);
          }
          const topSongs = [...songMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([key]) => {
              const [track, artist] = key.split('|||');
              return `${s.escapeHtml(track)}`;
            });

          tooltip.style("opacity", 1)
            .html(`<strong>${formatHour(hour)}</strong><br>${s.formatMinutes(ms)} listened${topSongs.length > 0 ? '<br><span style="color:var(--text-muted)">' + topSongs.join('<br>') + '</span>' : ''}`);
        }
      });

      col.addEventListener('mousemove', (e) => {
        tooltip
          .style("left", (e.pageX + 10) + "px")
          .style("top", (e.pageY - 10) + "px");
      });

      col.addEventListener('mouseleave', () => {
        tooltip.style("opacity", 0);
      });
    });
  },

  // === Show Day Detail ===
  showDayDetail: function(date, skipHistory) {
    const s = this;
    // Use filtered data (respects both year and search filter)
    const filteredData = s.getFilteredData();
    const dayKey = date.toDayKey();
    const dayRecords = filteredData.filter(r => r.ts.toDayKey() === dayKey);

    if (dayRecords.length === 0) return;

    // Push current view to history before changing (if modal is already open)
    if (!skipHistory && !s.elements.modal.classList.contains('hidden')) {
      s._pushCurrentToHistory();
    }

    // Track current view
    s._currentArtist = null;
    s._currentSong = null;
    s._currentDay = date;
    s._currentHour = null;
    s._currentDayOfWeek = null;

    s.resetModalState();

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = date.toLocaleDateString('en-US', options);
    if (s.store.filterAST) {
      const filterDesc = s.filter.describe(s.store.filterAST);
      s.elements.modalDate.innerHTML = `${dateStr}<span class="modal-subtitle">${s.escapeHtml(filterDesc)}</span>`;
    } else {
      s.elements.modalDate.textContent = dateStr;
    }

    const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;

    const songData = s.aggregateSongs(dayRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams;
    s.elements.modalTracks.textContent = uniqueTracks;

    // Render hourly breakdown chart
    s.renderDayHourChart(dayRecords);

    // Render clickable lists with filtered data
    s.renderModalLists(dayRecords);

    s.openModal();
  },

  // === Show Song Detail ===
  showSongDetail: function(track, artist, skipHistory) {
    const s = this;
    // Use filtered data (respects both year and search filter)
    const filteredData = s.getFilteredData();
    const songRecords = filteredData.filter(r => r.track === track && r.artist === artist);
    if (songRecords.length === 0) return;

    // Push current view to history before changing (if modal is already open)
    if (!skipHistory && !s.elements.modal.classList.contains('hidden')) {
      s._pushCurrentToHistory();
    }

    // Track current view
    s._currentArtist = null;
    s._currentSong = { track, artist };
    s._currentDay = null;
    s._currentHour = null;
    s._currentDayOfWeek = null;

    s.resetModalState();

    // Title
    s.elements.modalDate.innerHTML = `${s.escapeHtml(track)}<span class="modal-subtitle">${s.escapeHtml(artist)} · ${s.getFilterDescription()}</span>`;

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
    s.renderTimeline(songRecords, { colorVar: '--songs-color', yearData: filteredData });

    s.openModal('song');
  },

  // === Show Artist Detail ===
  showArtistDetail: function(artistName, skipHistory) {
    const s = this;
    // Use filtered data (respects both year and search filter)
    const filteredData = s.getFilteredData();
    const artistRecords = filteredData.filter(r => r.artist === artistName);
    if (artistRecords.length === 0) return;

    // Push current view to history before changing (if modal is already open)
    if (!skipHistory && !s.elements.modal.classList.contains('hidden')) {
      s._pushCurrentToHistory();
    }

    // Track current view
    s._currentArtist = artistName;
    s._currentSong = null;
    s._currentDay = null;
    s._currentHour = null;
    s._currentDayOfWeek = null;

    s.resetModalState();

    // Title
    s.elements.modalDate.innerHTML = `${s.escapeHtml(artistName)}<span class="modal-subtitle">${s.getFilterDescription()}</span>`;

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

    // Add click handlers to songs in modal
    s.elements.modalSongs.querySelectorAll('.clickable-song').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(li.dataset.idx);
        const song = s._modalSongs[idx];
        s.showSongDetail(song.track, song.artist);
      });
    });

    // Render timeline chart
    s.renderTimeline(artistRecords, { colorVar: '--artists-color', yearData: filteredData });

    s.openModal('artist');
  },

  // === Render Clickable Modal Lists ===
  // Helper to render clickable artist/song lists in modals
  renderModalLists: function(records) {
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

    // Add click handlers
    s.elements.modalArtists.querySelectorAll('.clickable-artist').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(li.dataset.idx);
        s.showArtistDetail(s._modalArtists[idx]);
      });
    });

    s.elements.modalSongs.querySelectorAll('.clickable-song').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(li.dataset.idx);
        const song = s._modalSongs[idx];
        s.showSongDetail(song.track, song.artist);
      });
    });
  },

  // === Render all panels ===
  renderAll: function() {
    const data = this.getFilteredData();
    this.panels.forEach(fn => fn(data));
  },
});

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
    importBtnText: document.getElementById("importBtnText"),
    infoBtn: document.getElementById("infoBtn"),
    infoModal: document.getElementById("infoModal"),
    yearSelect: document.getElementById("yearSelect"),
    searchFilter: document.getElementById("searchFilter"),
    filterErrorTooltip: document.getElementById("filterErrorTooltip"),
    emptyState: document.getElementById("emptyState"),
    dashboard: document.getElementById("dashboardContent"),
    statsTitle: document.getElementById("statsTitle"),
    timelineTitle: document.getElementById("timelineTitle"),
    totalHours: document.getElementById("totalHours"),
    totalStreams: document.getElementById("totalStreams"),
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
    modalHourChart: document.getElementById("modalHourChart"),
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
    if (e.key === "Escape") {
      s.closeModal();
      s.elements.infoModal.classList.add('hidden');
    }
  });

  // Info modal toggle
  s.elements.infoBtn.onclick = function() {
    s.elements.infoModal.classList.remove('hidden');
  };
  document.getElementById("closeInfoModal").onclick = function() {
    s.elements.infoModal.classList.add('hidden');
  };
  s.elements.infoModal.querySelector('.modal-backdrop').onclick = function() {
    s.elements.infoModal.classList.add('hidden');
  };

  // Data import - auto-import when files selected
  s.elements.fileInput.onchange = function() {
    const files = s.elements.fileInput.files;
    if (files.length === 0) return;

    // Show loading state
    s.elements.importBtnText.textContent = 'Loading...';
    s.elements.importBtnText.classList.add('loading');

    let pending = files.length;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const records = JSON.parse(e.target.result).map(convertRecord);
          s.store.raw.push(...records);
        } catch (err) {
          console.error('Failed to parse file:', file.name, err);
        }
        pending--;
        if (pending === 0) {
          s.elements.importBtnText.textContent = 'Import';
          s.elements.importBtnText.classList.remove('loading');
          processData();
        }
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
      isPodcast: isPodcast,
    };
  }


  function inferSongDuration(values, eps = 2000) {
    if (values.length === 0) return null; 

    const counts = new Map();
    for (const v of values) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best = null;
    for (const [v, c] of counts) {
      if (c > 1 && (best === null || v > best)) {
        best = v;
      }
    }

    // surely a song must be longer than 1 second
    if (best !== null && best > 1000) return best;

    return Math.max(...values);
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

  function populateYearSelect() {
    const select = s.elements.yearSelect;
    select.innerHTML = "";
    const sortedYears = [...s.store.years].sort((a, b) => b - a);

    // Add "All Years" option
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.text = "All Years";
    select.add(allOpt);

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
      s.store.currentYear = this.value === "all" ? null : parseInt(this.value);
      // Clear date range when year changes
      s.store.dateRange = { start: null, end: null };
      s.renderAll();
    };

    // Enable and set up search filter
    s.elements.searchFilter.disabled = false;
    s.elements.searchFilter.value = "";
    s.store.filterQuery = "";

    let debounceTimer;
    s.elements.searchFilter.oninput = function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        s.setFilter(this.value);
      }, 300);
    };
  }

  function showDashboard() {
    s.elements.emptyState.classList.add("hidden");
    s.elements.dashboard.classList.remove("hidden");
    s.renderAll();
  }
});
