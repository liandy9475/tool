// ==========================================
// MODE 4: FISHEYE GRID (FAST LOOP / INSTANT RESTART)
// ==========================================

// --- CONFIGURATION ---
const M4_ANIMATION_DURATION = 75;     // Quicker animation duration (was 50, then 35, now 75 for slower ease)
const M4_POP_DELAY = 2;               // Increased to 2 for better pacing with the slower animation
const M4_POP_INTENSITY = 0.25;        // Increased for more "drift" distance (was 0.1)

// CHANGE: Reduced from 60 to 5. 
// This eliminates the "empty screen" wait at the start and end.
const M4_START_DELAY = 30;            

// CHANGE: Keep hold short (30 frames = 0.5s)
const M4_HOLD_DURATION = 50; 

// Dynamic timings
let m4_T_SNAP_DURATION = 120; 
let m4_TIME_SEQUENCE_END = 0; 
const M4_MAX_DISTORTION = 0.12; 

// --- STATE ---
let m4_gap = 10; 
let m4_seqTimer = 0;
let m4_camScale = 3.0; // Slight increase for more camera drift (was 2.75)
let m4_currentDistortion = 0; 
let m4_activeImages = [];
let m4_sourceLibrary = []; 
let m4_nextSourceIndex = 0; 
let m4_safeZone = { x:0, y:0, w:0, h:0 };
let m4_rectLimit = { w:0, h:0 }; 
let m4_baseAreaPerImage = 0;
let m4_gridUnit = 0; 
let m4_centerX = 0;
let m4_centerY = 0;
let m4_gridOriginX = 0;
let m4_gridOriginY = 0;

const M4_START_SCALE = 3.0; // Slight increase for more camera drift (was 2.75)
const M4_SNAP_SCALE = 1.7; 

// --- BUFFERS ---
let m4_pg;          
let m4_fxLayer;     
let m4_fisheyeShader;

// --- SHADERS ---
const m4_vertShader = `
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;
  void main() {
    vTexCoord = aTexCoord;
    vec4 positionVec4 = vec4(aPosition, 1.0);
    positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
    gl_Position = positionVec4;
  }
`;

const m4_fragShader = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D tex0;
  uniform float uStrength; 

  void main() {
    vec2 uv = vTexCoord;
    uv.y = 1.0 - uv.y; 
    vec2 center = vec2(0.5, 0.5);
    vec2 d = uv - center;
    float r2 = dot(d, d); 
    float f = 1.0 + r2 * (uStrength * 2.0); 
    vec2 newUV = center + d / f; 
    if(newUV.x < 0.0 || newUV.x > 1.0 || newUV.y < 0.0 || newUV.y > 1.0){
       // Strict Background Match: #F7F5F3
       gl_FragColor = vec4(0.968, 0.960, 0.952, 1.0); 
    } else {
       gl_FragColor = texture2D(tex0, newUV);
    }
  }
