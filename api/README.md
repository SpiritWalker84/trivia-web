# Trivia Web API

FastAPI REST API для Trivia Web приложения.

## Установка

```bash
pip install -r requirements.txt
```

## Запуск

```bash
# Простой запуск
python main.py

# Или через uvicorn
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API будет доступно по адресу `http://localhost:8000`

## Эндпоинты

### GET /api/questions/random
Получить случайный вопрос

**Ответ:**
```json
{
  "question": {
    "id": 1,
    "text": "Вопрос?",
    "answers": [
      {"id": 1, "text": "Ответ 1", "is_correct": false},
      {"id": 2, "text": "Ответ 2", "is_correct": true}
    ],
    "time_limit": 10
  }
}
```

### GET /api/questions/{question_id}
Получить вопрос по ID

### GET /api/leaderboard
Получить таблицу лидеров

**Ответ:**
```json
{
  "participants": [
    {"id": 1, "name": "Алексей", "correct_answers": 8, "is_current_user": true}
  ],
  "current_question_number": 1,
  "total_questions": 10
}
```

## Документация API

После запуска доступна автоматическая документация:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
