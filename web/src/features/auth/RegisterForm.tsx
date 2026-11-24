import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { authService } from '@/services'
import { errorMessage, useAuthStore } from './authStore'
import { createRegisterSchema, type RegisterValues } from './schemas'

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const registerUser = useAuthStore((s) => s.register)
  const [formError, setFormError] = useState<string | null>(null)
  const [requireEmail, setRequireEmail] = useState(false)

  useEffect(() => {
    let mounted = true
    void authService.getConfig().then((cfg) => {
      if (mounted) setRequireEmail(cfg.requireEmail)
    })
    return () => {
      mounted = false
    }
  }, [])

  const schema = useMemo(() => createRegisterSchema(requireEmail), [requireEmail])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: { uid: '', displayName: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = handleSubmit(async ({ uid, displayName, email, password }) => {
    setFormError(null)
    try {
      await registerUser({ uid, displayName, email: email || undefined, password })
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
        label="UID Genshin"
        inputMode="numeric"
        placeholder="9–10 chữ số (vd: 801234567)"
        autoComplete="username"
        autoFocus
        hint="Dùng làm mã định danh đăng nhập và hiển thị khi vào trận."
        error={errors.uid?.message}
        {...register('uid')}
      />
      <Input
        label="Tên hiển thị"
        placeholder="Tên bạn muốn hiện trong phòng đấu"
        autoComplete="nickname"
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <Input
        label={requireEmail ? 'Email' : 'Email (không bắt buộc)'}
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
