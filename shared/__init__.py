"""
Общая логика для Trivia Bot и Web API.
"""
from .constants import (
    ROUNDS_PER_GAME,
    QUESTIONS_PER_ROUND,
    PLAYERS_PER_GAME,
    QUESTION_TIME_LIMIT,
    TIE_BREAK_TIME_LIMIT,
    VOTE_DURATION,
    PAUSE_BETWEEN_ROUNDS_SEC,
    CORRECT_OPTIONS,
    OPTION_LETTERS,
)
from .models import (
    AnswerOption,
    QuestionData,
    ParticipantData,
    LeaderboardData,
)

__all__ = [
    # Constants
    "ROUNDS_PER_GAME",
    "QUESTIONS_PER_ROUND",
    "PLAYERS_PER_GAME",
    "QUESTION_TIME_LIMIT",
    "TIE_BREAK_TIME_LIMIT",
    "VOTE_DURATION",
    "PAUSE_BETWEEN_ROUNDS_SEC",
    "CORRECT_OPTIONS",
    "OPTION_LETTERS",
    # Models
    "AnswerOption",
    "QuestionData",
    "ParticipantData",
    "LeaderboardData",
]
