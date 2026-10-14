const params = new URLSearchParams(window.location.search);
const lobbyCode = params.get("code");

if (!lobbyCode) {
    alert("Missing lobby code");
    window.location.href = "/";
}

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${window.location.host}/ws/${lobbyCode}`);

// Retrieve stored player identity
const playerName = localStorage.getItem("playerName");
const localDeviceId = localStorage.getItem("device_id");

// Game state
let currentState = null;
let lastUpdate = null;
let host_id = null;
let lostLifeDevices = new Set();
let turnDuration = 5;
document.getElementById("game-code").textContent = `ROOM · ${lobbyCode}`;

function animateFeedback(el, className) {
    if (!el) return;
    el.classList.remove(className === "life-loss" ? "turn-success" : "life-loss");
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

function updateTimer(remaining) {
    document.getElementById("timer").innerText = remaining.toFixed(1);
    document.getElementById("timer-bar").style.width = `${Math.min(100, Math.max(0, remaining / turnDuration * 100))}%`;
    document.getElementById("arena").dataset.urgent = String(remaining <= Math.min(3, turnDuration * .25));
}

// LANG SWITCHER
let lang = localStorage.getItem("lang");
if (lang == "jp") {
    document.getElementById("player-list").innerText = "プレイヤー";
    document.getElementById("word").placeholder = "かなを入力…";
    document.getElementById("submit").innerText = "提出";
    document.getElementById("restart").innerText = "もう一度";
    document.getElementById("return").innerText = "ロビー";
}

function updateActivity(state) {
    const typingEl = document.getElementById("current-typing");
    typingEl.textContent = state.current_typing || "";
    typingEl.dataset.result = state.typing_result
        ? (state.typing_result === "OK" ? "correct" : "incorrect")
        : "";
}

// STARTS GAME
window.onload = () => {
    window.gameEnded = false;
    const input = document.getElementById("word");
    if (input) input.focus();
};

// RECONNECTS PALYER AFTER STARTING
ws.onopen = () => {
    console.log(localStorage.getItem("device_id"));
    if (playerName) {
        ws.send(JSON.stringify({
            type: "reconnect",
            name: playerName,
            device_id: localDeviceId
        }));
    }
    ws.send(JSON.stringify({ type: "request_state" }));
};

ws.onmessage = (event) => {
    const state = JSON.parse(event.data);
    if (state.type === "typing" || state.type === "guess") {
        if (currentState && state.turn_id === currentState.turn_id) {
            currentState.current_typing = state.word;
            currentState.typing_result = state.type === "guess" ? state.result : null;
            updateActivity(currentState);
            if (state.type === "guess" && state.result === "OK") {
                animateFeedback(document.getElementById("arena"), "turn-success");
            }
        }
        return;
    }
    host_id = state.host_id;

    if (state.type == "force_return_to_lobby") {
        console.log("MESSAGE REACHED")
        window.location.href = `/join.html?code=${lobbyCode}`;
        return;
    }

    // Store latest state
    const newTurn = currentState && state.turn_id !== currentState.turn_id;
    const previousLives = new Map((currentState?.players || []).map(p => [p.device_id, p.lives]));
    lostLifeDevices = new Set(state.players.filter(p => previousLives.has(p.device_id) && p.lives < previousLives.get(p.device_id)).map(p => p.device_id));
    const newWinner = state.winner && state.winner !== currentState?.winner;
    currentState = state;
    turnDuration = state.settings?.time || Math.max(state.time_remaining, 1);
    if (newTurn) document.getElementById("word").value = "";
    lastUpdate = Date.now();

    // Update UI immediately
    updateUI(state);
    if (lostLifeDevices.size) animateFeedback(document.getElementById("arena"), "life-loss");
    else if (newTurn || newWinner) animateFeedback(document.getElementById("arena"), "turn-success");
    if (newWinner) animateFeedback(document.getElementById("game-over"), "turn-success");

    // When winner, turn to winner screen
    if (state.winner != null) {
        document.getElementById("game-over").style.display = "block";
        if (lang == "jp") {
            document.getElementById("winner-text").innerText =
                `🏆 ${state.winner} が勝った!`;
        } else {
            document.getElementById("winner-text").innerText =
                `🏆 ${state.winner} wins!`;
        }

        // Disable input
        document.getElementById("word").disabled = true;
        window.gameEnded = true;
        document.getElementById("restart").disabled = host_id !== localDeviceId;
        document.getElementById("return").disabled = host_id !== localDeviceId;
        document.getElementById("winner-hint").textContent = host_id === localDeviceId ? "" : (lang === "jp" ? "ホスト待ち。" : "Waiting for host.");
        return;
    }
    window.gameEnded = false;
    document.getElementById("game-over").style.display = "none";
};

function updateUI(state) {
    updateActivity(state);
    const localPlayer = state.players.find(p => p.device_id === localDeviceId);
    const isDead = Boolean(localPlayer && (localPlayer.eliminated || localPlayer.lives <= 0));
    const myTurn = state.started && !state.winner && !isDead && state.current_player_device === localDeviceId;
    const wasDisabled = document.getElementById("word").disabled;
    document.getElementById("word").disabled = !myTurn;
    document.getElementById("submit").disabled = !myTurn;
    if (myTurn && wasDisabled) document.getElementById("word").focus();
    const turnStatus = document.getElementById("turn-status");
    turnStatus.dataset.status = isDead ? "dead" : myTurn ? "active" : "watching";
    turnStatus.textContent = isDead ? (lang === "jp" ? "脱落" : "Dead")
        : myTurn ? (lang === "jp" ? "あなたのターン" : "Your turn")
        : (lang === "jp" ? "観戦中" : "Watching");
    // CURRENT PLAYER
    const currentPlayerEl = document.getElementById("current-player");
    if (currentPlayerEl) {
        currentPlayerEl.innerHTML = "";
        const name = document.createElement("span");
        name.className = "current-player-name";
        name.textContent = state.current_player_name;
        const suffix = document.createElement("span");
        suffix.textContent = lang === "jp" ? "のターン" : "’s turn";
        currentPlayerEl.appendChild(name);
        currentPlayerEl.appendChild(suffix);
    }

    // DISPLAY PATTERN
    const patternEl = document.getElementById("pattern");
    if (patternEl) patternEl.innerText = state.pattern || "";

    // TIMER
    updateTimer(state.time_remaining || 0);

    // PLAYER LIST
    const ul = document.getElementById("players");
    if (ul) {

        ul.innerHTML = "";
        document.getElementById("player-count").textContent = state.players.length;
        state.players.forEach(p => {
            const li = document.createElement("li");
            li.className = "player-card";
            li.classList.toggle("is-current", p.device_id === state.current_player_device);
            li.classList.toggle("is-eliminated", p.eliminated);
            let label = p.name;
            if (p.device_id === localDeviceId) {
                label += lang === "jp" ? "（我）" : " (Me)";
            }
            const top = document.createElement("div");
            top.className = "player-top";
            const avatar = document.createElement("span");
            avatar.className = "player-avatar";
            avatar.textContent = Array.from(p.name)[0] || "?";
            avatar.setAttribute("aria-hidden", "true");
            const name = document.createElement("span");
            name.className = "player-name";
            name.textContent = label;
            top.appendChild(avatar);
            top.appendChild(name);
            const lives = document.createElement("span");
            lives.className = "player-lives";
            if (p.lives > 0) {
                const hearts = document.createElement("span");
                hearts.className = "life-hearts";
                hearts.textContent = "♥ ".repeat(Math.min(p.lives, 5)).trim();
                lives.appendChild(hearts);
                if (p.lives > 5) {
                    const count = document.createElement("span");
                    count.textContent = ` × ${p.lives}`;
                    lives.appendChild(count);
                }
            } else {
                lives.textContent = lang === "jp" ? "脱落" : "Eliminated";
            }
            lives.setAttribute("aria-label", `${p.lives} ${lang === "jp" ? "ライフ" : "lives remaining"}`);
            li.appendChild(top);
            li.appendChild(lives);
            ul.appendChild(li);
            if (lostLifeDevices.has(p.device_id)) animateFeedback(li, "life-loss");
        });
    }

    // Error messages
    const errorEl = document.getElementById("error");
    if (errorEl) errorEl.innerText = state.last_error || "";
}

// **Local timer update every 100ms**
setInterval(() => {
    if (window.gameEnded || !currentState || currentState.time_remaining === null) return;

    const now = Date.now();
    const elapsed = (now - lastUpdate) / 1000; // seconds
    let remaining = Math.max(0, currentState.time_remaining - elapsed);

    // Update timer in UI
    updateTimer(remaining);

    // Auto-submit timeout when time runs out
    if (remaining <= 0 && !currentState.time_expired
            && currentState.current_player_device === localDeviceId
            && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "timeout" }));
        currentState.time_expired = true;
    }
}, 100);

// SUBMIT WORD (with button or with enter key)
document.getElementById("word").focus(); // focuses word textbox

const input = document.getElementById("word");
input.addEventListener("input", () => {
    if (ws.readyState !== WebSocket.OPEN || !currentState || currentState.winner
            || currentState.current_player_device !== localDeviceId) return;
    ws.send(JSON.stringify({ type: "typing", word: input.value, turn_id: currentState.turn_id }));
});
input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        submitWord();
    }
});

function submitWord() {
    const input = document.getElementById("word");
    const word = input.value.trim();
    if (!word || input.disabled || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: "submit", word }));
    input.value = "";
    input.focus();
}

// RESTART GAME
function restartGame() {
    if (host_id === localDeviceId) {
        ws.send(JSON.stringify({ type: "restart" }));
        window.gameEnded = false;
        document.getElementById("game-over").style.display = "none";
        document.getElementById("word").disabled = false;
    }
}

// LOBBY SCREEN
function returnToLobby() {
    if (host_id === localDeviceId) {
        let settings = localStorage.getItem("gameSettings");
        // localStorage.clear()
        localStorage.setItem("lang", lang)
        localStorage.setItem("gameSettings", settings);
        localStorage.setItem("device_id", localDeviceId);
        ws.send(JSON.stringify({ type: "return_to_lobby" }));
    }
}
