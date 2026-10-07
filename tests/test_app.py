import asyncio
import os
from pathlib import Path
import time
import unittest

from game import Game
import main
from player import Player


class Socket:
    def __init__(self, fail=False):
        self.messages = []
        self.fail = fail

    async def send_json(self, message):
        if self.fail:
            raise OSError("connection lost")
        self.messages.append(message)


class GameTests(unittest.TestCase):
    def test_unknown_starting_character_is_rejected(self):
        game = Game([], 1)
        game.current_pattern = "あ"
        self.assertEqual(game.submit_word("xあ"), "Word does not exist")
        self.assertFalse(game.check_word_exists(""))

    def test_dictionary_is_shared(self):
        self.assertIs(Game([], 1).dictionary, Game([], 2).dictionary)

    def test_empty_game_can_start_safely(self):
        game = Game([], 1)
        game.restart_game()
        self.assertFalse(game.serialize()["started"])

    def test_removing_player_preserves_current_turn(self):
        players = [Player(str(i), str(i)) for i in range(3)]
        game = Game(players, 1)
        game.restart_game()
        game.turn_index = 2
        game.remove_player("0")
        self.assertEqual(game.serialize()["current_player_device"], "2")
        game.remove_player("2")
        self.assertEqual(game.serialize()["current_player_device"], "1")
        game.remove_player("1")
        self.assertFalse(game.serialize()["started"])

    def test_elimination_at_zero_lives(self):
        player = Player("A", "a")
        player.lives = 1
        player.lose_life()
        self.assertTrue(player.is_eliminated)
        game = Game([player], 1)
        self.assertIs(game.check_winner(), player)

    def test_invalid_settings_do_not_break_game(self):
        game = Game([], 1)
        game.change_settings({"lives": None, "time": "bad", "turns": -100})
        self.assertEqual(game.starting_lives, 3)
        self.assertEqual(game.time_limit, 5)
        self.assertEqual(game.wrong_turns_before_change, 0)


class AppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.code = (await main.create_lobby())["code"]
        self.lobby = main.lobbies[self.code]
        self.game = self.lobby["game"]
        self.sockets = [Socket(), Socket()]
        for i, ws in enumerate(self.sockets):
            self.lobby["clients"].append(ws)
            await main.handle_message(ws, {"type": "join", "name": str(i), "device_id": str(i)}, self.lobby)
        self.game.restart_game()
        self.game.turn_index = 0

    async def asyncTearDown(self):
        main.lobbies.pop(self.code, None)

    async def test_typing_only_from_current_player_and_current_turn(self):
        start = self.game.turn_start_time
        await main.handle_message(self.sockets[0], {"type": "typing", "word": "あ", "turn_id": start}, self.lobby)
        for ws in self.sockets:
            self.assertEqual(ws.messages[-1], {"type": "typing", "word": "あ", "turn_id": start})
        self.assertEqual(self.game.turn_start_time, start)
        await main.handle_message(self.sockets[1], {"type": "typing", "word": "bad", "turn_id": start}, self.lobby)
        await main.handle_message(self.sockets[0], {"type": "typing", "word": "stale", "turn_id": start - 1}, self.lobby)
        self.assertEqual(self.game.current_typing, "あ")

    async def test_guesses_replace_typing_and_clear_on_new_turn(self):
        self.game.current_pattern = "あ"
        self.game.dictionary = {"あ": {"あい"}}
        await main.handle_message(self.sockets[0], {"type": "submit", "word": "あxxx"}, self.lobby)
        self.assertEqual(self.game.current_typing, "あxxx")
        self.assertEqual(self.game.typing_result, "Word does not exist")
        await main.handle_message(self.sockets[0], {
            "type": "typing", "word": "あい", "turn_id": self.game.turn_start_time,
        }, self.lobby)
        self.assertEqual(self.game.current_typing, "あい")
        self.assertIsNone(self.game.typing_result)
        turn_id = self.game.turn_start_time
        await main.handle_message(self.sockets[0], {"type": "submit", "word": "あい"}, self.lobby)
        self.assertEqual(self.game.turn_index, 1)
        state = self.game.serialize()
        self.assertEqual(self.sockets[1].messages[-2], {
            "type": "guess", "word": "あい", "result": "OK", "turn_id": turn_id,
        })
        self.assertIsNone(state["typing_result"])
        self.assertEqual(state["current_typing"], "")
        self.game.restart_game()
        self.assertIsNone(self.game.typing_result)

    async def test_timeout_is_not_applied_by_each_browser(self):
        self.game.turn_start_time = time.time() - 10
        await main.handle_message(self.sockets[1], {"type": "timeout"}, self.lobby)
        self.assertEqual(self.game.players[0].lives, 3)
        await main.handle_message(self.sockets[0], {"type": "timeout"}, self.lobby)
        await main.handle_message(self.sockets[1], {"type": "timeout"}, self.lobby)
        self.assertEqual([p.lives for p in self.game.players], [2, 3])

    async def test_broadcast_removes_broken_socket(self):
        broken = Socket(fail=True)
        self.lobby["clients"].insert(0, broken)
        self.lobby["connections"][broken] = None
        await main.broadcast_state(self.lobby)
        self.assertNotIn(broken, self.lobby["clients"])
        self.assertEqual(self.sockets[1].messages[-1]["started"], True)

    async def test_early_timeout_returns_corrected_time(self):
        await main.handle_message(self.sockets[0], {"type": "timeout"}, self.lobby)
        self.assertEqual(self.game.players[0].lives, 3)
        self.assertGreater(self.sockets[0].messages[-1]["time_remaining"], 0)

    async def test_http_pages_and_assets_from_another_working_directory(self):
        original = Path.cwd()
        try:
            os.chdir("/private/tmp")
            # Drive the ASGI application directly without an extra test dependency.
            for path in ("/", "/join.html", "/game.html", "/static/game.js"):
                sent = []
                async def receive():
                    return {"type": "http.request", "body": b"", "more_body": False}
                async def send(message):
                    sent.append(message)
                scope = {
                    "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
                    "http_version": "1.1", "method": "GET", "scheme": "http",
                    "path": path, "raw_path": path.encode(), "query_string": b"",
                    "headers": [], "server": ("localhost", 80), "client": ("localhost", 1234),
                }
                await main.app(scope, receive, send)
                self.assertEqual(sent[0]["status"], 200, path)
                self.assertTrue(sent[1]["body"], path)
            self.assertTrue(Game([], 3).patterns)
        finally:
            os.chdir(original)


if __name__ == "__main__":
    unittest.main()
