import {CanActivateFn, Router, UrlTree} from '@angular/router';
import {inject} from '@angular/core';
import {SessionService} from './session.service';


function loginRedirect(stateUrl : string) : UrlTree {
  const router = inject(Router);
  return router.createUrlTree(['/auth/login'],{
    queryParams: {returnUrl:stateUrl},
  });
}

export const anonymousOnlyGuard : CanActivateFn = (_route, state)=>{
  const sessionService = inject(SessionService);
  const router = inject(Router);

  if(sessionService.isAuthenticated()){
    return router.createUrlTree(['/chat'],{})
  }
  return true;
};

export const authenticatedGuard : CanActivateFn = (_route , state)=>{
  const sessionService = inject(SessionService);
  const router = inject(Router);

  if (sessionService.isAuthenticated()){
    return true;
  }
  return router.createUrlTree(['/auth/login'],{
    queryParams : {returnUrl : state.url}
  });
}

export const adminGuard : CanActivateFn = (_route, state)=> {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  if (!sessionService.isAuthenticated()){
    return router.createUrlTree(['/auth/login'],{
      queryParams : {returnUrl : state.url}
    });
  }
  if (sessionService.user()?.role === 'admin'){
    return true;
  }

  return router.createUrlTree(['/chat'],)
}


