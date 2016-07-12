// Dimensions of sunburst.

function Sunburst(parentElementId) {
    this.parentElementId = parentElementId;
    this.width = $("#" + parentElementId).width() * 0.8;
    this.height = this.width * 0.6;
    this.radius = Math.min(this.width, this.height) / 2;
    this.b = {
        w: 100, h: 30, s: 10, t: 10
    };
    this.colors = {};
}

function extractAllKeys(data) {
    var keys = [];
    for (var key in data) {
        keys.push(key);
        if (data[key] instanceof Object) {
            keys.push(extractAllKeys(data[key]))
        }
    }
    return keys;
}

function getRandomColor() {
    var letters = '0123456789ABCDEF'.split('');
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

Sunburst.prototype.render = function (data) {
    var keys = extractAllKeys(data['result']);

    var colors = randomColor({
        count: keys.length,
        hue: 'blue'
    });

    for (var index in keys) {
        this.colors[keys[index]] = colors[index]
    }

    var json = buildHierarchy(data);
    this.initializeBreadcrumbTrail();
    this.drawLegend();

    $(".grouping-view-chart").html("");
    var vis = d3.select("#" + this.parentElementId).select(".grouping-view-chart")
        .append("svg:svg")
        .attr("width", this.width)
        .attr("height", this.height)
        .append("svg:g")
        .attr("class", "grouping-view-container")
        .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + ")");

    // Bounding circle underneath the sunburst, to make it easier to detect
    // when the mouse leaves the parent g.
    vis.append("svg:circle")
        .attr("r", this.radius)
        .style("opacity", 0);

    var partition = d3.layout.partition()
        .size([2 * Math.PI, this.radius * this.radius])
        .value(function (d) {
            return d.size;
        });

    // For efficiency, filter nodes to keep only those large enough to see.
    var nodes = partition.nodes(json)
        .filter(function (d) {
            return (d.dx > 0.005); // 0.005 radians = 0.29 degrees
        });

    var arc = d3.svg.arc()
        .startAngle(function (d) {
            return d.x;
        })
        .endAngle(function (d) {
            return d.x + d.dx;
        })
        .innerRadius(function (d) {
            return Math.sqrt(d.y);
        })
        .outerRadius(function (d) {
            return Math.sqrt(d.y + d.dy);
        });

    var path = vis.data([json]).selectAll("path")
        .data(nodes)
        .enter().append("svg:path")
        .attr("display", function (d) {
            return d.depth ? null : "none";
        })
        .attr("d", arc)
        .attr("fill-rule", "evenodd")
        .style("fill", function (d) {
            return this.colors[d.name];
        }.bind(this))
        .style("opacity", 1)
        .on("mouseover", this.mouseover.bind(this));

    // Add the mouseleave handler to the bounding circle.
    d3.select("#" + this.parentElementId).select(".grouping-view-container").on("mouseleave", this.mouseleave);

    this.totalSize = path.node().__data__.value;
};

Sunburst.prototype.mouseover = function mouseover(d) {
    var percentage = (100 * d.value / this.totalSize).toPrecision(3);
    var percentageString = percentage + "%";
    if (percentage < 0.1) {
        percentageString = "< 0.1 %";
    }

    var sequenceArray = getAncestors(d);

    this.updateBreadcrumbs({nodeArray: sequenceArray, percentageString: percentageString});

    // Fade all the segments.
    d3.selectAll("path")
        .style("opacity", 0.3);

    // Then highlight only those that are an ancestor of the current segment.
    d3.select("#" + this.parentElementId)
        .select(".grouping-view-chart").
        selectAll("path")
        .filter(function (node) {
            return (sequenceArray.indexOf(node) >= 0);
        })
        .style("opacity", 1);
};

Sunburst.prototype.mouseleave = function (d) {
    // Hide the breadcrumb trail
    d3.select("#" + this.parentElementId)
        .select(".grouping-view-trail")
        .style("visibility", "hidden");

    d3.selectAll("path")
        .style("opacity", 1);
};

Sunburst.prototype.initializeBreadcrumbTrail = function () {
    // Add the svg area.
    var trail = d3.select("#" + this.parentElementId).select(".grouping-view-sequence")
        .append("svg:svg")
        .attr("width", this.width)
        .attr("height", 50)
        .attr("class", "grouping-view-trail");

    // Add the label at the end, for the percentage.
    trail.append("svg:text")
        .attr("class", "grouping-view-endlabel")
        .style("fill", "#000");
};

