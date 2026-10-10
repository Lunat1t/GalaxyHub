export const AVATARS = ['👤', '👩‍💻', '👨‍💻', '🤖', '🐱', '🚀'] as const;
export type Profile = { id: string; name: string; avatar: string; bio: string; interests: string[]; visible: boolean };
export const PROFILE_COLUMNS = 'id,name,avatar,bio,interests,visible';
export function authErrorMessage(code?: string): string {
  const messages: Record<string, string> = {
    invalid_credentials: 'Неверный email или пароль.',
    email_not_confirmed: 'Подтвердите email по ссылке из письма.',
    user_already_exists: 'Аккаунт уже существует. Войдите или восстановите пароль.',
    email_exists: 'Этот email уже зарегистрирован.',
    weak_password: 'Пароль слишком простой. Используйте более длинный пароль.',
    over_email_send_rate_limit: 'Письма отправляются слишком часто. Подождите и повторите попытку.',
    over_request_rate_limit: 'Слишком много запросов. Попробуйте позже.',
    same_password: 'Новый пароль должен отличаться от старого.',
    signup_disabled: 'Регистрация временно отключена.',
  };
  return code && messages[code] ? messages[code] : 'Не удалось выполнить действие. Проверьте соединение и повторите попытку.';
}
