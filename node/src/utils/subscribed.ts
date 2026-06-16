import type { Disposable } from '@camera.ui/sdk';
import type { Subscribed as SubscribedInterface } from '@camera.ui/sdk/internal';

export class Subscribed {
  private readonly subscriptions: Disposable[] = [];
  private readonly additionalSubscriptions: Disposable[] = [];

  protected addSubscriptions(...subscriptions: Disposable[]): void {
    this.subscriptions.push(...subscriptions);
  }

  protected addAdditionalSubscriptions(...subscriptions: Disposable[]): void {
    this.additionalSubscriptions.push(...subscriptions);
  }

  protected unsubscribe(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  protected unsubscribeAdditional(): void {
    this.additionalSubscriptions.forEach((subscription) => subscription.dispose());
  }
}

export class SubscribedPublic implements SubscribedInterface {
  private readonly subscriptions: Disposable[] = [];
  private readonly additionalSubscriptions: Disposable[] = [];

  public addSubscriptions(...subscriptions: Disposable[]): void {
    this.subscriptions.push(...subscriptions);
  }

  public addAdditionalSubscriptions(...subscriptions: Disposable[]): void {
    this.additionalSubscriptions.push(...subscriptions);
  }

  public unsubscribe(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public unsubscribeAdditional(): void {
    this.additionalSubscriptions.forEach((subscription) => subscription.dispose());
  }
}
