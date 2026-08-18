// --- SUPABASE CLIENT SETUP ---
let supabaseClient = null;
try {
    if (typeof CONFIG !== 'undefined' && window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn("Supabase init skipped:", e);
}

// DOM Elements
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
const shareBtn = document.getElementById('shareBtn');
const muteToggleBtn = document.getElementById('muteToggleBtn');
const ghostNameInput = document.getElementById('ghostName');
const ghostQuoteInput = document.getElementById('ghostQuote');
const trackUrlInput = document.getElementById('trackUrl');
const audioFileInput = document.getElementById('audioFileInput');

// State Variables
let brushColor = '#ff4757';
let accessoryDataUrl = null;
let customAudioDataUrl = null;
let drawingModeActive = false;
let lastX = 0;
let lastY = 0;

let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let masterGainNode = null;
let soundWavesArray = new Uint8Array(16);

let activeGhosts = [];
let starsField = [];
let windParticles = [];
let cursorParticles = [];
let smokeParticles = [];

let currentlySingingGhost = null;
let synthInterval = null;
let UI_OFFSET = 120;
let isMuted = false;

// Mouse & Touch Pointer Tracker
let currentPointerPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

function updatePointerPosition(clientX, clientY) {
    currentPointerPos.x = clientX;
    currentPointerPos.y = clientY;
    if (currentlySingingGhost) {
        spawnCursorParticle(clientX, clientY);
    }
}

window.addEventListener('mousemove', (e) => {
    updatePointerPosition(e.clientX, e.clientY);
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 0) {
        updatePointerPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: true });

// --- INSTANT ZERO-LATENCY MUTE ENGINE ---
function toggleMuteState(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    isMuted = !isMuted;
    
    audio.muted = isMuted;
    audio.volume = isMuted ? 0 : 1;

    if (masterGainNode && audioContext) {
        masterGainNode.gain.setValueAtTime(isMuted ? 0 : 1, audioContext.currentTime);
    }

    if (muteToggleBtn) {
        muteToggleBtn.innerText = isMuted ? "🔇" : "🔊";
    }
}

if (muteToggleBtn) {
    muteToggleBtn.addEventListener('pointerdown', toggleMuteState, true);
    muteToggleBtn.addEventListener('click', toggleMuteState, true);
}

// Cursor Particles
function spawnCursorParticle(x, y) {
    cursorParticles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        size: Math.random() * 3 + 2,
        alpha: 1,
        color: Math.random() > 0.5 ? '#ff007f' : '#5cfade',
        vy: -Math.random() * 1.5 - 0.5
    });
    if (cursorParticles.length > 20) cursorParticles.shift();
}

// --- MAGICIAN SMOKE "POOF!" ANIMATION ---
function spawnSmokePoof(x, y) {
    for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2.2 + 0.5;
        smokeParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.4,
            size: Math.random() * 8 + 5,
            alpha: 0.85,
            color: Math.random() > 0.5 ? 'rgba(200, 200, 230,' : 'rgba(130, 110, 170,'
        });
    }
}

// Dynamic Canvas Resize
function resizeCanvasToWindow() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    sCtx.imageSmoothingEnabled = false;

    const deck = document.getElementById('floating-deck');
    if (deck) {
        UI_OFFSET = deck.offsetHeight + 20;
    }
}
window.addEventListener('resize', resizeCanvasToWindow);
resizeCanvasToWindow();

dCtx.imageSmoothingEnabled = true;

// Parallax Starfield & Wind Setup
for (let i = 0; i < 60; i++) {
    starsField.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.floor(Math.random() * 2) + 2,
        speed: Math.random() * 0.4 + 0.1
    });
}

for (let i = 0; i < 25; i++) {
    windParticles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * (window.innerHeight - UI_OFFSET),
        length: Math.random() * 40 + 20,
        speed: Math.random() * 2 + 1,
        alpha: Math.random() * 0.25 + 0.05
    });
}

