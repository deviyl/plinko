// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQSkkjhzUMWQ916ipDxfpzOE2-bELRj4o",
  authDomain: "plinko-b8ca4.firebaseapp.com",
  projectId: "plinko-b8ca4",
  storageBucket: "plinko-b8ca4.firebasestorage.app",
  messagingSenderId: "475906567682",
  appId: "1:475906567682:web:d26c3513c14860fb26c11b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentPlayer = null;
let gameInitialized = false;

// --- 1. TORN API VALIDATION ---
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

// --- 2. MATTER.JS PLINKO GAME ---
function initGame() {
    if(gameInitialized) return;
    gameInitialized = true;

    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const engine = Engine.create();
    const render = Render.create({
        element: document.getElementById('game-container'),
        engine: engine,
        options: { 
            width: 400, 
            height: 600, 
            wireframes: false,
            background: '#000' 
        }
    });

    // Create Pegs in a Triangle
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j <= i; j++) {
            const x = 200 + (j - i / 2) * 40;
            const y = 150 + i * 40; // Lowered to give room for dropping
            Composite.add(engine.world, Bodies.circle(x, y, 4, { 
                isStatic: true, 
                render: { fillStyle: '#ffffff' } 
            }));
        }
    }

    // Buckets at the bottom with walls
    const bucketValues = [100, 500, 1000, 500, 100];
    for (let i = 0; i < 5; i++) {
        const xPos = 80 * i + 40;
        // The scoring sensor
        const sensor = Bodies.rectangle(xPos, 590, 70, 20, { 
            isStatic: true, 
            isSensor: true,
            label: `score-${bucketValues[i]}`,
            render: { fillStyle: 'transparent' } 
        });
        // Decorative bucket floor
        const floor = Bodies.rectangle(xPos, 595, 78, 10, { isStatic: true, render: { fillStyle: '#333' } });
        // Divider walls
        const wall = Bodies.rectangle(xPos + 40, 550, 4, 100, { isStatic: true, render: { fillStyle: '#444' } });
        
        Composite.add(engine.world, [sensor, floor, wall]);
    }

    // Outer Walls
    Composite.add(engine.world, [
        Bodies.rectangle(0, 300, 10, 600, { isStatic: true }),
        Bodies.rectangle(400, 300, 10, 600, { isStatic: true })
    ]);

    // --- MOUSE TRACKING & DROP ---
    const canvas = render.canvas;
    let ballDropped = false;
    let mouseX = 200;

    // Track mouse movement for the "Ghost" position
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
    });

    // Drop on click
    canvas.addEventListener('mousedown', () => {
        if (ballDropped) return;

        const ball = Bodies.circle(mouseX, 40, 11, { 
            restitution: 0.5, 
            friction: 0.02,
            render: { fillStyle: '#ffcc00' } 
        });

        Composite.add(engine.world, ball);
        ballDropped = true;
        document.getElementById('status-msg').innerText = "Dropping...";
    });

    // --- COLLISION DETECTION ---
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;

            if (bodyA.label.startsWith('score-') || bodyB.label.startsWith('score-')) {
                const label = bodyA.label.startsWith('score-') ? bodyA.label : bodyB.label;
                const score = parseInt(label.split('-')[1]);
                
                // Remove ball so it doesn't double-score
                const ball = bodyA.label.startsWith('score-') ? bodyB : bodyA;
                Composite.remove(engine.world, ball);
                
                submitScore(score);
            }
        });
    });

    Render.run(render);
    Runner.run(Runner.create(), engine);
}

// --- 3. SCORING & LEADERBOARD ---
function submitScore(points) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const userRef = db.ref('scores/' + currentPlayer);

    userRef.once('value').then((snapshot) => {
        let data = snapshot.val() || { total: 0, history: {} };
        
        if (data.history[today]) {
            alert("You have already played today (GMT)!");
            location.reload(); 
            return;
        }

        data.total += points;
        data.history[today] = points;
        
        userRef.set(data).then(() => {
            alert(`${currentPlayer}, you scored ${points}!`);
            loadLeaderboard();
            setTimeout(() => { location.reload(); }, 2000); 
        });
    });
}

function loadLeaderboard() {
    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.getUTCDate();
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];
    
    db.ref('scores').once('value').then((snapshot) => {
        const scores = snapshot.val();
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody || !scores) return;
        
        tbody.innerHTML = "";

        // Sort by total score descending
        const sortedNames = Object.keys(scores).sort((a, b) => scores[b].total - scores[a].total);

        sortedNames.forEach(name => {
            const row = `<tr>
                <td>**${name}**</td>
                <td>${scores[name].history[yesterday] || 0}</td>
                <td>${scores[name].history[today] || 0}</td>
                <td>${scores[name].total}</td>
            </tr>`;
            tbody.innerHTML += row;
        });
    });
}

// Load board on start
loadLeaderboard();
