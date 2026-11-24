import { z } from 'zod'

const uid = z
  .string()
  .trim()
  .regex(/^\d{9,10}$/, 'UID Genshin phải gồm 9–10 chữ số.')

const displayName = z
  .string()
  .trim()
  .min(2, 'Tên hiển thị tối thiểu 2 ký tự.')
  .max(30, 'Tên hiển thị tối đa 30 ký tự.')

const password = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự.').max(72, 'Mật khẩu quá dài.')

const emailField = z.email('Email không hợp lệ.')

export const loginSchema = z.object({
  uid: z.string().trim().min(1, 'Vui lòng nhập UID.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
  remember: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export function createRegisterSchema(requireEmail = false) {
  return z
    .object({
      uid,
      displayName,
      email: z
        .string()
        .trim()
        .refine((v) => !requireEmail || v.length > 0, 'Vui lòng nhập email.')
        .refine((v) => !v || emailField.safeParse(v).success, 'Email không hợp lệ.'),
      password,
      confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
      path: ['confirmPassword'],
      message: 'Mật khẩu xác nhận không khớp.',
    })
}

export const registerSchema = createRegisterSchema(false)
export type RegisterValues = z.infer<typeof registerSchema>
