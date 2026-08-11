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
const ghostNameInput = document.getElementById('ghostName');
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
let soundWavesArray = new Uint8Array(16);

let activeGhosts = [];
let starsField = [];
let currentlySingingGhost = null;
let synthInterval = null;
let UI_OFFSET = 120; // Default buffer height for floating deck

// Dynamic Canvas Resize & UI Buffer Calculation
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

// Parallax Starfield Setup
for (let i = 0; i < 60; i++) {
    starsField.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.floor(Math.random() * 2) + 2,
        speed: Math.random() * 0.4 + 0.1
    });
}

// SCREEN CAPACITY & SHUFFLE HELPERS
function getMaxGhostLimit() {
    const screenWidth = window.innerWidth;
    if (screenWidth < 600) return 8;       // Mobile: Max 8 ghosts
    if (screenWidth < 1024) return 16;     // Tablet: Max 16 ghosts
    return 30;                             // Desktop: Max 30 ghosts
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// MUSIC VALIDATION ENGINES
function isValidMusicUrl(url) {
    if (!url) return false;
    const cleanUrl = url.trim().toLowerCase();
    
    const isPlatform = cleanUrl.includes('music.youtube.com') ||
                       cleanUrl.includes('youtube.com/watch') ||
                       cleanUrl.includes('youtu.be/') ||
                       cleanUrl.includes('spotify.com') ||
                       cleanUrl.includes('soundcloud.com') ||
                       cleanUrl.includes('music.apple.com');

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
                
                if (buffer.duration < 15) {
                    tempContext.close();
                    return resolve(false);
                }

                const channelData = buffer.getChannelData(0);
                let totalEnergy = 0;
                let nonZeroSamples = 0;

                for (let i = 0; i < channelData.length; i += 100) {
                    const sample = Math.abs(channelData[i]);
                    totalEnergy += sample;
                    if (sample > 0.01) nonZeroSamples++;
                }

                const averageEnergy = totalEnergy / (channelData.length / 100);
                const density = nonZeroSamples / (channelData.length / 100);

                tempContext.close();

                if (density > 0.35 && averageEnergy > 0.02) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            } catch (err) {
                return resolve(false);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// Local File Handler
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
        reader.onload = (event) => {
            customAudioDataUrl = event.target.result;
            trackUrlInput.value = file.name;
        };
        reader.readAsDataURL(file);
    }
});

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

// Helper for Mouse and Mobile Touch Drawing Coordinates
function getCanvasCoords(e) {
    const rect = drawCanvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;

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
    lastX = coords.x;
    lastY = coords.y;
}

function drawLine(e) {
    if (!drawingModeActive) return;
    if (e.cancelable) e.preventDefault(); // Stop mobile scroll while drawing

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
    lastX = coords.x;
    lastY = coords.y;
}

function stopDrawing() {
    drawingModeActive = false;
}

// Mouse Event Listeners
drawCanvas.addEventListener('mousedown', startDrawing);
drawCanvas.addEventListener('mousemove', drawLine);
window.addEventListener('mouseup', stopDrawing);

// Mobile Touch Event Listeners
drawCanvas.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault();
    startDrawing(e);
}, { passive: false });

drawCanvas.addEventListener('touchmove', (e) => {
    drawLine(e);
}, { passive: false });

window.addEventListener('touchend', stopDrawing);

openStudioBtn.addEventListener('click', () => toggleStudio(true));
cancelStudioBtn.addEventListener('click', () => toggleStudio(false));
bakeAssetBtn.addEventListener('click', () => {
    accessoryDataUrl = drawCanvas.toDataURL();
    toggleStudio(false);
});

// Ghost Entity Blueprint
class GameGhost {
    constructor(id, name, streamUrl, accessoryImgSrc, x, y) {
        this.id = id || Date.now().toString();
        this.name = name ? name.toUpperCase() : "BLOOKY";
        this.url = streamUrl || "";
        this.hasOpenedExternalTab = false;
        
        this.accessory = null;
        if (accessoryImgSrc) {
            this.accessory = new Image();
            this.accessory.src = accessoryImgSrc;
        }
        
        this.width = 44;
        this.height = 52;

        // Auto-clamp coordinates into current screen viewport
        const maxX = Math.max(20, canvas.width - this.width - 20);
        const maxY = Math.max(20, canvas.height - this.height - UI_OFFSET - 20);

        this.x = (x !== undefined && x < maxX) ? x : Math.random() * maxX + 10;
        this.y = (y !== undefined && y < maxY) ? y : Math.random() * maxY + 10;
        
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 1.5;
        this.animationTick = Math.random() * 100;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // X-Axis Viewport Bounds
        if (this.x < 10) {
            this.vx = Math.abs(this.vx);
            this.x = 11;
        } else if (this.x > canvas.width - this.width - 10) {
            this.vx = -Math.abs(this.vx);
            this.x = canvas.width - this.width - 11;
        }

        // Y-Axis Viewport Bounds (Bounces off top screen and UI deck floor)
        const maxAllowedY = canvas.height - this.height - UI_OFFSET;
        if (this.y < 10) {
            this.vy = Math.abs(this.vy);
            this.y = 11;
        } else if (this.y > maxAllowedY) {
            this.vy = -Math.abs(this.vy);
            this.y = Math.max(10, maxAllowedY - 2);
        }
        
        this.animationTick += 0.05;
        this.hoverY = Math.sin(this.animationTick) * 6;
    }

