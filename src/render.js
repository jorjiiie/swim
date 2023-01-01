Date.prototype.getWeekNumber = function(){
	console.log(this + " " + this.getFullYear());
	let now = new Date(this.getFullYear(), this.getMonth(), this.getDate());
	let onejan = new Date(now.getFullYear(), 0, 1);
	let week = Math.ceil((((now.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
	return week;
};

// Date.prototype.getWeekNumber = function() {
// 	// Get the first day of the year
// 	const startOfYear = new Date(this.getFullYear(), 0, 1);
// 	// Calculate the number of days since the start of the year
// 	if (startOfYear.getDay() == 1) {
// 		// we start on a monday!
// 		const daysSinceStartOfYear = Math.floor((this - startOfYear) / 86400000);
// 		// Calculate the week of the year
// 		const week = 1 + Math.floor(daysSinceStartOfYear / 7);
// 		// console.log("wat" + startOfYear + startOfYear.getDay());
// 		return week;
// 	} else {
// 		// we grab the first monday - it's definitely the second week of the year
// 		const dow = startOfYear.getDay();

// 		// current day of week + x = 1 (mod 7)
// 		startOfYear.setUTCDate((9 - dow) % 7);
// 		if (this < startOfYear)
// 			return 1;
// 		console.log(startOfYear + dow + ((9 - dow) % 7));
// 		let daysSinceStartOfYear = (this - startOfYear) / 86400000;
// 		daysSinceStartOfYear = Math.floor(daysSinceStartOfYear);
// 		// console.log(this + " " + daysSinceStartOfYear);
// 		return 1 + Math.floor(daysSinceStartOfYear / 7);
// 	}
  
// };
Date.prototype.toDayKey = function() {
  let d = new Date(this.getFullYear(), this.getMonth(), this.getDate());
  return d.toISOString();
}

var years = new Set();
var currentYear = 2022;
var x = new Map();
function addData(data) {
  // data is in internal format
  for (const dat of data) {
    const d = dat.ts;
    if (x.has(d.toDayKey())) {
      // x.set(d.toDayKey(), x.get(d.toDayKey()).push(dat));
      x.get(d.toDayKey()).push(dat);
    } else {
      x.set(d.toDayKey(), [dat]);

    }
  }
  
}
const menu = document.getElementById("changeYear");
menu.addEventListener("change", function() {
  console.log(`Selected option: ${this.value}`);
  currentYear = this.value;
});

function sortAll() {

  x = new Map([...x.entries()].sort());
  for (let z of x.keys()) {
  	years.add(new Date(z).getFullYear());
  	// console.log(z + " " + new Date(z).getWeekNumber());
    x.set(z,x.get(z).sort());
  }
  while(menu.options.length > 0)
  	menu.remove(0);
  years.forEach(function(year) {
  	const newOption = document.createElement("option");
	newOption.value = year;
	newOption.text = year;
	menu.add(newOption);
  });
  console.log(x);

}

function dosomething() {
  let data = Array.from(x, ([date, value]) => ({ date, value }));
  let dom = d3.extent(data.map(d => new Date(d.date)));

  console.log(data);
  console.log(dom);
  var xScale = d3.scaleTime()
    .domain(dom)
    .range([25, 975]);
  // console.log(xScale);

  var yScale = d3.scaleLinear()
    .domain([0,86400000])
    .range([0,50]);

  var xAxis = d3.axisBottom(xScale);

  var yAxis = d3.axisLeft(yScale);

  var svg = d3.select("#dateDemo1");

  svg.append("g")
    .attr("transform", "translate(0,60)")
    .call(xAxis);
    // .call(yAxis);

  console.log(xScale(new Date(data[1].date)));
  console.log(data[1].date);
  console.log(data[1].value.reduce((ac, cv) => ac + cv.ms_played,0));

  svg.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
      .attr("fill", "black")
      .attr("width","1")
      .attr("height", (d) => yScale(d.value.reduce((ac, cv) => ac + cv.ms_played,0)))
      .attr("x", (d) => xScale(new Date(d.date)))
      .attr("y", (d) => 50 - yScale(d.value.reduce((ac, cv) => ac + cv.ms_played,0)))

}


// function to parse EXTENDED streaming data
document.getElementById('import').onclick = function() {
	var files = document.getElementById('selectFiles').files;
  if (files.length <= 0) {
    return false;
  }
  for (const file of files) {
  var fr = new FileReader();

  // convert to internal format
  function convert(val) {
    let dd = new Date(val.ts);
    var obj = {
      ts:dd,
      ms_played:val.ms_played,
      track:val.master_metadata_track_name,
      artist: val.master_metadata_album_artist_name,
    };
    return obj;
  }


  fr.onload = function(e) {
    var result = JSON.parse(e.target.result);
	  result = result.map(convert);
    var formatted = JSON.stringify(result[0], null, 2);
    addData(result);
    if (result.some(r => r.ts == null)) {
      console.log("something doesnt have a ts!");
    }
  	document.getElementById('result').value = formatted;
  	sortAll();

  }
    fr.readAsText(file);
  }
};

function somethinghappened() {

	
	var margin = {top: 20, right: 25, bottom: 30, left: 40},
  width = 1400 - margin.left - margin.right,
  height = 230 - margin.top - margin.bottom;

// append the svg object to the body of the page
  	var tmp = d3.select("#githubstyle");
  	tmp.selectAll("*").remove();
	var svg = d3.select("#githubstyle")
		.append("svg")
		  .attr("width", width + margin.left + margin.right)
		  .attr("height", height + margin.top + margin.bottom)
		.append("g")
		  .attr("transform",
	        "translate(" + margin.left + "," + margin.top + ")");


	let data = Array.from(x, ([date, value]) => ({ date, value }));
	data = data.filter((d) => new Date(d.date).getUTCFullYear()==currentYear);
	let amt = data.map((d) => d.value.reduce((ac, cv) => ac + cv.ms_played, 0) / 1000)
	let mx = amt[0];
	for (let i=1; i < amt.length; i++) {
		if (amt[i] > mx)
			mx = amt[i];
	}
	console.log(data);

	var xScale = d3.scaleLinear()
		.domain([1,52])
		.range([0,width-100]);

	var yScale = d3.scaleLinear()
		.domain([0,6])
		.range([0,height]);

	var colorLight = d3.scaleSequential()
						.interpolator(d3.interpolate("white", "blue"))
						.domain([-400,mx]);

	var xAxis = d3.axisBottom(xScale);
	data.forEach(function(d) {
		console.log(d.date + " " + new Date(d.date).getWeekNumber() + " " + xScale(new Date(d.date).getWeekNumber()));
	})
  var yAxis = d3.axisLeft(yScale);

  var Tooltip = d3.select("#githubstyle")
    .append("div")
    .style("opacity", 0)
    .attr("class", "tooltip")
    .style("background-color", "white")
    .style("border", "solid")
    .style("border-width", "2px")
    .style("border-radius", "5px")
    .style("padding", "5px")

  // Three function that change the tooltip when user hover / move / leave a cell
  var mouseover = function(d) {
    Tooltip
      .style("opacity", .92)
    d3.select(this)
      .style("opacity", .4)
  }
  var mousemove = function(d) {
    Tooltip
      .html("The exact value of<br>this cell is: " + d.value.reduce((ac, cv) => ac + cv.ms_played,0) / 1000.0 + "<br> date is" + d.date)
      .style("left", (d3.mouse(this)[0]) + "px")
      .style("top", (d3.mouse(this)[1]+30) + "px")
  }
  var mouseleave = function(d) {
    Tooltip
      .style("opacity", 0)
    d3.select(this)
      .style("stroke", "none")
      .style("opacity", 0.8)

  }

    svg.selectAll("rect")
    	.data(data)
    	.enter()
    	.append("rect")
    		.attr("fill", (d) => colorLight(d.value.reduce((ac, cv) => ac + cv.ms_played,0)/1000))
    		.attr("rx","3")
    		.attr("ry","3")
    		.attr("width", "20")
    		.attr("height", "20")
    		.attr("x", (d) => xScale((new Date(d.date).getWeekNumber()+0)))
    		.attr("y", (d) => yScale((new Date(d.date).getDay()+0)%7))
    	.on("mouseover", mouseover)
	    .on("mousemove", mousemove)
	    .on("mouseleave", mouseleave)



}
