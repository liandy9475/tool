// ==========================================
// MODE 2: IMAGE BURST (FINAL CROP FIX)
// ==========================================

let m2_pg; 
let m2_pickingBuffer; 
let m2_nodes = [];

// Base distance we use for calculations
const M2_BASE_DIST = 2200; 

let m2_userScale = 1.0; 
let m2_userSpacing = 1.0; 
let m2_layoutSeed = 1234; 
let m2_dragNode = null;
let m2_lastMouseX = 0; let m2_lastMouseY = 0;

let m2_triggerFrame = -10000; 
let m2_imageBurstStartFrame = -10000; 

// CONFIGURATION
const M2_ACTIVE_DELAY = 30; 
const M2_ACTIVE_MOVE = 18;       
const M2_ACTIVE_STAGGER = 3.5;   
const M2_ACTIVE_IMPLODE = 8;

const M2_PREVIEW_DELAY = 1; 
const M2_PREVIEW_MOVE = 12;      
const M2_PREVIEW_STAGGER = 1.5;  
const M2_PREVIEW_IMPLODE = 6;

const M2_MAX_DRIFT_DIST = 550;           
const M2_EXPANSION_BUFFER = 120;      
const M2_START_Z_DEPTH = -200;           
const M2_FIT_MARGIN_W = 0.96; 

function triggerMode2Burst(isPreview = false) {
    m2_triggerFrame = frameCount;
    let delay = isPreview ? M2_PREVIEW_DELAY : M2_ACTIVE_DELAY;
    m2_imageBurstStartFrame = m2_triggerFrame + delay;
}

function getMode2TotalFrames(isPreview = false) {
    let stagger = isPreview ? M2_PREVIEW_STAGGER : M2_ACTIVE_STAGGER;
    let move = isPreview ? M2_PREVIEW_MOVE : M2_ACTIVE_MOVE;
    let implode = isPreview ? M2_PREVIEW_IMPLODE : M2_ACTIVE_IMPLODE;
    
    let lastItemArrival = ((m2_nodes.length - 1) * stagger) + move;
    return (isPreview ? M2_PREVIEW_DELAY : M2_ACTIVE_DELAY) + lastItemArrival + M2_EXPANSION_BUFFER + implode + 20; 
}

function setMode2Scale(s) { m2_userScale = s; }
function setMode2Spacing(val) { m2_userSpacing = map(val, 0, 100, 0.2, 2.5); }

function checkMode2Loop(isPreview = false) {
    if (mouseIsPressed) return; 
    let cycleEnd = getMode2TotalFrames(isPreview);
    let rawTime = frameCount - m2_triggerFrame;
    if (rawTime > cycleEnd) { triggerMode2Burst(isPreview); }
}

function setupMode2() {
  if (!m2_pg) {
    m2_pg = createGraphics(width, height, WEBGL);
    m2_pg.noStroke(); m2_pg.pixelDensity(1);
    m2_pickingBuffer = createGraphics(width, height, WEBGL);
    m2_pickingBuffer.pixelDensity(1); m2_pickingBuffer.noStroke();
    m2_layoutSeed = floor(random(99999));
  }
}
function shuffleMode2() { m2_layoutSeed = floor(random(99999)); rebuildMode2Nodes(); triggerMode2Burst(); }

function runMode2(drawToScreen = true) {
  if (!m2_pg) setupMode2();
  
  let isPreview = !drawToScreen;

  if (m2_nodes.length === 0 && typeof uploadedImages !== 'undefined' && uploadedImages.length > 0) {
    rebuildMode2Nodes(); 
    triggerMode2Burst(isPreview);
  }

  let recordingSafe = (typeof isRecording !== 'undefined' && isRecording);
  let isActive = drawToScreen ? (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) : true;
  
  if (isActive && !recordingSafe) {
      m2_triggerFrame++;
      m2_imageBurstStartFrame++;
  }

  renderMode2Scene(m2_pg, m2_pg.width, m2_pg.height, 1.0, false, isPreview); 
  
  if (drawToScreen) {
      clear();
      image(m2_pg, 0, 0);
      
      if(m2_dragNode) cursor('grabbing');
      else if(isActive) cursor('grab');

      if (!recordingSafe) { checkMode2Loop(false); }
  } else {
      checkMode2Loop(true);
  }
}

