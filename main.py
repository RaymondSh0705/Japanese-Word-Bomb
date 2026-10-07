from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from contextlib import asynccontextmanager

from pathlib import Path
import random
import string
import time
import asyncio

from game import Game
from player import Player

BASE_DIR = Path(__file__).resolve().parent
# LOBBY LIFESPAN
@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(cleanup_lobbies())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass

app = FastAPI(lifespan=lifespan)

lobbies = {}


async def handle_message(ws, data, lobby):
    device_map = lobby["device_map"]
    connections = lobby["connections"]
    clients = lobby["clients"]
    game = lobby["game"]
    if not isinstance(data, dict) or not isinstance(data.get("type"), str):
        return
    touch_lobby(lobby)
    # DEBUG OUTPUT
    # if data["type"] != "join" and connections.get(ws) is None:
    #     print("⚠️ MESSAGE FROM UNBOUND SOCKET:", data)
    # print("MSG FROM:", ws, data)
    # print("PLAYER:", connections.get(ws))
    # print("CURRENT:", game.get_player() if len(game.players) > 0 else None)

    # JOIN GAME
    if data["type"] == "join":
        device_id = data.get("device_id")
        if (not isinstance(device_id, str) or not device_id
                or not isinstance(data.get("name"), str) or not data["name"].strip()):
            return

        if device_id in device_map:
            player = device_map[device_id]
            player.id = data["name"]
            connections[ws] = player
            await broadcast_state(lobby)
            return

        player = Player(data["name"], device_id)
        game.add_player(player)
        print("PLAYER ADDED!-----")

        connections[ws] = player
        device_map[device_id] = player
        await broadcast_state(lobby)

    # START GAME
    elif data["type"] == "start":
        print("GAME STARTED-------")
        if not game.game_active:
            game.restart_game()
        await broadcast_state(lobby)

    # SUBMIT WORD
    elif data["type"] == "submit":
        player = connections.get(ws)

        if not game.game_active or game.winner or not player or player != game.get_player():
            return
        word = data.get("word")
        if not isinstance(word, str) or not word.strip() or len(word) > 200:
            return
        result = game.submit_word(word.strip())
        game.current_typing = word.strip()
        game.typing_result = result
        guess_event = {
            "type": "guess", "word": game.current_typing,
            "result": result, "turn_id": game.turn_start_time,
        }

        if result == "OK":
            game.next_turn()

        await broadcast_to_lobby(lobby, guess_event)
        await broadcast_state(lobby)

    # Typing updates use a separate event so they do not reset clients' timers.
    elif data["type"] == "typing":
        player = connections.get(ws)
        word = data.get("word")
        if (not game.game_active or game.winner or not player
                or player != game.get_player() or not isinstance(word, str)
                or data.get("turn_id") != game.turn_start_time):
            return
        game.current_typing = word[:200]
        game.typing_result = None
        await broadcast_to_lobby(lobby, {
            "type": "typing", "word": game.current_typing,
            "turn_id": game.turn_start_time,
        })

    # RECONNECT
    elif data["type"] == "reconnect":
        device_id = data.get("device_id")
        if device_id in device_map:
            player = device_map[device_id]
            connections[ws] = player  # bind new socket
        await broadcast_state(lobby)
    
    # TIMEOUT
    elif data["type"] == "timeout":
        if not game.game_active or game.winner:
            return
        player = connections.get(ws)
        if not player or player != game.get_player():
            return
        if not game.is_turn_expired():
            # Browser clocks can reach zero slightly before the server's clock.
            await ws.send_json(game.serialize())
            return
        game.current_typing = ""
        game.typing_result = None
        game.get_player().lose_life()

        winner = game.check_winner()
        if winner is not None:
            await broadcast_state(lobby)
            return 
        else:
            game.next_turn()
        await broadcast_state(lobby)
    
    # LOBBY RETURN
    elif data["type"] == "return_to_lobby":
        # device_map.clear()
        game.reset_to_lobby()
        await broadcast_to_lobby(lobby, {"type": "force_return_to_lobby"})

    # RESTART GAME
    elif data["type"] == "restart":
        game.restart_game()
        await broadcast_state(lobby)
    
    # GO TO MAIN MENU
    elif data["type"] == "leave_lobby":
        player = connections.get(ws)
        if player:
            lobby["game"].remove_player(player.id)
            handle_disconnect(ws, lobby)
            device_map.pop(player.device_id, None)
        if len(lobby["game"].players) <= 0:
            lobbies.pop(lobby["code"], None)
            print("lobby deleted")
        await broadcast_state(lobby)
    
    # SETTINGS
    elif data["type"] == "settings":
        settings = data.get("settings")
        if not isinstance(settings, dict):
            return
        game.change_settings(settings)
        await broadcast_state(lobby)
    
    # REQUEST STATE
    elif data["type"] == "request_state":
        await ws.send_json(game.serialize())

