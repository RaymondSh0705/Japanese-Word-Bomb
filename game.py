import pickle
import time
import random
from player import Player

class Game:
    """
    Class that represents one instance of a JP_Word_Bomb game

    Attributes
    ----------
    players : list
        list of Player objects reprsenting players
    dictionary : dictionary
        dictionary of starting kana to all valid words starting with kana
    patterns : list
        list of all valid kana patterns for given difficulty
    turn_index : int
        index of current player (based of player's index in self.players)
    time_limit : float, int
        time per turn
    turn_start_time : float
        global start time of a player's turn
    starting_lives : int
        amount of lives each player starts off with
    wrong_turns_before_change : int
        amount of wrong turns before pattern is changed
    wrong_guesses : int
        how many turns a pattern has gone without a correct guess
    current_pattern : str
        current word pattern (needs to be included in guess to be valid guess)
    used_words : set
        previous valid guessed words
    game_active : bool
        keeps track if game started
    last_error : str
        last error in a guess (used for frontend display)
    winner : Player
        stores winner of game if winner exists
    queue : List
        stores players who joined after game started
    """
    def __init__(self, players: list, difficulty: int):
        """
        Creates blank version of unstarted game with a dictionary of all japanese words based on
        kana spelling and list of all valid kana patterns based on difficulty

        :param players: list Player objects of all players (used for console/testing)
        :param difficulty: difficulty of game (1 = easy, 2 = med, 3 = hard, 4 = practice)
        """
        if difficulty > 4 or difficulty < 1:
            raise ValueError("Value must be between 1, 4 inclusive")
        
        self.players = players
        with open("jp_dict.pkl", "rb") as f:
            self.dictionary = pickle.load(f)

        if difficulty != 4:
            with open(f"patterns{difficulty}.pkl", "rb") as f:
                self.patterns = pickle.load(f)
        else:
            with open(f"patterns1.pkl", "rb") as f:
                self.patterns = pickle.load(f)

        self.turn_index = 0
        self.time_limit = 3
        self.turn_start_time = None
        self.starting_lives = 3
        self.wrong_turns_before_change = 2

        self.wrong_guesses = -1
        self.current_pattern = None
        self.used_words = set()
        self.game_active = False
        self.eliminated_amount = 0 #used only for console
        self.last_error = ""
        self.winner = None
        self.queue = []


    def get_player(self) -> Player:
        return self.players[self.turn_index]

    def time_elapsed(self) -> float:
        if not self.turn_start_time:
            return self.time_limit
        return max(0, self.time_limit - (time.time() - self.turn_start_time))

    def is_turn_expired(self) -> bool:
        return self.time_elapsed() > self.time_limit

    # ---------------- CONSOLE GAME (testing) ---------------- #
    def console_start_game(self):
        """
        Starts the game
        """
        if not isinstance(self.players, list) or len(self.players) <= 0 or self.patterns == None or self.dictionary == None:
            SystemError
        self.game_active = True
        self.current_pattern = self.generate_pattern()
        self.console_next_turn()

    def console_next_turn(self):
        """
        Sets up new turn, check if game is over. Returns winner if game is over
        Gets new player, new word pattern and new start time.
        """
        if self.eliminated_amount == len(self.players) - 1:
            self.game_active = False
            for player in self.players:
                if player.is_eliminated == False:
                    print(f"{player.id} is the winner!")
                    return player
        self.turn_start_time = time.time()
        self.wrong_guesses += 1
        if self.wrong_guesses > self.wrong_turns_before_change:
            self.current_pattern = self.generate_pattern()
            self.wrong_guesses = 0
        while True:
            self.turn_index = (self.turn_index + 1) % len(self.players)
            if not self.players[self.turn_index].is_eliminated:
                break
        self.console_the_turn()

    def console_the_turn(self):
        """
        Deals w/ actions in the turn
        While within time, checks submitted word. If word is valid, next turn. Else
        player loses life.
        """
        print(f"\n{self.players[self.turn_index].id}: Lives left - {self.players[self.turn_index].lives}")
        while not self.is_turn_expired():
            word = input(f"Pattern: {self.current_pattern}. Enter word")
            ans = self.submit_word(word)
            if ans == "OK":
                if self.is_turn_expired():
                    break
                self.used_words.add(word)
                self.console_next_turn()
            else:
                print(ans + "\n")
        if self.is_turn_expired():
            print("OUT OF TIME\n")
            loser = self.players[self.turn_index]
            print(f"{loser.id} loses life")
            loser.lose_life()
            if loser.lives <= 0:
                loser.is_eliminated = True
                self.eliminated_amount += 1
            self.console_next_turn()

    # ---------------- WORD VALIDATION (used for submit_word()) ---------------- #
    def check_word_exists(self, word: str) -> bool:
        return word in self.dictionary[word[:1]]

    def check_pattern_match(self, word: str) -> bool:
        return word.__contains__(self.current_pattern)

    def normalize_kana(self, s) -> bool:
        result = []
        i = 0
        while i < len(s):
            ch = s[i]
            code = ord(ch)
            # Special handling for ヴ + small kana
            if ch == "ヴ":
                # Handle combinations with small vowels or small ya/yu/yo
                if i + 1 < len(s) and s[i+1] in ("ァ", "ィ", "ゥ", "ェ", "ォ", "ャ", "ュ", "ョ"):
                    small = s[i+1]
                    mapping = {
                        "ァ": "ぁ",
                        "ィ": "ぃ",
                        "ゥ": "ぅ",
                        "ェ": "ぇ",
                        "ォ": "ぉ",
                        "ャ": "ゃ",
                        "ュ": "ゅ",
                        "ョ": "ょ"
                    }
                    result.append("ゔ" + mapping[small])
                    i += 2
                    continue
                else:
                    # Just plain ヴ → ゔ
                    result.append("ゔ")
                    i += 1
                    continue

            # Normal katakana → hiragana
            elif 0x30A1 <= code <= 0x30F3:
                result.append(chr(code - 0x60))

            # Not katakana → leave alone
            else:
                result.append(ch)

            i += 1
        return "".join(result)

    # ---------------- GAME FLOW ---------------- #
    def generate_pattern(self) -> str:
        """
        Generate random kana pattern from valid patterns
        
        :return: kana patterns
        """
        return random.choice(list(self.patterns))

    def submit_word(self, word: str) -> str:
        """
        checks if guess is valid
        
        :param word: submitted word (should be in kana)
        :return: error message or "OK" if valid guess
        """
        self.last_error = ""

        hir_word = self.normalize_kana(word)

        if not self.check_pattern_match(hir_word):
            self.last_error = "Incorrect pattern"
            return self.last_error

        if not self.check_word_exists(hir_word):
            self.last_error = "Word does not exist"
            return self.last_error

        if hir_word in self.used_words:
            self.last_error = "Word already used"
            return self.last_error

        self.used_words.add(hir_word)
        self.current_pattern = self.generate_pattern()
        self.wrong_guesses = 99999999999999
        return "OK"

    def check_winner(self) -> Player:
        """
        checks if winner exists, if solo game checks if the single player is eliminated
        
        :return: winner
        """
        if len(self.players) == 1:
            if self.players[0].is_eliminated:
                return self.players[0]
            else:
                return None
            
        alive = [p for p in self.players if p.lives > 0]  # check lives directly
        if len(alive) == 1:
            self.winner = alive[0]
            return alive[0]
        return None

    def add_player(self, player: Player) -> Player:
        if not self.game_active:
            self.players.append(player)
        else:
            self.queue.append(player)
        return player
    
    def remove_player(self, player_id: str) -> Player:
        for p in self.players:
            if p.id == player_id:
                self.players.remove(p)
                return p
    
    def get_player_by_name(self, player_id: str) -> Player:
        for p in self.players:
            if player_id == p.id:
                return p
    
    def serialize(self) -> dict:
        """
        gives current game information to be used by webpage

        :return: dictionary of expected keys and current status of game as values
        """
        return {
            "started": self.game_active,
            "pattern": self.current_pattern if self.game_active else "",
            "time_remaining": self.time_elapsed() if self.game_active else 0,
            "current_player_name": self.get_player().id if self.game_active else "",
            "current_player_device" :self.get_player().device_id if self.game_active else "",
            "players": [
            {
                "name": p.id,
                "lives": p.lives,
                "eliminated": p.is_eliminated,
                "device_id": p.device_id
            }
            for p in self.players
            ],
            "last_error": self.last_error,
            "winner": self.winner.id if self.winner else None,
            "host_id": self.players[0].device_id if len(self.players) > 0 else None
        }


    # ---------------- THE WEB GAME ---------------- #
    def start_game(self):
        """
        Starts Japanese word bomb game. Starts on a random player.
        """
        self.game_active = True
        self.turn_index = random.randint(0, len(self.players) - 1)
        self.current_pattern = self.generate_pattern()
        self.next_turn()

    def reset_to_lobby(self):
        """
        Resets game to unplayed state with no active players
        """
        self.players.clear()
        self.game_active = False
        self.turn_index = 0
        self.last_error = ""
        self.used_words = set()
        self.winner = None
        self.current_pattern = None
        self.turn_start_time = None
        self.queue = []
        self.wrong_guesses = -1
    
    def restart_game(self):
        self.players = self.players + self.queue
        for p in self.players:
            p.lives = self.starting_lives
            p.is_eliminated = False
        self.queue = []
        self.winner = None
        self.game_active = True
        self.last_error = ""
        self.used_words = set()
        self.turn_start_time = None
        self.wrong_guesses = -1
        self.current_pattern = self.generate_pattern()
        self.start_game()

    
    def next_turn(self):
        """
        Controls turn logic of game. Finds current player and generates new pattern if 
        necessary.
        """
        self.last_error = ""
        while True:
            self.turn_index = (self.turn_index + 1) % len(self.players)
            if not self.players[self.turn_index].is_eliminated:
                break
        self.wrong_guesses += 1
        if self.wrong_guesses > self.wrong_turns_before_change:
            self.current_pattern = self.generate_pattern()
            self.wrong_guesses = 0
        self.turn_start_time = time.time()

    def change_settings(self, settings: dict):
        """
        Changes the settings of the game object
        
        :param settings: keys: lives, time, diff
        """
        self.starting_lives = settings.get("lives")
        self.time_limit = settings.get("time")
        self.wrong_turns_before_change = settings.get("turns")
        difficulty = settings.get("diff")
        if difficulty == "medium":
            with open(f"patterns2.pkl", "rb") as f:
                self.patterns = pickle.load(f)
        elif difficulty == "hard":
            with open(f"patterns3.pkl", "rb") as f:
                self.patterns = pickle.load(f)
        else:
            with open(f"patterns1.pkl", "rb") as f:
                self.patterns = pickle.load(f)

    