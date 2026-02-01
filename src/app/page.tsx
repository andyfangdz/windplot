import { Suspense } from 'react';
import WindPlot from '@/components/WindPlot';

export const metadata = {
  title: 'WindPlot - Aviation Wind Data',
  description: 'Real-time wind speed, gusts, and direction for local airports',
};

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#0f1419] text-white p-4 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
        <p className="text-[#8899a6] mt-4">Loading...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <WindPlot />
    </Suspense>
  );
}
