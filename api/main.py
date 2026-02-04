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
        Game, GamePlayer, Round, RoundQuestion, Question, Answer as AnswerModel,
        User, Theme
    )
    DB_MODELS_AVAILABLE = True
    print(f"Database models imported successfully from shared/db_models.py (path: {shared_path if shared_path else 'found'})")
except ImportError as e:
    print(f"Could not import database models: {e}")
    print(f"Python path: {sys.path}")
    print("Will use mock data")
    DB_MODELS_AVAILABLE = False
    Game = GamePlayer = Round = RoundQuestion = Question = AnswerModel = User = Theme = None

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
    round_question_id: Optional[int] = None  # ID вопроса в раунде (RoundQuestion.id)

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
async def get_random_question(
    game_id: Optional[int] = Query(None, description="ID игры"),
    user_id: Optional[int] = Query(None, description="ID пользователя")
):
    """Получить следующий вопрос из текущего раунда игры"""
    import traceback
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
                
                # Сначала пытаемся получить последний показанный вопрос (который бот уже показал)
                # Это нужно для синхронизации с ботом
                round_question = session.query(RoundQuestion).filter(
                    and_(
                        RoundQuestion.round_id == current_round.id,
                        RoundQuestion.displayed_at.isnot(None)
                    )
                ).order_by(RoundQuestion.displayed_at.desc()).first()
                
                # Если нет показанных вопросов, берем первый непоказанный
                if not round_question:
                    round_question = session.query(RoundQuestion).filter(
                        and_(
                            RoundQuestion.round_id == current_round.id,
                            RoundQuestion.displayed_at.is_(None)
                        )
                    ).order_by(RoundQuestion.question_number).first()
                
                if not round_question:
                    raise HTTPException(status_code=400, detail="Round completed. Please start a new round.")
                
                # Получаем сам вопрос
                db_question = session.query(Question).filter(Question.id == round_question.question_id).first()
                if not db_question:
                    raise HTTPException(status_code=404, detail="Question not found")
                
                # Формируем варианты ответов
                options = [
                    {"id": 1, "text": db_question.option_a, "is_correct": db_question.correct_option == 'A'},
                    {"id": 2, "text": db_question.option_b, "is_correct": db_question.correct_option == 'B'},
                ]
                if db_question.option_c:
                    options.append({"id": 3, "text": db_question.option_c, "is_correct": db_question.correct_option == 'C'})
                if db_question.option_d:
                    options.append({"id": 4, "text": db_question.option_d, "is_correct": db_question.correct_option == 'D'})
                
                # Если вопрос был перемешан ботом, показываем варианты в том же порядке
                # shuffled_options: {original_pos: display_pos} напр. {"A": "C", "B": "A", "C": "B", "D": "D"}
                # correct_option_shuffled: буква позиции (A/B/C/D) где правильный ответ в отображении бота
                if round_question.shuffled_options:
                    shuffled = round_question.shuffled_options
                    # Обратное отображение: для каждой позиции отображения (A,B,C,D) — какой оригинальный вариант
                    inv = {new_pos: orig for orig, new_pos in shuffled.items()}
                    shuffled_options = []
                    for display_pos in ['A', 'B', 'C', 'D']:
                        orig_opt = inv.get(display_pos)
                        if orig_opt:
                            opt_idx = ord(orig_opt) - ord('A')
                            if opt_idx < len(options):
                                shuffled_options.append({
                                    "id": ord(display_pos) - ord('A') + 1,
                                    "text": options[opt_idx]["text"],
                                    "is_correct": display_pos == round_question.correct_option_shuffled
                                })
                    if shuffled_options:
                        options = shuffled_options
                
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
                
                # Получаем GamePlayer
                game_player = session.query(GamePlayer).filter(
                    and_(
                        GamePlayer.game_id == answer.game_id,
                        GamePlayer.user_id == answer.user_id
                    )
                ).first()
                
                if not game_player:
                    raise HTTPException(status_code=404, detail="Game player not found")
                
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
                    existing_answer.is_correct = answer.is_correct
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
                        is_correct=answer.is_correct,
                        answer_time=answer.answer_time,
                        answered_at=datetime.now(pytz.UTC)
                    )
                    session.add(new_answer)
                
                session.commit()
                print(f"Answer saved: user_id={answer.user_id}, question_id={answer.question_id}, correct={answer.is_correct}")
                return {"success": True, "correct": answer.is_correct}
                
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
                
                # Получаем участников игры (не выбывших)
                game_players = session.query(GamePlayer).filter(
                    and_(
                        GamePlayer.game_id == game_id,
                        GamePlayer.is_eliminated == False,
                        GamePlayer.left_game == False
                    )
                ).all()
                
                # Получаем количество правильных ответов для каждого участника в текущем раунде
                participants_data = []
                for gp in game_players:
                    # Считаем правильные ответы в текущем раунде
                    correct_count = session.query(func.count(AnswerModel.id)).filter(
                        and_(
                            AnswerModel.round_id == current_round.id,
                            AnswerModel.user_id == gp.user_id,
                            AnswerModel.is_correct == True
                        )
                    ).scalar() or 0
                    
                    participants_data.append({
                        "id": gp.user.id,
                        "name": gp.user.full_name or gp.user.username or f"User {gp.user.id}",
                        "correct_answers": correct_count,
                        "avatar": None,
                        "is_current_user": gp.user_id == user_id if user_id else False
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
