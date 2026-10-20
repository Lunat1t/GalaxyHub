import packageInfo from '../../../../package.json';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ status: 'ok', version: packageInfo.version, services: { web: true, personalRoom: true } }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