function getMaxGhostLimit() {
    const w = window.innerWidth;
    if (w < 600) return 8;       
    if (w < 1024) return 16;     
    return 30;                   
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// LOCALSTORAGE CACHE HELPERS
function getCachedGhosts() {
    try {
        const cached = localStorage.getItem('pixel_ghost_cache_prod_final');
        return cached ? JSON.parse(cached) : null;
    } catch (e) { return null; }
}

function setCachedGhosts(data) {
    try {
        const serializable = data.map(g => ({
            id: g.id,
            name: g.name,
            url: g.url,
            accessory: g.accessory ? g.accessory.src : "",
            x: g.x,
            y: g.y,
            quote: g.quote || ""
        }));
        localStorage.setItem('pixel_ghost_cache_prod_final', JSON.stringify(serializable));
    } catch (e) {}
}

// Music Validation
function isValidMusicUrl(url) {
    if (!url) return false;
    const cleanUrl = url.trim().toLowerCase();
    const isPlatform = cleanUrl.includes('music.youtube.com') || cleanUrl.includes('youtube.com/watch') || cleanUrl.includes('youtu.be/') || cleanUrl.includes('spotify.com') || cleanUrl.includes('soundcloud.com') || cleanUrl.includes('music.apple.com');
    const isDirectAudio = /\.(mp3|wav|m4a|aac|flac|ogg)(\?.*)?$/i.test(cleanUrl) || cleanUrl.startsWith('data:audio/');
    return isPlatform || isDirectAudio;
}

async function validateAudioIsSong(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const tempContext = new (window.AudioContext || window.webkitAudioContext)();
                const buffer = await tempContext.decodeAudioData(e.target.result.slice(0));
                if (buffer.duration < 15) { tempContext.close(); return resolve(false); }

                const channelData = buffer.getChannelData(0);
                let totalEnergy = 0, nonZeroSamples = 0;
                for (let i = 0; i < channelData.length; i += 100) {
                    const sample = Math.abs(channelData[i]);
                    totalEnergy += sample;
                    if (sample > 0.01) nonZeroSamples++;
                }

                tempContext.close();
                resolve((nonZeroSamples / (channelData.length / 100)) > 0.35 && (totalEnergy / (channelData.length / 100)) > 0.02);
            } catch (err) { resolve(false); }
        };
        reader.readAsArrayBuffer(file);
    });
}

if (audioFileInput) {
    audioFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            summonBtn.innerText = "Checking... 🎵";
            summonBtn.disabled = true;
            const isSong = await validateAudioIsSong(file);
            summonBtn.disabled = false;
            summonBtn.innerText = "Summon 👻";

            if (!isSong) {
                alert("That's not a song! 🎵 Only music files are allowed.");
                audioFileInput.value = "";
                trackUrlInput.value = "";
                customAudioDataUrl = null;
                return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                customAudioDataUrl = ev.target.result;
                trackUrlInput.value = file.name;
            };
            reader.readAsDataURL(file);
        }
    });
}

// Drawing Studio Modal Controls
function toggleStudio(open) {
    studioModal.style.display = open ? 'flex' : 'none';
    if (open) dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        brushColor = e.currentTarget.getAttribute('data-color');
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        e.currentTarget.classList.add('active');
    });
});

function getCanvasCoords(e) {
    const rect = drawCanvas.getBoundingClientRect();
    let clientX = e.clientX, clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    return {
        x: (clientX - rect.left) * (drawCanvas.width / rect.width),
        y: (clientY - rect.top) * (drawCanvas.height / rect.height)
    };
}

function startDrawing(e) {
    drawingModeActive = true;
    const coords = getCanvasCoords(e);
    lastX = coords.x; lastY = coords.y;
}

function drawLine(e) {
    if (!drawingModeActive) return;
    if (e.cancelable) e.preventDefault();
    const coords = getCanvasCoords(e);
    dCtx.beginPath();
    dCtx.moveTo(lastX, lastY);
    dCtx.lineTo(coords.x, coords.y);
    dCtx.strokeStyle = brushColor;
    dCtx.lineWidth = 4;
    dCtx.lineCap = 'round';
    dCtx.lineJoin = 'round';
    dCtx.globalCompositeOperation = (brushColor === 'transparent') ? 'destination-out' : 'source-over';
    dCtx.stroke();
    lastX = coords.x; lastY = coords.y;
}

function stopDrawing() { drawingModeActive = false; }

