# Ветки проекта

## Текущие ветки

### `main` (текущая рабочая версия)
Основная ветка с интеграцией Telegram бота и базой данных PostgreSQL.

**Особенности:**
- Интеграция с Telegram ботом
- Синхронизация вопросов с ботом
- База данных PostgreSQL
- Автоматический таймер 60 секунд между раундами
- Валидация ответов на сервере

### `bot-integration` (сохраненная версия)
Ветка с сохраненным состоянием интеграции с ботом.

**Использование:**
```bash
git checkout bot-integration
```

### `standalone-frontend` (новая ветка)
Ветка для разработки независимого frontend без интеграции с ботом.

**Цель:** Создать полностью автономный frontend, который управляет игрой самостоятельно.

## Теги

### `v1-bot-integration`
Тег для стабильной версии с интеграцией бота.

**Восстановление:**
```bash
git checkout v1-bot-integration
```

## Как вернуться к рабочей версии

### Вариант 1: Переключиться на ветку bot-integration
```bash
git checkout bot-integration
```

### Вариант 2: Переключиться на тег v1-bot-integration
```bash
git checkout v1-bot-integration
```

### Вариант 3: Вернуться на main
```bash
git checkout main
```

## Работа с новой веткой standalone-frontend

После переключения на `standalone-frontend` можно начинать разработку независимого frontend:

```bash
git checkout standalone-frontend
# Начинаем разработку...
```

Для возврата к версии с ботом:
```bash
git checkout bot-integration
# или
git checkout main
```