Sunburst.prototype.updateBreadcrumbs = function (parameters) {
    var nodeArray = parameters.nodeArray;
    var percentageString = parameters.percentageString;

    var g = d3.select("#" + this.parentElementId)
        .select(".grouping-view-trail")
        .selectAll("g")
        .data(nodeArray, function (d) {
            return d.name + d.depth;
        });

    // Add breadcrumb and label for entering nodes.
    var entering = g.enter().append("svg:g");

    entering.append("svg:polygon")
        .attr("points", this.breadcrumbPoints.bind(this))
        .style("fill", function (d) {
            return this.colors[d.name];
        }.bind(this));

    entering.append("svg:text")
        .attr("x", (this.b.w + this.b.t) / 2)
        .attr("y", this.b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(function (d) {
            return d.name;
        });

    // Set position for entering and updating nodes.
    g.attr("transform", function (d, i) {
        return "translate(" + i * (this.b.w + this.b.s) + ", 0)";
    }.bind(this));

    // Remove exiting nodes.
    g.exit().remove();

    // Now move and update the percentage at the end.
    d3.select("#" + this.parentElementId)
        .select(".grouping-view-trail")
        .select(".grouping-view-endlabel")
        .attr("x", (nodeArray.length + 0.5) * (this.b.w + this.b.s))
        .attr("y", this.b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(percentageString);

    // Make the breadcrumb trail visible, if it's hidden.
    d3.select("#" + this.parentElementId)
        .select(".grouping-view-trail")
        .style("visibility", "");

};

Sunburst.prototype.drawLegend = function () {

    // Dimensions of legend item: width, height, spacing, radius of rounded rect.
    var li = {
        w: 75, h: 30, s: 3, r: 3
    };

    var legend = d3.select("#" + this.parentElementId).select(".grouping-view-legend").append("svg:svg")
        .attr("width", li.w)
        .attr("height", d3.keys(this.colors).length * (li.h + li.s));

    var g = legend.selectAll("g")
        .data(d3.entries(this.colors))
        .enter().append("svg:g")
        .attr("transform", function (d, i) {
            return "translate(0," + i * (li.h + li.s) + ")";
        });

    g.append("svg:rect")
        .attr("rx", li.r)
        .attr("ry", li.r)
        .attr("width", li.w)
        .attr("height", li.h)
        .style("fill", function (d) {
            return d.value;
        });

    g.append("svg:text")
        .attr("x", li.w / 2)
        .attr("y", li.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(function (d) {
            return d.key;
        });
};

Sunburst.prototype.toggleLegend = function () {
    var legend = d3.select("#" + this.parentElementId).select(".grouping-view-legend");
    if (legend.style("visibility") == "hidden") {
        legend.style("visibility", "");
    } else {
        legend.style("visibility", "hidden");
    }
};

Sunburst.prototype.breadcrumbPoints = function (d, i) {
    var points = [];
    points.push("0,0");
    points.push(this.b.w + ",0");
    points.push(this.b.w + this.b.t + "," + (this.b.h / 2));
    points.push(this.b.w + "," + this.b.h);
    points.push("0," + this.b.h);
    if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
        points.push(this.b.t + "," + (this.b.h / 2));
    }
    return points.join(" ");
};

function getAncestors(node) {
    var path = [];
    var current = node;
    while (current.parent) {
        path.unshift(current);
        current = current.parent;
    }
    return path;
}

// Take a 2-column CSV and transform it into a hierarchical structure suitable
// for a partition layout. The first column is a sequence of step names, from
// root to leaf, separated by hyphens. The second column is a count of how
// often that sequence occurred.

function buildHierarchy(data) {
    var root = {"name": "root", "children": []};
    buildChildHierarchy(root, data['result']);
    return root
}

function buildChildHierarchy(parentNode, data) {
    for (var key in data) {
        if (data[key] instanceof Object) {
            var newNode = {name: key, children: []};
            buildChildHierarchy(newNode, data[key]);
            parentNode['children'].push(newNode)
        } else {
            parentNode['children'].push({name: key, size: data[key]})
        }
    }
}