declare module '*@vite/client' {
  export function createHotContext(ownerPath: string): {
    on(event: string, callback: (data: unknown) => void): void;
    send(event: string, data: unknown): void;
  };
}
