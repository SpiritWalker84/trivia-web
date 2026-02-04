import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Question, Answer } from '../types/question'
import Timer from './Timer'
import './QuestionViewer.css'

interface QuestionViewerProps {
  questionId: number | null
  gameId: number | null
  userId: number | null
  onQuestionChange: (id: number | null) => void
  onRoundComplete?: () => void
  onQuestionLoaded?: () => void // Callback когда вопрос успешно загружен
  showRoundSummary?: boolean // Флаг, что показывается summary раунда
}

const QuestionViewer = ({ questionId, gameId, userId, onQuestionChange, onRoundComplete, onQuestionLoaded, showRoundSummary }: QuestionViewerProps) => {
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [timerKey, setTimerKey] = useState(0)
  const [roundQuestionId, setRoundQuestionId] = useState<number | null>(null)
  const nextQuestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isNextQuestionScheduled = useRef(false)
  const hasInitialQuestionLoaded = useRef(false)

  useEffect(() => {
    // Не загружаем вопросы, если показывается summary раунда
    if (showRoundSummary) {
      console.log('⏭️ useEffect: Skipping (round summary is showing, showRoundSummary=true)')
      return
    }
    
    console.log(`🔄 useEffect triggered: questionId=${questionId}, hasInitialQuestionLoaded=${hasInitialQuestionLoaded.current}, currentQuestion=${question?.id}, showRoundSummary=${showRoundSummary}`)
    // Если questionId изменился, но это тот же вопрос, который уже загружен, не перезагружаем
    if (questionId && question?.id !== questionId) {
      console.log(`📥 useEffect: Fetching question by ID: ${questionId} (current question: ${question?.id})`)
      fetchQuestion(questionId)
    } else if (!questionId && !hasInitialQuestionLoaded.current) {
      // Загружаем первый вопрос только один раз при монтировании
      console.log('🚀 useEffect: Loading initial question (questionId is null)')
      hasInitialQuestionLoaded.current = true
      fetchRandomQuestion()
    } else {
      console.log('⏭️ useEffect: Skipping (question already loaded or initial question already loaded)')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, showRoundSummary])

  const fetchQuestion = async (id: number) => {
    setLoading(true)
    setError(null)
    setSelectedAnswer(null)
    setShowResult(false)
    setTimerKey(prev => prev + 1)

    try {
      const response = await fetch(`/api/questions/${id}`)
      if (!response.ok) {
        throw new Error('Не удалось загрузить вопрос')
      }
      const data = await response.json()
      setQuestion(data.question)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  const fetchRandomQuestion = async () => {
    // Защита от повторных вызовов
    if (isNextQuestionScheduled.current) {
      console.warn('⚠️ fetchRandomQuestion: Already scheduled, skipping. isNextQuestionScheduled=true')
      return
    }
    
    console.log('🚀 fetchRandomQuestion: STARTING. isNextQuestionScheduled was false, setting to true')
    isNextQuestionScheduled.current = true

    if (nextQuestionTimeoutRef.current) {
      clearTimeout(nextQuestionTimeoutRef.current)
      nextQuestionTimeoutRef.current = null
    }

    setLoading(true)
    setError(null)
    setSelectedAnswer(null)
    setShowResult(false)
    setTimerKey(prev => prev + 1)

    try {
      // Формируем URL с параметрами game_id и user_id
      const url = new URL('/api/questions/random', window.location.origin)
      if (gameId) url.searchParams.set('game_id', gameId.toString())
      if (userId) url.searchParams.set('user_id', userId.toString())
      
      console.log(`📡 fetchRandomQuestion: Making API call to ${url.toString()}...`)
      const response = await fetch(url.toString())
      if (!response.ok) {
        if (response.status === 202) {
          // Игра ожидает начала
          const errorData = await response.json().catch(() => ({ detail: 'Game is waiting to start' }))
          console.log('⏳ fetchRandomQuestion: Game is waiting to start (202)')
          setError(errorData.detail || 'Игра ожидает начала')
          setLoading(false)
          isNextQuestionScheduled.current = false
          return
        }
        if (response.status === 400) {
          // Раунд завершен, вызываем callback для показа summary
          console.log('✅ fetchRandomQuestion: Round completed (400)')
          setError(null)
          setLoading(false)
          isNextQuestionScheduled.current = false
          onRoundComplete?.()
          return
        }
        throw new Error('Не удалось загрузить вопрос')
      }
      const data = await response.json()
      console.log('✅ fetchRandomQuestion: Question loaded from API:', {
        questionId: data.question.id,
        roundQuestionId: data.round_question_id,
        questionText: data.question.text.substring(0, 50) + '...'
      })
      
      setQuestion(data.question)
      setRoundQuestionId(data.round_question_id || null)
      
      // Уведомляем о загрузке вопроса - это обновит счетчик в App
      // Вызываем СРАЗУ после установки вопроса
      console.log('📊 fetchRandomQuestion: Calling onQuestionLoaded to update counter')
      onQuestionLoaded?.()
      
      // Вызываем onQuestionChange ПОСЛЕ обновления счетчика, чтобы избежать повторной загрузки
      console.log('📝 fetchRandomQuestion: Calling onQuestionChange with ID:', data.question.id)
      onQuestionChange(data.question.id)
      
      // Сбрасываем флаг после успешной загрузки, чтобы можно было загрузить следующий вопрос
      console.log('🔄 fetchRandomQuestion: Resetting isNextQuestionScheduled to false')
      isNextQuestionScheduled.current = false
    } catch (err) {
      console.error('❌ fetchRandomQuestion: Error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      // При ошибке сбрасываем флаг, чтобы можно было повторить
      isNextQuestionScheduled.current = false
    } finally {
      setLoading(false)
    }
  }

  const handleTimeUp = () => {
    // Не обрабатываем, если показывается summary раунда
    if (showRoundSummary) {
      console.log('handleTimeUp: Skipping (round summary is showing)')
      return
    }
    
    if (!question) return

    // Проверяем, не запланирован ли уже следующий вопрос
    if (isNextQuestionScheduled.current) {
      console.log('handleTimeUp: Next question already scheduled, skipping')
      return
    }
    
    // Устанавливаем флаг сразу, чтобы предотвратить повторные вызовы
    isNextQuestionScheduled.current = true

    if (!showResult) {
      const correctAnswer = question.answers.find(a => a.is_correct)
      if (correctAnswer) {
        setSelectedAnswer(correctAnswer.id)
        setShowResult(true)
      }
    }

    if (nextQuestionTimeoutRef.current) {
      clearTimeout(nextQuestionTimeoutRef.current)
    }

    console.log('handleTimeUp: Scheduling next question in 3 seconds')
    nextQuestionTimeoutRef.current = setTimeout(() => {
      console.log('handleTimeUp: Timeout fired, fetching next question')
      // Проверяем еще раз перед загрузкой
      if (showRoundSummary) {
        console.log('handleTimeUp: Skipping fetch (round summary is showing)')
        isNextQuestionScheduled.current = false
        return
      }
      // Сбрасываем флаг только перед вызовом fetchRandomQuestion
      // fetchRandomQuestion сам установит флаг обратно
      isNextQuestionScheduled.current = false
      fetchRandomQuestion()
    }, 3000)
  }

  const handleAnswerClick = (answerId: number) => {
    if (showResult) return

    if (question) {
      const selectedAnswer = question.answers.find(a => a.id === answerId)
      if (selectedAnswer) {
        sendAnswer(question.id, answerId, selectedAnswer.is_correct)
      }
    }

    setSelectedAnswer(answerId)
    setShowResult(true)
  }

  const sendAnswer = async (questionId: number, answerId: number, isCorrect: boolean) => {
    if (!gameId || !userId) {
      console.warn('⚠️ sendAnswer: game_id or user_id missing, skipping answer submission')
      return
    }
    
    try {
      // Определяем выбранный вариант ответа (A, B, C, D)
      const selectedAnswer = question?.answers.find(a => a.id === answerId)
      const optionLetter = selectedAnswer 
        ? ['A', 'B', 'C', 'D'][question.answers.findIndex(a => a.id === answerId)]
        : null
      
      // Вычисляем время ответа (примерно, так как точное время нужно отслеживать отдельно)
      const answerTime = question ? (question.time_limit || 10) : null
      
      const response = await fetch('/api/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question_id: questionId,
          answer_id: answerId,
          is_correct: isCorrect,
          game_id: gameId,
          user_id: userId,
          round_question_id: roundQuestionId,
          selected_option: optionLetter,
          answer_time: answerTime,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      console.log('✅ Answer submitted successfully')
    } catch (error) {
      console.error('Failed to send answer:', error)
    }
  }

  const timeLimit = question?.time_limit || 10

  return (
    <div className="question-viewer">
      {question && !loading && (
        <div className="question-timer">
          <Timer
            key={timerKey}
            initialTime={timeLimit}
            onTimeUp={handleTimeUp}
            isActive={!loading}
          />
        </div>
      )}
      {loading && (
        <motion.div
          className="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="loading-spinner"></div>
          <p>Загрузка вопроса...</p>
        </motion.div>
      )}

      {error && (
        <motion.div
          className="error"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p>{error}</p>
          <button onClick={fetchRandomQuestion} className="btn btn-primary">
            Попробовать снова
          </button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {question && (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="question-card"
          >
            <div className="question-label">Вопрос</div>
            <h2 className="question-text">{question.text}</h2>

            <div className="answers">
              {question.answers.map((answer: Answer, index: number) => {
                const isSelected = selectedAnswer === answer.id
                const isCorrect = answer.is_correct
                const showCorrect = showResult && isCorrect
                const showIncorrect = showResult && isSelected && !isCorrect

                return (
                  <motion.button
                    key={answer.id}
                    className={`answer-btn ${
                      showCorrect ? 'correct' : ''
                    } ${
                      showIncorrect ? 'incorrect' : ''
                    } ${
                      isSelected ? 'selected' : ''
                    }`}
                    onClick={() => handleAnswerClick(answer.id)}
                    disabled={showResult}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.2 }}
                    whileHover={!showResult ? { y: -4, scale: 1.02 } : {}}
                    whileTap={!showResult ? { scale: 0.98 } : {}}
                  >
                    <span className="answer-letter">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="answer-text">{answer.text}</span>
                    {showCorrect && (
                      <motion.span
                        className="result-icon"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500 }}
                      >
                        ✓
                      </motion.span>
                    )}
                    {showIncorrect && (
                      <motion.span
                        className="result-icon"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 500 }}
                      >
                        ✗
                      </motion.span>
                    )}
                  </motion.button>
                )
              })}
            </div>

            {showResult && (
              <motion.div
                className="result-section"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {(() => {
                  const correctAnswerIndex = question.answers.findIndex(a => a.is_correct)
                  const correctLetter = correctAnswerIndex >= 0
                    ? String.fromCharCode(65 + correctAnswerIndex)
                    : ''
                  return (
                    <div className="correct-answer-info">
                      <strong>Правильный ответ: {correctLetter}</strong>
                      {isNextQuestionScheduled.current && (
                        <p className="next-question-hint">Следующий вопрос загружается...</p>
                      )}
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default QuestionViewer
