'use client';

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useSongEvents } from '@/src/hooks/use-song-events';

/**
 * OBS 브라우저 소스 하나로 재생과 자막을 모두 처리한다 (#5 2단계).
 *
 * - 지정된 송출 소스가 OBS 이고, 이 창이 활성 세션일 때만 재생한다
 *   (브라우저 소스를 실수로 두 개 열어도 이중 재생되지 않게)
 * - 곡이 끝나면 reportEnded → 서버가 큐에서 다음 곡을 올리고 SSE 로 알린다
 * - 재생 불가 영상은 reportFailed 로 보고해 자동으로 넘어간다
 * - 배경은 투명이라 화면에 그대로 얹으면 현재 곡 제목만 보인다
 */

interface NowPlaying {
  title: string;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
}

interface OverlaySetting {
  mode: 'ALWAYS' | 'TIMED';
  durationSeconds: number;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * 유튜브는 플레이어 엘리먼트 크기로 화질 등급을 고르고, 오디오 트랙도 그 등급을 따라간다.
 * 1x1 로 두면 최저 화질과 함께 저비트레이트 오디오가 선택돼 음질이 떨어지므로
 * 실제 크기를 주고 화면에서만 감춘다.
 */
const PLAYER_WIDTH = 854;
const PLAYER_HEIGHT = 480;

/** 곡 길이와 이만큼(초) 넘게 어긋나면 광고로 본다 — 검색으로 얻은 길이는 1~2초 오차가 있다 */
const AD_DURATION_TOLERANCE = 3;

function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve) => {
    const existing = document.getElementById('youtube-iframe-api');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
}

export function ObsPlayer({ token }: { token: string }) {
  /** 설정이 잘못됐을 때만 보여주는 안내 — 정상 재생 중에는 자막만 나온다 */
  const [notice, setNotice] = useState<string | null>('연결 중...');
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [overlay, setOverlay] = useState<OverlaySetting>({ mode: 'ALWAYS', durationSeconds: 10 });

  const playerRef = useRef<any>(null);
  const currentVideoRef = useRef<string | null>(null);
  /** 서버가 아는 곡 길이 — 플레이어가 보고하는 길이와 다르면 광고로 본다 */
  const expectedDurationRef = useRef(0);
  const adActiveRef = useRef(false);
  // 창마다 고유 — 마지막에 연 창만 활성 세션이 된다
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const isActiveRef = useRef(false);

  const trpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [httpBatchLink({ url: '/api/trpc', headers: { 'x-song-token': token } })],
      }),
    [token],
  );

  /** 서버 상태를 읽어 플레이어와 자막을 맞춘다 */
  const sync = useMemo(
    () => async () => {
      const state = await trpc.song.sourceState.query().catch(() => null);
      if (!state) {
        setNotice('토큰이 유효하지 않습니다.');
        setNow(null);
        return;
      }

      setOverlay(state.overlay);

      const player = playerRef.current;
      if (!player) return;

      if (state.sourceType !== 'OBS') {
        player.stopVideo?.();
        setNow(null);
        setNotice(
          `송출 소스가 ${state.sourceType === 'NONE' ? '없음' : '앱'} 으로 설정되어 있습니다.`,
        );
        return;
      }
      if (!isActiveRef.current) {
        player.stopVideo?.();
        setNow(null);
        setNotice('다른 창이 재생 중입니다. (이 창은 대기)');
        return;
      }

      const playback = state.playback;
      player.setVolume?.(playback.volume);

      if (!playback.youtubeId || playback.status === 'STOPPED') {
        player.stopVideo?.();
        currentVideoRef.current = null;
        setNow(null);
        setNotice(null);
        return;
      }

      expectedDurationRef.current = playback.durationSeconds ?? 0;

      if (currentVideoRef.current !== playback.youtubeId) {
        currentVideoRef.current = playback.youtubeId;
        player.loadVideoById?.(playback.youtubeId);
      }

      if (playback.status === 'PLAYING') player.playVideo?.();
      else player.pauseVideo?.();

      setNotice(null);
      setNow({
        title: playback.title ?? '',
        status: playback.status as NowPlaying['status'],
      });
    },
    [trpc],
  );

  // 플레이어 초기화
  useEffect(() => {
    let disposed = false;

    void (async () => {
      const YT = await loadYouTubeApi();
      if (disposed) return;

      playerRef.current = new YT.Player('obs-player', {
        height: String(PLAYER_HEIGHT),
        width: String(PLAYER_WIDTH),
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          iv_load_policy: 3,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            // 화질 힌트 — 실제 선택은 유튜브가 하지만 낮은 등급으로 떨어지는 걸 막아준다
            event.target.setPlaybackQuality?.('hd720');
            void sync();
          },
          onStateChange: (event: any) => {
            // 0 = ENDED
            if (event.data === 0 && isActiveRef.current) {
              void trpc.song.reportEnded.mutate();
            }
          },
          onError: () => {
            if (isActiveRef.current) void trpc.song.reportFailed.mutate();
          },
        },
      });
    })();

    return () => {
      disposed = true;
      playerRef.current?.destroy?.();
    };
  }, [sync, trpc]);

  // 하트비트 — 활성 세션 여부를 갱신한다
  useEffect(() => {
    const beat = async () => {
      const result = await trpc.song.heartbeat
        .mutate({ sessionId, source: 'OBS' })
        .catch(() => null);
      if (result) {
        const wasActive = isActiveRef.current;
        isActiveRef.current = result.active;
        if (wasActive !== result.active) void sync();
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), 10_000);
    return () => clearInterval(timer);
  }, [trpc, sessionId, sync]);

  /**
   * 진행률 보고 + 광고 판정.
   *
   * IFrame API 에는 광고 이벤트가 없다. 다만 광고가 재생되는 동안에는 getDuration() 이
   * 곡이 아니라 광고의 길이를 돌려주므로, 서버가 아는 곡 길이와 어긋나면 광고로 본다.
   * 이때 위치를 그대로 보고하면 진행률 막대가 광고 시간으로 튀므로 보고를 건너뛴다.
   * (판정이 빗나가도 손해는 보고 몇 번을 거르는 정도 — 그 사이는 클라이언트가 보간한다)
   */
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!isActiveRef.current || !player?.getCurrentTime) return;

      const expected = expectedDurationRef.current;
      const reported = player.getDuration?.() ?? 0;
      const adActive =
        expected > 0 && reported > 0 && Math.abs(reported - expected) > AD_DURATION_TOLERANCE;

      if (adActive !== adActiveRef.current) {
        adActiveRef.current = adActive;
        void trpc.song.reportAd.mutate({ active: adActive }).catch(() => null);
      }
      if (adActive) return;

      const position = player.getCurrentTime();
      if (typeof position === 'number' && position > 0) {
        void trpc.song.reportPosition.mutate({ positionSeconds: position }).catch(() => null);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [trpc]);

  // 서버 이벤트에 반응
  useSongEvents((event) => {
    // 시크는 재로드 없이 위치만 옮긴다
    if (event.type === 'command' && event.action === 'seek' && typeof event.value === 'number') {
      if (isActiveRef.current) playerRef.current?.seekTo?.(event.value, true);
      return;
    }
    if (event.type === 'playback' || event.type === 'command' || event.type === 'source') {
      void sync();
    }
  }, token);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* 영상은 보이지 않게 두고 소리만 내보낸다 (크기는 음질 때문에 유지) */}
      <div
        id="obs-player"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      {notice ? (
        <span
          style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            color: '#fff',
            fontSize: 12,
            opacity: 0.6,
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          }}
        >
          {notice}
        </span>
      ) : (
        <SongOverlay now={now} setting={overlay} />
      )}
    </div>
  );
}

