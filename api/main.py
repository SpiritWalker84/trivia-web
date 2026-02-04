from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from pydantic import BaseModel
import random
import time
import os
import sys
from collections import defaultdict
from dotenv import load_dotenv
from contextlib import contextmanager
from sqlalchemy import create_engine, func, and_, select
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
import string

# Импорт моделей БД из shared
try:
    # Добавляем путь к shared в sys.path
    # В Docker контейнере shared будет в /app/shared/, локально в ../shared/
    current_dir = os.path.dirname(__file__)  # /app/ в Docker, api/ локально
    shared_paths = [
        os.path.join(current_dir, 'shared'),  # /app/shared/ в Docker
        os.path.join(os.path.dirname(current_dir), 'shared'),  # ../shared/ локально
    ]
    
    shared_path = None
    for path in shared_paths:
        if os.path.exists(path):
            shared_path = path
            if path not in sys.path:
                sys.path.insert(0, path)
            break
    
    from db_models import (
        Game, GamePlayer, Round, RoundQuestion, Question as DBQuestion, Answer as AnswerModel,
        User, Theme
    )
    DB_MODELS_AVAILABLE = True
    print(f"Database models imported successfully from shared/db_models.py (path: {shared_path if shared_path else 'found'})")
except ImportError as e:
    print(f"Could not import database models: {e}")
    print(f"Python path: {sys.path}")
    print("Will use mock data")
    DB_MODELS_AVAILABLE = False
    Game = GamePlayer = Round = RoundQuestion = DBQuestion = AnswerModel = User = Theme = None

# Загружаем переменные окружения из .env
load_dotenv()

app = FastAPI(title="Trivia Web API", version="0.1.0")

# URL фронтенда для генерации ссылок приглашения
FRONTEND_URL = os.getenv("WEB_URL") or os.getenv("FRONTEND_URL") or ""

# Helpers for room codes (base36)
_BASE36_ALPHABET = string.digits + string.ascii_uppercase

def encode_room_code(game_id: int) -> str:
    """Encode numeric game_id to a short base36 room code."""
    if game_id <= 0:
        return "0"
    n = game_id
    chars = []
    while n > 0:
        n, r = divmod(n, 36)
        chars.append(_BASE36_ALPHABET[r])
    return "".join(reversed(chars))

def decode_room_code(code: str) -> Optional[int]:
    """Decode base36 room code to numeric game_id."""
    if not code:
        return None
    code = code.strip().upper()
    try:
        return int(code, 36)
    except ValueError:
        return None

# Telegram ID администратора (можно переопределить через переменную окружения)
ADMIN_TELEGRAM_ID = int(os.getenv("ADMIN_TELEGRAM_ID", "320889576"))

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
    round_question_id: Optional[int] = None  # ID вопроса в раунде (RoundQuestion.id)

class Participant(BaseModel):
    id: int
    name: str
    correct_answers: int
    avatar: Optional[str] = None
    is_current_user: Optional[bool] = False
    is_eliminated: Optional[bool] = False
    total_time: Optional[float] = 0.0  # Общее время ответов в раунде (в секундах)

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

def answer_for_bots_sync(session: Session, game_id: int, round_question_id: int, db_question: DBQuestion):
    """
    Автоматически отвечает за всех ботов в игре на текущий вопрос (синхронная версия)
    """
    try:
        # Получаем всех ботов в игре
        bot_players = session.query(GamePlayer).join(User).filter(
            and_(
                GamePlayer.game_id == game_id,
                User.is_bot == True,
                GamePlayer.is_eliminated == False
            )
        ).all()
        
        if not bot_players:
            return
        
        # Получаем правильный ответ
        correct_option = db_question.correct_option  # 'A', 'B', 'C', or 'D'
        correct_answer_id = {'A': 1, 'B': 2, 'C': 3, 'D': 4}.get(correct_option, 1)
        
        # Получаем количество вариантов ответа
        num_options = 2
        if db_question.option_d:
            num_options = 4
        elif db_question.option_c:
            num_options = 3
        
        for bot_player in bot_players:
            # Проверяем, не ответил ли уже бот на этот вопрос
            existing_answer = session.query(AnswerModel).filter(
                and_(
                    AnswerModel.round_question_id == round_question_id,
                    AnswerModel.user_id == bot_player.user_id
                )
            ).first()
            
            if existing_answer:
                continue  # Бот уже ответил
            
            # Получаем уровень сложности бота
            bot_user = session.query(User).filter(User.id == bot_player.user_id).first()
            bot_difficulty = bot_user.bot_difficulty if bot_user else 'amateur'
            
            # Определяем точность бота в зависимости от уровня сложности
            # Подбираем более мягкие проценты, чтобы боты не брали 9-10/10 на среднем
            accuracy = {
                'novice': 0.45,
                'amateur': 0.55,
                'expert': 0.70
            }.get(bot_difficulty, 0.55)
            
            # Бот отвечает правильно с вероятностью accuracy
            is_correct = random.random() < accuracy
            
            if is_correct:
                selected_option = correct_option
                selected_answer_id = correct_answer_id
            else:
                # Выбираем случайный неправильный ответ
                wrong_options = [opt for opt in ['A', 'B', 'C', 'D'][:num_options] if opt != correct_option]
                selected_option = random.choice(wrong_options)
                selected_answer_id = {'A': 1, 'B': 2, 'C': 3, 'D': 4}[selected_option]
            
            # Случайное время ответа (от 3 до 15 секунд)
            answer_time = random.uniform(3.0, 15.0)
            
            # Получаем round_id
            round_question = session.query(RoundQuestion).filter(RoundQuestion.id == round_question_id).first()
            if not round_question:
                continue
            
            # Создаем ответ бота
            from datetime import datetime
            import pytz
            bot_answer = AnswerModel(
                game_id=game_id,
                round_id=round_question.round_id,
                round_question_id=round_question_id,
                user_id=bot_player.user_id,
                game_player_id=bot_player.id,
                selected_option=selected_option,
                is_correct=is_correct,
                answer_time=answer_time,
                answered_at=datetime.now(pytz.UTC)
            )
            session.add(bot_answer)
        
        session.commit()
        print(f"Bots answered for round_question_id={round_question_id}, {len(bot_players)} bots")
        
    except Exception as e:
        print(f"Error answering for bots: {e}")
        import traceback
        traceback.print_exc()
        session.rollback()

