// ==========================================
// GLOBAL STATE & P5 SETUP
// ==========================================

let currentMode = 0; // 0 = GRID VIEW
let canvas;
let uploadedImages = [];
let userNames = ["@cosmos", "@design", "@motion"];
let recorder;
let isRecording = false;

// NEW: Declare a global font variable for the canvas
let globalFont; 

// Shared Sliders
let p_radius, p_size, p_speed;

// Recording State
let recordingStartFrame = 0;
let recordingTotalFrames = 0;

// Layout Cache
let bentoLayout = [];

function preload() {
  // NEW: Load the font directly into p5.js so the canvas can render it
  globalFont = loadFont('resources/CosmosOracle-Regular.otf');

  for (let i = 1; i <= 7; i++) {
    loadImage(`resources/${i}.png`, (img) => { uploadedImages.push(img); },
      (err) => {
        let p = createImage(500, 500);
        p.loadPixels();
        for (let j = 0; j < p.width * p.height * 4; j += 4) { p.pixels[j]=200; p.pixels[j+1]=200; p.pixels[j+2]=200; p.pixels[j+3]=255; }
        p.updatePixels();
        uploadedImages.push(p);
      }
    );
  }
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('canvas-container');

  // --- SMART PIXEL DENSITY ---
  let targetDensity = Math.min(window.devicePixelRatio, 2);
  pixelDensity(targetDensity);

  frameRate(60);

  // Initialize Modes
  if(typeof setupMode1 === 'function') setupMode1();
  if(typeof setupMode2 === 'function') setupMode2();
  if(typeof setupMode3 === 'function') setupMode3();
  if(typeof setupMode4 === 'function') setupMode4(); 
  if(typeof setupMode5 === 'function') setupMode5(); 

  // Default Aspect Ratio
  document.getElementById('aspectRatioSelect').value = "9:16";

  // Delayed build to ensure assets are ready
  setTimeout(() => {
     if(typeof rebuildMode1Slides === 'function') rebuildMode1Slides();
     if(typeof rebuildMode2Nodes === 'function') {
       rebuildMode2Nodes();
       triggerMode2Burst(true);
     }
     if(typeof rebuildMode3Nodes === 'function') rebuildMode3Nodes();
     if(typeof rebuildMode4Layout === 'function') rebuildMode4Layout(); 
     calculateBentoLayout();
  }, 500);

  goToGrid();
}

function draw() {
  p_radius = map(document.getElementById('radiusSlider').value, 0, 100, 0, 2.0);
  p_size = map(document.getElementById('sizeSlider').value, 0, 100, 1.3, 3.5);
  p_speed = map(document.getElementById('speedSlider').value, 0, 100, 0, 2.0);

  background('#F7F5F3');

  if (currentMode === 0) {
      // GRID VIEW (DASHBOARD)
      if (frameCount % 2 === 0) {
          if(typeof runMode1 === 'function') runMode1(false);
      } else {
          if(typeof runMode2 === 'function') runMode2(false);
      }
      
      if(typeof runMode3 === 'function') runMode3(false);
      if(typeof runMode4 === 'function') runMode4(false);
      if(typeof runMode5 === 'function') runMode5(false); 

      drawGridDashboard();
  }
  else if (currentMode === 1) {
      if(typeof runMode1 === 'function') runMode1(true);
  }
  else if (currentMode === 2) {
      let scaleVal = document.getElementById('m2SizeSlider').value / 100.0;
      let spacingVal = document.getElementById('m2SpacingSlider').value;
      if(typeof setMode2Scale === 'function') setMode2Scale(scaleVal);
      if(typeof setMode2Spacing === 'function') setMode2Spacing(spacingVal);
      if(typeof runMode2 === 'function') runMode2(true);
  }
  else if (currentMode === 3) {
      if(typeof runMode3 === 'function') runMode3(true);
  }
  else if (currentMode === 4) {
      if(typeof runMode4 === 'function') runMode4(true);
  }
  else if (currentMode === 5) { 
      if(typeof runMode5 === 'function') runMode5(true);
  }

  if (isRecording && recorder) {
    recorder.capture(document.querySelector('canvas'));
    let framesRecorded = frameCount - recordingStartFrame;
    if (framesRecorded >= recordingTotalFrames) { stopVideoRecord(); }
  }

  if (isRecording) { drawRecordingBar(); }
}