/**
 * 현재 곡 자막.
 * 글자 크기는 브라우저 소스 높이를 따라가고(최대 120px), 제목이 가로를 넘치면 옆으로 흐른다.
 */
function SongOverlay({ now, setting }: { now: NowPlaying | null; setting: OverlaySetting }) {
  const [visible, setVisible] = useState(true);

  // TIMED 면 곡이 바뀔 때만 잠깐 보여준다 (일시정지/재개로는 다시 뜨지 않는다)
  const title = now?.title ?? null;
  useEffect(() => {
    if (!title) return;
    if (setting.mode === 'ALWAYS') {
      setVisible(true);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), setting.durationSeconds * 1000);
    return () => clearTimeout(timer);
  }, [title, setting.mode, setting.durationSeconds]);

  if (!now || !title) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '0.4em',
        padding: '0 0.3em',
        color: '#ffffff',
        // 높이에 맞춰 커지되 120px 을 넘지 않는다
        fontSize: 'min(120px, 62vh)',
        lineHeight: 1.2,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        // OBS 배경 위에서도 읽히도록 외곽선을 준다
        textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms ease',
      }}
    >
      <span style={{ flexShrink: 0 }}>{now.status === 'PAUSED' ? '⏸' : '♪'}</span>
      <MarqueeText text={title} />
    </div>
  );
}

/** 넘치지 않으면 그대로, 넘치면 같은 문구를 두 벌 이어 붙여 끊김 없이 흘린다 */
function MarqueeText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [scrollSeconds, setScrollSeconds] = useState(0);

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const overflow = content.offsetWidth - container.clientWidth;
      // 초당 90px 정도로 흐르게 — 제목이 길수록 오래 걸린다
      setScrollSeconds(overflow > 1 ? (content.offsetWidth + container.clientWidth * 0.2) / 90 : 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    // 웹폰트가 늦게 적용되면 폭이 달라진다
    void document.fonts?.ready.then(measure).catch(() => null);
    return () => observer.disconnect();
  }, [text]);

  const scrolling = scrollSeconds > 0;

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: '@keyframes wizbot-marquee { to { transform: translateX(-50%); } }',
        }}
      />
      <div
        style={
          scrolling
            ? {
                display: 'inline-flex',
                willChange: 'transform',
                animation: `wizbot-marquee ${scrollSeconds}s linear infinite`,
              }
            : { display: 'inline-flex', maxWidth: '100%' }
        }
      >
        {/* 측정용 span 에는 여백을 주지 않는다 — 붙이면 다음 측정이 밀린다 */}
        <span ref={contentRef}>{text}</span>
        {scrolling && (
          <>
            <span style={{ width: '2em', flexShrink: 0 }} />
            <span>{text}</span>
            <span style={{ width: '2em', flexShrink: 0 }} />
          </>
        )}
      </div>
    </div>
  );
}
