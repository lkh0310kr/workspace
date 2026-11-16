import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedOAuthLogin } from './oauthLogin.ts'

test('matches OAuth state login case-insensitively like Home authentication', () => {
  assert.equal(isAllowedOAuthLogin('LKH0310KR', 'lkh0310kr'), true)
  assert.equal(isAllowedOAuthLogin('lkh0310kr', 'LKH0310KR'), true)
})

test('rejects OAuth state logins for a different account', () => {
  assert.equal(isAllowedOAuthLogin('other-user', 'lkh0310kr'), false)
})