drawCanvas.addEventListener('mousedown', startDrawing);
drawCanvas.addEventListener('mousemove', drawLine);
window.addEventListener('mouseup', stopDrawing);
drawCanvas.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); startDrawing(e); }, { passive: false });
drawCanvas.addEventListener('touchmove', drawLine, { passive: false });
window.addEventListener('touchend', stopDrawing);

if (openStudioBtn) openStudioBtn.addEventListener('click', () => toggleStudio(true));
if (cancelStudioBtn) cancelStudioBtn.addEventListener('click', () => toggleStudio(false));
if (bakeAssetBtn) bakeAssetBtn.addEventListener('click', () => {
    accessoryDataUrl = drawCanvas.toDataURL();
    toggleStudio(false);
});

// Ghost Entity Blueprint
class GameGhost {
    constructor(id, name, streamUrl, accessoryImgSrc, x, y, quote) {
        this.id = id || Date.now().toString();
        this.name = name ? name.toUpperCase() : "BLOOKY";
        this.url = streamUrl || "";
        this.quote = quote || "BOO!";
        this.hasOpenedExternalTab = false;
        
        this.accessory = null;
        if (accessoryImgSrc) {
            this.accessory = new Image();
            this.accessory.src = accessoryImgSrc;
        }
        
        this.width = 44;
        this.height = 52;
        const maxX = Math.max(20, canvas.width - this.width - 20);
        const maxY = Math.max(20, canvas.height - this.height - UI_OFFSET - 20);

        this.x = (x !== undefined && x < maxX) ? x : Math.random() * maxX + 10;
        this.y = (y !== undefined && y < maxY) ? y : Math.random() * maxY + 10;
        
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.animationTick = Math.random() * 100;

        this.expressionsList = ['HAPPY', 'SPOOKY', 'FUNNY', 'SAD'];
        this.expression = this.expressionsList[Math.floor(Math.random() * this.expressionsList.length)];
        this.expressionTimer = Math.floor(Math.random() * 180) + 120;

        this.isBooped = false;
        this.boopTimer = 0;
        this.showQuoteTimer = 0;

        this.randomThought = "";
        this.thoughtTimer = 0;
    }

    triggerBoop() {
        this.isBooped = true;
        this.boopTimer = 40;
        this.vy = -2;
        playBoopSqueakSound();
    }

    update() {
        if (this.boopTimer > 0) this.boopTimer--;
        else this.isBooped = false;

        if (this.showQuoteTimer > 0) this.showQuoteTimer--;

        if (this.expressionTimer > 0) {
            this.expressionTimer--;
        } else {
            this.expression = this.expressionsList[Math.floor(Math.random() * this.expressionsList.length)];
            this.expressionTimer = Math.floor(Math.random() * 180) + 120;
        }

        if (Math.random() < 0.003 && currentlySingingGhost !== this) {
            this.vx *= -1;
            if (Math.random() < 0.5) this.vy = -1.2;
        }

        if (this.thoughtTimer > 0) {
            this.thoughtTimer--;
        } else if (Math.random() < 0.004) {
            const thoughts = ["♪", "✨", "BOO!", "zZZ", "⚡", "🌸"];
            this.randomThought = thoughts[Math.floor(Math.random() * thoughts.length)];
            this.thoughtTimer = 120;
        }

        if (currentlySingingGhost === this) {
            const targetX = currentPointerPos.x - this.width / 2;
            const targetY = currentPointerPos.y - this.height / 2;
            this.x += (targetX - this.x) * 0.03;
            this.y += (targetY - this.y) * 0.03;
        } else {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 10) { this.vx = Math.abs(this.vx); this.x = 11; }
            else if (this.x > canvas.width - this.width - 10) { this.vx = -Math.abs(this.vx); this.x = canvas.width - this.width - 11; }

            const maxAllowedY = canvas.height - this.height - UI_OFFSET;
            if (this.y < 10) { this.vy = Math.abs(this.vy); this.y = 11; }
            else if (this.y > maxAllowedY) { this.vy = -Math.abs(this.vy); this.y = Math.max(10, maxAllowedY - 2); }
        }
        