@app.get("/api/questions/random", response_model=QuestionResponse)
async def get_random_question(
    game_id: Optional[int] = Query(None, description="ID игры"),
    user_id: Optional[int] = Query(None, description="ID пользователя")
):
    """Получить следующий вопрос из текущего раунда игры"""
    import traceback
    from datetime import datetime, timedelta
    import pytz
    global current_round_question
    
    print(f"=== /api/questions/random CALLED ===")
    print(f"game_id={game_id}, user_id={user_id}")
    
    # Если БД доступна и указаны game_id и user_id, используем БД
    if DB_MODELS_AVAILABLE and _db_session_factory and game_id and user_id:
        try:
            with get_db_session() as session:
                # Получаем текущую игру
                game = session.query(Game).filter(Game.id == game_id).first()
                if not game:
                    raise HTTPException(status_code=404, detail="Game not found")
                
                if game.status == 'waiting' or game.status == 'pre_start':
                    raise HTTPException(status_code=202, detail="Game is waiting to start")
                elif game.status != 'in_progress':
                    raise HTTPException(status_code=400, detail=f"Game is not in progress (status: {game.status})")
                
                # Получаем текущий раунд
                current_round = session.query(Round).filter(
                    and_(
                        Round.game_id == game_id,
                        Round.status == 'in_progress'
                    )
                ).first()
                
                if not current_round:
                    raise HTTPException(status_code=400, detail="No active round found")
                
                # Получаем количество вопросов в раунде
                total_questions = session.query(func.count(RoundQuestion.id)).filter(
                    RoundQuestion.round_id == current_round.id
                ).scalar()
                
                # Логика текущего вопроса:
                # 1) Если есть показанный вопрос и его время еще не истекло, возвращаем его (для синхронизации игроков)
                # 2) Иначе берем первый непоказанный вопрос
                now = datetime.now(pytz.UTC)
                displayed_question = session.query(RoundQuestion).filter(
                    and_(
                        RoundQuestion.round_id == current_round.id,
                        RoundQuestion.displayed_at.isnot(None)
                    )
                ).order_by(RoundQuestion.displayed_at.desc()).first()

                round_question = None
                if displayed_question and displayed_question.displayed_at:
                    time_limit = displayed_question.time_limit_sec or 10
                    # Дополнительная пауза между вопросами (2.5 сек)
                    active_until = displayed_question.displayed_at + timedelta(seconds=time_limit + 2.5)
                    if now <= active_until:
                        round_question = displayed_question

                if not round_question:
                    # Берем первый непоказанный вопрос
                    round_question = session.query(RoundQuestion).filter(
                        and_(
                            RoundQuestion.round_id == current_round.id,
                            RoundQuestion.displayed_at.is_(None)
                        )
                    ).order_by(RoundQuestion.question_number).first()

                # Если все вопросы показаны и активного нет, раунд завершен
                if not round_question:
                    raise HTTPException(status_code=400, detail="Round completed. Please start a new round.")
                
                # Получаем сам вопрос
                db_question = session.query(DBQuestion).filter(DBQuestion.id == round_question.question_id).first()
                if not db_question:
                    raise HTTPException(status_code=404, detail="Question not found")
                
                # Формируем варианты ответов в оригинальном порядке (A, B, C, D)
                # БЕЗ перемешивания - показываем варианты как они есть в базе
                options = [
                    {"id": 1, "text": db_question.option_a, "is_correct": db_question.correct_option == 'A'},
                    {"id": 2, "text": db_question.option_b, "is_correct": db_question.correct_option == 'B'},
                ]
                if db_question.option_c:
                    options.append({"id": 3, "text": db_question.option_c, "is_correct": db_question.correct_option == 'C'})
                if db_question.option_d:
                    options.append({"id": 4, "text": db_question.option_d, "is_correct": db_question.correct_option == 'D'})
                
                # НЕ отмечаем вопрос как показанный - это делает только бот!
                # Веб-интерфейс только читает состояние из БД
                
                # Формируем ответ
                question = Question(
                    id=db_question.id,
                    text=db_question.question_text,
                    answers=[Answer(**opt) for opt in options],
                    category=db_question.theme.name if db_question.theme else None,
                    difficulty=db_question.difficulty,
                    time_limit=round_question.time_limit_sec or 10,
                    created_at=db_question.created_at.isoformat() if db_question.created_at else None
                )
                
                current_question_num = round_question.question_number
                print(f"Returning question {current_question_num} from round {current_round.round_number}, round_question_id={round_question.id}")
                
                # Автоматически отвечаем за ботов при получении вопроса
                # Делаем это в фоне, чтобы не блокировать ответ
                try:
                    # Используем отдельную сессию для ботов, чтобы не блокировать текущую транзакцию
                    with get_db_session() as bot_session:
                        answer_for_bots_sync(bot_session, game_id, round_question.id, db_question)
                except Exception as e:
                    print(f"Warning: Could not answer for bots: {e}")
                
                return QuestionResponse(question=question, round_question_id=round_question.id)
                
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error getting question from DB: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to mock data
            pass
    
    # Fallback: используем мок-данные
    print(f"BEFORE: current_round_question={current_round_question}")
    print(f"Call stack:\n{''.join(traceback.format_stack()[-5:-1])}")
    
    if current_round_question >= 10:
        print(f"Round already completed. current_round_question={current_round_question}")
        raise HTTPException(status_code=400, detail="Round completed. Please start a new round.")
    
    question_data = random.choice(MOCK_QUESTIONS)
    question = Question(**question_data)
    
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
    game_id: Optional[int] = None
    user_id: Optional[int] = None
    round_question_id: Optional[int] = None  # ID вопроса в раунде (RoundQuestion.id)
    selected_option: Optional[str] = None  # 'A', 'B', 'C', 'D'
    answer_time: Optional[float] = None  # Время ответа в секундах

