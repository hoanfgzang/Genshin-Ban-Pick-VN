import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { errorMessage, useAuthStore } from './authStore'
import { loginSchema, type LoginValues } from './schemas'

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useAuthStore((s) => s.login)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', remember: true },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values)
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
        error={errors.username?.message}
        {...register('username')}
      />
      <Input
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
        <input type="checkbox" className="size-4 accent-[var(--color-gold)]" {...register('remember')} />
        Ghi nhớ đăng nhập
      </label>
      <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
        Đăng nhập
      </Button>
    </form>
  )
}