// ==========================================
// BENTO BOX LAYOUT
// ==========================================

function calculateBentoLayout() {
  let pad = 15;
  let gap = 15;
  let totalH = height - (pad * 2);

  let col1_W = totalH * 0.45;
  let col2_W = totalH * 0.55;
  let col3_W = totalH * 0.35;

  let totalReqW = col1_W + col2_W + col3_W + (gap*2) + pad;
  if (totalReqW > width) {
      let scale = (width - pad) / (totalReqW - pad);
      col1_W *= scale; col2_W *= scale; col3_W *= scale; totalH *= scale;
  }

  let x1 = pad;
  let y1 = pad;

  let s1 = { x: x1, y: y1, w: col1_W, h: totalH, id: 1, label: "" };
  let s2_H = (totalH - gap) * 0.6;
  let s2 = { x: x1 + col1_W + gap, y: y1, w: col2_W, h: s2_H, id: 2, label: "" };
  let s3_H = totalH - s2_H - gap;
  let s3 = { x: s2.x, y: y1 + s2_H + gap, w: col2_W, h: s3_H, id: 3, label: "" };
  let s4_H = (totalH - gap) * 0.5;
  let s4 = { x: s2.x + col2_W + gap, y: y1, w: col3_W, h: s4_H, id: 4, label: "" };
  let s5_H = totalH - s4_H - gap;
  let s5 = { x: s4.x, y: y1 + s4_H + gap, w: col3_W, h: s5_H, id: 5, label: "" };

  bentoLayout = [s1, s2, s3, s4, s5];

  let targetDensity = Math.min(window.devicePixelRatio, 2);

  if (currentMode === 0) {
      const syncPG = (pg, slot) => {
          if(pg && (abs(pg.width - slot.w) > 1 || abs(pg.height - slot.h) > 1)) {
              pg.pixelDensity(targetDensity);
              pg.resizeCanvas(slot.w, slot.h);
          }
      };

      if(typeof m1_pg !== 'undefined') syncPG(m1_pg, s1);
      if(typeof m1_fxLayer !== 'undefined') syncPG(m1_fxLayer, s1);
      if(typeof m2_pg !== 'undefined') syncPG(m2_pg, s2);
      if(typeof m3_pg !== 'undefined') syncPG(m3_pg, s3);
      if(typeof m5_pg !== 'undefined') syncPG(m5_pg, s5); 
      
      // Mode 4 Sync - DEBOUNCED
      if(typeof m4_pg !== 'undefined') {
          if (abs(m4_pg.width - s4.w) > 3 || abs(m4_pg.height - s4.h) > 3) {
             m4_pg.pixelDensity(1); 
             m4_pg.resizeCanvas(s4.w, s4.h);
             if(typeof m4_fxLayer !== 'undefined') { 
                 m4_fxLayer.pixelDensity(1); 
                 m4_fxLayer.resizeCanvas(s4.w, s4.h); 
             }
             if(typeof m4_calculateDimensions === 'function') m4_calculateDimensions(s4.w, s4.h);
             if(typeof rebuildMode4Layout === 'function') rebuildMode4Layout();
          }
      }
  }
}

