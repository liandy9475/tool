/* ==========================================
   MODE 5: KINETIC VERTICAL MOTION
   - Uses global 'uploadedImages'
   - Uses global 'globalFont'
========================================== */

let m5_pg;
let m5_motion;
let m5_tagSystem;
let m5_shouldUpdateColor = true; 
let m5_totalFrames = 0;

// EXAGGERATED RATIOS
let m5_ratioPalette = [
  1.0,      // Square
  3/2,      // Classic Landscape
  2/3,      // Classic Portrait
  16/9,     // Wide
  9/16,     // Social Story
  3/1,      // Ultra Wide (Panoramic)
  1/3,      // Ultra Tall (Skyscraper)
  2.35/1    // Cinematic Anamorphic
];

function setupMode5() {
  m5_pg = createGraphics(500, 500); 
  m5_tagSystem = new m5_ResponsiveTagSystem();
  m5_motion = new m5_CinematicMotion();
  m5_motion.calculateTimeline(3); 
}

function runMode5(isFullRender) {
  let target = isFullRender ? this : m5_pg; 
  let imgs = (typeof uploadedImages !== 'undefined' && uploadedImages.length > 0) ? uploadedImages : [];

  // --- INPUTS ---
  let speedVal = 17;
  let scaleVal = 60;
  let tagText = "Cosmos Tag";
  
  let speedSlider = document.getElementById('m5SpeedSlider');
  if(speedSlider) speedVal = parseInt(speedSlider.value);
  
  let scaleSlider = document.getElementById('m5ScaleSlider');
  if(scaleSlider) scaleVal = parseInt(scaleSlider.value);
  
  let textInput = document.getElementById('m5TextInput');
  if(textInput) tagText = textInput.value || "Cosmos Tag";

  // --- SETUP CANVAS ---
  target.background('#F7F5F3');

  // --- ZOOM & BLEED STRATEGY ---
  let VIRTUAL_WIDTH = 1080; 
  let globalScale;

  if (isFullRender) {
      globalScale = target.width / VIRTUAL_WIDTH;
  } else {
      globalScale = target.width / (VIRTUAL_WIDTH * 0.45); 
  }

  target.push();
  target.translate(target.width/2, target.height/2); 
  target.scale(globalScale);
  target.translate(-VIRTUAL_WIDTH/2, -(target.height/globalScale)/2); 

  let vW = VIRTUAL_WIDTH;
  let vH = target.height / globalScale; 

  // --- ANIMATION TIMER ---
  if (imgs.length > 0) {
    m5_totalFrames++;
    if (m5_totalFrames > m5_motion.timeline.totalLoop) {
      m5_totalFrames = 0;
    }
  }

  // --- WAITING STATE ---
  if (imgs.length === 0) {
    target.pop(); 
    return; // Removed the "Upload" text to prevent the flash
  }

  // --- SCALE LOGIC FIX ---
  // If preview mode, scale the tag and layout gaps together so it stays proportionally identical to Mode 5
  let tagScale = isFullRender ? 1.0 : 0.7; 

  // --- LAYOUT CALCULATIONS ---
  let scaleFactor = scaleVal / 100;
  let maxSlotW = vW * scaleFactor;
  let maxSlotH = vH * 0.4; 

  let flashDelay = max(1, 21 - speedVal); 
  let baseIndex = floor(m5_totalFrames / flashDelay); 

  let topImgIdx = baseIndex % imgs.length;
  let offset = max(1, floor(imgs.length / 2)); 
  let btmImgIdx = (baseIndex + offset) % imgs.length;
  
  let topImg = imgs[topImgIdx];
  let btmImg = imgs[btmImgIdx];

  let topRatioIdx = baseIndex % m5_ratioPalette.length;
  let btmRatioIdx = (baseIndex + 1) % m5_ratioPalette.length; 
  let targetTopRatio = m5_ratioPalette[topRatioIdx];
  let targetBtmRatio = m5_ratioPalette[btmRatioIdx];

  let topSlotDims = m5_calculateSlotDims(targetTopRatio, maxSlotW, maxSlotH);
  let btmSlotDims = m5_calculateSlotDims(targetBtmRatio, maxSlotW, maxSlotH);

  let topRealDims = m5_getFittedDimensions(topImg, topSlotDims.w, topSlotDims.h);
  let btmRealDims = m5_getFittedDimensions(btmImg, btmSlotDims.w, btmSlotDims.h);

  // FIXED CONSTANTS (Scaled to match the tag size)
  let tagEstimatedH = 75 * tagScale; 
  let gap = 50 * tagScale;            
  let centerScreenY = vH / 2;

  let topEdgeY = centerScreenY - (tagEstimatedH/2) - gap;
  let topTargetY = topEdgeY - (topRealDims.h / 2);

  let btmEdgeY = centerScreenY + (tagEstimatedH/2) + gap;
  let btmTargetY = btmEdgeY + (btmRealDims.h / 2);

  let tagTargetY = centerScreenY;

  // --- ROBUST COLOR UPDATE ---
  if (imgs.length > 0) {
      if (m5_shouldUpdateColor || m5_tagSystem.isDefaultColor() || frameCount % 30 === 0) {
           m5_tagSystem.calculateDominantColor(imgs);
           m5_shouldUpdateColor = false;
      }
  }

  // --- DRAWING ---
  let effTime = m5_motion.getEffectiveTime(m5_totalFrames);
  let cam = m5_motion.getGlobalState(effTime);

  target.push();
    target.translate(vW/2, vH/2);
    target.scale(cam.scale); 
    target.translate(-vW/2, -vH/2);
    target.imageMode(CENTER);
    
    let fontToUse = (typeof globalFont !== 'undefined') ? globalFont : 'Arial';
    
    // Tag Render
    m5_drawAnimatedItem(target, 0, vW/2, tagTargetY, effTime, vW, vH, (state) => {
        m5_tagSystem.render(target, state.x, state.y, tagText, fontToUse, tagScale);
    });

    // Top Image
    m5_drawAnimatedItem(target, 1, vW/2, topTargetY, effTime, vW, vH, (state) => {
        target.image(topImg, state.x, state.y, topRealDims.w, topRealDims.h);
    });

    // Bottom Image
    m5_drawAnimatedItem(target, 2, vW/2, btmTargetY, effTime, vW, vH, (state) => {
        target.image(btmImg, state.x, state.y, btmRealDims.w, btmRealDims.h);
    });

  target.pop(); 
  target.pop(); 
}

