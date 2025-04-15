declare module 'socket.io-client' {
  import type {
    ChzzkSessionsMessageChat,
    ChzzkSessionsMessageDonation,
    ChzzkSessionsMessageSystem,
  } from '@wizbot/shared/src/chzzk/index.d';

  interface Socket {
    on(event: 'SYSTEM', callback: (data: ChzzkSessionsMessageSystem) => void): this;
    on(event: 'CHAT', callback: (data: ChzzkSessionsMessageChat) => void): this;
    on(event: 'DONATION', callback: (data: ChzzkSessionsMessageDonation) => void): this;
    on(event: string, callback: (...args: any[]) => void): this;

    emit(event: string, ...args: any[]): this;

    connect(): this;
    disconnect(): this;
  }

  interface SocketIOClientStatic {
    (uri: string, opts?: any): Socket;
    connect(uri: string, opts?: any): Socket;
  }

  const io: SocketIOClientStatic;
  export = io;
}