    draw() {
        const px = Math.floor(this.x);
        const py = Math.floor(this.y + this.hoverY);
        sCtx.save();

        if (currentlySingingGhost === this && soundWavesArray.length > 0) {
            let spectrumSum = 0;
            for (let i = 0; i < 8; i++) spectrumSum += soundWavesArray[i];
            let intensityDelta = (spectrumSum / 8) * 0.2;
            sCtx.strokeStyle = 'rgba(92, 250, 222, 0.3)';
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

        sCtx.fillStyle = '#100b26';
        const eyeSync = (currentlySingingGhost === this) ? -3 : 0;
        sCtx.fillRect(px + 14, py + 16 + eyeSync, 6, 10);
        sCtx.fillRect(px + 24, py + 16 + eyeSync, 6, 10);
        
        if (currentlySingingGhost === this) {
            sCtx.fillRect(px + 19, py + 30, 6, 6);
        } else {
            sCtx.fillRect(px + 21, py + 31, 2, 3);
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
            } else if (sparkFrame === 1) {
                sCtx.fillRect(px - 6, py + 22, 3, 3);
                sCtx.fillRect(px + 46, py + 5, 3, 3);
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
        sCtx.restore();
    }

    checkHitClick(mx, my) {
        return (mx >= this.x && mx <= this.x + this.width && my >= this.y + this.hoverY && my <= this.y + this.height + this.hoverY);
    }
}

// FETCH EXISTING GHOSTS FROM SUPABASE WITH CAP LIMIT & BLOOKY PRESERVATION
async function fetchGhosts() {
    // Default BLOOKY ghost instance
    const blookyGhost = new GameGhost("default_1", "BLOOKY", "", "", canvas.width / 2 - 22, canvas.height / 2 - 100);

    if (!supabaseClient) {
        activeGhosts = [blookyGhost];
        return;
    }
    
    try {
        const { data, error } = await supabaseClient.from('ghosts').select('*');
        if (error) {
            console.warn('Supabase fetch error:', error.message);
            activeGhosts = [blookyGhost];
            return;
        }
        
        if (data && data.length > 0) {
            const limit = getMaxGhostLimit();
            
            // Exclude blooky if present in DB so we don't duplicate it
            const remoteGhosts = data.filter(g => g.name !== "BLOOKY" && g.id !== "default_1");
            
            let selectedGhostsData = remoteGhosts;
            if (remoteGhosts.length > limit - 1) {
                selectedGhostsData = shuffleArray(remoteGhosts).slice(0, limit - 1);
            }

            activeGhosts = [blookyGhost]; // Always include BLOOKY
            selectedGhostsData.forEach(g => {
                activeGhosts.push(new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y));
            });
        } else {
            activeGhosts = [blookyGhost];
        }
    } catch (err) {
        console.warn('Supabase fetch skipped:', err);
        activeGhosts = [blookyGhost];
    }
}

// REALTIME MULTIPLAYER SYNC
function subscribeToGhosts() {
    if (!supabaseClient) return;
    try {
        supabaseClient
            .channel('public:ghosts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghosts' }, (payload) => {
                const g = payload.new;
                const limit = getMaxGhostLimit();

                if (!activeGhosts.some(existing => existing.id === g.id)) {
                    if (activeGhosts.length >= limit) {
                        // Keep BLOOKY at index 0, remove second oldest
                        if (activeGhosts.length > 1) {
                            activeGhosts.splice(1, 1);
                        }
                    }
                    activeGhosts.push(new GameGhost(g.id, g.name, g.url, g.accessory, g.x, g.y));
                }
            })
            .subscribe();
    } catch (err) {
        console.warn('Supabase realtime error:', err);
    }
}

// SUMMON BUTTON HANDLER
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

    const spawnX = Math.random() * (canvas.width - 100) + 20;
    const spawnY = Math.random() * Math.max(50, canvas.height - 100 - UI_OFFSET) + 20;

    const newGhostData = {
        name: ghostNameInput.value.trim() || "BLOOKY",
        url: finalAudioUrl,
        accessory: accessoryDataUrl || "",
        x: spawnX,
        y: spawnY
    };

    const maxLimit = getMaxGhostLimit();
    if (activeGhosts.length >= maxLimit && activeGhosts.length > 1) {
        activeGhosts.splice(1, 1); // Auto-trim older ghost to fit capacity while keeping BLOOKY
    }

    const newGhostObj = new GameGhost(Date.now().toString(), newGhostData.name, newGhostData.url, newGhostData.accessory, newGhostData.x, newGhostData.y);
    activeGhosts.push(newGhostObj);

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('ghosts').insert([newGhostData]).select();
            if (error) {
                console.error("Supabase insert error:", error.message);
            } else if (data && data.length > 0) {
                newGhostObj.id = data[0].id;
            }
        } catch (err) {
            console.error('Supabase write exception:', err);
        }
    }

    ghostNameInput.value = "";
    trackUrlInput.value = "";
    audioFileInput.value = "";
    accessoryDataUrl = null;
    customAudioDataUrl = null;
});

