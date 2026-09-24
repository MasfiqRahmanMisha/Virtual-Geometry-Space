/* ============================================================
   Virtual Geometry Space — app.js
   Vanilla JS / SVG geometry instrument workspace.
   Sections:
     1. State & constants
     2. Geometry / math helpers
     3. History (undo/redo)
     4. Rendering
     5. Tool: Select / Move
     6. Tool: Pencil / Eraser
     7. Instrument: Ruler
     8. Instrument: Compass
     9. Instrument: Protractor
     10. Toolbar / top bar wiring
     11. Save / Open / Export
     12. Init
   ============================================================ */

(function () {
"use strict";

/* ============================================================
   1. STATE & CONSTANTS
   ============================================================ */
const svg      = document.getElementById("svg-canvas");
const gObjects = document.getElementById("layer-objects");
const gInstr   = document.getElementById("layer-instruments");
const viewport = document.getElementById("canvas-viewport");

const state = {
  tool: "select",
  objects: [],          // all committed geometry objects
  selectedId: null,
  idCounter: 1,
  zoom: 1
};

const ruler = { visible:false, x:260, y:220, length:420, angle:-10, dragMode:null, drag:null };
const compass = {
  visible:false, cx:700, cy:400, radius:130, rotation:-40,
  hingeH:110, handleH:34, dragMode:null,
  sweepStart:null, sweepAccum:0
};
const protractor = {
  visible:false, x:900, y:600, rotation:0, radius:150,
  angle1:30, angle2:110, dragMode:null
};

const historyStack = [];
const redoStack = [];
const HISTORY_LIMIT = 100;

/* ============================================================
   2. GEOMETRY / MATH HELPERS
   ============================================================ */
function toRad(d){ return d * Math.PI / 180; }
function toDeg(r){ return r * 180 / Math.PI; }

function dist(x1,y1,x2,y2){ return Math.hypot(x2-x1, y2-y1); }

function angleOf(cx,cy,x,y){ return toDeg(Math.atan2(y-cy, x-cx)); }

function normalizeAngle(a){
  a = a % 360;
  if (a < 0) a += 360;
  return a;
}

/** Signed shortest delta between two angles in degrees, range (-180,180]. */
function angleDelta(from, to){
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

function polarPoint(cx, cy, r, angleDeg){
  const rad = toRad(angleDeg);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG path "d" for an arc from startAngle to endAngle (deg), sweeping through
 *  the shortest/consistent direction indicated by the raw (non-normalized) delta. */
function describeArcPath(cx, cy, r, startAngle, endAngle){
  const start = polarPoint(cx, cy, r, startAngle);
  const end   = polarPoint(cx, cy, r, endAngle);
  const delta = endAngle - startAngle;
  const absDelta = Math.abs(delta) % 360;
  const largeArc = absDelta > 180 ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function svgPointFromEvent(evt){
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x:0, y:0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function fmt(n, d=2){ return Number(n).toFixed(d); }

function genId(prefix){ return prefix + "-" + (state.idCounter++); }

/* ============================================================
   3. HISTORY (UNDO / REDO)
   ============================================================ */
function snapshot(){ return JSON.stringify(state.objects); }

function pushHistory(){
  historyStack.push(snapshot());
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  redoStack.length = 0;
}

function undo(){
  if (!historyStack.length) return;
  redoStack.push(snapshot());
  state.objects = JSON.parse(historyStack.pop());
  state.selectedId = null;
  renderAll();
  toast("Undo");
}

function redo(){
  if (!redoStack.length) return;
  historyStack.push(snapshot());
  state.objects = JSON.parse(redoStack.pop());
  state.selectedId = null;
  renderAll();
  toast("Redo");
}

/* ============================================================
   4. RENDERING
   ============================================================ */
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function objectMeasurementText(obj){
  switch(obj.type){
    case "line":
      return `Length ${fmt(dist(obj.x1,obj.y1,obj.x2,obj.y2))}px`;
    case "circle":
      return `Radius ${fmt(obj.r)}px`;
    case "arc": {
      const span = Math.abs(angleDelta(obj.startAngle, obj.endAngle)) || Math.abs(obj.endAngle-obj.startAngle)%360;
      return `R ${fmt(obj.r,0)} · ${fmt(span,1)}°`;
    }
    case "stroke":
      return `${obj.points.length} pts`;
    case "angle":
      return `${fmt(Math.abs(angleDelta(obj.angle1,obj.angle2)),1)}°`;
    default: return "";
  }
}

function objectLabel(obj){
  const names = { line:"Line", arc:"Arc", circle:"Circle", stroke:"Pencil Stroke", angle:"Angle" };
  return `${names[obj.type] || obj.type} #${obj.numId}`;
}

function renderObjectsList(){
  const box = document.getElementById("objects-list");
  box.innerHTML = "";
  if (!state.objects.length){
    box.innerHTML = '<div class="empty-hint">No objects yet</div>';
    return;
  }
  state.objects.forEach(obj => {
    const row = document.createElement("div");
    row.className = "obj-row" + (obj.id === state.selectedId ? " active" : "");
    row.innerHTML = `<span>${objectLabel(obj)} — ${objectMeasurementText(obj)}</span>`;
    const del = document.createElement("button");
    del.className = "obj-del";
    del.textContent = "✕";
    del.title = "Delete";
    del.onclick = (e) => { e.stopPropagation(); pushHistory(); removeObject(obj.id); renderAll(); };
    row.appendChild(del);
    row.onclick = () => { state.selectedId = obj.id; renderAll(); };
    box.appendChild(row);
  });
}

function updateMeasurementPanel(){
  const L = document.getElementById("m-length");
  const R = document.getElementById("m-radius");
  const A = document.getElementById("m-angle");
  const AL = document.getElementById("m-arclength");
  L.textContent = "–"; R.textContent = "–"; A.textContent = "–"; AL.textContent = "–";

  const obj = state.objects.find(o => o.id === state.selectedId);
  if (!obj) return;
  if (obj.type === "line"){
    L.textContent = fmt(dist(obj.x1,obj.y1,obj.x2,obj.y2));
  } else if (obj.type === "circle"){
    R.textContent = fmt(obj.r);
    L.textContent = fmt(obj.r*2) + " (diam)";
    AL.textContent = fmt(2*Math.PI*obj.r) + " (circ)";
  } else if (obj.type === "arc"){
    const span = Math.abs(angleDelta(obj.startAngle, obj.endAngle));
    R.textContent = fmt(obj.r);
    A.textContent = fmt(span,1) + "°";
    AL.textContent = fmt(obj.r * toRad(span));
  } else if (obj.type === "angle"){
    A.textContent = fmt(Math.abs(angleDelta(obj.angle1, obj.angle2)),1) + "°";
  }
}

function liveMeasure(fields){
  // fields: {length, radius, angle, arclength} — any subset, values already formatted strings
  if (fields.length   !== undefined) document.getElementById("m-length").textContent = fields.length;
  if (fields.radius   !== undefined) document.getElementById("m-radius").textContent = fields.radius;
  if (fields.angle    !== undefined) document.getElementById("m-angle").textContent = fields.angle;
  if (fields.arclength!== undefined) document.getElementById("m-arclength").textContent = fields.arclength;
}

function renderGeometry(){
  gObjects.innerHTML = "";
  state.objects.forEach(obj => {
    const selected = obj.id === state.selectedId;
    const cls = "geo-object" + (selected ? " selected" : "");
    let visible, hit;
    if (obj.type === "line"){
      visible = el("line", {x1:obj.x1,y1:obj.y1,x2:obj.x2,y2:obj.y2, class:cls}, gObjects);
      hit = el("line", {x1:obj.x1,y1:obj.y1,x2:obj.x2,y2:obj.y2, class:"hit-area"}, gObjects);
    } else if (obj.type === "circle"){
      visible = el("circle", {cx:obj.cx,cy:obj.cy,r:obj.r, class:cls}, gObjects);
      hit = el("circle", {cx:obj.cx,cy:obj.cy,r:obj.r, class:"hit-area"}, gObjects);
    } else if (obj.type === "arc"){
      const d = describeArcPath(obj.cx,obj.cy,obj.r,obj.startAngle,obj.endAngle);
      visible = el("path", {d, class:cls}, gObjects);
      hit = el("path", {d, class:"hit-area"}, gObjects);
    } else if (obj.type === "stroke"){
      const d = pointsToPath(obj.points);
      visible = el("path", {d, class: cls + " pencil-stroke", stroke:"#1f2430", "stroke-width":"2.4"}, gObjects);
      hit = el("path", {d, class:"hit-area"}, gObjects);
    } else if (obj.type === "angle"){
      const g = el("g", {class:cls}, gObjects);
      const p1 = polarPoint(obj.cx,obj.cy, obj.rvis||70, obj.angle1);
      const p2 = polarPoint(obj.cx,obj.cy, obj.rvis||70, obj.angle2);
      el("line", {x1:obj.cx,y1:obj.cy,x2:p1.x,y2:p1.y}, g);
      el("line", {x1:obj.cx,y1:obj.cy,x2:p2.x,y2:p2.y}, g);
      const arcD = describeArcPath(obj.cx,obj.cy,26,obj.angle1,obj.angle2);
      el("path", {d:arcD, stroke:"#2f6bff", "stroke-width":"1.6"}, g);
      visible = g;
      hit = el("circle", {cx:obj.cx,cy:obj.cy,r:14, class:"hit-area"}, gObjects);
    }
    if (hit){
      hit.dataset.objId = obj.id;
      hit.addEventListener("pointerdown", onObjectPointerDown);
    }
  });
  renderObjectsList();
  updateMeasurementPanel();
}

function pointsToPath(points){
  if (!points.length) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i=1;i<points.length;i++) d += ` L ${points[i][0]} ${points[i][1]}`;
  return d;
}

function removeObject(id){
  state.objects = state.objects.filter(o => o.id !== id);
  if (state.selectedId === id) state.selectedId = null;
}

function renderAll(){
  renderGeometry();
  renderRuler();
  renderCompass();
  renderProtractor();
}

/* ============================================================
   5. TOOL: SELECT / MOVE
   ============================================================ */
let moveDrag = null; // {id, last:{x,y}}

function onObjectPointerDown(evt){
  const id = evt.currentTarget.dataset.objId;
  if (state.tool === "eraser"){
    pushHistory();
    removeObject(id);
    renderAll();
    return;
  }
  if (state.tool === "select"){
    state.selectedId = id;
    renderAll();
    return;
  }
  if (state.tool === "move"){
    evt.stopPropagation();
    try{ evt.currentTarget.setPointerCapture(evt.pointerId); }catch(e){}
    state.selectedId = id;
    const p = svgPointFromEvent(evt);
    moveDrag = { id, last: p, moved:false };
    window.addEventListener("pointermove", onMoveDragMove);
    window.addEventListener("pointerup", onMoveDragUp);
    renderAll();
  }
}

function translateObject(obj, dx, dy){
  switch(obj.type){
    case "line": obj.x1+=dx; obj.y1+=dy; obj.x2+=dx; obj.y2+=dy; break;
    case "circle": case "arc": obj.cx+=dx; obj.cy+=dy; break;
    case "angle": obj.cx+=dx; obj.cy+=dy; break;
    case "stroke": obj.points = obj.points.map(p=>[p[0]+dx,p[1]+dy]); break;
  }
}

function onMoveDragMove(evt){
  if (!moveDrag) return;
  const p = svgPointFromEvent(evt);
  const dx = p.x - moveDrag.last.x;
  const dy = p.y - moveDrag.last.y;
  if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05){
    const obj = state.objects.find(o=>o.id===moveDrag.id);
    if (obj){ translateObject(obj, dx, dy); moveDrag.moved = true; }
    moveDrag.last = p;
    renderGeometry();
  }
}

function onMoveDragUp(){
  if (moveDrag && moveDrag.moved) pushHistory();
  moveDrag = null;
  window.removeEventListener("pointermove", onMoveDragMove);
  window.removeEventListener("pointerup", onMoveDragUp);
}

// click empty canvas deselects (select tool only)
svg.addEventListener("pointerdown", (evt) => {
  if (evt.target === svg || evt.target.id === "grid-bg"){
    if (state.tool === "select" && state.selectedId){
      state.selectedId = null;
      renderAll();
    }
  }
});

/* ============================================================
   6. TOOL: PENCIL / ERASER
   ============================================================ */
let pencilDrawing = null; // {points, tempEl}

svg.addEventListener("pointerdown", (evt) => {
  if (state.tool !== "pencil") return;
  if (evt.target.closest(".hit-area")) return;
  try{ svg.setPointerCapture(evt.pointerId); }catch(e){}
  const p = svgPointFromEvent(evt);
  pencilDrawing = { points: [[p.x,p.y]] };
  pencilDrawing.tempEl = el("path", {d:pointsToPath(pencilDrawing.points), fill:"none", stroke:"#1f2430", "stroke-width":"2.4", "stroke-linecap":"round"}, gInstr);
  window.addEventListener("pointermove", onPencilMove);
  window.addEventListener("pointerup", onPencilUp);
});

function onPencilMove(evt){
  if (!pencilDrawing) return;
  const p = svgPointFromEvent(evt);
  const last = pencilDrawing.points[pencilDrawing.points.length-1];
  if (dist(last[0],last[1],p.x,p.y) < 1.5) return;
  pencilDrawing.points.push([p.x,p.y]);
  pencilDrawing.tempEl.setAttribute("d", pointsToPath(pencilDrawing.points));
  liveMeasure({ length: fmt(polylineLength(pencilDrawing.points)) });
}

function polylineLength(points){
  let sum = 0;
  for (let i=1;i<points.length;i++) sum += dist(points[i-1][0],points[i-1][1],points[i][0],points[i][1]);
  return sum;
}

function onPencilUp(){
  window.removeEventListener("pointermove", onPencilMove);
  window.removeEventListener("pointerup", onPencilUp);
  if (!pencilDrawing) return;
  if (pencilDrawing.tempEl) pencilDrawing.tempEl.remove();
  if (pencilDrawing.points.length > 1){
    pushHistory();
    const obj = { id: genId("obj"), numId: state.idCounter-1, type:"stroke", points: pencilDrawing.points };
    state.objects.push(obj);
    renderAll();
  }
  pencilDrawing = null;
}

/* ============================================================
   7. INSTRUMENT: RULER
   ============================================================ */
let rulerDrawTemp = null;

function renderRuler(){
  gInstr.querySelectorAll(".ruler-group").forEach(n=>n.remove());
  if (!ruler.visible) return;

  const g = el("g", {class:"instrument ruler-group", transform:`translate(${ruler.x},${ruler.y}) rotate(${ruler.angle})`}, gInstr);
  const W = 34;
  // body
  el("rect", {x:0, y:0, width:ruler.length, height:W, rx:3, class:"part", opacity:"0.55"}, g);
  // tick marks every 10px, labeled every 50
  for (let x=0; x<=ruler.length; x+=10){
    const big = x % 50 === 0;
    el("line", {x1:x, y1:0, x2:x, y2: big?14:8, stroke:"#5c3d17", "stroke-width": big?1.4:0.8}, g);
    if (big){
      el("text", {x:x+2, y:26}, g).textContent = x;
    }
  }
  // move handle
  const moveHandle = el("rect", {x:8, y:W/2-7, width:14, height:14, rx:3, class:"part handle-grip", "data-part":"ruler-move"}, g);
  // rotate/extend handle at far end
  const rot = el("circle", {cx:ruler.length, cy:W/2, r:9, class:"metal drag-hot", "data-part":"ruler-rotate"}, g);
  // draw hot-zone (front edge)
  const drawZone = el("rect", {x:0, y:-10, width:ruler.length, height:10, fill:"transparent", class:"drag-hot", "data-part":"ruler-draw", cursor:"crosshair"}, g);

  [moveHandle, rot, drawZone].forEach(elm => elm.addEventListener("pointerdown", onRulerPointerDown));
}

function onRulerPointerDown(evt){
  if (state.tool !== "ruler") return;
  evt.stopPropagation();
  try{ evt.currentTarget.setPointerCapture(evt.pointerId); }catch(e){}
  const part = evt.currentTarget.dataset.part;
  const p = svgPointFromEvent(evt);
  ruler.dragMode = part;

  if (part === "ruler-move"){
    ruler.drag = { offX: p.x - ruler.x, offY: p.y - ruler.y };
  } else if (part === "ruler-rotate"){
    ruler.drag = {};
  } else if (part === "ruler-draw"){
    const dir = toRad(ruler.angle);
    const dx = Math.cos(dir), dy = Math.sin(dir);
    ruler.drag = { dirx:dx, diry:dy };
    rulerDrawTemp = el("line", {x1:ruler.x, y1:ruler.y, x2:ruler.x, y2:ruler.y, stroke:"#1f2430", "stroke-width":2}, gInstr);
  }
  window.addEventListener("pointermove", onRulerPointerMove);
  window.addEventListener("pointerup", onRulerPointerUp);
}

function onRulerPointerMove(evt){
  const p = svgPointFromEvent(evt);
  if (ruler.dragMode === "ruler-move"){
    ruler.x = p.x - ruler.drag.offX;
    ruler.y = p.y - ruler.drag.offY;
    renderRuler();
  } else if (ruler.dragMode === "ruler-rotate"){
    ruler.angle = angleOf(ruler.x, ruler.y, p.x, p.y);
    ruler.length = Math.min(900, Math.max(100, dist(ruler.x,ruler.y,p.x,p.y)));
    renderRuler();
  } else if (ruler.dragMode === "ruler-draw" && rulerDrawTemp){
    const rel_x = p.x - ruler.x, rel_y = p.y - ruler.y;
    const proj = rel_x*ruler.drag.dirx + rel_y*ruler.drag.diry;
    const len = Math.max(0, Math.min(ruler.length, proj));
    const ex = ruler.x + ruler.drag.dirx*len;
    const ey = ruler.y + ruler.drag.diry*len;
    rulerDrawTemp.setAttribute("x2", ex);
    rulerDrawTemp.setAttribute("y2", ey);
    liveMeasure({ length: fmt(len) });
  }
}

function onRulerPointerUp(evt){
  window.removeEventListener("pointermove", onRulerPointerMove);
  window.removeEventListener("pointerup", onRulerPointerUp);
  if (ruler.dragMode === "ruler-draw" && rulerDrawTemp){
    const x1 = parseFloat(rulerDrawTemp.getAttribute("x1"));
    const y1 = parseFloat(rulerDrawTemp.getAttribute("y1"));
    const x2 = parseFloat(rulerDrawTemp.getAttribute("x2"));
    const y2 = parseFloat(rulerDrawTemp.getAttribute("y2"));
    rulerDrawTemp.remove();
    rulerDrawTemp = null;
    if (dist(x1,y1,x2,y2) > 3){
      pushHistory();
      const obj = { id: genId("obj"), numId: state.idCounter-1, type:"line", x1,y1,x2,y2 };
      state.objects.push(obj);
      renderAll();
    }
  }
  ruler.dragMode = null;
}

/* ============================================================
   8. INSTRUMENT: COMPASS
   ============================================================ */
/** Tapered quad (as a polygon points string) along the line x1,y1 -> x2,y2,
 *  width w1 at the start tapering to w2 at the end — gives legs a real,
 *  slightly machined look instead of a flat stroked line. */
function taperedLegPoints(x1,y1,x2,y2,w1,w2){
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy) || 1;
  const nx=-dy/len, ny=dx/len;
  const a={x:x1+nx*w1/2,y:y1+ny*w1/2};
  const b={x:x2+nx*w2/2,y:y2+ny*w2/2};
  const c={x:x2-nx*w2/2,y:y2-ny*w2/2};
  const d={x:x1-nx*w1/2,y:y1-ny*w1/2};
  return `${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)} ${d.x.toFixed(2)},${d.y.toFixed(2)}`;
}

/** Compute current geometry of every compass part from (cx,cy,radius,rotation). */
function compassGeometry(){
  const hinge  = { x: compass.cx, y: compass.cy - compass.hingeH };
  const handle = { x: hinge.x,    y: hinge.y - compass.handleH };
  const pencilTip = polarPoint(compass.cx, compass.cy, compass.radius, compass.rotation);
  // a short "collar" point just behind the pencil tip, along the leg direction
  const dirx = pencilTip.x - hinge.x, diry = pencilTip.y - hinge.y;
  const dirLen = Math.hypot(dirx,diry) || 1;
  const collar = { x: pencilTip.x - (dirx/dirLen)*16, y: pencilTip.y - (diry/dirLen)*16 };
  // needle point extends a touch beyond the pivot along the needle-leg direction
  const ndx = compass.cx-hinge.x, ndy = compass.cy-hinge.y;
  const nLen = Math.hypot(ndx,ndy) || 1;
  const needleEnd = { x: compass.cx + (ndx/nLen)*9, y: compass.cy + (ndy/nLen)*9 };
  return { hinge, handle, pencilTip, collar, needleEnd };
}

function buildCompass(){
  const g = el("g", {class:"instrument compass-group"}, gInstr);
  const geo = compassGeometry();

  const needleLeg = el("polygon", {class:"compass-leg", points: taperedLegPoints(geo.hinge.x,geo.hinge.y, geo.needleEnd.x,geo.needleEnd.y, 7,2)}, g);
  const pencilLeg  = el("polygon", {class:"compass-leg", points: taperedLegPoints(geo.hinge.x,geo.hinge.y, geo.collar.x,geo.collar.y, 7,4)}, g);
  const handleStem = el("line", {x1:geo.hinge.x,y1:geo.hinge.y,x2:geo.handle.x,y2:geo.handle.y, stroke:"#8a5a2b","stroke-width":4,"stroke-linecap":"round"}, g);
  const hinge = el("circle", {class:"compass-hinge", cx:geo.hinge.x, cy:geo.hinge.y, r:8}, g);
  const screw = el("line", {class:"compass-screw", x1:geo.hinge.x-3.5, y1:geo.hinge.y-3.5, x2:geo.hinge.x+3.5, y2:geo.hinge.y+3.5}, g);
  const needlePoint = el("circle", {class:"compass-needle-point", cx:geo.needleEnd.x, cy:geo.needleEnd.y, r:2.2}, g);
  const pencilCollar = el("rect", {class:"compass-pencil-collar", x:-5, y:-4, width:10, height:8, rx:1.5}, g);
  const pencilPoint = el("circle", {class:"compass-pencil-point", cx:geo.pencilTip.x, cy:geo.pencilTip.y, r:2.6}, g);
  const handleKnob = el("ellipse", {class:"compass-handle-knob handle-grip", cx:geo.handle.x, cy:geo.handle.y, rx:10, ry:8, "data-part":"compass-handle"}, g);
  const grip1 = el("line", {x1:geo.handle.x-5,y1:geo.handle.y-3,x2:geo.handle.x+5,y2:geo.handle.y-3, stroke:"#6b431f","stroke-width":0.8, opacity:0.6}, g);
  const grip2 = el("line", {x1:geo.handle.x-5,y1:geo.handle.y,   x2:geo.handle.x+5,y2:geo.handle.y,   stroke:"#6b431f","stroke-width":0.8, opacity:0.6}, g);
  const grip3 = el("line", {x1:geo.handle.x-5,y1:geo.handle.y+3, x2:geo.handle.x+5,y2:geo.handle.y+3, stroke:"#6b431f","stroke-width":0.8, opacity:0.6}, g);
  const pencilHandle = el("circle", {class:"compass-pencil-hot", cx:geo.pencilTip.x, cy:geo.pencilTip.y, r:12, fill:"transparent", "data-part":"compass-pencil"}, g);
  const sweepArc = el("path", {class:"compass-sweep-arc", d:"", visibility:"hidden"}, g);

  handleKnob.addEventListener("pointerdown", onCompassPointerDown);
  pencilHandle.addEventListener("pointerdown", onCompassPointerDown);

  compass.els = { g, needleLeg, pencilLeg, handleStem, hinge, screw, needlePoint, pencilCollar, pencilPoint, handleKnob, grip1, grip2, grip3, sweepArc };
}

/** Update every part's attributes in place — no DOM rebuild, so dragging stays smooth. */
function updateCompassGeometry(){
  const els = compass.els;
  if (!els) return;
  const geo = compassGeometry();
  const dirx = geo.pencilTip.x-geo.hinge.x, diry = geo.pencilTip.y-geo.hinge.y;
  const ang = toDeg(Math.atan2(diry,dirx));

  els.needleLeg.setAttribute("points", taperedLegPoints(geo.hinge.x,geo.hinge.y, geo.needleEnd.x,geo.needleEnd.y, 7,2));
  els.pencilLeg.setAttribute("points", taperedLegPoints(geo.hinge.x,geo.hinge.y, geo.collar.x,geo.collar.y, 7,4));
  els.handleStem.setAttribute("x1", geo.hinge.x); els.handleStem.setAttribute("y1", geo.hinge.y);
  els.handleStem.setAttribute("x2", geo.handle.x); els.handleStem.setAttribute("y2", geo.handle.y);
  els.hinge.setAttribute("cx", geo.hinge.x); els.hinge.setAttribute("cy", geo.hinge.y);
  els.screw.setAttribute("x1", geo.hinge.x-3.5); els.screw.setAttribute("y1", geo.hinge.y-3.5);
  els.screw.setAttribute("x2", geo.hinge.x+3.5); els.screw.setAttribute("y2", geo.hinge.y+3.5);
  els.needlePoint.setAttribute("cx", geo.needleEnd.x); els.needlePoint.setAttribute("cy", geo.needleEnd.y);
  els.pencilCollar.setAttribute("transform", `translate(${geo.collar.x},${geo.collar.y}) rotate(${ang})`);
  els.pencilPoint.setAttribute("cx", geo.pencilTip.x); els.pencilPoint.setAttribute("cy", geo.pencilTip.y);
  els.handleKnob.setAttribute("cx", geo.handle.x); els.handleKnob.setAttribute("cy", geo.handle.y);
  [[els.grip1,-3],[els.grip2,0],[els.grip3,3]].forEach(([line,off])=>{
    line.setAttribute("x1", geo.handle.x-5); line.setAttribute("y1", geo.handle.y+off);
    line.setAttribute("x2", geo.handle.x+5); line.setAttribute("y2", geo.handle.y+off);
  });
  const pencilHandle = els.g.querySelector('[data-part="compass-pencil"]');
  if (pencilHandle){ pencilHandle.setAttribute("cx", geo.pencilTip.x); pencilHandle.setAttribute("cy", geo.pencilTip.y); }

  if (compass.sweepStart !== null){
    els.sweepArc.setAttribute("d", describeArcPath(compass.cx, compass.cy, compass.radius, compass.sweepStart, compass.rotation));
    els.sweepArc.setAttribute("visibility", "visible");
  } else {
    els.sweepArc.setAttribute("visibility", "hidden");
  }
}

function renderCompass(){
  if (!compass.visible){
    if (compass.els){ compass.els.g.remove(); compass.els = null; }
    return;
  }
  if (!compass.els) buildCompass();
  updateCompassGeometry();
}

function onCompassPointerDown(evt){
  if (state.tool !== "compass") return;
  evt.stopPropagation();
  try{ evt.currentTarget.setPointerCapture(evt.pointerId); }catch(e){}
  const part = evt.currentTarget.dataset.part;
  const p = svgPointFromEvent(evt);
  compass.dragMode = part;
  compass.els.g.classList.add("dragging");

  if (part === "compass-handle"){
    compass._offx = p.x - compass.cx;
    compass._offy = p.y - compass.cy;
  } else if (part === "compass-pencil"){
    compass.sweepStart = compass.rotation;
    compass.sweepAccum = 0;
    compass._lastRot = compass.rotation;
    compass._lastPointer = { x:p.x, y:p.y };
  }
  window.addEventListener("pointermove", onCompassPointerMove);
  window.addEventListener("pointerup", onCompassPointerUp);
}

/* Pencil-tip drag: moving mostly LEFT/RIGHT resizes the opening (radius) without
   drawing; moving mostly UP/DOWN sweeps the leg around the needle and draws the
   arc ("daag"). Direction is re-evaluated every frame, so one continuous drag
   can first set the size, then swing to draw. */
function onCompassPointerMove(evt){
  const p = svgPointFromEvent(evt);
  if (compass.dragMode === "compass-handle"){
    compass.cx = p.x - compass._offx;
    compass.cy = p.y - compass._offy;
    updateCompassGeometry();
    return;
  }
  if (compass.dragMode !== "compass-pencil") return;

  const dx = p.x - compass._lastPointer.x;
  const dy = p.y - compass._lastPointer.y;
  compass._lastPointer = { x:p.x, y:p.y };

  const newRot = angleOf(compass.cx, compass.cy, p.x, p.y);
  const d = angleDelta(compass._lastRot, newRot);
  compass._lastRot = newRot;

  if (Math.abs(dx) > Math.abs(dy)){
    // horizontal → resize the opening, no mark is drawn
    compass.radius = Math.max(20, Math.min(420, compass.radius + dx));
  } else if (Math.abs(dy) > 0){
    // vertical → sweep the pencil leg around the needle, drawing the mark
    compass.rotation = newRot;
    compass.sweepAccum += d;
  }

  updateCompassGeometry();
  const span = Math.abs(compass.sweepAccum);
  liveMeasure({
    radius: fmt(compass.radius),
    angle: fmt(Math.min(span,360),1) + "°",
    arclength: fmt(compass.radius * toRad(Math.min(span,360)))
  });
}

function onCompassPointerUp(){
  window.removeEventListener("pointermove", onCompassPointerMove);
  window.removeEventListener("pointerup", onCompassPointerUp);
  if (compass.els) compass.els.g.classList.remove("dragging");
  if (compass.dragMode === "compass-pencil" && compass.sweepStart !== null){
    const span = Math.abs(compass.sweepAccum);
    if (span >= 355){
      pushHistory();
      state.objects.push({ id: genId("obj"), numId: state.idCounter-1, type:"circle", cx:compass.cx, cy:compass.cy, r:compass.radius });
      renderAll();
    } else if (span >= 8){
      pushHistory();
      state.objects.push({ id: genId("obj"), numId: state.idCounter-1, type:"arc", cx:compass.cx, cy:compass.cy, r:compass.radius, startAngle: compass.sweepStart, endAngle: compass.rotation });
      renderAll();
    }
    compass.sweepStart = null;
    compass.sweepAccum = 0;
    updateCompassGeometry();
  }
  compass.dragMode = null;
}

/* ============================================================
   9. INSTRUMENT: PROTRACTOR
   ============================================================ */
function renderProtractor(){
  gInstr.querySelectorAll(".protractor-group").forEach(n=>n.remove());
  if (!protractor.visible) return;

  const g = el("g", {class:"instrument protractor-group", transform:`translate(${protractor.x},${protractor.y}) rotate(${protractor.rotation})`}, gInstr);
  const R = protractor.radius;

  // half-disc body
  const bodyD = `M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0 Z`;
  el("path", {d:bodyD, class:"part", opacity:"0.5"}, g);
  el("line", {x1:-R, y1:0, x2:R, y2:0, stroke:"#5c3d17", "stroke-width":1.2}, g);

  // degree ticks 0-180 (SVG local angle 180=left .. 0=right, using 180-i mapping)
  for (let i=0; i<=180; i+=10){
    const a = 180 - i; // local angle measured from right, going through top
    const big = i % 30 === 0;
    const p1 = polarPoint(0,0, R, a);
    const p2 = polarPoint(0,0, R-(big?12:7), a);
    el("line", {x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y, stroke:"#5c3d17", "stroke-width": big?1.3:0.8}, g);
    if (big){
      const lp = polarPoint(0,0,R-22,a);
      const t = el("text", {x:lp.x, y:lp.y, "text-anchor":"middle"}, g);
      t.textContent = i;
    }
  }

  // move/rotate handle (base center, drag to move; drag along outer rim to rotate)
  const moveHandle = el("circle", {cx:0, cy:0, r:9, class:"metal drag-hot", "data-part":"pr-move"}, g);
  const rotHandle = el("circle", {cx:R, cy:0, r:8, class:"part drag-hot", "data-part":"pr-rotate"}, g);

  // two ray handles
  const ray1 = polarPoint(0,0,R-4, 180-protractor.angle1);
  const ray2 = polarPoint(0,0,R-4, 180-protractor.angle2);
  el("line", {x1:0,y1:0,x2:ray1.x,y2:ray1.y, stroke:"#2f6bff", "stroke-width":2}, g);
  el("line", {x1:0,y1:0,x2:ray2.x,y2:ray2.y, stroke:"#e5484d", "stroke-width":2}, g);
  const ray1Handle = el("circle", {cx:ray1.x, cy:ray1.y, r:8, fill:"#2f6bff", class:"drag-hot", "data-part":"pr-ray1"}, g);
  const ray2Handle = el("circle", {cx:ray2.x, cy:ray2.y, r:8, fill:"#e5484d", class:"drag-hot", "data-part":"pr-ray2"}, g);

  [moveHandle, rotHandle, ray1Handle, ray2Handle].forEach(elm => elm.addEventListener("pointerdown", onProtractorPointerDown));
}

function onProtractorPointerDown(evt){
  if (state.tool !== "protractor") return;
  evt.stopPropagation();
  try{ evt.currentTarget.setPointerCapture(evt.pointerId); }catch(e){}
  const part = evt.currentTarget.dataset.part;
  const p = svgPointFromEvent(evt);
  protractor.dragMode = part;
  if (part === "pr-move"){
    protractor._offx = p.x - protractor.x;
    protractor._offy = p.y - protractor.y;
  }
  window.addEventListener("pointermove", onProtractorPointerMove);
  window.addEventListener("pointerup", onProtractorPointerUp);
}

function localAngleFromPointer(p){
  // angle relative to protractor's own rotation, mapped into 0..180 (0=right ray becomes 180, left becomes 0)
  const raw = angleOf(protractor.x, protractor.y, p.x, p.y) - protractor.rotation;
  const n = normalizeAngle(raw);
  const mapped = 180 - n; // matches tick placement above
  return Math.max(0, Math.min(180, mapped));
}

function onProtractorPointerMove(evt){
  const p = svgPointFromEvent(evt);
  if (protractor.dragMode === "pr-move"){
    protractor.x = p.x - protractor._offx;
    protractor.y = p.y - protractor._offy;
    renderProtractor();
  } else if (protractor.dragMode === "pr-rotate"){
    protractor.rotation = angleOf(protractor.x, protractor.y, p.x, p.y);
    renderProtractor();
  } else if (protractor.dragMode === "pr-ray1"){
    protractor.angle1 = localAngleFromPointer(p);
    renderProtractor();
    liveMeasure({ angle: fmt(Math.abs(protractor.angle2-protractor.angle1),1)+"°" });
  } else if (protractor.dragMode === "pr-ray2"){
    protractor.angle2 = localAngleFromPointer(p);
    renderProtractor();
    liveMeasure({ angle: fmt(Math.abs(protractor.angle2-protractor.angle1),1)+"°" });
  }
}

function onProtractorPointerUp(){
  window.removeEventListener("pointermove", onProtractorPointerMove);
  window.removeEventListener("pointerup", onProtractorPointerUp);
  if (protractor.dragMode === "pr-ray1" || protractor.dragMode === "pr-ray2"){
    pushHistory();
    // world-space angles = local (mapped back) + protractor.rotation
    const worldA1 = protractor.rotation + (180 - protractor.angle1);
    const worldA2 = protractor.rotation + (180 - protractor.angle2);
    state.objects.push({
      id: genId("obj"), numId: state.idCounter-1, type:"angle",
      cx: protractor.x, cy: protractor.y, rvis:70,
      angle1: worldA1, angle2: worldA2
    });
    renderAll();
  }
  protractor.dragMode = null;
}

/* ============================================================
   10. TOOLBAR / TOP BAR WIRING
   ============================================================ */
function setActiveTool(tool){
  state.tool = tool;
  document.querySelectorAll(".tool-btn[data-tool]").forEach(b=>{
    b.classList.toggle("active", b.dataset.tool === tool);
  });
  svg.classList.toggle("tool-select", tool === "select");
  svg.classList.toggle("tool-move", tool === "move");

  ruler.visible = (tool === "ruler");
  compass.visible = (tool === "compass");
  protractor.visible = (tool === "protractor");

  renderAll();
}

document.querySelectorAll(".tool-btn[data-tool]").forEach(btn=>{
  btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!state.objects.length) return;
  if (!confirm("Clear all geometry from the canvas?")) return;
  pushHistory();
  state.objects = [];
  state.selectedId = null;
  renderAll();
  toast("Canvas cleared");
});

document.getElementById("btn-undo").addEventListener("click", undo);
document.getElementById("btn-redo").addEventListener("click", redo);

window.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey){ e.preventDefault(); undo(); }
  else if (k === "y" || (k === "z" && e.shiftKey)){ e.preventDefault(); redo(); }
});