function m5_triggerColorUpdate() {
    m5_shouldUpdateColor = true;
}

function getMode5TotalFrames() {
    return m5_motion.timeline.totalLoop;
}

// --- Helpers ---

function m5_calculateSlotDims(targetRatio, maxW, maxH) {
    let containerRatio = maxW / maxH;
    let slotW, slotH;
    if (targetRatio > containerRatio) {
        slotW = maxW;
        slotH = maxW / targetRatio;
    } else {
        slotH = maxH;
        slotW = slotH * targetRatio;
    }
    return { w: slotW, h: slotH };
}

function m5_getFittedDimensions(img, slotW, slotH) {
    if (!img) return { w: slotW, h: slotH };
    let imgRatio = img.width / img.height;
    let slotRatio = slotW / slotH;
    let finalW, finalH;
    if (imgRatio > slotRatio) {
        finalW = slotW;
        finalH = slotW / imgRatio;
    } else {
        finalH = slotH;
        finalW = slotH * imgRatio;
    }
    return { w: finalW, h: finalH };
}

function m5_drawAnimatedItem(target, index, targetX, targetY, effTime, cW, cH, drawCallback) {
    let startTime = m5_motion.config.startDelay + (index * m5_motion.config.popDelay);
    let state = m5_motion.getItemState(targetX, targetY, cW/2, cH/2, startTime, effTime);

    if (state.isVisible) {
        target.push();
        target.translate(state.x, state.y);
        target.scale(state.scale);
        drawCallback({x: 0, y: 0, scale: state.scale}); 
        target.pop();
    }
}


