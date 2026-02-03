from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from pydantic import BaseModel
import random
import time
import os
from collections import defaultdict
from dotenv import load_dotenv
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

# Загружаем переменные окружения из .env
load_dotenv()

app = FastAPI(title="Trivia Web API", version="0.1.0")

# Настройка подключения к БД (если указан DATABASE_URL)
DATABASE_URL = os.getenv("DATABASE_URL")
DATABASE_POOL_SIZE = int(os.getenv("DATABASE_POOL_SIZE", "10"))
DATABASE_MAX_OVERFLOW = int(os.getenv("DATABASE_MAX_OVERFLOW", "20"))

_db_engine = None
_db_session_factory = None

def init_database():
    """Инициализация подключения к БД, если указан DATABASE_URL"""
    global _db_engine, _db_session_factory
    if DATABASE_URL:
        print(f"Connecting to database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'configured'}")
        _db_engine = create_engine(
            DATABASE_URL,
            poolclass=QueuePool,
            pool_size=DATABASE_POOL_SIZE,
            max_overflow=DATABASE_MAX_OVERFLOW,
            pool_pre_ping=True,
            echo=False,
        )
        _db_session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=_db_engine
        )
        print("Database connection initialized")
    else:
        print("DATABASE_URL not set, using mock data")

@contextmanager
def get_db_session():
    """Получить сессию БД (если БД настроена)"""
    if _db_session_factory:
        session = _db_session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    else:
        yield None

# Инициализируем БД при старте
init_database()

# Настройка CORS для работы с фронтендом
# В продакшене фронтенд и API находятся в одной Docker сети, поэтому разрешаем все источники
import os
cors_origins = os.getenv("CORS_ORIGINS", "*").split(",") if os.getenv("CORS_ORIGINS") else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Модели данных
class Answer(BaseModel):
    id: int
    text: str
    is_correct: bool

class Question(BaseModel):
    id: int
    text: str
    answers: List[Answer]
    category: Optional[str] = None
    difficulty: Optional[str] = None
    explanation: Optional[str] = None
    created_at: Optional[str] = None
    time_limit: Optional[int] = 10

class QuestionResponse(BaseModel):
    question: Question

class Participant(BaseModel):
    id: int
    name: str
    correct_answers: int
    avatar: Optional[str] = None
    is_current_user: Optional[bool] = False

class LeaderboardResponse(BaseModel):
    participants: List[Participant]
    current_question_number: int
    total_questions: int

