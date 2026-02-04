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
    // Сортируем: сначала активные (по убыванию очков), потом выбывшие (по убыванию очков)
    const sorted = [...validParticipants].sort((a, b) => {
      // Сначала активные, потом выбывшие (явно проверяем на true)
      const aEliminated = a.is_eliminated === true
      const bEliminated = b.is_eliminated === true
      if (aEliminated !== bEliminated) {
        return aEliminated ? 1 : -1
      }
      // Внутри группы сортируем по очкам
      return b.correct_answers - a.correct_answers
    })
    
    // Логирование для отладки
    const eliminated = sorted.filter(p => p.is_eliminated)
    if (eliminated.length > 0) {
      console.log('Leaderboard: Found eliminated participants:', eliminated.map(p => ({ id: p.id, name: p.name, is_eliminated: p.is_eliminated })))
    }
    
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
          sortedParticipants.map((participant, index) => {
            const isEliminated = participant.is_eliminated === true // Явно проверяем на true
            // Для выбывших игроков не показываем ранг, а показываем иконку
            const activeIndex = sortedParticipants.filter(p => !p.is_eliminated).indexOf(participant)
            const rankIndex = isEliminated ? -1 : activeIndex
            
            return (
              <motion.div
                key={participant.id}
                className={`leaderboard-item ${isEliminated ? 'eliminated' : getRankClass(rankIndex)} ${
                  participant.is_current_user ? 'current-user' : ''
                }`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
                whileHover={isEliminated ? {} : { x: 4, transition: { duration: 0.2 } }}
              >
                <div className="leaderboard-rank">
                  <span className="rank-icon">
                    {isEliminated ? '💀' : getRankIcon(rankIndex)}
                  </span>
                </div>
                <div className="leaderboard-info">
                  <div className="leaderboard-name">
                    {participant.name}
                    {participant.is_current_user && (
                      <span className="you-badge">Вы</span>
                    )}
                  </div>
                </div>
                <div className={`leaderboard-score-badge ${isEliminated ? 'eliminated-score' : ''}`}>
                  {isEliminated ? '—' : participant.correct_answers}
                </div>
              </motion.div>
            )
          })
        )}
      </div>
    </motion.div>
  )
}

export default Leaderboard
