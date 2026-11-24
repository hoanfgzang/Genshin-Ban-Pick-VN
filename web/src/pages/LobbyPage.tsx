import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import type { RuleSet } from '@/domain/ruleset'
import { errorMessage, useAuthStore } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import { matchService, rulesetService, type MatchSummary } from '@/services'

export function LobbyPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const [rulesets, setRulesets] = useState<RuleSet[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [myMatches, setMyMatches] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let mounted = true
    const loadData = async () => {
      try {
        const list = await rulesetService.list(true)
        if (!mounted) return
        setRulesets(list)
        const def = list.find((r) => r.isDefault) ?? list[0]
        if (def) setSelectedRuleId(def.id)

        if (user && !user.isGuest) {
          const matches = await matchService.listMyMatches()
          if (mounted) setMyMatches(matches)
        }
      } catch (err) {
        if (mounted) toast.error(errorMessage(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void loadData()
    return () => {
      mounted = false
    }
  }, [user])

  if (loading) return <FullPageSpinner label="Đang tải phòng đấu…" />

  const canCreate = !!user && !user.isGuest

  const handleCreate = async () => {
    if (!selectedRuleId) return
    setCreating(true)
    try {
      const match = await matchService.create(selectedRuleId)
      navigate(`/match/${match.code}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setCreating(false)
    }
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = joinCode.trim().toUpperCase()
    if (!clean) {
      toast.error('Vui lòng nhập mã phòng.')
      return
    }
    navigate(`/match/${clean}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gold-strong">Tạo & Tham gia Trận đấu 1v1</h1>
        <p className="text-sm text-muted">
          Chọn bộ luật thi đấu để tạo phòng mới hoặc nhập mã phòng đối phương gửi cho bạn.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Tạo trận mới */}
        <section className="panel flex flex-col justify-between gap-4 border-gold/30 p-5">
          <div>
            <h2 className="text-lg font-bold text-text">Tạo phòng đấu mới</h2>
            {!canCreate ? (
              <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm">
                <p className="text-text/90">
                  Chỉ tài khoản <strong>Player / Admin</strong> đăng nhập bằng UID mới có thể tạo trận và thi đấu.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link to="/login?redirect=/lobby" className={buttonClass('primary', 'sm')}>
                    Đăng nhập ngay
                  </Link>
                  <Link to="/register?redirect=/lobby" className={buttonClass('secondary', 'sm')}>
                    Đăng ký UID
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <label className="text-sm font-medium text-muted">Chọn bộ luật thi đấu</label>
                <div className="flex flex-col gap-2">
                  {rulesets.map((rs) => (
                    <button
                      key={rs.id}
                      type="button"
                      onClick={() => setSelectedRuleId(rs.id)}
                      className={cn(
                        'cursor-pointer rounded-xl border p-3 text-left transition',
                        rs.id === selectedRuleId
                          ? 'border-gold bg-gold/10'
                          : 'border-line bg-bg/40 hover:border-gold/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-text">{rs.name}</span>
                        {rs.isDefault && (
                          <span className="rounded bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold-strong">
                            Mặc định
                          </span>
                        )}
                      </div>
                      {rs.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted">{rs.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {canCreate && (
            <Button
              variant="primary"
              size="lg"
              loading={creating}
              disabled={!selectedRuleId}
              onClick={handleCreate}
            >
              Tạo phòng đấu ngay
            </Button>
          )}
        </section>

        {/* Nhập mã phòng */}
        <section className="panel flex flex-col justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold text-text">Vào phòng bằng mã mời</h2>
            <p className="mt-1 text-sm text-muted">
              Nhập mã 6 ký tự từ người tạo trận để vào chọn bên Xanh/Đỏ (hoặc theo dõi trận với tư cách Khách).
            </p>
            <form onSubmit={handleJoin} className="mt-4 flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: X7K2P9"
                maxLength={8}
                className="h-11 flex-1 rounded-lg border border-line bg-bg/60 px-3 font-mono text-base uppercase tracking-widest text-text focus:border-gold focus:outline-none"
              />
              <Button type="submit" variant="secondary" size="lg">
                Vào phòng
              </Button>
            </form>
          </div>

          <div className="rounded-lg border border-line/70 bg-bg/40 p-3.5 text-xs text-muted">
            <strong className="text-text">Lưu ý trước khi đấu:</strong> Hãy cập nhật đầy đủ các nhân vật bạn đang sở hữu (kèm Cung mệnh C0–C6 và Level) trong{' '}
            <Link to="/profile" className="text-gold-strong underline">
              Kho nhân vật
            </Link>{' '}
            để hệ thống tự động đồng bộ khi Pick.
          </div>
        </section>
      </div>

      {/* Lịch sử trận đấu của tôi */}
      {canCreate && (
        <section className="panel p-5">
          <h2 className="mb-3 text-base font-bold text-text">Các trận đấu gần đây của bạn</h2>
          {myMatches.length === 0 ? (
            <p className="text-sm text-muted">Bạn chưa tham gia trận đấu nào.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Mã phòng</th>
                    <th className="px-3 py-2">Bộ luật</th>
                    <th className="px-3 py-2">Đội Xanh (Trái)</th>
                    <th className="px-3 py-2">Đội Đỏ (Phải)</th>
                    <th className="px-3 py-2">Trạng thái / Kết quả</th>
                    <th className="px-3 py-2 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {myMatches.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 font-mono font-bold text-gold-strong">{m.code}</td>
                      <td className="px-3 py-2 text-xs">{m.rulesetName}</td>
                      <td className="px-3 py-2 text-xs text-hydro">
                        {m.bluePlayer?.displayName ?? '—'}
                        {m.blueFinalScore !== null ? ` (${m.blueFinalScore}s)` : ''}
                      </td>
                      <td className="px-3 py-2 text-xs text-danger">
                        {m.redPlayer?.displayName ?? '—'}
                        {m.redFinalScore !== null ? ` (${m.redFinalScore}s)` : ''}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {m.status === 'finished'
                          ? m.winnerSide === 'blue'
                            ? 'Xanh Thắng'
                            : m.winnerSide === 'red'
                              ? 'Đỏ Thắng'
                              : 'Hòa'
                          : m.status}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/match/${m.code}`} className={buttonClass('ghost', 'sm')}>
                          Mở phòng
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
