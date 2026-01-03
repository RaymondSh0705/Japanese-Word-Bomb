class Player:
    def __init__(self, id, device_id):
        self.id = id
        self.device_id = device_id
        self.is_eliminated = False
        self.lives = 3
        self.word = None

    def lose_life(self):
        if self.lives <= 0:
            self.is_eliminated = True
        else:
            self.lives -= 1

    def __repr__(self):
        return str(self.id)
    
    def change_start_lives(self, lives: int):
        self.lives = lives