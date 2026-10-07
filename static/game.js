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

// LANG SWITCHER
let lang = localStorage.getItem("lang");
if (lang == "jp") {
    document.getElementById("player-list").innerText = "プレイヤー・リスト";
    document.getElementById("word").placeholder = "言葉を入れて";
    document.getElementById("submit").innerText = "提出";
    document.getElementById("restart").innerText = "ゲームをやり直す";
    document.getElementById("return").innerText = "ロビーに戻る";
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
    currentState = state;
    if (newTurn) document.getElementById("word").value = "";
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
    window.gameEnded = false;
    document.getElementById("game-over").style.display = "none";
};

function updateUI(state) {
    updateActivity(state);
    const myTurn = state.started && !state.winner && state.current_player_device === localDeviceId;
    document.getElementById("word").disabled = !myTurn;
    document.getElementById("submit").disabled = !myTurn;
    // CURRENT PLAYER
    const currentPlayerEl = document.getElementById("current-player");
    if (currentPlayerEl) {
        if (lang == "jp") {
            currentPlayerEl.innerText = state.current_player_name + "のターン";
        } else {
            currentPlayerEl.innerText = "Current Player: " + state.current_player_name;
        }
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
