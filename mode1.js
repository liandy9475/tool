// ==========================================
// MODE 1: FISHEYE SLIDER (OPTIMIZED GLASS)
// ==========================================

let m1_pg, m1_fxLayer, m1_fisheyeShader;
let m1_slideGroups = [];
let m1_timer = 0; 
let m1_currentIndex = 0;
let m1_imagesLoadedCount = 0; 

// CONFIGURATION
const M1_CYCLE_MS = 2000; 
const M1_GAP = 25;
const M1_RANGE_MULT = 600;

const m1_vertShader = `
  attribute vec3 aPosition; attribute vec2 aTexCoord; varying vec2 vTexCoord;
  void main() { vTexCoord = aTexCoord; vec4 positionVec4 = vec4(aPosition, 1.0);
  positionVec4.xy = positionVec4.xy * 2.0 - 1.0; gl_Position = positionVec4; }
`;

const m1_fragShader = `
  precision mediump float; varying vec2 vTexCoord; uniform sampler2D tex0;
  uniform float uStrength; uniform float uZoom; uniform vec2 uResolution;
  void main() {
    vec2 uv = vTexCoord; uv.y = 1.0 - uv.y; 
    vec2 center = vec2(0.5, 0.5); vec2 coord = uv - center;
    float aspect = uResolution.x / uResolution.y;
    vec2 correctedCoord = coord; correctedCoord.x *= aspect; 
    float dist = length(correctedCoord);
    float factor = 1.0 - (uStrength * dist * dist);
    coord /= uZoom; vec2 newUV = center + (coord * factor);
    float edgeSoftness = 0.02;
    float maskX = smoothstep(0.0, edgeSoftness, newUV.x) * (1.0 - smoothstep(1.0 - edgeSoftness, 1.0, newUV.x));
    float maskY = smoothstep(0.0, edgeSoftness, newUV.y) * (1.0 - smoothstep(1.0 - edgeSoftness, 1.0, newUV.y));
    float mask = maskX * maskY;
    vec4 texColor = texture2D(tex0, newUV);
    vec4 bgColor = vec4(0.9686, 0.9608, 0.9529, 1.0);
    gl_FragColor = mix(bgColor, texColor, mask);
  }
`;

function setupMode1() {
  if (!m1_pg) {
    m1_pg = createGraphics(width, height);
    m1_pg.pixelDensity(1); 
    m1_fxLayer = createGraphics(width, height, WEBGL);
    m1_fxLayer.pixelDensity(1); 
    m1_fxLayer.textureWrap(CLAMP);
    m1_fisheyeShader = m1_fxLayer.createShader(m1_vertShader, m1_fragShader);
    // Initialize empty or default
    m1_slideGroups.push(new M1_SlideGroup(color(240), color(220), color(230)));
  }
}

function runMode1(drawToScreen = true) {
  if (!m1_pg) setupMode1();
  
  // Check if we need to rebuild slides (new upload)
  if(uploadedImages.length != m1_imagesLoadedCount) rebuildMode1Slides();

  let dt = (typeof isRecording !== 'undefined' && isRecording) ? 16.666 : deltaTime;
  let speedMult = (typeof p_speed !== 'undefined') ? map(p_speed, 0, 2, 0, 3) : 1.0; 
  if(speedMult === 0) speedMult = 0.1;
  m1_timer += dt * speedMult;

  let pgW = m1_pg.width;
  let pgH = m1_pg.height;

  let sizeFactor = (typeof p_size !== 'undefined') ? p_size : 1.0;
  let movementRange = M1_RANGE_MULT * sizeFactor;
  if (pgW < 500) movementRange *= 0.5;

  let yOffset = getSlideMotion(m1_timer, M1_CYCLE_MS, movementRange);
  let slideInfo = getCurrentSlideInfo(m1_timer, M1_CYCLE_MS, m1_slideGroups.length);
  m1_currentIndex = slideInfo.index;

  m1_pg.background('#F7F5F3');
  
  if (m1_slideGroups.length > 0) {
      let isFlipped = ((m1_currentIndex * 999) % 100) > 50; 
      let badgeOnBottom = ((m1_currentIndex * 777) % 100) > 50; 
      m1_slideGroups[m1_currentIndex].render(m1_pg, yOffset, isFlipped, badgeOnBottom, slideInfo.cycles); 
  }

  m1_fxLayer.shader(m1_fisheyeShader);
  m1_fisheyeShader.setUniform('tex0', m1_pg);
  m1_fisheyeShader.setUniform('uStrength', (typeof p_radius !== 'undefined') ? p_radius : 0.65); 
  m1_fisheyeShader.setUniform('uZoom', sizeFactor);            
  m1_fisheyeShader.setUniform('uResolution', [pgW, pgH]); 
  
  m1_fxLayer.rect(0, 0, m1_fxLayer.width, m1_fxLayer.height); 

  if (drawToScreen) {
    clear();
    image(m1_fxLayer, 0, 0, width, height);
  }
}

