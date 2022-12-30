Date.prototype.getWeekNumber = function(){
  var d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7)
};

Date.prototype.toDayKey = function() {
  let d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
  return d.toISOString();
}


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

function sortAll() {

  x = new Map([...x.entries()].sort());
  for (let z of x.keys()) {
    x.set(z,x.get(z).sort());
  }
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
	/*

// set the dimensions and margins of the graph
var margin = {top: 20, right: 25, bottom: 30, left: 40},
  width = 450 - margin.left - margin.right,
  height = 450 - margin.top - margin.bottom;

// append the svg object to the body of the page
var svg = d3.select("#div_template")
.append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
.append("g")
  .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

//Read the data
d3.csv("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/heatmap_data.csv", function(data) {

  // Labels of row and columns -> unique identifier of the column called 'group' and 'variable'
  var myGroups = d3.map(data, function(d){return d.group;}).keys()
  var myVars = d3.map(data, function(d){return d.variable;}).keys()

  // Build X scales and axis:
  var x = d3.scaleBand()
    .range([ 0, width ])
    .domain(myGroups)
    .padding(0.05);
  svg.append("g")
    .style("font-size", 15)
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x).tickSize(0))
    .select(".domain").remove()

  // Build Y scales and axis:
  var y = d3.scaleBand()
    .range([ height, 0 ])
    .domain(myVars)
    .padding(0.05);
  svg.append("g")
    .style("font-size", 15)
    .call(d3.axisLeft(y).tickSize(0))
    .select(".domain").remove()

  // Build color scale
  var myColor = d3.scaleSequential()
    .interpolator(d3.interpolateInferno)
    .domain([1,100])

  // create a tooltip
  var Tooltip = d3.select("#div_template")
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
      .style("opacity", 1)
    d3.select(this)
      .style("stroke", "black")
      .style("opacity", 1)
  }
  var mousemove = function(d) {
    Tooltip
      .html("The exact value of<br>this cell is: " + d.value)
      .style("left", (d3.mouse(this)[0]+70) + "px")
      .style("top", (d3.mouse(this)[1]+100) + "px")
  }
  var mouseleave = function(d) {
    Tooltip
      .style("opacity", 0)
    d3.select(this)
      .style("stroke", "none")
      .style("opacity", 0.8)
  }


  // add the squares
  svg.selectAll()
    .data(data, function(d) {return d.group+':'+d.variable;})
    .enter()
    .append("rect")
      .attr("x", function(d) { return x(d.group) })
      .attr("y", function(d) { return y(d.variable) })
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("width", x.bandwidth() )
      .attr("height", y.bandwidth() )
      .style("fill", function(d) { return myColor(d.value)} )
      .style("stroke-width", 4)
      .style("stroke", "none")
      .style("opacity", 0.8)
    .on("mouseover", mouseover)
    .on("mousemove", mousemove)
    .on("mouseleave", mouseleave)
})
*/
	
	var svg = d3.select("#githubstyle");

	let data = Array.from(x, ([date, value]) => ({ date, value }));
	data = data.filter((d) => new Date(d.date).getFullYear()==2022);
	let amt = data.map((d) => d.value.reduce((ac, cv) => ac + cv.ms_played, 0) / 1000)
	let mx = amt[0];
	for (let i=1; i < amt.length; i++) {
		if (amt[i] > mx)
			mx = amt[i];
	}
	console.log(data);

	var xScale = d3.scaleLinear()
		.domain([0,51])
		.range([100,1400]);

	var yScale = d3.scaleLinear()
		.domain([0,6])
		.range([50,450]);

	var colorLight = d3.scaleSequential()
						.interpolator(d3.interpolate("white", "blue"))
						.domain([-400,mx]);

	var xAxis = d3.axisBottom(xScale);

  var yAxis = d3.axisLeft(yScale);

  var Tooltip = d3.select("#div_template")
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
      .style("opacity", 1)
    d3.select(this)
      .style("stroke", "black")
      .style("opacity", 1)
  }
  var mousemove = function(d) {
    Tooltip
      .html("The exact value of<br>this cell is: " + d.value.reduce((ac, cv) => ac + cv.ms_played,0) / 1000.0 + "<br> date is" + d.date)
      .style("left", (d3.mouse(this)[0]+70) + "px")
      .style("top", (d3.mouse(this)[1]) + "px")
  }
  var mouseleave = function(d) {
    Tooltip
      .style("opacity", 0)
    d3.select(this)
      .style("stroke", "none")
      .style("opacity", 0.8)

  }
	svg.append("g")
    .attr("transform", "translate(0,60)")
    .call(xAxis);

    svg.selectAll("rect")
    	.data(data)
    	.enter()
    	.append("rect")
    		.attr("fill", (d) => colorLight(d.value.reduce((ac, cv) => ac + cv.ms_played,0)/1000))
    		.attr("width", "20")
    		.attr("height", "20")
    		.attr("x", (d) => xScale(((new Date(d.date).getWeekNumber() + 51) % 52)))
    		.attr("y", (d) => yScale((new Date(d.date).getDay()+6)%7))
    	.on("mouseover", mouseover)
	    .on("mousemove", mousemove)
	    .on("mouseleave", mouseleave)



}
