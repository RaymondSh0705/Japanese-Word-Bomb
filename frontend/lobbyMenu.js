// INSTRUCTIONS BUTTON
const modal = document.getElementById("instructions-modal");
const btn = document.getElementById("instructions-btn");
const closeBtn = document.querySelector(".close-btn");


btn.onclick = () => modal.style.display = "block";
closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (e) => {
    if (e.target == modal) modal.style.display = "none";
};


// LANG SWITCHER
if (localStorage.getItem("lang") == null) {
    localStorage.setItem("lang", "en");
}
let lang = localStorage.getItem("lang");
console.log(lang);
const texts = {
    "en": {
        welcome: "Create or Join a Lobby!",
        createDesc: "Create a Lobby",
        instructions: "How to Play",
        code: "Join Code:",
        lobbyDesc: "Join a lobby",
        langText: "Language:",
        instrHeader: "How to Play Word Bomb",
        instruBody: "1. Wait for your turn.\n2. You will see a word pattern(e.g., \"あい\").\n" +
            "3. Submit a word that matches the pattern before time runs out.\n" +
            "4. If you fail, you lose a life.\n5. Last player standing wins!",
        invalidCode: "Invalid lobby code!"
    },
    "jp": {
        welcome: "ロビーを作成するかロビーに参加してください！",
        createDesc: "ロビーを作成する",
        instructions: "ワードボムの遊び方",
        code: "コード:",
        lobbyDesc: "既存のロビーに参加する",
        langText: "言語:",
        instrHeader: "ワードボムの遊び方",
        instruBody: "1. Wait for your turn.\n2. You will see a word pattern(e.g., \"あい\").\n" +
            "3. Submit a word that matches the pattern before time runs out.\n" +
            "4. If you fail, you lose a life.\n5. Last player standing wins!",
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

// CREATE A LOBBY
document.getElementById("create-lobby").addEventListener("click", async () => {
    console.log("Create Lobby clicked");
    createLobby()
});

// ---- Join lobby ----
document.getElementById("join-lobby").addEventListener("click", () => {
    joinLobby();
});

// MAKE NEW LOBBY
async function createLobby() {
    const res = await fetch("/create_lobby", { method: "POST" });
    const data = await res.json();
    // Redirect to lobby page
    window.location.href = `/join.html?code=${data.code}`;
}

// JOIN EXISTING LOBBY
async function joinLobby() {
    const code = document.querySelector("input").value.toUpperCase();

    const res = await fetch(`/check_lobby/${code}`);
    const data = await res.json();

    if (!data.valid) {
        document.getElementById("wrong-code").style.visibility = "visible";
        return
    }

    window.location.href = `/join.html?code=${code}`;
}