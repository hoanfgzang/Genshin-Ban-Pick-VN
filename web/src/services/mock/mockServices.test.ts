import { describe, expect, it } from 'vitest'
import { emptyInventory, setConstellation, setLevel } from '@/domain/inventory'
import { ServiceError } from '../types'
import { mockAuthService } from './authService'
import { mockInventoryService } from './inventoryService'

describe('services/mock', () => {
  it('đăng ký bằng UID, kiểm tra trùng UID/email, đăng nhập đúng/sai mật khẩu', async () => {
    const user = await mockAuthService.register({
      uid: '801234567',
      displayName: 'Alice',
      email: 'Alice@Example.com',
      password: 'Password123',
    })
    expect(user.uid).toBe('801234567')
    expect(user.displayName).toBe('Alice')
    expect(user.email).toBe('alice@example.com')
    expect(user.role).toBe('player')
    expect(user.isGuest).toBe(false)
    expect((await mockAuthService.getCurrentUser())?.id).toBe(user.id)

    await expect(
      mockAuthService.register({
        uid: '801234567',
        displayName: 'Alice Clone',
        email: 'other@example.com',
        password: 'Password123',
      }),
    ).rejects.toMatchObject({ code: 'UID_TAKEN' })

    await expect(
      mockAuthService.register({
        uid: '809999999',
        displayName: 'Bob',
        email: 'alice@example.com',
        password: 'Password123',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })

    await mockAuthService.logout()
    expect(await mockAuthService.getCurrentUser()).toBeNull()

    try {
      await mockAuthService.login({
        uid: '801234567',
        password: 'WrongPassword',
        remember: true,
      })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError)
      expect((err as ServiceError).code).toBe('INVALID_CREDENTIALS')
    }

    const loggedIn = await mockAuthService.login({
      uid: '801234567',
      password: 'Password123',
      remember: false,
    })
    expect(loggedIn.id).toBe(user.id)
    expect(sessionStorage.getItem('gbp:v1:session')).toBe(JSON.stringify(user.id))
    expect(localStorage.getItem('gbp:v1:session')).toBeNull()
  })

  it('hỗ trợ chế độ Khách và đăng xuất', async () => {
    const guest = await mockAuthService.loginAsGuest()
    expect(guest.isGuest).toBe(true)
    expect(guest.role).toBe('guest')
    expect((await mockAuthService.getCurrentUser())?.isGuest).toBe(true)

    await mockAuthService.logout()
    expect(await mockAuthService.getCurrentUser()).toBeNull()
  })

  it('tách biệt kho nhân vật theo từng userId', async () => {
    expect((await mockInventoryService.get('u1')).characters).toEqual({})

    let inv1 = setConstellation(emptyInventory(), 'furina', 2)
    inv1 = setLevel(inv1, 'furina', 95)
    await mockInventoryService.save('u1', inv1)

    const loaded1 = await mockInventoryService.get('u1')
    const loaded2 = await mockInventoryService.get('u2')
    expect(loaded1.characters.furina).toEqual({
      slug: 'furina',
      constellation: 2,
      level: 95,
    })
    expect(loaded2.characters).toEqual({})
  })
})
