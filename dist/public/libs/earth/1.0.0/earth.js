/**
 * earth - a project to visualize global air data.
 * 地球-全球大气数据可视化项目。
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - c
 *
 * https://github.com/cambecc/earth
 */
(function () {
  "use strict";

  var SECOND = 1000;
  var MINUTE = 60 * SECOND;
  var HOUR = 60 * MINUTE;
  var MAX_TASK_TIME = 100;                  // 任务产生控制之前的时间量（毫秒）
  var MIN_SLEEP_TIME = 25;                  // 任务在恢复之前等待的时间量（毫秒）
  var MIN_MOVE = 4;                         // 拖动操作前的松弛（像素）
  var MOVE_END_WAIT = 100;                 // 等待移动操作完成的时间（毫秒）

  var OVERLAY_ALPHA = Math.floor(0.4 * 255);  // 覆盖透明度（比例为[0255]）
  var INTENSITY_SCALE_STEP = 10;            // 粒子强度色标的步长
  var MAX_PARTICLE_AGE = 100;               // 再生前绘制粒子的最大帧数
  var PARTICLE_LINE_WIDTH = 1.0;            // 绘制粒子的线宽
  var PARTICLE_MULTIPLIER = 7;              // 粒子计数标量（完全任意——该值看起来不错）
  var PARTICLE_REDUCTION = 0.75;            //将移动设备的粒子数减少到正常值的这么多
  var FRAME_RATE = 40;                      // 所需的每帧毫秒数

  var NULL_WIND_VECTOR = [NaN, NaN, null];  // 向量场[u，v，mag]外未定义位置的单态
  var HOLE_VECTOR = [NaN, NaN, null];       // 表示向量场中的一个洞的单粒子
  var TRANSPARENT_BLACK = [0, 0, 0, 0];     // 单例0 rgba
  var REMAINING = "▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫";   // 剩余进度条的图示符
  var COMPLETED = "▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪";   // 完成进度条的图示符

  var view = µ.view();
  var log = µ.log();

  /**
   * 向用户显示各种类型消息的对象。
   */
  var report = function () {
    var s = d3.select("#status"), p = d3.select("#progress"), total = REMAINING.length;
    return {
      status: function (msg) {
        return s.classed("bad") ? s : s.text(msg);  // errors are sticky until reset
      },
      error: function (err) {
        var msg = err.status ? err.status + " " + err.message : err;
        switch (err.status) {
          case -1: msg = "Server Down"; break;
          case 404: msg = "No Data"; break;
        }
        log.error(err);
        return s.classed("bad", true).text(msg);
      },
      reset: function () {
        return s.classed("bad", false).text("");
      },
      progress: function (amount) {  // 要报告的进度量在[0,1]范围内
        if (0 <= amount && amount < 1) {
          var i = Math.ceil(amount * total);
          var bar = COMPLETED.substr(0, i) + REMAINING.substr(0, total - i);
          return p.classed("invisible", false).text(bar);
        }
        return p.classed("invisible", true).text("");  //进展完成
      }
    };
  }();

  function newAgent () {
    return µ.newAgent().on({ "reject": report.error, "fail": report.error });
  }

  // 构建页面的主要内部组件：
  var configuration =
    µ.buildConfiguration(globes, products.overlayTypes);  // 保存页面的当前配置设置
  var inputController = buildInputController();  //解释拖动/缩放操作
  var meshAgent = newAgent();      // map data for the earth 地球地图数据
  var globeAgent = newAgent();     // the model of the globe 地球模型
  var gridAgent = newAgent();      // the grid of weather data 天气数据网格
  var rendererAgent = newAgent();  // the globe SVG renderer 全球SVG渲染器
  var fieldAgent = newAgent();     // the interpolated wind vector field 插值风矢量场
  var animatorAgent = newAgent();  // the wind animator 风动画师
  var overlayAgent = newAgent();   // color overlay over the animation 动画上的颜色覆盖

  console.log(meshAgent, globeAgent)


  /**
  *输入控制器是一个将移动操作（拖动和/或缩放）转换为对象变量的对象   
  *当前globe的投影，并发出事件，以便其他页面组件可以对这些移动操作作出反应。
  *
  *D3的内置缩放行为用于绑定文档的拖动/缩放事件和输入控制器
  *将D3事件解释为全球移动操作。由于计算复杂，这种方法比较复杂
  *拖动和缩放期间发生的事件行为。
  *
  *D3移动操作通常作为“zoomstart”->（“zoom”）*->“ZoomMend”事件链发生。在“缩放”事件期间
  *缩放和鼠标可能会改变，这意味着相应地进行缩放或拖动操作。这些行动相当困难
  *吵闹。否则，一次平滑连续缩放通常由几个“zoomstart”->
  * “缩放”->“缩放修复”事件链。去抖器用于通过等待一小段时间来消除噪声
  *确保用户已完成移动操作的时间。
  *
  *“缩放”事件可能不会发生；一个简单的点击操作如下：“zoomstart”->“ZoomMend”。有
  *其他角点情况下的附加逻辑，例如仅移动地球几像素的伪拖拽
  *（最有可能是无意的），以及某些触摸设备发出无序事件的趋势：
  *“zoom”->“zoomstart”->“ZoomMend”。
*

  *此对象为移动操作发出干净的“moveStart”->（“move”）*->“moveEnd”事件和“click”事件

  *对于正常的点击。虚假动作不会产生事件。
   */

  //地图拖拽缩放：
  function buildInputController () {
    var globe, op = null;
    console.log(globe)

    /**
     * @returns {Object} 表示一次移动操作状态的对象。
     */
    function newOp (startMouse, startScale) {
      return {
        type: "click",  // initially assumed to be a click operation
        startMouse: startMouse,
        startScale: startScale,
        manipulator: globe.manipulator(startMouse, startScale)
      };
    }

    var zoom = d3.behavior.zoom()
      .on("zoomstart", function () {
        op = op || newOp(d3.mouse(this), zoom.scale());  // 新的手术开始了
      })
      .on("zoom", function () {
        var currentMouse = d3.mouse(this), currentScale = d3.event.scale;
        op = op || newOp(currentMouse, 1);  // 修复了某些浏览器上zoomstart无序启动的错误
        if (op.type === "click" || op.type === "spurious") {
          var distanceMoved = µ.distance(currentMouse, op.startMouse);
          if (currentScale === op.startScale && distanceMoved < MIN_MOVE) {
            // 为了减少麻烦，若鼠标几乎并没有移动，并且并没有发生缩放，那个么忽略op
            op.type = distanceMoved > 0 ? "click" : "spurious";
            return;
          }
          dispatch.trigger("moveStart");
          op.type = "drag";
        }
        if (currentScale != op.startScale) {
          op.type = "zoom";  // 每当检测到缩放变化时，（粘滞地）切换到缩放操作
        }

        // 当缩放时，忽略鼠标正在做的任何事情——真正清理触摸设备上的行为
        op.manipulator.move(op.type === "zoom" ? null : currentMouse, currentScale);
        dispatch.trigger("move");
      })
      .on("zoomend", function () {
        op.manipulator.end();
        if (op.type === "click") {
          dispatch.trigger("click", op.startMouse, globe.projection.invert(op.startMouse) || []);
        }
        else if (op.type !== "spurious") {
          signalEnd();
        }
        op = null;  // 拖动/缩放/单击操作已结束
      });

    var signalEnd = _.debounce(function () {
      if (!op || op.type !== "drag" && op.type !== "zoom") {
        configuration.save({ orientation: globe.orientation() }, { source: "moveEnd" });
        dispatch.trigger("moveEnd");
      }
    }, MOVE_END_WAIT);  // 请稍等片刻，以确定用户是否已停止移动地球仪

    d3.select("#display").call(zoom);
    d3.select("#show-location").on("click", function () {
      console.log(navigator.geolocation)
      if (navigator.geolocation) {
        report.status("查找当前位置中...");
        // navigator.geolocation.getCurrentPosition(function (pos) {
        report.status("");
        var coord = [116.20, 39.56], rotate = globe.locate(coord);
        console.log(rotate)
        if (rotate) {
          globe.projection.rotate(rotate); //旋转
          configuration.save({ orientation: globe.orientation() });  // 触发重新定向
        }
        dispatch.trigger("click", globe.projection(coord), coord); //添加圆点 单例

        // },
        //   function (err) {
        //     alert(err.code);
        //     // code：返回获取位置的状态
        //     //          0  :  不包括其他错误编号中的错误
        //     // ​             1  :  用户拒绝浏览器获取位置信息
        //     // ​             2  :  尝试获取用户信息，但失败了
        //     // ​             3  :   设置了timeout值，获取位置超时了
        //   },
        //   {
        //     enableHighAcuracy: true, //位置是否精确获取
        //     timeout: 5000,            //获取位置允许的最长时间
        //     maximumAge: 1000          //多久更新获取一次位置
        //   }
        // )
      }
    });

    function reorient () {  //重新定向
      var options = arguments[3] || {};
      if (!globe || options.source === "moveEnd") {
        //由于用户刚刚完成移动操作，所以发生了重新定向，因此globe已被删除
        //方向正确。
        return;
      }
      dispatch.trigger("moveStart");
      globe.orientation(configuration.get("orientation"), view);
      zoom.scale(globe.projection.scale());
      dispatch.trigger("moveEnd");
    }

    var dispatch = _.extend({
      globe: function (_) {
        if (_) {
          globe = _;
          zoom.scaleExtent(globe.scaleExtent());
          reorient();
        }
        return _ ? this : globe;
      }
    }, Backbone.Events);
    return dispatch.listenTo(configuration, "change:orientation", reorient);
  }

  /**
   * @param resource GeoJSON资源的URL
   * @returns {Object} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
   *                   用于GeoJSON拓扑功能的promise
   */
  function buildMesh (resource) {

    var cancel = this.cancel;
    report.status("正在下载...");
    return µ.loadJson(resource).then(topo => {
      console.log(topo, '结果结果-----------------------------', resource)
      if (cancel.requested) return null;
      log.time("building meshes");
      var o = topo.objects;
      var coastLo = topojson.feature(topo, µ.isMobile() ? o.coastline_tiny : o.coastline_110m);
      var coastHi = topojson.feature(topo, µ.isMobile() ? o.coastline_110m : o.coastline_50m);
      var lakesLo = topojson.feature(topo, µ.isMobile() ? o.lakes_tiny : o.lakes_110m);
      var lakesHi = topojson.feature(topo, µ.isMobile() ? o.lakes_110m : o.lakes_50m);
      log.timeEnd("building meshes");
      return {
        coastLo: coastLo,
        coastHi: coastHi,
        lakesLo: lakesLo,
        lakesHi: lakesHi
      };
    })
  }

  /**
   * @param {String} projectionName 所需投影的名称。
   * @returns {Object} a promise for a globe object.
   */
  function buildGlobe (projectionName) {
    var builder = globes.get(projectionName);
    if (!builder) {
      return when.reject("Unknown projection: " + projectionName);
    }
    return when(builder(view));
  }

  // 一些黑客的东西，以确保只有一个下载可以在同一时间进行
  var downloadsInProgress = 0;

  function buildGrids () {
    report.status("正在下载...");
    log.time("build grids");
    //撤消：加载产品失败时，卸载的产品仍应存储在代理中。
    //这允许我们使用该产品进行导航和其他状态。
    var cancel = this.cancel;
    downloadsInProgress++;
    var loaded = when.map(products.productsFor(configuration.attributes), function (product) {
      return product.load(cancel);
    });
    return when.all(loaded).then(function (products) {
      log.time("build grids");
      return { primaryGrid: products[0], overlayGrid: products[1] || products[0] };
    }).ensure(function () {
      downloadsInProgress--;
    });
  }

  /**
   * 修改配置以按时间顺序导航到下一个或上一个数据层。
   */
  function navigate (step) {
    if (downloadsInProgress > 0) {
      log.debug("Download in progress--ignoring nav request.");
      return;
    }
    var next = gridAgent.value().primaryGrid.navigate(step);
    if (next) {
      configuration.save(µ.dateToConfig(next));
    }
  }
  // 画图相关
  function buildRenderer (mesh, globe) {
    if (!mesh || !globe) return null;

    report.status("渲染地图中...");
    log.time("rendering map");

    // UNDONE: better way to do the following?
    var dispatch = _.clone(Backbone.Events);
    if (rendererAgent._previous) {
      rendererAgent._previous.stopListening();
    }
    rendererAgent._previous = dispatch;

    //首先清除地图和前景svg内容。
    µ.removeChildren(d3.select("#map").node());
    µ.removeChildren(d3.select("#foreground").node());
    // Create new map svg elements.
    globe.defineMap(d3.select("#map"), d3.select("#foreground"));
    console.log(globe.projection)

    var path = d3.geo.path().projection(globe.projection).pointRadius(7);
    var coastline = d3.select(".coastline");
    var lakes = d3.select(".lakes");
    d3.selectAll("path").attr("d", path);  // 进行初始绘制--修复safari的问题

    function drawLocationMark (point, coord) {
      // show the location on the map if defined 在地图上显示位置（如果已定义）
      if (fieldAgent.value() && !fieldAgent.value().isInsideBoundary(point[0], point[1])) {
        //撤消：有时会在旧的、已发布的字段上调用此命令，因为新字段尚未被调用
        //尚未建造，导致标记无法绘制。
        console.log(7878)
        return;  // 在场边界之外，因此忽略。
      }
      if (coord && _.isFinite(coord[0]) && _.isFinite(coord[1])) {
        var mark = d3.select(".location-mark");
        console.log(mark)
        if (!mark.node()) {
          mark = d3.select("#foreground").append("path").attr("class", "location-mark");
        }
        console.log(path)
        mark.datum({ type: "Point", coordinates: coord }).attr("d", path);
      }
    }

    //如果当前可见位置标记，则绘制位置标记
    if (activeLocation.point && activeLocation.coord) {
      drawLocationMark(activeLocation.point, activeLocation.coord);
    }

    // 节流绘制方法有助于处理速度较慢的设备，这些设备可能会被太多的重画事件淹没。
    var REDRAW_WAIT = 5;  // milliseconds
    var doDraw_throttled = _.throttle(doDraw, REDRAW_WAIT, { leading: false });

    function doDraw () {
      d3.selectAll("path").attr("d", path);
      rendererAgent.trigger("redraw");
      doDraw_throttled = _.throttle(doDraw, REDRAW_WAIT, { leading: false });
    }

    // 附加到输入控制器上的贴图渲染事件。
    dispatch.listenTo(
      inputController, {
      moveStart: function () {
        coastline.datum(mesh.coastLo);
        lakes.datum(mesh.lakesLo);
        rendererAgent.trigger("start");
      },
      move: function () {
        doDraw_throttled();
      },
      moveEnd: function () {
        coastline.datum(mesh.coastHi);
        lakes.datum(mesh.lakesHi);
        d3.selectAll("path").attr("d", path);
        rendererAgent.trigger("render");
      },
      click: drawLocationMark
    });

    //最后，将globe模型注入到输入控制器中。在下一个活动回合进行，以确保
    //渲染器在事件开始流动之前已完全设置。
    when(true).then(function () {
      inputController.globe(globe);
    });

    log.timeEnd("rendering map");
    return "ready";
  }
  //创建遮罩
  function createMask (globe) {
    if (!globe) return null;

    log.time("render mask");

    // 创建分离的画布，要求模型定义遮罩多边形，然后使用不透明颜色填充。
    var width = view.width, height = view.height;
    var canvas = d3.select(document.createElement("canvas")).attr("width", width).attr("height", height).node();
    var context = globe.defineMask(canvas.getContext("2d"));
    context.fillStyle = "rgba(255, 0, 0, 1)";
    context.fill();
    // d3.select("#display").node().appendChild(canvas);  // make mask visible for debugging

    var imageData = context.getImageData(0, 0, width, height);
    var data = imageData.data;  // layout: [r, g, b, a, r, g, b, a, ...]
    log.timeEnd("render mask");
    return {
      imageData: imageData,
      isVisible: function (x, y) {
        var i = (y * width + x) * 4;
        return data[i + 3] > 0;  // non-zero alpha means pixel is visible
      },
      set: function (x, y, rgba) {
        var i = (y * width + x) * 4;
        data[i] = rgba[0];
        data[i + 1] = rgba[1];
        data[i + 2] = rgba[2];
        data[i + 3] = rgba[3];
        return this;
      }
    };
  }
  //创建字段
  function createField (columns, bounds, mask) {

    /**
     * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
     *          is undefined at that point.
     */
    function field (x, y) {
      var column = columns[Math.round(x)];
      return column && column[Math.round(y)] || NULL_WIND_VECTOR;
    }

    /**
     * @returns {boolean} true if the field is valid at the point (x, y)
     */
    field.isDefined = function (x, y) {
      return field(x, y)[2] !== null;
    };

    /**
     * @returns {boolean} true if the point (x, y) lies inside the outer boundary of the vector field, even if
     *          the vector field has a hole (is undefined) at that point, such as at an island in a field of
     *          ocean currents.
     */
    field.isInsideBoundary = function (x, y) {
      return field(x, y) !== NULL_WIND_VECTOR;
    };

    //为GC释放大量的“列”数组。如果没有这一点，则每次出现新的错误时，阵列都会泄漏（在Chrome中）
    //字段被插入是因为字段闭包的上下文泄漏，原因无法解释。
    field.release = function () {
      columns = [];
    };

    field.randomize = function (o) {  // UNDONE: this method is terrible
      var x, y;
      var safetyNet = 0;
      do {
        x = Math.round(_.random(bounds.x, bounds.xMax));
        y = Math.round(_.random(bounds.y, bounds.yMax));
      } while (!field.isDefined(x, y) && safetyNet++ < 30);
      o.x = x;
      o.y = y;
      return o;
    };

    field.overlay = mask.imageData;

    return field;
  }

  /**
  *计算由点（x，y）处的投影形状引起的风矢量失真。风
  *向量在适当的位置被修改，并由该函数返回
   */
  function distort (projection, λ, φ, x, y, scale, wind) {
    var u = wind[0] * scale;
    var v = wind[1] * scale;
    var d = µ.distortion(projection, λ, φ, x, y);

    // Scale distortion vectors by u and v, then add.
    wind[0] = d[0] * u + d[2] * v;
    wind[1] = d[1] * u + d[3] * v;
    return wind;
  }

  function interpolateField (globe, grids) {
    if (!globe || !grids) return null;

    var mask = createMask(globe);
    var primaryGrid = grids.primaryGrid;
    var overlayGrid = grids.overlayGrid;

    log.time("interpolating field");
    var d = when.defer(), cancel = this.cancel;

    var projection = globe.projection;
    var bounds = globe.bounds(view);
    //粒子在屏幕上移动的速度（为美观而选择的任意值）。
    var velocityScale = bounds.height * primaryGrid.particles.velocityScale;

    var columns = [];
    var point = [];
    var x = bounds.x;
    var interpolate = primaryGrid.interpolate;
    var overlayInterpolate = overlayGrid.interpolate;
    var hasDistinctOverlay = primaryGrid !== overlayGrid;
    var scale = overlayGrid.scale;

    function interpolateColumn (x) {
      var column = [];
      for (var y = bounds.y; y <= bounds.yMax; y += 2) {
        if (mask.isVisible(x, y)) {
          point[0] = x; point[1] = y;
          var coord = projection.invert(point);
          var color = TRANSPARENT_BLACK;
          var wind = null;
          if (coord) {
            var λ = coord[0], φ = coord[1];
            if (isFinite(λ)) {
              wind = interpolate(λ, φ);
              var scalar = null;
              if (wind) {
                wind = distort(projection, λ, φ, x, y, velocityScale, wind);
                scalar = wind[2];
              }
              if (hasDistinctOverlay) {
                scalar = overlayInterpolate(λ, φ);
              }
              if (µ.isValue(scalar)) {
                color = scale.gradient(scalar, OVERLAY_ALPHA);
              }
            }
          }
          column[y + 1] = column[y] = wind || HOLE_VECTOR;
          mask.set(x, y, color).set(x + 1, y, color).set(x, y + 1, color).set(x + 1, y + 1, color);
        }
      }
      columns[x + 1] = columns[x] = column;
    }

    report.status("");

    (function batchInterpolate () {
      try {
        if (!cancel.requested) {
          var start = Date.now();
          while (x < bounds.xMax) {
            interpolateColumn(x);
            x += 2;
            if ((Date.now() - start) > MAX_TASK_TIME) {
              // Interpolation is taking too long. Schedule the next batch for later and yield.
              report.progress((x - bounds.x) / (bounds.xMax - bounds.x));
              setTimeout(batchInterpolate, MIN_SLEEP_TIME);
              return;
            }
          }
        }
        d.resolve(createField(columns, bounds, mask));
      }
      catch (e) {
        d.reject(e);
      }
      report.progress(1);  // 100% complete
      log.timeEnd("interpolating field");
    })();

    return d.promise;
  }

  function animate (globe, field, grids) {
    if (!globe || !field || !grids) return;

    var cancel = this.cancel;
    var bounds = globe.bounds(view);
    //maxIntensity是粒子颜色强度最大时的速度
    var colorStyles = µ.windIntensityColorScale(INTENSITY_SCALE_STEP, grids.primaryGrid.particles.maxIntensity);
    var buckets = colorStyles.map(function () { return []; });
    var particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
    if (µ.isMobile()) {
      particleCount *= PARTICLE_REDUCTION;
    }
    var fadeFillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

    // log.debug("particle count: " + particleCount);
    var particles = [];
    for (var i = 0; i < particleCount; i++) {
      particles.push(field.randomize({ age: _.random(0, MAX_PARTICLE_AGE) }));
    }
    // console.log(particles)

    function evolve () {
      buckets.forEach(function (bucket) { bucket.length = 0; });
      particles.forEach(function (particle) {
        if (particle.age > MAX_PARTICLE_AGE) {
          field.randomize(particle).age = 0;
        }
        var x = particle.x;
        var y = particle.y;
        var v = field(x, y);  // vector at current position
        var m = v[2];
        if (m === null) {
          particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
        }
        else {
          var xt = x + v[0];
          var yt = y + v[1];
          if (field.isDefined(xt, yt)) {
            // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
            particle.xt = xt;
            particle.yt = yt;
            buckets[colorStyles.indexFor(m)].push(particle);
          }
          else {
            // Particle isn't visible, but it still moves through the field.
            particle.x = xt;
            particle.y = yt;
          }
        }
        particle.age += 1;
      });
    }

    var g = d3.select("#animation").node().getContext("2d");
    g.lineWidth = PARTICLE_LINE_WIDTH;
    g.fillStyle = fadeFillStyle;

    function draw () {
      // Fade existing particle trails.
      var prev = g.globalCompositeOperation;
      g.globalCompositeOperation = "destination-in";
      g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      g.globalCompositeOperation = prev;

      // Draw new particle trails.
      buckets.forEach(function (bucket, i) {
        if (bucket.length > 0) {
          g.beginPath();
          g.strokeStyle = colorStyles[i];
          bucket.forEach(function (particle) {
            g.moveTo(particle.x, particle.y);
            g.lineTo(particle.xt, particle.yt);
            particle.x = particle.xt;
            particle.y = particle.yt;
          });
          g.stroke();
        }
      });
    }

    (function frame () {
      try {
        if (cancel.requested) {
          field.release();
          return;
        }
        evolve();
        draw();
        setTimeout(frame, FRAME_RATE);
      }
      catch (e) {
        report.error(e);
      }
    })();
  }

  function drawGridPoints (ctx, grid, globe) {
    if (!grid || !globe || !configuration.get("showGridPoints")) return;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    //使用投影流的剪裁行为快速绘制可见点。
    var stream = globe.projection.stream({
      point: function (x, y) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    });
    grid.forEachPoint(function (λ, φ, d) {
      if (µ.isValue(d)) {
        stream.point(λ, φ);
      }
    });
  }

  function drawOverlay (field, overlayType) {
    if (!field) return;

    var ctx = d3.select("#overlay").node().getContext("2d"), grid = (gridAgent.value() || {}).overlayGrid;

    µ.clearCanvas(d3.select("#overlay").node());
    µ.clearCanvas(d3.select("#scale").node());
    if (overlayType) {
      if (overlayType !== "off") {
        ctx.putImageData(field.overlay, 0, 0);
      }
      drawGridPoints(ctx, grid, globeAgent.value());
    }

    if (grid) {
      //绘制颜色条以供参考。
      var colorBar = d3.select("#scale"), scale = grid.scale, bounds = scale.bounds;
      var c = colorBar.node(), g = c.getContext("2d"), n = c.width - 1;
      for (var i = 0; i <= n; i++) {
        var rgb = scale.gradient(µ.spread(i / n, bounds[0], bounds[1]), 1);
        g.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
        g.fillRect(i, 0, 1, c.height);
      }
      //悬停时显示工具提示。
      colorBar.on("mousemove", function () {
        var x = d3.mouse(this)[0];
        var pct = µ.clamp((Math.round(x) - 2) / (n - 2), 0, 1);
        var value = µ.spread(pct, bounds[0], bounds[1]);
        var elementId = grid.type === "wind" ? "#location-wind-units" : "#location-value-units";
        var units = createUnitToggle(elementId, grid).value();
        colorBar.attr("title", µ.formatScalar(value, units) + " " + units.label);
      });
    }
  }

  /**
  *提取网格有效的日期，如果没有可用的网格，则提取当前日期。
  *撤消：如果网格包含已卸载的产品，则可以从中提取日期。
  *这个函数将很好地简化。
   */
  function validityDate (grids) {
    //当活动层被视为“当前”时，请使用其当前时间，否则使用当前时间
    //现在（但四舍五入到最近的三小时街区）。
    var THREE_HOURS = 3 * HOUR;
    var now = grids ? grids.primaryGrid.date.getTime() : Math.floor(Date.now() / THREE_HOURS) * THREE_HOURS;
    var parts = configuration.get("date").split("/");  // yyyy/mm/dd or "current"
    var hhmm = configuration.get("hour");
    return parts.length > 1 ?
      Date.UTC(+parts[0], parts[1] - 1, +parts[2], +hhmm.substring(0, 2)) :
      parts[0] === "current" ? now : null;
  }

  /**
   * 在菜单中显示网格的有效日期。允许在本地时间和UTC时间之间切换。
   */
  function showDate (grids) {
    var date = new Date(validityDate(grids)), isLocal = d3.select("#data-date").classed("local");
    var formatted = isLocal ? µ.toLocalISO(date) : µ.toUTCISO(date);
    d3.select("#data-date").text(formatted + " " + (isLocal ? "本地时间" : "UTC"));
    d3.select("#toggle-zone").text("⇄ " + (isLocal ? "UTC" : "本地时间"));
  }

  /**
   * 在菜单中显示网格的类型。
   */
  function showGridDetails (grids) {
    showDate(grids);
    var description = "", center = "";
    if (grids) {
      var langCode = d3.select("body").attr("data-lang") || "en";
      var pd = grids.primaryGrid.description(langCode), od = grids.overlayGrid.description(langCode);
      description = od.name + od.qualifier;
      if (grids.primaryGrid !== grids.overlayGrid) {
        // Combine both grid descriptions together with a " + " if their qualifiers are the same.
        description = (pd.qualifier === od.qualifier ? pd.name : pd.name + pd.qualifier) + " + " + description;
      }
      center = grids.overlayGrid.source;
    }
    d3.select("#data-layer").text(description);
    d3.select("#data-center").text(center);
  }

  /**
  *为指定产品的单位构造一个切换器，将切换状态存储在具有
  *指定的id。例如，给定具有单位[“m/s”、“mph”]的产品，此
  *方法将元素的“数据索引”属性设置为0表示m/s，1表示mph。调用value（）返回
  *当前活动单位对象。调用next（）会增加索引。
   */
  function createUnitToggle (id, product) {
    var units = product.units, size = units.length;
    var index = +(d3.select(id).attr("data-index") || 0) % size;
    return {
      value: function () {
        return units[index];
      },
      next: function () {
        d3.select(id).attr("data-index", index = ((index + 1) % size));
      }
    };
  }

  /**
   * 显示指定的风值。允许在不同类型的风机之间切换。
   */
  function showWindAtLocation (wind, product) {
    var unitToggle = createUnitToggle("#location-wind-units", product), units = unitToggle.value();
    d3.select("#location-wind").text(µ.formatVector(wind, units));
    d3.select("#location-wind-units").text(units.label).on("click", function () {
      unitToggle.next();
      showWindAtLocation(wind, product);
    });
  }

  /**
   *显示指定的覆盖值。允许在不同类型的受支持单元之间切换。
   */
  function showOverlayValueAtLocation (value, product) {
    var unitToggle = createUnitToggle("#location-value-units", product), units = unitToggle.value();
    d3.select("#location-value").text(µ.formatScalar(value, units));
    d3.select("#location-value-units").text(units.label).on("click", function () {
      unitToggle.next();
      showOverlayValueAtLocation(value, product);
    });
  }

  //存储当前可见位置的点和坐标。这用于更新位置
  //字段更改时的详细信息。
  var activeLocation = {};

  /**
   *在给定的[x，y]点及其对应的[lon，lat]坐标处显示本地数据标注。
   *该位置可能无效，在这种情况下，不显示详图索引。显示两者的位置数据
   *主栅格和覆盖栅格，必要时执行插值。
   */
  function showLocationDetails (point, coord) {
    point = point || [];
    coord = coord || [];
    var grids = gridAgent.value(), field = fieldAgent.value(), λ = coord[0], φ = coord[1];
    if (!field || !field.isInsideBoundary(point[0], point[1])) {
      return;
    }

    clearLocationDetails(false);  // clean the slate
    activeLocation = { point: point, coord: coord };  // remember where the current location is

    if (_.isFinite(λ) && _.isFinite(φ)) {
      d3.select("#location-coord").text(µ.formatCoordinates(λ, φ));
      d3.select("#location-close").classed("invisible", false);
    }

    if (field.isDefined(point[0], point[1]) && grids) {
      var wind = grids.primaryGrid.interpolate(λ, φ);
      if (µ.isValue(wind)) {
        showWindAtLocation(wind, grids.primaryGrid);
      }
      if (grids.overlayGrid !== grids.primaryGrid) {
        var value = grids.overlayGrid.interpolate(λ, φ);
        if (µ.isValue(value)) {
          showOverlayValueAtLocation(value, grids.overlayGrid);
        }
      }
    }
  }

  function updateLocationDetails () {
    showLocationDetails(activeLocation.point, activeLocation.coord);
  }

  function clearLocationDetails (clearEverything) {
    d3.select("#location-coord").text("");
    d3.select("#location-close").classed("invisible", true);
    d3.select("#location-wind").text("");
    d3.select("#location-wind-units").text("");
    d3.select("#location-value").text("");
    d3.select("#location-value-units").text("");
    if (clearEverything) {
      activeLocation = {};
      d3.select(".location-mark").remove();
    }
  }

  function stopCurrentAnimation (alsoClearCanvas) {
    animatorAgent.cancel();
    if (alsoClearCanvas) {
      µ.clearCanvas(d3.select("#animation").node());
    }
  }

  /**
   *为指定的DOM元素注册click事件处理程序，该元素修改配置以使
   *由newAttr表示的属性。还为配置更改事件注册了事件侦听器，
   *因此，当发生更改时，如果
   *配置与此按钮的属性匹配。将获取用于匹配的属性集
   *来自newAttr，除非提供了自定义密钥集。
   */
  function bindButtonToConfiguration (elementId, newAttr, keys) {
    // console.log(elementId, newAttr, keys)
    keys = keys || _.keys(newAttr);
    d3.select(elementId).on("click", function () {
      if (d3.select(elementId).classed("disabled")) return;
      console.log(newAttr, configuration.save(newAttr))
      configuration.save(newAttr);
    });
    configuration.on("change", function (model) {
      var attr = model.attributes;
      d3.select(elementId).classed("highlighted", _.isEqual(_.pick(attr, keys), _.pick(newAttr, keys)));
    });
  }

  function reportSponsorClick (type) {
    if (ga) {
      ga("send", "event", "sponsor", type);
    }
  }

  /**
  *注册所有事件处理程序，以将组件和页面元素绑定在一起。一定有清洁工
  *实现这一目标的方法。。。
   */
  function init () {
    report.status("Initializing...");

    d3.select("#sponsor-link")
      .attr("target", µ.isEmbeddedInIFrame() ? "_new" : null)
      .on("click", reportSponsorClick.bind(null, "click"))
      .on("contextmenu", reportSponsorClick.bind(null, "right-click"))
    d3.select("#sponsor-hide").on("click", function () {
      d3.select("#sponsor").classed("invisible", true);
    });

    d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
    // Adjust size of the scale canvas to fill the width of the menu to the right of the label.
    var label = d3.select("#scale-label").node();
    d3.select("#scale")
      .attr("width", (d3.select("#menu").node().offsetWidth - label.offsetWidth) * 0.97)
      .attr("height", label.offsetHeight / 2);

    d3.select("#show-menu").on("click", function () {
      if (µ.isEmbeddedInIFrame()) {
        window.open("http://earth.nullschool.net/" + window.location.hash, "_blank");
      }
      else {
        d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
      }
    });

    if (µ.isFF()) {
      // Workaround FF performance issue of slow click behavior on map having thick coastlines.
      d3.select("#display").classed("firefox", true);
    }

    // Tweak document to distinguish CSS styling between touch and non-touch environments. Hacky hack.
    if ("ontouchstart" in document.documentElement) {
      d3.select(document).on("touchstart", function () { });  // this hack enables :active pseudoclass
    }
    else {
      d3.select(document.documentElement).classed("no-touch", true);  // to filter styles problematic for touch
    }
    // Bind configuration to URL bar changes.
    d3.select(window).on("hashchange", function () {
      log.debug("hashchange");
      configuration.fetch({ trigger: "hashchange" });
    });
    configuration.on("change", report.reset);
    meshAgent.listenTo(configuration, "change:topology", function (context, attr) {
      meshAgent.submit(buildMesh, attr);
    });

    globeAgent.listenTo(configuration, "change:projection", function (source, attr) {
      globeAgent.submit(buildGlobe, attr);
    });
    //监听按钮是否改变=》改变图层
    gridAgent.listenTo(configuration, "change", function () {
      var changed = _.keys(configuration.changedAttributes()), rebuildRequired = false;

      //如果任何与图层相关的属性已更改，请构建新网格。
      if (_.intersection(changed, ["date", "hour", "param", "surface", "level"]).length > 0) {
        rebuildRequired = true;
      }
      //如果新覆盖类型与当前类型不同，则构建新网格。
      var overlayType = configuration.get("overlayType") || "default";
      if (_.indexOf(changed, "overlayType") >= 0 && overlayType !== "off") {
        var grids = (gridAgent.value() || {}), primary = grids.primaryGrid, overlay = grids.overlayGrid;
        if (!overlay) {
          //如果没有重叠网格，请执行重建。
          rebuildRequired = true;
        }
        else if (overlay.type !== overlayType && !(overlayType === "default" && primary === overlay)) {
          //如果类型不同，请执行重建。
          rebuildRequired = true;
        }
      }

      if (rebuildRequired) {
        gridAgent.submit(buildGrids);
      }
    });
    gridAgent.on("submit", function () {
      showGridDetails(null);
    });
    gridAgent.on("update", function (grids) {
      showGridDetails(grids);
    });
    //当地时间 ⇄ 国际时间
    d3.select("#toggle-zone").on("click", function () {
      d3.select("#data-date").classed("local", !d3.select("#data-date").classed("local"));
      showDate(gridAgent.cancel.requested ? null : gridAgent.value());
    });

    function startRendering () {
      rendererAgent.submit(buildRenderer, meshAgent.value(), globeAgent.value());
    }
    rendererAgent.listenTo(meshAgent, "update", startRendering);
    rendererAgent.listenTo(globeAgent, "update", startRendering);

    function startInterpolation () {
      fieldAgent.submit(interpolateField, globeAgent.value(), gridAgent.value());
    }
    function cancelInterpolation () {
      fieldAgent.cancel();
    }
    fieldAgent.listenTo(gridAgent, "update", startInterpolation);
    fieldAgent.listenTo(rendererAgent, "render", startInterpolation);
    fieldAgent.listenTo(rendererAgent, "start", cancelInterpolation);
    fieldAgent.listenTo(rendererAgent, "redraw", cancelInterpolation);

    animatorAgent.listenTo(fieldAgent, "update", function (field) {
      animatorAgent.submit(animate, globeAgent.value(), field, gridAgent.value());
    });
    animatorAgent.listenTo(rendererAgent, "start", stopCurrentAnimation.bind(null, true));
    animatorAgent.listenTo(gridAgent, "submit", stopCurrentAnimation.bind(null, false));
    animatorAgent.listenTo(fieldAgent, "submit", stopCurrentAnimation.bind(null, false));

    overlayAgent.listenTo(fieldAgent, "update", function () {
      overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlayType"));
    });
    overlayAgent.listenTo(rendererAgent, "start", function () {
      overlayAgent.submit(drawOverlay, fieldAgent.value(), null);
    });
    overlayAgent.listenTo(configuration, "change", function () {
      var changed = _.keys(configuration.changedAttributes())
      // 如果仅覆盖相关标志已更改。
      if (_.intersection(changed, ["overlayType", "showGridPoints"]).length > 0) {
        overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlayType"));
      }
    });


    //添加用于显示、更新和删除位置详细信息的事件处理程序。  
    inputController.on("click", showLocationDetails);
    fieldAgent.on("update", updateLocationDetails);
    d3.select("#location-close").on("click", _.partial(clearLocationDetails, true));

    //根据我们所处的模式修改时间菜单。
    configuration.on("change:param", function (context, mode) {
      d3.selectAll(".ocean-mode").classed("invisible", mode !== "ocean");
      d3.selectAll(".ncep-mode").classed("invisible", mode !== "ncep");
      d3.selectAll(".cma-mode").classed("invisible", mode !== "cma");
      switch (mode) {
        case "ncep":
          d3.select("#nav-backward-more").attr("title", "-1 Day");
          d3.select("#nav-backward").attr("title", "-3 Hours");
          d3.select("#nav-forward").attr("title", "+3 Hours");
          d3.select("#nav-forward-more").attr("title", "+1 Day");
          break;
        case "cma":
          d3.select("#nav-backward-more").attr("title", "-1 Day");
          d3.select("#nav-backward").attr("title", "-3 Hours");
          d3.select("#nav-forward").attr("title", "+3 Hours");
          d3.select("#nav-forward-more").attr("title", "+1 Day");
          break;
        case "ocean":
          d3.select("#nav-backward-more").attr("title", "-1 Month");
          d3.select("#nav-backward").attr("title", "-5 Days");
          d3.select("#nav-forward").attr("title", "+5 Days");
          d3.select("#nav-forward-more").attr("title", "+1 Month");
          break;
      }
    });

    //为模式按钮添加处理程序。
    //NECP
    d3.select("#ncep-mode-enable").on("click", function () {
      if (configuration.get("param") !== "ncep") {
        configuration.save({ param: "ncep", surface: "surface", level: "level", overlayType: "default" });
      }
    });
    configuration.on("change:param", function (x, param) {
      d3.select("#ncep-mode-enable").classed("highlighted", param === "ncep");
    });
    //CMA
    d3.select("#cma-mode-enable").on("click", function () {
      console.log(configuration.get("param"))
      if (configuration.get("param") !== "cma") {
        configuration.save({ param: "cma", surface: "cmasurface", level: "level", overlayType: "default" });
      }
    });
    configuration.on("change:param", function (x, param) {
      d3.select("#cma-mode-enable").classed("highlighted", param === "cma");
    });
    configuration.on("change:param", function (x, param) {
      d3.select("#ukmo-mode-enable").classed("highlighted", param === "ukmo");
    });

    //ocean
    d3.select("#ocean-mode-enable").on("click", function () {
      if (configuration.get("param") !== "ocean") {
        //在模式之间切换时，当前日期可能没有关联数据。所以我们需要
        //根据目录查找最接近的可用目录。如果日期为“当前”，则不需要此选项。
        //撤消：此代码很烦人。应该更容易获得最近的海洋产品的日期。
        var ocean = { param: "ocean", surface: "surface", level: "currents", overlayType: "default" };
        var attr = _.clone(configuration.attributes);
        if (attr.date === "current") {
          configuration.save(ocean);
        }
        else {
          when.all(products.productsFor(_.extend(attr, ocean))).spread(function (product) {
            if (product.date) {
              configuration.save(_.extend(ocean, µ.dateToConfig(product.date)));
            }
          }).otherwise(report.error);
        }
        stopCurrentAnimation(true);  //清理大陆上的粒子瑕疵
      }
    });
    configuration.on("change:param", function (x, param) {
      d3.select("#ocean-mode-enable").classed("highlighted", param === "ocean");
    });

    // 添加逻辑以禁用彼此不兼容的按钮
    configuration.on("change:overlayType", function (x, ot) {
      d3.select("#surface-level").classed("disabled", ot === "air_density" || ot === "wind_power_density");
    });
    configuration.on("change:surface", function (x, s) {
      d3.select("#overlay-air_density").classed("disabled", s === "surface");
      d3.select("#overlay-wind_power_density").classed("disabled", s === "surface");
    });

    // 为时间导航按钮添加事件处理程序。
    d3.select("#nav-backward-more").on("click", navigate.bind(null, -10));
    d3.select("#nav-forward-more").on("click", navigate.bind(null, +10));
    d3.select("#nav-backward").on("click", navigate.bind(null, -1));
    d3.select("#nav-forward").on("click", navigate.bind(null, +1));
    d3.select("#nav-now").on("click", function () { configuration.save({ date: "current", hour: "" }); });

    d3.select("#option-show-grid").on("click", function () {
      configuration.save({ showGridPoints: !configuration.get("showGridPoints") });
    });
    configuration.on("change:showGridPoints", function (x, showGridPoints) {
      d3.select("#option-show-grid").classed("highlighted", showGridPoints);
    });

    // 为所有风级按钮添加处理程序。
    d3.selectAll(".surface").each(function () {
      var id = this.id, parts = id.split("-");
      bindButtonToConfiguration("#" + id, { param: "ncep", surface: parts[0], level: parts[1] });
    });

    // 为所有cma 下高度 按钮添加处理程序。
    d3.selectAll(".cmasurface").each(function () {
      var id = this.id, parts = id.split("-");
      bindButtonToConfiguration("#" + id, { param: "cma", surface: parts[0], level: parts[1] });
    });

    // 为海洋动画类型添加处理程序。
    bindButtonToConfiguration("#animate-currents", { param: "ocean", surface: "surface", level: "currents" });

    // 为所有覆盖按钮添加处理程序。
    products.overlayTypes.forEach(function (type) {
      bindButtonToConfiguration("#overlay-" + type, { overlayType: type });
    });

    //切换模式是更新要素变量图层
    bindButtonToConfiguration("#overlay-wind", { param: "ncep", overlayType: "default" });
    bindButtonToConfiguration("#overlay-cmawind", { param: "cma", overlayType: "default" });
    bindButtonToConfiguration("#overlay-currents", { overlayType: "default" });


    bindButtonToConfiguration("#overlay-ocean-off", { overlayType: "off" });
    bindButtonToConfiguration("#overlay-cma-off", { overlayType: "off" });


    // 为所有投影按钮添加处理程序。
    globes.keys().forEach(function (p) {
      bindButtonToConfiguration("#" + p, { projection: p, orientation: "" }, ["projection"]);
    });

    // 当触摸设备在纵向和横向之间切换时，请使用新的视图大小重建地球仪。
    d3.select(window).on("orientationchange", function () {
      view = µ.view();
      globeAgent.submit(buildGlobe, configuration.get("projection"));
    });
  }

  function start () {
    // 现在一切都设置好了，所以从散列片段加载配置并启动更改事件。
    configuration.fetch();
  }

  when(true).then(init).then(start).otherwise(report.error);

})();
