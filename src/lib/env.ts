export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  return value;
}
export function worldPort(): number {
  const port = Number(process.env.WORLD_PORT ?? 2567);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("WORLD_PORT must be between 1 and 65535.");
  return port;
}
