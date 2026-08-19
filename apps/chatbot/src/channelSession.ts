/* eslint-disable no-console */
import chalk from 'chalk';
import { ChzzkOpenClient, ChzzkRealtime, getChatRole } from 'chzzk-open-sdk';

import { ApiTokenStore } from './tokenStore';
import { trpc } from './trpc';

export interface ChannelInfo {
  userId: number;
  channelId: string;
  channelName: string;
}

interface TrackedRepeat {
  response: string;
  intervalSeconds: number;
  timer: NodeJS.Timeout;
}

/**
 * 스트리머 1명분의 실시간 연결 + 반복 메시지 타이머 (#29 채널 상태 구조화).
 *
 * - 연결·재연결·재구독은 SDK(ChzzkRealtime)가 복구한다.
 * - 채팅 응답 계산·전송, 반복 메시지 전송 모두 API 가 수행한다 — 워커는 이벤트 중계만.
 * - 모든 핸들러는 예외를 삼키고 로깅한다 (#27: 미처리 예외로 프로세스가 죽지 않게).
 */
export class ChannelSession {
  private realtime: ChzzkRealtime | null = null;
  private repeats = new Map<number, TrackedRepeat>();
  private disposed = false;

  constructor(
    readonly info: ChannelInfo,
    private readonly botChannelId: string,
  ) {}

  private get label() {
    return chalk.blue(`[${this.info.channelName}]`);
  }

  async start(): Promise<void> {
    const client = new ChzzkOpenClient({
      clientId: process.env.CHZZK_ID ?? '',
      clientSecret: process.env.CHZZK_SECRET ?? '',
      tokenStore: new ApiTokenStore(this.info.userId),
      // API 가 신선한 토큰을 보장하므로 워커측 선제 갱신은 끈다 (tokenStore.ts 참고)
      expirySkewSeconds: 0,
    });

    // 유저 세션(유저당 최대 3연결) — 채널별 독립 연결이라 한 채널 장애가 다른 채널에 번지지 않는다
    const realtime = client.createRealtime({ auth: 'user', subscriptions: ['chat'] });
    this.realtime = realtime;

    realtime.on('chat', (chat) => {
      void this.handleChat(chat.senderChannelId, chat.nickname, getChatRole(chat), chat.content);
    });
    realtime.on('connected', () => console.log('🔌 연결됨:', this.label));
    realtime.on('subscribed', (data) => console.log('🔔 구독됨:', this.label, data.eventType));
    realtime.on('revoked', () => console.warn('🔒 구독 회수됨(동의 철회?):', this.label));
    realtime.on('disconnected', (reason) => console.warn('🔌 연결 해제:', this.label, reason));
    realtime.on('reconnecting', (attempt, delayMs) =>
      console.log('🔄 재연결 시도:', this.label, `#${attempt} (+${delayMs}ms)`),
    );
    realtime.on('error', (error) => console.error('❌ 실시간 오류:', this.label, error));

    await realtime.start();
  }

  private async handleChat(
    senderChannelId: string,
    senderNickname: string,
    senderRole: 'STREAMER' | 'MANAGER' | 'VIEWER',
    content: string,
  ): Promise<void> {
    try {
      // 봇 자신의 채팅, 명령어가 아닌 채팅은 무시
      if (senderChannelId === this.botChannelId) return;
      if (!content.startsWith('!')) return;

      console.log(
        '💬 ',
        this.label,
        senderRole !== 'VIEWER' ? chalk.green(senderNickname) : chalk.white(senderNickname),
        content,
      );

      // 응답 계산 + 전송 모두 API 가 수행한다
      const result = await trpc.chatbot.message.mutate({
        userId: this.info.userId,
        senderNickname,
        senderRole,
        content,
      });

      if (!result.ok) {
        console.error('❌ 처리 실패:', this.label, result.message);
        return;
      }
      console.log('ㅤ🤖', this.label, result.message);
    } catch (error) {
      console.error('❌ 채팅 처리 오류:', this.label, error);
    }
  }

  /** 반복 메시지 목록을 API 와 동기화한다 — 변경된 항목만 타이머 재생성 (#28: 토큰 캡처 없음) */
  async syncRepeats(): Promise<void> {
    if (this.disposed) return;

    const list = await trpc.chatbot.repeat.query({ userId: this.info.userId });
    const seen = new Set<number>();

    for (const repeat of list) {
      seen.add(repeat.id);
      const existing = this.repeats.get(repeat.id);
      if (
        existing &&
        existing.response === repeat.response &&
        existing.intervalSeconds === repeat.interval
      ) {
        continue;
      }

      if (existing) clearInterval(existing.timer);
      console.log('🔁 ', this.label, repeat.response, chalk.gray(`(${repeat.interval}s)`));

      const send = async () => {
        try {
          const result = await trpc.chatbot.send.mutate({
            userId: this.info.userId,
            message: repeat.response,
          });
          if (!result.ok) console.error('❌ 반복 전송 실패:', this.label, result.message);
        } catch (error) {
          console.error('❌ 반복 전송 오류:', this.label, error);
        }
      };

      void send(); // 등록/변경 직후 1회 즉시 전송 (기존 동작 유지)
      this.repeats.set(repeat.id, {
        response: repeat.response,
        intervalSeconds: repeat.interval,
        timer: setInterval(() => void send(), repeat.interval * 1000),
      });
    }

    for (const [id, tracked] of this.repeats) {
      if (!seen.has(id)) {
        console.log('🔁 🗑️ ', this.label, tracked.response);
        clearInterval(tracked.timer);
        this.repeats.delete(id);
      }
    }
  }

  /** 소켓·타이머 정리 — DB 에서 사라진 채널은 매니저가 호출한다 (#29) */
  dispose(): void {
    this.disposed = true;
    for (const tracked of this.repeats.values()) clearInterval(tracked.timer);
    this.repeats.clear();
    this.realtime?.close();
    this.realtime = null;
    console.log('👋 채널 정리됨:', this.label);
  }
}
