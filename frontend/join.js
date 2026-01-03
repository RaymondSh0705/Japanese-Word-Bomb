const params = new URLSearchParams(window.location.search);
const lobbyCode = params.get("code");
if (!lobbyCode) {
    alert("No lobby code provided");
}

const ws = new WebSocket(`ws://localhost:8000/ws/${lobbyCode}`);
let myName = null;

// LANG SWITCHER
let lang = localStorage.getItem("lang");
if (lang == "jp") {
    document.getElementById("header").innerText = "日本語ワードボムロビー";
    document.getElementById("join-game").innerText = "ゲームに参加する";
    document.getElementById("nameInput").placeholder = "ユーザー名";
    document.getElementById("join").innerText = "参加";
    document.getElementById("start").innerText = "開始";
    document.getElementById("leave").innerText = "メインメニューに戻る";
    document.getElementById("settings-btn").innerText = "設定⚙️";
    document.getElementById("settings-header").innerText = "ゲームの設定";
    document.getElementById("lives-label").innerText = "ライフの数: ";
    document.getElementById("diff-label").textContent = "難易度:";
    document.getElementById("time-label").textContent = "期限(秒):";
    document.getElementById("prompt-label").innerText = "Prompt turns:";
    document.getElementById("save-settings").innerText = "設定を保存する";
    document.getElementById("player-list-label").innerText = "プレイヤー・リスト";

}

// -----SETTINGS--------
// MODAL ELEMENTS
const settingsModal = document.getElementById("settings-modal");
const settingsBtn = document.getElementById("settings-btn");
const closeSettings = document.querySelector(".close-settings");
const saveSettingsBtn = document.getElementById("save-settings");

// OPEN MODAL
settingsBtn.onclick = () => settingsModal.style.visibility = "visible";

// CLOSE MODAL
closeSettings.onclick = () => settingsModal.style.visibility = "hidden";
window.onclick = (e) => {
    if (e.target == settingsModal) settingsModal.style.visibility = "hidden";
};
let state = null;
// SAVE SETTINGS
saveSettingsBtn.onclick = () => {
    let host = localStorage.getItem("device_id");
    if (host == null) {
        console.log("Game must have host player");
    }
    else if (host == state.host_id) {
        let parsedLives = parseInt(document.getElementById("setting-lives").value);
        let parsedTime = parseInt(document.getElementById("setting-time").value);
        let parsedTurns = parseInt(document.getElementById("setting-turns").value);
        if (parsedLives < 1) {
            parsedLives = 1;
        } else if (parsedLives > 20) {
            parsedLives = 20;
        }
        if (parsedTime < 1) {
            parsedTime = 1;
        } else if (parsedTime > 60) {
            parsedTime = 60;
        }
        if (parsedTurns < 0) {
            parsedTurns = 0;
        } else if (parsedTurns > 100) {
            parsedTurns = 100;
        }
        const settings = {
            lives: parsedLives,
            diff: document.getElementById("setting-difficulty").value,
            time: parsedTime,
            turns: parsedTurns
        };

        // Store in localStorage to use when creating a lobby
        localStorage.setItem("gameSettings", JSON.stringify(settings));
        settingsModal.style.visibility = "hidden";
        console.log("Settings saved:", settings);
        ws.send(JSON.stringify({
            type: "settings",
            settings: settings
        }));
    }
};

// SET LOBBY CODE TEXT AND DEFAULT SETTINGS
document.addEventListener("DOMContentLoaded", () => {
    if (lang == "jp") {
        document.getElementById("lobby-code").textContent = "ロビーコード: " + lobbyCode;
    } else {
        document.getElementById("lobby-code").textContent = "Lobby Code: " + lobbyCode;
    }

    console.log(localStorage.getItem("gameSettings"));
    const settingsRaw = localStorage.getItem("gameSettings");
    if (settingsRaw) {
        const settings = JSON.parse(settingsRaw);
        document.getElementById("setting-lives").value = settings.lives;
        document.getElementById("setting-difficulty").value = settings.diff;
        document.getElementById("setting-time").value = settings.time;
        document.getElementById("setting-turns").value = settings.turns;
    }
});

// -----JOIN SCREEN----------
ws.onmessage = (event) => {
    state = JSON.parse(event.data);

    // Update player list
    const ul = document.getElementById("playerList");
    ul.innerHTML = "";
    // Empty player list
    if (state.players.length < 1) {
        const li = document.createElement("li");
        lang == "jp" ? li.innerText = "ゲームには少なくとも1人のプレイヤーが必要です" :
            li.innerText = "Game needs at least player to start";
        ul.appendChild(li);
    }
    // Adds game players to player list
    state.players.forEach(p => {
        const li = document.createElement("li");
        p.device_id === state.host_id ? li.innerText = "👑 " + p.name :
            li.innerText = p.name;
        ul.appendChild(li);
    });

    // If game starts → redirect
    if (state.started) {
        window.location.href = `/game.html?code=${lobbyCode}`;
    }
};

ws.onopen = () => {
    ws.send(JSON.stringify({ type: "request_state" }));
    console.log("Connected to lobby");
};

// --------FUNCTIONS----------
function joinGame() {
    myName = document.getElementById("nameInput").value.trim();
    if (!myName) return;

    localStorage.setItem("playerName", myName);

    ws.send(JSON.stringify({
        type: "join",
        name: myName,
        device_id: getDeviceId()
    }));
}


function startGame() {
    let host = localStorage.getItem("device_id");
    if (host == null) {
        console.log("Game must have host player");
    }
    else if (host == state.host_id) {
        ws.send(JSON.stringify({
            type: "start"
        }));
    }
}

function leaveLobby() {
    window.location.href = "/";
    ws.send(JSON.stringify({
        type: "leave_lobby",
        device_id: localStorage.getItem("device_id")
    }));
    ws.close()
    localStorage.removeItem("playerName");
    localStorage.removeItem("device_id");
}

function getDeviceId() {
    let id = localStorage.getItem("device_id");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("device_id", id);
    }
    return id;
}