@app.post("/api/answer")
async def submit_answer(answer: AnswerRequest):
    """Отправить ответ на вопрос"""
    # Если БД доступна и указаны необходимые параметры, сохраняем в БД
    if DB_MODELS_AVAILABLE and _db_session_factory and answer.game_id and answer.user_id and answer.round_question_id:
        try:
            with get_db_session() as session:
                # Получаем RoundQuestion
                round_question = session.query(RoundQuestion).filter(
                    RoundQuestion.id == answer.round_question_id
                ).first()
                
                if not round_question:
                    raise HTTPException(status_code=404, detail="Round question not found")
                
                # Получаем сам вопрос для проверки правильности ответа
                db_question = session.query(DBQuestion).filter(DBQuestion.id == round_question.question_id).first()
                if not db_question:
                    raise HTTPException(status_code=404, detail="Question not found")
                
                # Проверяем правильность ответа на сервере по оригинальному correct_option
                # selected_option - это буква (A, B, C, D), которую выбрал пользователь
                is_correct = answer.selected_option == db_question.correct_option if answer.selected_option else False
                
                # Получаем GamePlayer
                game_player = session.query(GamePlayer).filter(
                    and_(
                        GamePlayer.game_id == answer.game_id,
                        GamePlayer.user_id == answer.user_id
                    )
                ).first()
                
                if not game_player:
                    raise HTTPException(status_code=404, detail="Game player not found")
                
                # Проверяем, не выбыл ли игрок
                if game_player.is_eliminated:
                    # Выбывший игрок может отвечать, но очки не засчитываются
                    print(f"Eliminated player {answer.user_id} answered, but points won't be counted")
                    return {"success": True, "correct": is_correct, "eliminated": True}
                
                # Проверяем, не ответил ли уже пользователь на этот вопрос
                existing_answer = session.query(AnswerModel).filter(
                    and_(
                        AnswerModel.round_question_id == answer.round_question_id,
                        AnswerModel.user_id == answer.user_id
                    )
                ).first()
                
                if existing_answer:
                    # Обновляем существующий ответ
                    existing_answer.selected_option = answer.selected_option
                    existing_answer.is_correct = is_correct  # Используем проверенное значение
                    existing_answer.answer_time = answer.answer_time
                    from datetime import datetime
                    import pytz
                    existing_answer.answered_at = datetime.now(pytz.UTC)
                else:
                    # Создаем новый ответ
                    from datetime import datetime
                    import pytz
                    new_answer = AnswerModel(
                        game_id=answer.game_id,
                        round_id=round_question.round_id,
                        round_question_id=answer.round_question_id,
                        user_id=answer.user_id,
                        game_player_id=game_player.id,
                        selected_option=answer.selected_option,
                        is_correct=is_correct,  # Используем проверенное значение
                        answer_time=answer.answer_time,
                        answered_at=datetime.now(pytz.UTC)
                    )
                    session.add(new_answer)
                
                session.commit()
                print(f"Answer saved: user_id={answer.user_id}, question_id={answer.question_id}, selected_option={answer.selected_option}, correct_option={db_question.correct_option}, is_correct={is_correct}")
                return {"success": True, "correct": is_correct}
                
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error saving answer to DB: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to mock data
            pass
    
    # Fallback: используем мок-данные
    if answer.is_correct:
        user_scores[1] = user_scores.get(1, 0) + 1
        print(f"User 1 correct answer! New score: {user_scores[1]}")
    
    for user_id in range(2, 11):
        if random.random() < 0.7:
            user_scores[user_id] = user_scores.get(user_id, 0) + 1
    
    print(f"Current scores: {dict(user_scores)}")
    return {"success": True, "correct": answer.is_correct}

@app.get("/api/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    game_id: Optional[int] = Query(None, description="ID игры"),
    user_id: Optional[int] = Query(None, description="ID пользователя")
):
    """Получить таблицу лидеров для текущего раунда"""
    global current_round_question
    try:
        # Если БД доступна и указаны game_id и user_id, используем БД
        if DB_MODELS_AVAILABLE and _db_session_factory and game_id:
            with get_db_session() as session:
                # Получаем текущую игру
                game = session.query(Game).filter(Game.id == game_id).first()
                if not game:
                    raise HTTPException(status_code=404, detail="Game not found")
                
                # Получаем текущий раунд
                current_round = session.query(Round).filter(
                    and_(
                        Round.game_id == game_id,
                        Round.status == 'in_progress'
                    )
                ).first()
                
                if not current_round:
                    # Если раунд не активен, берем последний раунд
                    current_round = session.query(Round).filter(
                        Round.game_id == game_id
                    ).order_by(Round.round_number.desc()).first()
                
                if not current_round:
                    raise HTTPException(status_code=404, detail="No rounds found for this game")
                
                # Получаем всех участников игры (включая выбывших)
                game_players = session.query(GamePlayer).filter(
                    and_(
                        GamePlayer.game_id == game_id,
                        GamePlayer.left_game == False
                    )
                ).all()
                
                # Получаем количество правильных ответов для каждого участника в текущем раунде
                participants_data = []
                for gp in game_players:
                    # Проверяем, что у GamePlayer есть связанный User
                    if not gp.user:
                        print(f"Warning: GamePlayer {gp.id} has no associated user, skipping")
                        continue
                    
                    # Считаем правильные ответы в текущем раунде
                    correct_count = session.query(func.count(AnswerModel.id)).filter(
                        and_(
                            AnswerModel.round_id == current_round.id,
                            AnswerModel.user_id == gp.user_id,
                            AnswerModel.is_correct == True
                        )
                    ).scalar() or 0
                    
                    is_eliminated = gp.is_eliminated or False
                    # Логируем для отладки
                    if is_eliminated:
                        print(f"Leaderboard API: Player {gp.user.id} ({gp.user.full_name or gp.user.username}) is eliminated (GamePlayer.id={gp.id}, is_eliminated={gp.is_eliminated})")
                    
                    # Считаем общее время ответов в текущем раунде
                    total_time = session.query(func.sum(AnswerModel.answer_time)).filter(
                        and_(
                            AnswerModel.round_id == current_round.id,
                            AnswerModel.user_id == gp.user_id,
                            AnswerModel.answer_time.isnot(None)
                        )
                    ).scalar() or 0.0
                    
                    participants_data.append({
                        "id": gp.user.id,
                        "name": gp.user.full_name or gp.user.username or f"User {gp.user.id}",
                        "correct_answers": correct_count,
                        "avatar": None,
                        "is_current_user": gp.user_id == user_id if user_id else False,
                        "is_eliminated": is_eliminated,
                        "total_time": float(total_time)
                    })
                
                # Сортируем по убыванию правильных ответов
                participants_data.sort(key=lambda x: x["correct_answers"], reverse=True)
                
                # Получаем текущий номер вопроса
                if current_round.status == 'in_progress':
                    current_round_question_obj = session.query(RoundQuestion).filter(
                        and_(
                            RoundQuestion.round_id == current_round.id,
                            RoundQuestion.displayed_at.isnot(None)
                        )
                    ).order_by(RoundQuestion.displayed_at.desc()).first()
                    current_question_num = current_round_question_obj.question_number if current_round_question_obj else 0
                else:
                    current_question_num = 10  # Раунд завершен
                
                # Получаем общее количество вопросов в раунде
                total_questions = session.query(func.count(RoundQuestion.id)).filter(
                    RoundQuestion.round_id == current_round.id
                ).scalar() or 10
                
                participants = [Participant(**p) for p in participants_data]
                
                print(f"/api/leaderboard: game_id={game_id}, current_question={current_question_num}, total={total_questions}")
                
                return LeaderboardResponse(
                    participants=participants,
                    current_question_number=current_question_num,
                    total_questions=total_questions
                )
        
        # Fallback: используем мок-данные
        participants_data = []
        
        for i, p in enumerate(MOCK_PARTICIPANTS):
            user_id_mock = p["id"]
            correct_answers = user_scores.get(user_id_mock, 0)
            
            participants_data.append({
                **p,
                "correct_answers": correct_answers
            })
        
        participants_data.sort(key=lambda x: x["correct_answers"], reverse=True)
        
        for i, p in enumerate(participants_data):
            p["id"] = i + 1
        
        participants = [Participant(**p) for p in participants_data]
        
        print(f"/api/leaderboard: current_round_question={current_round_question}, total_questions=10")
        
        return LeaderboardResponse(
            participants=participants,
            current_question_number=current_round_question,
            total_questions=10
        )
    except HTTPException:
        raise
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

