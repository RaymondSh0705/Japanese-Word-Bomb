const modal = document.getElementById("instructions-modal");
bindDialog(modal, document.getElementById("instructions-btn"), document.querySelector(".close-btn"));
document.getElementById("join-form").addEventListener("submit", event => {
    event.preventDefault();
    joinLobby();
});

// LANG SWITCHER
if (localStorage.getItem("lang") == null) {
    localStorage.setItem("lang", "en");
}
let lang = localStorage.getItem("lang") === "jp" ? "jp" : "en";
document.getElementById("language-switch").value = lang;
const texts = {
    "en": {
        welcome: "Create or Join a Lobby",
        createDesc: "Create lobby",
        instructions: "How to Play",
        code: "Room code",
        lobbyDesc: "Join",
        langText: "Language",
        instrHeader: "How to Play",
        instruBody: "1. Wait for your turn.\n2. Check the kana on screen.\n" +
            "3. Enter a word containing the kana before time runs out.\n" +
            "4. Time out and lose a life.\n5. Last player standing wins.",
        invalidCode: "Invalid lobby code!"
    },
    "jp": {
        welcome: "ロビーを作成・参加",
        createDesc: "ロビー作成",
        instructions: "遊び方",
        code: "コード:",
        lobbyDesc: "参加",
        langText: "言語:",
        instrHeader: "遊び方",
        instruBody: "1. 自分のターンを待ちます。\n2. 表示されたかな（例：あい）を確認します。\n" +
            "3. 制限時間内にそのかなを含む言葉を回答します。\n" +
            "4. 時間切れになるとライフを失います。\n5. 最後まで残ったプレイヤーの勝ち！",
        invalidCode: "無効なコード"
    }
};

document.getElementById("welcome").innerText = texts[lang].welcome
document.getElementById("create-lobby").innerText = texts[lang].createDesc;
document.getElementById("join-lobby").innerText = texts[lang].lobbyDesc;
document.getElementById("code-input").innerText = texts[lang].code;
document.getElementById("language-text").innerText = texts[lang].langText;
document.getElementById("instructions-body").innerText = texts[lang].instruBody;
document.getElementById("instructions-header").innerText = texts[lang].instrHeader;
document.getElementById("instructions-btn").innerText = texts[lang].instructions;
document.getElementById("wrong-code").innerText = texts[lang].invalidCode;

const langSelect = document.getElementById("language-switch");
langSelect.onchange = () => {
    localStorage.setItem("lang", langSelect.value);
    lang = localStorage.getItem("lang");
    translateUI(lang);
    document.getElementById("welcome").innerText = texts[lang].welcome
    document.getElementById("create-lobby").innerText = texts[lang].createDesc;
    document.getElementById("join-lobby").innerText = texts[lang].lobbyDesc;
    document.getElementById("code-input").innerText = texts[lang].code;
    document.getElementById("language-text").innerText = texts[lang].langText;
    document.getElementById("instructions-body").innerText = texts[lang].instruBody;
    document.getElementById("instructions-header").innerText = texts[lang].instrHeader;
    document.getElementById("instructions-btn").innerText = texts[lang].instructions;
    document.getElementById("wrong-code").innerText = texts[lang].invalidCode;
};

// MAKE NEW LOBBY
async function createLobby() {
    const button = document.getElementById("create-lobby");
    if (button.disabled) return;
    button.disabled = true;
    try {
        const res = await fetch("/create_lobby", { method: "POST" });
        if (!res.ok) throw new Error(`Create lobby failed: HTTP ${res.status}`);
        const data = await res.json();
        window.location.href = `/join.html?code=${data.code}`;
    } catch (error) {
        console.error(error);
        alert(lang === "jp" ? "ロビーを作成できませんでした。もう一度お試しください。" : "Could not create a lobby. Please try again.");
        button.disabled = false;
    }
}

// JOIN EXISTING LOBBY
async function joinLobby() {
    const code = document.getElementById("join-code").value.trim().toUpperCase();
    const errorEl = document.getElementById("wrong-code");
    errorEl.style.visibility = "hidden";
    errorEl.textContent = texts[lang].invalidCode;
    if (!code) return;

    try {
        const res = await fetch(`/check_lobby/${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error("Lobby check failed");
        const data = await res.json();

        if (!data.valid) {
            document.getElementById("wrong-code").style.visibility = "visible";
            return
        }

        window.location.href = `/join.html?code=${code}`;
    } catch (error) {
        errorEl.textContent = lang === "jp" ? "接続できません。もう一度お試しください。" : "Could not connect. Please try again.";
        errorEl.style.visibility = "visible";
    }
}
