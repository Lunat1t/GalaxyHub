'use client';
import dynamic from 'next/dynamic';

const PersonalWorld = dynamic(() => import('./personal-world'), {
  ssr: false,
  loading: () => <p role="status">Открываем вашу комнату…</p>,
});

export default function PersonalRoom() {
  return <main className="cafe-page-playing"><PersonalWorld /></main>;
}