class LeaveGameRequest(BaseModel):
    game_id: int
    user_id: int

class AdminStopAllGamesRequest(BaseModel):
    telegram_id: int

# Модели для создания игры (standalone frontend)
class CreateGameRequest(BaseModel):
    game_type: str = "quick"  # 'quick', 'training', 'private'
    theme_id: Optional[int] = None  # NULL = mixed
    total_rounds: int = 9
    player_name: str  # Имя игрока (для создания/получения User)
    player_telegram_id: Optional[int] = None  # Если есть telegram_id
    bot_difficulty: Optional[str] = None  # 'novice', 'amateur', 'expert' - для training игр

class CreateGameResponse(BaseModel):
    game_id: int
    user_id: int
    game_type: str
    total_rounds: int

class CreateRoundRequest(BaseModel):
    game_id: int
    round_number: int
    theme_id: Optional[int] = None
    questions_count: int = 10

class CreateRoundResponse(BaseModel):
    round_id: int
    questions_count: int

class StartRoundRequest(BaseModel):
    game_id: int
    round_id: int

class FinishRoundRequest(BaseModel):
    game_id: int
    round_id: int

class MarkQuestionDisplayedRequest(BaseModel):
    round_question_id: int

class CreatePrivateGameRequest(BaseModel):
    player_name: str
    player_telegram_id: Optional[int] = None

class CreatePrivateGameResponse(BaseModel):
    game_id: int
    user_id: int
    total_rounds: int
    invite_code: str
    invite_link: str

class JoinPrivateGameRequest(BaseModel):
    room_code: str
    player_name: str
    player_telegram_id: Optional[int] = None

class JoinPrivateGameResponse(BaseModel):
    game_id: int
    user_id: int
    total_rounds: int

class PrivatePlayersResponse(BaseModel):
    game_id: int
    players: List[Participant]
    host_user_id: Optional[int] = None

class StartPrivateGameRequest(BaseModel):
    game_id: int
    user_id: int

