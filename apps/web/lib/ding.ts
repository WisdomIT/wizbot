/**
 * 「띵동」 (#322) — 찾기·송출 소스 설정 알림음. 파일 없이 WebAudio 로 두 음(E5→C5)을 합성한다.
 * OBS 브라우저 소스·앱 웹뷰 어디서나 돌고, 오디오 컨텍스트가 막혀 있으면(자동재생 정책) 조용히 넘어간다
 */
export async function playDing(times = 3): Promise<void> {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => null);
  } catch {
    return;
  }
  const tone = (freq: number, at: number, length: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };
  const start = ctx.currentTime + 0.05;
  for (let i = 0; i < times; i++) {
    const base = start + i * 0.9;
    tone(659.25, base, 0.35); // E5 띵
    tone(523.25, base + 0.3, 0.45); // C5 동
  }
  setTimeout(() => void ctx.close().catch(() => null), (times * 0.9 + 1) * 1000);
}