function drawGridDashboard() {
  if (!bentoLayout || bentoLayout.length === 0) calculateBentoLayout();
  let m1_preview = (typeof m1_fxLayer !== 'undefined') ? m1_fxLayer : m1_pg;
  
  drawCard(bentoLayout[0], m1_preview, true);
  drawCard(bentoLayout[1], m2_pg, true);
  drawCard(bentoLayout[2], m3_pg, true); 
  
  let m4_preview = (typeof m4_fxLayer !== 'undefined') ? m4_fxLayer : m4_pg;
  drawCard(bentoLayout[3], m4_preview, true);
  
  drawCard(bentoLayout[4], m5_pg, true);
}

function drawCard(slot, graphic, isActive) {
  let { x, y, w, h } = slot;
  push();
  let isHover = (mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h);

  noStroke();
  if (isHover && isActive) {
      fill(0, 0, 0, 15); rect(x + 6, y + 8, w, h); cursor(HAND);
  } else {
      fill(0, 0, 0, 6); rect(x + 3, y + 4, w, h);
  }

  if (isActive && graphic) {
    fill(255); rect(x, y, w, h);
    image(graphic, x, y, w, h);
  } else {
    fill(245);
    if (isHover && !isActive) fill(240);
    rect(x, y, w, h);
    noStroke(); fill(220); ellipse(x + w/2, y + h/2, 40, 40);
  }

  noFill();
  if (isHover && isActive) { stroke(0); strokeWeight(1.5); }
  else { stroke(220); strokeWeight(1); }
  rect(x, y, w, h);
  pop();
}

function updateUI() {
    let backBtn = document.getElementById('backBtn');
    let homeInfo = document.getElementById('home-info');
    let globalControls = document.getElementById('global-controls');

    if (currentMode === 0) {
        backBtn.style.display = 'none';
        if(homeInfo) homeInfo.style.display = 'block';
        if(globalControls) globalControls.classList.remove('visible');
        cursor(ARROW);
        document.querySelectorAll('.mode-controls').forEach(el => el.classList.remove('visible'));
    } else {
        backBtn.style.display = 'block';
        if(homeInfo) homeInfo.style.display = 'none';
        if(globalControls) globalControls.classList.add('visible');
        document.querySelectorAll('.mode-controls').forEach(el => el.classList.remove('visible'));
        let activeControls = document.getElementById('controls-mode-' + currentMode);
        if (activeControls) activeControls.classList.add('visible');
        if(globalControls) globalControls.classList.add('visible');
    }
}

function setResolutionMode(isThumbnail) {
    if (isThumbnail) { calculateBentoLayout(); }
    else { resizeCanvasToRatio(); }
}

function goToGrid() {
    currentMode = 0; frameRate(30); updateUI();
    resizeCanvas(windowWidth, windowHeight);
    canvas.elt.style.width = windowWidth + "px"; canvas.elt.style.height = windowHeight + "px";
    calculateBentoLayout();
}

function switchMode(modeNum) {
  currentMode = modeNum; frameRate(60); updateUI();
  let ratioSelect = document.getElementById('aspectRatioSelect');
  
  if (currentMode === 1) ratioSelect.value = "9:16";
  else if (currentMode === 2) ratioSelect.value = "4:5";
  else if (currentMode === 3) ratioSelect.value = "16:9";
  else if (currentMode === 4) ratioSelect.value = "1:1";
  else if (currentMode === 5) ratioSelect.value = "9:16"; 
  
  setResolutionMode(false);

  if (currentMode === 2 && (typeof m2_nodes === 'undefined' || m2_nodes.length === 0) && uploadedImages.length > 0) {
      if(typeof rebuildMode2Nodes === 'function') { rebuildMode2Nodes(); triggerMode2Burst(); }
  } else if (currentMode === 2) {
      triggerMode2Burst(false);
  }

  if (currentMode === 4) {
      if(typeof resetMode4Timer === 'function') resetMode4Timer();
      if(typeof rebuildMode4Layout === 'function') rebuildMode4Layout();
  }

  if (currentMode === 3) {
      if(typeof m3_prevMouseX !== 'undefined') {
          m3_prevMouseX = mouseX;
          m3_prevMouseY = mouseY;
      }
  }
}

