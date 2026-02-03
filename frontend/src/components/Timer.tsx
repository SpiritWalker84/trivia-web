import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import './Timer.css'

interface TimerProps {
  initialTime: number // В секундах
  onTimeUp?: () => void
  isActive: boolean
}

const Timer = ({ initialTime, onTimeUp, isActive }: TimerProps) => {
  const [timeLeft, setTimeLeft] = useState(initialTime)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (!isActive) {
      setTimeLeft(initialTime)
      setProgress(100)
      return
    }

    if (timeLeft <= 0) {
      onTimeUp?.()
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1
        const newProgress = (newTime / initialTime) * 100
        setProgress(newProgress)
        
        if (newTime <= 0) {
          onTimeUp?.()
          return 0
        }
        return newTime
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, isActive, onTimeUp, initialTime])

  useEffect(() => {
    if (isActive) {
      setTimeLeft(initialTime)
      setProgress(100)
    }
  }, [initialTime, isActive])

  // Определяем цвет в зависимости от оставшегося времени (мемоизируем для реактивности)
  const timerColor = useMemo(() => {
    const percentage = (timeLeft / initialTime) * 100
    if (percentage > 60) return 'var(--timer-green)'
    if (percentage > 40) return 'var(--timer-yellow)'
    if (percentage > 20) return 'var(--timer-orange)'
    return 'var(--timer-red)'
  }, [timeLeft, initialTime])

  const circumference = 2 * Math.PI * 45 // радиус 45
  const offset = circumference - (progress / 100) * circumference

  const formatTime = (seconds: number): string => {
    return seconds.toString().padStart(2, '0')
  }

  const isWarning = timeLeft <= 3 && timeLeft > 0

  return (
    <motion.div
      className={`timer-container ${isWarning ? 'warning' : ''} ${!isActive ? 'paused' : ''}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="timer-circle-wrapper">
        <svg className="timer-svg" width="100" height="100" viewBox="0 0 100 100">
          {/* Фоновый круг */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(183, 190, 221, 0.2)"
            strokeWidth="6"
          />
          {/* Прогресс круг */}
          <motion.circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            initial={{ strokeDashoffset: circumference, stroke: timerColor }}
            animate={{ 
              strokeDashoffset: offset,
              stroke: timerColor,
              filter: `drop-shadow(0 0 8px ${timerColor})`,
            }}
            transition={{ duration: 0.3, ease: 'linear' }}
          />
        </svg>
        <div className="timer-content">
          <motion.span
            className="timer-number"
            animate={isWarning ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            transition={{ duration: 0.3, repeat: isWarning ? Infinity : 0 }}
            style={{ color: timerColor }}
          >
            {formatTime(timeLeft)}
          </motion.span>
          <span className="timer-label">сек</span>
        </div>
      </div>
    </motion.div>
  )
}

export default Timer
