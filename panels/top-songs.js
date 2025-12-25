// Top Songs panel
swim.registerPanel(function(data) {
  const s = swim;
  const songData = s.aggregateSongs(data);
  const sorted = [...songData.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10);

  s.elements.topSongs.innerHTML = sorted
    .map((song) => `
      <li>
        <div class="list-item-info">
          <div class="list-item-name">${s.escapeHtml(song.track)}</div>
          <div class="list-item-detail">${s.escapeHtml(song.artist || "Unknown")}</div>
        </div>
        <span class="list-item-stat">
          ${s.formatMinutes(song.totalMs)} · ${song.streams} plays
        </span>
      </li>
    `).join("");
});
