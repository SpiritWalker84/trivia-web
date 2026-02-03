import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import QuestionViewer from './components/QuestionViewer'
import Leaderboard from './components/Leaderboard'
import RoundSummary from './components/RoundSummary'
import { Participant } from './types/question'
import './App.css'

function App() {
  const [questionId, setQuestionId] = useState<number | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const [showRoundSummary, setShowRoundSummary] = useState(false)
  const [roundNumber, setRoundNumber] = useState(1)
  const [totalRounds, setTotalRounds] = useState(9)
  const [roundCompleted, setRoundCompleted] = useState(false) // Флаг завершения раунда

  // Выход из игры
  const handleLeaveGame = async () => {
    if (!confirm('Вы уверены, что хотите покинуть игру?')) {
      return
    }
    
    try {
      const response = await fetch('/api/game/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch('/api/leaderboard', {
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
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  useEffect(() => {
    console.log('🚀 App: Initial mount, fetching leaderboard')
    // При первой загрузке обновляем счетчик, но он должен быть 0 или 1
    // Если счетчик больше 1, значит вопрос уже загружен, и мы обновим его правильно
    fetchLeaderboard(true) // Первая загрузка с обновлением счетчика
    // Обновляем таблицу лидеров каждые 2 секунды (БЕЗ обновления счетчика вопроса)
    // НО только если не показывается summary раунда
    const interval = setInterval(() => {
      if (!showRoundSummary) {
        console.log('⏰ App: Periodic leaderboard update (no counter update)')
        fetchLeaderboard(false)
      } else {
        console.log('⏰ App: Skipping periodic update (round summary is showing)')
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [showRoundSummary])

  const handleQuestionChange = (id: number | null) => {
    setQuestionId(id)
  }

  const handleNextRound = async () => {
    // Сбрасываем раунд на API
    try {
      await fetch('/api/round/reset', { method: 'POST' })
    } catch (error) {
      console.error('Failed to reset round:', error)
    }
    
    setRoundNumber(prev => prev + 1)
    setShowRoundSummary(false)
    setRoundCompleted(false) // Сбрасываем флаг завершения раунда
    setQuestionId(null) // Сбрасываем вопрос для загрузки нового
    fetchLeaderboard(true)
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
          <motion.button
            className="leave-game-btn"
            onClick={handleLeaveGame}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            🚪 Покинуть игру
          </motion.button>
        </div>
        <motion.div
          className="round-info"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          Раунд {roundNumber} • Вопрос {currentQuestionNumber} из {totalQuestions}
        </motion.div>
        <div className="timer-placeholder"></div>
      </header>
      <div className="app-content">
        <main className="app-main">
          <QuestionViewer 
            questionId={questionId} 
            onQuestionChange={handleQuestionChange}
            onRoundComplete={() => {
              console.log('📊 App: onRoundComplete called, round is completed')
              // Устанавливаем флаг завершения раунда ПЕРЕД обновлением лидерборда
              setRoundCompleted(true)
              // Явно показываем summary
              setShowRoundSummary(true)
              // Сбрасываем questionId, чтобы QuestionViewer не пытался загрузить вопрос
              setQuestionId(null)
              // Обновляем лидерборд для получения актуальных данных
              fetchLeaderboard(true)
            }}
            onQuestionLoaded={() => {
              console.log('📊 App: onQuestionLoaded called, fetching leaderboard with counter update')
              fetchLeaderboard(true)
            }} // Обновляем счетчик только после загрузки вопроса
            showRoundSummary={showRoundSummary} // Передаем флаг, чтобы не загружать вопросы во время summary
          />
        </main>
        <aside className="app-sidebar">
          <Leaderboard
            participants={participants}
            currentQuestionNumber={currentQuestionNumber}
            totalQuestions={totalQuestions}
          />
        </aside>
      </div>
    </div>
  )
}

export default App
