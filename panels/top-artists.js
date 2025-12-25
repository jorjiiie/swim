// Top Artists panel
swim.registerPanel(function(data) {
  const s = swim;
  const map = new Map();

  for (const r of data) {
    if (!r.artist) continue;
    map.set(r.artist, (map.get(r.artist) || 0) + r.ms);
  }

  const sorted = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  s.elements.topArtists.innerHTML = sorted
    .map(([name, ms]) => `
      <li data-artist="${s.escapeHtml(name)}">
        <div class="list-item-info">
          <div class="list-item-name">${s.escapeHtml(name)}</div>
        </div>
        <span class="list-item-stat">${s.formatMinutes(ms)}</span>
      </li>
    `).join("");

  // Add click handlers
  s.elements.topArtists.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const artistName = li.dataset.artist;
      showArtistDetail(artistName, data);
    });
  });

  function showArtistDetail(artistName, yearData) {
    const artistRecords = yearData.filter(r => r.artist === artistName);
    if (artistRecords.length === 0) return;

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

    // Hide artists section, show only songs for this artist
    s.elements.modalArtists.parentElement.classList.add('hidden');

    // Top Songs by this artist
    const topSongs = [...songData.values()]
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 10);

    s.elements.modalSongs.innerHTML = topSongs
      .map((song) => `
        <li>
          <div class="list-item-info">
            <div class="list-item-name">${s.escapeHtml(song.track)}</div>
          </div>
          <span class="list-item-stat">
            ${s.formatMinutes(song.totalMs)}
            <span class="list-item-streams"> · ${song.streams}×</span>
          </span>
        </li>
      `).join("");

    // Render timeline chart
    renderArtistTimeline(artistRecords, artistName);

    s.openModal('artist');
  }

  function renderArtistTimeline(artistRecords, artistName) {
    const s = swim;
    const timeline = s.elements.modalTimeline;
    timeline.classList.remove('hidden');
    timeline.innerHTML = '';

    // Aggregate by day
    const dayMap = new Map();
    for (const r of artistRecords) {
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
    // Tune alpha: lower = smoother (try 0.05-0.1), higher = more responsive (try 0.2-0.3)
    const alpha = 0.3;
    function zeroPhase(data) {
      // Forward pass
      const forward = [data[0]];
      for (let i = 1; i < data.length; i++) {
        forward.push(alpha * data[i] + (1 - alpha) * forward[i - 1]);
      }
      // Backward pass
      const backward = new Array(data.length);
      backward[data.length - 1] = forward[data.length - 1];
      for (let i = data.length - 2; i >= 0; i--) {
        backward[i] = alpha * forward[i] + (1 - alpha) * backward[i + 1];
      }
      return backward;
    }

    const smoothedValues = zeroPhase(values);

    // Normalize to 0-1 range (PDF-like)
    const maxSmoothed = Math.max(...smoothedValues, 1);
    const normalizedValues = smoothedValues.map(v => v / maxSmoothed);

    // Chart dimensions - no left margin for Y axis
    const margin = { top: 20, right: 20, bottom: 30, left: 10 };
    const width = 560;
    const height = 140;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(timeline)
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

    // Normalize raw values too (for raw data line)
    const maxRaw = Math.max(...values, 1);
    const normalizedRaw = values.map(v => v / maxRaw);

    // Raw data for drawing
    const rawData = chartData.map((d, i) => ({
      date: d.date,
      value: normalizedRaw[i]
    }));

    // Smoothed data for drawing
    const smoothedData = chartData.map((d, i) => ({
      date: d.date,
      value: normalizedValues[i]
    }));

    // Area fill (smoothed)
    const area = d3.area()
      .x(d => xScale(d.date))
      .y0(innerHeight)
      .y1(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(smoothedData)
      .attr("fill", "var(--artists-light)")
      .attr("d", area);

    // Raw data line (dotted, behind)
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

    // Smoothed line (solid, on top)
    const line = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(smoothedData)
      .attr("fill", "none")
      .attr("stroke", "var(--artists-color)")
      .attr("stroke-width", 2)
      .attr("d", line);

    // X axis (months)
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

    // Tooltip and hover line
    const tooltip = d3.select("body").append("div")
      .attr("class", "timeline-tooltip")
      .style("opacity", 0);

    const hoverLine = svg.append("line")
      .attr("stroke", "var(--text-muted)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,2")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("opacity", 0);

    const hoverDot = svg.append("circle")
      .attr("r", 4)
      .attr("fill", "var(--artists-color)")
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .style("opacity", 0);

    // Hover area
    svg.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .on("mousemove", function() {
        const mouseX = d3.mouse(this)[0];
        const date = xScale.invert(mouseX);

        // Find closest data point index
        const bisect = d3.bisector(d => d.date).left;
        const idx = bisect(chartData, date);
        const d0 = chartData[idx - 1];
        const d1 = chartData[idx];
        const closestIdx = !d0 ? idx : !d1 ? idx - 1 : (date - d0.date > d1.date - date ? idx : idx - 1);

        if (closestIdx < 0 || closestIdx >= chartData.length) return;

        const d = chartData[closestIdx];
        const x = xScale(d.date);
        const y = yScale(rawData[closestIdx].value);

        hoverLine
          .attr("x1", x)
          .attr("x2", x)
          .style("opacity", 1);

        hoverDot
          .attr("cx", x)
          .attr("cy", y)
          .style("opacity", 1);

        const dateStr = d.date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });

        tooltip
          .style("opacity", 1)
          .html(`<strong>${dateStr}</strong>${d.ms > 0 ? s.formatMinutes(d.ms) + ' listened' : 'No listening'}`)
          .style("left", (d3.event.pageX + 10) + "px")
          .style("top", (d3.event.pageY - 10) + "px");
      })
      .on("mouseout", function() {
        hoverLine.style("opacity", 0);
        hoverDot.style("opacity", 0);
        tooltip.style("opacity", 0);
      });
  }
});

// Reset modal state when closed
(function() {
  const originalClose = swim.closeModal;
  swim.closeModal = function() {
    // Show artists section again, hide timeline
    if (swim.elements.modalArtists) {
      swim.elements.modalArtists.parentElement.classList.remove('hidden');
    }
    if (swim.elements.modalTimeline) {
      swim.elements.modalTimeline.classList.add('hidden');
    }
    // Remove any lingering tooltips
    d3.selectAll('.timeline-tooltip').remove();
    originalClose.call(swim);
  };
})();
