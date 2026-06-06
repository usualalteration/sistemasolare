// Solaris — NASA-style Solar System Simulation
// Uses Canvas API, no external libs. Modular, commented, optimized for 60fps.

(function(){
  'use strict';

  // Canvas and contexts
  const canvas = document.getElementById('space');
  const ctx = canvas.getContext('2d', { alpha: true });
  const mini = document.getElementById('mini');
  const miniCtx = mini.getContext('2d');

  // UI elements
  const tooltip = document.getElementById('tooltip');
  const startup = document.getElementById('startup');
  const playPauseBtn = document.getElementById('playPause');
  const timeScaleEl = document.getElementById('timeScale');
  const toggleOrbits = document.getElementById('toggleOrbits');
  const toggleLabels = document.getElementById('toggleLabels');
  const toggleEffects = document.getElementById('toggleEffects');
  const statsContent = document.getElementById('stats-content');
  const infoPanel = document.getElementById('infoPanel');
  const infoContent = document.getElementById('infoContent');
  const closeInfo = document.getElementById('closeInfo');
  const resetCam = document.getElementById('resetCam');

  // Device pixel ratio handling
  let DPR = Math.max(1, window.devicePixelRatio || 1);

  function resize(){
    DPR = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);

    // mini map
    mini.width = Math.floor(180 * DPR);
    mini.height = Math.floor(180 * DPR);
    mini.style.width = '180px';
    mini.style.height = '180px';
    miniCtx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resize, {passive:true});
  resize();

  // Simulation state
  const state = {
    running: true,
    timeScale: Number(timeScaleEl.value),
    showOrbits: toggleOrbits.checked,
    showLabels: toggleLabels.checked,
    effects: toggleEffects.checked,
    simTime: 0, // in days
  };

  // Camera
  const cam = {
    x: 0, y:0, zoom: 1,
    vx:0, vy:0, vz:0,
    target: null,
  };

  function resetCamera(){
    cam.x = 0; cam.y = 0; cam.zoom = 1; cam.vx = cam.vy = cam.vz = 0; cam.target = null;
  }
  resetCam.addEventListener('click', resetCamera);

  // Basic astronomical scale factors (tunable for visualization)
  const AU = 149597870.7; // km
  const scale = 250 / AU; // visual scale: 1 AU ~ 250px

  // Planetary data (relative sizes and orbital parameters)
  // Source: approximate mean orbital radii and diameters
  const bodies = [];

  function addBody(obj){ bodies.push(obj); }

  // Sun
  addBody({
    id:'sun', name:'Sun', radius:696340, color:'#ffdf7a',
    orbit: {a:0,e:0,period:0,inc:0}, rotation:25.0, // days
    type:'star', info:'The Sun is the star at the center of the Solar System.'
  });

  addBody({id:'mercury',name:'Mercury',radius:2439.7,color:'#bdb6b0',
    orbit:{a:0.387,e:0.205,period:88,inc:7},rotation:58.6,moons:0,desc:'Small rocky planet.'});

  addBody({id:'venus',name:'Venus',radius:6051.8,color:'#e6c19a',
    orbit:{a:0.723,e:0.007,period:224.7,inc:3.4},rotation:-243,moons:0,desc:'Thick toxic atmosphere.'});

  addBody({id:'earth',name:'Earth',radius:6371,color:'#6fb3ff',
    orbit:{a:1.0,e:0.017,period:365.25,inc:0},rotation:0.99,moons:1,desc:'Our home planet.'});

  addBody({id:'mars',name:'Mars',radius:3389.5,color:'#d66a3f',
    orbit:{a:1.524,e:0.093,period:687,inc:1.85},rotation:1.03,moons:2,desc:'The red planet.'});

  addBody({id:'jupiter',name:'Jupiter',radius:69911,color:'#d8c59b',
    orbit:{a:5.203,e:0.048,period:4331,inc:1.3},rotation:0.41,moons:79,desc:'Gas giant.'});

  addBody({id:'saturn',name:'Saturn',radius:58232,color:'#e9d7b9',
    orbit:{a:9.537,e:0.056,period:10747,inc:2.49},rotation:0.45,moons:82,desc:'Ringed gas giant.',rings:true});

  addBody({id:'uranus',name:'Uranus',radius:25362,color:'#9fe3e8',
    orbit:{a:19.191,e:0.046,period:30589,inc:0.77},rotation:-0.72,moons:27,desc:'Ice giant.'});

  addBody({id:'neptune',name:'Neptune',radius:24622,color:'#4a7bd6',
    orbit:{a:30.07,e:0.009,period:59800,inc:1.77},rotation:0.67,moons:14,desc:'Farthest major planet.'});

  // Earth's Moon as a child body
  const moon = {id:'moon',name:'Moon',radius:1737.1,color:'#cfcfcf',
    orbit:{a:0.00257,e:0.055,period:27.3,inc:5.14},rotation:27.3,moons:0,desc:'Earth\'s moon.'};

  // Convert sizes to visual radii (clamped)
  function visualRadius(km){
    const r = Math.log10(km) * 2.6; // perceptual scaling
    return Math.max(2, r);
  }

  // Build hierarchical structure, Earth has moon
  const sun = bodies.find(b=>b.id==='sun');
  const earth = bodies.find(b=>b.id==='earth');
  earth.children = [moon];

  // Orbital calculation helper: position in polar coordinates
  function orbitalPos(orbit, days, parent){
    if(!orbit || orbit.a===0) return {x:0,y:0};
    // Mean motion from period (days) -> angle per day
    const meanAnomaly = (2*Math.PI * (days % orbit.period)) / orbit.period;
    // Approx simple elliptical approximation using eccentric anomaly for small e
    const a_km = orbit.a * AU;
    const b = a_km * Math.sqrt(1 - Math.pow(orbit.e||0,2));
    const x = (a_km * Math.cos(meanAnomaly));
    const y = (b * Math.sin(meanAnomaly));
    return {x:x, y:y};
  }

  // Starfield generation
  const stars = [];
  function genStars(count=1200){
    stars.length=0;
    for(let i=0;i<count;i++){
      stars.push({x:Math.random(), y:Math.random(), size: Math.random()*1.6, alpha:0.3+Math.random()*0.7});
    }
  }
  genStars(1600);

  // Shooting stars buffer
  let shooting = [];

  function spawnShooting(){
    if(!state.effects) return;
    if(Math.random() < 0.01){
      shooting.push({x: Math.random(), y:Math.random()*0.5, vx: (0.2+Math.random()*0.6), life: 0, ttl: 80 + Math.random()*120});
    }
    if(shooting.length>6) shooting.shift();
  }

  // Interaction helpers
  function screenToWorld(x,y){
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    return {
      x: (x - cx)/cam.zoom + cam.x,
      y: (y - cy)/cam.zoom + cam.y
    };
  }

  function worldToScreen(wx,wy){
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    return {
      x: (wx - cam.x) * cam.zoom + cx,
      y: (wy - cam.y) * cam.zoom + cy
    };
  }

  // Mouse & touch for camera
  let isDragging=false, lastMouse={x:0,y:0}, inertia={vx:0,vy:0};
  canvas.addEventListener('wheel', e=>{
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * -0.08;
    const oldZoom = cam.zoom;
    cam.zoom = Math.max(0.12, Math.min(6, cam.zoom * (1 + delta)));
    // Zoom towards mouse
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX, my = e.clientY;
    const before = screenToWorld(mx,my);
    const after = screenToWorld(mx,my);
    cam.x += (before.x - after.x);
    cam.y += (before.y - after.y);
  }, {passive:false});

  canvas.addEventListener('pointerdown', e=>{
    isDragging=true; lastMouse.x=e.clientX; lastMouse.y=e.clientY; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e=>{
    if(isDragging){
      const dx = (e.clientX - lastMouse.x)/cam.zoom;
      const dy = (e.clientY - lastMouse.y)/cam.zoom;
      cam.x -= dx; cam.y -= dy; inertia.vx = -dx; inertia.vy = -dy;
      lastMouse.x = e.clientX; lastMouse.y = e.clientY;
    }
    // Tooltip handling
    handleHover(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', e=>{ isDragging=false; canvas.releasePointerCapture(e.pointerId); });
  canvas.addEventListener('pointercancel', ()=>{ isDragging=false; });

  // Double click to focus
  canvas.addEventListener('dblclick', e=>{
    const p = pickBodyAt(e.clientX, e.clientY);
    if(p){ focusOn(p); showInfo(p); }
  });

  // Picking: check which body is under screen coords
  function pickBodyAt(sx,sy){
    const world = screenToWorld(sx,sy);
    // check planets in reverse order for visual stacking
    for(let i=bodies.length-1;i>=0;i--){
      const b = bodies[i];
      const pos = computeBodyWorld(b, state.simTime);
      const vr = visualRadius(b.radius) * (b.id==='sun' ? 1.2 : 1);
      const dx = world.x - pos.x, dy = world.y - pos.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if(dist < vr*1.15) return b;
      // check children (moon)
      if(b.children) for(const c of b.children){
        const cpos = {x: pos.x + computeBodyWorld(c, state.simTime, b).x, y: pos.y + computeBodyWorld(c, state.simTime, b).y };
        const cr = visualRadius(c.radius);
        const d2 = Math.hypot(world.x - cpos.x, world.y - cpos.y);
        if(d2 < cr*1.15) return c;
      }
    }
    return null;
  }

  // Tooltip and info panel
  function handleHover(mx,my){
    if(!state.showLabels) { tooltip.classList.add('hidden'); return; }
    const picked = pickBodyAt(mx,my);
    if(picked){
      const wpos = screenToWorld(mx,my);
      const t = picked;
      tooltip.innerHTML = `<strong>${t.name}</strong><br>${formatDistance(t.orbit&&t.orbit.a? t.orbit.a:0)} from Sun<br>Diameter: ${Math.round((t.radius||0)*2)} km<br>Moons: ${t.moons||0}<br>Orbital Period: ${t.orbit&&t.orbit.period? t.orbit.period+' days':''}`;
      tooltip.style.left = mx + 'px'; tooltip.style.top = my + 'px'; tooltip.classList.remove('hidden');
    } else tooltip.classList.add('hidden');
  }

  function showInfo(b){
    infoPanel.setAttribute('data-open','true');
    infoContent.innerHTML = `<h3>${b.name}</h3><p>${b.desc||b.info||''}</p><p><strong>Diameter:</strong> ${Math.round((b.radius||0)*2)} km</p><p><strong>Orbit radius (AU):</strong> ${b.orbit&&b.orbit.a? b.orbit.a:''}</p>`;
  }
  closeInfo.addEventListener('click', ()=>{ infoPanel.setAttribute('data-open','false'); });

  // Camera focus with smooth transition
  function focusOn(b){
    cam.target = {x:0,y:0,zoom:1,progress:0};
    const pos = computeBodyWorld(b, state.simTime);
    cam.target.x = pos.x; cam.target.y = pos.y; cam.target.zoom = Math.min(3, 1 + 2/(visualRadius(b.radius)||4));
  }

  // Utility: format distance
  function formatDistance(au){ return (au ? (au.toFixed(3)+' AU') : '—'); }

  // Compute world position of a body relative to sun center (km units)
  function computeBodyWorld(b, days, parent=null){
    if(b.id === 'sun') return {x:0,y:0};
    const orb = b.orbit;
    const p = orbitalPos(orb, days);
    // If child of a planet (moon), scale to parent's coordinate
    if(parent){
      // moon orbit's a is given in AU of Earth radius fraction; convert properly
      const a_km = (orb.a * AU);
      const angle = (2*Math.PI * (days % orb.period)) / orb.period;
      return {x: Math.cos(angle) * a_km, y: Math.sin(angle) * a_km };
    }
    return {x: p.x, y: p.y};
  }

  // Main render loop
  let last = performance.now();
  function frame(now){
    const dt = Math.min(40, now - last); last = now;
    if(state.running) state.simTime += (dt/1000) * state.timeScale; // seconds scaled to days per second roughly
    // inertial camera
    cam.vx += (cam.target? (cam.target.x - cam.x) * 0.02 : 0) ;
    cam.vy += (cam.target? (cam.target.y - cam.y) * 0.02 : 0) ;
    cam.x += cam.vx; cam.y += cam.vy; cam.vx *= 0.92; cam.vy *= 0.92;
    if(cam.target){ cam.target.progress = Math.min(1, (cam.target.progress||0)+0.03); cam.zoom += (cam.target.zoom - cam.zoom) * 0.06; if(cam.target.progress>=1) cam.target=null; }

    // Clear
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Draw background
    drawBackground();

    // Draw orbits
    if(state.showOrbits) drawOrbits();

    // Draw bodies
    for(const b of bodies){
      const pos = computeBodyWorld(b, state.simTime);
      drawBody(b, pos);
      // children
      if(b.children) for(const c of b.children){
        const cpos = {x: pos.x + computeBodyWorld(c, state.simTime, b).x, y: pos.y + computeBodyWorld(c, state.simTime, b).y };
        drawBody(c, cpos);
      }
    }

    // HUD stats
    statsContent.textContent = `Time: ${Math.floor(state.simTime)} days | Time scale: ${state.timeScale}x | Bodies: ${bodies.length}`;

    // mini map
    drawMiniMap();

    spawnShooting();

    requestAnimationFrame(frame);
  }

  function drawBackground(){
    const w = canvas.width/DPR, h = canvas.height/DPR;
    // deep space gradient
    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,'#02020a'); g.addColorStop(1,'#05021a');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

    // stars
    const cx = w/2, cy = h/2;
    for(const s of stars){
      const x = s.x * w; const y = s.y * h;
      ctx.globalAlpha = s.alpha * (0.7 + 0.3*Math.sin(state.simTime*0.001 + x*0.01));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x,y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // nebula soft overlay
    if(state.effects){
      const grad = ctx.createRadialGradient(cx*0.7, cy*0.3, 10, cx, cy, Math.max(w,h));
      grad.addColorStop(0,'rgba(120,40,180,0.06)');
      grad.addColorStop(0.5,'rgba(0,160,255,0.02)');
      grad.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    }
  }

  // Draw the orbital tracks behind all planets and labels.
  // These paths are purely visual guides, not physical trajectories.
  function drawOrbits(){
    const cx = canvas.width/DPR/2, cy = canvas.height/DPR/2;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Use a fixed screen-space stroke width by compensating for camera zoom.
    // This makes the orbit lines appear uniform whether the user zooms in or out.
    ctx.lineWidth = 0.7 / Math.max(0.0001, cam.zoom);
    ctx.strokeStyle = '#6b6b6a';
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    for(const b of bodies){
      if(!b.orbit || b.orbit.a===0) continue;
      const a = b.orbit.a * AU;
      const e = b.orbit.e||0;
      const bMinor = a*Math.sqrt(1-e*e);
      ctx.beginPath();
      // draw ellipse using the same orbital radii as the planet animation
      ctx.ellipse(0,0, a*scale, bMinor*scale, 0, 0, Math.PI*2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBody(b, pos){
    const screen = worldToScreen(pos.x*scale, pos.y*scale);
    const r = visualRadius(b.radius);
    // glow / light
    if(b.id==='sun'){
      const grad = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, r*8);
      grad.addColorStop(0, 'rgba(255,238,150,0.9)'); grad.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(screen.x, screen.y, r*8,0,Math.PI*2); ctx.fill();
    }
    // planet body
    ctx.beginPath(); ctx.fillStyle = b.color || '#888'; ctx.arc(screen.x, screen.y, r,0,Math.PI*2); ctx.fill();
    // subtle lighting highlight
    ctx.beginPath(); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.arc(screen.x - r*0.35, screen.y - r*0.35, r*0.7, 0, Math.PI*2); ctx.fill();

    // rings
    if(b.rings){
      ctx.save(); ctx.translate(screen.x, screen.y); ctx.rotate(0.6);
      ctx.beginPath(); ctx.ellipse(0,0, r*2.4, r*1.0, 0, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(200,180,150,0.6)'; ctx.lineWidth = Math.max(1, r*0.8); ctx.stroke();
      ctx.restore();
    }

    // labels
    if(state.showLabels){
      ctx.font = '12px Inter, system-ui'; ctx.fillStyle = '#dfeeff'; ctx.textAlign = 'center';
      ctx.fillText(b.name, screen.x, screen.y - r - 8);
    }
  }

  function drawMiniMap(){
    // simple top-down overview
    const w = mini.width/DPR, h = mini.height/DPR; miniCtx.clearRect(0,0,w,h);
    miniCtx.fillStyle = 'rgba(5,8,18,0.9)'; miniCtx.fillRect(0,0,w,h);
    miniCtx.save(); miniCtx.translate(w/2,h/2);
    const mScale = 12 / AU; // shrink
    for(const b of bodies){
      const pos = computeBodyWorld(b, state.simTime);
      const x = pos.x * mScale; const y = pos.y * mScale;
      miniCtx.beginPath(); miniCtx.fillStyle = b.color || '#fff'; miniCtx.arc(x,y,2,0,Math.PI*2); miniCtx.fill();
    }
    miniCtx.restore();
  }

  // UI bindings
  playPauseBtn.addEventListener('click', ()=>{ state.running = !state.running; playPauseBtn.textContent = state.running? 'Pause':'Play'; });
  timeScaleEl.addEventListener('input', ()=>{ state.timeScale = Number(timeScaleEl.value); });
  toggleOrbits.addEventListener('change', ()=>{ state.showOrbits = toggleOrbits.checked; });
  toggleLabels.addEventListener('change', ()=>{ state.showLabels = toggleLabels.checked; });
  toggleEffects.addEventListener('change', ()=>{ state.effects = toggleEffects.checked; });

  // startup animation end
  setTimeout(()=>{ startup.style.display='none'; }, 4200);

  // Kick off render
  requestAnimationFrame(frame);

})();
