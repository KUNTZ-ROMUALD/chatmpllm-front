import {HttpInterceptorFn} from '@angular/common/http';

function readCookie(name: string ): string | null {
  const match =document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export const csrfInterceptor : HttpInterceptorFn = (req, next )=> {
  const isMutation =["POST",'PUT','PATCH','DELETE'].includes(req.method);
  if (!isMutation){
    return next(req);
  }
  const csrfToken = readCookie('csrf_token');
  const cloneRequest =csrfToken
    ?req.clone({setHeaders:{'X-CSRFToken': csrfToken}})
    : req;
  return next(req);
}
