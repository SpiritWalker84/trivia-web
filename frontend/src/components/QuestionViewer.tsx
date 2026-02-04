import { useState, useEffect, useRef, useCallback } from 'react'
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
  onQuestionLoaded?: (question: Question) => void // Callback когда вопрос успешно загружен
  showRoundSummary?: boolean // Флаг, что показывается summary раунда
  onTimerTimeUp?: (handleTimeUpFn: () => void) => void // Callback для передачи функции handleTimeUp в родительский компонент
}

const QuestionViewer = ({ questionId, gameId, userId, onQuestionChange, onRoundComplete, onQuestionLoaded, showRoundSummary, onTimerTimeUp }: QuestionViewerProps) => {
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [timeExpired, setTimeExpired] = useState(false) // Флаг, что время истекло без ответа
  const [timerKey, setTimerKey] = useState(0)
  const [roundQuestionId, setRoundQuestionId] = useState<number | null>(null)
  const nextQuestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isNextQuestionScheduled = useRef(false)
  const hasInitialQuestionLoaded = useRef(false)
  const questionLoadTimeRef = useRef<number | null>(null) // Время загрузки вопроса
  const previousQuestionIdRef = useRef<number | null>(null) // Предыдущий questionId для отслеживания изменений

  useEffect(() => {
    // Не загружаем вопросы, если показывается summary раунда
    if (showRoundSummary) {
      return
    }
    
    // Не загружаем вопросы, если нет gameId или userId
    if (!gameId || !userId) {
      return
    }
    
    // Если questionId изменился, но это тот же вопрос, который уже загружен, не перезагружаем
    if (questionId && question?.id !== questionId) {
      // В игровом потоке используем /api/questions/random, чтобы не ловить 404 из mock /api/questions/{id}
      if (!gameId || !userId) {
        fetchQuestion(questionId)
      } else {
      }
      previousQuestionIdRef.current = questionId
    } else if (!questionId) {
      // Если questionId стал null, это означает, что нужно загрузить следующий вопрос
      // Проверяем, что это действительно изменение (не первый рендер)
      // Для первого вопроса: hasInitialQuestionLoaded.current === false
      // Для следующих вопросов: previousQuestionIdRef.current !== null (был загружен вопрос ранее)
      if (!hasInitialQuestionLoaded.current) {
        // Первый вопрос - загружаем сразу
        hasInitialQuestionLoaded.current = true
        fetchRandomQuestion()
      } else if (previousQuestionIdRef.current !== null && question === null) {
        // Следующий вопрос - загружаем только если предыдущий вопрос был загружен И текущий вопрос null
        // Это предотвращает пропуск первого вопроса при создании раунда
        previousQuestionIdRef.current = null // Сбрасываем перед загрузкой следующего
        fetchRandomQuestion()
      } else {
      }
    } else {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, showRoundSummary])

  const fetchQuestion = async (id: number) => {
    setLoading(true)
    setError(null)

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

  const fetchRandomQuestion = async (retryCount = 0, options: { silent?: boolean } = {}) => {
    const preserveState = options.silent || (showResult && !!question && !!roundQuestionId)
    let keepLoading = false
    // Защита от повторных вызовов
    if (isNextQuestionScheduled.current && retryCount === 0) {
      return
    }
    if (retryCount === 0) {
      isNextQuestionScheduled.current = true
    }

    if (nextQuestionTimeoutRef.current) {
      clearTimeout(nextQuestionTimeoutRef.current)
      nextQuestionTimeoutRef.current = null
    }

    if (!preserveState) {
      setLoading(true)
      setError(null)
      setSelectedAnswer(null)
      setShowResult(false)
      setTimeExpired(false)
      setTimerKey(prev => prev + 1)
    } else {
      setError(null)
    }

    try {
      // Формируем URL с параметрами game_id и user_id
      const url = new URL('/api/questions/random', window.location.origin)
      if (gameId) url.searchParams.set('game_id', gameId.toString())
      if (userId) url.searchParams.set('user_id', userId.toString())
      
      const response = await fetch(url.toString())
      if (!response.ok) {
        if (response.status === 202) {
          // Игра ожидает начала - пробуем повторить через некоторое время
          const errorData = await response.json().catch(() => ({ detail: 'Game is waiting to start' }))
          
          if (retryCount < 30) {
            // Повторяем попытку через 1 секунду
            keepLoading = true
            setError(null)
            setTimeout(() => {
              fetchRandomQuestion(retryCount + 1)
            }, 1000)
            return
          } else {
            setError(errorData.detail || 'Игра ожидает начала. Пожалуйста, подождите...')
            setLoading(false)
            isNextQuestionScheduled.current = false
            return
          }
        }
        if (response.status === 400) {
          // Получаем детали ошибки
          const errorData = await response.json().catch(() => ({ detail: 'Round completed' }))
          const errorDetail = errorData.detail || 'Round completed'
          
          // Если это "No active round found" или "Game is not in progress", пробуем повторить
          if ((errorDetail.includes('No active round') || errorDetail.includes('not in progress')) && retryCount < 30) {
            keepLoading = true
            setError(null)
            setTimeout(() => {
              fetchRandomQuestion(retryCount + 1)
            }, 1000)
            return
          }
          
          // Иначе раунд действительно завершен
          setError(null)
          setLoading(false)
          isNextQuestionScheduled.current = false
          onRoundComplete?.()
          return
        }
        throw new Error('Не удалось загрузить вопрос')
      }
      const data = await response.json()
      
      // Проверяем, что данные корректны
      if (!data || !data.question) {
        if (retryCount < 5) {
          keepLoading = true
          setError(null)
          setTimeout(() => {
            fetchRandomQuestion(retryCount + 1)
          }, 1000)
          return
        }
        throw new Error('Invalid response from server: question is missing')
      }
      
      const newQuestionId = data.question.id
      const newRoundQuestionId = data.round_question_id || null
      const isSameQuestion = newQuestionId === question?.id && newRoundQuestionId === roundQuestionId

        if (isSameQuestion) {
          if (preserveState && retryCount < 30) {
            setTimeout(() => {
              fetchRandomQuestion(retryCount + 1, { silent: true })
            }, 1000)
          }
        setLoading(false)
        isNextQuestionScheduled.current = false
        return
      }

      setSelectedAnswer(null)
      setShowResult(false)
      setTimeExpired(false)
      setTimerKey(prev => prev + 1)

      setQuestion(data.question)
      setRoundQuestionId(newRoundQuestionId)
      // Сохраняем время загрузки вопроса для вычисления времени ответа
      questionLoadTimeRef.current = Date.now()
      // Обновляем previousQuestionIdRef после успешной загрузки
      if (data.question && data.question.id) {
        previousQuestionIdRef.current = data.question.id
      }
      
      // Отмечаем вопрос как показанный (для standalone frontend)
      if (data.round_question_id) {
        try {
          await fetch('/api/question/mark-displayed', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              round_question_id: data.round_question_id,
            }),
          })
        } catch (error) {
          // Не критично, продолжаем работу
        }
      }
      
      // Уведомляем о загрузке вопроса - это обновит счетчик в App
      // Вызываем СРАЗУ после установки вопроса
      onQuestionLoaded?.(data.question)
      
      // Вызываем onQuestionChange ПОСЛЕ обновления счетчика, чтобы избежать повторной загрузки
      if (data.question && data.question.id) {
        onQuestionChange(data.question.id)
      } else {
        console.error('❌ fetchRandomQuestion: Question ID is missing!', data)
        throw new Error('Question ID is missing in response')
      }
      
      // Сбрасываем флаг после успешной загрузки, чтобы можно было загрузить следующий вопрос
      isNextQuestionScheduled.current = false
    } catch (err) {
      console.error('❌ fetchRandomQuestion: Error:', err)
      // Краткий авто-ретрай для сетевых/временных ошибок без показа красного текста
      if (retryCount < 3) {
        keepLoading = true
        setError(null)
        setTimeout(() => {
          fetchRandomQuestion(retryCount + 1)
        }, 1000)
        return
      }
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      // При ошибке сбрасываем флаг, чтобы можно было повторить
      isNextQuestionScheduled.current = false
    } finally {
      if (!keepLoading) {
        setLoading(false)
      }
    }
  }

  const handleTimeUp = useCallback(() => {
    // Не обрабатываем, если показывается summary раунда
    if (showRoundSummary) {
      return
    }
    
    if (!question) return

    // Проверяем, не запланирован ли уже следующий вопрос
    if (isNextQuestionScheduled.current) {
      return
    }
    
    // Устанавливаем флаг сразу, чтобы предотвратить повторные вызовы
    isNextQuestionScheduled.current = true

    if (!showResult) {
      // Если пользователь не ответил, показываем правильный ответ с желтым фоном (без галочки)
      setTimeExpired(true)
      setShowResult(true)
      // Отправляем «таймаут» на сервер, чтобы API считал игрока ответившим и вернул 400 (Round completed) при следующем запросе
      const wrongAnswer = question.answers.find((a: Answer) => !a.is_correct)
      if (wrongAnswer && gameId && userId && roundQuestionId) {
        sendAnswer(question.id, wrongAnswer.id, false)
      }
    }

    if (nextQuestionTimeoutRef.current) {
      clearTimeout(nextQuestionTimeoutRef.current)
    }

    nextQuestionTimeoutRef.current = setTimeout(() => {
      // Проверяем еще раз перед загрузкой
      if (showRoundSummary) {
        isNextQuestionScheduled.current = false
        return
      }
      // Сбрасываем флаг только перед вызовом fetchRandomQuestion
      // fetchRandomQuestion сам установит флаг обратно
      isNextQuestionScheduled.current = false
      fetchRandomQuestion()
    }, 2500) // 2.5 секунды задержки, чтобы пользователь успел увидеть правильный ответ
  }, [question, showResult, showRoundSummary, roundQuestionId, gameId, userId])

  // Передаем handleTimeUp в родительский компонент через callback
  useEffect(() => {
    if (onTimerTimeUp) {
      onTimerTimeUp(handleTimeUp)
    }
  }, [onTimerTimeUp, handleTimeUp])

  useEffect(() => {
    if (showRoundSummary) {
      return
    }
    if (!showResult || !question || !roundQuestionId) {
      return
    }
    const interval = setInterval(() => {
      fetchRandomQuestion(0, { silent: true })
    }, 1000)
    return () => clearInterval(interval)
  }, [showResult, question, roundQuestionId, showRoundSummary])

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

    // Не загружаем следующий вопрос сразу после ответа.
    // В мультиплеере ждём всех игроков/ботов или окончания таймера.
  }

  const sendAnswer = async (questionId: number, answerId: number, isCorrect: boolean) => {
    if (!gameId || !userId) {
      return
    }
    
    try {
      // Определяем выбранный вариант ответа (A, B, C, D)
      // Варианты всегда идут в порядке A, B, C, D (id: 1, 2, 3, 4)
      const optionLetter = answerId >= 1 && answerId <= 4 
        ? ['A', 'B', 'C', 'D'][answerId - 1]
        : null
      
      // Вычисляем время ответа: разница между текущим временем и временем загрузки вопроса
      let answerTime: number | null = null
      if (questionLoadTimeRef.current) {
        const timeElapsed = (Date.now() - questionLoadTimeRef.current) / 1000 // в секундах
        answerTime = Math.min(timeElapsed, question?.time_limit || 10) // не больше лимита
      }
      
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
      
    } catch (error) {
      console.error('Failed to send answer:', error)
    }
  }

  const timeLimit = question?.time_limit || 10

  return (
    <div className="question-viewer">
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
          <button onClick={() => fetchRandomQuestion()} className="btn btn-primary">
            Попробовать снова
          </button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {question && question.id && (
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
                const showCorrect = showResult && isCorrect && !timeExpired // Правильный ответ с галочкой (когда пользователь ответил)
                const showIncorrect = showResult && isSelected && !isCorrect // Неправильный ответ с крестиком
                const showTimeExpired = showResult && timeExpired && isCorrect // Правильный ответ с желтым фоном (когда время истекло)

                return (
                  <motion.button
                    key={answer.id}
                    className={`answer-btn ${
                      showCorrect ? 'correct' : ''
                    } ${
                      showIncorrect ? 'incorrect' : ''
                    } ${
                      showTimeExpired ? 'time-expired' : ''
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
