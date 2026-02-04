import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import './GameSetup.css'

interface GameSetupProps {
  onStartGame: (settings: GameSettings) => void
  telegramId?: number | null  // Если пользователь пришел из бота
  initialPlayerName?: string  // Имя из бота (если есть)
}

export interface GameSettings {
  gameType: 'training' | 'private'
  totalRounds: number
  themeId: number | null
  playerName: string
}

const GameSetup = ({ onStartGame, telegramId, initialPlayerName }: GameSetupProps) => {
  const [playerName, setPlayerName] = useState(initialPlayerName || '')
  const [gameType, setGameType] = useState<'training' | 'private'>('training')
  const [isLoadingName, setIsLoadingName] = useState(!!telegramId && !initialPlayerName)

  // Загружаем имя пользователя, если есть telegram_id
  useEffect(() => {
    if (telegramId && !initialPlayerName) {
      setIsLoadingName(true)
      fetch(`/api/user/info?telegram_id=${telegramId}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          return res.json()
        })
        .then(data => {
          if (data.exists && data.full_name) {
            setPlayerName(data.full_name)
          } else {
            // Если пользователя нет, создадим с дефолтным именем
            setPlayerName(`Игрок ${telegramId}`)
          }
          setIsLoadingName(false)
        })
        .catch(err => {
          console.warn('Failed to load user info:', err)
          setPlayerName(`Игрок ${telegramId}`)
          setIsLoadingName(false)
        })
    } else if (initialPlayerName) {
      setPlayerName(initialPlayerName)
      setIsLoadingName(false)
    } else if (!telegramId) {
      setIsLoadingName(false)
    }
  }, [telegramId, initialPlayerName])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerName.trim()) {
      alert('Пожалуйста, подождите, загружается информация о пользователе')
      return
    }
    onStartGame({
      gameType,
      totalRounds: 9, // Фиксированное количество раундов
      themeId: null, // Смешанная тема
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
        <p>Выберите тип игры</p>
      </div>

      <form onSubmit={handleSubmit} className="game-setup-form">
        {telegramId && (
          <div className="form-group">
            <label>Игрок</label>
            <div className="player-name-display">
              {isLoadingName ? (
                <span className="loading-text">Загрузка...</span>
              ) : (
                <span className="player-name">{playerName}</span>
              )}
            </div>
          </div>
        )}

        {!telegramId && (
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
        )}

        <div className="form-group">
          <label htmlFor="gameType">Тип игры *</label>
          <div className="game-type-buttons">
            <motion.button
              type="button"
              className={`game-type-btn ${gameType === 'training' ? 'active' : ''}`}
              onClick={() => setGameType('training')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="game-type-icon">🤖</span>
              <span className="game-type-title">Тренировка с ботами</span>
              <span className="game-type-desc">Играйте против ботов разной сложности</span>
            </motion.button>
            
            <motion.button
              type="button"
              className={`game-type-btn ${gameType === 'private' ? 'active' : ''}`}
              onClick={() => setGameType('private')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="game-type-icon">👥</span>
              <span className="game-type-title">Игра с друзьями</span>
              <span className="game-type-desc">Пригласите друзей из Telegram</span>
            </motion.button>
          </div>
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
