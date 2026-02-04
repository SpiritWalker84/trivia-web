import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import './GameSetup.css'

interface GameSetupProps {
  onStartGame: (settings: GameSettings) => void
  onCreatePrivate: (playerName: string) => void
  onJoinPrivate: (playerName: string, roomCode: string) => void
  telegramId?: number | null  // Если пользователь пришел из бота
  initialPlayerName?: string  // Имя из бота (если есть)
}

export interface GameSettings {
  gameType: 'training' | 'private'
  totalRounds: number
  themeId: number | null
  playerName: string
  botDifficulty?: 'novice' | 'amateur' | 'expert'  // Уровень сложности ботов для training
}

const GameSetup = ({ onStartGame, onCreatePrivate, onJoinPrivate, telegramId, initialPlayerName }: GameSetupProps) => {
  const [playerName, setPlayerName] = useState(initialPlayerName || '')
  const [gameType, setGameType] = useState<'training' | 'private'>('training')
  const [botDifficulty, setBotDifficulty] = useState<'novice' | 'amateur' | 'expert'>('amateur')
  const [isLoadingName, setIsLoadingName] = useState(!!telegramId && !initialPlayerName)
  const [showRules, setShowRules] = useState(false)
  const [privateMode, setPrivateMode] = useState<'create' | 'join'>('create')
  const [roomCode, setRoomCode] = useState('')

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
    if (gameType === 'training') {
      onStartGame({
        gameType,
        totalRounds: 9, // Фиксированное количество раундов
        themeId: null, // Смешанная тема
        playerName: playerName.trim(),
        botDifficulty: botDifficulty
      })
    }
  }

  return (
    <motion.div
      className="game-setup"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {showRules && (
        <div className="rules-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📘 Правила игры</h2>
            <p>
              Игра состоит из 9 раундов по 10 вопросов. В каждом раунде выбывает один игрок,
              который дал меньше всего правильных ответов. При равенстве минимального количества
              ответов выбывает тот, кто потратил больше времени на ответы в раунде.
            </p>
            <button className="btn-close-rules" onClick={() => setShowRules(false)}>
              Понятно
            </button>
          </div>
        </div>
      )}
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

        {gameType === 'training' && (
          <div className="form-group">
            <label htmlFor="botDifficulty">Уровень сложности ботов *</label>
            <div className="bot-difficulty-buttons">
              <motion.button
                type="button"
                className={`bot-difficulty-btn ${botDifficulty === 'novice' ? 'active' : ''}`}
                onClick={() => setBotDifficulty('novice')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="difficulty-icon">🌱</span>
                <span className="difficulty-title">Новичок</span>
                <span className="difficulty-desc">45% точность</span>
              </motion.button>
              
              <motion.button
                type="button"
                className={`bot-difficulty-btn ${botDifficulty === 'amateur' ? 'active' : ''}`}
                onClick={() => setBotDifficulty('amateur')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="difficulty-icon">⚡</span>
                <span className="difficulty-title">Любитель</span>
                <span className="difficulty-desc">55% точность</span>
              </motion.button>
              
              <motion.button
                type="button"
                className={`bot-difficulty-btn ${botDifficulty === 'expert' ? 'active' : ''}`}
                onClick={() => setBotDifficulty('expert')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="difficulty-icon">🔥</span>
                <span className="difficulty-title">Эксперт</span>
                <span className="difficulty-desc">70% точность</span>
              </motion.button>
            </div>
          </div>
        )}

        {gameType === 'private' && (
          <div className="form-group">
            <label>Комната *</label>
            <div className="private-mode-tabs">
              <button
                type="button"
                className={`private-tab ${privateMode === 'create' ? 'active' : ''}`}
                onClick={() => setPrivateMode('create')}
              >
                Создать
              </button>
              <button
                type="button"
                className={`private-tab ${privateMode === 'join' ? 'active' : ''}`}
                onClick={() => setPrivateMode('join')}
              >
                Войти по коду
              </button>
            </div>
            {privateMode === 'join' && (
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Введите код комнаты"
                maxLength={8}
              />
            )}
            <div className="private-actions">
              <motion.button
                type="button"
                className="btn-start-game"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (!playerName.trim()) {
                    alert('Пожалуйста, подождите, загружается информация о пользователе')
                    return
                  }
                  if (privateMode === 'create') {
                    onCreatePrivate(playerName.trim())
                  } else {
                    if (!roomCode.trim()) {
                      alert('Введите код комнаты')
                      return
                    }
                    onJoinPrivate(playerName.trim(), roomCode.trim())
                  }
                }}
              >
                {privateMode === 'create' ? 'Создать комнату' : 'Войти в комнату'}
              </motion.button>
            </div>
          </div>
        )}

        <div className="game-setup-actions">
          <motion.button
            type="button"
            className="btn-rules"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowRules(true)}
          >
            📘 Правила
          </motion.button>
          {gameType === 'training' && (
            <motion.button
              type="submit"
              className="btn-start-game"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              🚀 Начать игру
            </motion.button>
          )}
        </div>
      </form>
    </motion.div>
  )
}

export default GameSetup
