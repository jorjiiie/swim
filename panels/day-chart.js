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
    // Always use full year data
    const fullYearData = s.getYearData(s.store.currentYear);
    const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayRecords = fullYearData.filter(r => r.ts.getDay() === dayIndex);

    if (dayRecords.length === 0) return;

    // Track current view for history
    s._currentArtist = null;
    s._currentSong = null;
    s._currentDay = null;
    s._currentHour = null;
    s._currentDayOfWeek = dayIndex;

    s.resetModalState();

    s.elements.modalDate.innerHTML = `${dayLabels[dayIndex]}s<span class="modal-subtitle">All listening on ${dayLabels[dayIndex]}s in ${s.store.currentYear}</span>`;

    const totalMs = dayRecords.reduce((sum, r) => sum + r.ms, 0);
    const uniqueTracks = new Set(dayRecords.map(r => `${r.track}|||${r.artist}`).filter(Boolean)).size;
    const songData = s.aggregateSongs(dayRecords);
    const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

    s.elements.modalTime.textContent = s.formatMinutes(totalMs);
    s.elements.modalStreams.textContent = totalStreams.toLocaleString();
    s.elements.modalTracks.textContent = uniqueTracks.toLocaleString();

    // Render clickable lists with full year data
    s.renderModalLists(dayRecords, fullYearData);

    s.openModal('day');
  }

  // Store showDayOfWeekDetail on swim for history navigation
  s._showDayOfWeekDetail = showDayOfWeekDetail;
});
