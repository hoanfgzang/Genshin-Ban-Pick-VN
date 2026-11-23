import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from './schemas'

describe('features/auth/schemas', () => {
  it('loginSchema chấp nhận input hợp lệ và từ chối rỗng', () => {
    expect(
      loginSchema.safeParse({ username: 'alice', password: 'secret', remember: true }).success,
    ).toBe(true)
    expect(
      loginSchema.safeParse({ username: '   ', password: 'secret', remember: false }).success,
    ).toBe(false)
    expect(
      loginSchema.safeParse({ username: 'alice', password: '', remember: true }).success,
    ).toBe(false)
  })

  it('registerSchema kiểm tra username, email, password và confirmPassword', () => {
    const valid = {
      username: 'Traveler_01',
      email: 'traveler@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    }
    expect(registerSchema.safeParse(valid).success).toBe(true)

    // Username quá ngắn / quá dài / ký tự đặc biệt
    expect(registerSchema.safeParse({ ...valid, username: 'ab' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, username: 'a'.repeat(21) }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, username: 'nhà lữ hành' }).success).toBe(false)

    // Email sai
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)

    // Mật khẩu < 8 ký tự
    expect(
      registerSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false)

    // Xác nhận mật khẩu không khớp
    expect(
      registerSchema.safeParse({ ...valid, confirmPassword: 'DifferentPassword' }).success,
    ).toBe(false)
  })
})
