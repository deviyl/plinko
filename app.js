// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQSkkjhzUMWQ916ipDxfpzOE2-bELRj4o",
  authDomain: "plinko-b8ca4.firebaseapp.com",
  projectId: "plinko-b8ca4",
  storageBucket: "plinko-b8ca4.firebasestorage.app",
  messagingSenderId: "475906567682",
  appId: "1:475906567682:web:d26c3513c14860fb26c11b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentPlayer = null;
let gameInitialized = false;

async function validatePlayer() {
    const key = document.getElementById('api-key').value;
    const msg = document.getElementById('status-msg');
    try {
        const response = await fetch(`https://api.torn.com/v2/user/basic?key=${key}`);
        const data = await response.json();
        if (data.profile && data.profile.name) {
            currentPlayer = data.profile.name;
            msg.innerText = `Welcome, ${currentPlayer}! Click to drop your chip.`;
            document.getElementById('auth-box').style.display = 'none';
            initGame(); 
        } else {
            msg.innerText = "Invalid API Key.";
        }
    } catch (e) {
        msg.innerText = "Error connecting to Torn API.";
    }
}

function initGame() {
    if(gameInitialized) return;
    gameInitialized = true;

    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const engine = Engine.create();
    const render = Render.create({
        element: document.getElementById('game-container'),
        engine: engine,
        options: { width: 400, height: 600, wireframes: false, background: '#000' }
    });

    // --- 1. Containment Walls (The Fix) ---
    const wallOptions = { isStatic: true, render: { visible: false } };
    Composite.add(engine.world, [
        Bodies.rectangle(200, -10, 400, 20, wallOptions), // Ceiling
        Bodies.rectangle(-10, 300, 20, 600, wallOptions), // Left Wall
        Bodies.rectangle(410, 300, 20, 600, wallOptions), // Right Wall
    ]);

    // --- 2. Create Pegs ---
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j <= i; j++) {
            const x = 200 + (j - i / 2) * 40;
            const y = 150 + i * 40;
            Composite.add(engine.world, Bodies.circle(x, y, 4, { 
                isStatic: true, 
                render: { fillStyle: '#ffffff' } 
            }));
        }
    }

    // --- 3. Buckets & Scoring Zones ---
    const bucketValues = [100, 500, 1000, 500, 100];
    for (let i = 0; i < 5; i++) {
        const xPos = 80 * i + 40;
        const sensor = Bodies.rectangle(xPos, 590, 70, 20, { 
            isStatic: true, 
            isSensor: true,
            label: `score-${bucketValues[i]}`,
            render: { fillStyle: 'transparent' } 
        });
        const wall = Bodies.rectangle(xPos + 40, 550, 4, 100, { isStatic: true, render: { fillStyle: '#444' } });
        Composite.add(engine.world, [sensor, wall]);
    }

    // --- 4. Mouse Logic & "Ghost Chip" ---
    const canvas = render.canvas;
    const ctx = canvas.getContext('2d');
    let ballDropped = false;
    let mouseX = 200;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
    });

    canvas.addEventListener('mousedown', () => {
        if (ballDropped) return;
        const ball = Bodies.circle(mouseX, 40, 11, { 
            restitution: 0.5, 
            friction: 0.02,
            render: { fillStyle: '#ffcc00' } 
        });
        Composite.add(engine.world, ball);
        ballDropped = true;
    });

    // --- 5. Custom Drawing (Labels & Ghost Ball) ---
    Events.on(render, 'afterRender', () => {
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        bucketValues.forEach((val, i) => {
            ctx.fillText(val, 80 * i + 40, 580);
        });

        if (!ballDropped) {
            ctx.beginPath();
            ctx.arc(mouseX, 40, 11, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 204, 0, 0.5)";
            ctx.fill();
            ctx.strokeStyle = "#ffcc00";
            ctx.stroke();
            ctx.closePath();
            
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(mouseX, 40);
            ctx.lineTo(mouseX, 140);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });

    // --- 6. Collision ---
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
            const label = pair.bodyA.label.startsWith('score-') ? pair.bodyA.label : 
                         (pair.bodyB.label.startsWith('score-') ? pair.bodyB.label : null);
            if (label) {
                const points = parseInt(label.split('-')[1]);
                const ball = pair.bodyA.label.startsWith('score-') ? pair.bodyB : pair.bodyA;
                Composite.remove(engine.world, ball);
                submitScore(points);
            }
        });
    });

    Render.run(render);
    Runner.run(Runner.create(), engine);
}

// --- 7. SCORING & LEADERBOARD (Same as before) ---
function submitScore(points) {
    const today = new Date().toISOString().split('T')[0];
    const userRef = db.ref('scores/' + currentPlayer);
    userRef.once('value').then((snapshot) => {
        let data = snapshot.val() || { total: 0, history: {} };
        if (data.history[today]) {
            alert("You already played today!");
            location.reload();
            return;
        }
        data.total += points;
        data.history[today] = points;
        userRef.set(data).then(() => {
            alert(`${currentPlayer}, you scored ${points}!`);
            setTimeout(() => { location.reload(); }, 1500);
        });
    });
}

function loadLeaderboard() {
    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];
    
    db.ref('scores').once('value').then((snapshot) => {
        const scores = snapshot.val();
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody || !scores) return;
        tbody.innerHTML = "";
        const sortedNames = Object.keys(scores).sort((a, b) => scores[b].total - scores[a].total);
        sortedNames.forEach(name => {
            tbody.innerHTML += `<tr>
                <td>${name}</td>
                <td>${scores[name].history[yesterday] || 0}</td>
                <td>${scores[name].history[today] || 0}</td>
                <td>${scores[name].total}</td>
            </tr>`;
        });
    });
}

loadLeaderboard();