# Моковые данные - вопросы
MOCK_QUESTIONS = [
    {
        "id": 1,
        "text": "Какая планета самая большая в Солнечной системе?",
        "answers": [
            {"id": 1, "text": "Земля", "is_correct": False},
            {"id": 2, "text": "Юпитер", "is_correct": True},
            {"id": 3, "text": "Сатурн", "is_correct": False},
            {"id": 4, "text": "Марс", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 2,
        "text": "Сколько континентов на Земле?",
        "answers": [
            {"id": 5, "text": "5", "is_correct": False},
            {"id": 6, "text": "6", "is_correct": False},
            {"id": 7, "text": "7", "is_correct": True},
            {"id": 8, "text": "8", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 3,
        "text": "Какая самая длинная река в мире?",
        "answers": [
            {"id": 9, "text": "Амазонка", "is_correct": False},
            {"id": 10, "text": "Нил", "is_correct": True},
            {"id": 11, "text": "Янцзы", "is_correct": False},
            {"id": 12, "text": "Миссисипи", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 4,
        "text": "В каком году человек впервые высадился на Луну?",
        "answers": [
            {"id": 13, "text": "1967", "is_correct": False},
            {"id": 14, "text": "1969", "is_correct": True},
            {"id": 15, "text": "1971", "is_correct": False},
            {"id": 16, "text": "1973", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 5,
        "text": "Какая столица Австралии?",
        "answers": [
            {"id": 17, "text": "Сидней", "is_correct": False},
            {"id": 18, "text": "Мельбурн", "is_correct": False},
            {"id": 19, "text": "Канберра", "is_correct": True},
            {"id": 20, "text": "Брисбен", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 6,
        "text": "Сколько элементов в периодической таблице Менделеева?",
        "answers": [
            {"id": 21, "text": "112", "is_correct": False},
            {"id": 22, "text": "118", "is_correct": True},
            {"id": 23, "text": "120", "is_correct": False},
            {"id": 24, "text": "126", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 7,
        "text": "Какое животное является символом Австралии?",
        "answers": [
            {"id": 25, "text": "Кенгуру", "is_correct": True},
            {"id": 26, "text": "Коала", "is_correct": False},
            {"id": 27, "text": "Эму", "is_correct": False},
            {"id": 28, "text": "Утконос", "is_correct": False},
        ],
        "time_limit": 10,
    },
    {
        "id": 8,
        "text": "Какой океан самый большой?",
        "answers": [
            {"id": 29, "text": "Атлантический", "is_correct": False},
            {"id": 30, "text": "Тихий", "is_correct": True},
            {"id": 31, "text": "Индийский", "is_correct": False},
            {"id": 32, "text": "Северный Ледовитый", "is_correct": False},
        ],
        "time_limit": 10,
    },
]

# Моковые данные - участники
MOCK_PARTICIPANTS = [
    {"id": 1, "name": "Алексей", "correct_answers": 0, "is_current_user": True},
    {"id": 2, "name": "Мария", "correct_answers": 0},
    {"id": 3, "name": "Дмитрий", "correct_answers": 0},
    {"id": 4, "name": "Анна", "correct_answers": 0},
    {"id": 5, "name": "Иван", "correct_answers": 0},
    {"id": 6, "name": "София", "correct_answers": 0},
    {"id": 7, "name": "Максим", "correct_answers": 0},
    {"id": 8, "name": "Елена", "correct_answers": 0},
    {"id": 9, "name": "Павел", "correct_answers": 0},
    {"id": 10, "name": "Ольга", "correct_answers": 0},
]

# Хранилище правильных ответов (в реальном приложении будет БД)
# Ключ: user_id, значение: количество правильных ответов
user_scores = defaultdict(int)
# Инициализируем начальные значения для демонстрации
for i in range(1, 11):
    user_scores[i] = 0
current_round_question = 0  # Текущий номер вопроса в раунде

# Инициализация при старте сервера
print(f"API server starting. Initial current_round_question={current_round_question}")

@app.get("/")
async def root():
    return {"message": "Trivia Web API", "version": "0.1.0"}

@app.get("/api/questions/random", response_model=QuestionResponse)
async def get_random_question():
    """Получить случайный вопрос"""
    import traceback
    global current_round_question
    
    print(f"=== /api/questions/random CALLED ===")
    print(f"BEFORE: current_round_question={current_round_question}")
    print(f"Call stack:\n{''.join(traceback.format_stack()[-5:-1])}")
    
    # Проверяем, не завершен ли раунд ПЕРЕД увеличением счетчика
    # Если счетчик уже 10, значит 10-й вопрос уже был задан, следующий запрос должен вернуть ошибку
    if current_round_question >= 10:
        print(f"Round already completed. current_round_question={current_round_question}")
        raise HTTPException(status_code=400, detail="Round completed. Please start a new round.")
    
    # Увеличиваем номер текущего вопроса только если раунд не завершен
    # И только ПЕРЕД возвратом вопроса (после успешной генерации)
    question_data = random.choice(MOCK_QUESTIONS)
    question = Question(**question_data)
    
    # Увеличиваем счетчик только после успешной генерации вопроса
    current_round_question = current_round_question + 1
    print(f"AFTER: current_round_question={current_round_question}")
    print(f"Returning question ID: {question.id}")
    print(f"=== /api/questions/random COMPLETE ===\n")
    
    return QuestionResponse(question=question)

@app.get("/api/questions/{question_id}", response_model=QuestionResponse)
async def get_question(question_id: int):
    """Получить вопрос по ID (не увеличивает счетчик раунда)"""
    print(f"Fetching question by ID: {question_id} (current_round_question={current_round_question})")
    question_data = next((q for q in MOCK_QUESTIONS if q["id"] == question_id), None)
    if not question_data:
        raise HTTPException(status_code=404, detail="Question not found")
    question = Question(**question_data)
    return QuestionResponse(question=question)

class AnswerRequest(BaseModel):
    question_id: int
    answer_id: int
    is_correct: bool

@app.post("/api/answer")
async def submit_answer(answer: AnswerRequest):
    """Отправить ответ на вопрос"""
    # В реальном приложении здесь будет сохранение в БД
    # Пока симулируем обновление счетчика для текущего пользователя (ID=1)
    if answer.is_correct:
        user_scores[1] = user_scores.get(1, 0) + 1  # Увеличиваем счетчик для текущего пользователя
        print(f"User 1 correct answer! New score: {user_scores[1]}")
    
    # Симулируем ответы других участников на этот же вопрос
    # В реальности это будет приходить от других клиентов
    for user_id in range(2, 11):  # Участники с ID от 2 до 10
        # Симулируем, что каждый участник с вероятностью 70% ответил правильно
        if random.random() < 0.7:
            user_scores[user_id] = user_scores.get(user_id, 0) + 1
    
    print(f"Current scores: {dict(user_scores)}")
    return {"success": True, "correct": answer.is_correct}

@app.get("/api/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard():
    """Получить таблицу лидеров"""
    global current_round_question
    try:
        # Создаем данные участников с актуальными счетчиками
        participants_data = []
        
        for i, p in enumerate(MOCK_PARTICIPANTS):
            user_id = p["id"]
            # Берем актуальный счетчик из хранилища
            correct_answers = user_scores.get(user_id, 0)
            
            participants_data.append({
                **p,
                "correct_answers": correct_answers
            })
        
        # Сортируем по убыванию правильных ответов
        participants_data.sort(key=lambda x: x["correct_answers"], reverse=True)
        
        # Обновляем ID для правильной сортировки
        for i, p in enumerate(participants_data):
            p["id"] = i + 1
        
        participants = [Participant(**p) for p in participants_data]
        
        print(f"/api/leaderboard: current_round_question={current_round_question}, total_questions=10")
        
        return LeaderboardResponse(
            participants=participants,
            current_question_number=current_round_question,
            total_questions=10
        )
    except Exception as e:
        print(f"ERROR in /api/leaderboard: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/round/reset")
async def reset_round():
    """Сбросить текущий раунд (начать новый)"""
    global current_round_question
    import traceback
    print(f"=== RESET ROUND CALLED ===")
    print(f"Previous question number: {current_round_question}")
    print(f"Call stack: {''.join(traceback.format_stack())}")
    current_round_question = 0
    # Сбрасываем счетчики правильных ответов для нового раунда
    for i in range(1, 11):
        user_scores[i] = 0
    print("Round reset complete. Scores cleared.")
    print(f"=== RESET ROUND COMPLETE ===")
    return {"success": True, "message": "Round reset"}

@app.post("/api/game/leave")
async def leave_game():
    """
    Покинуть игру (выход из игры через веб-интерфейс)
    В будущем здесь будет интеграция с ботом для уведомления о выходе
    """
    # TODO: Интеграция с реальной БД и ботом
    # 1. Получить game_id и user_id из запроса (или из сессии/токена)
    # 2. Обновить статус игрока в БД (left_game = True)
    # 3. Уведомить бота о выходе игрока
    # 4. Бот отправит сообщение в Telegram и вернет в главное меню
    
    print("=== LEAVE GAME CALLED ===")
    print("Player left the game via web interface")
    # Пока возвращаем успешный ответ
    # В будущем здесь будет реальная логика
    return {"success": True, "message": "Game left successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