@app.post("/api/game/create", response_model=CreateGameResponse)
async def create_game(request: CreateGameRequest):
    """
    Создать новую игру (для standalone frontend)
    """
    print(f"=== CREATE GAME CALLED === game_type={request.game_type}, player_name={request.player_name}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Создаем или получаем пользователя
            user = None
            if request.player_telegram_id:
                # Ищем по telegram_id
                user = session.query(User).filter(User.telegram_id == request.player_telegram_id).first()
            
            if not user:
                # Создаем нового пользователя
                user = User(
                    telegram_id=request.player_telegram_id,
                    username=request.player_name,
                    full_name=request.player_name,
                    is_bot=False
                )
                session.add(user)
                session.flush()  # Получаем user.id
                print(f"Created new user: id={user.id}, name={request.player_name}")
            else:
                print(f"Using existing user: id={user.id}, name={user.full_name}")
            
            # Создаем игру
            game = Game(
                game_type=request.game_type,
                creator_id=user.id,
                theme_id=request.theme_id,
                status='waiting',
                total_rounds=request.total_rounds,
                current_round=0,
                bot_difficulty=request.bot_difficulty if request.game_type == 'training' else None
            )
            session.add(game)
            session.flush()  # Получаем game.id
            
            # Добавляем игрока в игру
            game_player = GamePlayer(
                game_id=game.id,
                user_id=user.id,
                is_bot=False,
                join_order=1,
                total_score=0
            )
            session.add(game_player)
            
            # Если это тренировка с ботами, добавляем ботов
            if request.game_type == 'training':
                bot_difficulty = request.bot_difficulty or 'amateur'  # По умолчанию amateur
                bot_names = [
                    'Bot_Alpha', 'Bot_Beta', 'Bot_Gamma', 'Bot_Delta', 
                    'Bot_Epsilon', 'Bot_Zeta', 'Bot_Eta', 'Bot_Theta', 'Bot_Iota'
                ]
                
                # Получаем или создаем ботов
                bots = []
                for idx, bot_name in enumerate(bot_names, start=2):  # start=2, т.к. игрок уже join_order=1
                    # Ищем существующего бота с таким именем и уровнем сложности
                    bot_user = session.query(User).filter(
                        User.is_bot == True,
                        User.username == bot_name,
                        User.bot_difficulty == bot_difficulty
                    ).first()
                    
                    if not bot_user:
                        # Создаем нового бота
                        bot_user = User(
                            telegram_id=None,  # У ботов нет telegram_id
                            username=bot_name,
                            full_name=bot_name,
                            is_bot=True,
                            bot_difficulty=bot_difficulty
                        )
                        session.add(bot_user)
                        session.flush()  # Получаем bot_user.id
                        print(f"Created new bot: id={bot_user.id}, name={bot_name}, difficulty={bot_difficulty}")
                    else:
                        print(f"Using existing bot: id={bot_user.id}, name={bot_name}, difficulty={bot_difficulty}")
                    
                    # Добавляем бота в игру
                    bot_game_player = GamePlayer(
                        game_id=game.id,
                        user_id=bot_user.id,
                        is_bot=True,
                        bot_difficulty=bot_difficulty,
                        join_order=idx,
                        total_score=0
                    )
                    session.add(bot_game_player)
                    bots.append(bot_user)
                
                print(f"Added {len(bots)} bots to game {game.id} with difficulty {bot_difficulty}")
            
            session.commit()
            
            print(f"Game created: id={game.id}, user_id={user.id}")
            return CreateGameResponse(
                game_id=game.id,
                user_id=user.id,
                game_type=game.game_type,
                total_rounds=game.total_rounds
            )
            
    except Exception as e:
        print(f"Error creating game: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating game: {str(e)}")

@app.post("/api/private/create", response_model=CreatePrivateGameResponse)
async def create_private_game(request: CreatePrivateGameRequest):
    """
    Создать приватную игру и вернуть код комнаты
    """
    print(f"=== CREATE PRIVATE GAME CALLED === player_name={request.player_name}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Создаем или получаем пользователя
            user = None
            if request.player_telegram_id:
                user = session.query(User).filter(User.telegram_id == request.player_telegram_id).first()
            
            if not user:
                user = User(
                    telegram_id=request.player_telegram_id,
                    username=request.player_name,
                    full_name=request.player_name,
                    is_bot=False
                )
                session.add(user)
                session.flush()
                print(f"Created new user: id={user.id}, name={request.player_name}")
            else:
                print(f"Using existing user: id={user.id}, name={user.full_name}")
            
            # Создаем приватную игру
            game = Game(
                game_type='private',
                creator_id=user.id,
                theme_id=None,
                status='waiting',
                total_rounds=9,
                current_round=0
            )
            session.add(game)
            session.flush()
            
            # Добавляем создателя как игрока
            game_player = GamePlayer(
                game_id=game.id,
                user_id=user.id,
                is_bot=False,
                join_order=1,
                total_score=0
            )
            session.add(game_player)
            session.commit()
            
            invite_code = encode_room_code(int(game.id))
            invite_link = f"{FRONTEND_URL}/?room={invite_code}" if FRONTEND_URL else invite_code
            
            print(f"Private game created: id={game.id}, invite_code={invite_code}")
            return CreatePrivateGameResponse(
                game_id=game.id,
                user_id=user.id,
                total_rounds=game.total_rounds,
                invite_code=invite_code,
                invite_link=invite_link
            )
            
    except Exception as e:
        print(f"Error creating private game: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating private game: {str(e)}")

@app.post("/api/private/join", response_model=JoinPrivateGameResponse)
async def join_private_game(request: JoinPrivateGameRequest):
    """
    Войти в приватную игру по коду комнаты
    """
    print(f"=== JOIN PRIVATE GAME CALLED === room_code={request.room_code}, player_name={request.player_name}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    game_id = decode_room_code(request.room_code)
    if not game_id:
        raise HTTPException(status_code=400, detail="Invalid room code")
    
    try:
        with get_db_session() as session:
            game = session.query(Game).filter(Game.id == game_id).first()
            if not game:
                raise HTTPException(status_code=404, detail="Game not found")
            
            if game.status not in ['waiting', 'pre_start']:
                raise HTTPException(status_code=400, detail="Game is already started or finished")
            
            # Создаем или получаем пользователя
            user = None
            if request.player_telegram_id:
                user = session.query(User).filter(User.telegram_id == request.player_telegram_id).first()
            
            if not user:
                user = User(
                    telegram_id=request.player_telegram_id,
                    username=request.player_name,
                    full_name=request.player_name,
                    is_bot=False
                )
                session.add(user)
                session.flush()
                print(f"Created new user: id={user.id}, name={request.player_name}")
            
            # Проверяем, нет ли уже игрока в игре
            existing_player = session.query(GamePlayer).filter(
                and_(GamePlayer.game_id == game_id, GamePlayer.user_id == user.id)
            ).first()
            
            if not existing_player:
                # Определяем порядок входа
                max_join_order = session.query(func.max(GamePlayer.join_order)).filter(
                    GamePlayer.game_id == game_id
                ).scalar() or 0
                
                new_player = GamePlayer(
                    game_id=game_id,
                    user_id=user.id,
                    is_bot=False,
                    join_order=max_join_order + 1,
                    total_score=0
                )
                session.add(new_player)
                session.commit()
                print(f"Player {user.id} joined private game {game_id}")
            
            return JoinPrivateGameResponse(
                game_id=game.id,
                user_id=user.id,
                total_rounds=game.total_rounds
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error joining private game: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error joining private game: {str(e)}")

@app.get("/api/private/players", response_model=PrivatePlayersResponse)
async def get_private_players(game_id: Optional[int] = Query(None, description="ID игры")):
    """
    Получить список игроков в приватной игре
    """
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not game_id:
        raise HTTPException(status_code=400, detail="game_id is required")
    
    try:
        with get_db_session() as session:
            game = session.query(Game).filter(Game.id == game_id).first()
            if not game:
                raise HTTPException(status_code=404, detail="Game not found")
            
            players = session.query(GamePlayer).join(User).filter(
                and_(GamePlayer.game_id == game_id, GamePlayer.left_game == False)
            ).order_by(GamePlayer.join_order.asc()).all()
            
            participants = []
            for gp in players:
                if not gp.user:
                    continue
                participants.append(Participant(
                    id=gp.user.id,
                    name=gp.user.full_name or gp.user.username or f"User {gp.user.id}",
                    correct_answers=0,
                    avatar=None,
                    is_current_user=False,
                    is_eliminated=False,
                    total_time=0.0
                ))
            
            return PrivatePlayersResponse(
                game_id=game.id,
                players=participants,
                host_user_id=game.creator_id
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting private players: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting private players: {str(e)}")

@app.post("/api/private/start")
async def start_private_game(request: StartPrivateGameRequest):
    """
    Старт приватной игры (только хост)
    """
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            game = session.query(Game).filter(Game.id == request.game_id).first()
            if not game:
                raise HTTPException(status_code=404, detail="Game not found")
            
            if game.creator_id != request.user_id:
                raise HTTPException(status_code=403, detail="Only host can start the game")
            
            if game.status not in ['waiting', 'pre_start']:
                raise HTTPException(status_code=400, detail="Game already started or finished")
            
            # Автодобавление ботов до 10 игроков
            current_players = session.query(GamePlayer).filter(
                GamePlayer.game_id == request.game_id
            ).count()
            bots_needed = max(0, 10 - current_players)
            if bots_needed > 0:
                bot_difficulty = game.bot_difficulty or 'amateur'
                max_join_order = session.query(func.max(GamePlayer.join_order)).filter(
                    GamePlayer.game_id == request.game_id
                ).scalar() or 0
                for idx in range(1, bots_needed + 1):
                    bot_name = f"PrivateBot_{idx}"
                    bot_user = session.query(User).filter(
                        User.is_bot == True,
                        User.username == bot_name,
                        User.bot_difficulty == bot_difficulty
                    ).first()
                    if not bot_user:
                        bot_user = User(
                            telegram_id=None,
                            username=bot_name,
                            full_name=bot_name,
                            is_bot=True,
                            bot_difficulty=bot_difficulty
                        )
                        session.add(bot_user)
                        session.flush()
                    bot_game_player = GamePlayer(
                        game_id=game.id,
                        user_id=bot_user.id,
                        is_bot=True,
                        bot_difficulty=bot_difficulty,
                        join_order=max_join_order + idx,
                        total_score=0
                    )
                    session.add(bot_game_player)
                print(f"Added {bots_needed} bots to private game {game.id} before старт")

            game.status = 'pre_start'
            game.started_at = game.started_at or datetime.now(pytz.UTC)
            session.commit()
            
            return {"success": True, "game_id": game.id}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error starting private game: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error starting private game: {str(e)}")

@app.post("/api/round/create", response_model=CreateRoundResponse)
async def create_round(request: CreateRoundRequest):
    """
    Создать раунд с вопросами (для standalone frontend)
    """
    print(f"=== CREATE ROUND CALLED === game_id={request.game_id}, round_number={request.round_number}, questions_count={request.questions_count}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Проверяем игру
            game = session.query(Game).filter(Game.id == request.game_id).first()
            if not game:
                raise HTTPException(status_code=404, detail="Game not found")
            
            if game.status == 'finished':
                raise HTTPException(status_code=400, detail="Game is finished")
            
            # Проверяем, что раунд с таким номером еще не создан
            existing_round = session.query(Round).filter(
                and_(
                    Round.game_id == request.game_id,
                    Round.round_number == request.round_number
                )
            ).first()
            
            if existing_round:
                raise HTTPException(status_code=400, detail=f"Round {request.round_number} already exists")
            
            # Получаем уже использованные вопросы в этой игре
            used_question_ids = set()
            if hasattr(game, 'used_questions'):
                for uq in game.used_questions:
                    used_question_ids.add(uq.question_id)
            
            # Получаем вопросы из БД (исключая использованные)
            query = session.query(DBQuestion).filter(~DBQuestion.id.in_(used_question_ids))
            
            # Фильтр по теме, если указана
            if request.theme_id:
                query = query.filter(DBQuestion.theme_id == request.theme_id)
            
            # Получаем случайные вопросы
            available_questions = query.order_by(func.random()).limit(request.questions_count).all()
            
            if len(available_questions) < request.questions_count:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Not enough questions available. Found {len(available_questions)}, requested {request.questions_count}"
                )
            
            # Создаем раунд
            round_obj = Round(
                game_id=request.game_id,
                round_number=request.round_number,
                theme_id=request.theme_id,
                status='not_started'
            )
            session.add(round_obj)
            session.flush()  # Получаем round_obj.id
            
            # Создаем RoundQuestion для каждого вопроса
            for idx, question in enumerate(available_questions, start=1):
                round_question = RoundQuestion(
                    round_id=round_obj.id,
                    question_id=question.id,
                    question_number=idx,
                    time_limit_sec=10  # По умолчанию 10 секунд
                )
                session.add(round_question)
                
                # Отмечаем вопрос как использованный в игре
                # TODO: Если есть модель GameUsedQuestion, добавить запись
            
            # Убеждаемся, что все изменения сохранены перед commit
            session.flush()
            session.commit()
            
            print(f"Round created and committed: id={round_obj.id}, questions_count={len(available_questions)}")
            
            print(f"Round created: id={round_obj.id}, questions_count={len(available_questions)}")
            return CreateRoundResponse(
                round_id=round_obj.id,
                questions_count=len(available_questions)
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating round: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating round: {str(e)}")

@app.post("/api/round/start")
async def start_round(request: StartRoundRequest):
    """
    Начать раунд (для standalone frontend)
    """
    print(f"=== START ROUND CALLED === game_id={request.game_id}, round_id={request.round_id}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Проверяем игру
            game = session.query(Game).filter(Game.id == request.game_id).first()
            if not game:
                raise HTTPException(status_code=404, detail="Game not found")
            
            if game.status == 'finished':
                raise HTTPException(status_code=400, detail="Game is finished")
            
            # Проверяем раунд
            round_obj = session.query(Round).filter(Round.id == request.round_id).first()
            if not round_obj:
                raise HTTPException(status_code=404, detail="Round not found")
            
            if round_obj.game_id != request.game_id:
                raise HTTPException(status_code=400, detail="Round does not belong to this game")
            
            # Обновляем статус игры и раунда
            if game.status == 'waiting' or game.status == 'pre_start':
                game.status = 'in_progress'
                if not game.started_at:
                    game.started_at = datetime.now(pytz.UTC)
            
            game.current_round = round_obj.round_number
            round_obj.status = 'in_progress'
            if not round_obj.started_at:
                round_obj.started_at = datetime.now(pytz.UTC)
            
            # Убеждаемся, что все изменения сохранены перед commit
            session.flush()
            session.commit()
            
            print(f"Round started: round_id={request.round_id}")
            return {"success": True, "message": "Round started"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error starting round: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error starting round: {str(e)}")

@app.post("/api/round/finish")
async def finish_round(request: FinishRoundRequest):
    """
    Завершить раунд (для standalone frontend)
    """
    print(f"=== FINISH ROUND CALLED === game_id={request.game_id}, round_id={request.round_id}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Проверяем раунд
            round_obj = session.query(Round).filter(Round.id == request.round_id).first()
            if not round_obj:
                raise HTTPException(status_code=404, detail="Round not found")
            
            if round_obj.game_id != request.game_id:
                raise HTTPException(status_code=400, detail="Round does not belong to this game")
            
            # Завершаем раунд
            round_obj.status = 'finished'
            round_obj.finished_at = datetime.now(pytz.UTC)
            
            # Проверяем, нужно ли завершить игру
            game = session.query(Game).filter(Game.id == request.game_id).first()
            if round_obj.round_number >= game.total_rounds:
                game.status = 'finished'
                game.finished_at = datetime.now(pytz.UTC)
            
            session.commit()
            
            print(f"Round finished: round_id={request.round_id}")
            return {"success": True, "message": "Round finished"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error finishing round: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error finishing round: {str(e)}")

@app.post("/api/round/finish-current")
async def finish_current_round(game_id: int = Query(..., description="ID игры")):
    """
    Завершить текущий активный раунд (для standalone frontend)
    """
    print(f"=== FINISH CURRENT ROUND CALLED === game_id={game_id}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Получаем текущий активный раунд
            current_round = session.query(Round).filter(
                and_(
                    Round.game_id == game_id,
                    Round.status == 'in_progress'
                )
            ).first()
            
            if not current_round:
                # Пробуем найти последний раунд
                current_round = session.query(Round).filter(
                    Round.game_id == game_id
                ).order_by(Round.round_number.desc()).first()
                
                if not current_round:
                    raise HTTPException(status_code=404, detail="No round found")
            
            # Если раунд уже завершен, не выполняем повторное выбытие
            if current_round.status == 'finished':
                game = session.query(Game).filter(Game.id == game_id).first()
                remaining_active_humans = session.query(GamePlayer).join(User).filter(
                    and_(
                        GamePlayer.game_id == game_id,
                        GamePlayer.is_eliminated == False,
                        GamePlayer.left_game == False,
                        User.is_bot == False
                    )
                ).all()
                all_humans_eliminated = len(remaining_active_humans) == 0
                return {
                    "success": True,
                    "round_id": current_round.id,
                    "round_number": current_round.round_number,
                    "game_status": game.status if game else None,
                    "all_humans_eliminated": all_humans_eliminated
                }

            # Завершаем раунд
            current_round.status = 'finished'
            current_round.finished_at = datetime.now(pytz.UTC)
            
            # Выбываем игрока с наименьшим количеством правильных ответов в этом раунде
            # Получаем всех активных игроков
            active_players = session.query(GamePlayer).filter(
                and_(
                    GamePlayer.game_id == game_id,
                    GamePlayer.is_eliminated == False,
                    GamePlayer.left_game == False
                )
            ).all()
            
            all_humans_eliminated = False
            if len(active_players) > 1:  # Выбываем только если осталось больше 1 игрока
                # Считаем правильные ответы и общее время для каждого игрока в этом раунде
                player_scores = []
                for gp in active_players:
                    # Количество правильных ответов
                    correct_count = session.query(func.count(AnswerModel.id)).filter(
                        and_(
                            AnswerModel.round_id == current_round.id,
                            AnswerModel.user_id == gp.user_id,
                            AnswerModel.is_correct == True
                        )
                    ).scalar() or 0
                    
                    # Общее время ответов в этом раунде (сумма всех answer_time)
                    total_time = session.query(func.sum(AnswerModel.answer_time)).filter(
                        and_(
                            AnswerModel.round_id == current_round.id,
                            AnswerModel.user_id == gp.user_id,
                            AnswerModel.answer_time.isnot(None)
                        )
                    ).scalar() or 0.0
                    
                    player_scores.append((gp, correct_count, float(total_time)))
                
                # Сортируем: сначала по количеству правильных ответов (по возрастанию),
                # затем по времени ответов (по убыванию - больше времени = выбывает)
                player_scores.sort(key=lambda x: (x[1], -x[2]))
                
                # Выбывает ТОЛЬКО ОДИН игрок с наименьшим количеством правильных ответов
                # Если несколько игроков с одинаковым минимальным счетом, выбывает тот, кто потратил больше времени
                min_score = min(s for _, s, _ in player_scores)
                players_with_min_score = [(p, s, t) for p, s, t in player_scores if s == min_score]
                
                # Если несколько игроков с минимальным счетом, выбывает тот, кто потратил больше времени
                if len(players_with_min_score) > 1:
                    # Сортируем по времени (по убыванию) - больше времени = выбывает
                    players_with_min_score.sort(key=lambda x: -x[2])
                    eliminated_player, eliminated_score, eliminated_time = players_with_min_score[0]
                else:
                    # Только один игрок с минимальным счетом
                    eliminated_player, eliminated_score, eliminated_time = players_with_min_score[0]
                
                print(f"Elimination logic: min_score={min_score}, players_with_min_score={len(players_with_min_score)}, eliminated_player={eliminated_player.user_id}, time={eliminated_time:.2f}s")
                
                # Помечаем игрока как выбывшего
                eliminated_player.is_eliminated = True
                eliminated_player.eliminated_round = current_round.round_number
                print(f"Player {eliminated_player.user_id} eliminated in round {current_round.round_number} (score: {eliminated_score}, time: {eliminated_time:.2f}s)")
                print(f"DEBUG: Set is_eliminated=True for GamePlayer {eliminated_player.id}, user_id={eliminated_player.user_id}")
                # Принудительно обновляем объект в сессии
                session.add(eliminated_player)
                session.flush()
                # Проверяем, что значение установлено
                session.refresh(eliminated_player)
                print(f"DEBUG: After flush, GamePlayer {eliminated_player.id} is_eliminated={eliminated_player.is_eliminated}")
                
            # Проверяем, остались ли живые человеческие игроки (не боты)
            remaining_active_humans = session.query(GamePlayer).join(User).filter(
                and_(
                    GamePlayer.game_id == game_id,
                    GamePlayer.is_eliminated == False,
                    GamePlayer.left_game == False,
                    User.is_bot == False  # Только человеческие игроки
                )
            ).all()
            all_humans_eliminated = len(remaining_active_humans) == 0

            # Проверяем, нужно ли завершить игру (по количеству раундов или если не осталось живых игроков)
            game = session.query(Game).filter(Game.id == game_id).first()
            if all_humans_eliminated and game and game.status != 'finished':
                game.status = 'finished'
                game.finished_at = datetime.now(pytz.UTC)
                print(f"Game {game_id} stopped: all human players eliminated, only bots remain")
                session.add(game)
                session.flush()

            # Проверяем, нужно ли завершить игру (по количеству раундов)
            if game and current_round.round_number >= game.total_rounds:
                game.status = 'finished'
                game.finished_at = datetime.now(pytz.UTC)
            
            session.flush()
            session.commit()
            
            # Проверяем, что выбывший игрок действительно помечен как выбывший после commit
            if len(active_players) > 1:
                # Создаем новую сессию для проверки, чтобы убедиться, что данные сохранены
                with get_db_session() as check_session:
                    check_gp = check_session.query(GamePlayer).filter(GamePlayer.id == eliminated_player.id).first()
                    if check_gp:
                        print(f"DEBUG: After commit (new session), eliminated player {check_gp.user_id} is_eliminated={check_gp.is_eliminated}")
                    else:
                        print(f"DEBUG: Could not find GamePlayer {eliminated_player.id} in new session")
            
            print(f"Current round finished: round_id={current_round.id}, round_number={current_round.round_number}, game_status={game.status if game else 'N/A'}, all_humans_eliminated={all_humans_eliminated}")
            return {
                "success": True,
                "round_id": current_round.id,
                "round_number": current_round.round_number,
                "game_status": game.status if game else None,
                "all_humans_eliminated": all_humans_eliminated
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error finishing current round: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error finishing current round: {str(e)}")

@app.post("/api/question/mark-displayed")
async def mark_question_displayed(request: MarkQuestionDisplayedRequest):
    """
    Отметить вопрос как показанный (для standalone frontend - frontend сам управляет показом)
    """
    print(f"=== MARK QUESTION DISPLAYED === round_question_id={request.round_question_id}")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            round_question = session.query(RoundQuestion).filter(
                RoundQuestion.id == request.round_question_id
            ).first()
            
            if not round_question:
                raise HTTPException(status_code=404, detail="Round question not found")
            
            # Отмечаем как показанный
            if not round_question.displayed_at:
                round_question.displayed_at = datetime.now(pytz.UTC)
                session.commit()
                print(f"Question marked as displayed: round_question_id={request.round_question_id}")
            
            return {"success": True, "message": "Question marked as displayed"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error marking question as displayed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error marking question: {str(e)}")

@app.get("/api/user/info")
async def get_user_info(telegram_id: Optional[int] = Query(None, description="Telegram ID пользователя")):
    """
    Получить информацию о пользователе по telegram_id (для предзаполнения формы)
    """
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not telegram_id:
        raise HTTPException(status_code=400, detail="telegram_id is required")
    
    try:
        with get_db_session() as session:
            user = session.query(User).filter(User.telegram_id == telegram_id).first()
            
            if not user:
                return {"exists": False}
            
            return {
                "exists": True,
                "user_id": user.id,
                "username": user.username,
                "full_name": user.full_name,
                "is_bot": user.is_bot
            }
            
    except Exception as e:
        print(f"Error getting user info: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting user info: {str(e)}")

@app.get("/api/game/status")
async def get_game_status(
    game_id: Optional[int] = Query(None, description="ID игры")
):
    """
    Получить статус игры
    """
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not game_id:
        raise HTTPException(status_code=400, detail="game_id is required")
    
    try:
        with get_db_session() as session:
            game = session.query(Game).filter(Game.id == game_id).first()
            
            if not game:
                raise HTTPException(status_code=404, detail="Game not found")
            
            return {
                "game_id": game.id,
                "status": game.status,
                "total_rounds": game.total_rounds,
                "current_round": game.current_round
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting game status: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting game status: {str(e)}")

@app.post("/api/game/leave")
async def leave_game(request: LeaveGameRequest):
    """
    Покинуть игру (выход из игры через веб-интерфейс)
    """
    print(f"=== LEAVE GAME CALLED === game_id={request.game_id}, user_id={request.user_id}")
    
    # Если БД доступна, обновляем статус игрока
    if DB_MODELS_AVAILABLE and _db_session_factory:
        try:
            with get_db_session() as session:
                # Получаем GamePlayer
                game_player = session.query(GamePlayer).filter(
                    and_(
                        GamePlayer.game_id == request.game_id,
                        GamePlayer.user_id == request.user_id
                    )
                ).first()
                
                if not game_player:
                    raise HTTPException(status_code=404, detail="Game player not found")
                
                # Обновляем статус
                game_player.left_game = True
                session.commit()
                
                print(f"Player {request.user_id} left game {request.game_id}")
                # TODO: Уведомить бота о выходе игрока через Redis или другой механизм
                
                return {"success": True, "message": "Game left successfully"}
                
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error leaving game: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Error leaving game: {str(e)}")
    
    # Fallback
    print("Player left the game via web interface (mock)")
    return {"success": True, "message": "Game left successfully"}

@app.post("/api/admin/stop-all-games")
async def stop_all_games(request: AdminStopAllGamesRequest):
    """
    Остановить все активные игры (только для администратора)
    """
    # Проверяем права администратора
    if request.telegram_id != ADMIN_TELEGRAM_ID:
        raise HTTPException(status_code=403, detail="Access denied. Admin rights required.")
    
    if not DB_MODELS_AVAILABLE or not _db_session_factory:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        from datetime import datetime
        import pytz
        
        with get_db_session() as session:
            # Находим все активные игры
            active_games = session.query(Game).filter(
                Game.status.in_(['waiting', 'pre_start', 'in_progress'])
            ).all()
            
            stopped_count = 0
            for game in active_games:
                # Останавливаем игру
                game.status = 'finished'
                game.finished_at = datetime.now(pytz.UTC)
                
                # Останавливаем все активные раунды этой игры
                active_rounds = session.query(Round).filter(
                    and_(
                        Round.game_id == game.id,
                        Round.status == 'in_progress'
                    )
                ).all()
                
                for round_obj in active_rounds:
                    round_obj.status = 'finished'
                    round_obj.finished_at = datetime.now(pytz.UTC)
                
                stopped_count += 1
                print(f"Stopped game {game.id} (type: {game.game_type}, rounds: {len(active_rounds)})")
            
            session.commit()
            
            print(f"Admin {request.telegram_id} stopped {stopped_count} active games")
            return {
                "success": True,
                "stopped_games": stopped_count,
                "message": f"Stopped {stopped_count} active game(s)"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error stopping all games: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error stopping all games: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
