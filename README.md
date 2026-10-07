CURRENT BUGS (should not affect overall gameplay):
* Single player end screen
* Host leaving midgame
* Some language selection issues

Run locally:
```
pip install -r requirements.txt
uvicorn main:app --reload
```

Render start command:
```
uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
```
Lobbies live in process memory. Use one worker/instance; multiple workers cannot
share lobbies. A restart or deploy clears existing lobbies.

The current player's typing is always shown directly below their name without
a label. Submitted guesses turn green when accepted and red when rejected.
New typing replaces the guess and restores the normal text color. The display
clears on every new turn, restart, or return to the lobby; accepted guesses clear
as soon as the game advances to the next turn.

Regression checks:
```
python -m unittest discover -s tests -v
node tests/test_game_ui.js
```

Server reliability fixes include request-first template rendering, paths relative
to the source files, shared read-only dictionary data, safe rejection of unknown
starting characters, safe player removal/empty starts, and checking timeouts
against the current player and server clock. A Create Lobby click now creates
one lobby. Dependencies are pinned to the versions used for local verification.

To identify a production HTTP 500, check the Render service logs for the Python
traceback at the time of the failed request. The gameplay crashes above affect
WebSockets; they do not establish the cause of a homepage HTTP 500. Look for
template errors or process restarts/memory exhaustion on the failing HTTP route.