function mode2_mousePressed() {
    if (m2_pickingBuffer) {
        if(m2_pickingBuffer.width !== width || m2_pickingBuffer.height !== height){
            m2_pickingBuffer.resizeCanvas(width, height);
        }
        renderMode2Scene(m2_pickingBuffer, width, height, 1.0, true, false); 
        let c = m2_pickingBuffer.get(mouseX, mouseY);
        let id = c[0]; 
        if (id > 0 && c[3] > 0) {
            let foundNode = m2_nodes.find(n => n.pickingId === id);
            if (foundNode) m2_dragNode = foundNode;
        }
    }
    m2_lastMouseX = mouseX; m2_lastMouseY = mouseY;
}

function mode2_mouseDragged() {
    let dx = mouseX - m2_lastMouseX; 
    let dy = mouseY - m2_lastMouseY;

    if (m2_dragNode) {
        let aspect = width / height;
        let dynamicDist = M2_BASE_DIST;
        if (aspect < 1.0) {
             dynamicDist = (M2_BASE_DIST / aspect) * 1.2; 
        }

        let fov = PI / 3.0; 
        let objZ = m2_dragNode.currentZ || 0;
        let distToCam = dynamicDist - objZ;
        
        let visibleHeightAtDepth = 2 * distToCam * 0.57735;
        let unitsPerPixel = visibleHeightAtDepth / height;

        let safeSpacing = (m2_userSpacing < 0.5) ? 0.5 : m2_userSpacing;
        let safeScale = (m2_userScale < 0.5) ? 0.5 : m2_userScale;
        
        m2_dragNode.targetPos.x += (dx * unitsPerPixel) / (safeSpacing * safeScale);
        m2_dragNode.targetPos.y += (dy * unitsPerPixel) / (safeSpacing * safeScale);
    } 
    m2_lastMouseX = mouseX; m2_lastMouseY = mouseY;
}

function mode2_mouseReleased() { m2_dragNode = null; }

