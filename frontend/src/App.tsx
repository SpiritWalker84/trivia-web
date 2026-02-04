import { useState, useEffect, useRef } from 'react'
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
  roomCode: string | null
} {
  const params = new URLSearchParams(window.location.search)
  const telegramId = params.get('telegram_id')
  const gameId = params.get('game_id')
  const userId = params.get('user_id')
  const roomCode = params.get('room')
  return {
    telegramId: telegramId ? parseInt(telegramId, 10) : null,
    gameId: gameId ? parseInt(gameId, 10) : null,
    userId: userId ? parseInt(userId, 10) : null,
    roomCode: roomCode ? roomCode.trim().toUpperCase() : null,
  }
}

function App() {
  // Получаем параметры из URL
  const { telegramId, gameId: urlGameId, userId: urlUserId, roomCode } = getUrlParams()
  
  // Состояние игры
  const [gameId, setGameId] = useState<number | null>(urlGameId)
  const [userId, setUserId] = useState<number | null>(urlUserId)
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null)
  const [isCreatingGame, setIsCreatingGame] = useState(false)
  const [isWaitingRoom, setIsWaitingRoom] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [roomPlayers, setRoomPlayers] = useState<Participant[]>([])
  // Показываем setup если нет активной игры (gameId/userId из URL)
  // Если есть telegramId, показываем GameSetup для выбора типа игры
  // Если нет telegramId и нет gameId/userId, тоже показываем GameSetup
  const [showGameSetup, setShowGameSetup] = useState(!urlGameId || !urlUserId)
  
  const [questionId, setQuestionId] = useState<number | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null) // Текущий вопрос для таймера
  const [participants, setParticipants] = useState<Participant[]>([])
  const questionViewerTimeUpRef = useRef<(() => void) | null>(null) // Ref для вызова handleTimeUp из QuestionViewer
  const roundFinishRequestedRef = useRef(false) // Защита от двойного завершения раунда
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)
  const [showRoundSummary, setShowRoundSummary] = useState(false)
  const [roundNumber, setRoundNumber] = useState(1)
  const [totalRounds, setTotalRounds] = useState(9)
  const [roundCompleted, setRoundCompleted] = useState(false) // Флаг завершения раунда
  const [gameFinishedAllHumansEliminated, setGameFinishedAllHumansEliminated] = useState(false) // Игра завершена: все живые игроки выбыли
  
  // Обработчик старта игры
  const handleStartGame = async (settings: GameSettings) => {
    console.log('🎮 Starting game with settings:', settings)
    setGameSettings(settings)
    
    // Сразу скрываем GameSetup и показываем экран загрузки
    setShowGameSetup(false)
    setIsCreatingGame(true)
    
    // Небольшая задержка для завершения анимации скрытия GameSetup
    await new Promise(resolve => setTimeout(resolve, 300))
    
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
      // showGameSetup уже установлен в false в начале функции
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

  const handleCreatePrivate = async (playerName: string) => {
    console.log('🎮 Creating private game:', playerName)
    setShowGameSetup(false)
    setIsCreatingGame(true)
    try {
      const response = await fetch('/api/private/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_name: playerName,
          player_telegram_id: telegramId,
        }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to create private game' }))
        throw new Error(error.detail || 'Failed to create private game')
      }
      const data = await response.json()
      setGameId(data.game_id)
      setUserId(data.user_id)
      setTotalRounds(data.total_rounds)
      setInviteCode(data.invite_code || '')
      setInviteLink(data.invite_link || '')
      setIsHost(true)
      setIsWaitingRoom(true)
      setIsCreatingGame(false)
    } catch (error) {
      console.error('Error creating private game:', error)
      setIsCreatingGame(false)
      setShowGameSetup(true)
      alert(`Ошибка при создании комнаты: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleJoinPrivate = async (playerName: string, roomCode: string) => {
    console.log('🎮 Joining private game:', roomCode)
    setShowGameSetup(false)
    setIsCreatingGame(true)
    try {
      const response = await fetch('/api/private/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room_code: roomCode,
          player_name: playerName,
          player_telegram_id: telegramId,
        }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to join private game' }))
        throw new Error(error.detail || 'Failed to join private game')
      }
      const data = await response.json()
      setGameId(data.game_id)
      setUserId(data.user_id)
      setTotalRounds(data.total_rounds)
      setInviteCode(roomCode)
      setInviteLink('')
      setIsHost(false)
      setIsWaitingRoom(true)
      setIsCreatingGame(false)
    } catch (error) {
      console.error('Error joining private game:', error)
      setIsCreatingGame(false)
      setShowGameSetup(true)
      alert(`Ошибка при входе в комнату: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const fetchPrivatePlayers = async () => {
    if (!gameId) return
    try {
      const response = await fetch(`/api/private/players?game_id=${gameId}`)
      if (!response.ok) return
      const data = await response.json()
      setRoomPlayers(data.players || [])
      setIsHost(data.host_user_id === userId)

      const statusResponse = await fetch(`/api/game/status?game_id=${gameId}`)
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        if (statusData.status === 'in_progress') {
          setIsWaitingRoom(false)
          setShowRoundSummary(false)
          setQuestionId(null)
          setCurrentQuestion(null)
          setCurrentQuestionNumber(1)
        }
        if (statusData.status === 'finished') {
          setIsWaitingRoom(false)
          setShowGameSetup(true)
        }
      }
    } catch (error) {
      console.warn('Failed to fetch private players:', error)
    }
  }

  const handleStartPrivateGame = async () => {
    if (!gameId || !userId) return
    try {
      const response = await fetch('/api/private/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: gameId,
          user_id: userId,
        }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to start game' }))
        throw new Error(error.detail || 'Failed to start game')
      }
      setIsWaitingRoom(false)
      await createAndStartRound(gameId, 1)
    } catch (error) {
      console.error('Error starting private game:', error)
      alert(`Ошибка при старте игры: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleExitToMenu = () => {
    setIsWaitingRoom(false)
    setShowGameSetup(true)
    setGameId(null)
    setUserId(null)
    setInviteCode('')
    setInviteLink('')
    setRoomPlayers([])
  }

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch (error) {
      console.warn('Clipboard API failed, falling back:', error)
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
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
      roundFinishRequestedRef.current = false
      setShowRoundSummary(false)
      setRoundCompleted(false)
      
      // Увеличиваем задержку перед загрузкой лидерборда и вопроса
      // чтобы убедиться, что раунд полностью создан и запущен в БД
      setTimeout(() => {
        fetchLeaderboard(true)
        // Сбрасываем questionId только один раз, чтобы QuestionViewer загрузил первый вопрос раунда
        // Не делаем это дважды, чтобы не пропустить первый вопрос
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
        
        // Логируем данные о выбывших игроках
        const participants = data.participants || []
        const eliminated = participants.filter((p: Participant) => p.is_eliminated === true)
        if (eliminated.length > 0) {
          console.log('📋 fetchLeaderboard: Found eliminated participants:', eliminated.map((p: Participant) => ({ id: p.id, name: p.name, is_eliminated: p.is_eliminated, correct_answers: p.correct_answers })))
        }
        
        setParticipants(participants)
        
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

  useEffect(() => {
    if (!isWaitingRoom || !gameId) {
      return
    }
    fetchPrivatePlayers()
    const interval = setInterval(() => {
      fetchPrivatePlayers()
    }, 2000)
    return () => clearInterval(interval)
  }, [isWaitingRoom, gameId])

  const handleQuestionChange = (id: number | null) => {
    setQuestionId(id)
  }

  const handleTimerTimeUp = () => {
    // Когда таймер заканчивается, вызываем handleTimeUp из QuestionViewer для показа правильного ответа
    console.log('⏰ App: Timer time up, calling QuestionViewer handleTimeUp')
    if (questionViewerTimeUpRef.current) {
      questionViewerTimeUpRef.current()
    }
    // Сбрасываем currentQuestion, чтобы таймер исчез
    setCurrentQuestion(null)
  }

  const handleNextRound = async () => {
    if (!gameId) {
      console.error('Cannot start next round: gameId is null')
      return
    }
    
    // Не создаем новый раунд, если игра завершена из-за выбытия всех живых игроков
    if (gameFinishedAllHumansEliminated) {
      console.log('⚠️ Cannot start next round: all human players eliminated')
      return
    }
    
    const nextRoundNumber = roundNumber + 1
    
    // Завершение текущего раунда происходит в onRoundComplete,
    // здесь не дублируем, чтобы не выбивать игроков дважды.
    
    // Проверяем, не превысили ли мы максимальное количество раундов
    if (nextRoundNumber > totalRounds) {
      console.log('⚠️ Maximum rounds reached, game finished')
      return
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
          onCreatePrivate={handleCreatePrivate}
          onJoinPrivate={handleJoinPrivate}
          initialGameType={roomCode ? 'private' : undefined}
          initialPrivateMode={roomCode ? 'join' : undefined}
          initialRoomCode={roomCode || undefined}
          autoJoinPrivate={!!roomCode && !!telegramId}
          telegramId={telegramId}
          initialPlayerName={userInfo?.full_name}
        />
      </div>
    )
  }

  if (isWaitingRoom) {
    const shareLink = inviteLink && inviteLink.startsWith('http')
      ? inviteLink
      : (inviteCode ? `${window.location.origin}/?room=${inviteCode}` : '')
    return (
      <div className="app">
        <div className="waiting-room">
          <div className="waiting-header">
            <h2>🕒 Ожидание игроков</h2>
            <p>Пригласите друзей по ссылке или коду комнаты</p>
          </div>
          <div className="waiting-invite">
            <div className="invite-item">
              <span className="invite-label">Код комнаты</span>
              <div className="invite-value">
                {inviteCode || '—'}
                {inviteCode && (
                  <button
                    className="btn-copy-link"
                    type="button"
                    onClick={() => copyToClipboard(inviteCode)}
                  >
                    Скопировать
                  </button>
                )}
              </div>
            </div>
            {shareLink && (
              <div className="invite-item">
                <span className="invite-label">Ссылка</span>
                <div className="invite-link">
                  <input value={shareLink} readOnly />
                  <button
                    className="btn-copy-link"
                    type="button"
                    onClick={() => copyToClipboard(shareLink)}
                  >
                    Скопировать
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="waiting-players">
            <h3>Игроки ({roomPlayers.length})</h3>
            <ul>
              {roomPlayers.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.id === userId && <span className="you-badge">Вы</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="waiting-actions">
            {isHost && (
              <button className="btn-start-game" onClick={handleStartPrivateGame}>
                🚀 Начать игру
              </button>
            )}
            <button className="btn-return-to-menu" onClick={handleExitToMenu}>
              Вернуться в меню
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  // Показываем экран загрузки, если игра создается или еще не создана
  // Это гарантирует, что GameSetup полностью скрыт перед показом игрового экрана
  if (!gameId || !userId || isCreatingGame) {
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

  if (showRoundSummary) {
    return (
      <div className="app">
        <RoundSummary
          participants={participants}
          roundNumber={roundNumber}
          totalRounds={totalRounds}
          onNextRound={handleNextRound}
          gameFinishedAllHumansEliminated={gameFinishedAllHumansEliminated}
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
          {currentQuestion && !showRoundSummary && (
            <div className="header-timer">
              <Timer
                key={currentQuestion.id}
                initialTime={currentQuestion.time_limit || 10}
                onTimeUp={handleTimerTimeUp}
                isActive={true}
              />
            </div>
          )}
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
            onRoundComplete={async () => {
              console.log('📊 App: onRoundComplete called, round is completed')
              if (roundFinishRequestedRef.current) {
                console.log('⚠️ Round finish already requested, skipping duplicate call')
                return
              }
              roundFinishRequestedRef.current = true
              // Сначала завершаем текущий раунд через API, чтобы обновить статус выбывших игроков
              if (gameId && roundNumber > 0) {
                try {
                  const finishResponse = await fetch(`/api/round/finish-current?game_id=${gameId}`, {
                    method: 'POST',
                  })
                  if (finishResponse.ok) {
                    const finishData = await finishResponse.json()
                    console.log(`✅ Round ${roundNumber} finished in onRoundComplete:`, finishData)
                    
                    // Проверяем, остановлена ли игра из-за выбытия всех живых игроков
                    if (finishData.all_humans_eliminated === true || finishData.game_status === 'finished') {
                      console.log('⚠️ Game finished: all human players eliminated')
                      setGameFinishedAllHumansEliminated(true)
                    }
                  }
                } catch (error) {
                  console.error('Error finishing current round in onRoundComplete:', error)
                }
              }
              // Устанавливаем флаг завершения раунда ПЕРЕД обновлением лидерборда
              setRoundCompleted(true)
              // Явно показываем summary
              setShowRoundSummary(true)
              // Сбрасываем questionId и вопрос, чтобы QuestionViewer не пытался загрузить вопрос
              setQuestionId(null)
              setCurrentQuestion(null)
              // Обновляем лидерборд для получения актуальных данных о выбывших игроках
              await fetchLeaderboard(true)
            }}
            onQuestionLoaded={(question) => {
              console.log('📊 App: onQuestionLoaded called, fetching leaderboard with counter update')
              setCurrentQuestion(question)
              fetchLeaderboard(true)
            }} // Обновляем счетчик только после загрузки вопроса
            showRoundSummary={showRoundSummary} // Передаем флаг, чтобы не загружать вопросы во время summary
            onTimerTimeUp={(handleTimeUpFn) => {
              // Сохраняем ссылку на handleTimeUp из QuestionViewer для вызова при истечении таймера
              questionViewerTimeUpRef.current = handleTimeUpFn
            }}
          />
        </main>
      </div>
    </div>
  )
}

export default App