        this.animationTick += 0.04;
        this.hoverY = Math.sin(this.animationTick) * 5;
    }

    draw() {
        const px = Math.floor(this.x);
        const py = Math.floor(this.y + this.hoverY);
        sCtx.save();

        if (currentlySingingGhost === this && soundWavesArray.length > 0) {
            let spectrumSum = 0;
            for (let i = 0; i < 8; i++) spectrumSum += soundWavesArray[i];
            let intensityDelta = (spectrumSum / 8) * 0.2;
            sCtx.strokeStyle = 'rgba(92, 250, 222, 0.5)';
            sCtx.lineWidth = 3;
            sCtx.strokeRect(px - intensityDelta / 2, py - intensityDelta / 2, this.width + intensityDelta, this.height + intensityDelta);
        }

        sCtx.fillStyle = '#100b26';
        sCtx.fillRect(px + 8, py, 28, 52);
        sCtx.fillRect(px, py + 8, 44, 40);

        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(px + 10, py + 2, 24, 46);
        sCtx.fillRect(px + 4, py + 6, 36, 42);
        sCtx.fillRect(px + 2, py + 10, 40, 38);

        sCtx.fillStyle = '#9aa1c2';
        if (Math.floor(this.animationTick * 2) % 2 === 0) {
            sCtx.fillRect(px + 4, py + 44, 6, 4);
            sCtx.fillRect(px + 18, py + 44, 6, 4);
            sCtx.fillRect(px + 32, py + 44, 6, 4);
        } else {
            sCtx.fillRect(px + 10, py + 44, 6, 4);
            sCtx.fillRect(px + 24, py + 44, 6, 4);
            sCtx.fillRect(px + 38, py + 44, 4, 4);
        }

        sCtx.fillStyle = '#100b26';
        const eyeSync = (currentlySingingGhost === this) ? -3 : 0;

        if (this.expression === 'HAPPY' || currentlySingingGhost === this) {
            sCtx.fillRect(px + 14, py + 16 + eyeSync, 6, 10);
            sCtx.fillRect(px + 24, py + 16 + eyeSync, 6, 10);
            sCtx.fillRect(px + 19, py + 30, 6, 6);
        } else if (this.expression === 'SPOOKY') {
            sCtx.fillRect(px + 12, py + 14, 8, 12);
            sCtx.fillRect(px + 24, py + 14, 8, 12);
            sCtx.fillRect(px + 18, py + 31, 8, 4);
        } else if (this.expression === 'FUNNY') {
            sCtx.fillRect(px + 14, py + 18, 6, 4);
            sCtx.fillRect(px + 24, py + 14, 6, 10);
            sCtx.fillRect(px + 20, py + 30, 4, 6);
        } else {
            sCtx.fillRect(px + 14, py + 18, 6, 8);
            sCtx.fillRect(px + 24, py + 18, 6, 8);
            sCtx.fillRect(px + 20, py + 32, 4, 2);
        }
        
        if (this.isBooped) {
            sCtx.fillStyle = '#ff75a0';
            sCtx.fillRect(px + 8, py + 24, 6, 4);
            sCtx.fillRect(px + 30, py + 24, 6, 4);
        }

        if (currentlySingingGhost === this) {
            sCtx.fillStyle = '#ff007f';
            sCtx.fillRect(px + 8, py - 2, 28, 4);
            sCtx.fillRect(px + 2, py + 10, 5, 14);
            sCtx.fillRect(px + 37, py + 10, 5, 14);

            sCtx.fillStyle = '#fffb00';
            const sparkFrame = Math.floor(this.animationTick * 3) % 3;
            if (sparkFrame === 0) {
                sCtx.fillRect(px - 10, py + 10, 3, 3);
                sCtx.fillRect(px + 50, py + 25, 3, 3);
            }
        }

        if (this.accessory && this.accessory.complete) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.drawImage(this.accessory, px + 2, py - 24, 40, 40);
            sCtx.imageSmoothingEnabled = false;
        }

        sCtx.fillStyle = (currentlySingingGhost === this) ? '#ff007f' : '#5cfade';
        sCtx.font = '10px "Courier New"';
        sCtx.textAlign = 'center';
        sCtx.fillText(this.name, px + this.width / 2, py + this.height + 14);

        if (this.showQuoteTimer > 0 && this.quote) {
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(px - 20, py - 35, 84, 18);
            sCtx.fillStyle = '#100b26';
            sCtx.fillRect(px - 18, py - 33, 80, 14);
            sCtx.fillStyle = '#5cfade';
            sCtx.font = '8px "Courier New"';
            sCtx.fillText(this.quote, px + 22, py - 23);
        } else if (this.thoughtTimer > 0) {
            sCtx.fillStyle = 'rgba(255,255,255,0.9)';
            sCtx.fillRect(px + 36, py - 12, 16, 14);
            sCtx.fillStyle = '#100b26';
            sCtx.font = '10px "Courier New"';
            sCtx.fillText(this.randomThought, px + 44, py - 2);
        }

        sCtx.restore();
    }

    checkHitClick(mx, my) {
        return (mx >= this.x && mx <= this.x + this.width && my >= this.y + this.hoverY && my <= this.y + this.height + this.hoverY);
    }
}

