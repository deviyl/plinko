// REPLACE THIS WITH YOUR FIREBASE CONFIG
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

// --- 1. TORN API VALIDATION ---
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
            initGame(); // Start Plinko
        } else {
            msg.innerText = "Invalid API Key.";
        }
    } catch (e) {
        msg.innerText = "Error connecting to Torn API.";
    }
}

// --- 2. MATTER.JS PLINKO GAME ---
function initGame() {
    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const engine = Engine.create();
    const render = Render.create({
        element: document.getElementById('game-container'),
        engine: engine,
        options: { width: 400, height: 600, wireframes: false }
    });

    // Create Pegs in a Triangle
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j <= i; j++) {
            const x = 200 + (j - i / 2) * 40;
            const y = 100 + i * 40;
            Composite.add(engine.world, Bodies.circle(x, y, 4, { isStatic: true, render: { fillStyle: '#ffffff' } }));
        }
    }

    // Buckets at the bottom
    const buckets = [];
    const bucketValues = [100, 500, 1000, 500, 100];
    for (let i = 0; i < 5; i++) {
        const b = Bodies.rectangle(80 * i + 40, 580, 70, 20, { isStatic: true, label: `score-${bucketValues[i]}` });
        buckets.push(b);
    }
    Composite.add(engine.world, buckets);

    // Drop Ball
    const ball = Bodies.circle(200, 20, 10, { restitution: 0.5 });
    Composite.add(engine.world, ball);

    // Collision Detection
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
            if (pair.bodyA.label.startsWith('score-') || pair.bodyB.label.startsWith('score-')) {
                const score = parseInt(pair.bodyA.label.split('-')[1] || pair.bodyB.label.split('-')[1]);
                submitScore(score);
                Composite.remove(engine.world, ball); // End game
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
        
        // Check if already played today (GMT)
        if (data.history[today]) {
            alert("You already played today!");
            return;
        }

        data.total += points;
        data.history[today] = points;
        userRef.set(data);
        alert(`You scored ${points}!`);
        loadLeaderboard();
    });
}

function loadLeaderboard() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    db.ref('scores').once('value').then((snapshot) => {
        const scores = snapshot.val();
        const tbody = document.getElementById('leaderboard-body');
        tbody.innerHTML = "";

        for (let name in scores) {
            const row = `<tr>
                <td>${name}</td>
                <td>${scores[name].history[yesterday] || 0}</td>
                <td>${scores[name].history[today] || 0}</td>
                <td>${scores[name].total}</td>
            </tr>`;
            tbody.innerHTML += row;
        }
    });
}

// Load board on start
loadLeaderboard();
