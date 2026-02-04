# Trivia Web - Frontend & API

Веб-интерфейс и REST API для Trivia Bot (Brain Survivor).

## Структура проекта

```
trivia-web/
├── frontend/          # React приложение
├── api/               # FastAPI REST API
├── shared/            # Общая логика (константы, модели)
└── docker/            # Docker конфигурации
```

## План разработки

1. ✅ Создание структуры проекта
2. ✅ Frontend: React компонент для просмотра вопроса (с таймером и таблицей лидеров)
3. ✅ API: Базовые эндпоинты
4. ✅ Интеграция фронтенда с API
5. ✅ Docker контейнеризация (включая Telegram бота)
6. ✅ Nginx конфигурация

## Технологии

- **Frontend**: React + TypeScript
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL (используется из trivia-bot)
- **Cache**: Redis (используется из trivia-bot)
- **Containerization**: Docker + Docker Compose
- **Web Server**: Nginx

## Последнее обновление

- Исправлена логика обработки ответов: убран автоматический переход к следующему вопросу после ответа, используется polling механизм
