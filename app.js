// Firebase Configuration (Using your existing key)
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
            msg.innerText = `Welcome, ${currentPlayer}! Drop your chip.`;
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
    
    // Increased size to 800x800
    const render = Render.create({
        element: document.getElementById('game-container'),
        engine: engine,
        options: { width: 800, height: 800, wireframes: false, background: '#000' }
    });

    // --- 1. Containment Walls (Updated for 800px width) ---
    const wallOptions = { isStatic: true, render: { visible: false } };
    Composite.add(engine.world, [
        Bodies.rectangle(400, -10, 800, 20, wallOptions), // Ceiling
        Bodies.rectangle(-10, 400, 20, 800, wallOptions), // Left
        Bodies.rectangle(810, 400, 20, 800, wallOptions), // Right
    ]);

    // --- 2. Staggered Square Peg Grid ---
    const rows = 14;
    const cols = 18;
    const spacing = 45;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Offset every other row for that "Plinko" bounce
            let xOffset = (r % 2 === 0) ? spacing / 2 : 0;
            const x = (c * spacing) + 25 + xOffset;
            const y = (r * spacing) + 120;
            
            // Only add pegs that fit within the 800px width
            if (x < 780) {
                Composite.add(engine.world, Bodies.circle(x, y, 4, { 
                    isStatic: true, 
                    render: { fillStyle: '#ffffff' } 
                }));
            }
        }
    }

    // --- 3. 10 Buckets at the bottom ---
    const bucketValues = [50, 100, 250, 500, 1000, 1000, 500, 250, 100, 50];
    const bucketWidth = 800 / bucketValues.length;

    for (let i = 0; i < bucketValues.length; i++) {
        const xPos = (i * bucketWidth) + (bucketWidth / 2);
        
        const sensor = Bodies.rectangle(xPos, 785, bucketWidth - 10, 30, { 
            isStatic: true, 
            isSensor: true,
            label: `score-${bucketValues[i]}`,
            render: { fillStyle: 'transparent' } 
        });

        const wall = Bodies.rectangle(xPos + (bucketWidth / 2), 730, 4, 140, { 
            isStatic: true, 
            render: { fillStyle: '#444' } 
        });

        Composite.add(engine.world, [sensor, wall]);
    }

    // --- 4. Mouse Logic & Larger Ghost Chip ---
    const canvas = render.canvas;
    const ctx = canvas.getContext('2d');
    let ballDropped = false;
    let mouseX = 400;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
    });

    canvas.addEventListener('mousedown', () => {
        if (ballDropped) return;
        const ball = Bodies.circle(mouseX, 40, 14, { 
            restitution: 0.6, 
            friction: 0.03,
            render: { fillStyle: '#ffcc00' } 
        });
        Composite.add(engine.world, ball);
        ballDropped = true;
    });

    // --- 5. Custom Drawing (Text & UI) ---
    Events.on(render, 'afterRender', () => {
        ctx.font = "bold 16px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        
        bucketValues.forEach((val, i) => {
            const xPos = (i * bucketWidth) + (bucketWidth / 2);
            ctx.fillText(val, xPos, 780);
        });

        if (!ballDropped) {
            // Draw Ghost Chip
            ctx.beginPath();
            ctx.arc(mouseX, 40, 14, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 204, 0, 0.4)";
            ctx.fill();
            ctx.strokeStyle = "#ffcc00";
            ctx.stroke();
            
            // Guide Line
            ctx.setLineDash([5, 10]);
            ctx.beginPath();
            ctx.moveTo(mouseX, 40);
            ctx.lineTo(mouseX, 110);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });

    // --- 6. Collision Detection ---
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

// (submitScore and loadLeaderboard functions remain the same as previous)
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
