"""
Общие модели данных для Trivia Bot и Web API.
"""
from typing import Optional, List
from pydantic import BaseModel


class AnswerOption(BaseModel):
    """Вариант ответа."""
    id: int
    text: str
    is_correct: bool


class QuestionData(BaseModel):
    """Модель вопроса для API."""
    id: int
    text: str
    answers: List[AnswerOption]
    category: Optional[str] = None
    difficulty: Optional[str] = None
    explanation: Optional[str] = None
    time_limit: int = 10
    created_at: Optional[str] = None


class ParticipantData(BaseModel):
    """Модель участника для таблицы лидеров."""
    id: int
    name: str
    correct_answers: int
    avatar: Optional[str] = None
    is_current_user: Optional[bool] = False


class LeaderboardData(BaseModel):
    """Данные таблицы лидеров."""
    participants: List[ParticipantData]
    current_question_number: int
    total_questions: int
