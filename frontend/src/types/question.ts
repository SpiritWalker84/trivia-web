export interface Question {
  id: number
  text: string
  answers: Answer[]
  category?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  explanation?: string
  created_at?: string
  time_limit?: number // Время на ответ в секундах
}

export interface Answer {
  id: number
  text: string
  is_correct: boolean
}

export interface QuestionResponse {
  question: Question
}

export interface Participant {
  id: number
  name: string
  correct_answers: number // Количество правильных ответов за раунд
  avatar?: string
  is_current_user?: boolean
}

export interface LeaderboardData {
  participants: Participant[]
  current_question_number?: number
  total_questions?: number
}
