'use client';

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

/** sourceState / heartbeat 가 함께 돌려주는 재생 상태 */
type SourceState = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createTRPCClient<AppRouter>>['song']['sourceState']['query']>>
>;

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

/**
 * 하트비트 주기 — 서버는 이 값의 3배(SOURCE_TIMEOUT_MS)까지 못 받으면 끊긴 것으로 본다.
 * 응답에 재생 상태가 함께 오므로, 이 주기가 곧 "어긋남이 정정되는 최대 지연"이다.
 */
const HEARTBEAT_MS = 5_000;

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

export function SourcePlayer({
  token,
  source = 'OBS',
}: {
  token: string;
  /** 이 창이 어떤 송출 소스인지 — 설정과 일치할 때만 재생한다 */
  source?: 'OBS' | 'ELECTRON';
}) {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [overlay, setOverlay] = useState<OverlaySetting>({ mode: 'ALWAYS', durationSeconds: 10 });

  const playerRef = useRef<any>(null);
  const currentVideoRef = useRef<string | null>(null);
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

  /**
   * 서버가 준 상태에 자막과 재생을 맞춘다.
   *
   * **자막과 재생은 별개다.**
   * - 자막: 어느 소스가 소리를 내든 항상 보여준다. 이 페이지는 시청자에게 곡을 알리는 역할이다
   * - 소리: 이 창이 지정된 송출 소스이고 활성 세션일 때만
   */
  const applyState = useCallback(
    (state: SourceState | null) => {
      // 이 화면은 방송에 그대로 나간다 — 안내·경고를 띄우지 않고 조용히 비운다
      if (!state) {
        setNow(null);
        return;
      }

      setOverlay(state.overlay);

      const playback = state.playback;
      const hasSong = Boolean(playback.youtubeId) && playback.status !== 'STOPPED';

      setNow(
        hasSong
          ? { title: playback.title ?? '', status: playback.status as NowPlaying['status'] }
          : null,
      );

      const player = playerRef.current;
      if (!player) return;

      const shouldPlay = state.sourceType === source && isActiveRef.current;
      if (!shouldPlay || !hasSong) {
        player.stopVideo?.();
        currentVideoRef.current = null;
        return;
      }

      player.setVolume?.(playback.volume);

      if (currentVideoRef.current !== playback.youtubeId) {
        currentVideoRef.current = playback.youtubeId;
        player.loadVideoById?.(playback.youtubeId);
      }

      if (playback.status === 'PLAYING') player.playVideo?.();
      else player.pauseVideo?.();
    },
    [source],
  );

  /** 서버에서 상태를 읽어와 맞춘다 — SSE 로 변화를 통보받았을 때 쓴다 */
  const sync = useCallback(async () => {
    const state = await trpc.song.sourceState.query().catch(() => null);
    applyState(state);
  }, [trpc, applyState]);

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

  /**
   * 하트비트 — 활성 세션 여부를 갱신하고, 같은 응답으로 재생 상태까지 맞춘다.
   * SSE 는 끊긴 사이의 이벤트가 유실되고 재전송이 없으므로, 이 주기가 복구를 보장한다.
   */
  useEffect(() => {
    const beat = async () => {
      const result = await trpc.song.heartbeat
        .mutate({ sessionId, source })
        .catch(() => null);
      if (!result) return;

      isActiveRef.current = result.active;
      applyState(result.state);
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [trpc, sessionId, source, applyState]);

  // 진행률 보고
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!isActiveRef.current || !player?.getCurrentTime) return;
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
    // connected = SSE 재연결. 끊겨 있던 동안의 이벤트는 재전송되지 않으므로 바로 맞춘다
    if (
      event.type === 'connected' ||
      event.type === 'playback' ||
      event.type === 'command' ||
      event.type === 'source'
    ) {
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

      <SongOverlay now={now} setting={overlay} />
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
