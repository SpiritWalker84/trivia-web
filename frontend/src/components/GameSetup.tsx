import { useState } from 'react'
import { motion } from 'framer-motion'
import './GameSetup.css'

interface GameSetupProps {
  onStartGame: (settings: GameSettings) => void
  telegramId?: number | null  // Если пользователь пришел из бота
  initialPlayerName?: string  // Имя из бота (если есть)
}

export interface GameSettings {
  gameType: 'quick' | 'training' | 'private'
  totalRounds: number
  themeId: number | null
  playerName: string
}

const GameSetup = ({ onStartGame, telegramId, initialPlayerName }: GameSetupProps) => {
  const [playerName, setPlayerName] = useState(initialPlayerName || '')
  const [gameType, setGameType] = useState<'quick' | 'training' | 'private'>('quick')
  const [totalRounds, setTotalRounds] = useState(9)
  const [themeId, setThemeId] = useState<number | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerName.trim()) {
      alert('Пожалуйста, введите ваше имя')
      return
    }
    onStartGame({
      gameType,
      totalRounds,
      themeId,
      playerName: playerName.trim()
    })
  }

  return (
    <motion.div
      className="game-setup"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="game-setup-header">
        <h1>🎮 Brain Survivor</h1>
        <p>Настройте игру и начните играть!</p>
      </div>

      <form onSubmit={handleSubmit} className="game-setup-form">
        <div className="form-group">
          <label htmlFor="playerName">Ваше имя *</label>
          <input
            id="playerName"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Введите ваше имя"
            required
            maxLength={50}
          />
        </div>

        <div className="form-group">
          <label htmlFor="gameType">Тип игры</label>
          <select
            id="gameType"
            value={gameType}
            onChange={(e) => setGameType(e.target.value as 'quick' | 'training' | 'private')}
          >
            <option value="quick">Быстрая игра</option>
            <option value="training">Тренировка</option>
            <option value="private">Приватная игра</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="totalRounds">Количество раундов</label>
          <input
            id="totalRounds"
            type="number"
            value={totalRounds}
            onChange={(e) => setTotalRounds(parseInt(e.target.value) || 9)}
            min={1}
            max={20}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="themeId">Тема (опционально)</label>
          <select
            id="themeId"
            value={themeId || ''}
            onChange={(e) => setThemeId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Смешанная</option>
            {/* TODO: Загрузить темы из API */}
          </select>
        </div>

        <motion.button
          type="submit"
          className="btn-start-game"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          🚀 Начать игру
        </motion.button>
      </form>
    </motion.div>
  )
}

export default GameSetup
