// Stats panel - overview cards
swim.registerPanel(function(data) {
  const s = swim;

  // Update title with current filter
  s.elements.statsTitle.textContent = `Overview · ${s.getFilterDescription()}`;

  if (data.length === 0) {
    s.elements.totalHours.textContent = "—";
    s.elements.totalStreams.textContent = "—";
    s.elements.uniqueArtists.textContent = "—";
    s.elements.uniqueTracks.textContent = "—";
    s.elements.avgDaily.textContent = "—";
    return;
  }

  const totalMs = data.reduce((sum, r) => sum + r.ms, 0);
  const hours = Math.round(totalMs / 3600000);
  const artists = new Set(data.map((r) => r.artist).filter(Boolean)).size;
  const tracks = new Set(data.map((r) => `${r.track}-${r.artist}`).filter(Boolean)).size;

  // Calculate total streams
  const songData = s.aggregateSongs(data);
  const totalStreams = [...songData.values()].reduce((sum, song) => sum + song.streams, 0);

  const days = new Set(data.map((r) => r.ts.toDayKey())).size;
  const avgDaily = days > 0 ? Math.round(totalMs / days / 60000) : 0;

  s.elements.totalHours.textContent = hours.toLocaleString();
  s.elements.totalStreams.textContent = totalStreams.toLocaleString();
  s.elements.uniqueArtists.textContent = artists.toLocaleString();
  s.elements.uniqueTracks.textContent = tracks.toLocaleString();
  s.elements.avgDaily.textContent = avgDaily.toLocaleString();
});