/* ----- Zoom ----- */
function applyZoom(){
  svg.style.transform = `scale(${state.zoom})`;
  svg.style.transformOrigin = "0 0";
  document.getElementById("zoom-label").textContent = Math.round(state.zoom*100) + "%";
}
document.getElementById("btn-zoom-in").addEventListener("click", () => {
  state.zoom = Math.min(3, Math.round((state.zoom + 0.25)*100)/100);
  applyZoom();
});
document.getElementById("btn-zoom-out").addEventListener("click", () => {
  state.zoom = Math.max(0.25, Math.round((state.zoom - 0.25)*100)/100);
  applyZoom();
});
document.getElementById("btn-zoom-reset").addEventListener("click", () => {
  state.zoom = 1;
  applyZoom();
});

/* ----- New ----- */
document.getElementById("btn-new").addEventListener("click", () => {
  if (state.objects.length && !confirm("Start a new project? Unsaved work will be lost.")) return;
  state.objects = [];
  state.selectedId = null;
  historyStack.length = 0;
  redoStack.length = 0;
  state.zoom = 1; applyZoom();
  ruler.visible = compass.visible = protractor.visible = false;
  setActiveTool("select");
  toast("New project started");
});

/* ============================================================
   11. SAVE / OPEN / EXPORT
   ============================================================ */
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