function renderMode2Scene(pg, w, h, s, isPicking, isPreview) { 
  if (isPicking) { pg.background(0); pg.noLights(); } 
  else { pg.background('#F7F5F3'); }

  let gl = pg.drawingContext; gl.disable(gl.DEPTH_TEST); 
  
  let fov = PI / 3.0;
  let aspect = w / h;
  let dynamicDist = M2_BASE_DIST;
  
  if (aspect < 1.0) {
      dynamicDist = (M2_BASE_DIST / aspect) * 1.2; 
  }
  
  pg.perspective(fov, aspect, 0.1, 50000); 
  pg.push();
  pg.camera(0, 0, dynamicDist, 0, 0, 0, 0, 1, 0); 

  let MOVE_DUR = isPreview ? M2_PREVIEW_MOVE : M2_ACTIVE_MOVE;
  let STAGGER = isPreview ? M2_PREVIEW_STAGGER : M2_ACTIVE_STAGGER;
  let IMPLODE_DUR = isPreview ? M2_PREVIEW_IMPLODE : M2_ACTIVE_IMPLODE;

  let lastItemArrival = ((m2_nodes.length - 1) * STAGGER) + MOVE_DUR;
  let startImplodeFrame = lastItemArrival + M2_EXPANSION_BUFFER;
  let rawTime = frameCount - m2_imageBurstStartFrame;
  let isPreviewMode = (m2_triggerFrame < 0);
  let isReversing = !isPreviewMode && (rawTime > startImplodeFrame);
  let driftOffset = 0;

  // Heavy Quartic drift momentum
  if (!isReversing) {
      let driftProgress = constrain(Math.max(0, rawTime - 5) / (lastItemArrival + M2_EXPANSION_BUFFER), 0, 1);
      let driftEase = m2_easeOutQuart(driftProgress);
      driftOffset = driftEase * M2_MAX_DRIFT_DIST;
  } else {
      let timeSinceTrigger = rawTime - startImplodeFrame;
      let progress = constrain(timeSinceTrigger / IMPLODE_DUR, 0, 1);
      
      let easedProgress = m2_easeInCubic(progress);
      let t = 1 - easedProgress; 
      
      let totalDriftPossibleTime = startImplodeFrame - MOVE_DUR;
      let maxDriftProgress = constrain(totalDriftPossibleTime / (lastItemArrival + M2_EXPANSION_BUFFER), 0, 1);
      let maxDriftEase = m2_easeOutQuart(maxDriftProgress);
      let frozenDriftVal = maxDriftEase * M2_MAX_DRIFT_DIST;
      driftOffset = frozenDriftVal * t; 
  }

  for (let i = 0; i < m2_nodes.length; i++) {
    let n = m2_nodes[i];
    let t = 0; 
    let staggerDelay = i * STAGGER;
    
    if (!isReversing) {
        let activeTime = rawTime - staggerDelay;
        if (activeTime < 0) continue; 
        t = constrain(activeTime / MOVE_DUR, 0, 1);
    } else {
        let timeSinceTrigger = rawTime - startImplodeFrame;
        let progress = constrain(timeSinceTrigger / IMPLODE_DUR, 0, 1);
        let easedProgress = m2_easeInCubic(progress);
        t = 1 - easedProgress; 
    }
    if (t <= 0 && isReversing) continue;

    pg.push();
    
    let ease = isReversing ? t : m2_easeOutExpo(t);
    
    let curX = n.targetPos.x * s * m2_userSpacing; 
    let curY = n.targetPos.y * s * m2_userSpacing;
    let stackedStart = M2_START_Z_DEPTH + (i * 20); 
    let snapZ = lerp(stackedStart, n.targetPos.z * s, ease);
    
    let depthParallax = 1.0 + (i * 0.02); 
    let curZ = snapZ + (driftOffset * depthParallax);
    
    n.currentZ = curZ; 
    
    pg.translate(curX, curY, curZ);
    
    // UPDATED: Scale now pops from 75% to 100%
    let popScale = lerp(0.75, 1.0, ease);
    let finalW = n.w * s * m2_userScale * popScale;
    let finalH = n.h * s * m2_userScale * popScale;
    
    if (isPicking) { pg.fill(n.pickingId, 0, 0); pg.noStroke(); pg.rect(-finalW/2, -finalH/2, finalW, finalH); } 
    else { pg.texture(n.img); pg.noStroke(); pg.rect(-finalW/2, -finalH/2, finalW, finalH); }
    pg.pop();
  }
  pg.pop(); 
}

