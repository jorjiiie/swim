// Overview Timeline panel
swim.registerPanel(function(data) {
  const s = swim;
  s.renderTimeline(data, {
    colorVar: '--stats-color',
    container: 'overviewTimeline',
    width: 1100,
    height: 160,
    yearData: data
  });
});
