// Stats panel - overview cards
swim.registerPanel(function(data) {
  const s = swim;
  const totalMs = data.reduce((sum, r) => sum + r.ms, 0);
  const hours = Math.round(totalMs / 3600000);
  const artists = new Set(data.map((r) => r.artist).filter(Boolean)).size;
  const tracks = new Set(data.map((r) => `${r.track}-${r.artist}`).filter(Boolean)).size;

  const days = new Set(data.map((r) => r.ts.toDayKey())).size;
  const avgDaily = days > 0 ? Math.round(totalMs / days / 60000) : 0;

  s.elements.totalHours.textContent = hours.toLocaleString();
  s.elements.uniqueArtists.textContent = artists.toLocaleString();
  s.elements.uniqueTracks.textContent = tracks.toLocaleString();
  s.elements.avgDaily.textContent = avgDaily.toLocaleString();
});
