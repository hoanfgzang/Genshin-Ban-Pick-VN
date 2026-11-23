import { z } from 'zod'

const username = z
  .string()
  .trim()
  .min(3, 'Tên đăng nhập tối thiểu 3 ký tự.')
  .max(20, 'Tên đăng nhập tối đa 20 ký tự.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Chỉ dùng chữ không dấu, số và dấu gạch dưới.')

const password = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự.').max(72, 'Mật khẩu quá dài.')

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Vui lòng nhập tên đăng nhập.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
  remember: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    username,
    email: z.string().trim().pipe(z.email('Email không hợp lệ.')),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận không khớp.',
  })
export type RegisterValues = z.infer<typeof registerSchema>
