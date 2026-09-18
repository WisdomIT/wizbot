'use client';

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { playDing } from '@/lib/ding';
import { useSongEvents } from '@/src/hooks/use-song-events';

/**
 * OBS 브라우저 소스 하나로 재생과 자막을 모두 처리한다 (#5 2단계).
 *
 * - 스트리머가 컨트롤러에서 고른 세션(이 창)일 때만 재생한다 (#322)
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

/**
 * OBS 페이지의 영구 세션 ID (#322). 컴퓨터를 껐다 켜도 같아야 스트리머가 고른 「이 브라우저 소스」가 유지된다.
 * ⚠ 같은 OBS 안의 브라우저 소스들은 localStorage 를 공유한다 — 열려 있는 다른 탭이 쓰는 ID(alive 키가 15초 안에 갱신됨)는
 * 건너뛰고 새 ID 를 만들어 목록에 보탠다. 소스가 하나면 항상 같은 ID, 둘 이상이면 재시작 때 서로 바뀔 수 있다.
 * 이 탭이 잡은 ID 는 sessionStorage 에도 두어 새로고침에도 같은 ID 를 쓴다
 */
const IDS_KEY = 'wizbot:source-session-ids';
const TAB_KEY = 'wizbot:source-session-id';
const aliveKey = (id: string) => `wizbot:source-session-alive:${id}`;
const ALIVE_STALE_MS = 15_000;

function claimSessionId(): string {
  try {
    const mine = sessionStorage.getItem(TAB_KEY);
    if (mine) return mine;
    const ids: string[] = JSON.parse(localStorage.getItem(IDS_KEY) ?? '[]');
    const now = Date.now();
    let chosen = ids.find((id) => now - Number(localStorage.getItem(aliveKey(id)) ?? 0) > ALIVE_STALE_MS);
    if (!chosen) {
      chosen = crypto.randomUUID();
      localStorage.setItem(IDS_KEY, JSON.stringify([...ids, chosen].slice(-8)));
    }
    localStorage.setItem(aliveKey(chosen), String(now));
    sessionStorage.setItem(TAB_KEY, chosen);
    return chosen;
  } catch {
    //  저장소를 못 쓰면(비공개 모드 등) 이번 실행 동안만 유지된다
    return crypto.randomUUID();
  }
}

