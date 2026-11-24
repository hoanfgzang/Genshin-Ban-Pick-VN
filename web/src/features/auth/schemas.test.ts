import { describe, expect, it } from 'vitest'
import { createRegisterSchema, loginSchema, registerSchema } from './schemas'

describe('features/auth/schemas', () => {
  it('loginSchema chấp nhận UID + mật khẩu hợp lệ và từ chối rỗng', () => {
    expect(
      loginSchema.safeParse({ uid: '801234567', password: 'secret', remember: true }).success,
    ).toBe(true)
    expect(
      loginSchema.safeParse({ uid: '   ', password: 'secret', remember: false }).success,
    ).toBe(false)
    expect(
      loginSchema.safeParse({ uid: '801234567', password: '', remember: true }).success,
    ).toBe(false)
  })

  it('registerSchema kiểm tra UID 9-10 chữ số, displayName, email tùy chọn/bắt buộc và mật khẩu', () => {
    const valid = {
      uid: '801234567',
      displayName: 'Nhà Lữ Hành',
      email: '',
      password: 'Password123',
      confirmPassword: 'Password123',
    }
    expect(registerSchema.safeParse(valid).success).toBe(true)
    expect(
      registerSchema.safeParse({ ...valid, email: 'traveler@example.com' }).success,
    ).toBe(true)

    // UID sai định dạng
    expect(registerSchema.safeParse({ ...valid, uid: '12345' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, uid: 'abc123456' }).success).toBe(false)

    // Tên hiển thị quá ngắn
    expect(registerSchema.safeParse({ ...valid, displayName: 'A' }).success).toBe(false)

    // Email sai
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)

    // Khi server yêu cầu email
    expect(createRegisterSchema(true).safeParse(valid).success).toBe(false)
    expect(
      createRegisterSchema(true).safeParse({ ...valid, email: 'ok@example.com' }).success,
    ).toBe(true)

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