function getSlideMotion(timer, duration, range) {
    let progress = (timer % duration) / duration;
    let curve = 4 * Math.pow(progress - 0.5, 3);
    return -1 * curve * range;
}

function getCurrentSlideInfo(timer, duration, count) {
    if (count === 0) return { index: 0, cycles: 0 };
    let totalCycles = floor(timer / duration);
    return { index: totalCycles % count, cycles: totalCycles };
}

function getMode1TotalFrames() {
    let groups = Math.max(1, m1_slideGroups.length);
    return Math.ceil(((groups * M1_CYCLE_MS) / 1.0) / 16.666);
}

// --- OPTIMIZATION: Pre-calculate blurred assets ---
function rebuildMode1Slides() {
  if(uploadedImages.length > 0) {
    // 1. Pre-generate blurred versions for Glassmorphism
    // This happens ONCE per upload, ensuring the main loop runs at 60fps.
    for(let img of uploadedImages) {
        if (img instanceof p5.Image && !img.blurredRep) {
            // Create a small clone (downsampling improves perf and smoothness)
            let b = img.get();
            b.resize(b.width * 0.5, 0); // 50% scale
            b.filter(BLUR, 9); // 9px blur on 50% img ~= 18px blur on full img
            img.blurredRep = b;
        }
    }

    m1_slideGroups = []; 
    let tempQ = [...uploadedImages];
    while(tempQ.length >= 3) { m1_slideGroups.push(new M1_SlideGroup(...tempQ.splice(0, 3))); }
    if(m1_slideGroups.length === 0 && uploadedImages.length > 0) {
       m1_slideGroups.push(new M1_SlideGroup(uploadedImages[0], uploadedImages[1]||uploadedImages[0], uploadedImages[2]||uploadedImages[0]));
    }
  }
  m1_imagesLoadedCount = uploadedImages.length;
}

class M1_SlideGroup {
  constructor(imgLeft, imgTopRight, imgBotRight) { this.images = [imgLeft, imgTopRight, imgBotRight]; }
  
  render(ctx, yOffset, flipped, badgeOnBottom, cycleCount) {
    ctx.push();
    ctx.translate(0, yOffset); 
    let w = ctx.width; let h = ctx.height;
    
    let currentGap = (w < 500) ? M1_GAP * 0.5 : M1_GAP;
    
    let halfW = w / 2; let halfH = h / 2; let halfGap = currentGap / 2;
    let rightX = halfW + halfGap; let rightW = halfW - halfGap;
    let topH = halfH - halfGap; let leftW = halfW - halfGap;
    let botY = halfH + halfGap; let botH = halfH - halfGap;

    // We now pass the 'bgImage' to drawBadge so it knows what to blur
    if (!flipped) {
        this.drawCover(ctx, this.images[0], 0, 0, leftW, h); 
        this.drawCover(ctx, this.images[1], rightX, 0, rightW, topH); 
        this.drawCover(ctx, this.images[2], rightX, botY, rightW, botH); 
        
        // Pass this.images[1] (Top Right) or this.images[2] (Bottom Right)
        if (!badgeOnBottom) this.drawBadge(ctx, rightX, 0, rightW, topH, yOffset, false, false, cycleCount, this.images[1]);
        else this.drawBadge(ctx, rightX, botY, rightW, botH, yOffset, false, true, cycleCount, this.images[2]); 
    } else {
        this.drawCover(ctx, this.images[0], rightX, 0, rightW, h);
        this.drawCover(ctx, this.images[1], 0, 0, leftW, topH);
        this.drawCover(ctx, this.images[2], 0, botY, leftW, botH);
        
        // Pass this.images[1] (Top Left) or this.images[2] (Bottom Left)
        if (!badgeOnBottom) this.drawBadge(ctx, 0, 0, leftW, topH, yOffset, true, false, cycleCount, this.images[1]);
        else this.drawBadge(ctx, 0, botY, leftW, botH, yOffset, true, true, cycleCount, this.images[2]);
    }
    ctx.pop();
  }

