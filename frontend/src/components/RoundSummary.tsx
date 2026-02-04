import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useMemo } from 'react'
import { Participant } from '../types/question'
import './RoundSummary.css'

interface RoundSummaryProps {
  participants: Participant[]
  roundNumber: number
  totalRounds: number
  onNextRound: () => void
}

const RoundSummary = ({ participants, roundNumber, totalRounds, onNextRound }: RoundSummaryProps) => {
  const [timeLeft, setTimeLeft] = useState(30)
  const [progress, setProgress] = useState(100)
  
  // Фильтруем участников, у которых есть id
  const validParticipants = participants.filter(p => p && p.id)

  // Автоматический таймер на 30 секунд
  useEffect(() => {
    if (totalRounds && roundNumber >= totalRounds) {
      // Если это последний раунд, не запускаем таймер
      return
    }

    setTimeLeft(30)
    setProgress(100)

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Автоматически переходим к следующему раунду
          setTimeout(() => {
            onNextRound()
          }, 500)
          return 0
        }
        const newTime = prev - 1
        const newProgress = (newTime / 30) * 100
        setProgress(newProgress)
        return newTime
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [roundNumber, totalRounds, onNextRound])

  // Определяем цвет таймера
  const timerColor = useMemo(() => {
    const percentage = (timeLeft / 30) * 100
    if (percentage > 60) return 'var(--timer-green)'
    if (percentage > 40) return 'var(--timer-yellow)'
    if (percentage > 20) return 'var(--timer-orange)'
    return 'var(--timer-red)'
  }, [timeLeft])

  const circumference = 2 * Math.PI * 50 // радиус 50
  const offset = circumference - (progress / 100) * circumference
  
  // Обновляем таймер для 30 секунд вместо 60

  const isLastRound = roundNumber >= totalRounds
  // Сортируем: сначала активные (по убыванию очков), потом выбывшие
  const sortedParticipants = [...validParticipants].sort((a, b) => {
    // Сначала активные, потом выбывшие
    if (a.is_eliminated !== b.is_eliminated) {
      return a.is_eliminated ? 1 : -1
    }
    // Внутри группы сортируем по очкам
    return b.correct_answers - a.correct_answers
  })
  
  // Разделяем на активных и выбывших
  const activeParticipants = sortedParticipants.filter(p => !p.is_eliminated)
  const eliminatedParticipants = sortedParticipants.filter(p => p.is_eliminated)

  const getRankIcon = (index: number) => {
    if (index === 0) return '🥇'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return `${index + 1}`
  }

  const getRankClass = (index: number) => {
    if (index === 0) return 'rank-first'
    if (index === 1) return 'rank-second'
    if (index === 2) return 'rank-third'
    return ''
  }

  return (
    <motion.div
      className="round-summary"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="round-summary-header">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {isLastRound ? '🎉 Игра завершена!' : `Раунд ${roundNumber} завершен`}
        </motion.h2>
        <motion.p
          className="round-summary-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {isLastRound 
            ? 'Финальные результаты' 
            : 'Итоги раунда'}
        </motion.p>
      </div>

      <div className="round-summary-leaderboard">
        <h3 className="leaderboard-title">🏆 Таблица лидеров</h3>
        <div className="leaderboard-grid">
          <AnimatePresence mode="popLayout">
            {/* Активные игроки */}
            {activeParticipants.map((participant, index) => (
              <motion.div
                key={`active-${participant.id}`}
                className={`leaderboard-card ${getRankClass(index)} ${
                  participant.is_current_user ? 'current-user' : ''
                }`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.4 + index * 0.1, duration: 0.3 }}
              >
                <div className="card-rank">
                  <span className="rank-icon">{getRankIcon(index)}</span>
                </div>
                <div className="card-info">
                  <div className="card-name">
                    {participant.name}
                    {participant.is_current_user && (
                      <span className="you-badge">Вы</span>
                    )}
                  </div>
                </div>
                <div className="card-score">
                  {participant.correct_answers}
                </div>
              </motion.div>
            ))}
            
            {/* Выбывшие игроки */}
            {eliminatedParticipants.map((participant, index) => (
              <motion.div
                key={`eliminated-${participant.id}`}
                className={`leaderboard-card eliminated ${
                  participant.is_current_user ? 'current-user' : ''
                }`}
                initial={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                animate={{ 
                  opacity: 0.4, 
                  y: 150, 
                  rotate: -8,
                  scale: 0.85,
                  filter: 'blur(2px)'
                }}
                exit={{ opacity: 0 }}
                transition={{ 
                  delay: 0.8 + activeParticipants.length * 0.1 + index * 0.2,
                  duration: 0.8,
                  ease: "easeIn"
                }}
              >
                <div className="card-rank">
                  <span className="rank-icon">💀</span>
                </div>
                <div className="card-info">
                  <div className="card-name">
                    {participant.name}
                    {participant.is_current_user && (
                      <span className="you-badge">Вы</span>
                    )}
                  </div>
                </div>
                <div className="card-score eliminated-score">
                  {participant.correct_answers}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Таймер до следующего раунда */}
      {!isLastRound && (
        <motion.div
          className="round-timer-container"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.0 }}
        >
          <div className="round-timer-wrapper">
            <div className="round-timer-label">До следующего раунда</div>
            <div className="round-timer-circle-wrapper">
              <svg className="round-timer-svg" width="120" height="120" viewBox="0 0 100 100">
                {/* Фоновый круг */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="rgba(183, 190, 221, 0.2)"
                  strokeWidth="8"
                />
                {/* Прогресс круг */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  initial={{ strokeDashoffset: circumference, stroke: timerColor }}
                  animate={{ 
                    strokeDashoffset: offset,
                    stroke: timerColor,
                    filter: `drop-shadow(0 0 12px ${timerColor})`,
                  }}
                  transition={{ duration: 0.3, ease: 'linear' }}
                />
              </svg>
              <div className="round-timer-content">
                <motion.span
                  className="round-timer-number"
                  animate={timeLeft <= 10 ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3, repeat: timeLeft <= 10 ? Infinity : 0 }}
                  style={{ color: timerColor }}
                >
                  {timeLeft}
                </motion.span>
                <span className="round-timer-unit">сек</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

    </motion.div>
  )
}

export default RoundSummary