`;

// ==========================================
// SETUP & LIFECYCLE
// ==========================================

function setupMode4() {
    m4_pg = createGraphics(windowWidth, windowHeight);
    m4_pg.pixelDensity(1); 
    
    m4_fxLayer = createGraphics(windowWidth, windowHeight, WEBGL);
    m4_fxLayer.pixelDensity(1); 
    
    m4_fisheyeShader = m4_fxLayer.createShader(m4_vertShader, m4_fragShader);
    
    m4_calculateDimensions(windowWidth, windowHeight);
}

function m4_calculateDimensions(w, h) {
    m4_centerX = w / 2;
    m4_centerY = h / 2;
    
    m4_gap = Math.max(2, Math.min(25, Math.floor(w * 0.015)));

    let totalArea = w * h;
    m4_baseAreaPerImage = totalArea / 15; 
    
    m4_gridUnit = (Math.sqrt(m4_baseAreaPerImage) / 2.5) - m4_gap;
    if (m4_gridUnit < 10) m4_gridUnit = 10; 
    
    m4_rectLimit = { w: w * 1.5, h: h * 1.5 };
    m4_safeZone = { x: m4_centerX, y: m4_centerY, w: 0, h: 0 };
    m4_gridOriginX = m4_centerX - m4_gridUnit/2;
    m4_gridOriginY = m4_centerY - m4_gridUnit/2;
}

function resetMode4Timer() {
    m4_seqTimer = 0;
}

function getMode4TotalFrames() {
    const TIME_INTRO_END = M4_START_DELAY + m4_T_SNAP_DURATION;
    const TIME_HOLD_END  = TIME_INTRO_END + M4_HOLD_DURATION;
    
    // CHANGE: The loop ends exactly when the reverse animation finishes.
    // No extra delay added.
    const TIME_REVERSE_END = TIME_HOLD_END + m4_T_SNAP_DURATION; 
    
    return TIME_REVERSE_END; 
}

// ==========================================
// RENDER LOOP
// ==========================================

function runMode4(isFullMode) {
    if (!m4_pg || !m4_fxLayer) return;

    let w = isFullMode ? width : m4_pg.width;
    let h = isFullMode ? height : m4_pg.height;

    if (m4_pg.width !== w || m4_pg.height !== h) {
        m4_pg.resizeCanvas(w, h);
        m4_fxLayer.resizeCanvas(w, h);
    }

    m4_pg.background(247, 245, 243); 
    
    // --- LOOPING LOGIC ---
    let realSeqTime = 0;
    const TOTAL_CYCLE = getMode4TotalFrames(); 

    if (isRecording) {
         realSeqTime = frameCount - recordingStartFrame;
    } else {
         if (!isFullMode) {
             realSeqTime = frameCount % TOTAL_CYCLE;
         } else {
             if (m4_activeImages.length > 0) m4_seqTimer++;
             if (m4_seqTimer >= TOTAL_CYCLE) m4_seqTimer = 0;
             realSeqTime = m4_seqTimer;
         }
    }

    const TIME_INTRO_END = M4_START_DELAY + m4_T_SNAP_DURATION;
    const TIME_HOLD_END  = TIME_INTRO_END + M4_HOLD_DURATION;
    
    let effectiveTime = 0;
    if (realSeqTime <= TIME_INTRO_END) {
        effectiveTime = realSeqTime;
    } 
    else if (realSeqTime <= TIME_HOLD_END) {
        effectiveTime = TIME_INTRO_END;
    } 
    else {
        let timePassedInReverse = realSeqTime - TIME_HOLD_END;
        effectiveTime = TIME_INTRO_END - timePassedInReverse;
        if (effectiveTime < 0) effectiveTime = 0;
    }

    // --- ANIMATION ---
    // 30% of the original maximum distortion scale (0.24 * 0.3)
    const TARGET_DISTORTION = 0.072; 

    if (effectiveTime < M4_START_DELAY) {
        m4_camScale = M4_START_SCALE; 
        m4_currentDistortion = 0; // Starts with absolutely 0 distortion
    }
    else if (effectiveTime <= TIME_INTRO_END) {
        let p = (effectiveTime - M4_START_DELAY) / m4_T_SNAP_DURATION;
        p = constrain(p, 0, 1);
        let t = easeOutExpo(p); // Swapped to Exponential Ease-Out
        m4_camScale = lerp(M4_START_SCALE, M4_SNAP_SCALE, t);
        
        // Dynamically scales from 0 to 30% as the camera zooms out
        m4_currentDistortion = lerp(0, TARGET_DISTORTION, t); 
    }

    // --- DRAW ---
    m4_pg.push();
    m4_pg.translate(w/2, h/2);
    m4_pg.scale(m4_camScale);
    m4_pg.translate(-w/2, -h/2);

    for (let item of m4_activeImages) {
        item.update(effectiveTime);
        item.display(m4_pg);
    }
    m4_pg.pop(); 

    // --- POST PROCESS ---
    m4_fxLayer.shader(m4_fisheyeShader);
    m4_fisheyeShader.setUniform('tex0', m4_pg);
    m4_fisheyeShader.setUniform('uStrength', m4_currentDistortion);
    m4_fxLayer.rect(0, 0, w, h); 

    if (isFullMode) {
        clear();
        image(m4_fxLayer, 0, 0, width, height);
    }
}

// ==========================================
// LAYOUT GENERATION (ULTRA LIGHT)
// ==========================================

function rebuildMode4Layout() {
    if (uploadedImages.length === 0) {
        m4_sourceLibrary = []; 
    } else {
        m4_sourceLibrary = [...uploadedImages]; 
        m4_shuffleArray(m4_sourceLibrary);
    }

    let w = m4_pg ? m4_pg.width : width;
    let h = m4_pg ? m4_pg.height : height;
    m4_calculateDimensions(w, h);

    randomSeed(Math.random() * 1000); 
    m4_activeImages = [];
    m4_nextSourceIndex = 0;
    
    if(m4_gridUnit <= 0) m4_gridUnit = 50;

    // --- OPTIMIZATION 1: CAP IMAGES ---
    let areaToFill = m4_rectLimit.w * m4_rectLimit.h;
    let approxImages = Math.ceil(areaToFill / (m4_gridUnit*m4_gridUnit));
    if (approxImages > 20) approxImages = 20; 

    // Center Image
    if (m4_sourceLibrary.length > 0) {
        let centerImg = m4_sourceLibrary[m4_nextSourceIndex % m4_sourceLibrary.length];
        m4_nextSourceIndex++;
        let imgAsp = centerImg.width / centerImg.height;
        let bestOddFit = { c: 1, r: 1, diff: Infinity };
        const oddModules = [[3,3], [5,5], [3,1], [1,3], [1,1]];
        for (let [c, r] of oddModules) {
            let physW = (c * m4_gridUnit) + ((c-1) * m4_gap);
            let physH = (r * m4_gridUnit) + ((r-1) * m4_gap);
            let physAsp = physW / physH;
            let diff = Math.abs(Math.log(physAsp / imgAsp));
            if (diff < bestOddFit.diff) bestOddFit = { c: c, r: r, diff: diff };
        }
        let c = bestOddFit.c; let r = bestOddFit.r;
        let wBox = (c * m4_gridUnit) + ((c - 1) * m4_gap);
        let hBox = (r * m4_gridUnit) + ((r - 1) * m4_gap);
        let offX = -Math.floor(c/2); let offY = -Math.floor(r/2);
        let step = m4_gridUnit + m4_gap;
        let x = m4_gridOriginX + (offX * step);
        let y = m4_gridOriginY + (offY * step);
        let newItem = new M4GridItem(centerImg, x, y, wBox, hBox, 1.2); 
        m4_activeImages.push(newItem);
    }

    // --- OPTIMIZATION 2: REDUCE ATTEMPTS ---
    let maxAttempts = 5; 
    let currentAttempts = 0;
    let loopSafety = 0;
    
    while(m4_activeImages.length < approxImages && currentAttempts < maxAttempts) {
        loopSafety++;
        if(loopSafety > 100) break; 

        if (m4_sourceLibrary.length > 0) {
            let nextImg = m4_sourceLibrary[m4_nextSourceIndex % m4_sourceLibrary.length];
            m4_nextSourceIndex++;
            let r = random();
            let sizePersonality = 1.0;
            if(r < 0.2) sizePersonality = 1.8; 
            else if(r < 0.65) sizePersonality = 1.0; 
            else sizePersonality = 0.6; 
            
            let success = m4_placeImageGapFiller(nextImg, sizePersonality);
            if (!success) currentAttempts++; else currentAttempts = 0;
        } else { break; }
    }

    // Spiral Sort
    const SPIRAL_PITCH = m4_gridUnit * 6; 
    m4_activeImages.sort((a, b) => {
        let centerAX = a.targetX + a.w/2;
        let centerAY = a.targetY + a.h/2;
        let dA = dist(centerAX, centerAY, m4_centerX, m4_centerY);
        let angA = Math.atan2(centerAY - m4_centerY, centerAX - m4_centerX);
        if (angA < 0) angA += TWO_PI; 
        let centerBX = b.targetX + b.w/2;
        let centerBY = b.targetY + b.h/2;
        let dB = dist(centerBX, centerBY, m4_centerX, m4_centerY);
        let angB = Math.atan2(centerBY - m4_centerY, centerBX - m4_centerX);
        if (angB < 0) angB += TWO_PI;
        let scoreA = dA + ((angA / TWO_PI) * SPIRAL_PITCH);
        let scoreB = dB + ((angB / TWO_PI) * SPIRAL_PITCH);
        return scoreA - scoreB;
    });

    let visibleW = w / 1.5; 
    let visibleH = h / 1.5;
    let viewX = m4_centerX - visibleW/2;
    let viewY = m4_centerY - visibleH/2;
    let animatedCount = 0;

    for (let i = 0; i < m4_activeImages.length; i++) {
        let item = m4_activeImages[i];
        let isVisible = m4_checkRectOverlap(item.targetX, item.targetY, item.w, item.h, viewX, viewY, visibleW, visibleH, 0);
        if (isVisible) {
            item.startTime = M4_START_DELAY + (animatedCount * M4_POP_DELAY); 
            animatedCount++;
        } else { item.startTime = -100; }
    }
    
    m4_T_SNAP_DURATION = ((animatedCount - 1) * M4_POP_DELAY) + M4_ANIMATION_DURATION + 10; 
    m4_seqTimer = 0; 
}

// ==========================================
// GRID LOGIC HELPER
// ==========================================

function m4_placeImageGapFiller(img, sizePref, existingItem = null) {
  let imgAspect = img.width / img.height;
  let currentPref = existingItem ? existingItem.sizeMult : sizePref;
  
  let bestFit = null;
  let bestScore = Infinity; 
  const primaryModules = [[2,2], [3,3], [4,4], [2,3], [3,2], [4,3], [3,4], [5,5], [2,2], [1,1]];
  
  let validModules = primaryModules.filter(([c, r]) => {
      let physW = (c * m4_gridUnit) + ((c-1) * m4_gap);
      let physH = (r * m4_gridUnit) + ((r-1) * m4_gap);
      let physAspect = physW / physH;
      let difference = Math.abs(Math.log(physAspect / imgAspect));
      let threshold = (c === r) ? 1.25 : 0.7; 
      return difference < threshold; 
  });
  if (validModules.length === 0) validModules = primaryModules;
  
  let attempts = validModules.slice(0, 8); 
  for (let [cols, rows] of attempts) {
    let w = (cols * m4_gridUnit) + ((cols - 1) * m4_gap);
    let h = (rows * m4_gridUnit) + ((rows - 1) * m4_gap);
    let spot = m4_findClosestGridSpot(w, h); 
    if (spot) {
      let d = dist(spot.x + w/2, spot.y + h/2, m4_centerX, m4_centerY);
      if (m4_activeImages.length > 0) {
          let lastItem = m4_activeImages[m4_activeImages.length - 1];
          let currentIsSquare = (cols === rows);
          let lastWasSquare = (Math.abs(lastItem.w - lastItem.h) < 5); 
          if (lastWasSquare && currentIsSquare) d += 60; 
      }
      if (d < bestScore) {
        bestScore = d;
        bestFit = { x: spot.x, y: spot.y, w: w, h: h, mult: currentPref };
      }
    }
  }

  if (!bestFit) {
      let w = m4_gridUnit;
      let h = m4_gridUnit;
      let spot = m4_findClosestGridSpot(w, h); 
      if (spot) bestFit = { x: spot.x, y: spot.y, w: w, h: h, mult: currentPref * 0.5 }; 
  }

  if (bestFit) {
      if (existingItem) {
        existingItem.w = bestFit.w;
        existingItem.h = bestFit.h;
        existingItem.sizeMult = bestFit.mult;
        existingItem.setTarget(bestFit.x, bestFit.y);
        m4_activeImages.push(existingItem);
      } else {
        let newItem = new M4GridItem(img, bestFit.x, bestFit.y, bestFit.w, bestFit.h, bestFit.mult);
        m4_activeImages.push(newItem);
      }
      return true;
  }
  return false;
}

function m4_findClosestGridSpot(w, h) {
  let step = m4_gridUnit + m4_gap;
  
  // --- OPTIMIZATION 3: SEARCH RADIUS ---
  let searchRange = 6 + Math.ceil(Math.sqrt(m4_activeImages.length)); 
  if (searchRange > 12) searchRange = 12; 

  for (let r = 0; r <= searchRange; r++) {
    let candidates = [];
    for (let i = -r; i <= r; i++) {
        candidates.push({ i: i, j: -r });
        candidates.push({ i: i, j: r });
    }
    for (let j = -r + 1; j < r; j++) {
        candidates.push({ i: -r, j: j });
        candidates.push({ i: r, j: j });
    }
    
    candidates.sort((a,b) => {
        let pA = { x: m4_gridOriginX + (a.i * step), y: m4_gridOriginY + (a.j * step) };
        let pB = { x: m4_gridOriginX + (b.i * step), y: m4_gridOriginY + (b.j * step) };
        return dist(pA.x, pA.y, m4_centerX, m4_centerY) - dist(pB.x, pB.y, m4_centerX, m4_centerY);
    });
    
    for (let c of candidates) {
        let px = m4_gridOriginX + (c.i * step);
        let py = m4_gridOriginY + (c.j * step);
        if (m4_isValidPosition(px, py, w, h)) return { x: px, y: py };
    }
  }
  return null;
}

function m4_isValidPosition(x, y, w, h) {
  const buffer = m4_gap - 2;
  if (x < m4_centerX - m4_rectLimit.w/2 || x + w > m4_centerX + m4_rectLimit.w/2) return false;
  if (y < m4_centerY - m4_rectLimit.h/2 || y + h > m4_centerY + m4_rectLimit.h/2) return false;
  
  if (m4_checkRectOverlap(x, y, w, h, m4_safeZone.x, m4_safeZone.y, m4_safeZone.w, m4_safeZone.h, buffer)) return false;
  
  for (let other of m4_activeImages) {
    if (m4_checkRectOverlap(x, y, w, h, other.targetX, other.targetY, other.w, other.h, buffer)) return false;
  }
  return true;
}

function m4_checkRectOverlap(x1, y1, w1, h1, x2, y2, w2, h2, gap) {
  return (x1 < x2 + w2 + gap && x1 + w1 + gap > x2 && y1 < y2 + h2 + gap && y1 + h1 + gap > y2);
}

// ==========================================
// CLASSES & UTILS
// ==========================================

class M4GridItem {
  constructor(img, x, y, w, h, sizeMult) {
    this.img = img;
    this.w = w; this.h = h;
    this.sizeMult = sizeMult;
    this.targetX = x; 
    this.targetY = y;
    this.calculateStartPosition();
    this.x = this.startX; 
    this.y = this.startY;
    this.scale = 0; 
    this.opacity = 0; 
    this.startTime = 0;
  }
  
  setTarget(tx, ty) { 
      this.targetX = tx; 
      this.targetY = ty; 
      this.calculateStartPosition();
  }
  
  calculateStartPosition() {
      let midX = this.targetX + this.w/2;
      let midY = this.targetY + this.h/2;
      let vecX = midX - m4_centerX;
      let vecY = midY - m4_centerY;
      let startMidX = m4_centerX + (vecX * (1.0 - M4_POP_INTENSITY));
      let startMidY = m4_centerY + (vecY * (1.0 - M4_POP_INTENSITY));
      this.startX = startMidX - this.w/2;
      this.startY = startMidY - this.h/2;
  }
  
  update(currentTime) {
    if (currentTime < M4_START_DELAY) {
        if (this.startTime === -100) {
            this.opacity = 255; 
            this.scale = 1.0;
            this.x = this.targetX;
            this.y = this.targetY;
        } else {
            this.opacity = 0;
        }
        return; 
    }

    if (this.startTime === -100) {
        this.scale = 1.0;
        this.opacity = 255; 
        this.x = this.targetX;
        this.y = this.targetY;
    } else {
        let timeActive = currentTime - this.startTime;
        if (timeActive < 0) {
            this.scale = 0; 
            this.opacity = 0;
            this.x = this.startX;
            this.y = this.startY;
        } else {
            let progress = constrain(timeActive / M4_ANIMATION_DURATION, 0, 1);
            let t = easeOutExpo(progress); // Changed to Exponential Ease-Out
            this.scale = lerp(1.0 - M4_POP_INTENSITY, 1.0, t); 
            this.x = lerp(this.startX, this.targetX, t);
            this.y = lerp(this.startY, this.targetY, t);
            this.opacity = 255; 
        }
    }
  }
  
  display(context) {
    if (this.opacity <= 1) return;
    let boxAspect = this.w / this.h;
    let imgAspect = this.img.width / this.img.height;
    let sx, sy, sWidth, sHeight;
    if (imgAspect > boxAspect) {
      sHeight = this.img.height;
      sWidth = this.img.height * boxAspect;
      sx = (this.img.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = this.img.width;
      sHeight = this.img.width / boxAspect;
      sx = 0;
      sy = (this.img.height - sHeight) / 2;
    }
    context.push();
    context.translate(this.x + this.w/2, this.y + this.h/2); 
    context.scale(this.scale);
    context.tint(255, this.opacity);
    context.imageMode(CENTER);
    context.image(this.img, 0, 0, this.w, this.h, sx, sy, sWidth, sHeight);
    context.pop();
  }
}

// Option A: Exponential Ease-Out (Most likely match for a very smooth, long tail)
function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Option B: Quartic Ease-Out (Slightly less dramatic deceleration)
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

function m4_shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}