// 8-Bit Squeak Boop Generator
function playBoopSqueakSound() {
    if (!audioContext) return;
    try {
        let osc = audioContext.createOscillator();
        let gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        gain.gain.setValueAtTime(isMuted ? 0 : 0.1, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(masterGainNode || audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.1);
    } catch(e) {}
}

// INSTANT NON-BLOCKING STREAMING FETCH ENGINE
async function fetchGhosts() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('ghosts').select('*');
        if (error || !data || data.length === 0) return;

        const limit = getMaxGhostLimit();
        const remoteGhosts = data.filter(g => g.name !== "BLOOKY" && g.id !== "default_1");

        let selectedGhostsData = remoteGhosts;
        if (remoteGhosts.length > limit - 1) {
            selectedGhostsData = shuffleArray(remoteGhosts).slice(0, limit - 1);
        }

        // Seamless 0ms merge
        selectedGhostsData.forEach((g, idx) => {
            if (!activeGhosts.some(existing => existing.id === g.id)) {
                setTimeout(() => {
                    const newG = new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y, g.quote || "BOO!");
                    activeGhosts.push(newG);
                    spawnSmokePoof(newG.x + 22, newG.y + 26);
                    setCachedGhosts(activeGhosts);
                }, idx * 100);
            }
        });
    } catch (err) {}
}

function subscribeToGhosts() {
    if (!supabaseClient) return;
    try {
        supabaseClient
            .channel('public:ghosts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghosts' }, (payload) => {
                const g = payload.new;
                if (!activeGhosts.some(existing => existing.id === g.id)) {
                    if (activeGhosts.length >= getMaxGhostLimit() && activeGhosts.length > 1) {
                        activeGhosts.splice(1, 1);
                    }
                    const newG = new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y, g.quote || "BOO!");
                    activeGhosts.push(newG);
                    spawnSmokePoof(newG.x + 22, newG.y + 26);
                    setCachedGhosts(activeGhosts);
                }
            })
            .subscribe();
    } catch (err) {}
}

