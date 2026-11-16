export function isAllowedOAuthLogin(login: string, allowedLogin: string): boolean {
  return login.toLowerCase() === allowedLogin.toLowerCase()
}
