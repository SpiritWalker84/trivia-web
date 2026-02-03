"""
Общие константы для Trivia Bot и Web API.
"""
from typing import Final

# Настройки игры
ROUNDS_PER_GAME: Final[int] = 9
QUESTIONS_PER_ROUND: Final[int] = 10
PLAYERS_PER_GAME: Final[int] = 10
MIN_PLAYERS_FOR_QUICK_START: Final[int] = 10
MIN_PLAYERS_FOR_VOTE: Final[int] = 3

# Таймеры (в секундах)
QUESTION_TIME_LIMIT: Final[int] = 10
TIE_BREAK_TIME_LIMIT: Final[int] = 20
VOTE_DURATION: Final[int] = 45
PAUSE_BETWEEN_ROUNDS_SEC: Final[int] = 60
TIMER_UPDATE_INTERVAL_SEC: Final[int] = 2

# Лимиты
MAX_ACTIVE_GAMES: Final[int] = 500
MAX_QUESTIONS_IN_DB: Final[int] = 50000
POOL_CHECK_INTERVAL: Final[int] = 300  # 5 минут

# Настройки ботов
BOT_MIN_RESPONSE_DELAY: Final[int] = 3
BOT_MAX_RESPONSE_DELAY: Final[int] = 15
BOT_NOVICE_ACCURACY: Final[float] = 0.55
BOT_AMATEUR_ACCURACY: Final[float] = 0.68
BOT_EXPERT_ACCURACY: Final[float] = 0.80

# Рейтинговая система
RATING_WINNER_BONUS: Final[int] = 20
RATING_SECOND_BONUS: Final[int] = 12
RATING_THIRD_BONUS: Final[int] = 8
RATING_4_5_BONUS: Final[int] = 4
RATING_6_8_BONUS: Final[int] = 0
RATING_9_10_PENALTY: Final[int] = -4

# Варианты ответов
CORRECT_OPTIONS: Final[list[str]] = ['A', 'B', 'C', 'D']
OPTION_LETTERS: Final[dict[int, str]] = {0: 'A', 1: 'B', 2: 'C', 3: 'D'}
