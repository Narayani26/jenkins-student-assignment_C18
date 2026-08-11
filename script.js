// --- SUPABASE INITIALIZATION ---

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEYSUPABASE_ANON_KEY);

// DOM Element References
const canvas = document.getElementById('game-screen');
const sCtx = canvas.getContext('2d');
const audio = document.getElementById('streamPlayer');

const drawCanvas = document.getElementById('drawCanvas');
const dCtx = drawCanvas.getContext('2d');

const studioModal = document.getElementById('studio-modal');
const openStudioBtn = document.getElementById('openStudioBtn');
const cancelStudioBtn = document.getElementById('cancelStudioBtn');
const bakeAssetBtn = document.getElementById('bakeAssetBtn');
const summonBtn = document.getElementById('summonBtn');
const ghostNameInput = document.getElementById('ghostName');
const trackUrlInput = document.getElementById('trackUrl');

// State Variables
let brushColor = '#ff4757';
let accessoryDataUrl = null;
let drawingModeActive = false;
let lastX = 0;
let lastY = 0;

let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let soundWavesArray = new Uint8Array(16);

let activeGhosts = [];
let starsField = [];
let currentlySingingGhost = null;
let synthInterval = null;

// Keep main game canvas retro pixelated, but keep drawing canvas smooth
sCtx.imageSmoothingEnabled = false;
dCtx.imageSmoothingEnabled = true;

// Starfield setup
for (let i = 0; i < 35; i++) {
    starsField.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.floor(Math.random() * 2) + 2,
        speed: Math.random() * 0.4 + 0.1
    });
}

// Modal Control
function toggleStudio(open) {
    studioModal.style.display = open ? 'flex' : 'none';
    if (open) {
        dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
}

// Color Palette
document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        brushColor = e.target.getAttribute('data-color');
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        e.target.classList.add('active');
    });
});