document.getElementById("btn-save").addEventListener("click", () => {
  const project = {
    format: "virtual-geometry-space",
    version: 1,
    savedAt: new Date().toISOString(),
    settings: { zoom: state.zoom },
    objects: state.objects
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], {type:"application/json"});
  const name = (prompt("File name:", "my-project") || "my-project").replace(/\.mas$/,"");
  downloadBlob(blob, name + ".mas");
  toast("Project saved");
});

document.getElementById("btn-open").addEventListener("click", () => {
  document.getElementById("file-open").click();
});
document.getElementById("file-open").addEventListener("change", (evt) => {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.objects)) throw new Error("Invalid .mas file");
      pushHistory();
      state.objects = data.objects;
      state.selectedId = null;
      state.idCounter = Math.max(1, ...data.objects.map(o=>(o.numId||0)+1), state.idCounter);
      if (data.settings && data.settings.zoom){ state.zoom = data.settings.zoom; applyZoom(); }
      renderAll();
      toast("Project loaded: " + file.name);
    } catch(err){
      alert("Could not open file: " + err.message);
    }
  };
  reader.readAsText(file);
  evt.target.value = "";
});

/* ----- Export ----- */
function buildExportSVGString(){
  const clone = svg.cloneNode(true);
  clone.removeAttribute("style");
  // strip instrument layer (rulers/compass/protractor are not part of final art)
  const instrLayer = clone.querySelector("#layer-instruments");
  if (instrLayer) instrLayer.innerHTML = "";
  // strip selection highlight styling difference (keep geometry only, white background)
  clone.querySelectorAll(".hit-area").forEach(n=>n.remove());
  clone.querySelectorAll(".selected").forEach(n=>n.classList.remove("selected"));
  const bbox = computeExportBBox();
  clone.setAttribute("width", bbox.w);
  clone.setAttribute("height", bbox.h);
  clone.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`);
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("x", bbox.x); bg.setAttribute("y", bbox.y);
  bg.setAttribute("width", bbox.w); bg.setAttribute("height", bbox.h);
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  const gridBg = clone.querySelector("#grid-bg");
  if (gridBg) gridBg.remove();
  return new XMLSerializer().serializeToString(clone);
}

function computeExportBBox(){
  if (!state.objects.length) return {x:0,y:0,w:1400,h:1000};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const consider = (x,y)=>{ minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); };
  state.objects.forEach(o=>{
    if (o.type==="line"){ consider(o.x1,o.y1); consider(o.x2,o.y2); }
    else if (o.type==="circle"){ consider(o.cx-o.r,o.cy-o.r); consider(o.cx+o.r,o.cy+o.r); }
    else if (o.type==="arc"){ consider(o.cx-o.r,o.cy-o.r); consider(o.cx+o.r,o.cy+o.r); }
    else if (o.type==="stroke"){ o.points.forEach(p=>consider(p[0],p[1])); }
    else if (o.type==="angle"){ consider(o.cx-80,o.cy-80); consider(o.cx+80,o.cy+80); }
  });
  const pad = 40;
  return { x: minX-pad, y: minY-pad, w: (maxX-minX)+pad*2, h: (maxY-minY)+pad*2 };
}

function svgStringToCanvas(svgStr, callback){
  const img = new Image();
  const svgBlob = new Blob([svgStr], {type:"image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const bbox = computeExportBBox();
    const scale = 2; // export at 2x for crisper output
    const canvas = document.createElement("canvas");
    canvas.width = bbox.w*scale; canvas.height = bbox.h*scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(url);
    callback(canvas);
  };
  img.onerror = () => { alert("Export failed while rendering image."); URL.revokeObjectURL(url); };
  img.src = url;
}

document.getElementById("btn-export-png").addEventListener("click", () => {
  const svgStr = buildExportSVGString();
  svgStringToCanvas(svgStr, (canvas) => {
    canvas.toBlob(blob => downloadBlob(blob, "geometry-export.png"), "image/png");
  });
});

document.getElementById("btn-export-jpg").addEventListener("click", () => {
  const svgStr = buildExportSVGString();
  svgStringToCanvas(svgStr, (canvas) => {
    canvas.toBlob(blob => downloadBlob(blob, "geometry-export.jpg"), "image/jpeg", 0.95);
  });
});

document.getElementById("btn-export-pdf").addEventListener("click", () => {
  if (!window.jspdf){ alert("PDF library did not load (no internet access?)."); return; }
  const svgStr = buildExportSVGString();
  svgStringToCanvas(svgStr, (canvas) => {
    const { jsPDF } = window.jspdf;
    const orientation = canvas.width >= canvas.height ? "l" : "p";
    const pdf = new jsPDF({ orientation, unit:"pt", format:[canvas.width/2, canvas.height/2] });
    const dataUrl = canvas.toDataURL("image/png");
    pdf.addImage(dataUrl, "PNG", 0, 0, canvas.width/2, canvas.height/2);
    pdf.save("geometry-export.pdf");
  });
});

/* ============================================================
   12. TOAST + INIT
   ============================================================ */
let toastTimer = null;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("show"), 1600);
}

function init(){
  applyZoom();
  setActiveTool("select");
  renderAll();
}
init();

})();