function mousePressed(e) {
    if (e && e.target && e.target.tagName !== 'CANVAS') return;

    if (currentMode === 0) {
        if (bentoLayout && bentoLayout.length > 0) {
            for(let slot of bentoLayout) {
                if (mouseX > slot.x && mouseX < slot.x + slot.w && mouseY > slot.y && mouseY < slot.y + slot.h) {
                    if (slot.id === 1) switchMode(1);
                    if (slot.id === 2) switchMode(2);
                    if (slot.id === 3) switchMode(3);
                    if (slot.id === 4) switchMode(4); 
                    if (slot.id === 5) switchMode(5); 
                }
            }
        }
        return;
    }

    if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {
        if (currentMode === 2 && typeof mode2_mousePressed === 'function') mode2_mousePressed();
        if (currentMode === 3 && typeof mode3_mousePressed === 'function') mode3_mousePressed();
    }
}

function mouseDragged(e) { 
    if (e && e.target && e.target.tagName !== 'CANVAS') return;
    if (currentMode === 2 && typeof mode2_mouseDragged === 'function') mode2_mouseDragged(); 
    if (currentMode === 3 && typeof mode3_mouseDragged === 'function') mode3_mouseDragged(); 
}

function mouseReleased() { 
    if (currentMode === 2 && typeof mode2_mouseReleased === 'function') mode2_mouseReleased(); 
}

function drawRecordingBar() { push(); resetMatrix(); let framesRecorded = frameCount - recordingStartFrame; let progress = constrain(framesRecorded / recordingTotalFrames, 0, 1); noStroke(); fill(0); rect(0, height - 12, width * progress, 12); pop(); }

function setHighResExport(enable) {
    let d = enable ? 2 : 1; 
    if (!enable) d = Math.min(window.devicePixelRatio, 2); 
    
    pixelDensity(d);
    
    let m4Density = enable ? 2 : 1; 

    if(typeof m1_pg !== 'undefined') { m1_pg.pixelDensity(d); m1_fxLayer.pixelDensity(d); }
    if(typeof m2_pg !== 'undefined') { m2_pg.pixelDensity(d); }
    if(typeof m3_pg !== 'undefined') { m3_pg.pixelDensity(d); }
    if(typeof m5_pg !== 'undefined') { m5_pg.pixelDensity(d); } 
    
    if(typeof m4_pg !== 'undefined') { 
        m4_pg.pixelDensity(m4Density); 
        m4_fxLayer.pixelDensity(m4Density); 
    } 
    
    resizeCanvasToRatio();
}

function toggleVideoRecord() { 
    let btn = document.getElementById('recordBtn'); 
    if (!isRecording) { 
        if (typeof CCapture === 'undefined') { alert("CCapture library not loaded."); return; } 
        setHighResExport(true); 
        recorder = new CCapture({ format: 'webm', framerate: 60 }); 
        recordingStartFrame = frameCount; 
        
        if(currentMode === 1) { m1_timer = 0; recordingTotalFrames = getMode1TotalFrames(); } 
        else if(currentMode === 2) { triggerMode2Burst(); recordingStartFrame = frameCount; recordingTotalFrames = getMode2TotalFrames(); } 
        else if(currentMode === 3) { resetMode3Animation(); recordingTotalFrames = 300; } 
        else if(currentMode === 4) { 
            resetMode4Timer(); 
            if(typeof getMode4TotalFrames === 'function') recordingTotalFrames = getMode4TotalFrames();
            else recordingTotalFrames = 300;
        }
        else if(currentMode === 5) { 
            m5_totalFrames = 0; // RESTART ANIMATION LOOP
            recordingTotalFrames = getMode5TotalFrames();
        }
        else { recordingTotalFrames = 600; } 
        
        recorder.start(); 
        isRecording = true; 
        btn.innerText = "Recording..."; 
        btn.classList.add('recording'); 
    } else { 
        stopVideoRecord(); 
    } 
}

