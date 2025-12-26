// Overview Timeline panel
swim.registerPanel(function(data) {
  const s = swim;

  // Update title based on current view
  if (s.store.currentYear === null) {
    s.elements.timelineTitle.textContent = "Listening History";
  } else {
    s.elements.timelineTitle.textContent = `${s.store.currentYear} in Review`;
  }

  s.renderTimeline(data, {
    colorVar: '--stats-color',
    container: 'overviewTimeline',
    width: 1100,
    height: 160,
    yearData: data
  });
});
