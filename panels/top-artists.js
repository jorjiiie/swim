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
    .map(([name, ms], idx) => `
      <li data-idx="${idx}">
        <div class="list-item-info">
          <div class="list-item-name">${s.escapeHtml(name)}</div>
        </div>
        <span class="list-item-stat">${s.formatMinutes(ms)}</span>
      </li>
    `).join("");

  // Store for click handlers
  const artistNames = sorted.map(([name]) => name);

  // Add click handlers
  s.elements.topArtists.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.idx);
      s.showArtistDetail(artistNames[idx], data);
    });
  });
});
