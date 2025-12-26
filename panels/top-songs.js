// Top Songs panel
swim.registerPanel(function(data) {
  const s = swim;
  const songData = s.aggregateSongs(data);
  const sorted = [...songData.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10);

  if (sorted.length === 0) {
    s.elements.topSongs.innerHTML = '<li class="no-results">No songs found</li>';
    return;
  }

  s.elements.topSongs.innerHTML = sorted
    .map((song, idx) => `
      <li data-idx="${idx}">
        <div class="list-item-info">
          <div class="list-item-name">${s.escapeHtml(song.track)}</div>
          <div class="list-item-detail">${s.escapeHtml(song.artist || "Unknown")}</div>
        </div>
        <span class="list-item-stat">
          ${s.formatMinutes(song.totalMs)} · ${song.streams} plays
        </span>
      </li>
    `).join("");

  // Add click handlers
  s.elements.topSongs.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.idx);
      const song = sorted[idx];
      s.showSongDetail(song.track, song.artist);
    });
  });

  // Setup scroll effect for long names
  s.setupScrollingNames(s.elements.topSongs);
});