// Smooth Freehand Vector Drawing Engine
function getMouseCoords(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

drawCanvas.addEventListener('mousedown', (e) => {
    drawingModeActive = true;
    const coords = getMouseCoords(e);
    lastX = coords.x;
    lastY = coords.y;
});

drawCanvas.addEventListener('mousemove', (e) => {
    if (!drawingModeActive) return;
    const coords = getMouseCoords(e);

    dCtx.beginPath();
    dCtx.moveTo(lastX, lastY);
    dCtx.lineTo(coords.x, coords.y);
    dCtx.strokeStyle = brushColor;
    dCtx.lineWidth = 4;
    dCtx.lineCap = 'round';
    dCtx.lineJoin = 'round';
    dCtx.stroke();

    lastX = coords.x;
    lastY = coords.y;
});

window.addEventListener('mouseup', () => drawingModeActive = false);

openStudioBtn.addEventListener('click', () => toggleStudio(true));
cancelStudioBtn.addEventListener('click', () => toggleStudio(false));

bakeAssetBtn.addEventListener('click', () => {
    accessoryDataUrl = drawCanvas.toDataURL();
    toggleStudio(false);
});

// Pixel Ghost Entity Class
class GameGhost {
    constructor(id, name, streamUrl, accessoryImgSrc, x, y) {
        this.id = id;
        this.name = name.toUpperCase() || "BLOOKY";
        this.url = streamUrl;
        
        this.accessory = null;
        if (accessoryImgSrc) {
            this.accessory = new Image();
            this.accessory.src = accessoryImgSrc;
        }
        
        this.x = x !== undefined ? x : Math.random() * (canvas.width - 120) + 40;
        this.y = y !== undefined ? y : Math.random() * (canvas.height - 180) + 40;
        this.vx = (Math.random() - 0.5) * 1.4;
        this.vy = (Math.random() - 0.5) * 1.4;
        this.width = 44;
        this.height = 52;
        this.animationTick = Math.random() * 100;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 10 || this.x > canvas.width - this.width - 10) this.vx *= -1;
        if (this.y < 10 || this.y > canvas.height - this.height - 70) this.vy *= -1;
        
        this.animationTick += 0.05;
        this.hoverY = Math.sin(this.animationTick) * 6;
    }

    draw() {
        const px = Math.floor(this.x);
        const py = Math.floor(this.y + this.hoverY);
        sCtx.save();

        // 1. Reactive Sound Ring
        if (currentlySingingGhost === this && soundWavesArray.length > 0) {
            let spectrumSum = 0;
            for (let i = 0; i < 8; i++) spectrumSum += soundWavesArray[i];
            let intensityDelta = (spectrumSum / 8) * 0.18;
            sCtx.strokeStyle = 'rgba(92, 250, 222, 0.2)';
            sCtx.lineWidth = 3;
            sCtx.strokeRect(px - intensityDelta / 2, py - intensityDelta / 2, this.width + intensityDelta, this.height + intensityDelta);
        }

        // 2. Ghost Body
        sCtx.fillStyle = '#100b26';
        sCtx.fillRect(px + 8, py, 28, 52);
        sCtx.fillRect(px, py + 8, 44, 40);

        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(px + 10, py + 2, 24, 46);
        sCtx.fillRect(px + 4, py + 6, 36, 42);
        sCtx.fillRect(px + 2, py + 10, 40, 38);

        // Animated Tail Folds
        sCtx.fillStyle = '#9aa1c2';
        const waveState = Math.floor(this.animationTick * 2) % 2 === 0;
        if (waveState) {
            sCtx.fillRect(px + 4, py + 44, 6, 4);
            sCtx.fillRect(px + 18, py + 44, 6, 4);
            sCtx.fillRect(px + 32, py + 44, 6, 4);
        } else {
            sCtx.fillRect(px + 10, py + 44, 6, 4);
            sCtx.fillRect(px + 24, py + 44, 6, 4);
            sCtx.fillRect(px + 38, py + 44, 4, 4);
        }

        // Face & Eyes
        sCtx.fillStyle = '#100b26';
        const eyeSync = (currentlySingingGhost === this) ? -3 : 0;
        sCtx.fillRect(px + 14, py + 16 + eyeSync, 6, 10);
        sCtx.fillRect(px + 24, py + 16 + eyeSync, 6, 10);
        
        if (currentlySingingGhost === this) {
            sCtx.fillRect(px + 19, py + 30, 6, 6);
        } else {
            sCtx.fillRect(px + 21, py + 31, 2, 3);
        }

        // 3. Singing Headphones
        if (currentlySingingGhost === this) {
            sCtx.fillStyle = '#100b26';
            sCtx.fillRect(px + 8, py - 2, 28, 4);
            sCtx.fillRect(px + 2, py + 10, 4, 12);
            sCtx.fillRect(px + 38, py + 10, 4, 12);

            sCtx.fillStyle = '#fffb00';
            const sparkFrame = Math.floor(this.animationTick * 3) % 3;
            if (sparkFrame === 0) {
                sCtx.fillRect(px - 10, py + 10, 3, 3);
                sCtx.fillRect(px + 50, py + 25, 3, 3);
            } else if (sparkFrame === 1) {
                sCtx.fillRect(px - 6, py + 22, 3, 3);
                sCtx.fillRect(px + 46, py + 5, 3, 3);
            }
        }

        // 4. Render Smooth Custom Accessory Asset
        if (this.accessory && this.accessory.complete) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.drawImage(this.accessory, px + 2, py - 24, 40, 40);
            sCtx.imageSmoothingEnabled = false;
        }

        // 5. Name Tag
        sCtx.fillStyle = (currentlySingingGhost === this) ? '#ff007f' : '#5cfade';
        sCtx.font = '9px "Courier New"';
        sCtx.textAlign = 'center';
        sCtx.fillText(this.name, px + this.width / 2, py + this.height + 14);
        sCtx.restore();
    }

    checkHitClick(mx, my) {
        return (mx >= this.x && mx <= this.x + this.width && my >= this.y + this.hoverY && my <= this.y + this.height + this.hoverY);
    }
}

// FETCH EXISTING GHOSTS FROM SUPABASE
async function fetchGhosts() {
    const { data, error } = await supabase.from('ghosts').select('*');
    if (error) {
        console.error('Error fetching ghosts:', error);
        return;
    }
    
    activeGhosts = [];
    if (data && data.length > 0) {
        data.forEach(g => {
            activeGhosts.push(new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y));
        });
    } else {
        // Fallback initial ghost if database is completely empty
        activeGhosts.push(new GameGhost("default", "BLOOKY", "", "", 200, 100));
    }
}

// SUBSCRIBE TO REALTIME CHANGES (Syncs instantly across all connected users)
function subscribeToGhosts() {
    supabase
        .channel('public:ghosts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghosts' }, (payload) => {
            const g = payload.new;
            // Add new ghost live without needing to reload
            activeGhosts.push(new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y));
        })
        .subscribe();
}

