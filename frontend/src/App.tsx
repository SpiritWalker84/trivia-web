import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import QuestionViewer from './components/QuestionViewer'
import Leaderboard from './components/Leaderboard'
import RoundSummary from './components/RoundSummary'
import GameSetup, { GameSettings } from './components/GameSetup'
import Timer from './components/Timer'
import { Participant, Question } from './types/question'
import './App.css'

// Получаем параметры из URL (telegram_id от бота, или game_id/user_id для обратной совместимости)
function getUrlParams(): { 
  telegramId: number | null
  gameId: number | null
  userId: number | null
} {
  const params = new URLSearchParams(window.location.search)
  const telegramId = params.get('telegram_id')
  const gameId = params.get('game_id')
  const userId = params.get('user_id')
  return {
    telegramId: telegramId ? parseInt(telegramId, 10) : null,
    gameId: gameId ? parseInt(gameId, 10) : null,
    userId: userId ? parseInt(userId, 10) : null,
  }
}

function App() {
  // Получаем параметры из URL
  const { telegramId, gameId: urlGameId, userId: urlUserId } = getUrlParams()
  
  // Состояние игры
  const [gameId, setGameId] = useState<number | null>(urlGameId)
  const [userId, setUserId] = useState<number | null>(urlUserId)
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null)
  const [isCreatingGame, setIsCreatingGame] = useState(false)
  // Показываем setup если нет активной игры (gameId/userId из URL)
  // Если есть telegramId, показываем GameSetup для выбора типа игры
  // Если нет telegramId и нет gameId/userId, тоже показываем GameSetup
  const [showGameSetup, setShowGameSetup] = useState(!urlGameId || !urlUserId)
  
  const [questionId, setQuestionId] = useState<number | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null) // Текущий вопрос для таймера
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)
  const [showRoundSummary, setShowRoundSummary] = useState(false)
  const [roundNumber, setRoundNumber] = useState(1)
  const [totalRounds, setTotalRounds] = useState(9)
  const [roundCompleted, setRoundCompleted] = useState(false) // Флаг завершения раунда
  
  // Обработчик старта игры
  const handleStartGame = async (settings: GameSettings) => {
    console.log('🎮 Starting game with settings:', settings)
    setGameSettings(settings)
    
    try {
      // Создаем игру через API
      // Если есть telegram_id из URL (пользователь пришел из бота), используем его
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
               body: JSON.stringify({
                 game_type: settings.gameType,
                 theme_id: settings.themeId,
                 total_rounds: settings.totalRounds,
                 player_name: settings.playerName,
                 player_telegram_id: telegramId, // Используем telegram_id, если пользователь пришел из бота
                 bot_difficulty: settings.botDifficulty, // Уровень сложности ботов для training
               }),
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to create game' }))
        throw new Error(error.detail || 'Failed to create game')
      }
      
      const data = await response.json()
      console.log('✅ Game created:', data)
      
      setGameId(data.game_id)
      setUserId(data.user_id)
      setTotalRounds(data.total_rounds)
      setShowGameSetup(false)
      setIsCreatingGame(false)
      
      // Создаем и запускаем первый раунд
      await createAndStartRound(data.game_id, 1)
      
    } catch (error) {
      console.error('Error starting game:', error)
      setIsCreatingGame(false)
      alert(`Ошибка при создании игры: ${error instanceof Error ? error.message : 'Unknown error'}`)
      // Оставляем на экране настройки, чтобы пользователь мог попробовать снова
    }
  }
  
  // Создать и запустить раунд
  const createAndStartRound = async (gameId: number, roundNumber: number) => {
    try {
      // Создаем раунд
      const createResponse = await fetch('/api/round/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: gameId,
          round_number: roundNumber,
          theme_id: gameSettings?.themeId || null,
          questions_count: 10,
        }),
      })
      
      if (!createResponse.ok) {
        throw new Error('Failed to create round')
      }
      
      const roundData = await createResponse.json()
      console.log('✅ Round created:', roundData)
      
      // Запускаем раунд
      const startResponse = await fetch('/api/round/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: gameId,
          round_id: roundData.round_id,
        }),
      })
      
      if (!startResponse.ok) {
        throw new Error('Failed to start round')
      }
      
      console.log('✅ Round started')
      setRoundNumber(roundNumber)
      setShowRoundSummary(false)
      setRoundCompleted(false)
      setQuestionId(null)
      
      // Увеличиваем задержку перед загрузкой лидерборда и вопроса
      // чтобы убедиться, что раунд полностью создан и запущен в БД
      setTimeout(() => {
        fetchLeaderboard(true)
        // Сбрасываем questionId, чтобы QuestionViewer загрузил новый вопрос
        setQuestionId(null)
      }, 1500) // Увеличено с 500 до 1500 мс
      
    } catch (error) {
      console.error('Error creating/starting round:', error)
      alert(`Ошибка при создании раунда: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  // Загружаем информацию о пользователе, если есть telegram_id
  const [userInfo, setUserInfo] = useState<{ full_name?: string } | null>(null)
  
  // Загружаем информацию о пользователе при загрузке, если есть telegram_id
  useEffect(() => {
    if (telegramId && !userInfo) {
      fetch(`/api/user/info?telegram_id=${telegramId}`)
        .then(res => res.json())
        .then(data => {
          const playerName = data.exists && data.full_name ? data.full_name : `Игрок ${telegramId}`
          setUserInfo({ full_name: playerName })
        })
        .catch(err => {
          console.warn('Failed to load user info:', err)
          setUserInfo({ full_name: `Игрок ${telegramId}` })
        })
    }
  }, [telegramId, userInfo])
  
  // Логируем полученные параметры
  useEffect(() => {
    console.log(`🎮 App initialized: game_id=${gameId}, user_id=${userId}, telegram_id=${telegramId}`)
    if (!gameId || !userId) {
      console.log('ℹ️ No game_id or user_id in URL. Will show game setup.')
    }
  }, [gameId, userId, telegramId])

  // Выход из игры
  const handleLeaveGame = async () => {
    if (!confirm('Вы уверены, что хотите покинуть игру?')) {
      return
    }
    
    if (!gameId || !userId) {
      alert('Ошибка: не указаны game_id или user_id. Невозможно покинуть игру.')
      return
    }
    
    try {
      const response = await fetch('/api/game/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: gameId,
          user_id: userId,
        }),
      })
      
      if (response.ok) {
        // Игра покинута, можно закрыть окно или показать сообщение
        alert('Вы покинули игру. Вернитесь в Telegram для продолжения.')
        // Опционально: можно закрыть окно или перенаправить
        // window.close() // Закрыть окно, если оно было открыто из бота
      } else {
        throw new Error('Не удалось покинуть игру')
      }
    } catch (error) {
      console.error('Error leaving game:', error)
      alert('Ошибка при выходе из игры. Попробуйте еще раз.')
    }
  }

  // Загрузка таблицы лидеров из API
  const fetchLeaderboard = async (updateQuestionNumber: boolean = true) => {
    try {
      // Формируем URL с параметрами game_id и user_id
      const url = new URL('/api/leaderboard', window.location.origin)
      if (gameId) url.searchParams.set('game_id', gameId.toString())
      if (userId) url.searchParams.set('user_id', userId.toString())
      
      const response = await fetch(url.toString(), {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      if (response.ok) {
        const data = await response.json()
        const questionNum = data.current_question_number || 1
        const totalQ = data.total_questions || 10
        
        console.log(`📋 fetchLeaderboard: updateQuestionNumber=${updateQuestionNumber}, API returned questionNum=${questionNum}, current state=${currentQuestionNumber}`)
        
        setParticipants(data.participants || [])
        
        // Обновляем номер вопроса только если явно запрошено
        // (чтобы не обновлять счетчик до загрузки вопроса)
        if (updateQuestionNumber) {
          console.log(`🔄 fetchLeaderboard: Updating currentQuestionNumber from ${currentQuestionNumber} to ${questionNum}`)
          setCurrentQuestionNumber(questionNum)
        } else {
          console.log(`⏭️ fetchLeaderboard: Skipping question number update (updateQuestionNumber=false)`)
        }
        setTotalQuestions(totalQ)
        
        // Показываем межраундовый экран, если раунд завершен
        // Раунд завершен ТОЛЬКО когда был вызван onRoundComplete (получен 400 от API)
        // НЕ показываем summary по счетчику, так как он может быть неточным
        // НЕ меняем showRoundSummary, если он уже установлен (чтобы не перерисовывать таблицу)
        if (roundCompleted && !showRoundSummary) {
          console.log(`Setting showRoundSummary=true: roundCompleted=true, questionNum=${questionNum}, totalQ=${totalQ}`)
          setShowRoundSummary(true)
        } else if (!roundCompleted && !showRoundSummary) {
          // Только устанавливаем в false, если summary еще не показывался
          setShowRoundSummary(false)
        }
        // Если showRoundSummary уже true, не трогаем его
      } else {
        console.error('Failed to fetch leaderboard:', response.status)
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    }
  }

  useEffect(() => {
    // Не загружаем лидерборд, если игра не создана
    if (!gameId || !userId) {
      console.log('⏭️ App: Skipping leaderboard fetch (game not created yet)')
      return
    }
    
    console.log('🚀 App: Initial mount, fetching leaderboard')
    // При первой загрузке обновляем счетчик, но он должен быть 0 или 1
    // Если счетчик больше 1, значит вопрос уже загружен, и мы обновим его правильно
    fetchLeaderboard(true) // Первая загрузка с обновлением счетчика
    // Обновляем таблицу лидеров каждые 2 секунды (БЕЗ обновления счетчика вопроса)
    // НО только если не показывается summary раунда
    const interval = setInterval(() => {
      if (!showRoundSummary && gameId && userId) {
        console.log('⏰ App: Periodic leaderboard update (no counter update)')
        fetchLeaderboard(false)
      } else {
        console.log('⏰ App: Skipping periodic update (round summary is showing or game not ready)')
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [showRoundSummary, gameId, userId])

  const handleQuestionChange = (id: number | null) => {
    setQuestionId(id)
  }

  const handleNextRound = async () => {
    if (!gameId) {
      console.error('Cannot start next round: gameId is null')
      return
    }
    
    const nextRoundNumber = roundNumber + 1
    
    // Завершаем текущий раунд (если есть)
    if (roundNumber > 0) {
      try {
        // Завершаем текущий раунд через API
        const finishResponse = await fetch(`/api/round/finish-current?game_id=${gameId}`, {
          method: 'POST',
        })
        if (finishResponse.ok) {
          const finishData = await finishResponse.json()
          console.log(`✅ Round ${roundNumber} finished:`, finishData)
        } else {
          console.warn('Failed to finish current round, continuing anyway')
        }
      } catch (error) {
        console.error('Error finishing current round:', error)
        // Продолжаем создание следующего раунда даже если не удалось завершить текущий
      }
    }
    
    // Сбрасываем состояние для нового раунда
    setShowRoundSummary(false)
    setRoundCompleted(false)
    setQuestionId(null)
    setCurrentQuestionNumber(1)
    
    // Создаем и запускаем следующий раунд
    await createAndStartRound(gameId, nextRoundNumber)
  }

  // Показываем экран настройки игры, если игра не создана
  if (showGameSetup) {
    return (
      <div className="app">
        <GameSetup 
          onStartGame={handleStartGame} 
          telegramId={telegramId}
          initialPlayerName={userInfo?.full_name}
        />
      </div>
    )
  }
  
  // Показываем экран загрузки только если игра создается
  if (isCreatingGame) {
    return (
      <div className="app">
        <div className="loading-screen">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h2>🎮 Загрузка игры...</h2>
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Подождите, игра создается</p>
          </motion.div>
        </div>
      </div>
    )
  }
  
  // Показываем экран загрузки, если игра не создана (fallback)
  if (!gameId || !userId) {
    return (
      <div className="app">
        <div className="loading-screen">
          <h2>Загрузка...</h2>
        </div>
      </div>
    )
  }

  if (showRoundSummary) {
    return (
      <div className="app">
        <RoundSummary
          participants={participants}
          roundNumber={roundNumber}
          totalRounds={totalRounds}
          onNextRound={handleNextRound}
          onLeaveGame={handleLeaveGame}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <motion.div
            className="app-logo"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Brain Survivor
          </motion.div>
          <motion.div
            className="round-info"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            Раунд {roundNumber} • Вопрос {currentQuestionNumber} из {totalQuestions}
          </motion.div>
          <div className="header-timer">
            <QuestionTimer questionId={questionId} gameId={gameId} userId={userId} />
          </div>
        </div>
      </header>
      <div className="app-content">
        <aside className="app-sidebar">
          <Leaderboard
            participants={participants}
            currentQuestionNumber={currentQuestionNumber}
            totalQuestions={totalQuestions}
          />
        </aside>
        <main className="app-main">
          <QuestionViewer 
            questionId={questionId} 
            gameId={gameId}
            userId={userId}
            onQuestionChange={handleQuestionChange}
            onRoundComplete={() => {
              console.log('📊 App: onRoundComplete called, round is completed')
              // Устанавливаем флаг завершения раунда ПЕРЕД обновлением лидерборда
              setRoundCompleted(true)
              // Явно показываем summary
              setShowRoundSummary(true)
              // Сбрасываем questionId и вопрос, чтобы QuestionViewer не пытался загрузить вопрос
              setQuestionId(null)
              setCurrentQuestion(null)
              // Обновляем лидерборд для получения актуальных данных
              fetchLeaderboard(true)
            }}
            onQuestionLoaded={(question) => {
              console.log('📊 App: onQuestionLoaded called, fetching leaderboard with counter update')
              setCurrentQuestion(question)
              fetchLeaderboard(true)
            }} // Обновляем счетчик только после загрузки вопроса
            showRoundSummary={showRoundSummary} // Передаем флаг, чтобы не загружать вопросы во время summary
          />
        </main>
      </div>
    </div>
  )
}

export default App
