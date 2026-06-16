import { BehaviorSubject, ReplaySubject, distinctUntilChanged, share } from '@camera.ui/sdk';

import type { Observable } from '@camera.ui/sdk';

export class ReactiveProperty<T> {
  private _subject: BehaviorSubject<T>;

  public observable: Observable<T>;

  constructor(initialValue: T | BehaviorSubject<T>, oversable?: Observable<T>) {
    if (initialValue instanceof BehaviorSubject) {
      this._subject = initialValue;
    } else {
      this._subject = new BehaviorSubject(initialValue);
    }

    this.observable = oversable ?? this.#createStateObservable(this._subject);
  }

  get value(): T {
    const val = this._subject.getValue();

    if (typeof val === 'object') {
      return structuredClone(val);
    }

    return val;
  }

  public next(value: T): void {
    this._subject.next(value);
  }

  public complete(): void {
    this._subject.complete();
  }

  #createStateObservable<T>(stateSubject: BehaviorSubject<T>): Observable<T> {
    return stateSubject.pipe(distinctUntilChanged(), share({ connector: () => new ReplaySubject(1) }));
  }
}
