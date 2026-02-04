# Trivia Web Frontend

React приложение для просмотра вопросов викторины.

## Технологии

- React 18
- TypeScript
- Vite
- CSS3

## Установка

```bash
npm install
```

## Запуск

```bash
npm run dev
```

Приложение будет доступно по адресу `http://localhost:3000`

## Сборка

```bash
npm run build
```

## Структура

```
frontend/
├── src/
│   ├── components/      # React компоненты
│   │   └── QuestionViewer.tsx
│   ├── types/           # TypeScript типы
│   │   └── question.ts
│   ├── App.tsx          # Главный компонент
│   ├── main.tsx         # Точка входа
│   └── index.css        # Глобальные стили
├── public/              # Статические файлы
├── package.json
└── vite.config.ts
```
