import { motion, AnimatePresence } from 'framer-motion'
import { Participant } from '../types/question'
import './RoundSummary.css'

interface RoundSummaryProps {
  participants: Participant[]
  roundNumber: number
  totalRounds: number
  onNextRound: () => void
  onLeaveGame?: () => void
}

const RoundSummary = ({ participants, roundNumber, totalRounds, onNextRound }: RoundSummaryProps) => {
  const sortedParticipants = [...participants].sort((a, b) => b.correct_answers - a.correct_answers)
  
  // Определяем выбывшего игрока - только один, кто занял последнее место (последний в отсортированном списке)
  // Если несколько игроков с одинаковым минимальным счетом, выбывает последний в списке
  const eliminatedParticipant = sortedParticipants.length > 0 ? sortedParticipants[sortedParticipants.length - 1] : null
  const eliminatedParticipants = eliminatedParticipant ? [eliminatedParticipant] : []
  const activeParticipants = sortedParticipants.slice(0, -1) // Все кроме последнего

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

  const isLastRound = roundNumber >= totalRounds

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

      <motion.div
        className="round-summary-actions"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        {!isLastRound && (
          <motion.button
            className="btn-next-round"
            onClick={onNextRound}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Следующий раунд
          </motion.button>
        )}
        {onLeaveGame && (
          <motion.button
            className="btn-leave-game"
            onClick={onLeaveGame}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            🚪 Покинуть игру
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  )
}

export default RoundSummary