function touchAlive(id: string) {
  try {
    localStorage.setItem(aliveKey(id), String(Date.now()));
  } catch {
    /* 무시 */
  }
}

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
  sessionId: givenSessionId,
  label,
  fontFamily,
}: {
  token: string;
  /** 이 창이 어떤 송출 소스인지 — 컨트롤러 목록의 아이콘·이름에 쓴다 */
  source?: 'OBS' | 'ELECTRON';
  /** 앱은 메인 프로세스가 영구 ID 를 준다. 없으면(OBS 페이지) 저장소에서 스스로 잡는다 (#322) */
  sessionId?: string;
  /** 컨트롤러 목록에 보일 이름 — 앱은 컴퓨터 이름 */
  label?: string;
  /** 자막 폰트 — 스트리머 테마 (#77). CSS font-family */
  fontFamily?: string;
}) {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [overlay, setOverlay] = useState<OverlaySetting>({ mode: 'ALWAYS', durationSeconds: 10 });
  /** 「찾기」·「송출 소스로 설정됨」 안내 (#322) — OBS 페이지에서만 그린다(앱의 재생 창은 보이지 않고, 메인 창이 대신 알린다) */
  const [notice, setNotice] = useState<'locate' | 'selected' | null>(null);

  const playerRef = useRef<any>(null);
  const currentVideoRef = useRef<string | null>(null);
  // 컴퓨터를 껐다 켜도 같은 ID — 스트리머가 고른 「이 창」이 유지된다 (#322)
  const sessionId = useMemo(() => givenSessionId || claimSessionId(), [givenSessionId]);
  const isActiveRef = useRef(false);
  const wasActiveRef = useRef<boolean | null>(null);

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

      const shouldPlay = isActiveRef.current;
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
    [],
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
            // 1 = PLAYING — 실제로 소리가 나기 시작했다고 알린다. 컨트롤러의 「응답 없음」 경고가 이걸로 풀린다 (#322)
            if (event.data === 1 && isActiveRef.current && currentVideoRef.current) {
              void trpc.song.reportPlaying.mutate({ youtubeId: currentVideoRef.current }).catch(() => null);
            }
          },
          onError: (event: any) => {
            //  오류 코드(2·5·100·101·150)와 어느 창·어느 곡인지 함께 보낸다 — 이력에 원인이 남고, 늦은 보고는 서버가 버린다 (#319)
            if (!isActiveRef.current) return;
            const code = typeof event?.data === 'number' ? event.data : null;
            void trpc.song.reportFailed.mutate({ code, source, youtubeId: currentVideoRef.current }).catch(() => null);
          },
        },
      });
    })();

    return () => {
      disposed = true;
      playerRef.current?.destroy?.();
    };
  }, [sync, trpc, source]);

  /**
   * 하트비트 — 활성 세션 여부를 갱신하고, 같은 응답으로 재생 상태까지 맞춘다.
   * SSE 는 끊긴 사이의 이벤트가 유실되고 재전송이 없으므로, 이 주기가 복구를 보장한다.
   */
  useEffect(() => {
    const beat = async () => {
      if (!givenSessionId) touchAlive(sessionId);
      const result = await trpc.song.heartbeat
        .mutate({ sessionId, source, label })
        .catch(() => null);
      if (!result) return;

      //  대기 → 선택 전환은 「이 브라우저 소스가 송출 소스로 설정됨」 안내 (#322). 첫 응답은 안내하지 않는다(재시작마다 뜨면 시끄럽다)
      if (wasActiveRef.current === false && result.active && source === 'OBS') {
        setNotice('selected');
        void playDing(1);
      }
      wasActiveRef.current = result.active;
      isActiveRef.current = result.active;
      applyState(result.state);
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [trpc, sessionId, source, label, givenSessionId, applyState]);

  //  안내는 잠깐만 — 방송 화면에 그대로 나가는 페이지라 오래 남기지 않는다
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice === 'locate' ? 6_000 : 4_000);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * 진행률 보고.
   *
   * 곡이 바뀌는 순간에는 플레이어가 아직 이전 영상을 들고 있을 수 있다.
   * 그때 보고하면 새 곡의 위치가 이전 곡 시간으로 덮인다 (#122).
   * 로드된 영상이 우리가 기대하는 곡일 때만 보내고, 어느 곡인지도 함께 알린다.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      const expected = currentVideoRef.current;
      if (!isActiveRef.current || !player?.getCurrentTime || !expected) return;

      const loaded = player.getVideoData?.()?.video_id ?? expected;
      if (loaded !== expected) return;

      const position = player.getCurrentTime();
      if (typeof position === 'number' && position > 0) {
        void trpc.song.reportPosition
          .mutate({ positionSeconds: position, youtubeId: expected })
          .catch(() => null);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [trpc]);

  // 서버 이벤트에 반응
  useSongEvents((event) => {
    // 「찾기」 (#322) — 이 창이면 빨간 테두리 + 텍스트 + 띵동 3회. 앱의 재생 창은 보이지 않으니 메인 창이 대신한다
    if (event.type === 'locate') {
      if (event.sessionId === sessionId && source === 'OBS') {
        setNotice('locate');
        void playDing(3);
      }
      return;
    }
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
      {/* 찾기·설정됨 안내 (#322) — OBS 미리보기에서 어느 소스인지 바로 알아볼 수 있게 화면 전체 테두리를 빨갛게 빛낸다 */}
      {notice && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4%',
            boxSizing: 'border-box',
            border: notice === 'locate' ? '10px solid #ef4444' : '10px solid #22c55e',
            boxShadow: notice === 'locate' ? '0 0 40px 10px rgba(239,68,68,0.8), inset 0 0 40px 10px rgba(239,68,68,0.5)' : '0 0 40px 10px rgba(34,197,94,0.7), inset 0 0 40px 10px rgba(34,197,94,0.4)',
            animation: 'wizbot-locate-pulse 0.8s ease-in-out infinite alternate',
            pointerEvents: 'none',
          }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: '@keyframes wizbot-locate-pulse { from { opacity: 0.55; } to { opacity: 1; } }',
            }}
          />
          <div
            style={{
              fontFamily,
              background: 'rgba(0,0,0,0.75)',
              color: '#ffffff',
              borderRadius: '0.5em',
              padding: '0.5em 1em',
              fontSize: 'min(72px, 12vh, 6vw)',
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {notice === 'locate' ? '이 브라우저 소스가 찾기에 의해 호출됨' : '이 브라우저 소스가 송출 소스로 설정됨'}
          </div>
        </div>
      )}

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

      <SongOverlay now={now} setting={overlay} fontFamily={fontFamily} />
    </div>
  );
}

/**
 * 현재 곡 자막.
 * 글자 크기는 브라우저 소스 높이를 따라가고(최대 120px), 제목이 가로를 넘치면 옆으로 흐른다.
 */
function SongOverlay({
  now,
  setting,
  fontFamily,
}: {
  now: NowPlaying | null;
  setting: OverlaySetting;
  fontFamily?: string;
}) {
  const [visible, setVisible] = useState(true);

  // TIMED 면 곡이 바뀔 때만 잠깐 보여준다 (일시정지/재개로는 다시 뜨지 않는다)
  //  다시 보이기는 렌더 중 보정으로, 숨기기 타이머만 effect 로 (#200)
  const title = now?.title ?? null;
  const overlayKey = `${setting.mode}|${title ?? ''}`;
  const [prevOverlayKey, setPrevOverlayKey] = useState(overlayKey);
  if (overlayKey !== prevOverlayKey) {
    setPrevOverlayKey(overlayKey);
    if (title) setVisible(true);
  }
  useEffect(() => {
    if (!title || setting.mode === 'ALWAYS') return;
    const timer = setTimeout(() => setVisible(false), setting.durationSeconds * 1000);
    return () => clearTimeout(timer);
  }, [title, setting.mode, setting.durationSeconds]);

  if (!now || !title) return null;

  return (
    <div
      style={{
        fontFamily,
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
