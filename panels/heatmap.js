// Activity Heatmap panel
swim.registerPanel(function(data) {
  const s = swim;
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
    .interpolator(d3.interpolate("#f8f0e8", "#c17f4e"));

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  days.forEach((day, i) => {
    svg.append("text")
      .attr("x", -10)
      .attr("y", i * (cellSize + cellPadding) + cellSize / 2 + 4)
      .attr("text-anchor", "end")
      .attr("fill", "#c17f4e")
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
    .on("mouseover", function(d) {
      tooltip.style("opacity", 1)
        .html(`<strong>${d.date.toDateString()}</strong><br>${s.formatMinutes(d.ms)} listened<br><span style="color:#a09a93">Click for details</span>`);
      d3.select(this).attr("stroke", "#c17f4e").attr("stroke-width", 2);
    })
    .on("mousemove", function() {
      tooltip
        .style("left", (d3.event.pageX + 10) + "px")
        .style("top", (d3.event.pageY - 10) + "px");
    })
    .on("mouseout", function() {
      tooltip.style("opacity", 0);
      d3.select(this).attr("stroke", "none");
    })
    .on("click", function(d) {
      tooltip.style("opacity", 0);
      showDailyDetail(d.date);
    });

  function showDailyDetail(date) {
    const dayKey = date.toDayKey();
    const dayRecords = s.store.byDay.get(dayKey) || [];

    if (dayRecords.length === 0) return;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    s.elements.modalDate.textContent = date.toLocaleDateString('en-US', options);

    const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;

    const songData = s.aggregateSongs(dayRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams;
    s.elements.modalTracks.textContent = uniqueTracks;

    // Top Artists
    const artistMap = new Map();
    for (const r of dayRecords) {
      if (!r.artist) continue;
      artistMap.set(r.artist, (artistMap.get(r.artist) || 0) + r.ms);
    }

    const topArtists = [...artistMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    s.elements.modalArtists.innerHTML = topArtists
      .map(([name, ms]) => `
        <li>
          <div class="list-item-info">
            <div class="list-item-name">${s.escapeHtml(name)}</div>
          </div>
          <span class="list-item-stat">${s.formatMinutes(ms)}</span>
        </li>
      `).join("");

    // Top Songs
    const topSongs = [...songData.values()]
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 5);

    s.elements.modalSongs.innerHTML = topSongs
      .map((song) => `
        <li>
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

    s.openModal();
  }
});
