import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { errorMessage, useAuthStore } from './authStore'
import { registerSchema, type RegisterValues } from './schemas'

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const registerUser = useAuthStore((s) => s.register)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = handleSubmit(async ({ username, email, password }) => {
    setFormError(null)
    try {
      await registerUser({ username, email, password })
      onSuccess()
    } catch (err) {
      setFormError(errorMessage(err))
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError && (
        <div role="alert" className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </div>
      )}
      <Input
        label="Tên đăng nhập"
        autoComplete="username"
        autoFocus
        hint="3–20 ký tự: chữ không dấu, số, dấu gạch dưới."
        error={errors.username?.message}
        {...register('username')}
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Mật khẩu"
        type="password"
        autoComplete="new-password"
        hint="Tối thiểu 8 ký tự."
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label="Xác nhận mật khẩu"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
        Tạo tài khoản
      </Button>
    </form>
  )
}
