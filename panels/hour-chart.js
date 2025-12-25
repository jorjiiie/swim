// Hour of Day chart panel
swim.registerPanel(function(data) {
  const s = swim;
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

  s.elements.hourChart.innerHTML = `<div class="bar-chart">${
    hours.map((ms, i) => `
      <div class="bar-row" data-hour="${i}">
        <span class="bar-label">${labels[i]}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${max > 0 ? (ms / max) * 100 : 0}%"></div>
        </div>
        <span class="bar-value">${s.formatMinutes(ms)}</span>
      </div>
    `).join("")
  }</div>`;

  // Click handlers
  s.elements.hourChart.querySelectorAll('.bar-row').forEach(row => {
    row.addEventListener('click', () => {
      const hour = parseInt(row.dataset.hour);
      showHourDetail(hour, data);
    });
  });

  function showHourDetail(hour, yearData) {
    const hourRecords = yearData.filter(r => r.ts.getHours() === hour);
    if (hourRecords.length === 0) return;

    let hourLabel;
    if (hour === 0) hourLabel = "12:00 AM";
    else if (hour === 12) hourLabel = "12:00 PM";
    else if (hour < 12) hourLabel = `${hour}:00 AM`;
    else hourLabel = `${hour - 12}:00 PM`;

    s.elements.modalDate.innerHTML = `${hourLabel}<span class="modal-subtitle">All listening during this hour in ${s.store.currentYear}</span>`;

    const totalMs = hourRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(hourRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;
    const songData = s.aggregateSongs(hourRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams.toLocaleString();
    s.elements.modalTracks.textContent = uniqueTracks.toLocaleString();

    // Top Artists
    const artistMap = new Map();
    for (const r of hourRecords) {
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

    s.openModal('hour');
  }
});
