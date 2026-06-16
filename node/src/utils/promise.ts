export class Deferred<T> {
  private resolvers: PromiseWithResolvers<T>;

  get promise(): Promise<T> {
    return this.resolvers.promise;
  }

  constructor() {
    this.resolvers = Promise.withResolvers<T>();
  }

  public resolve(value: T) {
    this.resolvers.resolve(value);
  }

  public reject(reason?: any) {
    this.resolvers.reject(reason);
  }

  public cancel(reason = 'Cancelled') {
    this.reject(new Error(reason));
  }
}
