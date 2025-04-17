declare module 'socket.io-client' {
  interface Socket {
    on(event: 'SYSTEM', callback: (data: string) => void): this;
    on(event: 'CHAT', callback: (data: string) => void): this;
    on(event: 'DONATION', callback: (data: string) => void): this;
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
