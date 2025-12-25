// Day of Week chart panel
swim.registerPanel(function(data) {
  const s = swim;
  const days = Array(7).fill(0);
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const r of data) {
    days[r.ts.getDay()] += r.ms;
  }

  const max = Math.max(...days);

  s.elements.dayChart.innerHTML = `<div class="bar-chart">${
    days.map((ms, i) => `
      <div class="bar-row" data-day="${i}">
        <span class="bar-label">${labels[i]}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${max > 0 ? (ms / max) * 100 : 0}%"></div>
        </div>
        <span class="bar-value">${s.formatMinutes(ms)}</span>
      </div>
    `).join("")
  }</div>`;

  // Click handlers
  s.elements.dayChart.querySelectorAll('.bar-row').forEach(row => {
    row.addEventListener('click', () => {
      const day = parseInt(row.dataset.day);
      showDayOfWeekDetail(day, data);
    });
  });

  function showDayOfWeekDetail(dayIndex, yearData) {
    const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayRecords = yearData.filter(r => r.ts.getDay() === dayIndex);

    if (dayRecords.length === 0) return;

    s.elements.modalDate.innerHTML = `${dayLabels[dayIndex]}s<span class="modal-subtitle">All listening on ${dayLabels[dayIndex]}s in ${s.store.currentYear}</span>`;

    const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;
    const songData = s.aggregateSongs(dayRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams.toLocaleString();
    s.elements.modalTracks.textContent = uniqueTracks.toLocaleString();

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

    s.openModal('day');
  }
});
