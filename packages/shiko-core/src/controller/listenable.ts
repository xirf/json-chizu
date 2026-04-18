export type Listener = () => void;

export class ListenableStore {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
