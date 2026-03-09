// ==========================================
// MODE 3: 3D CYCLIC EXPLOSION
// ==========================================

let m3_pg; // The 3D Offscreen Buffer
let m3_nodes = [];
let m3_camRotX = 0;
let m3_camRotY = 0;
let m3_prevMouseX = 0;
let m3_prevMouseY = 0;

// Config
let m3_cycleLen = 300; // 5 seconds total loop (60fps * 5)
let m3_animOffset = 0; // To reset animation start on record

function setupMode3() {
  // Create a WEBGL graphics buffer so we don't break the main 2D canvas
  m3_pg = createGraphics(windowWidth, windowHeight, WEBGL);
  m3_pg.setAttributes({ alpha: true, antialias: true });
  
  // Initialize nodes if images exist
  if (typeof uploadedImages !== 'undefined' && uploadedImages.length > 0) {
      rebuildMode3Nodes();
  }
}

function rebuildMode3Nodes() {
    m3_nodes = [];
    if (!uploadedImages || uploadedImages.length === 0) return;

    // Create a circular layout of nodes based on uploaded images
    for (let i = 0; i < uploadedImages.length; i++) {
        let angle = (TWO_PI / uploadedImages.length) * i;
        // params: img, angle, radius, maxSize, xOff, yOff, zOff
        addMode3Node(uploadedImages[i], angle, 250);
    }
}

function addMode3Node(img, angle, maxSize) {
    if (!img) return;
    let ratio = img.width / img.height;
    let w = maxSize, h = maxSize;
    if (ratio >= 1) h = w / ratio;
    else w = h * ratio;
    
    // Store node data
    m3_nodes.push({ 
        img: img, 
        angle: angle, 
        w: w, 
        h: h, 
        radMult: 1.0 
    });
}

function resetMode3Animation() {
    m3_animOffset = frameCount;
}

// ==========================================
// MAIN RENDER LOOP
// ==========================================

function runMode3(isFull) {
    // 1. Handle Setup & Sizing
    let pg = m3_pg;
    pg.reset();
    pg.clear();
    pg.background('#F7F5F3'); // Match app background

    // 2. Camera & Perspective Inputs
    // Map slider 0-100 to Perspective (10 to 150 deg)
    let perspVal = 60; 
    let zoomVal = 2000;
    
    if(document.getElementById('m3PerspSlider')) {
        perspVal = map(document.getElementById('m3PerspSlider').value, 0, 100, 10, 150);
        zoomVal = map(document.getElementById('m3DistSlider').value, 0, 100, 500, 3500);
    }

    let fov = radians(perspVal);
    pg.perspective(fov, pg.width / pg.height, 0.1, 50000);

    // Calculate Camera Z based on FOV to keep object roughly same size
    let scaleFactor = tan(PI / 6.0) / tan(fov / 2.0);
    let finalDist = zoomVal * scaleFactor;

    pg.camera(0, 0, finalDist, 0, 0, 0, 0, 1, 0);

    // 3. Camera Interaction (Rotation)
    pg.rotateX(m3_camRotX);
    pg.rotateY(m3_camRotY);

    // 4. Animation Timing
    let relativeFrame = frameCount - m3_animOffset;
    let t = (relativeFrame % m3_cycleLen) / m3_cycleLen;
    
    let expansionT = 0;
    let globalRingPos = 0;

    // --- TIMELINE LOGIC (300 frames total) ---
    // 0.0 - 0.80: The Active Motion (Explode -> Hover -> Collapse)
    // 0.80 - 1.0: The Pause (1 second / 60 frames)
    
    if (t < 0.05) {
        // PRE-BUFFER
        expansionT = 0; 
        globalRingPos = 0;
    } else if (t < 0.15) {
        // EXPLOSION (Fast Out)
        let localT = map(t, 0.05, 0.15, 0, 1);
        expansionT = cubicBezier(localT, 0.85, 0, 0.15, 1);
        let rotEased = cubicBezier(localT, 0.5, 0, 0.5, 1); 
        globalRingPos = rotEased * PI;
    } else if (t < 0.70) {
        // HOVER (Slow drift)
        expansionT = 1;
        let localT = map(t, 0.15, 0.70, 0, 1);
        globalRingPos = PI + (localT * PI);
    } else if (t < 0.80) {
        // IMPLOSION (Fast In)
        let localT = map(t, 0.70, 0.80, 0, 1);
        expansionT = 1 - cubicBezier(localT, 0.85, 0, 0.15, 1);
        let rotEased = cubicBezier(localT, 0.5, 0, 0.5, 1);
        globalRingPos = TWO_PI + (rotEased * PI);
    } else {
        // PAUSE
        expansionT = 0;
        globalRingPos = 0; 
    }

    // 5. Draw Nodes
    // We split into TWO loops to ensure render order:
    // 1. Draw Fragments (Behind)
    // 2. Draw Main Image (Front)

    let ringTiltX = 1.0;
    let ringTiltY = 0.2;

    pg.push();
    pg.noStroke();

    // --- PASS 1: FRAGMENTS (i > 0) ---
    for (let i = 1; i < m3_nodes.length; i++) {
        drawNode(pg, i, expansionT, globalRingPos, ringTiltX, ringTiltY);
    }

    // --- PASS 2: MAIN IMAGE (i == 0) ---
    if (m3_nodes.length > 0) {
        drawNode(pg, 0, expansionT, globalRingPos, ringTiltX, ringTiltY);
    }

    pg.pop();

    // 6. Output
    if (isFull) {
        clear();
        image(pg, 0, 0, width, height);
    }
}