// Share Button
if (shareBtn) {
    shareBtn.addEventListener('click', () => {
        const target = currentlySingingGhost || activeGhosts[0];
        if (target) {
            const shareUrl = `${window.location.origin}${window.location.pathname}?ghost=${target.id}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert(`Link for ${target.name} copied to clipboard! 🔗\n${shareUrl}`);
            }).catch(() => {
                alert(`Share Link: ${shareUrl}`);
            });
        }
    });
}

// Summon Button (With Full Persistence & Error Alerts)
if (summonBtn) {
    summonBtn.addEventListener('click', async () => {
        const rawUrlInput = trackUrlInput.value.trim();
        const finalAudioUrl = customAudioDataUrl || rawUrlInput;

        if (rawUrlInput && !customAudioDataUrl && !isValidMusicUrl(rawUrlInput)) {
            alert("That's not a song! 🎵 Please paste a valid YouTube Music, Spotify, SoundCloud, or MP3 link.");
            return;
        }

        if (!finalAudioUrl) {
            alert("Please paste a song link or upload a music file!");
            return;
        }

        const spawnX = Math.floor(Math.random() * (canvas.width - 100) + 20);
        const spawnY = Math.floor(Math.random() * Math.max(50, canvas.height - 100 - UI_OFFSET) + 20);

        spawnSmokePoof(spawnX + 22, spawnY + 26);

        const newGhostData = {
            name: ghostNameInput.value.trim() || "BLOOKY",
            quote: ghostQuoteInput.value.trim() || "BOO!",
            url: finalAudioUrl,
            accessory: accessoryDataUrl || "",
            x: spawnX,
            y: spawnY
        };

        if (activeGhosts.length >= getMaxGhostLimit() && activeGhosts.length > 1) {
            activeGhosts.splice(1, 1);
        }

        const tempId = "temp_" + Date.now();
        const newGhostObj = new GameGhost(tempId, newGhostData.name, newGhostData.url, newGhostData.accessory, newGhostData.x, newGhostData.y, newGhostData.quote);
        activeGhosts.push(newGhostObj);
        setCachedGhosts(activeGhosts);

        if (supabaseClient) {
            try {
                summonBtn.disabled = true;
                summonBtn.innerText = "Saving... ⏳";

                const { data, error } = await supabaseClient
                    .from('ghosts')
                    .insert([newGhostData])
                    .select();

                if (error) {
                    console.error("Supabase Error:", error);
                    alert(`Database Insert Error (${error.code}): ${error.message}`);
                } else if (data && data.length > 0) {
                    newGhostObj.id = data[0].id;
                    setCachedGhosts(activeGhosts);
                }
            } catch (err) {
                console.error("Network Exception:", err);
                alert("Network Connection Error: " + err.message);
            } finally {
                summonBtn.disabled = false;
                summonBtn.innerText = "Summon 👻";
            }
        }

        ghostNameInput.value = "";
        ghostQuoteInput.value = "";
        trackUrlInput.value = "";
        audioFileInput.value = "";
        accessoryDataUrl = null;
        customAudioDataUrl = null;
    });
}

function initializeSystemAudioEngine() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioAnalyser = audioContext.createAnalyser();
            audioAnalyser.fftSize = 32;
            
            masterGainNode = audioContext.createGain();
            masterGainNode.gain.setValueAtTime(isMuted ? 0 : 1, audioContext.currentTime);

            audioSource = audioContext.createMediaElementSource(audio);
            audioSource.connect(audioAnalyser);
            audioAnalyser.connect(masterGainNode);
            masterGainNode.connect(audioContext.destination);

            soundWavesArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        } catch (e) {
            console.warn("AudioContext init warning:", e);
        }
    }
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function startChiptuneSynthesizer(ghost) {
    if (synthInterval) clearInterval(synthInterval);
    const frequencies = [261.63, 293.66, 329.63, 392.00, 440.00];
    synthInterval = setInterval(() => {
        if (currentlySingingGhost !== ghost) return;
        if (audioContext && !isMuted) {
            let osc = audioContext.createOscillator();
            let gain = audioContext.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequencies[Math.floor(Math.random() * frequencies.length)], audioContext.currentTime);
            gain.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(masterGainNode || audioContext.destination);
            osc.start();
            osc.stop(audioContext.currentTime + 0.3);
        }
        for (let i = 0; i < soundWavesArray.length; i++) soundWavesArray[i] = Math.floor(Math.random() * 150) + 50;
    }, 250);
}

// Click / Double Boop Handling
let lastClickTime = 0;
let lastClickedGhost = null;

function handleCanvasClick(e) {
    const clickXRaw = e.clientX || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0);
    const clickYRaw = e.clientY || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0);
    
    if (clickXRaw > window.innerWidth - 70 && clickYRaw < 70) return;

    const rect = canvas.getBoundingClientRect();
    let clickX = clickXRaw - rect.left;
    let clickY = clickYRaw - rect.top;

    const currentTime = Date.now();

    activeGhosts.forEach(ghost => {
        if (ghost.checkHitClick(clickX, clickY)) {
            initializeSystemAudioEngine();
            ghost.showQuoteTimer = 180;

            if (lastClickedGhost === ghost && (currentTime - lastClickTime) < 300) {
                ghost.triggerBoop();
            } else {
                toggleGhostMusicTrack(ghost);
            }

            lastClickTime = currentTime;
            lastClickedGhost = ghost;
        }
    });
}

canvas.addEventListener('click', handleCanvasClick);

// PAUSE/RESUME & EXTERNAL LINK TOGGLE ENGINE
function toggleGhostMusicTrack(ghost) {
    if (synthInterval) { 
        clearInterval(synthInterval); 
        synthInterval = null; 
    }

    if (currentlySingingGhost === ghost) {
        const lowerUrl = ghost.url.toLowerCase();
        const isExternal = lowerUrl.includes('youtube.com') || 
                            lowerUrl.includes('youtu.be') || 
                            lowerUrl.includes('spotify.com') || 
                            lowerUrl.includes('soundcloud.com');

        if (isExternal) {
            window.open(ghost.url, '_blank');
            currentlySingingGhost = null;
            return;
        }

        if (!audio.paused && audio.src && audio.src !== "") {
            audio.pause();
        } else if (audio.paused && audio.src && audio.src !== "") {
            audio.play().catch(e => console.warn("Resume blocked:", e));
        } else {
            currentlySingingGhost = null;
        }
        return;
    }

    if (currentlySingingGhost) {
        currentlySingingGhost.hasOpenedExternalTab = false;
    }

    if (!audio.paused) audio.pause();

    currentlySingingGhost = ghost;

    if (!ghost.url || ghost.url.trim() === "") {
        audio.src = ""; 
        startChiptuneSynthesizer(ghost);
        return;
    }

    const lowerUrl = ghost.url.toLowerCase();

    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerUrl.includes('spotify.com') || lowerUrl.includes('soundcloud.com')) {
        audio.src = ""; 
        if (!ghost.hasOpenedExternalTab) {
            ghost.hasOpenedExternalTab = true;
            window.open(ghost.url, '_blank');
        }
        return;
    }

    if (audio.src && audio.src.includes(encodeURIComponent(ghost.url))) {
        audio.play().catch(err => console.warn("Direct play error:", err));
        return;
    }

    audio.pause();
    audio.src = ghost.url;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => { 
            console.warn("Direct audio error. Falling back to synth:", err);
            startChiptuneSynthesizer(ghost); 
        });
    }
}

audio.addEventListener('ended', () => { 
    currentlySingingGhost = null; 
    if (synthInterval) { clearInterval(synthInterval); synthInterval = null; }
});

// REAL-TIME ATMOSPHERIC SKY GRADIENT ENGINE WITH CELESTIAL SUN/MOON
function renderAtmosphericSky() {
    const now = new Date();
    const timeFrac = now.getHours() + now.getMinutes() / 60; 

    let gradient = sCtx.createLinearGradient(0, 0, 0, canvas.height);

    if (timeFrac >= 5 && timeFrac < 9) {
        // Dawn to Morning (Lavender / Purple Shift)
        gradient.addColorStop(0, '#2b1b4d');
        gradient.addColorStop(1, '#120d2b');
    } else if (timeFrac >= 9 && timeFrac < 17) {
        // Daytime Twilight Blue
        gradient.addColorStop(0, '#151e42');
        gradient.addColorStop(1, '#080c1f');
    } else if (timeFrac >= 17 && timeFrac < 21) {
        // Sunset to Dusk (Deep Magenta Sky)
        gradient.addColorStop(0, '#38123d');
        gradient.addColorStop(1, '#11071c');
    } else {
        // Midnight Obsidian
        gradient.addColorStop(0, '#090a1a');
        gradient.addColorStop(1, '#03040a');
    }

    sCtx.fillStyle = gradient;
    sCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Celestial Sun/Moon
    sCtx.save();
    if (timeFrac >= 6 && timeFrac < 18) {
        // Pixel Sun
        const sunX = (timeFrac - 6) / 12 * (canvas.width - 100) + 50;
        const sunY = 80 + Math.sin((timeFrac - 6) / 12 * Math.PI) * -40;
        sCtx.fillStyle = 'rgba(255, 230, 120, 0.25)';
        sCtx.beginPath();
        sCtx.arc(sunX, sunY, 18, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.fillStyle = '#fffb96';
        sCtx.fillRect(sunX - 8, sunY - 8, 16, 16);
    } else {
        // Pixel Moon
        const moonX = canvas.width - 80;
        const moonY = 60;
        sCtx.fillStyle = 'rgba(92, 250, 222, 0.15)';
        sCtx.beginPath();
        sCtx.arc(moonX, moonY, 20, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.fillStyle = '#5cfade';
        sCtx.fillRect(moonX - 8, moonY - 8, 16, 16);
        sCtx.fillStyle = '#090a1a';
        sCtx.fillRect(moonX - 4, moonY - 12, 16, 16);
    }
    sCtx.restore();
}

// Main Animation Loop
function gameMainLoop() {
    renderAtmosphericSky();

    if (audioAnalyser && currentlySingingGhost && audio.src && !audio.paused) {
        audioAnalyser.getByteFrequencyData(soundWavesArray);
    } else if (!currentlySingingGhost) {
        for (let i = 0; i < soundWavesArray.length; i++) soundWavesArray[i] *= 0.85;
    }

    // Equalizer Bars
    const totalBars = 24;
    const barThickness = canvas.width / totalBars;
    for (let i = 0; i < totalBars; i++) {
        const byteVal = soundWavesArray[i % 16] || 0;
        const panelHeight = Math.floor((byteVal / 255) * (canvas.height * 0.4));
        sCtx.fillStyle = 'rgba(114, 9, 183, 0.08)';
        sCtx.fillRect(i * barThickness, canvas.height - panelHeight, barThickness - 4, panelHeight);
    }

    // Stars
    starsField.forEach(star => {
        let speed = star.speed * (currentlySingingGhost ? (1 + soundWavesArray[2] / 30) : 1);
        star.y += speed;
        if (star.y > canvas.height) star.y = 0;
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
    });

    // Real-Time Wind Currents
    sCtx.save();
    windParticles.forEach(w => {
        w.x += w.speed;
        if (w.x > canvas.width) {
            w.x = -w.length;
            w.y = Math.random() * (canvas.height - UI_OFFSET);
        }
        sCtx.fillStyle = `rgba(255, 255, 255, ${w.alpha})`;
        sCtx.fillRect(Math.floor(w.x), Math.floor(w.y), w.length, 1);
    });
    sCtx.restore();

    // Magician Smoke Poofs
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const p = smokeParticles[i];
        p.x += p.vx; p.y += p.vy;
        p.alpha -= 0.02;
        p.size += 0.2;
        if (p.alpha <= 0) { smokeParticles.splice(i, 1); continue; }
        sCtx.save();
        sCtx.fillStyle = `${p.color}${p.alpha})`;
        sCtx.beginPath();
        sCtx.arc(Math.floor(p.x), Math.floor(p.y), p.size, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.restore();
    }

    // Cursor Sparks
    for (let i = cursorParticles.length - 1; i >= 0; i--) {
        const p = cursorParticles[i];
        p.y += p.vy; p.alpha -= 0.02;
        if (p.alpha <= 0) { cursorParticles.splice(i, 1); continue; }
        sCtx.save();
        sCtx.globalAlpha = p.alpha;
        sCtx.fillStyle = p.color;
        sCtx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
        sCtx.restore();
    }

    // Render Ghosts
    activeGhosts.forEach(ghost => {
        ghost.update();
        ghost.draw();
    });

    requestAnimationFrame(gameMainLoop);
}

// URL Shared Ghost Auto-Highlight
function checkSharedGhostUrl() {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('ghost');
    if (sharedId) {
        const target = activeGhosts.find(g => g.id === sharedId);
        if (target) {
            target.showQuoteTimer = 300;
            toggleGhostMusicTrack(target);
        }
    }
}

// Boot Engine (Frame 1 Instant Load)
(function instantBoot() {
    const blookyGhost = new GameGhost("default_1", "BLOOKY", "", "", canvas.width / 2 - 22, canvas.height / 2 - 100, "VIBING~");
    const cachedData = getCachedGhosts();
    activeGhosts = [blookyGhost];

    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        cachedData.forEach(g => {
            if (g.name !== "BLOOKY" && g.id !== "default_1") {
                activeGhosts.push(new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y, g.quote || "BOO!"));
            }
        });
    }
})();

// Start Canvas Loop
gameMainLoop();

setTimeout(() => {
    fetchGhosts().then(() => checkSharedGhostUrl());
    subscribeToGhosts();
}, 10);