// SAVE NEW GHOST TO SUPABASE
summonBtn.addEventListener('click', async () => {
    const newGhost = {
        name: ghostNameInput.value.trim() || "BLOOKY",
        url: trackUrlInput.value.trim(),
        accessory: accessoryDataUrl || "",
        x: Math.random() * (canvas.width - 120) + 40,
        y: Math.random() * (canvas.height - 180) + 40
    };

    const { error } = await supabase.from('ghosts').insert([newGhost]);
    if (error) {
        console.error('Error saving ghost:', error);
    }

    ghostNameInput.value = "";
    trackUrlInput.value = "";
    accessoryDataUrl = null;
});

// Audio Engine Setup
function initializeSystemAudioEngine() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 32;
    audioSource = audioContext.createMediaElementSource(audio);
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);
    soundWavesArray = new Uint8Array(audioAnalyser.frequencyBinCount);
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    initializeSystemAudioEngine();

    activeGhosts.forEach(ghost => {
        if (ghost.checkHitClick(clickX, clickY)) {
            toggleGhostMusicTrack(ghost);
        }
    });
});

function toggleGhostMusicTrack(ghost) {
    if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
    }

    if (currentlySingingGhost === ghost) {
        audio.pause();
        currentlySingingGhost = null;
        return;
    }

    currentlySingingGhost = ghost;

    if (!ghost.url) {
        const frequencies = [261.63, 293.66, 329.63, 392.00, 440.00];
        synthInterval = setInterval(() => {
            if (currentlySingingGhost !== ghost) return;
            
            let osc = audioContext.createOscillator();
            let gain = audioContext.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequencies[Math.floor(Math.random() * frequencies.length)], audioContext.currentTime);
            
            gain.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.start();
            osc.stop(audioContext.currentTime + 0.3);

            for (let i = 0; i < soundWavesArray.length; i++) {
                soundWavesArray[i] = Math.floor(Math.random() * 150) + 50;
            }
        }, 250);
    } else {
        audio.src = ghost.url;
        audio.play().catch(err => {
            console.log("Audio link connection failed or blocked by CORS: ", err);
            currentlySingingGhost = null;
        });
    }
}

audio.addEventListener('ended', () => { currentlySingingGhost = null; });

// Render Loop
function gameMainLoop() {
    sCtx.fillStyle = '#0c102b';
    sCtx.fillRect(0, 0, canvas.width, canvas.height);

    if (audioAnalyser && currentlySingingGhost && audio.src && !audio.paused) {
        audioAnalyser.getByteFrequencyData(soundWavesArray);
    } else if (!currentlySingingGhost) {
        for (let i = 0; i < soundWavesArray.length; i++) {
            soundWavesArray[i] *= 0.85;
        }
    }

    // Visualizer Panels
    const totalBars = 16;
    const barThickness = canvas.width / totalBars;
    for (let i = 0; i < totalBars; i++) {
        const byteVal = soundWavesArray[i] || 0;
        const panelHeight = Math.floor((byteVal / 255) * 110);
        sCtx.fillStyle = 'rgba(114, 9, 183, 0.09)';
        sCtx.fillRect(i * barThickness, canvas.height - panelHeight - 40, barThickness - 4, panelHeight);
    }

    // Stars
    starsField.forEach(star => {
        let currentSpeedFactor = 1;
        if (currentlySingingGhost && soundWavesArray.length > 0) {
            currentSpeedFactor = 1 + (soundWavesArray[2] / 40);
        }
        star.y += star.speed * currentSpeedFactor;
        if (star.y > canvas.height) star.y = 0;
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
    });

    // Moon
    sCtx.fillStyle = 'rgba(0, 221, 255, 0.15)';
    sCtx.fillRect(44, 44, 48, 48);
    sCtx.fillStyle = '#5cfade';
    sCtx.fillRect(48, 48, 40, 40);

    // City Skyline
    sCtx.fillStyle = '#080517';
    sCtx.fillRect(0, canvas.height - 35, canvas.width, 35);
    sCtx.fillRect(0, canvas.height - 50, 40, 15);
    sCtx.fillRect(80, canvas.height - 42, 30, 7);
    sCtx.fillRect(160, canvas.height - 55, 25, 20);
    sCtx.fillRect(280, canvas.height - 48, 50, 13);
    sCtx.fillRect(390, canvas.height - 60, 35, 25);
    sCtx.fillRect(460, canvas.height - 45, 30, 10);

    // Render Ghosts
    activeGhosts.forEach(ghost => {
        ghost.update();
        ghost.draw();
    });

    requestAnimationFrame(gameMainLoop);
}

// Initialize Supabase Data & Start Engine Loop
fetchGhosts();
subscribeToGhosts();
gameMainLoop();