function stopVideoRecord() { 
    let btn = document.getElementById('recordBtn'); 
    isRecording = false; 
    if(recorder) { recorder.stop(); recorder.save(); } 
    setHighResExport(false); 
    btn.innerText = "Record Video"; 
    btn.classList.remove('recording'); 
}

function triggerImageExport() { 
    setHighResExport(true); 
    redraw(); 
    saveCanvas('cosmos_capture', 'png'); 
    setTimeout(() => { setHighResExport(false); }, 1000); 
}

function updateUsernames() { userNames = [document.getElementById('user1').value, document.getElementById('user2').value, document.getElementById('user3').value]; }

function handleImageUpload(input) {
  if (input.files) {
    uploadedImages = [];
    document.getElementById('uploadLabel').innerText = input.files.length + " Added";
    let loaded = 0;
    for (let i = 0; i < input.files.length; i++) {
      let url = URL.createObjectURL(input.files[i]);
      loadImage(url, (img) => {
        uploadedImages.push(img);
        loaded++;
        if(loaded === input.files.length) {
            if(typeof rebuildMode1Slides === 'function') rebuildMode1Slides();
            if(typeof rebuildMode2Nodes === 'function') { rebuildMode2Nodes(); triggerMode2Burst(); }
            if(typeof rebuildMode3Nodes === 'function') rebuildMode3Nodes();
            if(typeof rebuildMode4Layout === 'function') rebuildMode4Layout();
            if(typeof m5_triggerColorUpdate === 'function') m5_triggerColorUpdate(); 
        }
      });
    }
  }
}

function resizeCanvasToRatio() {
  if (currentMode === 0) return;
  let container = document.querySelector('.main-stage');
  let availW = container.clientWidth; let availH = container.clientHeight;
  let val = document.getElementById('aspectRatioSelect').value;
  let w, h; let maxW = availW * 0.9; let maxH = availH * 0.9;
  if (val === "1:1") { let s = Math.min(maxW, maxH); w = s; h = s; }
  else if (val === "4:5") { if (maxW / maxH > 4/5) { h = maxH; w = h * (4/5); } else { w = maxW; h = w * (5/4); } }
  else if (val === "16:9") { if (maxW / maxH > 16/9) { h = maxH; w = h * (16/9); } else { w = maxW; h = w * (9/16); } }
  else if (val === "9:16") { if (maxW / maxH > 9/16) { h = maxH; w = h * (9/16); } else { w = maxW; h = w * (16/9); } }
  w = Math.floor(w); h = Math.floor(h);

  resizeCanvas(w, h);
  canvas.elt.style.width = w + "px"; canvas.elt.style.height = h + "px";

  let d = pixelDensity();
  
  const resizePG = (pg) => { if(pg) { pg.resizeCanvas(w, h); }};
  
  if(typeof m1_pg !== 'undefined') { resizePG(m1_pg); resizePG(m1_fxLayer); }
  if(typeof m2_pg !== 'undefined') { resizePG(m2_pg); }
  if(typeof m3_pg !== 'undefined') { resizePG(m3_pg); }
  if(typeof m5_pg !== 'undefined') { resizePG(m5_pg); } 
  
  if(typeof m4_pg !== 'undefined') { 
      resizePG(m4_pg); 
      resizePG(m4_fxLayer);
      if(typeof m4_calculateDimensions === 'function') m4_calculateDimensions(w, h);
      if(typeof rebuildMode4Layout === 'function') rebuildMode4Layout();
  }
}

function windowResized() {
    if(currentMode === 0) {
        resizeCanvas(windowWidth, windowHeight);
        canvas.elt.style.width = windowWidth + "px"; canvas.elt.style.height = windowHeight + "px";
        calculateBentoLayout();
    } else resizeCanvasToRatio();
}