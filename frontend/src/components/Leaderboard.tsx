import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Participant } from '../types/question'
import './Leaderboard.css'

interface LeaderboardProps {
  participants: Participant[]
  currentQuestionNumber?: number
  totalQuestions?: number
}

const Leaderboard = ({ participants }: LeaderboardProps) => {
  const [sortedParticipants, setSortedParticipants] = useState<Participant[]>([])

  useEffect(() => {
    // Фильтруем участников, у которых есть id и валидные данные
    const validParticipants = participants.filter(p => p && p.id && p.name)
    const sorted = [...validParticipants].sort((a, b) => b.correct_answers - a.correct_answers)
    setSortedParticipants(sorted)
  }, [participants])

  const getRankIcon = (index: number) => {
    if (index === 0) return '🥇'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return `${index + 1}.`
  }

  const getRankClass = (index: number) => {
    if (index === 0) return 'rank-first'
    if (index === 1) return 'rank-second'
    if (index === 2) return 'rank-third'
    return ''
  }

  return (
    <motion.div
      className="leaderboard"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="leaderboard-header">
        <h3>🏆 Игроки</h3>
      </div>
      <div className="leaderboard-list">
        {sortedParticipants.length === 0 ? (
          <div className="leaderboard-empty">
            Нет участников
          </div>
        ) : (
          sortedParticipants.map((participant, index) => (
            <motion.div
              key={participant.id}
              className={`leaderboard-item ${getRankClass(index)} ${
                participant.is_current_user ? 'current-user' : ''
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.2 }}
              whileHover={{ x: 4, transition: { duration: 0.2 } }}
            >
              <div className="leaderboard-rank">
                <span className="rank-icon">{getRankIcon(index)}</span>
              </div>
              <div className="leaderboard-info">
                <div className="leaderboard-name">
                  {participant.name}
                  {participant.is_current_user && (
                    <span className="you-badge">Вы</span>
                  )}
                </div>
              </div>
              <div className="leaderboard-score-badge">
                {participant.correct_answers}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}

export default Leaderboard
