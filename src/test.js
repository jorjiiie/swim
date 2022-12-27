
const dat = [
	{ ts: '1', val: 10 },
	{ ts: '2', val: 130 },
	{ ts: '3', val: 10 },
	{ ts: '4', val: 130 },
	{ ts: '5', val: 120 },
];

const container = d3.select('svg')
	.classed('container', true);

const bars = container
	.selectAll('.bar')
	.data(dat)
	.enter()
	.append('rect')
	.classed('bar', true)
		.attr('width', 30)
		.attr('height', (d) => (d.val));