# WEBSOCKET CREATION
@app.websocket("/ws/{lobby_code}")
async def websocket_endpoint(ws: WebSocket, lobby_code: str):

    await ws.accept()
    lobby = lobbies.get(lobby_code)
    if not lobby:
        await ws.close()
        return

    lobby["clients"].append(ws)
    lobby["connections"][ws] = None

    try:
        while True:
            data = await ws.receive_json()
            await handle_message(ws, data, lobby)

    except (WebSocketDisconnect, RuntimeError, OSError):
        # Socket closed or invalid state
        pass

    finally:
        handle_disconnect(ws, lobby)

# HANDLE DISCONNECT
def handle_disconnect(ws, lobby):
    if ws in lobby["clients"]:
        lobby["clients"].remove(ws)

    lobby["connections"].pop(ws, None)

# BROADCAST STATE
async def broadcast_state(lobby):
    """
    Gives current state of the game to all players webpage.
    """
    state = lobby["game"].serialize()
    disconnected = []

    for client in list(lobby["clients"]):
        try:
            await client.send_json(state)
        except (WebSocketDisconnect, RuntimeError, OSError):
            disconnected.append(client)

    # Remove dead clients from list
    for client in disconnected:
        handle_disconnect(client, lobby)

# RETURN TO LOBBY SCREEN
async def broadcast_to_lobby(lobby, message):
    disconnected = []
    for client in list(lobby["clients"]):
        try:
            await client.send_json(message)
        except (WebSocketDisconnect, RuntimeError, OSError):
            disconnected.append(client)

    # Remove dead clients from list
    for client in disconnected:
        handle_disconnect(client, lobby)

# NOT USED RN
async def cleanup_sockets(lobby):
    connections = lobby["connections"]
    clients = lobby["clients"]
    for ws in clients:
        try:
            await ws.close()  # close any lingering sockets
        except:
            pass
    clients.clear()
    connections.clear()

# --------DELETE LOBBIES AFTER CERTAIN INACTIVITY TIME------
async def cleanup_lobbies():
    LOBBY_TTL = 600
    while True:
        now = time.time()
        to_delete = []

        for code, lobby in list(lobbies.items()):
            if not lobby["clients"] and now - lobby["last_active"] > LOBBY_TTL:
                to_delete.append(code)

        for code in to_delete:
            print(f"🧹 Cleaning up lobby {code}")
            lobbies.pop(code, None)

        await asyncio.sleep(60)

# CREATE LOBBIES
@app.post("/create_lobby")
async def create_lobby():
    while True:
        code = generate_lobby_code()
        if code not in lobbies:
            break
    lobbies[code] = {
        "game": Game([], 1),
        "clients": [],
        "connections": {},
        "device_map": {},
        "code" : code,
        "last_active": time.time()
    }
    return {"code": code}

# GENERATE LOBBY CODE
def generate_lobby_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

# LAST TIME LOBBY USED
def touch_lobby(lobby):
    lobby["last_active"] = time.time()

# JOIN LOBBY
@app.get("/check_lobby/{code}")
def check_lobby(code: str):
    if code in lobbies:
        return {"valid": True}
    return {"valid": False}

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# use join.html for join webpages
@app.get("/join.html")
def join(request: Request):
    return templates.TemplateResponse(request=request, name="join.html")

# use game.html for join webpages
@app.get("/game.html")
def game(request: Request):
    return templates.TemplateResponse(request=request, name="game.html")

# default to lobby page
@app.get("/")
def lobby(request: Request):
    return templates.TemplateResponse(request=request, name="lobbyMenu.html")


"""
uvicorn main:app --reload

bugs:
return to lobby/restart bugs when theres multiple players
* host leaves on winner screen freezes game
* x out of page means leaving the game/join screen

additions:
max players per lobby
all players can see all players guesses/typings
"""