function drawNode(pg, i, expansionT, globalRingPos, ringTiltX, ringTiltY) {
    let n = m3_nodes[i];
    pg.push();

    let maxRadius = 600 * n.radMult;
    let currentRadius = lerp(0, maxRadius, expansionT);

    // Position on Ring
    let theta = n.angle + globalRingPos;

    let flatX = cos(theta) * currentRadius;
    let flatY = sin(theta) * currentRadius;
    let flatZ = 0;

    // Apply Tilt Calculation
    let y1 = flatY * cos(ringTiltX) - flatZ * sin(ringTiltX);
    let z1 = flatY * sin(ringTiltX) + flatZ * cos(ringTiltX);
    let x1 = flatX;

    let x2 = x1 * cos(ringTiltY) + z1 * sin(ringTiltY);
    let z2 = -x1 * sin(ringTiltY) + z1 * cos(ringTiltY);
    let y2 = y1;

    pg.translate(x2, y2, z2);

    // Billboard (Face Camera)
    pg.rotateY(-m3_camRotY);
    pg.rotateX(-m3_camRotX);

    // Scale Logic
    let finalScale = 0;
    let targetScale = 1.5; 
    
    if (i === 0) {
        finalScale = targetScale;
        // PUSH FRONT: Ensure main image is slightly closer to camera
        pg.translate(0, 0, 2); 
    } else {
        finalScale = map(expansionT, 0, 1, 0, targetScale);
        // PUSH BACK: Ensure fragments are slightly behind
        pg.translate(0, 0, -20); 
    }

    pg.scale(finalScale);

    if (n.img && finalScale > 0.001) {
        pg.textureMode(NORMAL);
        pg.texture(n.img);
        pg.plane(n.w, n.h);
    }

    pg.pop();
}

// ==========================================
// INTERACTION & UTILS
// ==========================================

function mode3_mousePressed() {
    m3_prevMouseX = mouseX;
    m3_prevMouseY = mouseY;
}

function mode3_mouseDragged() {
    let sensitivity = 0.005;
    m3_camRotY += (mouseX - m3_prevMouseX) * sensitivity;
    m3_camRotX += (mouseY - m3_prevMouseY) * sensitivity;
    
    // Constraints
    m3_camRotX = constrain(m3_camRotX, -HALF_PI, HALF_PI); 
    
    m3_prevMouseX = mouseX;
    m3_prevMouseY = mouseY;
}

// Helper: Cubic Bezier
function cubicBezier(t, x1, y1, x2, y2) {
    let cx = 3 * x1;
    let bx = 3 * (x2 - x1) - cx;
    let ax = 1 - cx - bx;
    let cy = 3 * y1;
    let by = 3 * (y2 - y1) - cy;
    let ay = 1 - cy - by;
  
    function sampleCurveX(tVal) { return ((ax * tVal + bx) * tVal + cx) * tVal; }
    function sampleCurveY(tVal) { return ((ay * tVal + by) * tVal + cy) * tVal; }
    function sampleCurveDerivativeX(tVal) { return (3 * ax * tVal + 2 * bx) * tVal + cx; }
  
    function solveCurveX(x) {
      let t0, t1, t2, x2, d2, i;
      for (t2 = x, i = 0; i < 8; i++) {
        x2 = sampleCurveX(t2) - x;
        if (Math.abs(x2) < 1e-6) return t2;
        d2 = sampleCurveDerivativeX(t2);
        if (Math.abs(d2) < 1e-6) break;
        t2 = t2 - x2 / d2;
      }
      t0 = 0.0; t1 = 1.0; t2 = x;
      if (t2 < t0) return t0;
      if (t2 > t1) return t1;
      while (t0 < t1) {
        x2 = sampleCurveX(t2);
        if (Math.abs(x2 - x) < 1e-6) return t2;
        if (x2 > x) t1 = t2;
        else t0 = t2;
        t2 = (t1 - t0) * 0.5 + t0;
      }
      return t2;
    }
    return sampleCurveY(solveCurveX(t));
}