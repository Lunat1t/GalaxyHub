import { GalaxyKnowledgeClient } from '../sdk/galaxy-code.mjs';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Напиши вопрос: npm run ask -- "Как включается голосовой чат в Café?"');
  process.exitCode = 1;
} else {
  try {
    const principals = JSON.parse(process.env.GALAXY_TOKENS ?? '[]');
    const room = process.env.GALAXY_ROOM ?? 'cafe';
    const principal = principals.find(p => p.rooms?.includes(room));
    if (!principal?.token) throw new Error('Нет ключа для комнаты. Проверь GALAXY_TOKENS в .env.');
    const host = process.env.HOST === '0.0.0.0' ? '127.0.0.1' : process.env.HOST ?? '127.0.0.1';
    const client = new GalaxyKnowledgeClient({ baseUrl: process.env.GALAXY_URL ?? `http://${host}:${process.env.PORT ?? 8787}`, token: principal.token });
    const result = await client.answer({ room, query });
    console.log('\n' + result.answer);
    for (const passage of result.context.passages.filter(p => result.citationIds.includes(p.citation))) {
      console.log(`${passage.citation} ${passage.title} — ${passage.source}, строки ${passage.lineStart}–${passage.lineEnd}`);
    }
  } catch (error) {
    console.error(error.message === 'fetch failed' ? 'Не удалось подключиться. Сначала запусти npm start в другом терминале.' : error.message);
    process.exitCode = 1;
  }
}