// ---------------------------------------------------------
// --- CINEMATIC MOTION LOGIC ---
// ---------------------------------------------------------
class m5_CinematicMotion {
  constructor() {
    this.config = {
      startDelay: 20,      
      holdDuration: 60,       
      popDelay: 10,            
      itemDuration: 50,       
      startScale: 1.2,        
      snapScale: 1.0,         
      maxDistortion: 0.12,  
      popIntensity: 0.15    
    };
    this.timeline = { snapDuration: 120, introEnd: 0, holdEnd: 0, totalLoop: 0 };
  }
  calculateTimeline(totalItems) {
    this.timeline.snapDuration = ((totalItems - 1) * this.config.popDelay) + this.config.itemDuration + 10;
    this.timeline.introEnd = this.config.startDelay + this.timeline.snapDuration;
    this.timeline.holdEnd = this.timeline.introEnd + this.config.holdDuration;
    this.timeline.totalLoop = this.timeline.holdEnd + this.timeline.snapDuration + this.config.startDelay;
  }
  getEffectiveTime(currentFrame) {
    if (currentFrame <= this.timeline.introEnd) return currentFrame;
    else if (currentFrame <= this.timeline.holdEnd) return this.timeline.introEnd;
    else {
      let reversedTime = this.timeline.introEnd - (currentFrame - this.timeline.holdEnd);
      return Math.max(0, reversedTime); 
    }
  }
  getGlobalState(effectiveTime) {
    if (effectiveTime < this.config.startDelay) return { scale: this.config.startScale, distortion: 0 };
    let p = (effectiveTime - this.config.startDelay) / this.timeline.snapDuration;
    let t = this.easeOutExpo(Math.min(Math.max(p, 0), 1));
    return {
      scale: this.lerp(this.config.startScale, this.config.snapScale, t),
      distortion: this.lerp(0, this.config.maxDistortion, t)
    };
  }
  getItemState(itemTargetX, itemTargetY, centerX, centerY, itemStartTime, effectiveTime) {
    if (effectiveTime < itemStartTime) return { isVisible: false, x: 0, y: 0, scale: 0, opacity: 0 };
    let startX = centerX + ((itemTargetX - centerX) * (1.0 - this.config.popIntensity));
    let startY = centerY + ((itemTargetY - centerY) * (1.0 - this.config.popIntensity));
    let progress = Math.min(Math.max((effectiveTime - itemStartTime) / this.config.itemDuration, 0), 1);
    let t = this.easeOutExpo(progress);
    return {
      isVisible: true,
      x: this.lerp(startX, itemTargetX, t),
      y: this.lerp(startY, itemTargetY, t),
      scale: this.lerp(1.0 - this.config.popIntensity, 1.0, t),
      opacity: 1.0 
    };
  }
  easeOutExpo(x) { return x === 1 ? 1 : 1 - pow(2, -10 * x); }
  lerp(start, end, amt) { return (1 - amt) * start + amt * end; }
}

// ---------------------------------------------------------
// --- TAG CLASS ---
// ---------------------------------------------------------
class m5_ResponsiveTagSystem {
  constructor() {
    this.config = { 
        baseColor: '#8FCDE8', 
        paddingX: 25, 
        paddingY: 12,  
        cornerRadius: 25, 
        fontSize: 45, 
        font: 'CosmosOracle' 
    };
    this.currentColor = null; 
    this.dimensions = { w: 0, h: 0 };
  }

  isDefaultColor() {
      if (!this.currentColor) return true;
      let c = this.currentColor;
      let base = color(this.config.baseColor);
      return (red(c) === red(base) && green(c) === green(base) && blue(c) === blue(base));
  }

  calculateDominantColor(images) {
    if (!images || images.length === 0) { 
        this.currentColor = color(this.config.baseColor); 
        return; 
    }
    
    let img = images[0];
    
    if (img.width > 1 && img.height > 1) {
        try {
            img.loadPixels();
            if (img.pixels.length > 0) {
                let tiny = img.get(img.width/2, img.height/2);
                if (tiny) {
                   this.currentColor = color(red(tiny), green(tiny), blue(tiny));
                }
            }
        } catch(e) { }
    }
  }

  getHighContrastTextColor(bgColor) {
    if(!bgColor) return color(0);
    let luma = (red(bgColor) * 299 + green(bgColor) * 587 + blue(bgColor) * 114) / 1000;
    return (luma < 128) ? color('#F7F5F3') : color(0);
  }
  
  render(target, x, y, textString, customFont = null, scaleMult = 1.0) {
    target.textFont(customFont || this.config.font); 
    
    let currentFontSize = this.config.fontSize * scaleMult;
    target.textSize(currentFontSize);
    
    let padX = this.config.paddingX * scaleMult;
    let padY = this.config.paddingY * scaleMult;
    let rad = this.config.cornerRadius * scaleMult;

    // FIX: Ditch textAscent/textDescent as they break in offscreen buffers.
    // Use mathematically deterministic height based solely on fontSize.
    this.dimensions.w = target.textWidth(textString) + (padX * 2);
    this.dimensions.h = currentFontSize + (padY * 2);
    
    if (!this.currentColor) this.currentColor = color(this.config.baseColor);
    
    target.push(); 
    target.rectMode(CENTER); 
    
    // Draw Pill
    target.fill(this.currentColor); 
    target.noStroke();
    target.rect(x, y, this.dimensions.w, this.dimensions.h, rad);
    
    // Draw Text 
    // FIX: Using BASELINE bypasses the core p5.js internal centering bug.
    target.textAlign(CENTER, BASELINE);
    target.fill(this.getHighContrastTextColor(this.currentColor)); 
    
    // Optical baseline calculation (pushes the text slightly down from exact center)
    let baselineY = y + (currentFontSize * 0.31); 
    target.text(textString, x, baselineY); 
    
    target.pop();
  }
}