  // Updated to accept bgImage
  drawBadge(ctx, x, y, w, h, scrollY, alignRight, alignTop, cycleCount, bgImage) {
    if (typeof userNames === 'undefined' || userNames.length === 0) return;
    let nameIndex = cycleCount % userNames.length;
    let currentName = userNames[nameIndex];
    if (!currentName) return;

    ctx.push(); ctx.translate(x, y);
    
    // --- 1. SHAPE CONFIGURATION ---
    let scaleFactor = ctx.width / 1080; 
    let gFont = 28 * scaleFactor; 
    let gPadY = 15 * scaleFactor;        
    let gPadX = 14 * scaleFactor; 
    let gRadius = 17.5 * scaleFactor; 
    let margin = 20 * scaleFactor;

    ctx.textFont('CosmosOracle'); ctx.textSize(gFont);
    let txtW = ctx.textWidth(currentName);
    let badgeH = gFont + (gPadY * 2); let badgeW = txtW + (gPadX * 2);

    let posX = alignRight ? w - badgeW - margin : margin;
    let posY = alignTop ? margin : h - badgeH - margin;
    let absY = scrollY + y + posY;

    // Visibility Check
    if(absY > -badgeH && absY < ctx.height + badgeH) {
        
        // --- 2. OPTIMIZED GLASS EFFECT ---
        // Instead of capturing pixels (SLOW), we draw the pre-blurred image (FAST)
        if (bgImage && bgImage.blurredRep) {
            ctx.push();
            let dCtx = ctx.drawingContext; 
            dCtx.save();
            
            // Clip to Pill Shape
            dCtx.beginPath();
            if (dCtx.roundRect) dCtx.roundRect(posX, posY, badgeW, badgeH, gRadius);
            else dCtx.rect(posX, posY, badgeW, badgeH); 
            dCtx.clip(); 

            // Draw the blurred asset using the EXACT same geometry as the background.
            // Since we are inside translate(x,y), we draw at (0,0) with size (w,h)
            // matching the cell's local coordinate system.
            this.drawCover(ctx, bgImage.blurredRep, 0, 0, w, h);
            
            dCtx.restore(); 
            ctx.pop();
        } 
        // Fallback for solid colors (just draw a semi-transparent fill)
        else if (bgImage instanceof p5.Color) {
             ctx.noStroke(); ctx.fill(bgImage); 
             ctx.rect(posX, posY, badgeW, badgeH, gRadius);
        }

        // --- 3. GLASS TINT & TEXT ---
        ctx.noStroke(); 
        ctx.fill(255, 40); // Tint
        ctx.rect(posX, posY, badgeW, badgeH, gRadius); 
        
        ctx.noStroke(); ctx.fill(255); ctx.textAlign(CENTER, CENTER);
        let centerX = posX + (badgeW / 2);
        let centerY = posY + (badgeH / 2);
        ctx.text(currentName, centerX, centerY); 
    }
    ctx.pop();
  }

  drawCover(ctx, img, x, y, w, h) {
    if (!img) return;
    if (img instanceof p5.Color) { ctx.fill(img); ctx.noStroke(); ctx.rect(x, y, w, h); return; }
    
    let imgAsp = img.width / img.height; 
    let boxAsp = w / h;
    let sx, sy, sW, sH;
    
    // Calculate "Cover" fit
    if (imgAsp > boxAsp) { 
        sH = img.height; 
        sW = img.height * boxAsp; 
        sx = (img.width - sW) / 2; 
        sy = 0; 
    } else { 
        sW = img.width; 
        sH = img.width / boxAsp; 
        sx = 0; 
        sy = (img.height - sH) / 2; 
    }
    
    ctx.image(img, x, y, w, h, sx, sy, sW, sH);
  }
}