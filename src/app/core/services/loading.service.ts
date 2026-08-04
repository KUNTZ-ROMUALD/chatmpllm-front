import {Injectable, signal} from '@angular/core';

@Injectable({providedIn : 'root'})
export class LoadingService{
  private readonly activateReqeust = signal(0);
  readonly  isLoading = this.activateReqeust.asReadonly();
  start(): void {
    this.activateReqeust.update((count)=>count +1 );
  }
  stop(): void {
    this.activateReqeust.update((count)=> Math.max(0, count - 1 ));
  }

}
