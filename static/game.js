const params = new URLSearchParams(window.location.search);
const lobbyCode = params.get("code");

if (!lobbyCode) {
    alert("Missing lobby code");
    window.location.href = "/";
}

const ws = new WebSocket(`ws://localhost:8000/ws/${lobbyCode}`);

// Retrieve stored player identity
const playerName = localStorage.getItem("playerName");
const localDeviceId = localStorage.getItem("device_id");

// Game state
let currentState = null;
let lastUpdate = null;
let host_id = null;

// LANG SWITCHER
let lang = localStorage.getItem("lang");
if (lang == "jp") {
    document.getElementById("player-list").innerText = "プレイヤー・リスト";
    document.getElementById("word").placeholder = "言葉を入れて";
    document.getElementById("submit").innerText = "提出";
    document.getElementById("restart").innerText = "ゲームをやり直す";
    document.getElementById("return").innerText = "ロビーに戻る";
}

// STARTS GAME
window.onload = () => {
    window.gameEnded = false;
    const input = document.getElementById("word");
    if (input) input.focus();
};

// RECONNECTS PALYER AFTER STARTING
ws.onopen = () => {
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
    host_id = state.host_id;

    if (state.type == "force_return_to_lobby") {
        console.log("MESSAGE REACHED")
        window.location.href = `/join.html?code=${lobbyCode}`;
        return;
    }

    // Store latest state
    currentState = state;
    lastUpdate = Date.now();

    // Update UI immediately
    updateUI(state);

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
        return;
    }
};

function updateUI(state) {
    // CURRENT PLAYER
    const currentPlayerEl = document.getElementById("current-player");
    if (currentPlayerEl) {
        if (lang == "jp") {
            currentPlayerEl.innerText = state.current_player_name + "のターン";
        } else {
            currentPlayerEl.innerText = "Current Player: " + state.current_player_name;
        }
    } else {
        currentPlayerEl.innerText = "Current Player: ";
    }

    // DISPLAY PATTERN
    const patternEl = document.getElementById("pattern");
    if (patternEl) patternEl.innerText = state.pattern || "";

    // TIMER
    const timerEl = document.getElementById("timer");
    if (timerEl) timerEl.innerText = state.time_remaining?.toFixed(1) || "0.0";

    // PLAYER LIST
    const ul = document.getElementById("players");
    if (ul) {

        ul.innerHTML = "";
        state.players.forEach(p => {
            const li = document.createElement("li");
            let label = p.name;
            if (p.device_id === localDeviceId) {
                label += lang === "jp" ? "（我）" : " (Me)";
            }
            if (p.device_id === state.current_player_device) {
                label = "👉 " + label;
            }
            li.innerText = `${label} ❤️ ${p.lives}`;
            ul.appendChild(li);
        });
    }

    // Error messages
    const errorEl = document.getElementById("error");
    if (errorEl) errorEl.innerText = state.last_error || " ";
}

// **Local timer update every 100ms**
setInterval(() => {
    if (window.gameEnded || !currentState || currentState.time_remaining === null) return;

    const now = Date.now();
    const elapsed = (now - lastUpdate) / 1000; // seconds
    let remaining = Math.max(0, currentState.time_remaining - elapsed);

    // Update timer in UI
    const timerEl = document.getElementById("timer");
    if (timerEl) timerEl.innerText = remaining.toFixed(1);

    // Auto-submit timeout when time runs out
    if (remaining <= 0 && !currentState.time_expired) {
        ws.send(JSON.stringify({ type: "timeout" }));
        currentState.time_expired = true;
    }
}, 100);

// Submit a word
function submitWord() {
    const input = document.getElementById("word");
    const word = input.value.trim();
    if (!word) return;

    ws.send(JSON.stringify({ type: "submit", word }));
    input.value = "";
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
        localStorage.clear()
        localStorage.setItem("lang", lang)
        localStorage.setItem("gameSettings", settings);
        ws.send(JSON.stringify({ type: "return_to_lobby" }));
    }
}