function rebuildMode2Nodes() {
  m2_nodes = [];
  if (typeof uploadedImages === 'undefined' || uploadedImages.length === 0) return;
  randomSeed(m2_layoutSeed);
  let sourceImages = [...uploadedImages];
  for (let i = sourceImages.length - 1; i > 0; i--) { const j = floor(random(i + 1)); [sourceImages[i], sourceImages[j]] = [sourceImages[j], sourceImages[i]]; }
  
  const visibleHeightAtZero = 2 * M2_BASE_DIST * 0.57735; 
  
  let boundaryX = visibleHeightAtZero * 0.45; 
  let boundaryY = visibleHeightAtZero * 0.45; 
  
  let deadLimit = (visibleHeightAtZero * 0.15 / 2) + 30; 
  let padding = 15; 
  
  let candidates = [];
  
  for (let i = 0; i < sourceImages.length; i++) {
      let img = sourceImages[i]; 
      let ratio = img.width / img.height;
      let w, h, isHero = false;

      if (i === 0) {
          isHero = true;
          let baseSize = visibleHeightAtZero * 0.50; 
          if (ratio >= 1) { w = baseSize; h = w / ratio; } else { h = baseSize; w = h * ratio; }
      } 
      else if (i <= 3) {
          let baseSize = visibleHeightAtZero * 0.30; 
          if (ratio >= 1) { w = baseSize; h = w / ratio; } else { h = baseSize; w = h * ratio; }
      }
      else {
          let baseSize = visibleHeightAtZero * 0.15; 
          if (ratio >= 1) { w = baseSize; h = w / ratio; } else { h = baseSize; w = h * ratio; }
      }
      
      candidates.push({ img, w, h, ratio, area: w * h, isHero, id: i });
  }
  
  candidates.sort((a, b) => b.area - a.area);
  
  let placedNodes = [];
  for (let cand of candidates) {
      if (cand.isHero) {
          placedNodes.push({ 
              img: cand.img, w: cand.w, h: cand.h, x: 0, y: 0, 
              targetPos: createVector(0, 0, 0), pickingId: placedNodes.length + 1 
          });
          continue;
      }
      
      let placed = false; let currentScale = 1.0;
      while (!placed && currentScale > 0.1) {
          let w = cand.w * currentScale; let h = cand.h * currentScale; let maxAttempts = 150; 
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
              let safeRx = Math.max(0, boundaryX - (w/2) - padding);
              let spreadFactor = 0.9; 
              let rx = random(-safeRx * spreadFactor, safeRx * spreadFactor);
              
              let validYMax_Top = -deadLimit - (h/2) - padding; let validYMin_Top = -boundaryY + (h/2) + padding;                      
              let validYMin_Bottom = deadLimit + (h/2) + padding; let validYMax_Bottom = boundaryY - (h/2) - padding;                    
              let validTop = (validYMax_Top > validYMin_Top); let validBottom = (validYMax_Bottom > validYMin_Bottom);
              if (!validTop && !validBottom) break; 
              let tryTop; let topCount = placedNodes.filter(n => n.targetPos.y < 0).length; let bottomCount = placedNodes.filter(n => n.targetPos.y > 0).length;
              if (topCount < bottomCount) tryTop = true; else if (bottomCount < topCount) tryTop = false; else tryTop = (random() > 0.5);
              if (tryTop && !validTop) tryTop = false; if (!tryTop && !validBottom) tryTop = true;
              let ry;
              if (tryTop) { let t = random(); ry = lerp(validYMin_Top, validYMax_Top, t); } 
              else { let t = random(); ry = lerp(validYMax_Bottom, validYMin_Bottom, t); }
              let isInvalid = false;
              for (let other of placedNodes) {
                  let distX = Math.abs(rx - other.x); let distY = Math.abs(ry - other.y);
                  let minDistX = (w/2) + (other.w/2) + padding; let minDistY = (h/2) + (other.h/2) + padding;
                  if (distX < minDistX && distY < minDistY) { isInvalid = true; break; }
              }
              if (!isInvalid) { placedNodes.push({ img: cand.img, w: w, h: h, x: rx, y: ry, targetPos: createVector(rx, ry, 0), pickingId: placedNodes.length + 1 }); placed = true; break; }
          }
          if (!placed) currentScale -= 0.1; 
      }
      if (!placed) {
          let fallbackScale = 0.5; let w = cand.w * fallbackScale; let h = cand.h * fallbackScale;
          let rx = random(-boundaryX*0.8, boundaryX*0.8); let ry = random(-boundaryY*0.8, boundaryY*0.8);
          placedNodes.push({ img: cand.img, w: w, h: h, x: rx, y: ry, targetPos: createVector(rx, ry, 0), pickingId: placedNodes.length + 1 });
      }
  }
  m2_nodes = placedNodes;
  let zSpacing = 60; let startZ = -(m2_nodes.length * zSpacing / 2);
  for(let i = 0; i < m2_nodes.length; i++) m2_nodes[i].targetPos.z = startZ + (i * zSpacing);
}

// EASING HELPERS
function m2_easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function m2_easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
function m2_easeInCubic(t) { return t * t * t; }