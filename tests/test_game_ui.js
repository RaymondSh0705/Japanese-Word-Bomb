const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const elements = new Map();
function mockElement() {
    const classes = new Set();
    return {
        style: {}, dataset: {}, listeners: {}, value: "", children: [],
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        },
        addEventListener(event, callback) { this.listeners[event] = callback; },
        appendChild(child) { this.children.push(child); }, focus() {}, setAttribute() {},
        set innerHTML(value) { this.children = []; },
    };
}
function element(id) {
    if (!elements.has(id)) elements.set(id, mockElement());
    return elements.get(id);
}
const storage = new Map([["device_id", "a"], ["lang", "en"], ["showTyping", "false"]]);
let socket;
let timer;
class WebSocket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.sent = []; socket = this; }
    send(message) { this.sent.push(JSON.parse(message)); }
}
const context = vm.createContext({
    URLSearchParams, WebSocket, console, Date,
    window: { location: { search: "?code=TEST", protocol: "http:", host: "localhost" } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: element, createElement: mockElement },
    setInterval: callback => { timer = callback; },
});
vm.runInContext(fs.readFileSync("static/game.js", "utf8"), context);
const state = {
    started: true, host_id: "a", turn_id: 1, time_remaining: 5,
    current_player_name: "A", current_player_device: "a", players: [],
    winner: null, current_typing: "", typing_result: null,
};
function receive(message) { socket.onmessage({ data: JSON.stringify(message) }); }

assert.equal(elements.has("show-typing"), false);
assert.equal(elements.has("last-guess"), false);

receive(state);
assert.equal(element("current-typing").textContent, "");
const lastUpdate = vm.runInContext("lastUpdate", context);
receive({ type: "typing", word: "<script>あ</script>", turn_id: 1 });
assert.equal(element("current-typing").textContent, "<script>あ</script>");
assert.equal(vm.runInContext("lastUpdate", context), lastUpdate);
receive({ type: "typing", word: "old turn", turn_id: 0 });
assert.equal(element("current-typing").textContent, "<script>あ</script>");

receive({ type: "guess", word: "あxxx", result: "Word does not exist", turn_id: 1 });
assert.equal(element("current-typing").textContent, "あxxx");
assert.equal(element("current-typing").dataset.result, "incorrect");
receive({ type: "typing", word: "あい", turn_id: 1 });
assert.equal(element("current-typing").textContent, "あい");
assert.equal(element("current-typing").dataset.result, "");
receive({ type: "guess", word: "あい", result: "OK", turn_id: 1 });
assert.equal(element("current-typing").textContent, "あい");
assert.equal(element("current-typing").dataset.result, "correct");
assert.equal(element("arena").classList.contains("turn-success"), true);

element("word").value = "あい";
element("word").listeners.input();
assert.equal(socket.sent.at(-1).type, "typing");
assert.equal(socket.sent.at(-1).word, "あい");
const count = socket.sent.length;
element("word").listeners.keydown({ key: "Enter", isComposing: true });
assert.equal(socket.sent.length, count, "IME confirmation must not submit the word");
element("word").listeners.keydown({ key: "Enter", isComposing: false, preventDefault() {} });
assert.equal(socket.sent.at(-1).type, "submit");

receive({ ...state, turn_id: 2, current_player_device: "b" });
assert.equal(element("word").disabled, true);
assert.equal(element("current-typing").textContent, "");
assert.equal(element("current-typing").dataset.result, "");
receive({ type: "typing", word: "いい", turn_id: 2 });
assert.equal(element("current-typing").textContent, "いい");
receive({ ...state, turn_id: 2, current_player_device: "b", time_remaining: 0 });
const beforeTimeout = socket.sent.length;
timer();
assert.equal(socket.sent.length, beforeTimeout, "Spectators must not send timeouts");
receive({ ...state, time_remaining: 0 });
timer();
assert.equal(socket.sent.at(-1).type, "timeout");

const players = [{ name: "A", device_id: "a", lives: 3 }, { name: "B", device_id: "b", lives: 3 }];
receive({ ...state, settings: { time: 10 }, time_remaining: 5, players });
assert.equal(element("timer-bar").style.width, "50%");
assert.equal(element("players").children[0].classList.contains("is-current"), true);
assert.equal(element("current-player").children[0].className, "current-player-name");
assert.equal(element("current-player").children[0].textContent, "A");
assert.equal(element("current-player").children[1].textContent, "’s turn");
assert.equal(element("players").children[0].children[1].children[0].className, "life-hearts");
assert.equal(element("turn-status").textContent, "Your turn");
assert.equal(element("turn-status").dataset.status, "active");
assert.equal(element("arena").dataset.urgent, "false");
element("arena").listeners.animationend();
receive({ ...state, turn_id: 3, settings: { time: 10 }, time_remaining: 10,
    current_player_device: "b", players: [{ ...players[0], lives: 2 }, players[1]] });
assert.equal(element("arena").classList.contains("life-loss"), true);
assert.equal(element("players").children[0].classList.contains("life-loss"), true);
assert.equal(element("players").children[1].classList.contains("is-current"), true);
assert.equal(element("turn-status").textContent, "Watching");
element("arena").listeners.animationend();
receive({ ...state, turn_id: 3, players: [{ ...players[0], lives: 2 }, players[1]] });
assert.equal(element("arena").classList.contains("life-loss"), false, "Duplicate state must not replay life loss");
receive({ ...state, winner: "A", players });
assert.equal(element("arena").classList.contains("turn-success"), true);
assert.equal(element("word").disabled, true);
receive({ ...state, current_player_device: "b", players: [{ ...players[0], lives: 0, eliminated: true }, players[1]] });
assert.equal(element("turn-status").textContent, "Dead");
assert.equal(element("turn-status").dataset.status, "dead");
assert.equal(element("word").disabled, true);
assert.equal(element("submit").disabled, true);
receive({ ...state, players });
assert.equal(element("turn-status").textContent, "Your turn", "Restart restores the active badge");
console.log("Game UI checks passed: typing, guess colors, turns, IME, timeouts, timer bar, life-loss and win animations.");