// AUDIO ENGINE INITIALIZATION
function initializeSystemAudioEngine() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioAnalyser = audioContext.createAnalyser();
            audioAnalyser.fftSize = 32;
            audioSource = audioContext.createMediaElementSource(audio);
            audioSource.connect(audioAnalyser);
            audioSource.connect(audioContext.destination);
            soundWavesArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        } catch (e) {
            console.warn("AudioContext init warning:", e);
        }
    }
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// CHIPTUNE SYNTH FOR BLOOKY / DEFAULT GHOSTS
function startChiptuneSynthesizer(ghost) {
    if (synthInterval) clearInterval(synthInterval);
    
    const frequencies = [261.63, 293.66, 329.63, 392.00, 440.00];
    synthInterval = setInterval(() => {
        if (currentlySingingGhost !== ghost) return;
        
        if (audioContext) {
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
        }

        for (let i = 0; i < soundWavesArray.length; i++) {
            soundWavesArray[i] = Math.floor(Math.random() * 150) + 50;
        }
    }, 250);
}

// Universal Canvas Click/Tap Handler for Desktop and Mobile
function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    let clickX = e.clientX;
    let clickY = e.clientY;

    if (e.changedTouches && e.changedTouches.length > 0) {
        clickX = e.changedTouches[0].clientX;
        clickY = e.changedTouches[0].clientY;
    } else if (clickX === undefined) {
        return;
    }

    clickX -= rect.left;
    clickY -= rect.top;

    initializeSystemAudioEngine();

    activeGhosts.forEach(ghost => {
        if (ghost.checkHitClick(clickX, clickY)) {
            toggleGhostMusicTrack(ghost);
        }
    });
}

canvas.addEventListener('click', handleCanvasClick);

// TOGGLE GHOST TRACK
function toggleGhostMusicTrack(ghost) {
    if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
    }

    // 1. CLICK SAME GHOST AGAIN -> PAUSE
    if (currentlySingingGhost === ghost) {
        audio.pause();
        currentlySingingGhost = null;
        return;
    }

    const previousGhost = currentlySingingGhost;
    currentlySingingGhost = ghost;

    // 2. DEFAULT BLOOKY CHIPTUNE SYNTH (No URL)
    if (!ghost.url || ghost.url.trim() === "") {
        startChiptuneSynthesizer(ghost);
        return;
    }

    const lowerUrl = ghost.url.toLowerCase();

    // 3. EXTERNAL PLATFORM LINKS (YouTube / Spotify / SoundCloud)
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerUrl.includes('spotify.com') || lowerUrl.includes('soundcloud.com')) {
        if (!ghost.hasOpenedExternalTab) {
            ghost.hasOpenedExternalTab = true;
            window.open(ghost.url, '_blank');
        }
        return;
    }

    // 4. DIRECT AUDIO / UPLOADED MP3 FILES (RESUME IF PAUSED, LOAD IF NEW)
    if (previousGhost === ghost && audio.paused && audio.src) {
        audio.play();
        return;
    }

    audio.pause();
    audio.src = ghost.url;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            console.warn("Direct play blocked or stream error. Falling back to synth:", err);
            startChiptuneSynthesizer(ghost);
        });
    }
}

audio.addEventListener('ended', () => { 
    currentlySingingGhost = null; 
    if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
    }
});

// MAIN RENDER LOOP
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

    // Equalizer Background Bars
    const totalBars = 24;
    const barThickness = canvas.width / totalBars;
    for (let i = 0; i < totalBars; i++) {
        const byteVal = soundWavesArray[i % 16] || 0;
        const panelHeight = Math.floor((byteVal / 255) * (canvas.height * 0.4));
        sCtx.fillStyle = 'rgba(114, 9, 183, 0.08)';
        sCtx.fillRect(i * barThickness, canvas.height - panelHeight, barThickness - 4, panelHeight);
    }

    // Stars Parallax
    starsField.forEach(star => {
        let currentSpeedFactor = 1;
        if (currentlySingingGhost && soundWavesArray.length > 0) {
            currentSpeedFactor = 1 + (soundWavesArray[2] / 30);
        }
        star.y += star.speed * currentSpeedFactor;
        if (star.y > canvas.height) star.y = 0;
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
    });

    // Render Ghosts
    activeGhosts.forEach(ghost => {
        ghost.update();
        ghost.draw();
    });

    requestAnimationFrame(gameMainLoop);
}

// Start Engine
fetchGhosts();
subscribeToGhosts();
gameMainLoop();