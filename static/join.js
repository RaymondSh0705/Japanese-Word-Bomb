const lobbyCode = new URLSearchParams(window.location.search).get("code");
if (!lobbyCode) window.location.href = "/";
const lang = localStorage.getItem("lang") === "jp" ? "jp" : "en";
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${window.location.host}/ws/${lobbyCode}`);
let state = null;
const settingsModal = document.getElementById("settings-modal");
bindDialog(settingsModal, document.getElementById("settings-btn"), document.querySelector(".close-settings"));
const localized = {
    header: ["Lobby", "ロビー"],
    "join-game": ["Your Name", "名前"], join: ["Join", "参加"],
    start: ["Start", "開始"], leave: ["Main menu", "メインメニュー"],
    "settings-btn": ["Settings", "設定"], "settings-header": ["Settings", "設定"],
    "lives-label": ["Lives", "ライフ"], "diff-label": ["Difficulty", "難易度"],
    "time-label": ["Turn time (s)", "制限時間（秒）"], "prompt-label": ["Prompt turns", "お題を維持するターン数"],
    "save-settings": ["Save", "保存"], "player-list-label": ["Players", "プレイヤー"],
};
Object.entries(localized).forEach(([id, text]) => document.getElementById(id).textContent = text[lang === "jp" ? 1 : 0]);
document.getElementById("lobby-code").textContent = `${lang === "jp" ? "コード" : "ROOM"} · ${lobbyCode}`;
document.getElementById("nameInput").placeholder = lang === "jp" ? "ユーザー名" : "Your name";
document.getElementById("nameInput").value = localStorage.getItem("playerName") || "";
function status(text) { document.getElementById("lobby-status").textContent = text; }
function isHost() { return state && state.host_id === localStorage.getItem("device_id"); }
function send(message) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
}
document.getElementById("copy-code").onclick = async () => {
    try {
        await navigator.clipboard.writeText(lobbyCode);
        document.getElementById("copy-code").textContent = lang === "jp" ? "コピーしました" : "Copied!";
    } catch { status(lang === "jp" ? "コードを選択してコピーしてください。" : "Select the room code to copy it."); }
};
document.getElementById("name-form").addEventListener("submit", event => { event.preventDefault(); joinGame(); });
document.getElementById("settings-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!isHost()) return;
    const settings = {
        lives: Number(document.getElementById("setting-lives").value),
        diff: document.getElementById("setting-difficulty").value,
        time: Number(document.getElementById("setting-time").value),
        turns: Number(document.getElementById("setting-turns").value),
    };
    if (!send({ type: "settings", settings })) return;
    localStorage.setItem("gameSettings", JSON.stringify(settings));
    settingsModal.close();
    status(lang === "jp" ? "保存しました。" : "Settings saved.");
});
ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!Array.isArray(message.players)) return;
    state = message;
    const ul = document.getElementById("playerList");
    ul.replaceChildren();
    document.getElementById("player-count").textContent = state.players.length;
    if (!state.players.length) {
        const li = document.createElement("li");
        li.textContent = lang === "jp" ? "参加者はまだいません。" : "No players yet.";
        ul.appendChild(li);
    }
    state.players.forEach(player => {
        const li = document.createElement("li");
        if (player.device_id === state.host_id) {
            const crown = document.createElement("span");
            crown.className = "host-crown";
            crown.textContent = "♛";
            crown.setAttribute("role", "img");
            crown.setAttribute("aria-label", lang === "jp" ? "ホスト" : "Host");
            li.appendChild(crown);
        }
        const name = document.createElement("span");
        name.className = "lobby-player-name";
        name.textContent = `${player.name}${player.device_id === localStorage.getItem("device_id") ? (lang === "jp" ? "（あなた）" : " (you)") : ""}`;
        li.appendChild(name);
        ul.appendChild(li);
    });
    document.getElementById("start").disabled = !isHost() || !state.players.length;
    document.getElementById("settings-btn").disabled = !isHost();
    if (state.settings && !settingsModal.open) {
        const fields = { lives: "lives", diff: "difficulty", time: "time", turns: "turns" };
        Object.entries(fields).forEach(([key, id]) => document.getElementById(`setting-${id}`).value = state.settings[key]);
    }
    if (state.started) window.location.href = `/game.html?code=${lobbyCode}`;
};
ws.onopen = () => {
    if (localStorage.getItem("device_id")) send({ type: "reconnect", device_id: localStorage.getItem("device_id") });
    send({ type: "request_state" });
    status(lang === "jp" ? "" : "");
};
ws.onclose = () => status(lang === "jp" ? "接続切断。再読み込みしてください。" : "Disconnected. Refresh to reconnect.");
function joinGame() {
    const name = document.getElementById("nameInput").value.trim();
    if (!name) return;
    let deviceId = localStorage.getItem("device_id");
    if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem("device_id", deviceId); }
    if (send({ type: "join", name, device_id: deviceId })) {
        localStorage.setItem("playerName", name);
        status(lang === "jp" ? "参加しました。" : "Joined.");
    }
}
function startGame() { if (isHost()) send({ type: "start" }); }
function leaveLobby() {
    send({ type: "leave_lobby", device_id: localStorage.getItem("device_id") });
    ws.close();
    localStorage.removeItem("playerName");
    window.location.href = "/";
}
