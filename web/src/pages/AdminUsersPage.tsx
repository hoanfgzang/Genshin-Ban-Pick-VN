import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { errorMessage, useAuthStore } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import { adminUserService, type AdminUserItem, type ManagedRole } from '@/services'

const SECRET_STORAGE_KEY = 'gbp_admin_secret_key'

function readSessionSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function AdminUsersPage() {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = Boolean(user?.isSuperAdmin)

  const [storedSecret, setStoredSecret] = useState<string>(() => readSessionSecret())
  const [secretInput, setSecretInput] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<ManagedRole | 'all'>('all')
  const [reloadTick, setReloadTick] = useState(0)

  const [quickUid, setQuickUid] = useState('')
  const [quickRole, setQuickRole] = useState<ManagedRole>('admin')
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  const [confirmTarget, setConfirmTarget] = useState<{
    item: AdminUserItem
    nextRole: ManagedRole
  } | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const activeSecret = isSuperAdmin ? undefined : storedSecret.trim() || undefined
  const hasAccess = isSuperAdmin || Boolean(activeSecret)

  useEffect(() => {
    if (!hasAccess) return
    let mounted = true
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const list = await adminUserService.list(
            { q: query, role: roleFilter },
            activeSecret,
          )
          if (mounted) setUsers(list)
        } catch (err) {
          if (mounted) toast.error(errorMessage(err))
        } finally {
          if (mounted) setLoading(false)
        }
      })()
    }, 150)

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [hasAccess, query, roleFilter, activeSecret, reloadTick])

  const handleUnlockWithSecret = async (e: React.FormEvent) => {
    e.preventDefault()
    const candidate = secretInput.trim()
    if (!candidate) {
      toast.error('Vui lòng nhập mã khóa ADMIN_SECRET_KEY.')
      return
    }
    setUnlocking(true)
    try {
      const list = await adminUserService.list({ q: '', role: 'all' }, candidate)
      try {
        sessionStorage.setItem(SECRET_STORAGE_KEY, candidate)
      } catch {
        // ignore storage errors
      }
      setStoredSecret(candidate)
      setSecretInput('')
      setUsers(list)
      toast.success('Đã xác thực quyền Chủ hệ thống bằng mã khóa.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUnlocking(false)
    }
  }

  const handleLockSecret = () => {
    try {
      sessionStorage.removeItem(SECRET_STORAGE_KEY)
    } catch {
      // ignore storage errors
    }
    setStoredSecret('')
    setUsers([])
    toast.info('Đã đóng phiên mã khóa Chủ hệ thống.')
  }

  const handleQuickAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanUid = quickUid.trim()
    if (!/^\d{9,10}$/.test(cleanUid)) {
      toast.error('UID Genshin phải gồm 9–10 chữ số.')
      return
    }
    setQuickSubmitting(true)
    try {
      const updated = await adminUserService.updateRoleByUid(cleanUid, quickRole, activeSecret)
      toast.success(
        `Đã cập nhật quyền cho ${updated.displayName} (UID ${updated.uid}) → ${
          updated.role === 'admin' ? 'Admin' : 'Player'
        }.`,
      )
      setQuickUid('')
      setReloadTick((t) => t + 1)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setQuickSubmitting(false)
    }
  }

  const handleConfirmChangeRole = async () => {
    if (!confirmTarget) return
    const { item, nextRole } = confirmTarget
    setUpdatingId(item.id)
    try {
      const updated = await adminUserService.updateRole(item.id, nextRole, activeSecret)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      toast.success(
        nextRole === 'admin'
          ? `Đã cấp quyền Admin cho ${updated.displayName} (UID ${updated.uid}).`
          : `Đã gỡ quyền Admin của ${updated.displayName} (UID ${updated.uid}).`,
      )
      setConfirmTarget(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUpdatingId(null)
    }
  }

  if (!hasAccess) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-5 py-6">
        <section className="panel border-gold/30 p-6">
          <h1 className="text-xl font-extrabold text-gold-strong">Quản lý Tài khoản & Phân quyền Admin</h1>
          <p className="mt-2 text-sm text-muted">
            Chức năng phân quyền chỉ dành cho <strong className="text-text">Chủ hệ thống (Admin gốc)</strong>.
            {user && !user.isGuest && user.role === 'admin'
              ? ' Tài khoản Admin thông thường chỉ quản lý Bộ luật và điều hành trận đấu.'
              : ' Hãy đăng nhập bằng tài khoản Chủ hệ thống hoặc nhập mã khóa bí mật từ máy chủ.'}
          </p>

          <form onSubmit={handleUnlockWithSecret} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-text">Mở khóa bằng Mã khóa Chủ hệ thống (ADMIN_SECRET_KEY)</span>
              <input
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Nhập ADMIN_SECRET_KEY cấu hình trên server…"
                className="h-11 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
              />
            </label>
            <Button type="submit" variant="primary" loading={unlocking}>
              Xác thực & Mở bảng phân quyền
            </Button>
          </form>
        </section>
      </div>
    )
  }

  const adminCount = users.filter((u) => u.role === 'admin').length
  const playerCount = users.filter((u) => u.role === 'player').length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gold-strong">Quản lý Tài khoản & Phân quyền Admin</h1>
          <p className="text-sm text-muted">
            Chỉ Chủ hệ thống (hoặc mã khóa <code>ADMIN_SECRET_KEY</code>) mới có quyền phong/gỡ Admin. Người được cấp quyền chỉ cần tải lại trang (F5) để áp dụng.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isSuperAdmin && activeSecret && (
            <Button size="sm" variant="danger" onClick={handleLockSecret}>
              Đóng khóa Secret Key
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setReloadTick((t) => t + 1)}>
            Làm mới
          </Button>
        </div>
      </div>

      {/* Khối cấp/hạ quyền nhanh theo UID */}
      <section className="panel border-gold/30 p-4">
        <h2 className="text-sm font-bold text-text">Phân quyền nhanh theo UID Genshin</h2>
        <form onSubmit={handleQuickAssign} className="mt-3 flex flex-wrap items-center gap-2.5">
          <input
            value={quickUid}
            onChange={(e) => setQuickUid(e.target.value)}
            placeholder="Nhập UID 9–10 chữ số (vd: 801234567)…"
            maxLength={10}
            className="h-10 min-w-56 flex-1 rounded-lg border border-line bg-bg/60 px-3 font-mono text-sm text-text focus:border-gold focus:outline-none"
          />
          <select
            value={quickRole}
            onChange={(e) => setQuickRole(e.target.value as ManagedRole)}
            aria-label="Vai trò áp dụng"
            className="h-10 rounded-lg border border-line bg-panel px-3 text-sm text-text focus:border-gold focus:outline-none"
          >
            <option value="admin">Cấp quyền Admin</option>
            <option value="player">Hạ xuống Player</option>
          </select>
          <Button type="submit" variant="primary" loading={quickSubmitting}>
            Áp dụng
          </Button>
        </form>
      </section>

      {/* Thanh tìm kiếm & lọc */}
      <section className="panel flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo UID, tên hiển thị hoặc email…"
            className="h-10 min-w-60 flex-1 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={roleFilter === 'all'} onClick={() => setRoleFilter('all')}>
              Tất cả ({users.length})
            </Chip>
            <Chip active={roleFilter === 'admin'} onClick={() => setRoleFilter('admin')}>
              Admin ({adminCount})
            </Chip>
            <Chip active={roleFilter === 'player'} onClick={() => setRoleFilter('player')}>
              Player ({playerCount})
            </Chip>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5">Tài khoản</th>
                <th className="px-3 py-2.5">UID</th>
                <th className="px-3 py-2.5 text-center">Kho NV</th>
                <th className="px-3 py-2.5">Ngày tạo</th>
                <th className="px-3 py-2.5">Vai trò</th>
                <th className="px-3 py-2.5 text-right">Phân quyền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted">
                    <div className="inline-flex items-center gap-2">
                      <Spinner className="size-4" />
                      <span>Đang tải danh sách tài khoản…</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted">
                    Không tìm thấy tài khoản nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                users.map((item) => {
                  const isSelf = Boolean(user && !user.isGuest && user.id === item.id)
                  const isProtected = item.isSeedAdmin || isSelf
                  return (
                    <tr key={item.id} className={item.role === 'admin' ? 'bg-gold/5' : undefined}>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-text">{item.displayName}</span>
                          {isSelf && (
                            <span className="rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-bold text-hydro">
                              Bạn
                            </span>
                          )}
                        </div>
                        {item.email && <div className="text-xs text-muted">{item.email}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-gold-strong">
                        {item.uid}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-muted">
                        {item.ownedCount}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold',
                            item.isSeedAdmin
                              ? 'bg-gold/25 text-gold-strong'
                              : item.role === 'admin'
                                ? 'bg-hydro/20 text-hydro'
                                : 'bg-panel-2 text-muted',
                          )}
                        >
                          {item.isSeedAdmin ? 'Chủ hệ thống' : item.role === 'admin' ? 'Admin' : 'Player'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {item.role === 'player' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => setConfirmTarget({ item, nextRole: 'admin' })}
                          >
                            Cấp Admin
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={isProtected}
                            title={
                              item.isSeedAdmin
                                ? 'Không thể hạ quyền tài khoản Chủ hệ thống'
                                : isSelf
                                  ? 'Không thể tự gỡ quyền của chính mình'
                                  : 'Hạ tài khoản này xuống Player'
                            }
                            onClick={() => setConfirmTarget({ item, nextRole: 'player' })}
                          >
                            {item.isSeedAdmin ? 'Được bảo vệ' : 'Gỡ Admin'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={
          confirmTarget?.nextRole === 'admin' ? 'Xác nhận cấp quyền Admin' : 'Xác nhận gỡ quyền Admin'
        }
        description={
          confirmTarget
            ? confirmTarget.nextRole === 'admin'
              ? `Tài khoản "${confirmTarget.item.displayName}" (UID ${confirmTarget.item.uid}) sẽ có quyền tạo/sửa/xóa Bộ luật và điều hành phòng đấu với tư cách Admin.`
              : `Tài khoản "${confirmTarget.item.displayName}" (UID ${confirmTarget.item.uid}) sẽ bị thu hồi quyền Admin và trở về quyền Player thông thường.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmTarget(null)}
              disabled={Boolean(updatingId)}
            >
              Hủy
            </Button>
            <Button
              variant={confirmTarget?.nextRole === 'admin' ? 'primary' : 'danger'}
              loading={Boolean(updatingId)}
              onClick={handleConfirmChangeRole}
            >
              {confirmTarget?.nextRole === 'admin' ? 'Xác nhận cấp Admin' : 'Xác nhận gỡ Admin'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted">
          Lưu ý: Tài khoản được phân quyền chỉ có quyền quản trị giải đấu, không thể tự phong hoặc hạ quyền Admin khác.
        </p>
      </Dialog>
    </div>
  )
}
